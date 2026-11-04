// Race-car dynamics: a four-wheel planar vehicle model driven by a physical
// tyre model (see tyres.js).
// World: X/Z ground plane, yaw = 0 faces +Z, positive yaw turns toward +X (left).
//
// Per sub-step:
//  1. Aerodynamics: downforce and drag ∝ v² (ClA, CdA), downforce split
//     front/rear by aero balance. Kerbs and grass upset the floor and cut it.
//  2. Vertical loads: static weight + downforce + longitudinal and lateral load
//     transfer (from CoG height and measured accelerations), split per axle by
//     roll stiffness. Ridged kerbs and rough grass modulate the load.
//  3. Each wheel: contact-patch velocity → slip angle and slip ratio → combined
//     Magic-Formula force on that wheel's own surface. Wheel spin is integrated
//     semi-implicitly from drive/brake torque against the tyre force, so
//     wheelspin and lock-ups emerge on their own.
//  4. Sum forces and the yaw moment on the chassis and integrate.
// Tyre tread temperature and grass contamination are tracked per wheel.
// Elevation: the car rides the track's height profile. Gravity pulls along the slope
// (split into the car's forward and sideways directions), and vertical curvature adds
// or removes load: a dip like Eau Rouge compresses the car (v²·κ extra), a crest
// unloads it.
import { CAR_DIMS } from './car.js';
import { KERB_WIDTH, WALL_THICKNESS, PIT } from './trackPath.js';
import { SURFACES, TYRE, tyreForce, tempGrip, peakForce } from './tyres.js';

const G = 9.81;
const RHO = 1.225; // air density, kg/m^3

export const PARAMS = {
  mass: 850, // kg: 798 kg minimum incl. driver + ~50 kg fuel
  yawInertia: 1300, // kg·m^2
  cgHeight: 0.29, // m
  rollStiffFront: 0.52, // share of lateral load transfer taken by the front axle
  ClA: 4.6, // downforce coefficient × area, m^2 (≈ 2.3× weight at 300 km/h)
  CdA: 1.27, // drag coefficient × area, m^2
  aeroBalance: 0.43, // share of downforce on the front axle
  rearGrip: 1.1, // rear tyres are wider (405 mm vs 305 mm front): more grip, a stable rear
  power: 735000, // W: ICE + ERS
  drivetrainEff: 0.92,
  maxAxleTorque: 4700, // N·m at the rear axle (first-gear torque limit)
  engineBrake: 250, // N·m at the axle with the throttle closed (incl. ERS harvest)
  lsdLock: 45, // N·m per rad/s of left/right wheel-speed difference
  maxBrakeForce: 47000, // N at full pedal (≈ 5.6 g; tyres can't take it at low speed)
  brakeBias: 0.57, // front share of brake force
  reverseTorque: 1400, // N·m
  reverseMax: 12, // m/s
  wheelInertiaFront: 0.9, // kg·m^2 per wheel
  wheelInertiaRear: 1.4, // per wheel, incl. driveline
  steerMaxLow: 0.55, // rad of lock at walking pace
  steerMaxHigh: 0.12, // rad of lock at top speed
  steerFadeSpeed: 20, // m/s: lock halves (toward steerMaxHigh) around this speed
  steerSpeed: 3.2, // rad/s steering rack speed
  steerReturn: 5.0,
  throttleRate: 8, // pedal travel per second (keyboard input is on/off)
  brakeRate: 12,
  substeps: 6,
  // stability assist (on with traction control): steers toward the direction
  // of travel and trims the throttle once the car slides past a few degrees
  counterSteer: 1.0, // rad of extra steering per rad of body slip beyond the deadband
  counterDeadband: 0.05, // rad (~3°): normal cornering slip is left alone
  steerSlipTarget: 1.3, // steering assist aims the fronts at this × peak slip angle
  slipCut: 0.07, // rad (~4°) body slip where the throttle starts being trimmed
  lowSpeed: 3, // m/s: slip denominators never go below this (avoids singular slip at rest)
};

