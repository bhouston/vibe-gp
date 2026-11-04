// Trackside barriers: concrete walls carrying advertising boards, tyre barriers with a
// conveyor-belt facing on the outside of corners, and debris (catch) fences on top of
// the main walls. Collision stays on the TrackPath wall lines: where there are tyres,
// that line is the belt's front face and the concrete is drawn further back.
import * as THREE from 'three/webgpu';
import {
  color, float, vec2, vec3, uv, mix, step, fract, abs, smoothstep, fwidth, floor, hash, length,
  positionWorld, mx_noise_float,
} from 'three/tsl';
import { ribbonGeometry, boxGeometry } from './geometry.js';
import { adBoardColor, AD_ASPECT } from './ads.js';
import { WALL_THICKNESS, flagRuns } from './trackPath.js';

export const WALL_HEIGHT = 1.1;
export const WALL_FOOT = 0.5; // walls reach this far below the road, so they never float over the grass
const TYRE_TOP = 1.0; // five tyres high
const BELT_TOP = 1.06;
const FENCE_BASE = WALL_HEIGHT - 0.05;
const FENCE_KNEE = 3.6; // where the fence starts to lean in over the track
const FENCE_TOP = 4.2;
const FENCE_LEAN = 0.5;
const POST_PITCH = 3.5;
// advertising band on the wall face (m above the road)
const AD_LOW = 0.2, AD_HIGH = 0.88;
const AD_LEN = (AD_HIGH - AD_LOW) * AD_ASPECT;

/** Unit surface normal of a road sloping by `grade` along the unit tangent (tx, tz). */
export function slopeNormal(grade, tx, tz) {
  const l = Math.hypot(grade, 1);
  return [(-grade * tx) / l, 1 / l, (-grade * tz) / l];
}

/** Concatenate indexed geometries with position/normal/uv into one. */
export function mergeGeometries(geos) {
  const pos = [], nor = [], uvs = [], ind = [];
  for (const g of geos) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uvs.push(...g.attributes.uv.array);
    for (const i of g.index.array) ind.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(ind);
  out.computeBoundingSphere();
  return out;
}

/**
 * Barrier along a polyline [[x, z, footY], ...]: both faces, the top, and end caps on
 * open lines. uv.x = metres along (mirrored on one face so lettering reads the right way
 * round from either side), uv.y = 0 (road level) .. 1 (top).
 */
