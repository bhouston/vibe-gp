// AI opponents: computer-driven cars that race the player on the same physics.
//
// - racingLine(): a minimum-curvature line inside the track edges (iterative smoothing of
//   a lateral offset per centreline sample) and the speed profile along it (corner speed
//   from the tyre grip summary in PARAMS, then braking zones worked backwards).
// - AIDriver: steers at a point ahead on that line (pure pursuit), holds the profile speed
//   scaled by its own pace, and reacts to traffic: it follows a slower car, pulls out to
//   pass it on the side with more room, and keeps clear of a car alongside.
// - collideCars(): car-to-car contact. Each car is three circles along its length; overlaps
//   are pushed apart and the closing speed is exchanged (equal masses), with some spin and
//   (if damage is on) damage to both cars.
// - STYLES: every AI driver races in a style (aggressive, balanced, smooth or rookie): how
//   late it brakes, how fast it takes corners, the gaps it leaves, how keen it is to pass,
//   how often it makes a mistake and how it looks after its tyres. Each starts on its own
//   tyre compound and drives to the grip it has (softs quick early, fading as they wear).
// - Pit stops: each AI driver watches its tyres. Once they won't last to the flag and
//   won't last another lap, it picks the compound for the rest of the race, pulls into
//   the pit lane, stops in its team's box for a new set (its crew does the stop) and
//   rejoins. A badly damaged front wing brings it in for a new one too.
// - Race: the whole field (player + AI): grid, progress along the lap, positions, laps and
//   the chequered flag.
import { CarPhysics, PARAMS } from './physics.js';
import { TYRE, COMPOUNDS, COMPOUND_LIST, tempGrip, wearGrip } from './tyres.js';
import { PIT, angleDiff } from './trackPath.js';
import { PitStop } from './pitStop.js';
import { AI_PACE } from './tracks/aipace.js';

const LINE_MARGIN = 1.5; // m between the racing line and the edge of the asphalt (car half width + a bit)
const WALL_MARGIN = 2.2; // m between the racing line and a wall face
const CAR_R = 1.0; // collision circle radius, m
const CAR_CIRCLES = [-1.75, 0, 1.75]; // circle centres along the car, m from the CoG (car is ~5.6 m long)
const RETIRE_TRIES = 6; // no-resets mode: recoveries that fail in a row before a car retires
const STAMP = 20, STAMP_OFFSET = 400; // timing loops every 20 m, from 400 m behind the line
const MASS = PARAMS.mass, INERTIA = PARAMS.yawInertia;

/** Minimum-curvature racing line and its speed profile for a TrackPath. */
export const AI_SEG = 20; // m: the learned speed profile (scripts/ai-learn.mjs) scales corner speeds per segment of this length

/**
 * `learned`: { brake, seg: [scale per AI_SEG m] } from src/tracks/aipace.js (made by
 * scripts/ai-learn.mjs); by default the track's own entry, or the plain estimate.
 */
export function racingLine(P, { gripUse = 1.15, learned = AI_PACE[P.def?.id] } = {}) {
  const N = P.N;
  const lat = new Float64Array(N);
  const lo = new Float64Array(N), hi = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    // inside the asphalt, and clear of walls that squeeze into it (street circuits)
    hi[i] = Math.max(0, Math.min(P.hw - LINE_MARGIN, P.wallL[i] - WALL_MARGIN)); // left (+)
    lo[i] = -Math.max(0, Math.min(P.hw - LINE_MARGIN, P.wallR[i] - WALL_MARGIN));
  }
  // the walls' limits, smoothed a little so they don't twitch the line
  const minAround = (arr, w) => Float64Array.from(arr, (_, i) => {
    let m = Infinity;
    for (let k = -w; k <= w; k++) m = Math.min(m, Math.abs(arr[P.wrap(i + k)]));
    return m;
  });
  const win = Math.max(1, Math.round(6 / P.ds));
  const hiS = minAround(hi, win), loS = minAround(lo, win);
  for (let i = 0; i < N; i++) { hi[i] = hiS[i]; lo[i] = -loS[i]; }
  // smoothing over a span of ~12 m, many passes: converges towards the line of least curvature
  const k = Math.max(1, Math.round(12 / P.ds));
  const lx = (i) => P.leftX(i), lz = (i) => P.leftZ(i);
  const qx = (i) => P.px[i] + lx(i) * lat[i], qz = (i) => P.pz[i] + lz(i) * lat[i];
  for (let it = 0; it < 600; it++) {
    for (let i = 0; i < N; i++) {
      const a = P.wrap(i - k), b = P.wrap(i + k);
      const mx = (qx(a) + qx(b)) / 2, mz = (qz(a) + qz(b)) / 2;
      const want = (mx - P.px[i]) * lx(i) + (mz - P.pz[i]) * lz(i);
      lat[i] = Math.min(hi[i], Math.max(lo[i], lat[i] + (want - lat[i]) * 0.6));
    }
  }
  // curvature of the line and the length of each step along it
  const X = new Float64Array(N), Z = new Float64Array(N), seg = new Float64Array(N), head = new Float64Array(N);
  for (let i = 0; i < N; i++) { X[i] = qx(i); Z[i] = qz(i); }
  for (let i = 0; i < N; i++) {
    const j = P.wrap(i + 1);
    seg[i] = Math.hypot(X[j] - X[i], Z[j] - Z[i]) || P.ds;
    head[i] = Math.atan2(X[j] - X[i], Z[j] - Z[i]);
  }
  // corner speed from the tyre grip summary (cold tyres, so on the safe side) and crests;
  // the learned per-segment scales go on top of this
  const g = (v) => PARAMS.baseGrip + PARAMS.downforceGrip * v * v;
  const vc = new Float64Array(N), vcap = new Float64Array(N), curv = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = P.wrap(i - 3), c = P.wrap(i + 3);
    let span = 0;
    for (let m = -3; m < 3; m++) span += seg[P.wrap(i + m)];
    const dh = Math.atan2(Math.sin(head[c] - head[a]), Math.cos(head[c] - head[a]));
    const kk = Math.max(Math.abs(dh) / span, 1e-5);
    curv[i] = kk;
    let v = 10;
    for (let n = 0; n < 25; n++) v = Math.sqrt((g(v) * gripUse) / kk);
    vc[i] = v;
    // crests unload the car: keep v²·κ well under g there
    const crest = -P.vcurv[i];
    vcap[i] = Math.min(95, crest > 0 ? Math.sqrt((9.81 * 0.7) / crest) : 95);
  }
  const K = Math.ceil(P.length / AI_SEG);
  const segOf = (i) => Math.min(K - 1, Math.floor((i * P.ds) / AI_SEG));
  const vlim = new Float64Array(N);
  /**
   * (Re)build the speed profile: corner speeds × scale[segment], then braking zones worked
   * backwards. The braking uses the grip there is at each speed (downforce: about three
   * times as much at 300 km/h as at walking pace), times `brakeUse`.
   */
  const variants = new Map(); // per-style / per-grip copies of the profile (see variant)
  let current = null; // the scales and braking the profile was last built with
  function profile(scale = null, brakeUse = 0.86, out = null, corner = 1) {
    if (!out) {
      // the copies follow a rebuilt profile (scripts/ai-learn.mjs tries out new scales)
      variants.clear();
      current = { scale, brake: brakeUse };
    }
    const v = out ?? vlim;
    for (let i = 0; i < N; i++) v[i] = Math.min(vcap[i], vc[i] * corner * (scale ? scale[segOf(i)] : 1));
    // the slowest point of a corner governs the few metres around it (hairpin apexes are
    // sharper than a few samples can measure)
    const w = Math.max(1, Math.round(8 / P.ds));
    const src = Float64Array.from(v);
    for (let i = 0; i < N; i++) {
      let m = src[i];
      for (let k = -w; k <= w; k++) m = Math.min(m, src[P.wrap(i + k)]);
      v[i] = m;
    }
    const decel = (v) => brakeUse * (PARAMS.brakeDecel + TYRE.muLongScale * PARAMS.downforceGrip * v * v);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const j = P.wrap(i + 1);
        v[i] = Math.min(v[i], Math.sqrt(v[j] ** 2 + 2 * decel(v[j]) * seg[i]));
      }
    }
  }
  profile(learned?.seg, learned?.brake ?? 0.86);
  const at = (arr, s) => {
    const f = (((s % P.length) + P.length) % P.length) / P.ds;
    const i = Math.floor(f) % N;
    return arr[i];
  };
  const vAtIn = (arr, s) => {
    const f = (((s % P.length) + P.length) % P.length) / P.ds;
    const i = Math.floor(f) % N, j = P.wrap(i + 1), t = f - Math.floor(f);
    return arr[i] + (arr[j] - arr[i]) * t;
  };
  const line = {
    lat,
    vlim,
    segments: K,
    segOf,
    profile,
    /**
     * The same line with its own speed profile for a driving style: corner speeds × corner,
     * braking × brake (a late braker's > 1). Shared by every driver with the same numbers.
     */
    variant(corner = 1, brake = 1) {
      const key = `${corner}|${brake}`;
      if (!variants.has(key)) {
        if (variants.size > 300) variants.clear(); // the chaos slider makes many; rebuilt as needed
        const arr = new Float64Array(N);
        profile(current.scale, current.brake * brake, arr, corner);
        variants.set(key, { ...line, vlim: arr, vAt: (s) => vAtIn(arr, s) });
      }
      return variants.get(key);
    },
    /** Room for a car at s: { left, right } lateral limits (right is negative). */
    limits: (s) => ({ left: at(hi, s) + 0.3, right: at(lo, s) - 0.3 }),
    /** |curvature| of the line at s (1/m), the tightest within `ahead` metres. */
    curvAt(s, ahead = 0) {
      let m = 0;
      for (let d = 0; d <= ahead; d += P.ds * 2) m = Math.max(m, at(curv, s + d));
      return m;
    },
    latAt(s) {
      const f = (((s % P.length) + P.length) % P.length) / P.ds;
      const i = Math.floor(f) % N, j = P.wrap(i + 1), t = f - Math.floor(f);
      return lat[i] + (lat[j] - lat[i]) * t;
    },
    vAt(s) {
      return vAtIn(vlim, s);
    },
  };
  return line;
}

