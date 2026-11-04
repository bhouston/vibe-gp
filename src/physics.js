// Simple, tunable race-car dynamics on a flat plane.
// World: X/Z ground plane, yaw = 0 faces +Z, positive yaw turns toward +X (left).
import { CAR_DIMS } from './car.js';
import { TRACK } from './track.js';

export const PARAMS = {
  mass: 800, // kg incl. driver
  maxDriveForce: 10500, // N — traction-limited launch
  power: 620000, // W — limits force at speed
  dragCoef: 0.78, // N per (m/s)^2 → ~330 km/h top speed
  rollingResist: 140, // N
  brakeDecel: 32, // m/s^2 at full pedal (F1 brakes hard!)
  reverseMax: 12, // m/s
  baseGrip: 14, // m/s^2 lateral accel with no downforce
  downforceGrip: 0.0028, // extra lateral accel per (m/s)^2
  lateralDamp: 9, // how quickly sideways slip is killed (1/s)
  handbrakeDamp: 1.4,
  steerMaxLow: 0.42, // rad at walking pace
  steerMaxHigh: 0.07, // rad at top speed
  steerSpeed: 3.2, // rad/s steering rack speed
  steerReturn: 5.0,
  grassDrag: 4.0, // extra drag per m/s on grass
  grassGrip: 0.55, // grip multiplier on grass
  kerbGrip: 0.9,
};

export const GEARS = [0, 23, 35, 46, 56, 65, 74, 83, 999]; // m/s upshift points per gear 1..8

export class CarPhysics {
  constructor(pose) {
    this.reset(pose);
  }

  reset(pose) {
    this.position = { x: pose.x, z: pose.z };
    this.yaw = pose.yaw;
    this.vel = { x: 0, z: 0 };
    this.yawRate = 0;
    this.steerAngle = 0;
    this.speed = 0; // signed forward speed (m/s)
    this.longAccel = 0;
    this.latAccel = 0;
    this.pitch = 0;
    this.roll = 0;
    this.heave = 0;
    this.surface = 'asphalt';
    this.gear = 1;
    this.rpm = 0;
    this.wallHit = 0;
  }