const D = CAR_DIMS;
// wheel layout in the car frame: x forward from the CoG, y to the left
const WHEELS = [
  { x: D.frontAxle, y: D.track, r: D.frontRadius, front: true },
  { x: D.frontAxle, y: -D.track, r: D.frontRadius, front: true },
  { x: D.rearAxle, y: D.track, r: D.rearRadius, front: false },
  { x: D.rearAxle, y: -D.track, r: D.rearRadius, front: false },
];
const A_FRONT = D.frontAxle; // CoG → front axle
const B_REAR = -D.rearAxle; // CoG → rear axle
const L = A_FRONT + B_REAR;

// Summary numbers for tools that need a quick speed profile (scripts/track-check.mjs).
// Lateral grip in m/s^2 ≈ baseGrip + downforceGrip · v^2, measured from the tyre model.
{
  // Steady-state limit on dry asphalt including lateral load transfer (which,
  // through load sensitivity, costs grip), with tyres below their window (60 °C)
  // so the numbers hold on an out-lap and after long straights.
  const m = PARAMS.mass;
  const grip = tempGrip(TYRE.tCold);
  const latAt = (v) => {
    const axle = (m * G + 0.5 * RHO * PARAMS.ClA * v * v) / 2; // per axle, both axles ≈ equal
    let ay = 10;
    for (let k = 0; k < 30; k++) {
      const dT = (m * ay * PARAMS.cgHeight) / (2 * D.track) / 2; // per axle
      const f = peakForce(SURFACES.asphalt, axle / 2 + dT) + peakForce(SURFACES.asphalt, Math.max(0, axle / 2 - dT));
      ay = (2 * f * grip) / m;
    }
    return ay;
  };
  PARAMS.baseGrip = latAt(0);
  PARAMS.downforceGrip = (latAt(70) - PARAMS.baseGrip) / (70 * 70);
  // the lowest full-braking deceleration (slow speed, no downforce): braking
  // zones planned with it never overshoot
  PARAMS.brakeDecel = (4 * peakForce(SURFACES.asphalt, (m * G) / 4) * grip * TYRE.muLongScale) / m;
}

export const GEARS = [0, 23, 35, 46, 56, 65, 74, 83, 999]; // m/s upshift points per gear 1..8

export class CarPhysics {
  /** track: a TrackPath (centreline, kerbs, wall offsets). */
  constructor(track, pose) {
    this.track = track;
    this.reset(pose);
  }

  reset(pose) {
    this.trackIndex = -1; // nearest centreline sample (search hint)
    this.trackS = 0; // distance along the lap (m)
    this.lateral = 0; // offset from centreline, + = left
    this.pitIndex = -1; // nearest pit lane sample (search hint)
    this.pitS = 0; // distance along the pit lane (m)
    this.onPitLane = false; // driving in the pit lane (off the track, on the lane)
    this.inPitLane = false; // between the pit speed-limit lines: the limiter is on
    this.onPitLane0 = false; // near the lane last step (use the search hint)
    this.position = { x: pose.x, z: pose.z };
    this.prevPos = { x: pose.x, z: pose.z }; // start of the step, for swept wall collisions
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
    this.height = pose.y ?? 0; // world height of the road under the car
    this.gradeF = 0; // slope along the car's heading (+ = uphill)
    this.gradeL = 0; // slope to the car's left (+ = left side higher)
    this.vcurv = 0; // vertical curvature under the car (1/m, + = dip)
    this.surface = 'asphalt';
    this.gear = 1;
    this.rpm = 0;
    this.wallHit = 0;
    this.throttle = 0; // pedal positions after rate limiting
    this.brake = 0;
    this.downforce = 0;
    this.tc = true; // assists (keyboard input is on/off, so these default on)
    this.abs = true;
    this.tcActive = false;
    this.absActive = false;
    this.tcGain = 1;
    this.wheels = WHEELS.map((w) => ({
      ...w,
      omega: 0, // rad/s
      surface: SURFACES.asphalt,
      load: 0,
      kappa: 0,
      alpha: 0,
      slide: 0, // combined slip / peak slip (>1 = sliding)
      temp: TYRE.tBlanket,
      dirt: 0,
      dist: 0, // rolled distance, drives the kerb-ridge phase
      absGain: 1,
    }));
  }

