// Screenshot team cars in the car studio (studio.html) with the real GPU.
//
//   node scripts/car-shot.mjs <teamId|all> [outDir] [--view=grid|side|front|rear|top|three|threeRear] [--w=1800 --h=1000]
//
// Starts a Vite dev server, drives Chrome over the DevTools protocol (headless, hardware
// WebGPU) and writes <outDir>/<teamId>-<view>.png (default outDir: ./car-shots). Prints
// the GPU adapter and refuses results rendered by SwiftShader (a CPU fallback).
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [which = 'all', outDir = 'car-shots'] = args.filter((a) => !a.startsWith('--'));
const view = opt.view ?? 'grid';
const W = +(opt.w ?? 1800), H = +(opt.h ?? 1000);

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found (set CHROME=path)');

const { TEAMS } = await import('../src/teams.js').catch(() => ({ TEAMS: null }));
const ids = which === 'all' ? (TEAMS ?? []).map((t) => t.id) : which.split(',');

const root = resolve(import.meta.dirname, '..');
const server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'car-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

let ws, nextId = 1;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let code = 0;
try {
  let ver;
  for (let i = 0; i < 60 && !ver; i++) {
    await sleep(250);
    ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
  }
  if (!ver) throw new Error('Chrome did not start');
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.rej(new Error(m.error.message));
    else p.res(m.result);
  };
  mkdirSync(outDir, { recursive: true });
  for (const id of ids) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Page.navigate', { url: `${base}/studio.html?team=${id}&view=${view}&w=${W}&h=${H}` }, sessionId);
    let st = null;
    for (let i = 0; i < 240 && !st?.ready; i++) {
      await sleep(250);
      const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__studio ?? null)', returnByValue: true }, sessionId).catch(() => null);
      st = r?.result?.value ? JSON.parse(r.result.value) : null;
    }
    if (!st?.ready) throw new Error(`${id}: studio did not finish rendering`);
    if (st.error) throw new Error(`${id}: ${st.error}`);
    console.log(`${id}: ${st.adapter}`);
    if (/swiftshader|llvmpipe|software|basic render/i.test(st.adapter)) {
      throw new Error(`software renderer (${st.adapter}): screenshots would not be representative`);
    }
    await sleep(300);
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    const file = join(outDir, `${id}-${view}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`  -> ${file}`);
    await send('Target.closeTarget', { targetId });
  }
} catch (e) {
  console.error(String(e.message ?? e));
  code = 1;
} finally {
  ws?.close();
  chrome.kill();
  await server.close();
}
process.exit(code);
