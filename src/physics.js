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
// Damage (damage.js): wall impacts can hurt every part of the car. A bent or missing
// front wing half costs that side's front downforce (understeer, and a pull to one side);
// a broken rear wing costs rear downforce (oversteer) but also drag; a damaged floor
// costs downforce on both axles; crushed sidepods add drag and overheat the engine; a
// hurt power unit / gearbox loses power; bent suspension knocks a wheel out of line
// (toe-out pulls the car, camber costs grip); damaged tyres grip less and drag.
import { CAR_DIMS, WHEELS } from './car.js';
import { KERB_WIDTH, PIT } from './trackPath.js';
import { SURFACES, TYRE, COMPOUNDS, tyreForce, tempGrip, wearGrip, peakForce, rollingCoef } from './tyres.js';
import { CarDamage, DAMAGE } from './damage.js';
import { carBoxes, boxGone, GROUND } from './carShape.js';

const G = 9.81;
const RHO = 1.225; // air density, kg/m^3

export const PARAMS = {
  mass: 850, // kg: 798 kg minimum incl. driver + ~50 kg fuel
  yawInertia: 1300, // kg·m^2
  pitchInertia: 1200, // kg·m^2 (in the air: pivots and landings)
  rollInertia: 250, // kg·m^2
  cgHeight: 0.29, // m
  rollStiffFront: 0.52, // share of lateral load transfer taken by the front axle
  ClA: 7.5, // downforce coefficient × area, m^2 (≈ 3.8× weight at 300 km/h: more than a real F1 car, for grip)
  CdA: 1.27, // drag coefficient × area, m^2
  aeroBalance: 0.45, // share of downforce on the front axle
  rearGrip: 1.05, // rear tyres are wider (405 mm vs 305 mm front): more grip, a stable rear
  power: 735000, // W: ICE + ERS
  drivetrainEff: 0.92,
  maxAxleTorque: 4700, // N·m at the rear axle (first-gear torque limit)
  engineBrake: 250, // N·m at the axle with the throttle closed (incl. ERS harvest)
  lsdLock: 45, // N·m per rad/s of left/right wheel-speed difference
  maxBrakeForce: 80000, // N at full pedal (≈ 9.6 g; the tyres set the real limit)
  brakeBias: 0.57, // front share of brake force
  brakeSteerReserveFront: 0.3, // share of front grip kept for turning at full steering input
  brakeSteerReserveRear: 0.1,
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

// In the air (launch() to onLand()): no tyre forces, so the pedals and steering do nothing
// and the yaw rate and horizontal speed carry on, with drag. Gravity pulls the car down;
// downforce fades as the nose rises against the airflow and turns to lift past liftAngle,
// and the floor's share of it (ground effect) fades with height. Pitch and roll rates damp
// slowly, and at speed the airflow turns the nose towards the flight path, like an arrow's
// fletching, and the heading towards the direction of travel (a car kicked into a spin
// turns only part of the way round before it lands). Pitch and roll stop at the cap (no
// full flips); that marks nothing by itself: a car is wrecked only by the damage its
// landing does (CarDamage.undrivable).
// The ground: points of the car (GROUND in carShape.js: the tyres, the diffuser's tail, the
// front wing's feet) that come down on the road get a vertical impulse, with the car's mass
// and its pitch and roll inertia. One end or side on the road while the car turns away from
// it pivots about it (the nose rising on the rear wheels); a hard landing rebounds a little.
// The tyres take over again (onLand) once both axles are back on the road, the car about
// flat against it and settled.
export const AIR = {
  liftAngle: 0.35, // rad (20°) nose-up against the airflow where downforce has gone
  maxLift: 0.6, // lift at most this share of the level downforce
  floorShare: 0.55, // share of the downforce the floor makes from ground effect
  groundEffect: 0.3, // m: the floor's downforce halves this high
  pitchStiff: 0.006, // rad/s² of nose turned to the flight path, per Pa of dynamic pressure per rad
  yawStiff: 0.0175, // rad/s² of heading turned to the direction of travel, per Pa per rad of sideslip
  yawDamp: 0.07, // 1/s of yaw-rate decay per m/s of speed (the sidepods, fin and rear wing)
  rateDamp: 1.5, // 1/s: pitch and roll rates decay this fast
  cap: 1.05, // rad (60°): pitch and roll stop here (no full flips)
  bounceSpeed: 4, // m/s into the road: a landing harder than this rebounds ...
  bounce: 0.2, // ... at this share of the speed
  scrape: 0.4, // friction of the floor or a wing tip sliding on the road (the tyres roll)
  landWindow: 0.03, // s: a tyre's hits this close together are one landing for its damage (the
  //                   suspension and tyre spread a slap over about this long)
  travel: 0.08, // m: in a hard landing (faster than 1 m/s), a tyre this close to the road takes
  //               its share too (the suspension's travel), so a near-level landing lands level
  settleGap: 0.02, // m: back on the tyres with each axle this close to the road ...
  settleTilt: 0.05, // ... pitch and roll this close to the road's (rad) ...
  settleSpeed: 1, // ... moving up or down slower than this (m/s) ...
  settleRate: 0.5, // ... and turning slower than this (rad/s)
};

export const GEARS = [0, 23, 35, 46, 56, 65, 74, 83, 999]; // m/s upshift points per gear 1..8

export class CarPhysics {
  /** track: a TrackPath (centreline, kerbs, wall offsets). */
  constructor(track, pose) {
    this.track = track;
    this.reset(pose);
  }

  reset(pose) {
    this.trackIndex = -1; // nearest centreline sample (search hint)
    this.reverseArmed = false; // the brake selects reverse only once it has been let go (see step)
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
    // rad, + = nose down / left side up. On the ground: the suspension's tilt against the
    // road. In the air: the car's real attitude, measured from the horizon.
    this.pitch = 0;
    this.roll = 0;
    this.heave = 0;
    this.air = 0; // m: the car's reference point above the road (0 on the ground)
    this.vy = 0; // m/s: vertical speed, + = up
    this.airborne = false; // from launch() to touchdown
    this.pitchRate = 0; // rad/s, signs as pitch and roll
    this.rollRate = 0;
    this.contacts = 0; // in the air: GROUND points pressing on the road (0 = clear of it)
    this.launched = false; // launch() since the last step
    this.landHit = null; // the hardest ground hit since leaving the road: { v, pitchRel, rollRel }
    this.firstHit = null; // the first one (the end or side that came down first)
    this.landPush = [0, 0, 0, 0]; // each tyre's push from the road over the last landWindow (N·s)
    this.landDone = [0, 0, 0, 0]; // ... and the share of it its damage has been charged for
    this.height = pose.y ?? 0; // world height of the road under the car
    this.gradeF = 0; // slope along the car's heading (+ = uphill)
    this.gradeL = 0; // slope to the car's left (+ = left side higher)
    this.vcurv = 0; // vertical curvature under the car (1/m, + = dip)
    this.surface = 'asphalt';
    this.gear = 1;
    this.rpm = 0;
    this.wallHit = 0;
    this.impact = 0; // hardest hit since the sound last read it (m/s into the wall)
    this.impactSide = 0; // where that hit landed: + = the car's left
    this.scrape = 0; // fastest slide along a wall since the sound last read it (m/s)
    this.throttle = 0; // pedal positions after rate limiting
    this.brake = 0;
    this.downforce = 0;
    this.tc = true; // assists (keyboard input is on/off, so these default on; toggled in Settings)
    this.abs = true; // anti-lock brakes
    this.steerInput = 0;
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
      wear: 0, // 0 = new tread, 1 = worn out
      damage: 0, // tyre collision damage (see damage.js)
      susp: 0, // suspension damage at this corner
      toe: 0, // rad of toe from bent suspension
      dist: 0, // rolled distance, drives the kerb-ridge phase
    }));
    this.compound ??= COMPOUNDS.medium; // a reset keeps the compound, on a fresh set
    this.wearScale ??= 1; // tyre wear rate multiplier (a race sets it from the race distance)
    this.damage ??= new CarDamage();
    this.damage.reset(); // a reset is a fresh car
    this.damageOn ??= true; // tools (track-check's autopilot) can turn damage off
  }

  /** A fresh set of `compound` tyres, warm from the blankets (pit stop). */
  fitTyres(compound) {
    this.compound = compound;
    for (const w of this.wheels) {
      w.temp = TYRE.tBlanket;
      w.dirt = 0;
      w.wear = 0;
    }
    this.damage.repairTyres();
  }

  step(input, dt) {
    const P = PARAMS;
    if (input.tc !== undefined) this.tc = input.tc;

    // --- where the car is, and the surfaces under each wheel (once per step) ---
    const alt = this.height + this.air; // in the air: the car's own height, whatever the road does
    this.locate();
    this.classifyWheels(this.trackIndex);
    this.sampleSlope();
    // in the air the car keeps its own height whatever the road does; but launch() measured
    // air from the road where the car was at the start of the last step, so straight after
    // a launch it stays measured from the road (else an uphill launch starts in the road)
    if (this.airborne && !this.launched) this.air = alt - this.height;
    this.launched = false;
    this.prevPos.x = this.position.x;
    this.prevPos.z = this.position.z;

    // input.hold: up on the jacks in the pit box. The car stays put and the pedals do
    // nothing (the brake would otherwise select reverse at a standstill).
    const yaw0 = this.yaw;
    // input.parked: a retired car, abandoned with the brakes on. It sits still but a hit can
    // shove it, the locked tyres scrubbing it to a stop (the brake doesn't select reverse)
    this.parked = !!input.parked;
    const hold = input.hold && !this.airborne; // the jacks and the brakes hold a car on the ground only
    if (hold) {
      this.holdStill();
      input = { ...input, throttle: 0, brake: 0 };
    }
    // a brake held through a release (off the jacks, the lights going out, a reset) only
    // holds the car on its brakes: reverse needs the pedal let go and pressed again
    if (hold) this.reverseArmed = false;
    else if (!input.brake) this.reverseArmed = true;

    // --- pedals (rate limited); the pit limiter closes the throttle above the limit ---
    const limited = this.inPitLane && this.speed > PIT.speedLimit - 0.3;
    this.throttle = approach(this.throttle, limited ? 0 : input.throttle ?? 0, P.throttleRate * dt);
    this.brake = approach(this.brake, input.brake ?? 0, P.brakeRate * dt);

    // --- steering (speed sensitive, rate limited) ---
    const absV = Math.abs(this.speed);
    const maxSteer = P.steerMaxHigh + (P.steerMaxLow - P.steerMaxHigh) / (1 + (absV / P.steerFadeSpeed) ** 2);
    const steerIn = input.steer ?? 0;
    this.steerInput = steerIn;
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
    this.dmgAero = this.damage.aero;
    this.tcActive = false;
    this.absActive = false;
    for (let k = 0; k < n; k++) {
      if (this.airborne) this.substepAir(h);
      else this.substep(h);
    }

    this.collideWalls(yaw0);
    this.updateTyreState(dt);

    // --- derived values for HUD / visuals ---
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    this.speed = this.vel.x * f.x + this.vel.z * f.z;
    const kf = 1 - Math.exp(-6 * dt);
    let bump = 0;
    for (const w of this.wheels) {
      if (w.surface.bump) bump += Math.sin((w.dist / w.surface.bumpWavelength) * Math.PI * 2) * 0.004 * w.surface.bump;
    }
    if (!this.airborne) {
      // on the ground: the suspension's tilt against the road
      this.pitch += (this.tiltPitch() - this.pitch) * kf;
      this.roll += (this.tiltRoll() - this.roll) * kf;
    }
    this.heave = this.airborne ? 0 : bump * Math.min(absV / 20, 1);
    // parked, or held on the brakes, and all but stopped: static friction holds it, even on
    // a steep slope
    const onBrakes = this.parked || (!this.reverseArmed && this.brake > 0 && this.throttle === 0);
    if (onBrakes && !this.airborne && Math.hypot(this.vel.x, this.vel.z) < 0.3 && Math.abs(this.yawRate) < 0.15) {
      this.vel.x = this.vel.z = 0;
      this.yawRate = 0;
      this.speed = 0;
      if (this.still) {
        // it didn't move last step either: undo the slope's nudge within this one
        this.position.x = this.prevPos.x;
        this.position.z = this.prevPos.z;
        this.yaw = yaw0;
      }
      this.still = true;
    } else this.still = false;
    if (hold) {
      this.holdStill();
      this.position.x = this.prevPos.x;
      this.position.z = this.prevPos.z;
      this.yaw = yaw0;
    }
    this.updateGearbox();
  }

  /** Stop all motion (car held stationary, e.g. on the jacks during a pit stop). */
  holdStill() {
    this.vel.x = this.vel.z = 0;
    this.yawRate = 0;
    this.speed = 0;
    this.throttle = this.brake = 0;
    for (const w of this.wheels) w.omega = 0;
  }

  /** The suspension's tilt on the ground (+ = nose down), from the braking or acceleration. */
  tiltPitch() {
    return clamp(-this.longAccel * 0.0012, -0.035, 0.035);
  }

  /** The suspension's roll on the ground (+ = left side up), from the cornering. */
  tiltRoll() {
    return clamp(this.latAccel * 0.0012, -0.04, 0.04);
  }

  /**
   * Leave the ground: vy (m/s, + up), pitchRate and rollRate (rad/s, + = nose down, left side
   * up). The single way a car takes off. While already in the air, adds to the current speed
   * and rates. In the air pitch and roll are measured from the horizon, so they take in the
   * road's slope here and the car's attitude doesn't jump.
   */
  launch({ vy = 0, pitchRate = 0, rollRate = 0 } = {}) {
    this.vy += vy;
    this.pitchRate += pitchRate;
    this.rollRate += rollRate;
    if (this.airborne) return;
    this.airborne = true;
    this.vy = vy;
    this.pitchRate = pitchRate;
    this.rollRate = rollRate;
    // it leaves with its tyres on the road (the suspension's tilt dips one end a little)
    const sp = Math.sin(this.pitch), sr = Math.sin(this.roll);
    let air = 0;
    for (const g of GROUND) if (g.wheel !== null) air = Math.max(air, -(g.h - sp * g.x + sr * g.y - 0.5 * this.vcurv * g.x * g.x));
    this.air = air + 1e-6;
    this.contacts = 0;
    this.landHit = this.firstHit = null;
    this.landPush.fill(0);
    this.landDone.fill(0);
    this.launched = true;
    this.pitch -= Math.atan(this.gradeF);
    this.roll += Math.atan(this.gradeL);
    this.still = false;
    // a kick that turns one end or side into the road: the road pushes back at once, and it
    // pivots about the tyres there (no hit: they were on the road already)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.groundContact(PARAMS.substeps / 120, this.vel.x * sin + this.vel.z * cos, sin, cos, true);
  }

  /**
   * Back on the tyres after a flight (the landing's hits, damage and rebound happen as the car
   * comes down: groundContact). vyImpact: the hardest hit's speed into the road (m/s);
   * pitchRel, rollRel: the car's attitude against the road at that hit.
   */
  onLand(vyImpact, pitchRel, rollRel) {
    this.airborne = false;
    this.air = 0;
    this.vy = 0;
    this.pitchRate = 0;
    this.rollRate = 0;
    // pitch and roll are the suspension's tilt against the road again
    this.pitch = this.tiltPitch();
    this.roll = this.tiltRoll();
  }

  /**
   * In the air: the car's GROUND points against the road (see AIR). Each point that is in the
   * road and moving into it gets an impulse up, with the car's mass and pitch and roll inertia
   * (a few passes, so several points share a flat landing); a hard landing rebounds a little,
   * and a floor or wing tip sliding on the road scrapes speed off. Each hit damages what it
   * landed on, and hands the car back to the tyres once it has settled on them. quiet: only
   * the pushes (at a launch: no hits, no damage, no settling).
   */
  groundContact(h, vx, sin, cos, quiet = false) {
    const P = PARAMS, A = AIR, m = P.mass;
    // the attitude against the road, and how fast the road under the car rises or falls
    const pRel = this.pitch + Math.atan(this.gradeF), rRel = this.roll - Math.atan(this.gradeL);
    const sp = Math.sin(pRel), sr = Math.sin(rRel), cp = Math.cos(this.pitch), cr = Math.cos(this.roll);
    const vRoad = vx * this.gradeF + (this.vel.x * cos - this.vel.z * sin) * this.gradeL;
    // the road under a point: along the slope, and curving up ahead and behind in a dip
    // (vcurv > 0) or away over a crest
    const height = (g) => this.air + g.h - sp * g.x + sr * g.y - 0.5 * this.vcurv * g.x * g.x;
    const speed = (g) => this.vy - cp * this.pitchRate * g.x + cr * this.rollRate * g.y - vRoad; // + = up
    const touching = (this.touching ??= []);
    touching.length = 0;
    for (const g of GROUND) {
      if (boxGone(this, g.def)) continue;
      const depth = -height(g);
      const vin = -speed(g); // into the road
      // at a launch the tyres are all on the road (pitch and roll are only the suspension's tilt)
      const reach = quiet && g.wheel !== null ? A.travel : 0;
      if (depth >= -reach && vin > 0) touching.push({ g, depth: Math.max(0, depth), vin, J: 0 });
    }
    // a hard landing: the tyres not quite down yet take their share through the suspension
    if (touching.length) {
      for (const g of GROUND) {
        if (g.wheel === null || touching.some((c) => c.g === g)) continue;
        const vin = -speed(g);
        if (vin > 1 && height(g) < A.travel) touching.push({ g, depth: 0, vin, J: 0 });
      }
    }
    this.contacts = touching.length;
    for (const w of this.wheels) w.load = 0;
    if (!quiet) {
      // each tyre's push over the last landWindow, and what its damage has covered, fading
      const fade = Math.exp(-h / A.landWindow);
      for (let c = 0; c < 4; c++) {
        this.landPush[c] *= fade;
        this.landDone[c] *= fade;
      }
    }
    if (!touching.length) return;

    // impulses: each point stops going into the road (or rebounds, if it hit hard)
    // (sequential impulses: each point's total push may be taken back by later passes, as
    // long as it stays a push, so several points share it instead of one overshooting)
    // (alternating the order each pass, so no point takes more for coming first)
    for (let pass = 0; pass < 8; pass++) {
      for (let k = 0; k < touching.length; k++) {
        const c = touching[pass % 2 ? touching.length - 1 - k : k];
        const g = c.g;
        const target = c.vin > A.bounceSpeed ? A.bounce * c.vin : 0;
        const ax = g.x * cp, ay = g.y * cr;
        const total = Math.max(0, c.J + (target - speed(g)) / (1 / m + (ax * ax) / P.pitchInertia + (ay * ay) / P.rollInertia));
        const J = total - c.J;
        if (J === 0) continue;
        this.vy += J / m;
        this.pitchRate -= (J * ax) / P.pitchInertia; // pushed up ahead of the CoG: nose up (−)
        this.rollRate += (J * ay) / P.rollInertia; // pushed up on the left: left up (+)
        c.J = total;
      }
    }
    if (quiet) return;
    // out of the road, and what each point felt
    let lift = 0, worst = null;
    const tilt = Math.max(Math.abs(pRel), Math.abs(rRel));
    for (const c of touching) {
      const g = c.g;
      lift = Math.max(lift, c.depth);
      if (g.wheel !== null) this.wheels[g.wheel].load = c.J / h;
      else {
        // the floor or a wing tip scraping along the road
        const v = Math.hypot(this.vel.x, this.vel.z);
        if (v > 0) {
          const dv = Math.min(v, (A.scrape * c.J) / m);
          this.vel.x -= (this.vel.x / v) * dv;
          this.vel.z -= (this.vel.z / v) * dv;
        }
      }
      // a tyre: how hard its suspension was hit, the push it took as the speed of a quarter of
      // the car landing on it (a flat landing: the speed it came down at; a nose slapping down
      // as the car pivots on its rear wheels: less than the nose's own speed, since only the
      // car's turn about the rear wheels is stopped), less the rebound's share. The tail or
      // a wing tip breaks from the speed it hits the road at.
      if (g.wheel !== null) this.landPush[g.wheel] += c.J / (c.vin > A.bounceSpeed ? 1 + A.bounce : 1);
      else if (this.damageOn) this.damage.landing(g, c.vin, tilt);
      if (!worst || c.vin > worst.vin) worst = c;
    }
    // each tyre's hit: its push over the window (the anti-roll bars share it with the other
    // tyre on its axle), as the speed of a quarter of the car; damage for what it adds to the
    // part already charged for (in steps big enough to count)
    if (this.damageOn) {
      const push = this.landPush, done = this.landDone, q = m / 4;
      for (let c = 0; c < 4; c++) {
        const hit = ((1 - DAMAGE.landShare) * push[c] + DAMAGE.landShare * push[c ^ 1]) / q;
        if (hit - done[c] / q < 0.15) continue;
        this.damage.landing(GROUND[c], hit, tilt, done[c] / q);
        done[c] = hit * q;
      }
    }
    this.air += lift;
    if (worst.vin > (this.landHit?.v ?? 0)) this.landHit = { v: worst.vin, pitchRel: pRel, rollRel: rRel };
    this.firstHit ??= { v: worst.vin, pitchRel: pRel, rollRel: rRel };
    if (worst.vin > this.impact) {
      // for the sound: the hit, and on which side (level: both)
      this.impact = worst.vin;
      this.impactSide = Math.abs(rRel) < A.settleTilt ? 0 : Math.sign(worst.g.y);
    }

    // settled on the tyres: both axles on the road, about flat against it, and still
    const near = (c) => height(GROUND[c]) < A.settleGap;
    if ((near(0) || near(1)) && (near(2) || near(3)) && Math.abs(pRel) < A.settleTilt && Math.abs(rRel) < A.settleTilt
      && Math.abs(this.vy - vRoad) < A.settleSpeed
      && Math.abs(this.pitchRate) < A.settleRate && Math.abs(this.rollRate) < A.settleRate) {
      const hit = this.landHit ?? { v: 0, pitchRel: pRel, rollRel: rRel };
      this.onLand(hit.v, hit.pitchRel, hit.rollRel);
    }
  }

  /** A sub-step in the air: ballistic, with drag and aero, and no tyre forces. */
  substepAir(h) {
    const P = PARAMS, A = AIR;
    const m = P.mass;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const vx = this.vel.x * sin + this.vel.z * cos;
    const qd = 0.5 * RHO * vx * vx;
    const da = this.dmgAero;
    // angle of attack: how far the nose is up from the flight path
    const gamma = Math.atan2(this.vy, Math.max(Math.abs(vx), 1));
    const aoa = -this.pitch - gamma;
    const ge = 1 / (1 + (Math.max(0, this.air) / A.groundEffect) ** 2);
    const shape = clamp(1 - aoa / A.liftAngle, -A.maxLift, 1); // 1 = full downforce, < 0 = lift
    const downforce = qd * P.ClA * da.floor * (1 - A.floorShare + A.floorShare * ge) * shape;
    this.downforce = downforce;
    // drag opposes the motion (a car yawing in the air no longer points where it goes)
    const v = Math.hypot(this.vel.x, this.vel.z);
    const k = (0.5 * RHO * v * P.CdA * da.drag) / m; // drag / (m v)
    const ex = -k * v * Math.sign(vx); // felt along the car, for the load transfer on landing

    // straight on, slowing with drag. The yaw rate carries on, but at speed the airflow turns
    // the heading towards the direction of travel (sideslip: + = moving to the car's left)
    this.vel.x -= k * this.vel.x * h;
    this.vel.z -= k * this.vel.z * h;
    const slip = Math.atan2(this.vel.x * cos - this.vel.z * sin, this.vel.x * sin + this.vel.z * cos);
    this.yawRate += (A.yawStiff * 0.5 * RHO * v * v * slip - A.yawDamp * v * this.yawRate) * h;
    this.yaw += this.yawRate * h;
    this.position.x += this.vel.x * h;
    this.position.z += this.vel.z * h;
    this.vy += (-G - downforce / m) * h;
    this.air += this.vy * h;

    // pitch and roll: slow damping, and the airflow turning the nose to the flight path
    this.pitchRate += (A.pitchStiff * qd * aoa - A.rateDamp * this.pitchRate) * h;
    this.rollRate -= A.rateDamp * this.rollRate * h;
    this.pitch += this.pitchRate * h;
    this.roll += this.rollRate * h;
    if (Math.abs(this.pitch) >= A.cap) {
      this.pitch = Math.sign(this.pitch) * A.cap;
      if (this.pitchRate * this.pitch > 0) this.pitchRate = 0;
    }
    if (Math.abs(this.roll) >= A.cap) {
      this.roll = Math.sign(this.roll) * A.cap;
      if (this.rollRate * this.roll > 0) this.rollRate = 0;
    }

    // the wheels spin freely and carry no load
    for (const w of this.wheels) {
      w.load = 0;
      w.fy = 0;
      w.slide = 0;
      w.slipPower = 0;
      w.rollSpeed = 0;
    }
    const ks = 1 - Math.exp(-h / 0.04);
    this.longAccel += (ex - this.longAccel) * ks;
    this.latAccel += (0 - this.latAccel) * ks;

    this.groundContact(h, vx, sin, cos);
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
    // damage: the floor scales all downforce, the rear wing the rear's, and each front
    // wing half its side's front downforce
    const dmg = this.damage;
    const da = this.dmgAero;
    const downforce = qd * P.ClA * (1 - aeroLoss) * da.floor;
    const lossL = dmg.wingLoss(0) * DAMAGE.wingAeroShare, lossR = dmg.wingLoss(1) * DAMAGE.wingAeroShare;
    const aeroF = (downforce * P.aeroBalance) / 2;
    const aeroFL = aeroF * (1 - lossL), aeroFR = aeroF * (1 - lossR);
    const aeroR = downforce * (1 - P.aeroBalance) * da.rear;
    const drag = qd * P.CdA * da.drag * Math.sign(vx);
    this.downforce = aeroR + aeroFL + aeroFR;

    // vertical loads: weight (less on a slope, more in a dip, less over a crest)
    // + aero + load transfer (from last step's accelerations)
    const g = this.gradeF * this.gradeF + this.gradeL * this.gradeL;
    const gN = Math.max(0, G / Math.sqrt(1 + g) + (vx * vx + vy * vy) * this.vcurv);
    const ax = this.longAccel, ay = this.latAccel;
    const longT = (m * ax * P.cgHeight) / L; // + = onto the rear
    const latT = (m * ay * P.cgHeight) / (2 * D.track); // + = onto the right
    const front = (m * gN * B_REAR) / L - longT; // mechanical; aero added per side below
    const rear = (m * gN * A_FRONT) / L + aeroR + longT;
    const latF = latT * P.rollStiffFront, latR = latT * (1 - P.rollStiffFront);
    const loads = [front / 2 + aeroFL - latF, front / 2 + aeroFR + latF, rear / 2 - latR, rear / 2 + latR];

    // per-wheel load and grip; also what each tyre can take longitudinally,
    // given the cornering force it is already making (friction ellipse)
    const W = this.wheels;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const S = w.surface;
      let fz = Math.max(0, loads[i]);
      if (S.bump) fz *= 1 + S.bump * Math.sin((w.dist / S.bumpWavelength) * Math.PI * 2) * Math.min(Math.abs(vx) / 8, 1);
      w.load = fz;
      const c = this.compound;
      w.damage = dmg.tyre[i];
      w.susp = dmg.suspension[i];
      w.toe = Math.sign(w.y) * DAMAGE.suspToe * w.susp; // bent arm: the wheel toes out
      w.grip = c.grip * tempGrip(w.temp, c.tOpt) * (1 - TYRE.dirtGripLoss * w.dirt) * wearGrip(w.wear)
        * (1 - DAMAGE.tyreGripLoss * w.damage) * (1 - DAMAGE.suspGripLoss * w.susp) * (w.front ? 1 : P.rearGrip);
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
        const pw = da.power; // engine / gearbox damage, overheating from crushed sidepods
        axleTorque = this.throttle * pw * Math.min(P.maxAxleTorque, (P.power * P.drivetrainEff * D.rearRadius) / wheelV);
        if (this.tc) axleTorque = Math.min(axleTorque, (W[2].capX + W[3].capX) * D.rearRadius) * this.tcGain;
      } else brakeForce = Math.max(brakeForce, P.maxBrakeForce * 0.5 * this.throttle); // throttle while rolling back = brake
    } else if (wRear > 1) axleTorque = -P.engineBrake;
    if (this.brake > 0 && vx <= 0.5 && this.throttle === 0 && !this.parked && this.reverseArmed) {
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
      const delta = (w.front ? this.steerAngle : 0) + w.toe;
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
      // anti-lock brakes: cap pressure at what this tyre can take,
      // keeping some grip in reserve for cornering while the driver steers
      if (this.abs && tBrake > 0) {
        const reserve = Math.abs(this.steerInput) * (w.front ? P.brakeSteerReserveFront : P.brakeSteerReserveRear);
        const cap = w.capX * w.r * (1 - reserve);
        if (tBrake > cap) {
          tBrake = cap;
          this.absActive = true;
        }
      }
      const I = w.front ? P.wheelInertiaFront : P.wheelInertiaRear;

      // semi-implicit wheel spin: linearise Fx(ω) about the current ω
      const kap0 = (w.omega * w.r - wvx) / den;
      const f0 = tyreForce(S, kap0, tanA, fz, grip).fx;
      const eps = 1e-3;
      const f1 = tyreForce(S, kap0 + eps, tanA, fz, grip).fx;
      const dFdOmega = Math.max(0, (f1 - f0) / eps) * (w.r / den);
      const crr = rollingCoef(S, wvx) + DAMAGE.tyreCrr * w.damage + DAMAGE.suspCrr * w.susp;
      const rollT = crr * fz * w.r * Math.tanh(w.omega * w.r / 0.5);
      const Ieff = I + h * w.r * w.r * dFdOmega;
      let om = w.omega + (h * (tDrive - f0 * w.r - rollT)) / Ieff;
      // brakes oppose rotation but cannot reverse it within a step
      const dB = (tBrake * h) / Ieff;
      if (Math.abs(om) <= dB) om = 0;
      else om -= Math.sign(om) * dB;
      // with ABS the wheels never lock: braking can't slow a wheel past peak-grip slip
      if (this.abs && tBrake > 0 && wvx > 0.5) {
        const minOmega = (wvx * (1 - S.peakKappa)) / w.r;
        if (om < minOmega) {
          om = Math.min(minOmega, w.omega + (h * (tDrive - f0 * w.r - rollT)) / Ieff);
          this.absActive = true;
        }
      }
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

      // traction control cuts torque on wheelspin
      if (!w.front && kappa > 0 && tf.slide > 1.1) spin = Math.max(spin, tf.slide);

      // rolling resistance acts along the wheel against its motion
      const fRoll = -crr * fz * Math.tanh(wvx / 0.5);
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

  /** Road height and slope under the car, along the track and across any banking. */
  sampleSlope() {
    const T = this.track;
    const s = this.trackS;
    this.height = T.heightAt(s, this.lateral);
    const grade = T.gradeAt(s), bank = T.bankAt(s, this.lateral);
    const i = this.trackIndex;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // the slope: along the track tangent, plus the banking across it; onto the car's axes
    const gx = grade * T.tx[i] + bank * T.leftX(i), gz = grade * T.tz[i] + bank * T.leftZ(i);
    this.gradeF = sin * gx + cos * gz;
    this.gradeL = cos * gx - sin * gz;
    // a banked turn presses the car into the road: v² k sin(bank) of extra load, like a dip
    // (the down-slope pull of gradeL supplies the rest of what makes banking fast)
    const k = T.curvature[i];
    this.vcurv = T.vcurvAt(s) + (-Math.sign(bank * k) * Math.abs(bank * k)) / Math.hypot(1, bank);
  }

  /** Which surface each tyre's contact patch is on. */
  classifyWheels(i0) {
    const T = this.track, pit = T.pit;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const counts = { asphalt: 0, kerb: 0, grass: 0, gravel: 0, sausage: 0, runoff: 0 };
    for (const w of this.wheels) {
      const wx = this.position.x + sin * w.x + cos * w.y;
      const wz = this.position.z + cos * w.x - sin * w.y;
      // the nearest centreline sample is within a sample or two of the CoG's
      const along = (wx - T.px[i0]) * T.tx[i0] + (wz - T.pz[i0]) * T.tz[i0];
      const i = T.wrap(i0 + Math.round(along / T.ds));
      const lat = (wx - T.px[i]) * T.leftX(i) + (wz - T.pz[i]) * T.leftZ(i);
      let s = T.surfaceAt(i, lat);
      if ((s === 'grass' || s === 'gravel' || s === 'runoff') && pit && this.pitIndex >= 0) {
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
    this.surface = counts.gravel >= 2 ? 'gravel' : counts.grass + counts.gravel >= 2 ? 'grass'
      : counts.sausage >= 1 ? 'sausage' : counts.runoff >= 2 ? 'runoff' : counts.kerb >= 2 ? 'kerb' : 'asphalt';
  }

  /** Tread temperature and grass contamination, per wheel. */
  updateTyreState(dt) {
    const v = Math.abs(this.speed);
    for (const w of this.wheels) {
      const heat = TYRE.slipHeat * (w.slipPower || 0) + TYRE.flexHeat * w.load * (w.rollSpeed || 0);
      let cool = (TYRE.coolBase + TYRE.coolSpeed * v) * (w.temp - TYRE.tAmbient);
      if (w.surface === SURFACES.grass || w.surface === SURFACES.gravel) cool += TYRE.coolGrass * (w.temp - TYRE.tAmbient);
      w.temp += ((heat - cool) / (TYRE.heatCapacity * (1 - TYRE.wornHeat * w.wear))) * dt;
      const d = (w.rollSpeed || 0) * dt;
      if (w.surface.dirt > 0) w.dirt += (1 - w.dirt) * Math.min(1, w.surface.dirt * d);
      else w.dirt *= Math.exp(-d / TYRE.dirtCleanLength);
      const scrub = 1 + TYRE.wearSlide * Math.max(0, w.slide - 0.8);
      w.wear = Math.min(1, w.wear + (d / 1000) * this.compound.wear * this.wearScale * scrub);
    }
  }

  /**
   * The car's collision boxes (carShape.js) against the barrier segments (track walls, pit
   * wall, pit lane walls). Each box is swept from where it was at the start of the step
   * (prevPos, heading yaw0), so a fast car can't skip through a wall in one step and the
   * nose and wings are swept along their own arc while the car turns. The deepest contact
   * of any box pushes the car out and bounces it.
   */
  collideWalls(yaw0 = this.yaw) {
    const T = this.track;
    const p = this.position;
    const pose = (this.prevPose ??= { position: null, yaw: 0, height: 0 });
    pose.position = this.prevPos;
    pose.yaw = yaw0;
    pose.height = this.height;
    const prev = carBoxes(pose, (this.prevBoxes ??= []));
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const boxes = carBoxes(this);
      let best = null;
      for (let k = 0; k < boxes.length; k++) {
        const b = boxes[k], from = hit ? b : prev[k];
        if (boxGone(this, b.def)) continue; // it broke off: nothing there to hit the wall
        const c = T.wallContactBox(b, from.cx, from.cz, this.height);
        if (c && (!best || c.depth > best.depth)) best = c;
      }
      if (!best) break;
      hit = true; // later contacts sweep from where this one left the car
      this.wallImpact(best.nx, best.nz, best.depth); // normal pointing into the wall
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
    this.scrape = Math.max(this.scrape, Math.abs(this.vel.z * nx - this.vel.x * nz));
    if (vr > 0) {
      if (vr > this.impact) {
        this.impact = vr;
        this.impactSide = nx * Math.cos(this.yaw) - nz * Math.sin(this.yaw);
      }
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
      // which way the wall faces the car decides which front parts take the hit
      if (this.damageOn) {
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        this.damage.impact(nx * sin + nz * cos, nx * cos - nz * sin, vr);
      }
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