  step(input, dt) {
    const P = PARAMS;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fwd = { x: sin, z: cos };
    const right = { x: -cos, z: sin };
    let vF = this.vel.x * fwd.x + this.vel.z * fwd.z;
    const absV = Math.abs(vF);

    // --- surface ---
    const r = Math.hypot(this.position.x, this.position.z);
    let gripMul = 1, extraDrag = 0;
    if (r < TRACK.inner - TRACK.kerb || r > TRACK.outer + TRACK.kerb) {
      this.surface = 'grass';
      gripMul = P.grassGrip;
      extraDrag = P.grassDrag * absV;
    } else if (r < TRACK.inner || r > TRACK.outer) {
      this.surface = 'kerb';
      gripMul = P.kerbGrip;
    } else {
      this.surface = 'asphalt';
    }

    // --- steering (speed sensitive, rate limited) ---
    const speedT = Math.min(absV / 80, 1);
    const maxSteer = P.steerMaxLow + (P.steerMaxHigh - P.steerMaxLow) * Math.sqrt(speedT);
    const target = input.steer * maxSteer;
    const rate = input.steer === 0 ? P.steerReturn : P.steerSpeed;
    const ds = target - this.steerAngle;
    this.steerAngle += Math.sign(ds) * Math.min(Math.abs(ds), rate * maxSteer * dt * 2.5);

    // --- longitudinal ---
    let force = 0;
    let brake = 0;
    if (input.throttle > 0) {
      if (vF >= -0.5) force += input.throttle * Math.min(P.maxDriveForce, P.power / Math.max(absV, 1));
      else brake = P.brakeDecel * input.throttle; // throttle while rolling backwards = brake
    }
    if (input.brake > 0) {
      if (vF > 0.5) brake = Math.max(brake, P.brakeDecel * input.brake);
      else if (vF > -P.reverseMax) force -= input.brake * 4000; // reverse
    }
    const drag = P.dragCoef * vF * absV + Math.sign(vF) * (P.rollingResist + extraDrag * P.mass * 0.1);
    let aF = (force - drag) / P.mass;
    // brakes oppose motion without reversing it
    if (brake > 0) {
      const dv = brake * dt;
      if (Math.abs(vF + aF * dt) <= dv) {
        aF = -vF / dt;
      } else aF -= Math.sign(vF) * brake;
    }
    this.vel.x += fwd.x * aF * dt;
    this.vel.z += fwd.z * aF * dt;
    vF += aF * dt;

    // --- yaw ---
    const maxLat = (P.baseGrip + P.downforceGrip * vF * vF) * gripMul;
    let targetYawRate = (vF * Math.tan(this.steerAngle)) / CAR_DIMS.wheelbase;
    if (absV > 1) {
      const limit = maxLat / absV; // understeer when asking for more than the tyres have
      targetYawRate = Math.max(-limit, Math.min(limit, targetYawRate));
    }
    if (input.handbrake && absV > 5) targetYawRate *= 1.6; // rear steps out
    const yawResponse = 1 - Math.exp(-12 * dt);
    this.yawRate += (targetYawRate - this.yawRate) * yawResponse;
    this.yaw += this.yawRate * dt;

    // --- kill lateral slip (velocity follows the nose) ---
    const s2 = Math.sin(this.yaw), c2 = Math.cos(this.yaw);
    const f2 = { x: s2, z: c2 }, r2 = { x: -c2, z: s2 };
    let vf = this.vel.x * f2.x + this.vel.z * f2.z;
    let vl = this.vel.x * r2.x + this.vel.z * r2.z;
    const damp = (input.handbrake ? P.handbrakeDamp : P.lateralDamp) * gripMul;
    vl *= Math.exp(-damp * dt);
    if (input.handbrake) vf *= Math.exp(-0.6 * dt);
    this.vel.x = f2.x * vf + r2.x * vl;
    this.vel.z = f2.z * vf + r2.z * vl;

    // --- integrate position ---
    this.position.x += this.vel.x * dt;
    this.position.z += this.vel.z * dt;
    this.collideWalls();

    // --- derived values for HUD / visuals ---
    this.speed = this.vel.x * f2.x + this.vel.z * f2.z;
    this.longAccel = aF;
    this.latAccel = this.speed * this.yawRate;
    const k = 1 - Math.exp(-6 * dt);
    const bump = this.surface === 'kerb' ? Math.sin(performance.now() * 0.09) * 0.012 * Math.min(absV / 20, 1) : 0;
    this.pitch += (Math.max(-0.035, Math.min(0.035, -aF * 0.0012)) - this.pitch) * k;
    this.roll += (Math.max(-0.04, Math.min(0.04, this.latAccel * 0.0012)) - this.roll) * k;
    this.heave = bump;
    this.updateGearbox();
  }

  collideWalls() {
    const p = this.position;
    const r = Math.hypot(p.x, p.z);
    const margin = 1.1; // half car width-ish
    const minR = TRACK.innerWall + TRACK.wallThickness / 2 + margin;
    const maxR = TRACK.outerWall - TRACK.wallThickness / 2 - margin;
    if (r > minR && r < maxR) {
      this.wallHit = Math.max(0, this.wallHit - 0.05);
      return;
    }
    const nx = p.x / r, nz = p.z / r; // outward normal
    const clampR = r <= minR ? minR : maxR;
    p.x = nx * clampR;
    p.z = nz * clampR;
    // remove the radial component (with a little bounce) and scrub speed
    const vr = this.vel.x * nx + this.vel.z * nz;
    const into = r <= minR ? vr < 0 : vr > 0;
    if (into) {
      // bounce off the radial part
      this.vel.x -= nx * vr * 1.3;
      this.vel.z -= nz * vr * 1.3;
      // friction along the wall scales with impact speed, so a glancing
      // scrape costs a little and a head-on hit costs a lot
      const tx = -nz, tz = nx;
      const vt = this.vel.x * tx + this.vel.z * tz;
      const scrub = Math.min(Math.abs(vt), Math.abs(vr) * 0.6 + 0.02);
      const nvt = vt - Math.sign(vt) * scrub;
      this.vel.x += tx * (nvt - vt);
      this.vel.z += tz * (nvt - vt);
      this.wallHit = Math.min(1, Math.max(this.wallHit, Math.abs(vr) / 20));
    }
  }

  updateGearbox() {
    const v = Math.max(0, this.speed);
    let g = 1;
    while (g < 8 && v > GEARS[g]) g++;
    this.gear = this.speed < -0.5 ? 'R' : g;
    const lo = GEARS[g - 1] * 0.82, hi = GEARS[g];
    const t = g === 8 ? v / 92 : (v - lo) / (hi - lo);
    this.rpm = Math.max(0.18, Math.min(1, 0.45 + 0.55 * t));
  }
}
