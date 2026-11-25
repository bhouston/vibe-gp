// Collision checks: the car-box geometry and scripted crashes on the real physics.
//
//   node scripts/collision-check.mjs
//
// 1. boxSegment: a box against a wall segment, on hand-worked cases.
// 2. TrackPath.wallContactBox on a real wall, including a box whose centre went through.
// 3. Wall scenarios (#17) on the Test Oval: the car is launched at a wall with the pedals
//    off and stepped on CarPhysics. After every step, each of the car's boxes is measured
//    against the walls (the wall is WALL_THICKNESS thick): "pen" is the deepest any box
//    ends up inside a wall. Each scenario lists what the old 1.4 m centre circle did
//    (BASELINE) next to what the physics does now.
// 4. Car-to-car scenarios (#16) on Suzuka's start straight: an endplate clipping a rear
//    tyre, a nose under a rear wing, a T-bone, a 2 s rub side by side, a wing held against
//    a tyre on full throttle, and launches (#21): a front tyre into another car's rear tyre. Each checks which parts took damage and how the cars
//    moved.
// 5. Airborne and landing (#20, #22) on the Test Oval and Spa.
// 6. The start: a brake held as the car is released (the lights going out, off the jacks)
//    holds it on its brakes instead of selecting reverse.
//
// Exits 1 if any check fails.
globalThis.location ??= { search: '' };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
globalThis.Path2D ??= class { constructor() {} addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} arc() {} ellipse() {} rect() {} closePath() {} };
const { TRACKS } = await import('../src/tracks/index.js');
const { TrackPath, boxSegment, WALL_THICKNESS } = await import('../src/trackPath.js');
const { CarPhysics } = await import('../src/physics.js');
const { carBoxes, boxOverlap } = await import('../src/carShape.js');
const { collideCars, CONTACTS, Race, AIDriver, teamPace } = await import('../src/ai.js');
const { TEAMS } = await import('../src/teams.js');

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const box = (cx, cz, yaw, hx, hy) => ({ cx, cz, fx: Math.sin(yaw), fz: Math.cos(yaw), hx, hy });

// ---------------------------------------------------------------------------------------
console.log('boxSegment (wall along x from (-10, 0) to (10, 0); its left is +z)');
{
  const r = 0.3;
  const seg = (b, side = 0, a = [-10, 0, 10, 0]) => boxSegment(b, ...a, r, side);
  const same = (c, depth, nx, nz) => c && near(c.depth, depth) && near(c.nx, nx) && near(c.nz, nz);
  const show = (c) => (c ? `depth ${c.depth.toFixed(4)} n (${c.nx.toFixed(3)}, ${c.nz.toFixed(3)})` : 'null');
  let c;
  check(seg(box(0, 3, 0, 1, 0.5)) === null, 'apart: null');
  c = seg(box(0, 1.2, 0, 1, 0.5));
  check(same(c, 0.1, 0, -1), 'inside the wall thickness only: depth = r − gap', show(c));
  c = seg(box(0, 0.5, 0, 1, 0.5));
  check(same(c, 0.8, 0, -1), 'end face through the line: out to its own side', show(c));
  c = seg(box(0, 0.9, Math.PI / 4, 1, 0.5));
  check(same(c, 0.3 + 1.5 * Math.SQRT1_2 - 0.9, 0, -1), 'rotated 45°, corner first', show(c));
  c = seg(box(4, 0.4, Math.PI / 2, 1, 0.5));
  check(same(c, 0.4, 0, -1), 'side on, sliding along it', show(c));
  c = seg(box(0.9, 0, -Math.PI / 2, 1, 0.5), 0, [-10, 0, 0, 0]);
  check(same(c, 0.4, -1, 0), 'nose into the end of a thin wall, on its line: pushed back', show(c));
  c = seg(box(0.6, 0.6, 0, 0.5, 0.5), 0, [-10, 0, 0, 0]);
  check(same(c, 0.3 - Math.hypot(0.1, 0.1), -Math.SQRT1_2, -Math.SQRT1_2), 'corner by the rounded end', show(c));
  c = seg(box(0, -1.5, 0, 1, 0.5), 1);
  check(same(c, 0.3 + 1 + 1.5, 0, -1), 'centre went through (side +1): back across', show(c));
  check(seg(box(0, -1.5, 0, 1, 0.5)) === null, 'same box, no side given: apart on the far side');
  c = seg(box(0, 0.1, 0, 1, 0.5), 0, [-0.2, 0, 0.2, 0]);
  check(c && near(c.depth, 1) && near(Math.abs(c.nx), 1), 'short wall wholly inside the box', show(c));
  c = seg(box(0, 1.2, 0, 1, 0.5), 0, [10, 0, -10, 0]);
  check(same(c, 0.1, 0, -1), 'segment direction does not matter', show(c));
  const cp = seg(box(0, 0.5, 0, 1, 0.5));
  check(cp && near(cp.pz, 0) && Math.abs(cp.px) <= 0.5 + 1e-9, 'contact point on the wall, under the box', `(${cp?.px.toFixed(3)}, ${cp?.pz.toFixed(3)})`);
}

// ---------------------------------------------------------------------------------------
const def = TRACKS.find((t) => t.id === 'oval');
const P = new TrackPath(def);
// a stretch of the outer wall far from the pit lane: W on the wall line, t along it and
// n pointing from the wall towards the track
const outer = P.walls.find((l) => l.kind === 'main' && l.closed);
const probe = P.poseAt(P.length / 2);
let k = 0;
outer.pts.forEach((p, i) => {
  if (Math.hypot(p[0] - probe.x, p[1] - probe.z) < Math.hypot(outer.pts[k][0] - probe.x, outer.pts[k][1] - probe.z)) k = i;
});
const W = outer.pts[k], m = outer.pts.length;
const unit = (x, z) => {
  const l = Math.hypot(x, z);
  return [x / l, z / l];
};
const t = unit(outer.pts[(k + 2) % m][0] - outer.pts[(k + m - 2) % m][0], outer.pts[(k + 2) % m][1] - outer.pts[(k + m - 2) % m][1]);
let n = [-t[1], t[0]];
if (n[0] * (probe.x - W[0]) + n[1] * (probe.z - W[1]) < 0) n = [-n[0], -n[1]];
const yawOf = (x, z) => Math.atan2(x, z);

console.log('TrackPath.wallContactBox (Test Oval, outer wall)');
{
  // facing the wall, its front end 0.25 m into the wall's face
  const cx = W[0] + n[0] * (WALL_THICKNESS / 2 + 1 - 0.25), cz = W[1] + n[1] * (WALL_THICKNESS / 2 + 1 - 0.25);
  const b = box(cx, cz, yawOf(-n[0], -n[1]), 1, 0.5);
  let c = P.wallContactBox(b, cx, cz, 0);
  check(c && near(c.depth, 0.25, 0.01) && c.nx * -n[0] + c.nz * -n[1] > 0.999, 'nose 0.25 m into the face', c ? `depth ${c.depth.toFixed(3)}` : 'null');
  // the centre went 2 m beyond the wall's line during the step, from 3 m in front of it
  const b2 = box(W[0] - n[0] * 2, W[1] - n[1] * 2, yawOf(-n[0], -n[1]), 1, 0.5);
  c = P.wallContactBox(b2, W[0] + n[0] * 3, W[1] + n[1] * 3, 0);
  check(c && near(c.depth, 3.3, 0.02) && c.nx * -n[0] + c.nz * -n[1] > 0.999, 'went through in one step: back to the track side', c ? `depth ${c.depth.toFixed(3)}` : 'null');
  c = P.wallContactBox(b2, b2.cx, b2.cz, 0);
  check(c === null, 'same box already beyond the wall, no sweep: no contact');
  c = P.wallContactBox(b, cx, cz, 50);
  check(c === null, 'a wall on another level (bridge) is ignored');
}

// ---------------------------------------------------------------------------------------
// Wall scenarios. BASELINE: what the 1.4 m centre circle (collideWalls before #17) did.
// (Recorded on fork/main at 04e1219. The 0.6 m pit wall fits between the front wing
// halves, 0.7 m apart, so head-on at its end only the nose reaches it.)
const BASELINE = {
  head30: { pen: 1.23, part: 'wingL' },
  swipe: { pen: 0.55, part: 'wingL' },
  reverse: { pen: 1.64, part: 'rearWing' },
  nose: { pen: 0.5, part: 'nose' },
  noseOff: { pen: 0.58, part: 'wingL' },
  spin: { pen: 1.99, part: 'wingR' },
};
const PEN_TOL = 0.05; // m a box may end a step inside a wall
const dt = 1 / 120;

