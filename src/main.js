import * as THREE from 'three/webgpu';
import { buildTrack, startPose } from './track.js';
import { Car } from './car.js';
import { CarPhysics } from './physics.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { LapTimer } from './race.js';
import { Hud } from './hud.js';
import { skyNode } from './materials.js';

const SUN_DIR = [0.45, 0.8, 0.35];

async function start() {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('app').appendChild(renderer.domElement);
  await renderer.init();

  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)';
  document.getElementById('backend').textContent = backend;

  const scene = new THREE.Scene();
  scene.backgroundNode = skyNode(SUN_DIR);
  scene.fog = new THREE.Fog(0xc4d8e6, 250, 1200);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 3000);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  scene.add(buildTrack());

  const car = new Car();
  scene.add(car.group);
  const physics = new CarPhysics(startPose());
  const input = new Input();
  const rig = new CameraRig(camera);
  const timer = new LapTimer();
  const hud = new Hud();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const FIXED = 1 / 120;
  let acc = 0;
  let last = performance.now();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (input.hit('KeyC')) rig.next();
    if (input.hit('KeyR')) {
      physics.reset(startPose());
      timer.reset();
      rig.initialised = false;
    }

    acc += dt;
    const controls = input.state;
    while (acc >= FIXED) {
      physics.step(controls, FIXED);
      timer.update(physics.position, FIXED);
      acc -= FIXED;
    }
    input.endFrame();

    car.update(physics, dt);
    rig.update(physics, dt);

    // keep the shadow frustum centred on the car
    const p = physics.position;
    sun.position.set(p.x + SUN_DIR[0] * 100, SUN_DIR[1] * 100, p.z + SUN_DIR[2] * 100);
    sun.target.position.set(p.x, 0, p.z);

    hud.update(physics, timer, rig.mode);
    if (import.meta.env.DEV) window.__game = { physics, timer };
    renderer.render(scene, camera);
  });
}

start().catch((err) => {
  console.error(err);
  document.getElementById('error').textContent = `Failed to start: ${err.message}`;
});
