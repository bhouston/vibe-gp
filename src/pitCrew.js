// Pit crews: a tyre crew in team kit standing ready in every team's pit box, and the
// player's crew animating the stop. Per box: a wheel gunner, an "off" man (takes the
// old wheel away) and an "on" man (holding the new one) at each corner, plus front and
// rear jack men, and four wing men who stand by in the garage: two to pull a damaged
// front wing off and two to fit the new one when a wing change is ordered: 18 people.
//
// Everybody is drawn with a handful of InstancedMeshes (one per body part, tinted per
// instance in team colours). A single scratch skeleton of Object3Ds is posed for each
// person in turn and its part matrices copied into the instance buffers, so the whole
// pit lane costs about twenty draw calls however many crews there are.
import * as THREE from 'three/webgpu';
import { boxGeometry, sphereGeometry, discX } from './geometry.js';
import { tyreGeometry } from './carGeometry.js';
import { tyreMaterial, simpleMaterial } from './materials.js';
import { garageTeam } from './teams.js';
import { CAR_DIMS } from './car.js';
import { COMPOUND_LIST } from './tyres.js';

const D = CAR_DIMS;
const LIFT = 0.06; // m the jacks raise the car
const TYRE_R = 0.35, TYRE_W = 0.36; // the crew's spare tyres (one size for both axles)
const NOSE_JACK = 3.0, REAR_JACK = -2.75; // car-frame z of the jacking points
// corners in the car's wheel order (car.js): +x is the car's left
const CORNERS = [
  { sx: 1, az: D.frontAxle, r: D.frontRadius, dz: 1 },
  { sx: -1, az: D.frontAxle, r: D.frontRadius, dz: 1 },
  { sx: 1, az: D.rearAxle, r: D.rearRadius, dz: -1 },
  { sx: -1, az: D.rearAxle, r: D.rearRadius, dz: -1 },
];
const JITTER = [0, 0.025, 0.04, 0.015]; // the four corners don't work in lock-step
const LEG = 0.45; // thigh and shin length
const PEOPLE = 18; // per crew
// front wing change (seconds into the stop; see WING_CHANGE in pitStop.js)
const WING = { z: 2.62, y: 0.13, carryY: 0.5, floorY: 0.11, reach: 0.75, halfSpan: 0.7 }; // car frame, wing centre
const W_OFF = 1.5, W_LIFT = 2.2, W_AWAY = 3.4, W_DOWN = 4.0; // old wing: unclipped, lifted clear, at the garage, on the floor
const W_IN = 2.4, W_ARRIVE = 4.0, W_ON = 5.4, W_DONE = 6.6; // new wing: sets off, at the nose, on the car, clipped in
const TYRE_HOLD = 0.85; // tyre-stop progress the crew waits at (car on the jacks) until the wing is on

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Poses: [lean, head, legs (hip, knee) x2, arms (swing, spread, elbow) x2]. Angles in
 * radians; a negative hip / arm swing is forward, a positive knee bends it back, a
 * negative elbow folds the forearm forward. Arm swing is measured from straight down
 * in the world, not the leaning torso.
 */
const pose = (lean, legs, arms, head = 0) => Float32Array.of(lean, head, ...legs, ...(arms.length === 3 ? [...arms, ...arms] : arms));
const POSE = {
  stand: pose(0.04, [0, 0.05, 0, 0.05], [0.05, 0.12, -0.2]),
  crouch: pose(0.5, [-1.0, 1.4, -0.55, 1.2], [-0.55, 0.06, -0.7], 0.2),
  kneel: pose(0.5, [-1.5, 1.5, 0.05, 1.55], [-0.4, 0.06, -0.65], 0.3),
  carry: pose(0.06, [0, 0.05, 0, 0.05], [-0.7, 0.32, -0.75]),
  carryLow: pose(0.55, [-1.1, 1.5, -0.6, 1.3], [-0.95, 0.3, -0.35], 0.3),
  grab: pose(0.6, [-1.15, 1.6, -0.6, 1.35], [-1.0, 0.28, -0.3], 0.3),
  jackReady: pose(0.12, [-0.25, 0.3, 0.15, 0.1], [-0.65, 0.12, -0.55]),
  jackPull: pose(0.4, [-0.7, 1.0, 0.35, 0.25], [-0.25, 0.12, -0.2], 0.2),
  signal: pose(0.02, [0, 0.05, 0, 0.05], [-2.9, 0.15, -0.15, -0.35, 0.1, -0.7]),
};