/**
 * Deepest overlap of any of the car's boxes with any wall, and which box. Swept from the
 * car's centre, so a box whose centre is past a wall's line (a part through the wall)
 * counts in full, not as a shallow overlap from the far side.
 */
function penetration(car) {
  let pen = 0, part = '';
  for (const b of carBoxes(car)) {
    const c = P.wallContactBox(b, car.position.x, car.position.z, car.height);
    if (c && c.depth > pen) [pen, part] = [c.depth, b.def.name];
  }
  return { pen, part };
}

/** Did the move (x0, z0) → (x1, z1) cross a wall segment? */
function crossesWall(x0, z0, x1, z1) {
  const S = P.seg;
  const o = (ax, az, bx, bz, px, pz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  for (let s = 0; s < S.n; s++) {
    if (o(S.ax[s], S.az[s], S.bx[s], S.bz[s], x0, z0) * o(S.ax[s], S.az[s], S.bx[s], S.bz[s], x1, z1) < 0 &&
      o(x0, z0, x1, z1, S.ax[s], S.az[s]) * o(x0, z0, x1, z1, S.bx[s], S.bz[s]) < 0) return true;
  }
  return false;
}

/**
 * Launch a car at (x, z) facing (hx, hz) at `speed` (negative = reversing) and coast it.
 * slide: extra velocity [x, z] (a sideways slide); yawRate: spinning (rad/s, + = to the left).
 */
function run({ x, z, hx, hz, speed, slide = [0, 0], yawRate = 0, time = 2 }) {
  const car = new CarPhysics(P, { x, z, yaw: yawOf(hx, hz), y: 0 });
  car.vel.x = hx * speed + slide[0];
  car.vel.z = hz * speed + slide[1];
  car.speed = speed;
  car.yawRate = yawRate;
  for (const w of car.wheels) w.omega = speed / w.r;
  let worst = { pen: 0, part: '' }, through = false;
  for (let i = 0; i < time / dt; i++) {
    const px = car.position.x, pz = car.position.z;
    car.step({ throttle: 0, brake: 0, steer: 0 }, dt);
    if (crossesWall(px, pz, car.position.x, car.position.z)) through = true;
    const p = penetration(car);
    if (p.pen > worst.pen) worst = p;
  }
  return { car, ...worst, through };
}

// the pit wall's nose at the pit entry: the open main-wall end nearest the lane's start,
// facing the cars that go straight on past the entry
const ends = P.walls.filter((l) => l.kind === 'main' && !l.closed).map((l) => ({ p: l.pts[0], q: l.pts[3] }));
const lane0 = [P.pit.px[0], P.pit.pz[0]];
const nose = ends.reduce((a, b) => (Math.hypot(b.p[0] - lane0[0], b.p[1] - lane0[1]) < Math.hypot(a.p[0] - lane0[0], a.p[1] - lane0[1]) ? b : a));
const d = unit(nose.q[0] - nose.p[0], nose.q[1] - nose.p[1]);

const fromWall = (perp, along, hx, hz) => ({
  x: W[0] + n[0] * perp + t[0] * along, z: W[1] + n[1] * perp + t[1] * along, hx, hz,
});
const into30 = [t[0] * Math.cos(Math.PI / 6) - n[0] * Math.sin(Math.PI / 6), t[1] * Math.cos(Math.PI / 6) - n[1] * Math.sin(Math.PI / 6)];
const SCENARIOS = [
  {
    id: 'head30', label: 'head-on at 30° to the wall, 30 m/s',
    ...fromWall(6, -6 / Math.tan(Math.PI / 6), ...into30), speed: 30,
  },
  {
    id: 'swipe', label: 'side swipe, parallel at 50 m/s',
    ...fromWall(WALL_THICKNESS / 2 + 1 + 0.5, -20, ...t), speed: 50,
  },
  {
    id: 'reverse', label: 'reversing into the wall, 6 m/s',
    ...fromWall(WALL_THICKNESS / 2 + 2.74 + 2, 0, ...n), speed: -6,
  },
  {
    id: 'nose', label: 'pit-wall end, head-on along its line, 20 m/s',
    x: nose.p[0] - d[0] * 9, z: nose.p[1] - d[1] * 9, hx: d[0], hz: d[1], speed: 20,
  },
  {
    id: 'noseOff', label: 'pit-wall end, 0.7 m off its line (wing tip), 20 m/s',
    x: nose.p[0] - d[0] * 9 - d[1] * 0.7, z: nose.p[1] - d[1] * 9 + d[0] * 0.7, hx: d[0], hz: d[1], speed: 20,
  },
  {
    // the nose and wings sweep an arc: each box is swept from its own place a step ago
    id: 'spin', label: 'spinning at 6 rad/s, sliding into the wall at 12 m/s',
    ...fromWall(WALL_THICKNESS / 2 + 3 + 3, 0, ...t), speed: 20, slide: [-n[0] * 12, -n[1] * 12], yawRate: 6,
  },
];

console.log(`wall scenarios (Test Oval; pen = deepest any box ends a step inside a wall, target ≤ ${PEN_TOL} m)`);
const fmt = (pen, part) => (pen === null ? '   n/a' : `${pen.toFixed(2).padStart(5)} m${part ? ` ${part}` : ''}`);
for (const s of SCENARIOS) {
  const res = run(s);
  const base = BASELINE[s.id];
  const hit = res.car.impact > 0;
  const ok = res.pen <= PEN_TOL && !res.through && hit;
  check(ok, s.label.padEnd(54),
    `circle ${fmt(base.pen, base.part)} | now pen ${fmt(res.pen, res.part)}${res.through ? ', WENT THROUGH' : ''}${hit ? `, hit ${res.car.impact.toFixed(1)} m/s` : ', NO HIT'}`);
}

// A part that broke off isn't there to hit the wall: nose-first at 15°, left side leading,
// with the left front wing on and with it broken off. Records which boxes collideWalls finds
// touching a wall, and the step of the first contact.
{
  const a = Math.PI / 12;
  const into15 = [t[0] * Math.cos(a) - n[0] * Math.sin(a), t[1] * Math.cos(a) - n[1] * Math.sin(a)];
  const start = fromWall(4, -4 / Math.tan(a), ...into15);
  const crash = (breakWing) => {
    const car = new CarPhysics(P, { x: start.x, z: start.z, yaw: yawOf(...into15), y: 0 });
    if (breakWing) car.damage.wing[0] = 1;
    car.vel.x = into15[0] * 25;
    car.vel.z = into15[1] * 25;
    car.speed = 25;
    for (const w of car.wheels) w.omega = 25 / w.r;
    const parts = new Set();
    let first = null, firstStep = -1, rec = false;
    const orig = P.wallContactBox;
    P.wallContactBox = function (b, ...rest) {
      const c = orig.call(this, b, ...rest);
      if (c && rec) {
        parts.add(b.def.name);
        if (firstStep < 0 && (first === null || c.depth > first.depth)) first = { name: b.def.name, depth: c.depth };
      }
      return c;
    };
    try {
      for (let i = 0; i < 1.5 / dt; i++) {
        rec = true; // only the queries collideWalls makes inside step()
        car.step({ throttle: 0, brake: 0, steer: 0 }, dt);
        rec = false;
        if (first && firstStep < 0) firstStep = i;
      }
    } finally {
      P.wallContactBox = orig;
    }
    return { car, parts, first: first?.name, firstStep };
  };
  const intact = crash(false), broken = crash(true);
  const show = (r) => `first ${r.first ?? 'none'} at step ${r.firstStep}, touched ${[...r.parts].join(' ') || 'nothing'}`;
  check(intact.first === 'wingL', 'left wing on, 15° nose-first at 25 m/s: the wing hits first', show(intact));
  check(broken.car.damage.broken(0) && !broken.parts.has('wingL') && broken.parts.size > 0 && broken.car.impact > 0 && broken.firstStep > intact.firstStep,
    'left wing broken off: the wall meets a part still on the car', show(broken));
}

// ---------------------------------------------------------------------------------------
// Car-to-car scenarios (#16): two cars on Suzuka's start straight, stepped at 120 Hz with
// collideCars() after each step as in a race. Each checks which parts took damage and how
// the cars moved.
console.log('\ncar-to-car scenarios (Suzuka start straight)');
{
  const DT = 1 / 120;
  const SZ = new TrackPath(TRACKS.find((t) => t.id === 'suzuka'));
  const S0 = -120; // m: on the grid straight

  const expect = (label, ok, detail) => check(ok, label, detail);

  /** A car on the straight, s metres along and `lat` to the left, at `speed` (yaw offset `turn`). */
  function car(s, lat, speed, turn = 0) {
    const pose = SZ.poseAt(S0 + s, lat);
    const c = new CarPhysics(SZ, { ...pose, yaw: pose.yaw + turn });
    c.damageOn = true;
    const heading = pose.yaw; // moving along the track, whichever way the car points
    c.vel.x = Math.sin(heading) * speed;
    c.vel.z = Math.cos(heading) * speed;
    c.speed = speed * Math.cos(turn);
    for (const w of c.wheels) w.omega = c.speed / w.r;
    return c;
  }
  const track = SZ.poseAt(S0, 0);
  const F = { x: Math.sin(track.yaw), z: Math.cos(track.yaw) }, L = { x: Math.cos(track.yaw), z: -Math.sin(track.yaw) };
  const along = (c) => c.position.x * F.x + c.position.z * F.z;
  const across = (c) => c.position.x * L.x + c.position.z * L.z;
  const vAcross = (c) => c.vel.x * L.x + c.vel.z * L.z;
  const vAlong = (c) => c.vel.x * F.x + c.vel.z * F.z;

  /** Are any of the two cars' boxes overlapping? */
  function overlapping(A, B) {
    for (const a of carBoxes(A)) for (const b of carBoxes(B)) if (boxOverlap(a, b)) return true;
    return false;
  }

  /** Deepest overlap of solid parts between two cars (how far one has sunk into the other). */
  function sunk(A, B) {
    let d = 0;
    for (const a of carBoxes(A)) for (const b of carBoxes(B)) {
      if (a.def.kind === 'fragile' || b.def.kind === 'fragile') continue;
      const h = boxOverlap(a, b);
      if (h) d = Math.max(d, h.depth);
    }
    return d;
  }

  /** Step both cars `steps` times; `each(k)` after every step. Returns the contacts counted. */
  function run(A, B, steps, inA = {}, inB = {}, each) {
    const field = [{ physics: A }, { physics: B }];
    const t0 = CONTACTS.touches, h0 = CONTACTS.hard;
    for (let k = 0; k < steps; k++) {
      A.step(typeof inA === 'function' ? inA(k) : inA, DT);
      B.step(typeof inB === 'function' ? inB(k) : inB, DT);
      collideCars(field);
      each?.(k);
    }
    return { touches: CONTACTS.touches - t0, hard: CONTACTS.hard - h0 };
  }

  /** Every damaged part of a car, as "part[side] level". */
  function damaged(c) {
    const d = c.damage, out = [];
    for (const k of ['wing', 'rearWing', 'floor', 'sidepod', 'mirror', 'suspension', 'tyre', 'engine']) {
      const v = d[k];
      if (Array.isArray(v)) v.forEach((x, i) => x > 0 && out.push(`${k}[${i}] ${x.toFixed(2)}`));
      else if (v > 0) out.push(`${k} ${v.toFixed(2)}`);
    }
    return out.join(', ') || 'none';
  }
  const total = (c) => ['wing', 'rearWing', 'floor', 'sidepod', 'mirror', 'suspension', 'tyre', 'engine']
    .reduce((s, k) => s + [c.damage[k]].flat().reduce((a, b) => a + b, 0), 0);

  // The car hit in the first scenarios, run alone, to compare how much the contact moved it
  function alone(make, steps, input = {}) {
    const B = make();
    const far = car(-200, 0, 0); // a parked car far away, so the same code runs
    run(far, B, steps, {}, input);
    return B;
  }

  // --- 1. Front wing endplate clips a rear tyre at a slow closing speed
  {
    // A's left endplate lines up with B's right rear tyre: B is 1.75 m to A's left, A brakes
    // from 7 m/s faster, its endplate 0.2 m short of the tyre
    const mkB = () => car(5.2, 1.75, 50);
    const A = car(0, 0, 57), B = mkB();
    const c = run(A, B, 60, { brake: 1 });
    const ref = alone(mkB, 60);
    // B against itself driving alone: speed gained along the track, and pushed off its line
    const dv = vAlong(B) - vAlong(ref), side = across(B) - across(ref), dyaw = B.yawRate - ref.yawRate;
    const solidDv = (1.25 * 7) / 2; // what a solid part closing at 7 m/s would give it
    console.log(`    endplate clip: A ${damaged(A)} | B ${damaged(B)} | B +${dv.toFixed(3)} m/s (a solid hit: ${solidDv.toFixed(1)}), ${(side * 1000).toFixed(0)} mm off its line, yaw rate ${dyaw.toFixed(3)} | touches ${c.touches}`);
    expect('endplate clip: front wing damaged', A.damage.wing[0] > 0.05, damaged(A));
    expect('endplate clip: other wing half untouched', A.damage.wing[1] === 0, damaged(A));
    expect('endplate clip: the tyre it clipped barely touched', B.damage.tyre[3] < 0.1 && total(B) < 0.15, damaged(B));
    expect('endplate clip: other car barely moves', dv < solidDv / 10 && Math.abs(side) < 0.1 && Math.abs(dyaw) < 0.05, `+${dv.toFixed(3)} m/s, ${(side * 1000).toFixed(0)} mm off line, yaw rate ${dyaw.toFixed(3)}`);
  }

  // --- 2. Nose under a rear wing: straight into the back of a car at 8 m/s closing
  {
    // A's nose tip 0.2 m behind B's crash structure; A coasts in from 8 m/s faster
    const A = car(0, 0, 48), B = car(5.67, 0, 40);
    let depth = 0;
    const c = run(A, B, 120, {}, {}, () => (depth = Math.max(depth, sunk(A, B))));
    console.log(`    nose under rear wing: A ${damaged(A)} | B ${damaged(B)} | deepest ${depth.toFixed(3)} m | touches ${c.touches} hard ${c.hard}`);
    expect('nose under rear wing: rear wing undamaged', B.damage.rearWing === 0, damaged(B));
    expect('nose under rear wing: gearbox or diffuser hit', B.damage.engine > 0 || B.damage.floor.some((d) => d > 0), damaged(B));
    expect('nose under rear wing: the hitting car\'s front wing takes it too', A.damage.wing[0] > 0 && A.damage.wing[1] > 0, damaged(A));
    expect('nose under rear wing: no pass-through', depth < 0.3 && along(B) - along(A) > 5, `deepest ${depth.toFixed(3)} m, gap ${(along(B) - along(A)).toFixed(2)} m`);
    expect('nose under rear wing: one hard contact', c.hard === 1, `${c.hard}`);
  }

  // --- 3. T-bone at speed: into the side of a car stopped across the track
  {
    // B stands across the track, pointing left, so its left side faces A; A's nose tip
    // 0.3 m from B's sidepods. B has been driving (off the brake) and now holds it, as a
    // spun car in a race does: the brake selects reverse
    const A = car(0, 0, 25), B = car(2.95 + 0.85 + 0.3, 0, 0, Math.PI / 2);
    let depth = 0, minGap = Infinity;
    const c = run(A, B, 120, {}, (k) => (k === 0 ? {} : { brake: 1 }), () => {
      depth = Math.max(depth, sunk(A, B));
      minGap = Math.min(minGap, along(B) - along(A));
    });
    console.log(`    T-bone: A ${damaged(A)} | B ${damaged(B)} | deepest ${depth.toFixed(3)} m, closest ${minGap.toFixed(2)} m | B now ${vAlong(B).toFixed(1)} m/s | touches ${c.touches} hard ${c.hard}`);
    expect('T-bone: no pass-through', depth < 0.3 && minGap > 2.95 + 0.85 - 0.3, `deepest ${depth.toFixed(3)} m, closest ${minGap.toFixed(2)} m`);
    expect('T-bone: sidepod or floor damaged', B.damage.sidepod[0] > 0 || B.damage.floor[0] > 0 || B.damage.sidepod[1] > 0 || B.damage.floor[1] > 0, damaged(B));
    expect('T-bone: on the side it was hit (its left)', B.damage.floor[0] > 0 && B.damage.floor[1] === 0, damaged(B));
    expect('T-bone: the hit car is shoved down the track', vAlong(B) > 5, `${vAlong(B).toFixed(1)} m/s`);
    expect('T-bone: the hitting car\'s front wing', A.damage.wing[0] > 0 && A.damage.wing[1] > 0, damaged(A));
  }

  // --- 4. Side by side, a light rub for 2 s
  {
    // wheel to wheel at 50 m/s, 1.95 m apart (the rear tyres 0.05 m into each other), and A
    // steers a touch to the left, leaning on B the whole time
    const A = car(0, 0, 50), B = car(0, 1.95, 50);
    // jitter: the cars knocked back and forth step to step. Watch each step's push (how far
    // collideCars moves B), and count the times B's sideways speed jumps one way and then
    // the other (after the first touch has sorted out the overlap they started with)
    let steps = 0, maxPush = 0, maxYaw = 0, prevV = 0, prevKick = 0, flips = 0;
    const field = [{ physics: A }, { physics: B }];
    const t0 = CONTACTS.touches, h0 = CONTACTS.hard;
    for (let k = 0; k < 240; k++) {
      A.step({ throttle: 0.6, steer: 0.01 }, DT);
      B.step({ throttle: 0.6 }, DT);
      const before = across(B);
      collideCars(field);
      if (overlapping(A, B) || across(B) !== before) steps++;
      const v = vAcross(B);
      const kick = v - prevV;
      if (k > 12) {
        maxPush = Math.max(maxPush, Math.abs(across(B) - before));
        if (Math.abs(kick) > 0.05) { // a jolt of 0.6 g for a step; smaller ones are tyres settling
          if (prevKick && Math.sign(kick) !== Math.sign(prevKick)) flips++;
          prevKick = kick;
        }
      }
      prevV = v;
      maxYaw = Math.max(maxYaw, Math.abs(A.yawRate), Math.abs(B.yawRate));
    }
    const c = { touches: CONTACTS.touches - t0, hard: CONTACTS.hard - h0 };
    const apart = across(B) - across(A);
    console.log(`    side by side: A ${damaged(A)} | B ${damaged(B)} | in contact ${steps} of 240 steps, biggest push ${(maxPush * 1000).toFixed(2)} mm, ${flips} back-and-forth kicks, max yaw rate ${maxYaw.toFixed(3)} rad/s, apart ${apart.toFixed(2)} m, B now ${vAcross(B).toFixed(2)} m/s sideways | new touches ${c.touches} hard ${c.hard}`);
    expect('side by side: they rub', steps > 100, `${steps} steps`);
    expect('side by side: no jitter over 2 s', maxPush < 0.002 && flips <= 2 && maxYaw < 0.1, `push ${(maxPush * 1000).toFixed(2)} mm, ${flips} back-and-forth kicks, yaw rate ${maxYaw.toFixed(3)} rad/s`);
    expect('side by side: a small shove, not a bounce', apart > 1.9 && apart < 2.5, `${apart.toFixed(2)} m apart`);
    expect('side by side: no hard contact, no damage', c.hard === 0 && total(A) + total(B) === 0, `hard ${c.hard}; A ${damaged(A)} | B ${damaged(B)}`);
  }

  // --- 5. A steady push: a wing held against a tyre on full throttle, too slowly to break it
  for (const damageOn of [true, false]) {
    // A's left endplate behind B's right rear tyre; A on full throttle, B cruising, for 3 s
    const A = car(0, 0, 30), B = car(5.0, 1.75, 30);
    A.damageOn = B.damageOn = damageOn;
    // Driving through shows as A still closing on B across their contact (the relative
    // speed along the deepest overlap's normal) while the wing is held at its crush limit.
    // Before that, the wing crumples by design: A's throttle against the wing's 0.2 g builds
    // a closing speed over those 0.1 m (shown, not checked). After a wing breaks off (damage
    // on), A's tyre driving on into B's is a new contact.
    let deepest = 0, crumple = 0, held = 0, wasHeld = false, inContact = 0, touchingAtEnd = false;
    const LIMIT = 0.095;
    run(A, B, 360, { throttle: 1 }, { throttle: 0.3 }, () => {
      let d = null;
      const on = (c, def) => !(def.part === 'wing' && c.damage.broken(def.i)); // a broken-off wing isn't there
      for (const a of carBoxes(A)) for (const b of carBoxes(B)) {
        if (!on(A, a.def) || !on(B, b.def)) continue;
        const h = boxOverlap(a, b);
        if (h && (!d || h.depth > d.depth)) d = h;
      }
      touchingAtEnd = !!d;
      if (!d) { wasHeld = false; return; }
      deepest = Math.max(deepest, d.depth);
      inContact++;
      const closing = -((B.vel.x - A.vel.x) * d.nx + (B.vel.z - A.vel.z) * d.nz);
      const atLimit = d.depth >= LIMIT;
      if (atLimit && wasHeld) held = Math.max(held, closing);
      else if (!atLimit) crumple = Math.max(crumple, closing);
      wasHeld = atLimit;
    });
    const endGap = vAlong(A) - vAlong(B);
    const tag = `steady push, damage ${damageOn ? 'on' : 'off'}`;
    console.log(`    ${tag}: deepest ${deepest.toFixed(3)} m over ${inContact} steps of contact; closing at most ${crumple.toFixed(2)} m/s short of the limit, ${held.toFixed(2)} m/s held at it; A ${vAlong(A).toFixed(1)} B ${vAlong(B).toFixed(1)} m/s at the end${touchingAtEnd ? ', still touching' : ''} | A ${damaged(A)}`);
    expect(`${tag}: the wing doesn't sink in`, deepest < 0.15, `deepest ${deepest.toFixed(3)} m`);
    expect(`${tag}: the car behind can't drive through`, inContact > 0 && held < 0.5 && (!touchingAtEnd || Math.abs(endGap) < 0.5),
      `held at the limit closing up to ${held.toFixed(2)} m/s; ${touchingAtEnd ? `still touching, A ${endGap.toFixed(2)} m/s faster` : 'apart at the end'}`);
    if (damageOn) expect(`${tag}: the wing bends (and in the end breaks)`, A.damage.wing[0] > 0.05, damaged(A));
    else expect(`${tag}: no damage`, total(A) + total(B) === 0, damaged(A));
  }

  // --- 6. Launches (#21): a front tyre running into the back of another car's rear tyre
  // A's left front wheel lined up behind B's right rear wheel (B 1.6 m to A's left): the
  // wing reaches the tyre first and gives way, then the tyres meet. dv: A faster by this.
  // Each run: whether A left the ground off B's wheel, how high and for how long.
  function launchRun(dv, { lat = 1.6, gap = 0.2, v = 40, steps = 240, turn = 0 } = {}) {
    // B's rear tyre's back face `gap` m ahead of A's front tyre (2.09 + 2.01 m between centres)
    const A = car(0, 0, v + dv), B = car(2.09 + 2.01 + gap, lat, v, turn);
    const l0 = CONTACTS.launches;
    let peak = 0, airSteps = 0, launchedAt = -1, pitch = 0, roll = 0;
    run(A, B, steps, {}, {}, (k) => {
      if (A.airborne) {
        airSteps++;
        if (launchedAt < 0) launchedAt = k;
        pitch = Math.max(pitch, -A.pitch); // nose up
        roll = Math.max(roll, Math.abs(A.roll));
      }
      peak = Math.max(peak, A.air ?? 0);
    });
    return { A, B, launches: CONTACTS.launches - l0, peak, air: airSteps / 120, launchedAt, pitch, roll };
  }
  const deg = (x) => `${((x * 180) / Math.PI).toFixed(0)}°`;
  const showLaunch = (tag, r) => console.log(`    ${tag}: ${r.launches} launch${r.launches === 1 ? '' : 'es'}; A up ${r.peak.toFixed(2)} m, ${r.air.toFixed(2)} s off the road (bounces too), nose up to ${deg(r.pitch)}, roll to ${deg(r.roll)}${r.A.damage.undrivable ? ', WRECKED' : ''} | A ${damaged(r.A)} | B ${damaged(r.B)}`);
  {
    const r = launchRun(15);
    showLaunch('launch, 15 m/s', r);
    expect('launch, 15 m/s front wheel into a rear wheel: the car behind goes up', r.launches === 1 && r.peak > 0.3 && r.air > 0.2, `${r.launches} launches, up ${r.peak.toFixed(2)} m for ${r.air.toFixed(2)} s`);
    expect('launch, 15 m/s: the car in front takes the hit on its rear tyre', r.B.damage.tyre[3] > 0 || r.B.damage.suspension[3] > 0, damaged(r.B));
    expect('launch, 15 m/s: the car in front stays on the ground', !r.B.airborne && (r.B.air ?? 0) === 0);
  }
  {
    const r = launchRun(20);
    showLaunch('launch, 20 m/s', r);
    expect('launch, 20 m/s: rises about 1-2 m', r.launches === 1 && r.peak > 0.8 && r.peak < 2.5, `up ${r.peak.toFixed(2)} m`);
  }
  {
    const r = launchRun(3);
    showLaunch('no launch, 3 m/s', r);
    expect('no launch at 3 m/s closing', r.launches === 0 && r.peak === 0, `${r.launches} launches, up ${r.peak.toFixed(2)} m`);
  }
  {
    // wheels side by side: A's front wheel beside B's rear wheel, the same speed, A leaning on B
    const A = car(0, 0, 50), B = car(2.09 + 1.29 + 0.3, 1.9, 50);
    const l0 = CONTACTS.launches;
    let touched = 0;
    run(A, B, 240, { throttle: 0.6, steer: 0.015 }, { throttle: 0.6 }, () => { if (overlapping(A, B)) touched++; });
    console.log(`    no launch, wheels side by side: touching ${touched} steps, ${CONTACTS.launches - l0} launches`);
    expect('no launch with the wheels side by side', touched > 0 && CONTACTS.launches === l0 && !A.airborne && !B.airborne, `touching ${touched} steps, ${CONTACTS.launches - l0} launches`);
  }
  {
    // front wing (and nose) into the gearbox, the wheels not lined up: no launch
    const r = launchRun(12, { lat: 0, gap: 1.6 });
    showLaunch('no launch, wing into the gearbox', r);
    expect('no launch from a wing and nose into a gearbox', r.launches === 0 && r.peak === 0, `${r.launches} launches, up ${r.peak.toFixed(2)} m`);
  }
}

// ---------------------------------------------------------------------------------------
// In the air (#20): CarPhysics.launch() on the Test Oval (and over a crest at Spa), stepped
// at 120 Hz. Every step of
// every flight is checked for NaN.
console.log('\nairborne (Test Oval, and a crest at Spa)');
{
  const G = 9.81;
  const SPA = new TrackPath(TRACKS.find((tr) => tr.id === 'spa'));
  const finite = (c) => [c.position.x, c.position.z, c.vel.x, c.vel.z, c.yaw, c.yawRate, c.air, c.vy, c.pitch, c.roll, c.pitchRate, c.rollRate, c.height, c.speed]
    .every(Number.isFinite);
  let nan = 0;
  /** A car on the centreline half a lap from the pits, at `speed` along the track. */
  const rolling = (speed, s = P.length / 2) => {
    const pose = P.poseAt(s);
    const car = new CarPhysics(P, pose);
    car.vel.x = Math.sin(pose.yaw) * speed;
    car.vel.z = Math.cos(pose.yaw) * speed;
    car.speed = speed;
    for (const w of car.wheels) w.omega = speed / w.r;
    for (let i = 0; i < 12; i++) car.step({ throttle: 0, brake: 0, steer: 0 }, dt);
    return car;
  };
  /** Step until it lands (or maxT); the flight's airtime, peak, extremes and landing speed. */
  const flight = (car, input = { throttle: 0, brake: 0, steer: 0 }, maxT = 8, each) => {
    let landed = null;
    const own = car.onLand;
    car.onLand = function (v) {
      landed = v;
      return own.call(this, v);
    };
    const r = { t: 0, tFirst: null, peak: 0, pitchUp: 0, lift: false, liftAccel: -Infinity, s0: car.trackS };
    while (car.airborne && r.t < maxT) {
      const vy0 = car.vy;
      car.step(input, dt);
      r.t += dt;
      if (r.tFirst === null && (car.firstHit || !car.airborne)) r.tFirst = r.t;
      if (!finite(car)) nan++;
      r.peak = Math.max(r.peak, car.air);
      r.pitchUp = Math.max(r.pitchUp, -car.pitch);
      if (car.airborne && car.downforce < 0 && -car.pitch > 0.35) {
        r.lift = true;
        r.liftAccel = Math.max(r.liftAccel, (car.vy - vy0) / dt);
      }
      each?.(car);
    }
    delete car.onLand;
    r.landed = landed; // the hardest hit
    r.first = car.firstHit?.v ?? null; // the first
    r.moved = car.trackS - r.s0;
    return r;
  };

  // a slow car: the aero is negligible, so it flies the ballistic arc
  {
    const car = rolling(5);
    car.launch({ vy: 6 });
    const f = flight(car);
    const T = (2 * 6) / G, H = (6 * 6) / (2 * G);
    check(Math.abs(f.tFirst - T) < 0.03 * T && Math.abs(f.peak - H) < 0.03 * H && Math.abs(f.first - 6) < 0.3,
      'launched at 5 m/s with vy 6: the ballistic arc', `first touch at ${f.tFirst.toFixed(2)} s (${T.toFixed(2)}) at ${f.first?.toFixed(2)} m/s (6), peak ${f.peak.toFixed(2)} m (${H.toFixed(2)}); hardest hit ${f.landed?.toFixed(2)} m/s, settled at ${f.t.toFixed(2)} s`);
    check(f.moved > 5 && !car.airborne && car.air === 0 && car.vy === 0, 'lap position tracked through the flight, back on the road', `moved ${f.moved.toFixed(1)} m along the lap`);
  }

  // the debug key's launch at racing speed, then drive on: two identical flights, then one
  // car driven (throttle and steering) and one coasting. Damage off: this is about the tyres
  // taking over again (the landing, tail first and then the nose, bends the suspension).
  {
    const [car, steer, coast] = [rolling(50), rolling(50), rolling(50)];
    let f;
    for (const c of [car, steer, coast]) {
      c.damageOn = false;
      c.launch({ vy: 6, pitchRate: -1.5 });
      f = flight(c, { throttle: 1, brake: 0, steer: 1 });
    }
    check(f.t > 0.4 && f.peak > 0.6 && f.pitchUp > 0.17 && f.landed !== null,
      'key L at 50 m/s: a nose-up hop that lands', `airtime ${f.tFirst.toFixed(2)} s, peak ${f.peak.toFixed(2)} m, nose up ${(f.pitchUp * 57.3).toFixed(0)}°, first touch ${f.first?.toFixed(2)} m/s, hardest ${f.landed?.toFixed(2)} m/s`);
    const yaw0 = coast.yaw;
    let load = Infinity;
    for (let i = 0; i < 120; i++) {
      car.step({ throttle: 1, brake: 0, steer: 0 }, dt);
      steer.step({ throttle: 0, brake: 0, steer: 0.4 }, dt);
      coast.step({ throttle: 0, brake: 0, steer: 0 }, dt);
      if (![car, steer, coast].every(finite)) nan++;
      load = Math.min(load, ...car.wheels.map((w) => w.load));
    }
    const v = (c) => Math.hypot(c.vel.x, c.vel.z);
    const turn = (c) => Math.abs(c.yaw - yaw0);
    check(v(car) > v(coast) + 1 && turn(steer) > turn(coast) + 0.05 && load > 1000 && Math.abs(car.pitch) < 0.05,
      'after landing it drives on: tyres loaded, throttle and steering work',
      `1 s on throttle ${v(car).toFixed(1)} m/s vs coasting ${v(coast).toFixed(1)} m/s; steering turned ${(turn(steer) * 57.3).toFixed(0)}° vs ${(turn(coast) * 57.3).toFixed(0)}°; least wheel load ${load.toFixed(0)} N`);
  }

  // mid-corner: on the ground the car turns; in the air it goes straight on, still yawing
  {
    const car = rolling(35);
    for (let i = 0; i < 120; i++) car.step({ throttle: 0.4, brake: 0, steer: 0.5 }, dt);
    const heading = (c) => Math.atan2(c.vel.x, c.vel.z);
    const h0 = heading(car);
    for (let i = 0; i < 12; i++) car.step({ throttle: 0.4, brake: 0, steer: 0.5 }, dt);
    const groundTurn = Math.abs(heading(car) - h0) / (12 * dt);
    car.launch({ vy: 5 });
    const hA = heading(car), yawA = car.yaw, rate = car.yawRate;
    let hB = hA, yawB = yawA, t = 0;
    flight(car, { throttle: 0.4, brake: 0, steer: 0.5 }, 8, (c) => {
      if (c.airborne) [hB, yawB, t] = [heading(c), c.yaw, t + dt];
    });
    check(groundTurn > 0.1 && Math.abs(hB - hA) < 0.002,
      'launched mid-corner: carries straight on (no grip)',
      `turning ${(groundTurn * 57.3).toFixed(0)}°/s on the ground; ${(Math.abs(hB - hA) * 57.3).toFixed(2)}° in ${t.toFixed(2)} s of flight (heading ${((yawB - yawA) * 57.3).toFixed(1)}°, yaw rate ${rate.toFixed(2)} rad/s at launch)`);
  }

  // kicked into a spin at speed: the airflow turns the heading back towards the direction of
  // travel, so it turns only part of the way round before it lands (2.4 rad/s at 58 m/s, as
  // an off-centre wheel-to-wheel launch gives; #21)
  {
    const car = rolling(58);
    car.yawRate = 2.4;
    const yaw0 = car.yaw;
    car.launch({ vy: 4 });
    let t = 0, peak = 0;
    while (car.airborne && !car.firstHit && t < 3) {
      car.step({ throttle: 0, brake: 0, steer: 0 }, dt);
      t += dt;
      peak = Math.max(peak, car.yaw - yaw0);
    }
    const turned = car.yaw - yaw0;
    check(t > 0.25 && peak > 0.1 && peak < 0.35 && turned > 0.1 && turned < 0.35,
      'yaw kick in the air at 58 m/s: turns 10–20°, not 2.4 rad/s × the flight',
      `${t.toFixed(2)} s of flight: turned ${((turned * 180) / Math.PI).toFixed(0)}° by touchdown (peak ${((peak * 180) / Math.PI).toFixed(0)}°), ${((2.4 * t * 180) / Math.PI).toFixed(0)}° with nothing turning it back`);
  }

  // nose up past 20°: the downforce turns to lift, so it climbs harder than gravity allows
  {
    const car = rolling(60);
    car.launch({ vy: 8, pitchRate: -2.5 });
    const f = flight(car);
    check(f.lift && f.liftAccel > -G + 0.5,
      'nose up past 20° at 60 m/s: the downforce becomes lift',
      `nose up ${(f.pitchUp * 57.3).toFixed(0)}°, vertical acceleration up to ${f.liftAccel.toFixed(1)} m/s² (gravity alone ${(-G).toFixed(1)}), airtime ${f.t.toFixed(2)} s`);
  }

  // past the cap: pitch stops at 60°, and that marks nothing (only damage wrecks a car)
  {
    const car = rolling(0);
    car.launch({ vy: 12, pitchRate: 4 });
    let worst = 0, atCap = 0, marked = false;
    flight(car, undefined, 8, (c) => {
      worst = Math.max(worst, Math.abs(c.pitch));
      if (!c.firstHit && Math.abs(c.pitch) >= 1.05 - 1e-9) {
        atCap++;
        marked ||= c.damage.undrivable || c.damage.any || 'wrecked' in c;
      }
    });
    check(atCap > 0 && !marked && worst <= 1.05 + 1e-9, 'pitch past 60°: clamped there, nothing marked',
      `max pitch ${((worst * 180) / Math.PI).toFixed(1)}° (cap ${((1.05 * 180) / Math.PI).toFixed(1)}°), ${(atCap / 120).toFixed(2)} s at the cap before touching down, ${marked ? 'marked' : 'unmarked'}`);
  }

  // in the air on the jacks' or the parked brake's input: it isn't frozen in mid-air
  for (const inp of [{ hold: true }, { parked: true }]) {
    const car = rolling(20);
    const x0 = car.position.x, z0 = car.position.z;
    car.launch({ vy: 4 });
    const f = flight(car, { throttle: 0, brake: 1, steer: 0, ...inp });
    check(f.landed !== null && Math.hypot(car.position.x - x0, car.position.z - z0) > 10,
      `airborne with input.${Object.keys(inp)[0]}: flies on and lands`, `airtime ${f.t.toFixed(2)} s`);
  }

  // into a wall in the air: walls and catch fences are one tall barrier
  {
    const a = Math.PI / 6;
    const into = [t[0] * Math.cos(a) - n[0] * Math.sin(a), t[1] * Math.cos(a) - n[1] * Math.sin(a)];
    const s = fromWall(5, -5 / Math.tan(a), ...into);
    const car = new CarPhysics(P, { x: s.x, z: s.z, yaw: yawOf(...into), y: 0 });
    car.vel.x = into[0] * 30;
    car.vel.z = into[1] * 30;
    car.speed = 30;
    for (const w of car.wheels) w.omega = 30 / w.r;
    car.launch({ vy: 9 });
    let hitAir = 0, pen = 0, through = false;
    flight(car, undefined, 4, (c) => {
      if (c.airborne && c.impact > 0 && !hitAir) hitAir = c.air;
      pen = Math.max(pen, penetration(c).pen);
    });
    let px = car.position.x, pz = car.position.z;
    for (let i = 0; i < 60; i++) {
      car.step({ throttle: 0, brake: 0, steer: 0 }, dt);
      if (crossesWall(px, pz, car.position.x, car.position.z)) through = true;
      [px, pz] = [car.position.x, car.position.z];
    }
    check(hitAir > 1 && pen <= PEN_TOL && !through, 'airborne into a wall at 30°: still blocked',
      `hit ${car.impact.toFixed(1)} m/s at ${hitAir.toFixed(2)} m up, pen ${pen.toFixed(2)} m`);
  }

  // box heights: in the air they rise with `air` and tilt with pitch and roll
  {
    const car = rolling(0);
    const ground = carBoxes(car).map((b) => [b.h0, b.h1]);
    car.pitch = 0.03; // the suspension's tilt on the ground doesn't move the boxes
    const same = carBoxes(car).every((b, k) => b.h0 === ground[k][0] && b.h1 === ground[k][1]);
    check(same, 'on the ground: box heights ignore the suspension tilt');
    car.airborne = true;
    car.air = 1.2;
    car.pitch = -0.3; // nose up
    car.roll = 0.1; // left side up
    const sp = Math.sin(car.pitch), sr = Math.sin(car.roll);
    let worst = 0;
    const boxes = carBoxes(car);
    for (let k = 0; k < boxes.length; k++) {
      const b = boxes[k], d = b.def, mx = (d.x0 + d.x1) / 2, my = (d.y0 + d.y1) / 2;
      const off = 1.2 - sp * mx + sr * my, ext = Math.abs(sp) * b.hx + Math.abs(sr) * b.hy;
      worst = Math.max(worst, Math.abs(b.h0 - (ground[k][0] + off - ext)), Math.abs(b.h1 - (ground[k][1] + off + ext)));
    }
    const nose = boxes.find((b) => b.def.name === 'nose'), gear = boxes.find((b) => b.def.name === 'gearbox');
    check(worst < 1e-9 && nose.h0 > gear.h0 + 1, 'in the air: boxes rise with air and tilt with pitch and roll',
      `nose ${nose.h0.toFixed(2)}–${nose.h1.toFixed(2)} m, gearbox ${gear.h0.toFixed(2)}–${gear.h1.toFixed(2)} m`);
  }

  // over a crest (Spa, the biggest change of grade over 40 m on a straight): in the air pitch
  // is measured from the horizon, so the road falling away under the car doesn't tilt it.
  // The same launch on the flat Test Oval flies the same attitude.
  {
    const SP = SPA;
    const k = Math.round(40 / SP.ds);
    let crest = 0, drop = -1;
    for (let i = 0; i < SP.N; i++) {
      const dg = SP.grade[i] - SP.grade[SP.wrap(i + k)];
      if (dg > drop && Math.abs(SP.curvature[i]) < 0.004) [drop, crest] = [dg, i];
    }
    const pose = SP.poseAt(crest * SP.ds - 5);
    const a = new CarPhysics(SP, pose), b = rolling(0);
    for (let i = 0; i < 12; i++) a.step({ throttle: 0, brake: 0, steer: 0 }, dt);
    for (const c of [a, b]) {
      const f = [Math.sin(c.yaw), Math.cos(c.yaw)];
      c.vel.x = f[0] * 25;
      c.vel.z = f[1] * 25;
      for (const w of c.wheels) w.omega = 25 / w.r;
    }
    const before = a.pitch, slope = Math.atan(a.gradeF);
    a.launch({ vy: 6 });
    b.pitch = a.pitch; // the flat car leaves with the same attitude to the horizon
    b.roll = a.roll;
    b.launch({ vy: 6 });
    check(Math.abs(a.pitch - (before - slope)) < 1e-12, 'launched on a slope: pitch now from the horizon, no jump',
      `road ${((slope * 180) / Math.PI).toFixed(1)}°, pitch ${((before * 180) / Math.PI).toFixed(1)}° on the road → ${((a.pitch * 180) / Math.PI).toFixed(1)}° from the horizon`);
    let diff = 0, lo = Infinity, hi = -Infinity, landed = null, boxErr = 0, touch = null;
    const own = a.onLand;
    a.onLand = function (v, pr, rr) {
      landed = { v, pr, rr, hit: this.landHit };
      return own.call(this, v, pr, rr);
    };
    while (a.airborne && b.airborne) {
      a.step({ throttle: 0, brake: 0, steer: 0 }, dt);
      b.step({ throttle: 0, brake: 0, steer: 0 }, dt);
      if (!finite(a)) nan++;
      if (!a.airborne || !b.airborne || a.contacts || b.contacts) break; // free flight only
      diff = Math.max(diff, Math.abs(a.pitch - b.pitch));
      const road = Math.atan(a.gradeF);
      [lo, hi] = [Math.min(lo, road), Math.max(hi, road)];
      // its boxes: road height + air, tilted from the horizon, no road slope
      const sp = Math.sin(a.pitch), sr = Math.sin(a.roll);
      for (const box of carBoxes(a)) {
        const d = box.def, mx = (d.x0 + d.x1) / 2, my = (d.y0 + d.y1) / 2;
        const want = a.height + a.air - sp * mx + sr * my - Math.abs(sp) * box.hx - Math.abs(sr) * box.hy + d.h0;
        boxErr = Math.max(boxErr, Math.abs(box.h0 - want));
      }
    }
    // the flat car lands first (the road falls away under the other): fly the other one down
    for (let i = 0; i < 600 && a.airborne; i++) {
      a.step({ throttle: 0, brake: 0, steer: 0 }, dt);
      if (!finite(a)) nan++;
      if (!touch && a.firstHit) touch = { rel: a.firstHit.pitchRel, horizon: a.pitch, road: Math.atan(a.gradeF) };
    }
    delete a.onLand;
    const deg = (x) => ((x * 180) / Math.PI).toFixed(2);
    check(hi - lo > 0.0175 && diff < 0.002, 'over a crest: pitch holds to the horizon, not the road',
      `the road under it turned ${deg(hi - lo)}°; pitch differs from the same flight on flat ground by ${deg(diff)}°`);
    check(boxErr < 1e-9, 'over a crest: box heights are height + air, tilted from the horizon', `worst ${boxErr.toExponential(1)} m`);
    check(touch && Math.abs(touch.rel - (touch.horizon + touch.road)) < 0.01 && Math.abs(touch.road) > 0.03 && landed
      && landed.pr === landed.hit.pitchRel && landed.v === landed.hit.v && Math.abs(a.pitch) <= 0.035,
      'touchdown on a slope: hits are judged against the road, onLand gets the hardest, then the tilt is back on the road',
      touch && landed ? `first touch ${deg(touch.rel)}° against the road (${deg(touch.horizon)}° from the horizon, road ${deg(touch.road)}°); onLand ${landed.v.toFixed(2)} m/s at ${deg(landed.pr)}°, pitch now ${deg(a.pitch)}°` : 'never landed');
  }

  // --- landings (#22) ---
  console.log('landing (Test Oval)');
  const fmt2 = (a) => a.map((x) => x.toFixed(2)).join(' ');
  /** Launch at `speed`, with the car tilted first if asked; fly it until it settles on its tyres. */
  const land = (launchArgs, { speed = 5, pitch = 0, roll = 0 } = {}) => {
    const car = rolling(speed);
    car.pitch = pitch;
    car.roll = roll;
    car.launch(launchArgs);
    let rebound = 0, lift = 0;
    const loads = { front: 0, rear: 0, left: 0, right: 0, frontWhileRear: Infinity, leftWhileRight: Infinity };
    const f = flight(car, undefined, 6, (c) => {
      if (c.firstHit && !c.contacts) rebound = Math.max(rebound, c.air);
      lift = Math.max(lift, -c.pitch, c.roll);
      const w = c.wheels.map((x) => x.load);
      if (w[2] + w[3] > 0) loads.frontWhileRear = Math.min(loads.frontWhileRear, w[0] + w[1]);
      if (w[1] + w[3] > 0) loads.leftWhileRight = Math.min(loads.leftWhileRight, w[0] + w[2]);
    });
    return { car, f, rebound, lift, loads, d: car.damage };
  };

  {
    const r = land({ vy: 2 }, { speed: 30 });
    check(!r.d.any && r.rebound < 0.01 && !r.car.airborne, 'soft landing (2 m/s): no damage, no rebound',
      `hit ${r.f.landed?.toFixed(2)} m/s, rebound ${r.rebound.toFixed(3)} m`);
  }
  let flat4;
  {
    const r = land({ vy: 8 });
    const s4 = r.d.suspension;
    check(Math.abs(r.f.first - 8) < 0.5 && Math.min(...s4) > 0.3 && Math.max(...s4) - Math.min(...s4) < 0.15 && Math.min(...r.d.floor) > 0.2
      && Math.min(...r.d.tyre) > 0.05 && r.rebound > 0.02 && r.rebound < 0.3 && !r.car.airborne,
      'hard flat landing (8 m/s): all four corners alike, the floor and tyres too, a small rebound',
      `hit ${r.f.first?.toFixed(2)} m/s; suspension ${fmt2(s4)}, floor ${fmt2(r.d.floor)}, tyres ${fmt2(r.d.tyre)}; rebound ${r.rebound.toFixed(2)} m`);
    flat4 = land({ vy: 6 }).d; // a 1.8 m drop: past what the suspension takes for free
  }
  {
    const r = land({ vy: 6 }, { roll: Math.PI / 4 }); // left side up: lands on its right side
    const s4 = r.d.suspension;
    // it comes down on its right wheels (their hit taken through two tyres, not four), then
    // falls back about them onto its left side
    check(s4[1] > flat4.suspension[1] && s4[3] > flat4.suspension[3] && s4[1] > s4[0] + 0.2 && s4[3] > s4[2] + 0.2
      && r.car.firstHit.rollRel > 0.7 && !r.car.airborne,
      'landing at 45° roll: the side it lands on takes more than in a flat landing',
      `suspension FL FR RL RR ${fmt2(s4)} (flat at the same speed ${fmt2(flat4.suspension)}), first hit ${r.car.firstHit.v.toFixed(2)} m/s at ${((r.car.firstHit.rollRel * 180) / Math.PI).toFixed(0)}° roll`);
  }
  {
    const r = land({ vy: 6 }, { pitch: 0.35 }); // nose down 20°
    const front = r.d.suspension[0] + r.d.suspension[1] + r.d.wing[0] + r.d.wing[1], flatFront = flat4.suspension[0] + flat4.suspension[1];
    check(front > flatFront + 0.2 && !r.car.airborne, 'nose-first landing (20°): the front takes more than a flat landing',
      `front suspension ${fmt2(r.d.suspension.slice(0, 2))}, wing ${fmt2(r.d.wing)} (flat: suspension ${fmt2(flat4.suspension.slice(0, 2))})`);
  }

  // pivots: one end or side kicked up while the other stays on the road
  {
    const r = land({ vy: 0, pitchRate: -2 }, { speed: 30 });
    check(r.lift > 0.025 && r.loads.frontWhileRear === 0 && r.f.t > 0.15 && !r.d.any && !r.car.airborne,
      'nose kicked up (vy 0, pitchRate −2): it pivots on the rear wheels, then settles',
      `nose up ${((r.lift * 180) / Math.PI).toFixed(1)}°, ${r.f.t.toFixed(2)} s off the front tyres, front load while the rear carried it: ${r.loads.frontWhileRear.toFixed(0)} N, damage ${r.d.any ? 'yes' : 'none'}`);
  }
  {
    const r = land({ vy: 0, rollRate: 6 }, { speed: 30 });
    check(r.lift > 0.035 && r.loads.leftWhileRight === 0 && !r.d.any && !r.car.airborne,
      'left side kicked up (rollRate 6): it pivots on the right wheels, then settles',
      `rolled ${((r.lift * 180) / Math.PI).toFixed(1)}°, left load while the right carried it: ${r.loads.leftWhileRight.toFixed(0)} N, damage ${r.d.any ? 'yes' : 'none'}`);
  }

  // wrecked in a race is damage, never attitude: a car rolled past the cap that lands with
  // little damage races on; one with broken suspension is put back with resets on, and
  // pulls over and retires without
  const raceScene = (resets, setup, secs) => {
    const player = new CarPhysics(P, P.gridPose(0));
    const race = new Race(P, TEAMS[TEAMS.length - 1], player, TEAMS, { opponents: 3, laps: 3, level: 'normal', seed: 1, chaos: 0 });
    player.reset(race.playerGrid());
    let t = 0;
    const tick = () => {
      const hold = t < 3.6;
      player.step({ throttle: 0, brake: 1, steer: 0, hold }, dt);
      race.stepAI(hold, dt, { resets });
      t += dt;
    };
    while (t < 8) tick();
    const e = race.entries.find((x) => !x.isPlayer && !x.retired);
    let respawned = false;
    const own = e.respawned.bind(e);
    e.respawned = (s) => {
      respawned = true;
      own(s);
    };
    const r = { e, capped: false, get respawned() { return respawned; } };
    setup(e.physics);
    for (let i = 0; i < 120 * secs && !respawned && !e.retired; i++) {
      tick();
      r.capped ||= Math.abs(e.physics.roll) >= 1.05 - 1e-9;
    }
    return r;
  };
  for (const resets of [true, false]) {
    const on = resets ? 'on' : 'off';
    const r = raceScene(resets, (p) => p.launch({ vy: 4, rollRate: 10 }), 4); // under the 5 s a stuck car waits
    const d = r.e.physics.damage;
    check(r.capped && !d.undrivable && !r.respawned && !r.e.retired,
      `rolled past 60° in a race with little damage, resets ${on}: races on (not reset, not retired)`,
      `capped ${r.capped}; suspension ${fmt2(d.suspension)}, engine ${d.engine.toFixed(2)}; respawned ${r.respawned}, retired ${r.e.retired}`);
    const w = raceScene(resets, (p) => (p.damage.suspension[0] = 0.65), 15);
    check(resets ? w.respawned && !w.e.retired && !w.e.physics.damage.undrivable : w.e.retired && !w.respawned,
      `suspension at 0.65 in a race, resets ${on}: ${resets ? 'put back on the line, repaired' : 'pulls over and retires'}`,
      `respawned ${w.respawned}, retired ${w.e.retired}`);
  }

  // a nose-down launch on an uphill (Spa, s 1500): it starts clear of the road, as downhill
  {
    const first = (s) => {
      const pose = SPA.poseAt(s, 0);
      const car = new CarPhysics(SPA, pose);
      car.vel.x = Math.sin(pose.yaw) * 45;
      car.vel.z = Math.cos(pose.yaw) * 45;
      for (const w of car.wheels) w.omega = 45 / w.r;
      for (let i = 0; i < 12; i++) car.step({ throttle: 0.5, brake: 0, steer: 0 }, dt);
      car.launch({ vy: 7, pitchRate: 0.6 });
      car.step({ throttle: 0, brake: 0, steer: 0 }, dt);
      const air = car.air;
      let frames = 1;
      while (car.airborne && !car.firstHit && frames < 600) {
        car.step({ throttle: 0, brake: 0, steer: 0 }, dt);
        frames++;
      }
      return { air, frames, grade: car.gradeF };
    };
    const up = first(1500), down = first(2747);
    check(up.frames > 30 && Math.abs(up.air - down.air) < 0.01, 'nose-down launch on an uphill (Spa s 1500): flies, from the same height as downhill',
      `uphill: ${up.air.toFixed(3)} m up after the first frame, ${up.frames} frames to the first touch; downhill (s 2747): ${down.air.toFixed(3)} m, ${down.frames} frames`);
  }
  check(nan === 0, 'no NaN in any flight', `${nan} bad steps`);
}

// ---------------------------------------------------------------------------------------
// 6. The start: a brake held through the release must not select reverse (the AI holds the
//    brake through its reaction time, so every car used to roll back at the green)
{
  console.log('\nthe start (Suzuka grid, Spa slope)');
  const dt = 1 / 120;
  const SUZ = new TrackPath(TRACKS.find((t) => t.id === 'suzuka'));
  const SPA = new TrackPath(TRACKS.find((t) => t.id === 'spa'));
  const along = (car, P) => {
    const s = car.trackS;
    return s > P.length / 2 ? s - P.length : s;
  };
  // a full grid from Race, the player AI-driven as in ai-check: 1 s on the lights, 3 s after
  {
    const player = new CarPhysics(SUZ, SUZ.gridPose(0));
    const race = new Race(SUZ, TEAMS[TEAMS.length - 1], player, TEAMS, { opponents: 10, laps: 1, level: 'normal', seed: 1, chaos: 0 });
    player.reset(race.playerGrid());
    race.player.driver = new AIDriver(race.player, race.line, { pace: teamPace(TEAMS.length - 1, 'normal'), seed: 99 });
    let grid, back = 0, worst = '', slow = 0;
    for (let f = 0; f < 120 * 4; f++) {
      const holding = f < 120;
      const ctl = race.player.driver.drive(race.entries, holding ? 0 : race.sinceGreen, dt);
      player.step(holding ? { ...ctl, hold: true } : ctl, dt);
      race.stepAI(holding, dt, { resets: true });
      if (f === 119) grid = new Map(race.entries.map((e) => [e, along(e.physics, SUZ)]));
      if (!holding) {
        for (const e of race.entries) {
          const d = grid.get(e) - along(e.physics, SUZ);
          if (d > back) [back, worst] = [d, e.team.name];
          slow = Math.min(slow, e.physics.speed);
        }
      }
    }
    check(back < 0.01, `full grid start: no car rolls back from its grid spot (${race.entries.length} cars)`,
      `furthest back ${(back * 100).toFixed(1)} cm${worst ? ` (${worst})` : ''}, lowest speed ${slow.toFixed(2)} m/s`);
  }
  // one car: held on the jacks, then released with the brake pressed
  const released = (P, s, frames) => {
    const car = new CarPhysics(P, P.poseAt(s, 0));
    for (let i = 0; i < 120; i++) car.step({ throttle: 0, brake: 1, steer: 0, hold: true }, dt);
    const x = car.position.x, z = car.position.z;
    let slow = 0;
    for (let i = 0; i < frames; i++) {
      car.step({ throttle: 0, brake: 1, steer: 0 }, dt);
      slow = Math.min(slow, car.speed);
    }
    return { car, moved: Math.hypot(car.position.x - x, car.position.z - z), slow };
  };
  {
    const r = released(SUZ, 0, 240);
    const { car } = r;
    for (let i = 0; i < 12; i++) car.step({ throttle: 0, brake: 0, steer: 0 }, dt); // let go
    let back = 0;
    for (let i = 0; i < 240; i++) {
      car.step({ throttle: 0, brake: 1, steer: 0 }, dt); // and press again
      back = Math.min(back, car.speed);
    }
    check(r.moved < 0.01 && r.slow > -0.05 && back < -3,
      'held, then released with the brake on: it stays put; let go and pressed again, it reverses',
      `moved ${(r.moved * 100).toFixed(1)} cm on the brake, then reversing at ${(-back).toFixed(1)} m/s`);
  }
  {
    const grade = (s) => {
      const c = new CarPhysics(SPA, SPA.poseAt(s, 0));
      c.step({ throttle: 0, brake: 0, steer: 0, hold: true }, dt);
      return c.gradeF;
    };
    let s = 0, g = 0;
    for (let t = 0; t < SPA.length; t += 25) {
      const gt = Math.abs(grade(t));
      if (gt > g) [s, g] = [t, gt];
    }
    const r = released(SPA, s, 360);
    check(r.moved < 0.01, `released on the brake on Spa's steepest slope (s ${s}, ${(g * 100).toFixed(1)}%): it doesn't creep`,
      `moved ${(r.moved * 100).toFixed(1)} cm in 3 s`);
  }
  // reversing as before: stopped from speed with the brake held, or pressed at a standstill
  {
    const pose = SUZ.poseAt(200, 0);
    const car = new CarPhysics(SUZ, pose);
    car.vel.x = Math.sin(pose.yaw) * 20;
    car.vel.z = Math.cos(pose.yaw) * 20;
    for (const w of car.wheels) w.omega = 20 / w.r;
    car.step({ throttle: 0, brake: 0, steer: 0 }, dt); // driving along, off the brake
    let back = 0;
    for (let i = 0; i < 480; i++) {
      car.step({ throttle: 0, brake: 1, steer: 0 }, dt);
      back = Math.min(back, car.speed);
    }
    const still = new CarPhysics(SUZ, pose);
    still.step({ throttle: 0, brake: 0, steer: 0 }, dt);
    let back2 = 0;
    for (let i = 0; i < 240; i++) {
      still.step({ throttle: 0, brake: 1, steer: 0 }, dt);
      back2 = Math.min(back2, still.speed);
    }
    check(back < -3 && back2 < -3, 'reversing still works: braked to a stop and held, or pressed at a standstill',
      `${(-back).toFixed(1)} m/s and ${(-back2).toFixed(1)} m/s backwards`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks pass');
process.exit(failures ? 1 : 0);