export function polyWallGeometry(pts, closed, height = WALL_HEIGHT, thickness = WALL_THICKNESS) {
  const n = pts.length;
  const t = thickness / 2;
  const at = (k) => pts[closed ? (k + n) % n : Math.min(Math.max(k, 0), n - 1)];
  const side = [], dist = [0];
  for (let k = 0; k < n; k++) {
    const a = at(k - 1), b = at(k + 1);
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    side.push([dz / l, -dx / l]); // left normal
    if (k) dist.push(dist[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  }
  const count = closed ? n + 1 : n;
  const idx = (k) => k % n;
  const u = (k) => (k === n ? dist[n - 1] + Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) : dist[k]);
  const p = (k, off, y) => [pts[idx(k)][0] + side[idx(k)][0] * off, (pts[idx(k)][2] ?? 0) + y, pts[idx(k)][1] + side[idx(k)][1] * off];
  const v0 = -WALL_FOOT / height;
  const geos = [];
  for (const sgn of [1, -1]) {
    // seen from the left-normal side, distance along the line runs right to left
    geos.push(ribbonGeometry(count, (k) => ({
      a: p(k, sgn * t, -WALL_FOOT), b: p(k, sgn * t, height),
      na: [side[idx(k)][0] * sgn, 0, side[idx(k)][1] * sgn],
      uva: [-sgn * u(k), v0], uvb: [-sgn * u(k), 1],
    })));
  }
  geos.push(ribbonGeometry(count, (k) => ({
    a: p(k, -t, height), b: p(k, t, height), na: [0, 1, 0], uva: [u(k), 1], uvb: [u(k), 1],
  })));
  if (!closed) {
    for (const k of [0, n - 1]) {
      const a = at(k), b = at(k === 0 ? 1 : n - 2);
      const dx = a[0] - b[0], dz = a[1] - b[1], l = Math.hypot(dx, dz) || 1;
      geos.push(ribbonGeometry(2, (m) => ({
        a: p(k, (m * 2 - 1) * t, -WALL_FOOT), b: p(k, (m * 2 - 1) * t, height),
        na: [dx / l, 0, dz / l], uva: [u(k), v0], uvb: [u(k), 1],
      })));
    }
  }
  return mergeGeometries(geos);
}

// ---------------------------------------------------------------- materials

/**
 * Concrete barrier: scuffed lower edge, a run of sponsor boards, and a painted top
 * band in the track's kerb colours. Expects polyWallGeometry uvs.
 */
export function concreteWallMaterial([ca, cb] = [0xc81414, 0xf5f5f5], seed = 0) {
  const m = new THREE.MeshStandardNodeMaterial();
  const h = uv().y.mul(WALL_HEIGHT); // metres above the road
  const along = uv().x;
  const p = positionWorld;
  const grain = mx_noise_float(p.mul(4.0)).mul(0.05);
  const blotch = mx_noise_float(p.mul(0.35)).mul(0.06);
  let c = color(0xc9c6bd).add(grain).sub(blotch);
  // tyre rubber and dirt near the foot, streaky along the wall
  const scuff = smoothstep(0.35, 0.0, h).mul(mx_noise_float(vec3(along.mul(0.7), h.mul(6.0), 0)).mul(0.5).add(0.5));
  c = mix(c, color(0x2b2a28), scuff.mul(0.55));
  const inAd = step(AD_LOW, h).mul(step(h, AD_HIGH));
  const ad = adBoardColor(along.add(100000), h.sub(AD_LOW).div(AD_HIGH - AD_LOW), AD_LEN, seed);
  c = mix(c, ad, inAd);
  const stripe = step(0.5, fract(along.div(3.0)));
  const band = step(0.96, h);
  c = mix(c, mix(color(ca), color(cb), stripe), band);
  m.colorNode = c;
  m.roughnessNode = mix(float(0.85), float(0.45), inAd); // boards are glossy vinyl
  m.metalnessNode = float(0.0);
  return m;
}

/** Rubber conveyor belt over the tyre stack: panels in two colours, bolted straps. */
function beltMaterial([ca, cb]) {
  const m = new THREE.MeshStandardNodeMaterial();
  const along = uv().x, v = uv().y;
  const panel = step(0.5, fract(along.div(4.0)));
  let c = mix(color(ca), color(cb), panel);
  const strap = step(abs(fract(along.div(1.0)).sub(0.5)), 0.025);
  c = mix(c, c.mul(0.55), strap);
  const bolt = strap.mul(step(abs(fract(v.mul(4.0)).sub(0.5)), 0.08));
  c = mix(c, color(0x9a9a9a), bolt);
  const wear = smoothstep(0.3, 0.0, v).mul(0.4); // rubber marks low down
  m.colorNode = mix(c, color(0x1a1a1a), wear);
  m.roughnessNode = float(0.75);
  return m;
}

/** Tops of stacked tyres seen from above: uv.x along (m), uv.y back from the belt (m). */
function tyreTopMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const D = 0.62; // tyre pitch
  const cell = uv().div(D);
  const rowShift = step(0.5, fract(floor(cell.y).mul(0.5))).mul(0.5); // staggered rows
  const cx = cell.x.add(rowShift);
  const f = fract(vec2(cx, cell.y)).sub(0.5);
  const r = length(f).mul(D); // metres from the tyre's centre
  const tread = smoothstep(0.155, 0.165, r).mul(smoothstep(0.305, 0.295, r));
  const id = floor(cx).add(floor(cell.y).mul(131)).add(100000);
  const painted = step(0.82, hash(id)); // the odd white-painted tyre
  const rubber = mix(color(0x1b1b1c), color(0xd8d8d8), painted);
  const hole = color(0x050505), gap = color(0x0b0b0a);
  const c = mix(mix(gap, hole, smoothstep(0.31, 0.29, r)), rubber, tread);
  m.colorNode = c;
  m.roughnessNode = float(0.9);
  return m;
}