  step(input, dt) {
    const P = PARAMS;
    if (input.tc !== undefined) this.tc = input.tc;
    if (input.abs !== undefined) this.abs = input.abs;

    // --- where the car is, and the surfaces under each wheel (once per step) ---
    this.locate();
    this.classifyWheels(this.trackIndex);
    this.sampleSlope();
    this.prevPos.x = this.position.x;
    this.prevPos.z = this.position.z;

    // --- pedals (rate limited); the pit limiter closes the throttle above the limit ---
    const limited = this.inPitLane && this.speed > PIT.speedLimit - 0.3;
    this.throttle = approach(this.throttle, limited ? 0 : input.throttle ?? 0, P.throttleRate * dt);
    this.brake = approach(this.brake, input.brake ?? 0, P.brakeRate * dt);

    // --- steering (speed sensitive, rate limited) ---
    const absV = Math.abs(this.speed);
    const maxSteer = P.steerMaxHigh + (P.steerMaxLow - P.steerMaxHigh) / (1 + (absV / P.steerFadeSpeed) ** 2);
    const steerIn = input.steer ?? 0;
    let target = steerIn * maxSteer;
    this.slipAngle = 0;
    if (absV > 3) {
      const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
      const vx = this.vel.x * sn + this.vel.z * cs, vy = this.vel.x * cs - this.vel.z * sn;
      // slide measured at the rear axle (the CoG slips inward naturally in slow
      // corners, which is not a slide); + = rear moving to the left of where it points
      this.slipAngle = Math.atan2(vy - this.yawRate * B_REAR, Math.abs(vx));
      if (this.tc && vx > 3) {
        // steering assist: aim the front wheels at peak-grip slip angle relative
        // to where the front axle is actually travelling, so full lock is the
        // tightest turn the tyres can make (no scrubbing past the peak)
        if (steerIn !== 0) {
          const thetaF = Math.atan2(vy + this.yawRate * A_FRONT, vx);
          const aPk = (this.wheels[0].surface.peakAlpha + this.wheels[1].surface.peakAlpha) / 2;
          target = clamp(Math.abs(steerIn) * thetaF + steerIn * aPk * P.steerSlipTarget, -maxSteer, maxSteer);
        }
        // countersteer: point the front wheels toward where the car is going
        const excess = Math.sign(this.slipAngle) * Math.max(0, Math.abs(this.slipAngle) - P.counterDeadband);
        target = clamp(target + excess * P.counterSteer, -P.steerMaxLow, P.steerMaxLow);
      }
    }
    const rate = !input.steer && !this.tc ? P.steerReturn : P.steerSpeed;
    const ds = target - this.steerAngle;
    this.steerAngle += Math.sign(ds) * Math.min(Math.abs(ds), rate * maxSteer * dt * 2.5);

    // --- dynamics ---
    const n = P.substeps;
    const h = dt / n;
    this.tcActive = false;
    this.absActive = false;
    for (let k = 0; k < n; k++) this.substep(h);

    this.collideWalls();
    this.updateTyreState(dt);

    // --- derived values for HUD / visuals ---
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    this.speed = this.vel.x * f.x + this.vel.z * f.z;
    const kf = 1 - Math.exp(-6 * dt);
    let bump = 0;
    for (const w of this.wheels) {
      if (w.surface.bump) bump += Math.sin((w.dist / w.surface.bumpWavelength) * Math.PI * 2) * 0.004 * w.surface.bump;
    }
    this.pitch += (clamp(-this.longAccel * 0.0012, -0.035, 0.035) - this.pitch) * kf;
    this.roll += (clamp(this.latAccel * 0.0012, -0.04, 0.04) - this.roll) * kf;
    this.heave = bump * Math.min(absV / 20, 1);
    this.updateGearbox();
  }

