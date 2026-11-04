// Run-off planning from the track's own geometry: a rough speed profile, the corners, how
// much run-off each corner needs on its outside, and (for circuits without hand-placed
// lists in src/tracks/runoff.js) where gravel traps and sausage kerbs go.
//
// Pure maths on a TrackPath part-way through construction (needs the centreline, curvature,
// hw, runoff and pit), so Node scripts can use it too.

import { KERB_WIDTH } from './trackPath.js';

const VMAX = 92; // m/s, top speed for the profile
const LAT = { base: 13.5 * 0.85, aero: 0.0057 * 0.85 }; // usable lateral accel a(v) = base + aero v² (m/s²)
const CORNER_K = 1 / 250; // curvature that counts as a corner (1/m)
const MAX_EXTRA = 31; // most extra run-off on top of the default (m): ~45 m in all
const PIT_CLEAR = 25; // keep widened walls this far from the pit lane centreline (garages, apron)

/** Rough corner-limited speed profile (m/s) with braking and traction limits, lap-periodic. */
export function speedProfile(P) {
  const N = P.N, ds = P.ds, v = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const k = Math.abs(P.curvature[i]);
    v[i] = k <= LAT.aero ? VMAX : Math.min(VMAX, Math.sqrt(LAT.base / (k - LAT.aero)));
  }
  for (let pass = 0; pass < 2; pass++) {
    // braking (aero helps at speed), then traction (fades at speed)
    for (let i = N - 1; i >= 0; i--) {
      const j = P.wrap(i + 1);
      v[i] = Math.min(v[i], Math.sqrt(v[j] ** 2 + 2 * (12 + 0.004 * v[j] ** 2) * ds));
    }
    for (let i = 1; i <= N; i++) {
      const j = i - 1, ii = P.wrap(i);
      v[ii] = Math.min(v[ii], Math.sqrt(v[j] ** 2 + 2 * Math.max(2, 12 - 0.11 * v[j]) * ds));
    }
  }
  return v;
}

/**
 * Corners: runs of one-signed curvature past CORNER_K, merged across short straight gaps.
 * Each: { i0, i1 (samples, i1 may run past N), apex, sign (+1 = left turn), radius,
 *   vC (slowest speed in it), vE (fastest speed in the 250 m before it) }.
 */
export function findCorners(P, v) {
  const N = P.N, ds = P.ds, k = P.curvature;
  const sgn = (i) => (Math.abs(k[P.wrap(i)]) > CORNER_K ? Math.sign(k[P.wrap(i)]) : 0);
  let s0 = 0;
  while (s0 < N && sgn(s0) !== 0) s0++;
  if (s0 === N) {
    // no straight anywhere (an oval): start where the turn changes direction, if it ever does
    s0 = 0;
    while (s0 < N && sgn(s0) === sgn(s0 - 1)) s0++;
    if (s0 === N) s0 = 0; // one endless corner
  }
  const runs = [];
  for (let i = s0; i < s0 + N; ) {
    const s = sgn(i);
    if (!s) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < s0 + N && sgn(j + 1) === s) j++;
    runs.push({ i0: i, i1: j, sign: s });
    i = j + 1;
  }
  // merge same-direction runs split by a short almost-straight gap (a long double-apex corner)
  const gap = Math.round(20 / ds);
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.sign === r.sign && r.i0 - last.i1 <= gap) last.i1 = r.i1;
    else merged.push({ ...r });
  }
  const lookBack = Math.round(250 / ds);
  return merged
    .filter((r) => (r.i1 - r.i0 + 1) * ds >= 6)
    .map((r) => {
      let apex = r.i0, km = 0, vC = Infinity, vE = 0;
      for (let i = r.i0; i <= r.i1; i++) {
        const a = Math.abs(k[P.wrap(i)]);
        if (a > km) [km, apex] = [a, i];
        vC = Math.min(vC, v[P.wrap(i)]);
      }
      for (let i = r.i0 - lookBack; i <= r.i0; i++) vE = Math.max(vE, v[P.wrap(i)]);
      return { ...r, apex: P.wrap(apex), radius: 1 / km, vC, vE };
    });
}