/** Damage an AI car can't race on (no-resets mode): broken suspension or a dead engine. */
function wrecked(d) {
  return d.suspension.some((x) => x >= 0.6) || d.engine >= 0.95;
}

/** Signed distance from s0 to s1 along the lap, in (-L/2, L/2]. */
function lapDelta(s1, s0, L) {
  let d = s1 - s0;
  if (d > L / 2) d -= L;
  if (d <= -L / 2) d += L;
  return d;
}

/**
 * Driving styles. corner / brake: corner speeds and braking on the speed profile (a late
 * braker's brake > 1: it brakes harder, so later); gap: following distance; room: extra
 * (or less) side clearance, m; pass: how much quicker it must be closing (m/s) before it
 * goes for a pass; mistakes: corners got wrong per km, and snap: the share of those that
 * are a snap of oversteer on the way out rather than running wide (see drive); late: how
 * close it leaves an emergency stop; tyreCare: how much of its tyres' wear it allows for (1:
 * all of it; less: it keeps pushing on worn tyres and slides); wobble: pace variation;
 * tyres: chances of starting on soft / medium / hard; pitWear: tyre wear it pits at, and
 * endWear: how worn it will let them get when that gets it to the flag without a stop.
 */
export const STYLES = {
  aggressive: { name: 'Aggressive', corner: 1.015, brake: 1.1, gap: 0.65, room: -0.25, pass: 0.6, mistakes: 0.3, snap: 0.4, tyreCare: 0.4, wobble: 1.2, late: 0.85, tyres: [0.55, 0.4, 0.05], pitWear: 0.8, endWear: 0.92 },
  balanced: { name: 'Balanced', corner: 1, brake: 1, gap: 1, room: 0, pass: 1.5, mistakes: 0.07, snap: 0.25, tyreCare: 0.8, wobble: 1, late: 1, tyres: [0.3, 0.55, 0.15], pitWear: 0.72, endWear: 0.82 },
  smooth: { name: 'Smooth', corner: 0.99, brake: 0.95, gap: 1.3, room: 0.3, pass: 2.5, mistakes: 0.02, snap: 0.2, tyreCare: 1, wobble: 0.6, late: 1.1, tyres: [0.15, 0.55, 0.3], pitWear: 0.66, endWear: 0.76 },
  rookie: { name: 'Rookie', corner: 1.005, brake: 1.06, gap: 0.85, room: 0, pass: 1, mistakes: 0.45, snap: 0.5, tyreCare: 0.5, wobble: 2.5, late: 0.95, tyres: [0.4, 0.5, 0.1], pitWear: 0.76, endWear: 0.9 },
};
const SOFT_USE = 0.4; // share of a grippier compound's extra grip the AI drives to (see tyreGrip)
// a field's mix of styles, dealt in a shuffled order
const STYLE_DECK = ['aggressive', 'balanced', 'smooth', 'aggressive', 'balanced', 'rookie', 'balanced', 'smooth', 'aggressive', 'balanced'];

/**
 * AI chaos (the Settings slider, 0..1): how far apart the drivers race. CHAOS_DEFAULT is the
 * styles exactly as above; lower narrows them to about 60% (tidier, fewer mistakes), higher
 * widens them up to 4.2x: late brakers brake later still, aggressive drivers leave less room
 * and close up more, mistakes come several times as often, and each driver gets a personal
 * twist on corner speed, braking and pace. The top end means crashes.
 */
export const CHAOS_DEFAULT = 0.4;
export function chaosSpread(c = CHAOS_DEFAULT) {
  if (c <= CHAOS_DEFAULT) return 0.6 + 0.4 * (c / CHAOS_DEFAULT);
  const t = (c - CHAOS_DEFAULT) / (1 - CHAOS_DEFAULT);
  return 1 + 2 * t + 1.2 * t ** 3; // steepest at the top: 4.2x at 100
}

/** A style with its differences from a middle-of-the-road driver scaled by spread v; quirk: this driver's own [-1, 1] x3. */
function spreadStyle(st, v, quirk = [0, 0, 0]) {
  const dev = (x, mid = 1) => mid + (x - mid) * v;
  const extra = Math.max(0, v - 1);
  return {
    ...st,
    corner: dev(st.corner) + quirk[0] * 0.012 * extra,
    brake: Math.max(0.7, dev(st.brake) + quirk[1] * 0.06 * extra),
    gap: Math.max(0.25, dev(st.gap)),
    room: st.room * v - 0.15 * extra,
    pass: st.pass / Math.max(1, v) ** 0.8,
    mistakes: st.mistakes * v ** 1.3,
    late: Math.max(0.35, dev(st.late)),
    wobble: st.wobble * v,
  };
}

// --- pit lane ---
const PIT_DECIDE = 700; // m before the lane leaves the track: the driver decides whether to stop this lap
const PIT_STOP_DECEL = 3; // m/s² rolling into the box, so it stops on the marks
const PIT_IN = 2.5; // m inside the track edge where the lane counts as having left the track
const MEDIUM_LIFE = 0.6; // share of the race distance a set of mediums lasts (see Race)
const PIT_SCRUB = 1.2; // tyre wear in racing against the compound's clean-driving rate (sliding)
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Braking a pit-bound car can count on at speed v (with the downforce), m/s². */
const pitDecel = (v) => 0.7 * (PARAMS.brakeDecel + TYRE.muLongScale * PARAMS.downforceGrip * v * v);