/** Instanced copies of one part: matrices (and colours) refilled every frame. */
class Pool {
  constructor(geo, mat, cap, colors = false) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false; // spread along the whole lane: cull nothing
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    if (colors) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.n = 0;
  }

  push(m, col) {
    if (this.n >= this.cap) return;
    this.mesh.setMatrixAt(this.n, m);
    if (col && this.mesh.instanceColor) this.mesh.setColorAt(this.n, col);
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.n = 0;
  }
}

/** Scratch skeleton, posed once per person per frame. */
class Rig {
  constructor() {
    const node = (parent, x = 0, y = 0, z = 0) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent?.add(o);
      return o;
    };
    this.root = node(null);
    this.hips = node(this.root);
    this.spine = node(this.hips);
    this.neck = node(this.spine, 0, 0.6, 0);
    this.arms = [1, -1].map((sx) => {
      const sh = node(this.spine, sx * 0.24, 0.5, 0);
      const el = node(sh, 0, -0.29, 0);
      const hand = node(el, 0, -0.28, 0);
      return { sx, sh, el, hand };
    });
    this.legs = [1, -1].map((sx) => {
      const hip = node(this.hips, sx * 0.1, 0, 0);
      const knee = node(hip, 0, -LEG, 0);
      const ankle = node(knee, 0, -LEG, 0);
      return { hip, knee, ankle };
    });
    // [pool key, joint, centre offset]
    this.parts = [
      ['pelvis', this.hips, [0, 0.02, 0]],
      ['torso', this.spine, [0, 0.3, 0]],
      ['stripe', this.spine, [0, 0.38, 0]],
      ['helmet', this.neck, [0, 0.12, 0]],
      ['visor', this.neck, [0, 0.13, 0.12]],
      ...this.arms.flatMap((a) => [['upperArm', a.sh, [0, -0.145, 0]], ['foreArm', a.el, [0, -0.135, 0]], ['glove', a.hand, [0, -0.04, 0]]]),
      ...this.legs.flatMap((l) => [['thigh', l.hip, [0, -0.225, 0]], ['shin', l.knee, [0, -0.225, 0]], ['shoe', l.ankle, [0, -0.015, 0.06]]]),
    ].map(([key, joint, off]) => ({ key, node: node(joint, ...off) }));
  }

  /** Pose the skeleton: p is a POSE array, walk = [phase, amplitude]. */
  apply(p, walk, carrying) {
    const [phase, amp] = walk;
    const lean = p[0];
    this.spine.rotation.x = lean;
    this.neck.rotation.x = p[1] - lean * 0.7; // keep looking at the job
    let hipY = 0;
    this.legs.forEach((l, i) => {
      const sw = amp * 0.55 * Math.sin(phase + i * Math.PI);
      const a = p[2 + i * 2] + sw;
      const b = p[3 + i * 2] + amp * 0.7 * Math.max(0, Math.sin(phase + i * Math.PI + 1.2));
      l.hip.rotation.x = a;
      l.knee.rotation.x = b;
      l.ankle.rotation.x = -(a + b); // foot flat
      // lowest point of this leg: the sole, or the knee when kneeling
      hipY = Math.max(hipY, LEG * Math.cos(a) + LEG * Math.cos(a + b) + 0.05, LEG * Math.cos(a) + 0.065);
    });
    this.hips.position.y = hipY;
    this.arms.forEach((arm, i) => {
      const k = 6 + i * 3;
      const sw = carrying ? 0 : -amp * 0.4 * Math.sin(phase + i * Math.PI);
      arm.sh.rotation.set(p[k] + sw - lean, 0, arm.sx * p[k + 1]);
      arm.el.rotation.x = p[k + 2];
    });
    this.root.updateMatrixWorld(true);
  }
}

