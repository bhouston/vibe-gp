// Camera rig with a few classic racing views.
import * as THREE from 'three/webgpu';

const MODES = ['chase', 'far', 'cockpit', 'driver', 'tv'];
// eye-level view is wider so the side mirrors stay in shot
const DRIVER_FOV = 74;

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

  /** @param car physics state; @param visual the Car whose body the driver view rides on */
  update(car, dt, visual) {
    const cam = this.camera;
    const { x, z } = car.position;
    const y = car.height ?? 0; // road height under the car
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
        // heights follow the road: never below the road behind the car (cresting a hill
        // downwards), and the look point rides the slope ahead
        const T = this.track;
        const hBack = T ? T.heightAt(car.trackS - back, car.lateral) : y;
        const hAhead = T ? T.heightAt(car.trackS + 4, car.lateral) : y;
        targetPos = new THREE.Vector3(x - dx * back, Math.max(y, hBack) + up, z - dz * back);
        targetLook = new THREE.Vector3(x + fx * 4, hAhead + 0.9, z + fz * 4);
        stiffness = 1000; // already smoothed via camYaw
        break;
      }
      case 'cockpit': {
        // T-cam: mounted on top of the airbox, looking over the halo
        const chassis = visual.group; // follows the road's slope, not the body's pitch/roll
        chassis.updateWorldMatrix(true, false);
        targetPos = chassis.localToWorld(new THREE.Vector3(0, 1.22, -0.3));
        targetLook = chassis.localToWorld(new THREE.Vector3(0, 0.6, 20));
        stiffness = 1000; // rigidly mounted
        break;
      }
      case 'driver': {
        // helmet cam: just ahead of the visor, pitching/rolling with the chassis,
        // with the halo above and both mirrors at the edges of the view
        const body = visual.body;
        body.updateWorldMatrix(true, false);
        targetPos = body.localToWorld(new THREE.Vector3(0, 0.78, 0.15));
        targetLook = body.localToWorld(new THREE.Vector3(0, 0.74, 20));
        stiffness = 1000;
        break;
      }
      case 'tv': {
        // fixed trackside cameras: use whichever spot is closest to the car
        let best = null, bestD = Infinity;
        for (const c of this.tvCams || []) {
          const d = (c.x - x) ** 2 + (c.z - z) ** 2;
          if (d < bestD) { bestD = d; best = c; }
        }
        if (best !== this.tvCam) { this.tvCam = best; this.initialised = false; }
        targetPos = best ? new THREE.Vector3(best.x, best.y, best.z) : new THREE.Vector3(x + 30, y + 10, z);
        targetLook = new THREE.Vector3(x, y + 0.5, z);
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
    const base = this.mode === 'driver' ? DRIVER_FOV : this.baseFov;
    const fovTarget = this.mode === 'tv' ? 35 : base + Math.min(speed / 90, 1) * 14;
    cam.fov += (fovTarget - cam.fov) * (1 - Math.exp(-4 * dt));
    // shake on wall impacts / kerbs
    const rough = { kerb: 0.015, gravel: 0.03, sausage: 0.05 }[car.surface] ?? 0;
    if (car.wallHit > 0.05 || rough) {
      const amt = car.wallHit * 0.15 + rough * Math.min(speed / 30, 1);
      cam.position.x += (Math.random() - 0.5) * amt;
      cam.position.y += (Math.random() - 0.5) * amt;
    }
    cam.updateProjectionMatrix();
  }
}

function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
