// Camera rig with a few classic racing views.
import * as THREE from 'three/webgpu';

const MODES = ['chase', 'far', 'cockpit', 'tv'];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.initialised = false;
    this.baseFov = camera.fov;
  }

  get mode() {
    return MODES[this.modeIndex];
  }

  next() {
    this.modeIndex = (this.modeIndex + 1) % MODES.length;
    this.initialised = false;
  }

  update(car, dt) {
    const cam = this.camera;
    const { x, z } = car.position;
    const yaw = car.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const speed = Math.abs(car.speed);

    let targetPos, targetLook, stiffness;
    switch (this.mode) {
      case 'chase':
      case 'far': {
        const far = this.mode === 'far';
        const back = (far ? 10 : 6.2) + speed * 0.012;
        const up = far ? 3.6 : 2.0;
        // Smooth the camera's *angle* around the car (not its position) so it
        // never falls behind at speed; swing slightly toward the slide direction.
        const vl = Math.hypot(car.vel.x, car.vel.z);
        const velYaw = vl > 3 ? Math.atan2(car.vel.x, car.vel.z) : yaw;
        const wantYaw = yaw + angleDiff(velYaw, yaw) * 0.35;
        if (this.camYaw === undefined || !this.initialised) this.camYaw = wantYaw;
        this.camYaw += angleDiff(wantYaw, this.camYaw) * (1 - Math.exp(-(far ? 4 : 6) * dt));
        const dx = Math.sin(this.camYaw), dz = Math.cos(this.camYaw);
        targetPos = new THREE.Vector3(x - dx * back, up, z - dz * back);
        targetLook = new THREE.Vector3(x + fx * 4, 0.9, z + fz * 4);
        stiffness = 1000; // already smoothed via camYaw
        break;
      }
      case 'cockpit': {
        // T-cam: mounted on top of the airbox, looking over the halo
        targetPos = new THREE.Vector3(x - fx * 0.3, 1.22, z - fz * 0.3);
        targetLook = new THREE.Vector3(x + fx * 20, 0.6, z + fz * 20);
        stiffness = 1000; // rigidly mounted
        break;
      }
      case 'tv': {
        // fixed trackside cameras: pick the nearest of 8 around the outside
        const a = Math.atan2(z, x);
        const slot = Math.round(a / (Math.PI / 4)) * (Math.PI / 4) + Math.PI / 12;
        targetPos = new THREE.Vector3(Math.cos(slot) * 232, 9, Math.sin(slot) * 232);
        targetLook = new THREE.Vector3(x, 0.5, z);
        stiffness = 1000;
        break;
      }
    }

    if (!this.initialised) {
      this.pos.copy(targetPos);
      this.look.copy(targetLook);
      this.initialised = true;
    }
    const k = 1 - Math.exp(-stiffness * dt);
    this.pos.lerp(targetPos, k);
    this.look.lerp(targetLook, Math.min(1, k * 1.6));
    cam.position.copy(this.pos);
    cam.lookAt(this.look);

    // speed sensation: widen FOV a little at speed (not in TV view)
    const fovTarget = this.mode === 'tv' ? 35 : this.baseFov + Math.min(speed / 90, 1) * 14;
    cam.fov += (fovTarget - cam.fov) * (1 - Math.exp(-4 * dt));
    // shake on wall impacts / kerbs
    if (car.wallHit > 0.05 || car.surface === 'kerb') {
      const amt = car.wallHit * 0.15 + (car.surface === 'kerb' ? 0.015 * Math.min(speed / 30, 1) : 0);
      cam.position.x += (Math.random() - 0.5) * amt;
      cam.position.y += (Math.random() - 0.5) * amt;
    }
    cam.updateProjectionMatrix();
  }
}

function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