export class PitCrews {
  /** One crew per team garage of the lane (pit = track.path.pit, may be null). */
  constructor(pit) {
    this.group = new THREE.Group();
    this.crews = [];
    this.lift = 0; // player's car: jack height, wheels on the car, compound shown
    this.wheelOn = [true, true, true, true];
    this.carCompound = null;
    this.wingMode = 'car'; // player's front wing: 'car' (as damaged), 'off' (removed), 'new'
    this.wingProps = { old: null, fresh: null, stop: 0 }; // world matrices of the wings the crew handles
    this._wingStops = 0;
    if (!pit || !pit.garageCount) return;

    this.rig = new Rig();
    for (let k = 0; k < pit.garageCount; k++) {
      const team = garageTeam(k);
      if (!team) continue;
      const b = pit.box(k);
      const crew = {
        k,
        box: b,
        mat: new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.y, b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw), new THREE.Vector3(1, 1, 1)),
        o: pit.outer, // garage side in box coordinates (+x = lane's left)
        colors: {
          suit: new THREE.Color(team.ui.primary),
          helmet: new THREE.Color(team.ui.secondary),
          stripe: new THREE.Color(team.ui.accent),
        },
        spare: COMPOUND_LIST[k % 3], // what the other teams have on their blankets
        people: [],
        ground: [], // old tyres left on the floor after a stop
        oldWing: null, // box coordinates of a removed front wing left on the floor
        svc: null,
        post: null,
      };
      let seed = k * 7.31;
      const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      const add = (role, c = -1) => {
        const p = { role, c, x: 0, z: 0, yaw: 0, pose: POSE.stand.slice(), low: 0, v: 0, phase: rand() * 6.3, idle: rand() * 6.3, tyre: null, spin: 0, foot: null, placed: false };
        crew.people.push(p);
      };
      for (let c = 0; c < 4; c++) for (const role of ['gun', 'off', 'on']) add(role, c);
      add('jackF');
      add('jackR');
      for (let c = 0; c < 2; c++) for (const role of ['wingOff', 'wingOn']) add(role, c);
      this.crews.push(crew);
    }
    const people = this.crews.length * PEOPLE;

    const suit = simpleMaterial(0xffffff, 0.75);
    const helmet = simpleMaterial(0xffffff, 0.28, 0.1);
    const dark = simpleMaterial(0x121315, 0.65);
    const visor = simpleMaterial(0x07080a, 0.08, 0.7);
    const gun = simpleMaterial(0x2b2d31, 0.35, 0.7);
    const metal = simpleMaterial(0xb9bdc4, 0.35, 0.8);
    const rim = simpleMaterial(0x8f9399, 0.3, 0.85);
    this.materials = [suit, helmet, dark, visor, gun, metal, rim];
    const tyres = people * 2; // held tyres plus the old set on the floor, per compound at most
    this.pools = {
      pelvis: new Pool(boxGeometry(0.34, 0.2, 0.22), suit, people, true),
      torso: new Pool(boxGeometry(0.42, 0.5, 0.25), suit, people, true),
      stripe: new Pool(boxGeometry(0.43, 0.07, 0.26), suit, people, true),
      helmet: new Pool(sphereGeometry(0.135, 16, 10, [1, 1.05, 1.1]), helmet, people, true),
      visor: new Pool(boxGeometry(0.2, 0.07, 0.06), visor, people),
      upperArm: new Pool(boxGeometry(0.1, 0.29, 0.11), suit, people * 2, true),
      foreArm: new Pool(boxGeometry(0.09, 0.27, 0.09), suit, people * 2, true),
      glove: new Pool(boxGeometry(0.09, 0.1, 0.07), dark, people * 2),
      thigh: new Pool(boxGeometry(0.15, 0.45, 0.16), suit, people * 2, true),
      shin: new Pool(boxGeometry(0.12, 0.45, 0.13), suit, people * 2, true),
      shoe: new Pool(boxGeometry(0.11, 0.07, 0.27), dark, people * 2),
      gun: new Pool(boxGeometry(0.09, 0.12, 0.3), gun, people),
      jackBar: new Pool(boxGeometry(0.045, 0.045, 1), metal, people),
      jackFoot: new Pool(boxGeometry(0.3, 0.1, 0.36), dark, people),
      rim: new Pool(discX(TYRE_R * 0.63, TYRE_W * 0.42, 24), rim, tyres),
    };
    const tyreGeo = tyreGeometry(TYRE_R, TYRE_W, 0.63, 48);
    this.tyrePools = new Map(COMPOUND_LIST.map((c) => {
      const m = tyreMaterial(TYRE_R, c.hex);
      this.materials.push(m);
      return [c, new Pool(tyreGeo, m, tyres)];
    }));
    for (const p of [...Object.values(this.pools), ...this.tyrePools.values()]) this.group.add(p.mesh);

    // scratch
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /** Box coordinates (x = lane's left, z = along) of a point in a car frame {x, z, yaw}. */
  static toBox(f, cx, cz) {
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    return [f.x + cx * c + cz * s, f.z - cx * s + cz * c];
  }

  /**
   * Advance the crews. `pitStop` and `car` (the physics state) are the player's; their
   * crew works garage `playerK`. Afterwards lift / wheelOn / carCompound say how to draw
   * the player's car.
   */
  update(dt, time, pitStop, car, playerK) {
    this.lift = 0;
    this.wheelOn.fill(true);
    this.carCompound = null;
    this.wingMode = 'car';
    this.wingProps.old = this.wingProps.fresh = null;
    if (!this.crews.length) return;
    for (const crew of this.crews) {
      const player = crew.k === playerK;
      if (player) this.trackStop(crew, dt, pitStop, car);
      else crew.svc = crew.post = null;
      const active = player && (crew.svc || ['approach', 'inBox'].includes(pitStop.state));
      const next = player ? pitStop.nextCompound : crew.spare;
      // the wing crew: the plan for both wings, which the four wing men follow
      crew.wing = this.wingPlan(crew, player && pitStop.nextWing, active);
      if (player) this.wingOutputs(crew);
      for (const p of crew.people) this.move(crew, p, this.target(crew, p, active, next), dt, time);
    }
    this.draw(time);
  }

  /**
   * Where the old and the new front wing are (car frame of the stop: x, y, z of the wing's
   * centre, or null) and what the wing men do. ordered: the player wants a new wing at
   * the next stop, so the fitters stand by holding one.
   */
  wingPlan(crew, ordered, active) {
    const svc = crew.svc;
    const o = crew.o;
    const onCar = { x: 0, y: WING.y + this.lift, z: WING.z };
    const hold = { x: o * 3.4, y: WING.carryY, z: 5.6 }; // the spare, in the garage mouth
    const drop = { x: o * 3.4, y: WING.floorY, z: 3.9 }; // where the old wing is put down
    const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
    const plan = { old: null, fresh: null, oldMen: null, freshMen: null };
    if (svc?.wing) {
      const e = svc.e;
      // old wing: unclip, lift it forward clear of the nose, carry it to the garage, put it down
      const lifted = { x: 0, y: WING.carryY, z: 3.9 }, away = { x: drop.x, y: WING.carryY, z: drop.z };
      if (e < W_OFF) plan.oldMen = { at: onCar, pose: e < 0.3 ? 'crouch' : 'grab' };
      else if (e < W_LIFT) plan.old = lerp(onCar, lifted, smooth(W_OFF, W_LIFT, e));
      else if (e < W_AWAY) plan.old = lerp(lifted, away, smooth(W_LIFT, W_AWAY, e));
      else plan.old = lerp(away, drop, smooth(W_AWAY, W_DOWN, e));
      if (plan.old) plan.oldMen = { at: plan.old, pose: e < W_DOWN ? 'carryLow' : 'stand' };
      // new wing: from the garage to the nose, slid on, clipped in, then the fitters step back
      const nose = { x: 0, y: WING.carryY, z: 3.6 };
      if (e < W_IN) plan.fresh = hold;
      else if (e < W_ARRIVE) plan.fresh = lerp(hold, nose, smooth(W_IN, W_ARRIVE, e));
      else if (e < W_ON) plan.fresh = lerp(nose, onCar, smooth(W_ARRIVE, W_ON, e));
      plan.freshMen = plan.fresh
        ? { at: plan.fresh, pose: 'carryLow' }
        : { at: e < W_DONE ? onCar : { ...onCar, z: onCar.z + 0.4 }, pose: e < W_DONE ? 'grab' : 'stand' };
      return plan;
    }
    if (ordered) {
      plan.fresh = hold;
      plan.freshMen = { at: hold, pose: 'carryLow' };
      if (active) plan.oldMen = { at: { ...onCar, z: onCar.z + 0.25 }, pose: 'crouch' }; // ready at the nose
    }
    return plan;
  }

  /** The player's wing state for the car (wingMode) and the props (wingProps, world matrices). */
  wingOutputs(crew) {
    const svc = crew.svc, plan = crew.wing;
    if (svc?.wing) this.wingMode = svc.e < W_OFF ? 'car' : svc.e < W_ON ? 'off' : 'new';
    const f = svc ? svc.frame : { x: 0, z: 0, yaw: 0 };
    const at = (w, x, z, yaw) => new THREE.Matrix4().compose(
      this.toWorld(crew, x, w.y, z, new THREE.Vector3()),
      this._q.setFromAxisAngle(this._up, crew.box.yaw + yaw),
      this._s,
    );
    const inFrame = (w) => at(w, ...PitCrews.toBox(f, w.x, w.z), f.yaw);
    if (plan.old) this.wingProps.old = inFrame(plan.old);
    else if (crew.oldWing) this.wingProps.old = at({ y: WING.floorY }, crew.oldWing.x, crew.oldWing.z, crew.oldWing.yaw);
    if (plan.fresh) this.wingProps.fresh = inFrame(plan.fresh);
    this.wingProps.stop = this._wingStops;
  }

  /** Follow the player's stop: start (car frame, old compound), progress, and the release. */
  trackStop(crew, dt, pitStop, car) {
    if (pitStop.state === 'service') {
      if (!crew.svc) {
        const o = pitStop.offset(car);
        crew.svc = { frame: { x: o.across, z: o.along, yaw: o.yaw }, old: car.compound, fit: pitStop.fitting, u: 0, e: 0, wing: pitStop.changingWing };
        crew.ground.length = 0;
        if (crew.svc.wing) {
          crew.oldWing = null; // last stop's wing is cleared away; this stop's one replaces it
          this._wingStops++; // the car hands over its current (damaged) wing for this stop
        }
        crew.post = null;
      }
      const s = crew.svc;
      const T = pitStop.duration, Tt = pitStop.tyreTime, e = pitStop.elapsed;
      s.e = e;
      // a wing change takes longer than the tyres: the tyre crew finish, then wait with the
      // car on the jacks until the wing is on, and the jacks drop at the end of the stop
      if (!s.wing || T <= Tt) s.u = Math.min(1, e / T);
      else s.u = e < TYRE_HOLD * Tt ? e / Tt : e > T - (1 - TYRE_HOLD) * Tt ? 1 - (T - e) / Tt : TYRE_HOLD;
      this.lift = LIFT * smooth(0.03, 0.1, s.u) * (1 - smooth(0.86, 0.93, s.u));
      CORNERS.forEach((_, c) => {
        const j = JITTER[c];
        this.wheelOn[c] = !(s.u >= 0.3 + j && s.u < 0.6 + j);
      });
      this.carCompound = s.u >= 0.5 ? s.fit : s.old;
    } else if (crew.svc) {
      // released (or the car was reset): the old tyres go down where the off men stand
      for (const p of crew.people) {
        if (p.role !== 'off' || !p.tyre) continue;
        crew.ground.push({ x: p.x + Math.sin(p.yaw) * 0.55, z: p.z + Math.cos(p.yaw) * 0.55, compound: p.tyre.compound });
        p.tyre = null;
      }
      // a removed wing ends up on the floor by the garage
      if (crew.svc.wing && crew.svc.e >= W_OFF) {
        const f = crew.svc.frame;
        const [x, z] = PitCrews.toBox(f, crew.o * 3.4, 3.9);
        crew.oldWing = { x, z, yaw: f.yaw };
      }
      crew.svc = null;
      crew.post = 0;
    }
    if (crew.post !== null && (crew.post += dt) > 3) crew.post = null;
  }

  /** Where person p wants to be and what they're doing: car-frame position and facing. */
  target(crew, p, active, next) {
    const svc = crew.svc;
    const f = svc ? svc.frame : { x: 0, z: 0, yaw: 0 };
    const u = svc ? svc.u : -1;
    const o = crew.o;
    const t = { x: 0, z: 0, fx: 0, fz: 1, pose: POSE.stand, low: 0, tyre: null, spin: false, foot: null, f };
    const hub = (c) => ({ c, f, lift: this.lift });
    if (p.role === 'wingOff' || p.role === 'wingOn') {
      const plan = crew.wing, sx = p.c === 0 ? 1 : -1;
      const job = p.role === 'wingOff' ? plan.oldMen : plan.freshMen;
      if (job) {
        // one at each end of the wing, in front of it, facing the car
        t.x = job.at.x + sx * WING.halfSpan;
        t.z = job.at.z + WING.reach;
        t.fx = 0;
        t.fz = -1;
        t.pose = POSE[job.pose];
        t.low = job.pose === 'carryLow' ? 1 : 0;
      } else {
        // standing by just inside the garage
        t.x = o * 3.7;
        t.z = (p.role === 'wingOff' ? 3.2 : 4.6) + p.c * 0.8;
        t.fx = -o;
        t.fz = 0;
      }
      return t;
    }
    if (p.role === 'jackF' || p.role === 'jackR') {
      const front = p.role === 'jackF';
      const dir = front ? 1 : -1;
      const under = svc && u < 0.92;
      if (active && !(crew.post !== null && crew.post < 1.2)) {
        t.x = 0;
        t.z = dir * (front ? 4.3 : 4.05);
        t.fx = 0;
        t.fz = -dir;
      } else {
        t.x = o * 2.2;
        t.z = dir * 4.0;
        t.fx = -o;
        t.fz = -dir * 0.6;
      }
      if (under) {
        t.pose = u > 0.05 ? POSE.jackPull : POSE.jackReady;
        t.foot = { x: 0, z: front ? NOSE_JACK : REAR_JACK, y: 0.1 + this.lift, car: true };
      } else t.pose = POSE.jackReady;
      return t;
    }
    const C = CORNERS[p.c], sx = C.sx, az = C.az, dz = C.dz, j = JITTER[p.c];
    const face = (tx, tz) => {
      t.fx = tx - t.x;
      t.fz = tz - t.z;
    };
    if (p.role === 'gun') {
      t.x = sx * 2.3;
      t.z = az;
      t.pose = POSE.crouch;
      if (svc) {
        if (u < 0.3 + j || (u >= 0.58 + j && u < 0.8 + j)) {
          t.x = sx * 1.86;
          t.pose = POSE.kneel;
          t.spin = (u > 0.07 + j && u < 0.28 + j) || (u > 0.62 + j && u < 0.78 + j);
        } else if (u < 0.58 + j) t.x = sx * 2.15;
        else {
          t.x = sx * 2.05;
          t.pose = POSE.signal; // done: hand up
        }
      } else if (crew.post !== null && crew.post < 0.8) t.pose = POSE.signal;
      face(0, az);
      return t;
    }
    if (p.role === 'off') {
      t.x = sx * 2.25;
      t.z = az + dz * 0.85;
      t.pose = POSE.crouch;
      face(sx * D.track, az);
      if (svc) {
        if (u < 0.3 + j) {
          t.x = sx * 1.7;
          t.z = az + dz * 0.5;
          t.pose = POSE.grab;
          face(sx * D.track, az);
        } else {
          // wheel off: from the hub into his arms, carried clear of the car
          t.x = sx * 2.7;
          t.z = az + dz * 1.3;
          t.pose = POSE.carry;
          t.tyre = { compound: svc.old, blend: 1 - smooth(0.3 + j, 0.42 + j, u), hub: hub(p.c) };
          t.fx = sx;
          t.fz = dz * 0.5;
        }
      }
      return t;
    }
    // on man: the new wheel ready in his arms, onto the hub, then clear
    t.x = sx * 2.35;
    t.z = az - dz * 0.9;
    t.pose = POSE.carry;
    t.tyre = { compound: svc ? svc.fit : next, blend: 0, hub: hub(p.c) };
    face(sx * D.track, az);
    if (svc) {
      if (u < 0.38 + j) {
        t.x = sx * 2.1;
        t.z = az - dz * 0.8;
      } else if (u < 0.6 + j) {
        t.x = sx * 1.55;
        t.z = az - dz * 0.45;
        t.pose = POSE.carryLow;
        t.low = 1;
        t.tyre.blend = smooth(0.4 + j, 0.58 + j, u);
        face(sx * D.track, az);
      } else {
        t.x = sx * 2.3;
        t.z = az - dz * 0.95;
        t.pose = POSE.stand;
        t.tyre = null;
      }
    } else if (crew.post !== null && crew.post < 1.5) {
      t.tyre = null; // a fresh set is on its way from the garage
      t.pose = POSE.stand;
    }
    return t;
  }

  /** Ease person p towards target t (box coordinates), with a walk cycle while moving. */
  move(crew, p, t, dt, time) {
    const [bx, bz] = PitCrews.toBox(t.f, t.x, t.z);
    const yaw = t.f.yaw + Math.atan2(t.fx, t.fz);
    if (!p.placed) {
      p.x = bx;
      p.z = bz;
      p.yaw = yaw;
      p.pose.set(t.pose);
      p.placed = true;
    }
    const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz);
    const step = Math.min(d * (1 - Math.exp(-12 * dt)), 5.5 * dt);
    if (d > 1e-6) {
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
    }
    const v = dt > 0 ? step / dt : 0;
    p.v += (v - p.v) * Math.min(1, dt * 10);
    p.phase += p.v * dt * 6;
    p.yaw += wrapAngle(yaw - p.yaw) * Math.min(1, dt * 12);
    const k = Math.min(1, dt * 14);
    for (let i = 0; i < p.pose.length; i++) p.pose[i] += (t.pose[i] - p.pose[i]) * k;
    p.pose[0] += 0.015 * Math.sin(time * 1.7 + p.idle); // breathing / fidgeting
    p.low += (t.low - p.low) * k;
    p.tyre = t.tyre;
    p.spinning = t.spin;
    if (t.spin) p.spin += dt * 70;
    p.foot = t.foot ? { ...t.foot, ...(t.foot.car ? (([x, z]) => ({ x, z }))(PitCrews.toBox(t.f, t.foot.x, t.foot.z)) : {}) } : null;
  }

  /** Box coordinates -> world, with the lane's grade under the point. */
  toWorld(crew, x, y, z, out) {
    return out.set(x, y + crew.box.grade * z, z).applyMatrix4(crew.mat);
  }

  draw(time) {
    const P = this.pools, rig = this.rig, m = this._m;
    for (const crew of this.crews) {
      const col = crew.colors;
      for (const p of crew.people) {
        // skeleton
        this.toWorld(crew, p.x, 0, p.z, rig.root.position);
        rig.root.rotation.set(0, crew.box.yaw + p.yaw, 0);
        const amp = Math.min(1, p.v / 1.6);
        const holding = !!p.tyre || p.role.startsWith('jack') || (p.role.startsWith('wing') && p.low > 0.5);
        rig.apply(p.pose, [p.phase, amp], holding);
        for (const part of rig.parts) {
          const c = part.key === 'helmet' ? col.helmet : part.key === 'stripe' ? col.stripe : col.suit;
          P[part.key].push(part.node.matrixWorld, c);
        }
        const hands = this._v.copy(rig.arms[0].hand.getWorldPosition(this._v2)).add(rig.arms[1].hand.getWorldPosition(this._v2)).multiplyScalar(0.5);
        const facing = this._q.setFromAxisAngle(this._up, crew.box.yaw + p.yaw);
        if (p.role === 'gun') {
          const fwd = this._v2.set(0, 0, 0.12).applyQuaternion(facing);
          const shake = p.spinning ? 0.006 * Math.sin(time * 90) : 0;
          m.compose(hands.clone().add(fwd).setY(hands.y + shake), this._q2.setFromAxisAngle(this._v2.set(0, 0, 1), p.spin).premultiply(facing), this._s);
          P.gun.push(m);
        }
        if (p.role.startsWith('jack')) this.drawJack(crew, p, hands, facing);
        if (p.tyre) this.drawTyre(crew, p, rig, facing);
      }
      // the old set, lying on the floor
      for (const g of crew.ground) {
        this.toWorld(crew, g.x, TYRE_W / 2, g.z, this._v);
        this._q2.setFromAxisAngle(this._v2.set(0, 0, 1), Math.PI / 2).premultiply(this._q.setFromAxisAngle(this._up, crew.box.yaw));
        m.compose(this._v, this._q2, this._s);
        this.tyrePools.get(g.compound).push(m);
        P.rim.push(m);
      }
    }
    for (const pool of [...Object.values(P), ...this.tyrePools.values()]) pool.end();
  }

  drawJack(crew, p, hands, facing) {
    const P = this.pools, m = this._m;
    const foot = new THREE.Vector3();
    if (p.foot) this.toWorld(crew, p.foot.x, p.foot.y, p.foot.z, foot);
    else foot.copy(hands).add(this._v2.set(0, 0, 0.8).applyQuaternion(facing)).setY(rigFloor(crew, this, p) + 0.06);
    const dir = this._v2.subVectors(foot, hands);
    const len = dir.length();
    const q = this._q2.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.multiplyScalar(1 / Math.max(len, 1e-6)));
    m.compose(hands.clone().lerp(foot, 0.5), q, new THREE.Vector3(1, 1, len));
    P.jackBar.push(m);
    m.compose(foot.setY(foot.y - 0.04), facing, this._s);
    P.jackFoot.push(m);
  }

  /** A held tyre, blended onto the car's hub as it is fitted or pulled off. */
  drawTyre(crew, p, rig, facing) {
    const t = p.tyre, m = this._m;
    // in his arms: in front of the chest (or low, at hub height), axle along his view
    const pos = new THREE.Vector3(0, 1.0 + (0.45 - 1.0) * p.low, 0.42 + 0.2 * p.low).applyQuaternion(facing).add(rig.root.position);
    const q = new THREE.Quaternion().setFromAxisAngle(this._up, Math.PI / 2).premultiply(facing);
    if (t.blend > 0) {
      const C = CORNERS[t.hub.c], f = t.hub.f;
      const [hx, hz] = PitCrews.toBox(f, C.sx * D.track, C.az);
      const hp = this.toWorld(crew, hx, C.r + t.hub.lift, hz, new THREE.Vector3());
      const hq = new THREE.Quaternion().setFromAxisAngle(this._up, crew.box.yaw + f.yaw);
      pos.lerp(hp, t.blend);
      q.slerp(hq, t.blend);
    }
    m.compose(pos, q, this._s);
    this.tyrePools.get(t.compound).push(m);
    this.pools.rim.push(m);
  }

  dispose() {
    if (!this.pools) return;
    const geos = new Set([...Object.values(this.pools), ...this.tyrePools.values()].map((p) => p.mesh.geometry));
    for (const g of geos) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const p of [...Object.values(this.pools), ...this.tyrePools.values()]) p.mesh.dispose();
  }
}

/** Floor height (world) under person p. */
function rigFloor(crew, crews, p) {
  return crews.toWorld(crew, p.x, 0, p.z, new THREE.Vector3()).y;
}