/**
 * Wall offsets wanted on each side before anything squeezes them: the default run-off,
 * widened on the outside of each corner by how fast cars arrive there (a car that goes
 * straight on at the end of a 300 km/h straight needs far more room than one that runs
 * wide out of a hairpin). Ramped in before the corner and out after its exit.
 * scale: 0 = no widening (street circuits), 1 = full.
 */
export function wantedWalls(P, corners, scale) {
  const N = P.N, ds = P.ds;
  const base = P.hw + KERB_WIDTH + P.runoff;
  const L = new Float64Array(N).fill(base), R = new Float64Array(N).fill(base);
  if (scale > 0) {
    for (const c of corners) {
      const vOut = Math.max(c.vE, c.vC);
      const extra = Math.min(MAX_EXTRA, Math.max(0, 0.45 * (vOut - 30))) * scale;
      if (extra < 1) continue;
      const out = c.sign > 0 ? R : L; // a left turn's outside is on the right
      const a = c.i0 - Math.round(40 / ds), b = c.i1 + Math.round((30 + 0.5 * c.vC) / ds);
      for (let i = a; i <= b; i++) {
        const w = P.wrap(i);
        out[w] = Math.max(out[w], base + extra);
      }
    }
  }
  // ramp the steps: the wall swings out and back in over ~30 m
  const win = Math.max(1, Math.round(15 / ds));
  return { L: blur(L, win), R: blur(R, win), base };
}

/**
 * Pull widened walls (beyond `base`) back in wherever the run-off would reach another part
 * of the circuit or the pit lane. Marches out along the normal and stops before the first
 * point that is too close: to the road itself for nearby stretches (an S-bend curling back),
 * or into the run-off of a separate stretch, or onto the pit lane and garages.
 */
export function clearWidened(P, wl, wr, base) {
  const N = P.N, ds = P.ds;
  const cell = 25, grid = new Map();
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const add = (x, z, item) => {
    const kk = key(x, z);
    if (!grid.has(kk)) grid.set(kk, []);
    grid.get(kk).push(item);
  };
  for (let i = 0; i < N; i++) add(P.px[i], P.pz[i], i);
  const pit = P.pit;
  if (pit) for (let j = 0; j < pit.N; j++) add(pit.px[j], pit.pz[j], -1 - j);
  const reach = Math.max(base, PIT_CLEAR) + MAX_EXTRA + 2;
  const roadClear = P.hw + KERB_WIDTH + 3;
  const ok = (i, x, z, t) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), r = Math.ceil(reach / cell);
    for (let gx = cx - r; gx <= cx + r; gx++) {
      for (let gz = cz - r; gz <= cz + r; gz++) {
        const list = grid.get(`${gx},${gz}`);
        if (!list) continue;
        for (const j of list) {
          if (j < 0) {
            const q = -1 - j;
            if (Math.hypot(pit.px[q] - x, pit.pz[q] - z) < PIT_CLEAR) return false;
            continue;
          }
          if (j === i) continue;
          const dx = x - P.px[j], dz = z - P.pz[j];
          const d = Math.hypot(dx, dz);
          if (d >= reach) continue;
          const sd = Math.abs(i - j) * ds, sdist = Math.min(sd, P.length - sd);
          let need;
          if (sdist < 2 * t + 30) need = roadClear; // the same stretch curling back
          else {
            const facing = dx * P.leftX(j) + dz * P.leftZ(j) > 0 ? wl[j] : wr[j];
            need = Math.max(base, Math.min(facing, base + MAX_EXTRA)) + 1;
          }
          if (d < need) return false;
        }
      }
    }
    return true;
  };
  for (const [side, wall] of [[1, wl], [-1, wr]]) {
    for (let i = 0; i < N; i++) {
      if (wall[i] <= base + 0.5) continue;
      const lx = P.leftX(i) * side, lz = P.leftZ(i) * side;
      let t = base;
      while (t + 2 <= wall[i] && ok(i, P.px[i] + lx * (t + 2), P.pz[i] + lz * (t + 2), t + 2)) t += 2;
      if (t + 2 > wall[i] && ok(i, P.px[i] + lx * wall[i], P.pz[i] + lz * wall[i], wall[i])) t = wall[i];
      wall[i] = t;
    }
  }
}

