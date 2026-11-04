// Car studio (studio.html): one team's car on a turntable-style grid of fixed views, for
// comparing the model against photos of the real car. Dev tool, not part of the game.
//
//   studio.html?team=<id>[&view=grid|side|front|rear|top|three|threeRear][&w=1600&h=1000]
//
// Sets window.__studio = { ready, renderer, adapter } once the frame is drawn
// (scripts/car-shot.mjs waits for it to take screenshots).
import * as THREE from 'three/webgpu';
import { Car, MIRROR_LAYER } from './car.js';
import { TEAMS, teamById } from './teams.js';
import { skyNode } from './materials.js';

const SUN_DIR = [0.45, 0.8, 0.35];
// camera position (car frame: +Z forward, +X left) and target, per view
const VIEWS = {
  three: { pos: [4.6, 1.9, 5.6], at: [0, 0.45, 0.1], fov: 32, label: 'front 3/4 (left)' },
  side: { pos: [9.5, 0.75, 0], at: [0, 0.5, 0.05], fov: 34, ortho: true, label: 'side (left)' },
  threeRear: { pos: [-5.0, 2.1, -5.8], at: [0, 0.5, -0.3], fov: 32, label: 'rear 3/4 (right)' },
  front: { pos: [0, 0.7, 9], at: [0, 0.5, 0], fov: 22, ortho: true, label: 'front' },
  top: { pos: [0, 9, 0.001], at: [0, 0, 0.05], fov: 34, ortho: true, label: 'top' },
  rear: { pos: [0, 0.8, -9], at: [0, 0.5, 0], fov: 22, ortho: true, label: 'rear' },
};
const GRID = ['three', 'side', 'threeRear', 'front', 'top', 'rear'];

const q = new URLSearchParams(location.search);
const team = teamById(q.get('team') ?? TEAMS[0].id);
const view = q.get('view') ?? 'grid';
const W = +(q.get('w') ?? innerWidth), H = +(q.get('h') ?? innerHeight);

async function main() {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.setScissorTest(true);
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  let adapter = 'unknown';
  const be = renderer.backend;
  if (be.isWebGPUBackend) {
    const info = (await navigator.gpu?.requestAdapter())?.info ?? {};
    adapter = `WebGPU ${info.vendor ?? ''} ${info.architecture ?? ''} ${info.device ?? ''} ${info.description ?? ''}`.trim();
  } else {
    const gl = be.gl;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    adapter = `WebGL2 ${ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER)}`;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8a9099);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.backgroundNode = skyNode(SUN_DIR, { sunDisc: false });
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 100, { size: 256 }).texture;
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(...SUN_DIR.map((v) => v * 20));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 50 });
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardNodeMaterial({ color: 0x5c6066, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const car = new Car(team);
  scene.add(car.group);
  car.update({ position: { x: 0, z: 0 }, height: 0, yaw: 0, steerAngle: 0, speed: 0, pitch: 0, roll: 0, heave: 0 }, 0);

  const names = view === 'grid' ? GRID : [view];
  const cols = names.length > 1 ? 3 : 1, rows = Math.ceil(names.length / cols);
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
  const draw = () => {
    names.forEach((n, i) => {
      const v = VIEWS[n];
      const row = Math.floor(i / cols);
      const x = (i % cols) * cw;
      // viewport origin: top-left on WebGPU, bottom-left on WebGL
      const y = be.isWebGPUBackend ? row * ch : H - (row + 1) * ch;
      const top = row * ch;
      const aspect = cw / ch;
      let cam;
      if (v.ortho) {
        const half = n === 'side' || n === 'top' ? 3.2 : 1.35;
        const hh = n === 'side' || n === 'top' ? half / aspect : half;
        cam = new THREE.OrthographicCamera(-hh * aspect, hh * aspect, hh, -hh, 0.1, 50);
        if (n === 'top') cam.up.set(-1, 0, 0); // nose to the right of the frame like the side view
      } else {
        cam = new THREE.PerspectiveCamera(v.fov, aspect, 0.1, 100);
      }
      cam.layers.enable(MIRROR_LAYER);
      cam.position.set(...v.pos);
      cam.lookAt(...v.at);
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      renderer.render(scene, cam);
      if (names.length > 1) {
        const el = document.createElement('div');
        el.className = 'lbl';
        el.style.left = `${x + 8}px`;
        el.style.top = `${top + 24}px`;
        el.textContent = v.label;
        document.body.appendChild(el);
      }
    });
  };
  draw();
  await new Promise((r) => requestAnimationFrame(r));
  document.querySelectorAll('.lbl').forEach((e) => e.remove());
  draw();
  document.getElementById('info').textContent = `${team.name} ${team.car} — ${adapter}`;
  window.__studio = { ready: true, adapter, team: team.id };
}

main().catch((e) => {
  document.getElementById('info').textContent = 'ERROR ' + (e.stack ?? e);
  window.__studio = { ready: true, error: String(e.stack ?? e) };
});