const lanes = new WeakMap();
/**
 * How to drive a pit lane (cached per lane): v, the speed along it (its bends at
 * low-speed grip, under the limiter in the limit zone, braking worked backwards); off,
 * the lane distance where it leaves the track (before that it runs over the asphalt from
 * the middle of the track); and approach[m]: the speed to be at m metres of track before
 * that point.
 */
function laneGuide(pit) {
  let g = lanes.get(pit);
  if (g) return g;
  const N = pit.N, hw = pit.main.hw;
  const v = new Float64Array(N);
  const grip = (u) => (PARAMS.baseGrip + PARAMS.downforceGrip * u * u) * 0.8;
  for (let j = 0; j < N; j++) {
    const a = Math.max(0, j - 4), b = Math.min(N - 1, j + 4);
    const k = Math.max(Math.abs(angleDiff(pit.heading[b], pit.heading[a])) / ((b - a) * pit.ds), 1e-5);
    let u = 10;
    for (let n = 0; n < 20; n++) u = Math.sqrt(grip(u) / k);
    v[j] = Math.min(u, 90);
    const s = j * pit.ds;
    if (s >= pit.limitStart - 3 && s <= pit.limitEnd) v[j] = Math.min(v[j], PIT.speedLimit - 0.6);
  }
  for (let j = N - 2; j >= 0; j--) v[j] = Math.min(v[j], Math.sqrt(v[j + 1] ** 2 + 2 * pitDecel(v[j + 1]) * pit.ds));
  let jOff = 0;
  while (jOff < N - 1 && Math.abs(pit.mainLat[jOff]) < hw - PIT_IN) jOff++;
  const approach = new Float64Array(1200);
  approach[0] = v[jOff];
  for (let m = 1; m < approach.length; m++) approach[m] = Math.sqrt(approach[m - 1] ** 2 + 2 * pitDecel(approach[m - 1]));
  const L = pit.main.length;
  g = {
    off: jOff * pit.ds,
    offLap: ((pit.mainS[jOff] % L) + L) % L,
    offLat: pit.side * (hw - PIT_IN), // where on the track to be when the lane turns off
    vAt: (s) => v[Math.min(N - 1, Math.max(0, Math.round(s / pit.ds)))],
    approach: (m) => approach[Math.min(approach.length - 1, Math.max(0, Math.round(m)))],
  };
  lanes.set(pit, g);
  return g;
}

/** Computer driver for one car. */
export class AIDriver {
  constructor(entry, line, { pace = 0.95, reaction = 0.25, seed = 1, style = STYLES.balanced } = {}) {
    this.entry = entry;
    this.baseStyle = style; // the style as dealt; this.style: spread by the chaos setting
    this.style = style;
    this.base = line; // the race's line; this.line: its speed profile for this driver and tyres
    this.line = line.variant ? line.variant(style.corner, style.brake) : line;
    this.mistake = null; // { from, len, boost }: a braking point missed (see drive)
    this.pace = pace; // share of the line's profile speed this driver carries
    this.reaction = reaction; // s from green to the throttle
    this.offset = 0; // extra lateral offset for traffic (m, + = left)
    this.offsetTarget = 0;
    this.stuck = 0;
    this.resets = true; // false: no-resets mode, a stuck car gets itself out or retires
    this.rec = null; // no-resets recovery in progress: { phase, t }
    this.tries = 0; // recoveries since the car last got properly going
    this.rand = mulberry32(seed);
    this.wobble = 0; // slow-varying small pace variation, so they don't drive like trains
    this.wobbleT = 0;
    this.race = null; // the Race (set by it): what pit stop plans are made against
    this.pit = null; // pit stop under way: { phase: 'enter' | 'lane', compound, wing, served }
    this.planLap = null; // the lap the last stop-or-not decision was made on
    this.stintFrom = 0; // race progress (m) when the tyres on the car went on
    this.tyreBias0 = (this.rand() - 0.5) * 0.14; // this driver's own idea of how far tyres go
    this.tyreBias = this.tyreBias0;
    this.basePace = pace;
    this.quirk = [this.rand() * 2 - 1, this.rand() * 2 - 1, this.rand() * 2 - 1]; // corner, brake, pace
  }

  /**
   * Take over again after the player has been driving this car: forget plans made before
   * (a stop under way, a mistake, a recovery) and carry on from where the car is.
   */
  resume() {
    const car = this.entry.physics;
    this.pit = null;
    this.planLap = null;
    this.mistake = null;
    this.rec = null;
    this.stuck = 0;
    this.tries = 0;
    this.brakeNow = false;
    const s = car.trackS, lim = this.line.limits(s);
    this.offset = this.offsetTarget = Math.max(lim.right, Math.min(lim.left, car.lateral)) - this.line.latAt(s);
  }

  /** Apply the chaos setting (spread v from chaosSpread): style, tyre gambles and pace. */
  setSpread(v) {
    this.style = spreadStyle(this.baseStyle, v, this.quirk);
    this.tyreBias = this.tyreBias0 * v;
    this.pace = this.basePace * (1 + this.quirk[2] * 0.01 * Math.max(0, v - 1));
  }