  substep(h) {
    const P = PARAMS;
    const m = P.mass;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // car frame: f = forward, l = left
    const vx = this.vel.x * sin + this.vel.z * cos;
    const vy = this.vel.x * cos - this.vel.z * sin;
    const r = this.yawRate;

    // aerodynamics
    let aeroLoss = 0;
    for (const w of this.wheels) aeroLoss += w.surface.aeroLoss / 4;
    const qd = 0.5 * RHO * vx * vx;
    const downforce = qd * P.ClA * (1 - aeroLoss);
    const drag = qd * P.CdA * Math.sign(vx);
    this.downforce = downforce;

    // vertical loads: weight (less on a slope, more in a dip, less over a crest)
    // + aero + load transfer (from last step's accelerations)
    const g = this.gradeF * this.gradeF + this.gradeL * this.gradeL;
    const gN = Math.max(0, G / Math.sqrt(1 + g) + (vx * vx + vy * vy) * this.vcurv);
    const ax = this.longAccel, ay = this.latAccel;
    const longT = (m * ax * P.cgHeight) / L; // + = onto the rear
    const latT = (m * ay * P.cgHeight) / (2 * D.track); // + = onto the right
    const front = (m * gN * B_REAR) / L + downforce * P.aeroBalance - longT;
    const rear = (m * gN * A_FRONT) / L + downforce * (1 - P.aeroBalance) + longT;
    const latF = latT * P.rollStiffFront, latR = latT * (1 - P.rollStiffFront);
    const loads = [front / 2 - latF, front / 2 + latF, rear / 2 - latR, rear / 2 + latR];

    // per-wheel load and grip; also what each tyre can take longitudinally,
    // given the cornering force it is already making (friction ellipse)
    const W = this.wheels;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const S = w.surface;
      let fz = Math.max(0, loads[i]);
      if (S.bump) fz *= 1 + S.bump * Math.sin((w.dist / S.bumpWavelength) * Math.PI * 2) * Math.min(Math.abs(vx) / 8, 1);
      w.load = fz;
      w.grip = tempGrip(w.temp) * (1 - TYRE.dirtGripLoss * w.dirt) * (w.front ? 1 : P.rearGrip);
      const peak = peakForce(S, fz) * w.grip;
      const used = peak > 0 ? Math.min(1, Math.abs(w.fy || 0) / peak) : 1;
      w.capX = peak * TYRE.muLongScale * Math.sqrt(Math.max(0.1, 1 - used * used));
    }

    // drive torque (rear axle). Traction control caps it at what the rear tyres
    // can transmit and trims it further if they still spin up.
    const wRear = (W[2].omega + W[3].omega) / 2;
    let axleTorque = 0;
    let brakeForce = P.maxBrakeForce * this.brake;
    if (this.throttle > 0) {
      if (vx >= -0.5) {
        const wheelV = Math.max(wRear * D.rearRadius, 5);
        axleTorque = this.throttle * Math.min(P.maxAxleTorque, (P.power * P.drivetrainEff * D.rearRadius) / wheelV);
        if (this.tc) axleTorque = Math.min(axleTorque, (W[2].capX + W[3].capX) * D.rearRadius) * this.tcGain;
      } else brakeForce = Math.max(brakeForce, P.maxBrakeForce * 0.5 * this.throttle); // throttle while rolling back = brake
    } else if (wRear > 1) axleTorque = -P.engineBrake;
    if (this.brake > 0 && vx <= 0.5 && this.throttle === 0) {
      brakeForce = 0; // stopped: the brake key selects reverse
      if (vx > -P.reverseMax) axleTorque = -P.reverseTorque * this.brake;
    }
    const lsd = P.lsdLock * (W[2].omega - W[3].omega);