/**
 * Debris fence: diamond wire mesh with horizontal cables. Wires are antialiased with
 * fwidth and fade to their average coverage in the distance (no shimmering moiré).
 * uv.x = metres along, uv.y = metres up the fence.
 */
function fenceMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const line = (coord, half) => {
    const d = abs(fract(coord.add(0.5)).sub(0.5));
    const w = fwidth(coord);
    const sharp = float(1).sub(smoothstep(half.sub(w), half.add(w), d));
    return mix(sharp, half.mul(2), smoothstep(0.2, 0.6, w));
  };
  const cell = 0.075;
  const a = uv().x.add(uv().y).div(cell * 2);
  const b = uv().x.sub(uv().y).div(cell * 2);
  const wires = float(1).sub(float(1).sub(line(a, float(0.08))).mul(float(1).sub(line(b, float(0.08)))));
  const cables = line(uv().y.div(0.4), float(0.03));
  const alpha = float(1).sub(float(1).sub(wires).mul(float(1).sub(cables)));
  m.colorNode = color(0x8c9094);
  m.metalnessNode = float(0.6);
  m.roughnessNode = float(0.45);
  m.opacityNode = alpha.mul(0.9);
  m.transparent = true;
  m.depthWrite = false;
  m.side = THREE.DoubleSide;
  return m;
}

// ---------------------------------------------------------------- builder

/**
 * Builds every barrier mesh for a TrackPath into `group`. `kerbColors` theme the wall
 * top bands and belts.
 */