  /** Controls for this step. field: every entry in the race. */
  drive(field, sinceGreen, dt) {
    const car = this.entry.physics;
    const P = car.track;
    const L = P.length;
    if (sinceGreen < this.reaction) return { steer: 0, throttle: 0, brake: 1 };
    // a car too badly damaged to race (it can't pit): with resets it's put back on the line
    // repaired; in no-resets mode it pulls over and retires
    if (this.resets && wrecked(car.damage)) {
      this.respawn(field);
      return { steer: 0, throttle: 0, brake: 0 };
    }
    if (!this.resets && (this.parking || wrecked(car.damage))) return this.pullOver();

    this.wobbleT -= dt;
    if (this.wobbleT <= 0) {
      this.wobbleT = 2 + this.rand() * 4;
      this.wobbleGoal = (this.rand() - 0.5) * 0.02 * this.style.wobble;
    }
    this.wobble += ((this.wobbleGoal ?? 0) - this.wobble) * Math.min(1, dt * 0.5);

    const s = car.trackS;
    const v = Math.max(0, car.speed);
    const lineLat = this.line.latAt(s);
    const st = this.style;
    // the speed profile for this style on the grip its tyres have now (compound, temperature,
    // wear), in 2% steps: corners and braking both scale with grip. (Scaling the speeds
    // alone isn't enough: at speed the braking comes mostly from downforce, which a lower
    // target speed doesn't take away, so low-grip cars braked too late and slid off.)
    if (this.base.variant) {
      const g = Math.round(this.tyreGrip(car) * 50) / 50;
      const q = (x, step) => Math.round(x / step) * step;
      this.line = this.base.variant(q(st.corner * Math.sqrt(g), 0.0025), q(st.brake * g, 0.01));
    }
    // pit stops: decided on the way to the pit entry; then the lane is driven on its own
    if (this.race && this.entry.pitStop?.box) {
      if (!this.pit && !this.entry.finished) this.considerPit(s, sinceGreen);
      if (this.pit) {
        const c = this.pitDrive(field, dt);
        if (c) return c;
      }
    }
    // the target a little ahead: the brake pedal takes a moment to come on
    let vt = this.line.vAt(s + 3 + v * 0.08) * (this.pace + this.wobble);
    // mistakes: now and then, heading into a braking zone, the driver gets the corner wrong.
    // 'wide': misses the braking point, carries too much speed in and misses the apex
    // (less steering through the corner), running wide, often across the grass or into the
    // gravel. 'snap': too much throttle too early on the way out, traction control off: the
    // rear steps out, sometimes all the way round.
    if (this.mistake) {
      if (lapDelta(s, this.mistake.from, L) > this.mistake.len) this.mistake = null;
    } else if (v > 30 && sinceGreen > 10 && !this.pit && this.line.vAt(s + 30 + v * 0.6) < v - 12) {
      // about a third of a lap is braking zones, hence the 3
      if (this.rand() < st.mistakes * 3 * (v * dt) / 1000) {
        // from here through the braking zone to the slowest point of the corner
        let len = 0, vmin = Infinity;
        for (let d = 0; d < 350; d += 5) {
          const vd = this.line.vAt(s + d);
          if (vd < vmin) { vmin = vd; len = d; }
        }
        const snap = this.rand() < st.snap;
        this.mistake = snap
          ? { kind: 'snap', from: s, apex: len, len: len + 30 + this.rand() * 25 }
          : { kind: 'wide', from: s, apex: len, len: len + 70, boost: 1.04 + this.rand() * 0.09, under: 0.35 + this.rand() * 0.25 };
        this.mistakes = (this.mistakes ?? 0) + 1;
      }
    }
    // past the car's real limit (the profile is about it) whatever its pace: on Easy too
    const m = this.mistake;
    const into = m ? lapDelta(s, m.from, L) : 0;
    if (m?.kind === 'wide' && into < m.apex) vt = Math.max(vt, this.line.vAt(s + 3 + v * 0.08) * m.boost);
    // the car's own damage: no point charging at the limit with half a front wing
    vt *= 1 - 0.12 * Math.min(1, car.damage.wing[0] + car.damage.wing[1]);

    // --- traffic ---
    const { left: limL, right: limR } = this.line.limits(s);
    const clampLat = (x) => Math.max(limR, Math.min(limL, x));
    let follow = Infinity;
    let urgent = false; // something is closing fast: move across quicker
    this.closeBehind = null; // { d, lat } of a car we're about to hit
    const range = 40 + v * 2.2; // look further up the road the faster we go
    let blocker = null, blockerD = Infinity, blockerLine = 0, blockerExtra = 0, beside = null, besideDl = 0, besideExtra = 0;
    // the first seconds after the start the pack is bunched: give everyone more room
    const startGap = sinceGreen < 8 ? 4 : 0;
    for (const o of field) {
      if (o === this.entry) continue;
      const op = o.physics;
      const d = lapDelta(op.trackS, s, L);
      if (d <= -6 || d >= range) continue;
      const dl = op.lateral - car.lateral;
      // a human driver can brake or swerve without warning: more room around the player
      const extra = (o.isPlayer ? 0.4 : 0) + st.room;
      // where our (offset) line will be when we get to it: the line can swing across the
      // road between here and there (Eau Rouge), so judge it there, not here
      const planned = this.line.latAt(s + d) + this.offset;
      const width = 2.6 + extra; // centre to centre: closer than this and we'd touch
      const inPath = (d < 15 && Math.abs(dl) < width) || Math.abs(op.lateral - planned) < width;
      if (d > 4 && inPath) {
        // the speed it's about to slow to: a car ahead brakes for the corner too, and
        // following its present speed is how you run into the back of it
        // (and how hard it's braking already: its speed a moment from now)
        const opNow = Math.max(0, op.speed + Math.min(0, op.longAccel ?? 0) * 0.6);
        const opV = Math.min(opNow, this.line.vAt(op.trackS + 5 + Math.max(0, op.speed) * 0.4));
        const closing = v - opV;
        if (closing > 15 && d < closing * 3) urgent = true; // a slow or stopped car ahead
        // about to hit it: closer than a car's length plus the distance to shed the closing
        // speed (at ~2 g) and a moment to react. Brake, and swerve to the side with room.
        if (Math.abs(dl) < 2.4 && closing > 2 && d < (5.5 + (closing * closing) / 40 + closing * 0.15) * st.late && (!this.closeBehind || d < this.closeBehind.d)) {
          this.closeBehind = { d, lat: op.lateral };
        }
        // don't run into it: be at its speed by the time we're a following gap behind,
        // unless we'll already be clear of it by the time we get there
        const gap = d - ((7 + v * 0.15) * st.gap + startGap + (o.isPlayer ? 3 : 0));
        const safe = Math.sqrt(opV ** 2 + 2 * PARAMS.brakeDecel * 0.6 * Math.max(0, gap));
        if (Math.abs(op.lateral - planned) < width || d < 12) follow = Math.min(follow, gap <= 0 ? opV - 2 : safe);
        // the nearest car we're catching is the one to pass
        const needPass = closing > st.pass || (vt > opV + 2 && d < 20);
        if (needPass && d < blockerD) {
          blocker = op;
          blockerD = d;
          blockerLine = planned - this.offset;
          blockerExtra = extra;
        }
      } else if (Math.abs(d) <= 6 + startGap && Math.abs(dl) < 3.5 + extra && (!beside || Math.abs(dl) < Math.abs(besideDl))) {
        beside = op;
        besideDl = dl;
        besideExtra = extra;
      }
    }
    let want = 0; // offset from the line we'd like (m)
    // off the start: keep to our own side of the grid for the first seconds, blending onto
    // the line, rather than every car converging on it at once
    if (this.gridLat === undefined && sinceGreen > 0) this.gridLat = car.lateral;
    const laneHold = sinceGreen < 3 ? 1 : sinceGreen < 8 ? (8 - sinceGreen) / 5 : 0;
    if (laneHold > 0 && this.gridLat !== undefined) want = clampLat(this.gridLat) - lineLat;
    want *= laneHold;
    // in trouble (getting going again, stuck, off the track or crawling) with a much faster
    // car coming up behind: keep out of its way on the side we're on, rather than rejoin
    // across it. (A car merely accelerating out of a corner doesn't count.)
    let yieldTo = null;
    const offTrack = Math.abs(car.lateral) > P.hw + 0.5;
    if (this.rec || this.stuck > 0.5 || offTrack || (v < 15 && v < this.line.vAt(s) * 0.4)) {
      for (const o of field) {
        if (o === this.entry) continue;
        const d = lapDelta(o.physics.trackS, s, L);
        if (d < -3 && d > -90 && o.physics.speed > v + 8) yieldTo = o;
      }
    }
    if (yieldTo && !blocker) {
      const side = car.lateral >= lineLat ? 1 : -1;
      want = (side > 0 ? limL : limR) - lineLat;
    } else if (laneHold > 0.5) {
      // still sorting out after the start: no dives for a gap, just keep a car's width from
      // anyone alongside
      if (beside) {
        const side = besideDl > 0 ? -1 : 1;
        const apart = clampLat(beside.lateral + side * (3.3 + besideExtra)) - lineLat;
        if (side > 0 ? apart > want : apart < want) want = apart;
      }
    } else if (blocker) {
      // pass on the side with more room, but never across a car alongside us
      // (room and offsets measured where the other car is)
      const there = this.line.limits(s + blockerD);
      const roomL = there.left - blocker.lateral, roomR = blocker.lateral - there.right;
      let side = roomL > roomR ? 1 : -1;
      if (beside) side = besideDl > 0 ? -1 : 1;
      if ((side > 0 ? roomL : roomR) < 3) side = -side; // no room that side after all
      want = Math.max(there.right, Math.min(there.left, blocker.lateral + side * (3.2 + blockerExtra))) - blockerLine;
    } else if (beside) {
      // alongside: hold our side, give each other a car's width
      const side = besideDl > 0 ? -1 : 1; // the other car is left of us: lean right
      want = clampLat(beside.lateral + side * (3.3 + besideExtra)) - lineLat;
    }
    vt = Math.min(vt, follow);
    // emergency: about to run into the back of someone, whatever the plan
    if (this.closeBehind) {
      // brake hard, keep steering for the line (swerving at speed under full braking spun
      // cars into the next one more often than it saved a hit)
      this.brakeNow = true;
    }
    // the profile is for the racing line: off it (passing, giving room) a corner is tighter,
    // so slow down by about what the smaller radius costs: v ~ sqrt(R)
    const off = Math.max(Math.abs(this.offset), Math.abs(want));
    if (off > 0.3) vt *= Math.sqrt(Math.max(0.5, 1 - off * this.line.curvAt(s, 25 + v * 0.6)));
    this.offsetTarget = want;
    const rate = (urgent ? 7 : 2.5) * dt; // m per step the line can move sideways
    this.offset += Math.max(-rate, Math.min(rate, this.offsetTarget - this.offset));

    // --- steering: pure pursuit on the (offset) line ---
    const look = 7 + v * 0.28;
    const ahead = this.line.limits(s + look);
    const tLat = Math.max(ahead.right, Math.min(ahead.left, this.line.latAt(s + look) + this.offset));
    const tgt = P.poseAt(s + look, tLat);
    const aim = Math.atan2(tgt.x - car.position.x, tgt.z - car.position.z);
    const err = Math.atan2(Math.sin(aim - car.yaw), Math.cos(aim - car.yaw));

    // --- recovery: stuck against something or facing the wrong way ---
    const heading = P.heading[P.wrap(car.trackIndex < 0 ? 0 : car.trackIndex)];
    const back = Math.abs(Math.atan2(Math.sin(heading - car.yaw), Math.cos(heading - car.yaw))) > 1.8;
    if (back) this.mistake = null; // spun round: whatever went wrong is over
    if (v < 2 || back) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.resets) {
      this.rec = null;
      if (this.stuck > 3.5) {
        this.stuck = 0;
        this.respawn(field);
        return { steer: 0, throttle: 0, brake: 0 };
      }
    } else {
      if (!this.rec && v > 15 && !back) this.tries = 0; // properly going again
      const r = this.recover(err, back, dt);
      if (r) return r;
    }