    // gravity along the slope
    let FX = -drag - m * G * this.gradeF, FY = -m * G * this.gradeL, MZ = 0;
    let spin = 0;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const S = w.surface;
      const fz = w.load, grip = w.grip;

      // contact-patch velocity in the wheel frame
      const delta = w.front ? this.steerAngle : 0;
      const cd = Math.cos(delta), sd = Math.sin(delta);
      const cvx = vx - r * w.y, cvy = vy + r * w.x;
      const wvx = cvx * cd + cvy * sd;
      const wvy = -cvx * sd + cvy * cd;
      const den = Math.max(Math.abs(wvx), P.lowSpeed);
      const tanA = wvy / den;

      // wheel torques
      let tDrive = 0;
      if (!w.front) tDrive = axleTorque / 2 + (i === 2 ? -lsd : lsd);
      const brakeShare = w.front ? P.brakeBias : 1 - P.brakeBias;
      let tBrake = (brakeForce * brakeShare * w.r) / 2;
      // brake assist: cap pressure at what this tyre can take, then bleed it on lock-up
      if (this.abs && tBrake > 0) tBrake = Math.min(tBrake, w.capX * w.r) * w.absGain;
      const I = w.front ? P.wheelInertiaFront : P.wheelInertiaRear;

      // semi-implicit wheel spin: linearise Fx(ω) about the current ω
      const kap0 = (w.omega * w.r - wvx) / den;
      const f0 = tyreForce(S, kap0, tanA, fz, grip).fx;
      const eps = 1e-3;
      const f1 = tyreForce(S, kap0 + eps, tanA, fz, grip).fx;
      const dFdOmega = Math.max(0, (f1 - f0) / eps) * (w.r / den);
      const rollT = S.crr * fz * w.r * Math.tanh(w.omega * w.r / 0.5);
      const Ieff = I + h * w.r * w.r * dFdOmega;
      let om = w.omega + (h * (tDrive - f0 * w.r - rollT)) / Ieff;
      // brakes oppose rotation but cannot reverse it within a step
      const dB = (tBrake * h) / Ieff;
      if (Math.abs(om) <= dB) om = 0;
      else om -= Math.sign(om) * dB;
      w.omega = om;

      // final tyre forces at the new wheel speed
      const kappa = (om * w.r - wvx) / den;
      const tf = tyreForce(S, kappa, tanA, fz, grip);
      w.kappa = kappa;
      w.alpha = Math.atan(tanA);
      w.slide = tf.slide;
      w.fy = tf.fy;
      w.slipPower = Math.abs(tf.fx * (om * w.r - wvx)) + Math.abs(tf.fy * wvy);
      w.rollSpeed = Math.abs(wvx);

      // assists: ABS bleeds brake pressure on lock-up, TC cuts torque on wheelspin
      if (this.abs && tBrake > 0 && kappa < 0 && tf.slide > 1.15) {
        w.absGain = Math.max(0.05, w.absGain - h * 25);
        this.absActive = true;
      } else w.absGain = Math.min(1, w.absGain + h * 6);
      if (!w.front && kappa > 0 && tf.slide > 1.1) spin = Math.max(spin, tf.slide);