export function buildBarriers(P, group, kerbColors = [0xc81414, 0xf5f5f5]) {
  const wallMat = concreteWallMaterial(kerbColors);
  const belt = beltMaterial([kerbColors[0], 0xf2f2f2]);
  const tyreTop = tyreTopMaterial();
  const fence = fenceMaterial();
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x6d7175, roughness: 0.5, metalness: 0.7 });
  const add = (geo, mat, shadow = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.castShadow = shadow;
    group.add(m);
    return m;
  };
  const posts = []; // [x, y, z, ax, az (along), ox, oz (away from the track)]

  for (const line of P.walls) {
    if (!line.render) continue;
    if (line.kind !== 'main') {
      add(polyWallGeometry(line.pts, line.closed), wallMat);
      continue;
    }
    const s = line.side;
    const tyre = s > 0 ? P.tyreL : P.tyreR;
    const wall = s > 0 ? P.wallL : P.wallR;
    const idx = line.idx;
    const n = idx.length;
    // concrete, pushed back behind any tyres
    const at = (i, lat) => [P.px[i] + P.leftX(i) * s * lat, P.pz[i] + P.leftZ(i) * s * lat];
    const pts = idx.map((i) => [...at(i, wall[i] + tyre[i]), P.py[i]]);
    add(polyWallGeometry(pts, line.closed), wallMat);

    // tyre stacks: belt face on the collision line's front, tops back to the concrete
    const front = (i) => wall[i] - WALL_THICKNESS / 2;
    const flags = idx.map((i) => tyre[i] > 0);
    for (const [k0, count0] of flagRuns(flags, line.closed)) {
      // include one sample either side so the stack closes onto the wall
      const k0e = line.closed ? k0 - 1 : Math.max(0, k0 - 1);
      const kEnd = line.closed ? k0 + count0 : Math.min(n - 1, k0 + count0);
      const count = kEnd - k0e + 1;
      const I = (k) => idx[(((k0e + k) % n) + n) % n];
      const sAlong = (k) => (k0e + k) * P.ds;
      const nTrack = (i) => [-P.leftX(i) * s, 0, -P.leftZ(i) * s];
      add(ribbonGeometry(count, (k) => {
        const i = I(k), [ax, az] = at(i, front(i) - 0.02);
        return { a: [ax, P.py[i] - WALL_FOOT, az], b: [ax, P.py[i] + BELT_TOP, az], na: nTrack(i), uva: [sAlong(k), 0], uvb: [sAlong(k), 1] };
      }), belt);
      add(ribbonGeometry(count, (k) => {
        const i = I(k), [ax, az] = at(i, front(i) - 0.02), [bx, bz] = at(i, front(i) + 0.14);
        return { a: [ax, P.py[i] + BELT_TOP, az], b: [bx, P.py[i] + BELT_TOP, bz], na: [0, 1, 0], uva: [sAlong(k), 1], uvb: [sAlong(k), 1] };
      }), belt);
      add(ribbonGeometry(count, (k) => {
        const i = I(k), [ax, az] = at(i, front(i)), [bx, bz] = at(i, front(i) + tyre[i] + 0.05);
        return {
          a: [ax, P.py[i] + TYRE_TOP, az], b: [bx, P.py[i] + TYRE_TOP, bz],
          na: slopeNormal(P.grade[i], P.tx[i], P.tz[i]), uva: [sAlong(k), 0], uvb: [sAlong(k), tyre[i] + 0.05],
        };
      }), tyreTop);
    }

    // catch fence on the concrete: vertical, then leaning in over the track
    const count = line.closed ? n + 1 : n;
    const I = (k) => idx[k % n];
    const base = (k) => at(I(k), wall[I(k)] + tyre[I(k)]);
    const dist = [0];
    for (let k = 1; k < count; k++) {
      const [ax, az] = base(k - 1), [bx, bz] = base(k);
      dist.push(dist[k - 1] + Math.hypot(bx - ax, bz - az));
    }
    const nT = (k) => [-P.leftX(I(k)) * s, 0, -P.leftZ(I(k)) * s];
    const vertical = ribbonGeometry(count, (k) => {
      const i = I(k), [x, z] = base(k);
      return { a: [x, P.py[i] + FENCE_BASE, z], b: [x, P.py[i] + FENCE_KNEE, z], na: nT(k), uva: [dist[k], 0], uvb: [dist[k], FENCE_KNEE - FENCE_BASE] };
    });
    const leanLen = Math.hypot(FENCE_TOP - FENCE_KNEE, FENCE_LEAN);
    const lean = ribbonGeometry(count, (k) => {
      const i = I(k), [x, z] = base(k), [x2, z2] = at(i, wall[i] + tyre[i] - FENCE_LEAN);
      const up = FENCE_KNEE - FENCE_BASE;
      return { a: [x, P.py[i] + FENCE_KNEE, z], b: [x2, P.py[i] + FENCE_TOP, z2], na: nT(k), uva: [dist[k], up], uvb: [dist[k], up + leanLen] };
    });
    const f = new THREE.Mesh(mergeGeometries([vertical, lean]), fence);
    f.renderOrder = 1;
    group.add(f);
    // posts every POST_PITCH metres
    let next = 0;
    for (let k = 0; k < count; k++) {
      if (dist[k] < next) continue;
      next = dist[k] + POST_PITCH;
      const i = I(k), [x, z] = base(k);
      posts.push([x, P.py[i], z, P.tx[i], P.tz[i], P.leftX(i) * s, P.leftZ(i) * s]);
    }
  }

  if (posts.length) {
    const geo = postGeometry();
    const mesh = new THREE.InstancedMesh(geo, steel, posts.length);
    const m = new THREE.Matrix4();
    posts.forEach(([x, y, z, ax, az, ox, oz], k) => {
      // local +Z = away from the track, +Y up; pick X so the basis is right-handed
      const X = new THREE.Vector3(ax, 0, az), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(ox, 0, oz);
      if (new THREE.Vector3().crossVectors(X, Y).dot(Z) < 0) X.negate();
      m.makeBasis(X, Y, Z).setPosition(x, y, z);
      mesh.setMatrixAt(k, m);
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

/** One fence post: upright from the wall top to the knee, then an arm leaning over the track (-Z). */
function postGeometry() {
  const up = boxGeometry(0.1, FENCE_KNEE - FENCE_BASE + 0.3, 0.1);
  up.translate(0, (FENCE_KNEE + FENCE_BASE - 0.3) / 2, 0);
  const len = Math.hypot(FENCE_TOP - FENCE_KNEE, FENCE_LEAN);
  const arm = boxGeometry(0.09, len + 0.06, 0.09);
  arm.rotateX(-Math.atan2(FENCE_LEAN, FENCE_TOP - FENCE_KNEE));
  arm.translate(0, (FENCE_KNEE + FENCE_TOP) / 2, -FENCE_LEAN / 2);
  return mergeGeometries([up, arm]);
}