    // traction control goes back on after a snap
    const tc = this.tcOff ? (this.tcOff = false, { tc: true }) : {};
    if (this.brakeNow) {
      this.brakeNow = false;
      return { steer: Math.max(-1, Math.min(1, err * 3.5)), throttle: 0, brake: 1, ...tc };
    }
    if (m?.kind === 'snap' && into > m.apex - 5) {
      this.tcOff = true;
      return { steer: Math.max(-1, Math.min(1, err * 3.5)), throttle: 1, brake: 0, tc: false };
    }
    const gain = m?.kind === 'wide' && into > m.apex * 0.6 ? 3.5 * m.under : 3.5;
    return {
      steer: Math.max(-1, Math.min(1, err * gain)),
      throttle: v < vt ? 1 : 0,
      brake: v > vt + 0.3 ? Math.min(1, (v - vt) / 1.5) : 0,
      ...tc,
    };
  }

  /**
   * Once a lap, PIT_DECIDE m before the pit lane turns off the track: stop this time? Yes
   * if the tyres won't make the flag (as worn as this driver lets them get) and won't last
   * another lap before they're past the wear it pits at; or for a new front wing.
   */
  considerPit(s, sinceGreen) {
    const e = this.entry, car = e.physics, race = this.race;
    const g = laneGuide(car.track.pit);
    const dOff = lapDelta(g.offLap, s, car.track.length);
    if (dOff > PIT_DECIDE || dOff < PIT_DECIDE - 250 || this.planLap === e.lap) return;
    this.planLap = e.lap;
    if (sinceGreen < 15 || race.leaderDone || e.retired) return;
    const plan = this.pitPlan(dOff);
    if (!plan) return;
    this.pit = { phase: 'enter', ...plan, served: false };
    e.pitStop.nextCompound = plan.compound;
    e.pitStop.nextWing = plan.wing;
  }

  /** { compound, wing } for a stop this lap, or null to stay out. dOff: m to the pit lane. */
  pitPlan(dOff) {
    const e = this.entry, car = e.physics, st = this.style, L = car.track.length;
    const left = this.race.laps * L - e.progress - dOff; // m from the stop to the flag
    if (left < 0.4 * L) return null; // nearly there: bring it home
    let wear = 0;
    for (const w of car.wheels) wear = Math.max(wear, w.wear);
    // wear per metre on this set: as measured once it has done a few km, else a guess
    const clean = (car.compound.wear * car.wearScale) / 1000;
    const run = e.progress - this.stintFrom;
    const rate = run > 1500 ? Math.max(clean, wear / run) : clean * PIT_SCRUB;
    const wing = car.damage.wing[0] + car.damage.wing[1] > 0.6 && left > L;
    const pitWear = st.pitWear + this.tyreBias, endWear = st.endWear + this.tyreBias;
    const tyres = wear + rate * (dOff + left) > endWear && wear + rate * (dOff + L) > pitWear;
    if (!tyres && !wing) return null;
    // the compound for the rest of the race: one that needs the fewest stops from here
    // (wear rates in proportion to the compounds'), chosen between those by the style's
    // taste in tyres. A rookie sometimes gets it wrong.
    const per = rate / car.compound.wear;
    const stops = (c) => {
      const need = per * c.wear * left;
      return need <= endWear ? 0 : Math.ceil(need / pitWear) - 1;
    };
    const fewest = Math.min(...COMPOUND_LIST.map(stops));
    const w = COMPOUND_LIST.map((c, i) => (stops(c) === fewest ? st.tyres[i] + 0.05 : 0));
    let r = this.rand() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < 2 && (r -= w[i]) > 0) i++;
    let compound = COMPOUND_LIST[i];
    if (this.baseStyle === STYLES.rookie && this.rand() < 0.25) compound = COMPOUND_LIST[Math.floor(this.rand() * 3)];
    return { compound, wing };
  }

  /**
   * Drive a pit stop: across to the pit side and slow for the lane, along the lane under the
   * limiter, into the box and stopped on the marks (the crew holds it), out again and back
   * onto the track. Returns this step's controls, or null once back on the track (or still
   * racing towards the lane).
   */
  pitDrive(field, dt) {
    const e = this.entry, car = e.physics, P = car.track, pit = P.pit, ps = e.pitStop, pt = this.pit;
    const g = laneGuide(pit), L = P.length;
    const s = car.trackS, v = Math.max(0, car.speed);
    const lineLat = this.line.latAt(s);
    const ahead = (d, opV) => (d > 8 ? Math.sqrt(opV ** 2 + 2 * 4 * (d - 8)) : Math.max(0, opV - 2));
    let tgt, vt, look, stopping = false;
    if (pt.phase === 'enter') {
      const dOff = lapDelta(g.offLap, s, L);
      if (dOff <= 0 || car.onPitLane) pt.phase = 'lane';
      else {
        const run = 120 + v * 2.5; // race on until this far out, then cross over and brake
        if (dOff > run) return null;
        const latAt = (d) => {
          const k = Math.min(1, Math.max(0, (run - d) / (run - 40)));
          const l = this.line.latAt(s + (dOff - d));
          return l + (g.offLat - l) * k * k * (3 - 2 * k);
        };
        look = 7 + v * 0.28;
        tgt = look < dOff ? P.poseAt(s + look, latAt(dOff - look)) : pit.poseAt(g.off + look - dOff, 0);
        vt = Math.min(this.line.vAt(s + 3 + v * 0.08) * this.pace, g.approach(dOff - 3 - v * 0.08));
        // cars ahead in the way: don't run into them
        for (const o of field) {
          if (o === e) continue;
          const d = lapDelta(o.physics.trackS, s, L);
          if (d > 3 && d < 70 && Math.abs(o.physics.lateral - latAt(Math.max(0, dOff - d))) < 2.6) vt = Math.min(vt, ahead(d, Math.max(0, o.physics.speed)));
        }
      }
    }
    if (pt.phase === 'lane') {
      const sl = car.pitS;
      // back out on the track at the far end: race from here, merging onto the line gently
      if (sl >= pit.length - 3 || (sl > pit.limitEnd && !car.onPitLane && Math.abs(car.lateral) < P.hw)) {
        this.pit = null;
        const { left, right } = this.line.limits(s);
        this.offset = this.offsetTarget = Math.max(right, Math.min(left, car.lateral)) - lineLat;
        return null;
      }
      const box = ps.box;
      if (ps.state === 'service') return { steer: 0, throttle: 0, brake: 1 };
      if (!pt.served && (ps.state === 'done' || sl > box.s + 2.5)) {
        pt.served = true; // stopped and serviced (or overshot the box: no stop this time)
        if (ps.state === 'done') this.stintFrom = e.progress;
        else this.missedBox = (this.missedBox ?? 0) + 1;
      }
      const latAt = (x) => box.lat * (pt.served ? 1 - smooth(box.s + 4, box.s + 40, x) : smooth(box.s - 50, box.s - 12, x));
      look = 4 + v * 0.3;
      const a = sl + look;
      tgt = a <= pit.length ? pit.poseAt(a, latAt(a)) : P.poseAt(pit.exitS + a - pit.length, Math.max(-P.hw + 2, Math.min(P.hw - 2, pit.mainLat[pit.N - 1])));
      vt = g.vAt(sl + 2 + v * 0.08);
      const dB = box.s - sl;
      if (!pt.served) {
        vt = Math.min(vt, Math.sqrt(2 * PIT_STOP_DECEL * Math.max(0, dB - 0.15)));
        stopping = dB < 25;
      }
      // others in the lane: follow the one ahead, and don't pull out of the box in front of
      // one coming down the fast lane
      const me = pit.query(car.position.x, car.position.z, car.pitIndex);
      for (const o of field) {
        const op = o.physics;
        if (o === e || !op.onPitLane) continue;
        const q = pit.query(op.position.x, op.position.z, op.pitIndex);
        const d = q.s - sl;
        if (d > 0 && d < 45 && Math.abs(q.lateral - latAt(q.s)) < 2.6) vt = Math.min(vt, ahead(d, Math.max(0, op.speed)));
        if (pt.served && dB > -8 && d < 0 && d > -45 && op.speed > 4 && Math.abs(q.lateral) < PIT.hw && Math.abs(me.lateral) > PIT.hw - 1) {
          vt = 0;
          stopping = true;
        }
      }
    }
    const aim = Math.atan2(tgt.x - car.position.x, tgt.z - car.position.z);
    const err = Math.atan2(Math.sin(aim - car.yaw), Math.cos(aim - car.yaw));
    // stuck (not just stopped where it means to be)
    if (v < 2 && !stopping && ps.state !== 'done') this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.resets && this.stuck > 5) {
      this.stuck = 0;
      this.respawn(field);
      return { steer: 0, throttle: 0, brake: 0 };
    }
    if (!this.resets) {
      const r = this.recover(err, false, dt);
      if (r) return r;
    }
    // stopped and meaning to stay stopped: hold it (the brake pedal at a standstill reverses)
    if (vt < 0.3 && Math.abs(car.speed) < 0.5) return { steer: 0, throttle: 0, brake: 0, hold: true };
    return {
      steer: Math.max(-1, Math.min(1, err * 3.5)),
      throttle: v < vt ? 1 : 0,
      brake: vt < 0.3 ? 1 : v > vt + 0.3 ? Math.min(1, (v - vt) / 1.5) : 0,
    };
  }

  /**
   * The tyres' grip against the mediums the profile was learned on: the compound's, less
   * what the wear has cost as far as this driver allows for it.
   */
  tyreGrip(car) {
    const c = car.compound ?? COMPOUNDS.medium;
    let wear = 0, cold = Infinity;
    for (const w of car.wheels) {
      wear += w.wear / 4;
      cold = Math.min(cold, w.temp);
    }
    // and their temperature, against what a medium would have at the same temperature
    // (hards take longer to come in, softs grip sooner). Below its window a compound with
    // less grip than the medium is driven with extra care: in the races, cold hards slid
    // off far more than that difference alone predicts.
    let warm = tempGrip(cold, c.tOpt) / tempGrip(cold, COMPOUNDS.medium.tOpt);
    if (warm < 1) warm **= 1 + 2 * Math.min(1, Math.max(0, (c.tOpt - 10 - cold) / 25));
    // more grip than a medium: only some of it is used (all of it made the softs runaway
    // leaders, and traffic is where the extra speed hurts)
    if (warm * c.grip > 1) warm = (1 + (warm * c.grip - 1) * SOFT_USE) / c.grip;
    return c.grip * warm * (1 - (1 - wearGrip(wear)) * this.style.tyreCare);
  }

  /**
   * No-resets mode: a stuck or spun car gets itself going. It backs away from whatever it
   * is stuck on, steering so the nose swings towards the line, then drives off slowly at
   * up to full lock; facing the wrong way, the two together make a three-point turn and
   * repeat until it points down the track. After RETIRE_TRIES tries in a row that get it
   * nowhere, it retires (Race parks it). Returns this step's controls, or null to drive.
   */
  recover(err, back, dt) {
    const car = this.entry.physics;
    if (!this.rec) {
      if (this.stuck < 1.5) return null;
      // turn the same way for the whole episode: near 180° the shorter way flips back and
      // forth, and the reverse and forward moves would undo each other
      if (this.tries === 0) this.turnDir = err >= 0 ? 1 : -1;
      // back away first only when it's against something or has to turn round
      const reverse = back || car.wallHit > 0 || this.lastFailed;
      this.rec = { phase: reverse ? 'reverse' : 'forward', t: 0, x: car.position.x, z: car.position.z };
    }
    const r = this.rec;
    r.t += dt;
    // facing the wrong way: full lock round; otherwise steer for the line
    const steer = back ? this.turnDir : Math.max(-1, Math.min(1, err * 3.5));
    if (r.phase === 'reverse') {
      if (r.t > 1.8 || (car.wallHit > 0.05 && r.t > 0.4)) {
        r.phase = 'forward';
        r.t = 0;
      }
      // in reverse the nose swings the opposite way to the steering. The brake key backs
      // the car up once it has stopped; hold it under ~9 km/h backwards.
      return { steer: -steer, throttle: 0, brake: car.speed > -2.5 ? 1 : 0 };
    }
    const going = car.speed > 6 && !back;
    if (going || r.t > 4 || (car.wallHit > 0.05 && r.t > 0.5)) {
      // a try counts against the car only if it got nowhere (a crawl through gravel is
      // progress, if slow)
      const moved = Math.hypot(car.position.x - r.x, car.position.z - r.z);
      this.lastFailed = !going && moved < 3;
      this.tries = this.lastFailed ? this.tries + 1 : going ? 0 : this.tries;
      this.rec = null;
      if (this.tries > RETIRE_TRIES) {
        this.entry.retire?.();
        return { steer: 0, throttle: 0, brake: 0 };
      }
      this.stuck = going ? 0 : 1.5; // not going yet: the next try starts at once
      return null;
    }
    return { steer, throttle: car.speed < 8 ? 1 : 0, brake: 0 };
  }

  /** Coast and brake to just off the asphalt on the nearer side, stop, and retire. */
  pullOver() {
    const car = this.entry.physics;
    const P = car.track;
    const v = Math.abs(car.speed);
    this.parking ??= { side: car.lateral >= 0 ? 1 : -1 };
    if (v < 1) {
      this.entry.retire?.();
      return { steer: 0, throttle: 0, brake: 0 };
    }
    const look = 6 + v * 0.3;
    const lim = this.line.limits(car.trackS + look);
    const tgt = P.poseAt(car.trackS + look, this.parking.side > 0 ? lim.left + 1.5 : lim.right - 1.5);
    const aim = Math.atan2(tgt.x - car.position.x, tgt.z - car.position.z);
    const err = Math.atan2(Math.sin(aim - car.yaw), Math.cos(aim - car.yaw));
    return { steer: Math.max(-1, Math.min(1, err * 3)), throttle: 0, brake: v > 12 ? 0.6 : 0.3 };
  }

  /** Put a stuck car back on the racing line, a little behind where it was, out of the way. */
  respawn(field) {
    const car = this.entry.physics;
    const P = car.track;
    let s = car.trackS - 10;
    for (let tries = 0; tries < 10; tries++) {
      const clear = field.every((o) => o === this.entry || Math.abs(lapDelta(o.physics.trackS, s, P.length)) > 25);
      if (clear) break;
      s -= 20;
    }
    const pose = P.poseAt(s, this.line.latAt(s));
    this.entry.respawned(s); // before the reset, which forgets where the car was
    const keep = { compound: car.compound, wear: car.wheels.map((w) => w.wear) };
    car.reset(pose);
    car.compound = keep.compound; // and the same tyres, as worn as they were
    car.wheels.forEach((w, i) => (w.wear = keep.wear[i]));
    this.offset = this.offsetTarget = 0;
    this.mistake = null; // or it's put back inside the same mistake and repeats it
    this.pit = null; // a stop under way is off; the next lap decides again
    this.planLap = null;
    this.entry.pitStop?.reset();
  }
}

