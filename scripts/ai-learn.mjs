// Learn each circuit's AI speed profile and write src/tracks/aipace.js.
//
//   node scripts/ai-learn.mjs [trackId ...]     (default: every track)
//
// A lone AI car runs a race-like stint (standing start on fresh tyres, then a flying lap) at
// LEARN_PACE, a little over the fastest race pace, so a race always has some margin.
// First the braking factor is found (the most it can use
// and still lap cleanly), then the corner speed of every AI_SEG-metre segment is scaled:
// up where the car got there at its target speed without sliding, down (with the segments
// leading into it) where it left the track, touched a wall or ran wide. The quickest clean
// lap's profile is kept, with a small safety margin.
import { writeFileSync, readFileSync } from 'node:fs';
// browser-only globals some modules touch at import time
globalThis.location ??= { search: '' };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
globalThis.Path2D ??= class { constructor() {} };
const { TRACKS } = await import('../src/tracks/index.js');
const { TrackPath } = await import('../src/trackPath.js');
const { CarPhysics } = await import('../src/physics.js');
const { racingLine, AIDriver, Entry } = await import('../src/ai.js');
const { formatTime } = await import('../src/race.js');
const { AI_PACE } = await import('../src/tracks/aipace.js');

const OFF = new Set(['grass', 'gravel', 'runoff']);
const LEARN_PACE = 1.02; // the quickest AI (Expert) races at <= 0.98 of the learned profile
const dt = 1 / 120;

/**
 * Standing start from pole and two laps (cold tyres, then a flying lap); per-segment
 * trouble / headroom over both, and the second lap's time (null if anything wasn't clean).
 */
function lap(P, line, scale, brake) {
  line.profile(scale, brake);
  const L = P.length, K = line.segments;
  const car = new CarPhysics(P, P.gridPose(0));
  car.damageOn = false;
  const e = new Entry({ physics: car, gridS: -11 });
  e.driver = new AIDriver(e, line, { pace: LEARN_PACE, reaction: 0 });
  e.driver.rand = () => 0.5; // no pace wobble
  const trouble = new Uint8Array(K), headroom = new Uint8Array(K).fill(1), reached = new Uint8Array(K);
  let t = 0, tStart = null, wall = false;
  while (t < 800) {
    const ctl = e.driver.drive([e], 10, dt);
    car.step(ctl, dt);
    e.track(L, t);
    t += dt;
    if (e.progress >= L && tStart === null) tStart = t; // the flying lap
    if (e.progress >= 2 * L) break;
    if (e.progress < 0) continue;
    const k = line.segOf(car.trackIndex);
    const vt = line.vAt(car.trackS) * LEARN_PACE;
    const v = car.speed;
    const slide = Math.max(...car.wheels.map((w) => w.slide));
    // ran wide: off the edge of the asphalt (kerbs are fine) or close to a wall
    const i = car.trackIndex;
    const wide = car.lateral > Math.min(P.hw + 0.8, P.wallL[i] - 1.4) || car.lateral < -Math.min(P.hw + 0.8, P.wallR[i] - 1.4);
    if (OFF.has(car.surface) || car.wallHit > 0.05 || wide || e.driver.stuck > 1) trouble[k] = 1;
    if (car.wallHit > 0.05) wall = true;
    if (slide > 1.6) headroom[k] = 0; // a real slide (the steering assist runs the fronts a little past peak anyway)
    if (v > vt * 0.985) reached[k] = 1;
  }
  const done = e.progress >= 2 * L;
  const clean = done && !trouble.some((x) => x);
  return { trouble, headroom, reached, time: clean ? t - tStart : null, done, wall };
}

function learn(def) {
  const P = new TrackPath(def);
  const line = racingLine(P, { learned: null });
  const K = line.segments;
  const ones = new Float64Array(K).fill(1);
  // 1. braking: bisect the most it can use and stay clean, with the corners eased off a
  // little so that any trouble is down to the braking
  const easy = new Float64Array(K).fill(0.92);
  let lo = 0.5, hi = 1.7; // above this the targets assume braking the car can't do, and it overshoots in traffic
  for (let it = 0; it < 8; it++) {
    const mid = (lo + hi) / 2;
    if (lap(P, line, easy, mid).time !== null) lo = mid; else hi = mid;
  }
  const brake = +(lo * 0.97).toFixed(3);
  // 2. corner speed per segment: from a clean start, each segment climbs until it causes
  // trouble; it then drops back and never again goes past just under where that happened
  const scale = new Float64Array(K).fill(0.94);
  const ceiling = new Float64Array(K).fill(1.8);
  const cut = (k, f) => {
    k = (k + K) % K;
    ceiling[k] = Math.min(ceiling[k], scale[k] * 0.985);
    scale[k] = Math.max(0.7, scale[k] * f);
  };
  let best = { time: lap(P, line, scale, brake).time, scale: Float64Array.from(scale) };
  const base = lap(P, line, ones, brake).time;
  for (let it = 0; it < 60; it++) {
    const r = lap(P, line, scale, brake);
    if (r.time !== null && (best.time === null || r.time < best.time)) best = { time: r.time, scale: Float64Array.from(scale) };
    const was = Float64Array.from(scale);
    for (let k = 0; k < K; k++) {
      if (r.trouble[k]) {
        cut(k, 0.95);
        cut(k - 1, 0.97); // the way in
        cut(k - 2, 0.985);
      }
    }
    for (let k = 0; k < K; k++) {
      if (!r.trouble[k] && scale[k] === was[k] && r.reached[k] && r.headroom[k]) scale[k] = Math.min(ceiling[k], scale[k] * 1.03);
    }
  }
  if (best.time === null) return { id: def.id, brake, seg: null, base, time: null };
  // a little margin, then check it still laps cleanly (shrinking the margin's base if not)
  let seg = Array.from(best.scale, (x) => +(x * 0.985).toFixed(3));
  let check = lap(P, line, seg, brake);
  for (let n = 0; check.time === null && n < 6; n++) {
    seg = seg.map((x, k) => +(check.trouble[k] || check.trouble[(k + 1) % K] ? x * 0.95 : x).toFixed(3));
    check = lap(P, line, seg, brake);
  }
  return { id: def.id, brake, seg: check.time !== null ? seg : null, base, time: check.time };
}

const ids = process.argv.slice(2);
const defs = ids.length ? TRACKS.filter((t) => ids.includes(t.id)) : TRACKS;
const out = { ...AI_PACE };
for (const def of defs) {
  const t0 = performance.now();
  const r = learn(def);
  if (r.seg) out[def.id] = { brake: r.brake, seg: r.seg };
  console.log(`${def.id.padEnd(12)} brake ${r.brake}  plain ${r.base ? formatTime(r.base) : 'not clean'} -> learned ${r.time ? formatTime(r.time) : 'FAILED (kept old)'}  (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
}
const body = Object.keys(out).sort().map((id) => `  ${id}: { brake: ${out[id].brake}, seg: [${out[id].seg.join(', ')}] },`).join('\n');
const header = readFileSync(new URL('../src/tracks/aipace.js', import.meta.url), 'utf8').split('export const AI_PACE')[0];
writeFileSync(new URL('../src/tracks/aipace.js', import.meta.url), `${header}export const AI_PACE = {\n${body}\n};\n`);