      // rolling resistance acts along the wheel against its motion
      const fRoll = -S.crr * fz * Math.tanh(wvx / 0.5);
      const fxw = tf.fx + fRoll, fyw = tf.fy;
      const fxc = fxw * cd - fyw * sd;
      const fyc = fxw * sd + fyw * cd;
      FX += fxc;
      FY += fyc;
      MZ += w.x * fyc - w.y * fxc;
    }
    const slipOver = Math.abs(this.slipAngle || 0) / P.slipCut;
    if (this.tc && slipOver > 1 && this.throttle > 0) spin = Math.max(spin, 1 + (slipOver - 1) * 2);
    if (this.tc && spin > 0 && this.throttle > 0) {
      this.tcGain = Math.max(0.1, this.tcGain - h * 12 * (spin - 1));
      this.tcActive = true;
    } else this.tcGain = Math.min(1, this.tcGain + h * 3);

    // integrate the chassis
    const ex = FX / m, ey = FY / m;
    this.vel.x += (sin * ex + cos * ey) * h;
    this.vel.z += (cos * ex - sin * ey) * h;
    this.yawRate += (MZ / P.yawInertia) * h;
    this.yaw += this.yawRate * h;
    this.position.x += this.vel.x * h;
    this.position.z += this.vel.z * h;
    for (const w of W) w.dist += w.rollSpeed * h;

    // accelerations felt by the chassis (load transfer next step); the
    // suspension smooths them a little
    const ks = 1 - Math.exp(-h / 0.04);
    this.longAccel += (ex - this.longAccel) * ks;
    this.latAccel += (ey - this.latAccel) * ks;
  }

  /**
   * Position along the lap. In the pit lane the lap distance comes from the lane's own
   * mapping, since the nearest bit of track can be a different part of the circuit.
   */
  locate() {
    const T = this.track, pit = T.pit;
    const { x, z } = this.position;
    let q = T.query(x, z, this.trackIndex);
    this.onPitLane = this.inPitLane = false;
    if (pit) {
      const pq = pit.query(x, z, this.onPitLane0 ? this.pitIndex : -1);
      this.pitIndex = pq.j;
      this.pitS = pq.s;
      const across = pq.lateral * pit.outer; // + towards the garages
      const nearLane = pq.j > 0 && pq.j < pit.N - 1 && across >= -PIT.hw - 1 && across <= pit.outerHw(pq.j) + 1;
      if (nearLane && Math.abs(q.lateral) > T.hw + KERB_WIDTH) {
        this.onPitLane = true;
        const s = pit.lapS(pq.s);
        const i = T.wrap(Math.round(s / T.ds));
        q = { i, s, lateral: (x - T.px[i]) * T.leftX(i) + (z - T.pz[i]) * T.leftZ(i) };
      }
      this.inPitLane = this.onPitLane && pq.s >= pit.limitStart && pq.s <= pit.limitEnd;
      this.onPitLane0 = nearLane;
    }
    this.trackIndex = q.i;
    this.trackS = q.s;
    this.lateral = q.lateral;
  }

  /** Road height and slope under the car (the road is level across its width). */
  sampleSlope() {
    const T = this.track;
    const s = this.trackS;
    this.height = T.heightAt(s);
    const grade = T.gradeAt(s);
    const i = this.trackIndex;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // the slope points along the track tangent; project it onto the car's axes
    this.gradeF = grade * (sin * T.tx[i] + cos * T.tz[i]);
    this.gradeL = grade * (cos * T.tx[i] - sin * T.tz[i]);
    this.vcurv = T.vcurvAt(s);
  }

  /** Which surface each tyre's contact patch is on. */
  classifyWheels(i0) {
    const T = this.track, pit = T.pit;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const counts = { asphalt: 0, kerb: 0, grass: 0 };
    for (const w of this.wheels) {
      const wx = this.position.x + sin * w.x + cos * w.y;
      const wz = this.position.z + cos * w.x - sin * w.y;
      // the nearest centreline sample is within a sample or two of the CoG's
      const along = (wx - T.px[i0]) * T.tx[i0] + (wz - T.pz[i0]) * T.tz[i0];
      const i = T.wrap(i0 + Math.round(along / T.ds));
      const lat = (wx - T.px[i]) * T.leftX(i) + (wz - T.pz[i]) * T.leftZ(i);
      const off = Math.abs(lat);
      let s;
      if (off <= T.hw) s = 'asphalt';
      else if (off <= T.hw + KERB_WIDTH && (lat > 0 ? T.kerbL : T.kerbR)[i]) s = 'kerb';
      else s = 'grass';
      if (s === 'grass' && pit && this.pitIndex >= 0) {
        const j0 = this.pitIndex;
        const a = (wx - pit.px[j0]) * pit.tx[j0] + (wz - pit.pz[j0]) * pit.tz[j0];
        const j = Math.min(Math.max(j0 + Math.round(a / pit.ds), 0), pit.N - 1);
        const pl = (wx - pit.px[j]) * pit.leftX(j) + (wz - pit.pz[j]) * pit.leftZ(j);
        if (pit.onLane(j, pl)) s = 'asphalt';
      }
      w.surface = SURFACES[s];
      counts[s]++;
    }
    // the car's overall surface: whatever most wheels are on, the worse one on a tie
    this.surface = counts.grass >= 2 ? 'grass' : counts.kerb >= 2 ? 'kerb' : 'asphalt';
  }

  /** Tread temperature and grass contamination, per wheel. */
  updateTyreState(dt) {
    const v = Math.abs(this.speed);
    for (const w of this.wheels) {
      const heat = TYRE.slipHeat * (w.slipPower || 0) + TYRE.flexHeat * w.load * (w.rollSpeed || 0);
      let cool = (TYRE.coolBase + TYRE.coolSpeed * v) * (w.temp - TYRE.tAmbient);
      if (w.surface === SURFACES.grass) cool += TYRE.coolGrass * (w.temp - TYRE.tAmbient);
      w.temp += ((heat - cool) / TYRE.heatCapacity) * dt;
      const d = (w.rollSpeed || 0) * dt;
      if (w.surface.dirt > 0) w.dirt += (1 - w.dirt) * Math.min(1, w.surface.dirt * d);
      else w.dirt *= Math.exp(-d / TYRE.dirtCleanLength);
    }
  }

  /** Swept circle against the barrier segments (track walls, pit wall, pit lane walls). */
  collideWalls() {
    const T = this.track;
    const p = this.position;
    const r = 1.1 + WALL_THICKNESS / 2; // half car width-ish + half the wall
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const c = T.wallContact(p.x, p.z, this.prevPos.x, this.prevPos.z, r);
      if (!c) break;
      hit = true;
      this.wallImpact(-c.nx, -c.nz, c.pen); // normal pointing into the wall
      // later contacts sweep from where this one left the car
      this.prevPos.x = p.x;
      this.prevPos.z = p.z;
    }
    if (!hit) this.wallHit = Math.max(0, this.wallHit - 0.05);
  }

  /** Push the car out of a wall (nx, nz = unit normal pointing into the wall) and bounce. */
  wallImpact(nx, nz, pen) {
    const p = this.position;
    p.x -= nx * pen;
    p.z -= nz * pen;
    const vr = this.vel.x * nx + this.vel.z * nz;
    if (vr > 0) {
      // bounce off the wall-normal part
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
      this.yawRate *= 0.5; // the impact kills most of the rotation
      this.wallHit = Math.min(1, Math.max(this.wallHit, Math.abs(vr) / 20));
    }
  }

  updateGearbox() {
    const v = Math.max(0, this.speed);
    let g = 1;
    while (g < 8 && v > GEARS[g]) g++;
    this.gear = this.speed < -0.5 ? 'R' : g;
    // engine speed follows the driven wheels, so wheelspin shows on the rev counter
    const wv = Math.max(0, ((this.wheels[2].omega + this.wheels[3].omega) / 2) * D.rearRadius);
    const lo = GEARS[g - 1] * 0.82, hi = GEARS[g];
    const t = g === 8 ? wv / 92 : (wv - lo) / (hi - lo);
    this.rpm = Math.max(0.18, Math.min(1, 0.45 + 0.55 * t));
  }
}

function approach(x, target, step) {
  return x < target ? Math.min(target, x + step) : Math.max(target, x - step);
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