/** Car-to-car contacts so far (for scripts/ai-check.mjs): any closing touch, and hard ones (> 5 m/s). */
export const CONTACTS = { touches: 0, hard: 0, involving: new Map() };
let stepNo = 0;

/** Car-to-car contact for every pair in the field. */
export function collideCars(field) {
  stepNo++;
  for (let a = 0; a < field.length; a++) {
    for (let b = a + 1; b < field.length; b++) {
      const hit = collidePair(field[a].physics, field[b].physics);
      if (!hit) continue;
      CONTACTS.touches++;
      if (hit > 5) CONTACTS.hard++;
      for (const e of [field[a], field[b]]) CONTACTS.involving.set(e, (CONTACTS.involving.get(e) ?? 0) + 1);
    }
  }
}

function collidePair(A, B) {
  const dx = B.position.x - A.position.x, dz = B.position.z - A.position.z;
  if (dx * dx + dz * dz > 49) return; // further apart than two car lengths
  if (Math.abs((A.height ?? 0) - (B.height ?? 0)) > 3) return; // Suzuka's crossover: one is on the bridge
  const fa = { x: Math.sin(A.yaw), z: Math.cos(A.yaw) }, fb = { x: Math.sin(B.yaw), z: Math.cos(B.yaw) };
  let best = null;
  for (const oa of CAR_CIRCLES) {
    const ax = A.position.x + fa.x * oa, az = A.position.z + fa.z * oa;
    for (const ob of CAR_CIRCLES) {
      const bx = B.position.x + fb.x * ob, bz = B.position.z + fb.z * ob;
      const ex = bx - ax, ez = bz - az;
      const d = Math.hypot(ex, ez);
      const pen = 2 * CAR_R - d;
      if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: d > 1e-4 ? ex / d : fa.x, nz: d > 1e-4 ? ez / d : fa.z, cx: (ax + bx) / 2, cz: (az + bz) / 2 };
    }
  }
  if (!best) return;
  const { pen, nx, nz } = best; // n points from A to B
  A.position.x -= nx * pen / 2; A.position.z -= nz * pen / 2;
  B.position.x += nx * pen / 2; B.position.z += nz * pen / 2;
  const vr = (B.vel.x - A.vel.x) * nx + (B.vel.z - A.vel.z) * nz; // < 0: closing
  if (vr >= 0) return 0;
  const e = 0.25;
  const j = (-(1 + e) * vr) / 2; // Δv each (equal masses)
  A.vel.x -= nx * j; A.vel.z -= nz * j;
  B.vel.x += nx * j; B.vel.z += nz * j;
  // a little side-to-side friction, so a tap from behind doesn't feel like ice
  const tx = -nz, tz = nx;
  const vt = (B.vel.x - A.vel.x) * tx + (B.vel.z - A.vel.z) * tz;
  const ft = Math.max(-j * 0.3, Math.min(j * 0.3, vt / 2));
  A.vel.x += tx * ft; A.vel.z += tz * ft;
  B.vel.x -= tx * ft; B.vel.z -= tz * ft;
  // spin from where the hit lands (off-centre hits turn the car)
  spin(A, best.cx, best.cz, -nx * j - tx * ft, -nz * j - tz * ft);
  spin(B, best.cx, best.cz, nx * j + tx * ft, nz * j + tz * ft);
  const speed = -vr;
  hurt(A, nx, nz, speed);
  hurt(B, -nx, -nz, speed);
  // a new touch, not the same one carried over: this pair hasn't touched for half a second
  const seen = (A.lastTouch ??= new Map());
  const fresh = stepNo - (seen.get(B) ?? -1e9) > 60;
  seen.set(B, stepNo);
  return fresh && speed > 1 ? speed : 0;
}