/**
 * Gravel traps and sausage kerbs placed by style, as runoff.js entries
 * ([lap fraction, 'L' | 'R' | 'apexes', from, to]):
 *   gravel:  a classic circuit: gravel on the outside of nearly every corner
 *   mixed:   gravel where cars arrive fast or brake hard, the rest grass
 *   asphalt: a modern circuit with paved run-off: gravel only beyond the fastest corners,
 *            sausage kerbs behind the exit kerbs of the slow ones (track limits)
 *   street:  walls everywhere: only sausage kerbs in the chicanes, where there is room
 * Every style gets sausages on the apexes of tight chicanes.
 */
export function autoSurfaces(P, corners, style) {
  const traps = [], sausages = [];
  if (!style) return { traps, sausages };
  const N = P.N, ds = P.ds, f = (i) => P.wrap(i) / N;
  const side = (c, outside) => ((c.sign > 0) === outside ? 'R' : 'L');
  // the fastest corners (by speed through them) always get gravel unless it's a street circuit
  const fastest = [...corners].sort((p, q) => q.vC - p.vC).slice(0, 2);
  for (const c of corners) {
    const len = (c.i1 - c.i0) * ds;
    const want = style === 'gravel' ? c.vE > 30
      : style === 'mixed' ? c.vC > 38 || c.vE > 75 || fastest.includes(c)
      : style === 'asphalt' ? c.vC > 42 || fastest.includes(c)
      : false;
    // (apex-relative metres; an endless corner, the oval, is gravelled the whole way round)
    const a = Math.max((c.i0 - c.apex) * ds - 20, -P.length / 2), b = (c.i1 - c.apex) * ds;
    if (want) traps.push([f(c.apex), side(c, true), a, Math.min(b + 25 + 0.6 * c.vC, P.length / 2)]);
    // exit sausage on slow corners of paved-run-off circuits, a car's length past the kerb
    if (style === 'asphalt' && c.vC < 22 && len < 120) sausages.push([f(c.apex), side(c, true), b + 6, b + 20]);
  }
  // chicanes: consecutive opposite turns, both tight, apexes close together
  const tight = style === 'street' ? 50 : 90, close = style === 'street' ? 70 : 110;
  for (let n = 0; n < corners.length; n++) {
    const c = corners[n], d = corners[(n + 1) % corners.length];
    if (c === d || c.sign === d.sign || c.radius > tight || d.radius > tight) continue;
    const gap = P.wrap(d.apex - c.apex) * ds;
    if (gap > close) continue;
    sausages.push([f(c.apex), 'apexes', -18, gap + 18]);
  }
  return { traps, sausages };
}

/** Moving average over ±w samples, periodic. */
function blur(a, w) {
  const N = a.length, out = new Float64Array(N);
  let sum = 0;
  for (let k = -w; k <= w; k++) sum += a[((k % N) + N) % N];
  for (let i = 0; i < N; i++) {
    out[i] = sum / (2 * w + 1);
    sum += a[(i + w + 1) % N] - a[(((i - w) % N) + N) % N];
  }
  // full width through the corner itself; the ramp sits before and after it
  for (let i = 0; i < N; i++) out[i] = Math.max(out[i], a[i]);
  return out;
}
