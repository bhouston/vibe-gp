// Free camera: V in a race or a solo run detaches the camera to fly anywhere, like
// creative-mode flight in Minecraft: WASD move across the ground in the direction you
// face (looking up or down doesn't make it climb or dive), Space / E up, Shift / Q down,
// double-tap W to sprint, arrows or a mouse drag to look around, the mouse wheel for a
// slower or faster flying speed. While it's on the driving keys fly the camera, so the
// player's car drives itself (main.js puts it on the AI). V or C goes back to the camera
// views.
import * as THREE from 'three/webgpu';

const SPEED = 22; // m/s
const SPRINT = 4; // double-tap W multiplier
const DOUBLE_TAP = 0.3; // s between the two W presses
const TURN = 1.5; // rad/s with the arrow keys
const DRAG = 0.0035; // rad per pixel of mouse drag
const FOV = 60;
const UP = new THREE.Vector3(0, 1, 0);

export class FreeCam {
  constructor(camera, dom) {
    this.camera = camera;
    this.active = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.drag = null;
    this.speed = 1; // mouse wheel: x0.25 .. x8
    this.sprint = false;
    this.lastW = -1;
    dom.addEventListener('pointerdown', (e) => {
      if (!this.active || e.pointerType !== 'mouse' || e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.yaw -= (e.clientX - this.drag.x) * DRAG;
      this.pitch -= (e.clientY - this.drag.y) * DRAG;
      this.drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => (this.drag = null);
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.speed = Math.max(0.25, Math.min(8, this.speed * (e.deltaY < 0 ? 1.25 : 0.8)));
    }, { passive: false });
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space') e.preventDefault(); // no page scroll / button press
      // double-tap W: sprint until W is let go
      if (e.code === 'KeyW' && !e.repeat) {
        const now = performance.now() / 1000;
        if (now - this.lastW < DOUBLE_TAP) this.sprint = true;
        this.lastW = now;
      }
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'KeyW') this.sprint = false;
    });
  }

  /** Start flying from wherever the camera is now, looking the same way. */
  start() {
    const cam = this.camera;
    this.active = true;
    this.pos.copy(cam.position);
    this.vel.set(0, 0, 0);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    this.yaw = Math.atan2(dir.x, dir.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    this.sprint = false;
  }

  stop() {
    this.active = false;
    this.drag = null;
    this.sprint = false;
  }

  /** Once a frame while active (input: the keyboard Input). */
  update(input, dt) {
    const d = (code) => (input.down.has(code) ? 1 : 0);
    this.yaw += (d('ArrowLeft') - d('ArrowRight')) * TURN * dt;
    this.pitch += (d('ArrowUp') - d('ArrowDown')) * TURN * dt;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    // moving: flat along the ground in the direction faced (pitch plays no part), and
    // straight up or down on their own keys
    const ahead = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const left = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = Math.max(d('Space'), d('KeyE')) - Math.max(d('ShiftLeft'), d('ShiftRight'), d('KeyQ'));
    const want = new THREE.Vector3()
      .addScaledVector(ahead, d('KeyW') - d('KeyS'))
      .addScaledVector(left, d('KeyA') - d('KeyD'));
    if (want.lengthSq() > 1) want.normalize();
    const speed = SPEED * this.speed;
    want.multiplyScalar(speed * (this.sprint && d('KeyW') ? SPRINT : 1)).addScaledVector(UP, up * speed);
    // ease in and out, so it glides rather than snapping
    this.vel.lerp(want, 1 - Math.exp(-8 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const look = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.lookAt(this.pos.x + look.x, this.pos.y + look.y, this.pos.z + look.z);
    cam.fov += (FOV + (this.sprint ? 8 : 0) - cam.fov) * (1 - Math.exp(-6 * dt));
    cam.updateProjectionMatrix();
  }
}