/** Yaw kick from an impulse (Δv in m/s, world) applied at world point (cx, cz). */
function spin(car, cx, cz, jx, jz) {
  const rx = cx - car.position.x, rz = cz - car.position.z;
  const f = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) }, l = { x: Math.cos(car.yaw), z: -Math.sin(car.yaw) };
  const a = rx * f.x + rz * f.z, b = rx * l.x + rz * l.z; // contact point in the car frame
  // a +yaw rotation moves the point along (a·left − b·forward)
  const arm = (jx * (a * l.x - b * f.x) + jz * (a * l.z - b * f.z));
  car.yawRate += (arm * MASS * 0.5) / INERTIA;
}

/** Impact sound and (if on) damage for a car hit towards (nx, nz) at `speed` m/s. */
function hurt(car, nx, nz, speed) {
  if (speed > car.impact) {
    car.impact = speed;
    car.impactSide = nx * Math.cos(car.yaw) - nz * Math.sin(car.yaw);
  }
  if (car.damageOn && speed > 3) {
    const sin = Math.sin(car.yaw), cos = Math.cos(car.yaw);
    car.damage.impact(nx * sin + nz * cos, nx * cos - nz * sin, speed * 0.8);
  }
}

/** One car in the race: the player's or an AI's. */
export class Entry {
  constructor({ team, physics, isPlayer = false, gridS = 0 }) {
    this.team = team;
    this.physics = physics;
    this.isPlayer = isPlayer;
    this.driver = null; // AIDriver for AI cars
    this.progress = gridS; // metres since the start line (negative on the grid)
    this.prevS = null;
    this.lap = 0; // laps started (0 = before the line)
    this.finished = false;
    this.finishTime = null;
    this.retired = false; // no-resets mode: gave up, parked where it stopped
    this.position = 0;
    this.stamps = []; // race time when the car first reached each STAMP metres of progress
  }

  /** Track progress along the lap from the car's new position. */
  track(L, time) {
    const s = this.physics.trackS;
    if (this.prevS !== null) this.progress += lapDelta(s, this.prevS, L);
    this.prevS = s;
    const k = Math.floor((this.progress + STAMP_OFFSET) / STAMP);
    for (let j = this.stamps.length; j <= k; j++) this.stamps[j] = time;
  }

  respawned(s) {
    this.progress += lapDelta(s, this.physics.trackS, this.physics.track.length);
    this.prevS = null;
  }
}

/** Pace ladder: the 2025 constructors' order (TEAMS order), quickest first. */
/**
 * Difficulty levels: the leading team's share of the learned speed profile, how much each
 * team down the 2025 constructors' order gives away, and the range of reaction times at
 * the start. The profile itself is near the car's limit (scripts/ai-learn.mjs learns it at
 * 1.02 of it, so even Expert keeps a little margin in traffic).
 */
export const LEVELS = {
  easy: { top: 0.86, spread: 0.005, reaction: [0.3, 0.6] },
  normal: { top: 0.885, spread: 0.005, reaction: [0.2, 0.45] },
  hard: { top: 0.95, spread: 0.004, reaction: [0.15, 0.35] },
  expert: { top: 0.98, spread: 0.0025, reaction: [0.1, 0.22] },
};

/** Pace ladder: the team at `index` in TEAMS order (quickest first) at difficulty `level`. */
export function teamPace(index, level = 'normal') {
  const L = LEVELS[level] ?? LEVELS.normal;
  return L.top - index * L.spread;
}

/**
 * The race: the player plus `opponents` AI cars from the other teams. The grid lines up
 * in pace order with the player at the back (or `playerSlot`).
 */
export class Race {
  constructor(path, playerTeam, playerPhysics, teams, { opponents = 10, laps = 5, level = 'normal', playerSlot = null, seed = (Math.random() * 2 ** 31) | 0, chaos = CHAOS_DEFAULT } = {}) {
    this.path = path;
    this.laps = laps;
    this.line = racingLine(path);
    // tyre wear for the race distance: a set of mediums lasts about MEDIUM_LIFE of the race
    // before it reaches the cliff, so softs want a stop (or two) and hards just about go
    // the distance, slowly
    const raceKm = (laps * path.length) / 1000;
    this.wearScale = Math.min(8, Math.max(0.5, TYRE.cliff[0] / (COMPOUNDS.medium.wear * PIT_SCRUB * MEDIUM_LIFE * raceKm)));
    playerPhysics.wearScale = this.wearScale;
    this.time = 0;
    this.sinceGreen = 0;
    const rivals = teams.filter((t) => t.id !== playerTeam.id).slice(0, opponents);
    const n = rivals.length + 1;
    const pSlot = playerSlot ?? n - 1;
    // deal out the driving styles and starting tyres (a new mix every race)
    const rand = mulberry32(seed);
    const deck = STYLE_DECK.slice(0, rivals.length);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const pickTyre = (w) => {
      const r = rand();
      return r < w[0] ? COMPOUNDS.soft : r < w[0] + w[1] ? COMPOUNDS.medium : COMPOUNDS.hard;
    };
    this.entries = [];
    let k = 0;
    for (let slot = 0; slot < n; slot++) {
      if (slot === pSlot) {
        this.player = new Entry({ team: playerTeam, physics: playerPhysics, isPlayer: true });
        this.player.slot = slot;
        this.entries.push(this.player);
        continue;
      }
      const team = rivals[k++];
      const physics = new CarPhysics(path, path.gridPose(slot));
      const e = new Entry({ team, physics });
      e.slot = slot;
      e.style = STYLES[deck[k - 1] ?? 'balanced'];
      physics.compound = pickTyre(e.style.tyres); // kept through resets and respawns
      physics.wearScale = this.wearScale;
      e.pitStop = new PitStop();
      e.pitStop.setBox(path.pit, teams.findIndex((t) => t.id === team.id)); // the team's own box
      e.retire = () => {
        if (e.retired || e.finished) return;
        e.retired = true;
        this.onRetire?.(e);
      };
      const ti = teams.indexOf(team);
      e.driver = new AIDriver(e, this.line, {
        pace: teamPace(ti, level),
        reaction: (([a, b]) => a + (b - a) * (((slot * 37) % 10) / 9))((LEVELS[level] ?? LEVELS.normal).reaction),
        seed: slot * 7919 + 13 + seed,
        style: e.style,
      });
      e.driver.race = this;
      this.entries.push(e);
    }
    this.finishOrder = [];
    this.setChaos(chaos);
    this.reset();
  }

  /** The AI chaos setting (0..1, see chaosSpread): applies at once, mid-race too. */
  setChaos(c) {
    this.chaos = c;
    const v = chaosSpread(c);
    for (const e of this.entries) if (!e.isPlayer) e.driver.setSpread(v);
  }

  get ai() {
    return this.entries.filter((e) => !e.isPlayer);
  }

  /** Back to the grid. The player's physics is reset by the caller. */
  reset() {
    this.time = 0;
    this.sinceGreen = 0;
    this.finishOrder = [];
    this.leaderDone = false;
    for (const e of this.entries) {
      const pose = this.path.gridPose(e.slot);
      if (!e.isPlayer) {
        e.physics.reset(pose);
      }
      // grid slot sits behind the line: progress starts negative
      e.progress = -(11 + e.slot * 8);
      e.prevS = null;
      e.stamps = [];
      e.lap = 0;
      e.finished = false;
      e.finishTime = null;
      e.flagAt = undefined;
      e.retired = false;
      e.stops = 0;
      e.pitStop?.reset();
      if (e.driver) {
        e.driver.pit = null;
        e.driver.planLap = null;
        e.driver.stintFrom = e.progress;
        e.driver.gridLat = undefined;
        e.driver.offset = e.driver.offsetTarget = 0;
        e.driver.stuck = 0;
        e.driver.rec = null;
        e.driver.tries = 0;
        e.driver.parking = null;
        e.driver.mistake = null;
      }
    }
    this.rank();
  }

  /** The grid pose of the player's slot. */
  playerGrid() {
    return this.path.gridPose(this.player.slot);
  }

  /**
   * Step every AI car (the player's car is stepped by the caller first), then car-to-car
   * contact, progress and positions. settings.takeover: an AI entry the player is driving
   * with settings.controls instead of its driver.
   */
  stepAI(holding, dt, settings = {}) {
    this.time += dt;
    if (!holding) this.sinceGreen += dt;
    for (const e of this.entries) {
      if (e.isPlayer) continue;
      const p = e.physics;
      if (settings.damage !== undefined) p.damageOn = settings.damage;
      if (settings.resets !== undefined) e.driver.resets = settings.resets;
      // retired: abandoned where it stopped, brakes on and the engine off. Another car can
      // still shove it (collideCars), and its tyres scrub it to a stop
      if (e.retired) {
        p.step({ steer: 0, throttle: 0, brake: 1, parked: true }, dt);
        continue;
      }
      // finished: cruise round at a gentle pace
      const human = e === settings.takeover;
      let ctl = human ? { ...settings.controls } : e.driver.drive(this.entries, holding ? 0 : this.sinceGreen, dt);
      if (e.finished && !human) {
        ctl.throttle = p.speed < 35 ? ctl.throttle : 0;
      }
      // in its box: the crew holds the car until the stop is done
      if (e.pitStop) {
        ctl = e.pitStop.update(p, ctl, dt);
        if (e.pitStop.released) {
          e.stops++;
          this.onPit?.(e);
        }
      }
      p.step(holding ? { ...ctl, hold: true } : ctl, dt);
    }
    collideCars(this.entries);
    const L = this.path.length;
    for (const e of this.entries) {
      e.track(L, this.time);
      const lap = Math.floor(e.progress / L) + 1; // lap 1 starts at the line
      if (lap > e.lap && e.progress >= 0) e.lap = lap;
      if (!e.finished && !e.retired && e.progress >= (e.flagAt ?? this.laps * L)) {
        e.finished = true;
        e.finishTime = this.sinceGreen;
        this.finishOrder.push(e);
        if (!this.leaderDone) {
          // the leader has the flag: everyone else finishes the next time they cross the line
          this.leaderDone = true;
          for (const o of this.entries) if (!o.finished && !o.retired) o.flagAt = Math.min(this.laps * L, (Math.floor(o.progress / L) + 1) * L);
        }
        this.onFinish?.(e, this.finishOrder.length);
      }
    }
    this.rank();
  }

  rank() {
    const sorted = [...this.entries].sort((a, b) => {
      if (a.finished && b.finished) return this.finishOrder.indexOf(a) - this.finishOrder.indexOf(b);
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.retired !== b.retired) return a.retired ? 1 : -1; // retired cars at the bottom
      return b.progress - a.progress;
    });
    sorted.forEach((e, i) => (e.position = i + 1));
    this.order = sorted;
  }

  /** Time gap (s) from `e` back to `ahead`: how long ago `ahead` was where `e` is now. */
  gapTo(e, ahead) {
    const k = Math.floor((e.progress + STAMP_OFFSET) / STAMP);
    const t = ahead.stamps[k];
    return t === undefined ? 0 : Math.max(0, this.time - t);
  }
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
