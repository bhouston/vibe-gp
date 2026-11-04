// Spectator grandstands: placed opposite the pits on the start straight and on the
// outside of the biggest corners wherever there's room, each a stepped concrete stand
// with coloured seats, a cantilevered roof, sponsor fascias and an instanced crowd.
import * as THREE from 'three/webgpu';
import {
  color, float, vec3, uv, mix, step, fract, abs, sin, time, attribute, positionLocal, max,
} from 'three/tsl';
import { ribbonGeometry } from './geometry.js';
import { mergeGeometries } from './barriers.js';
import { adBoardColor } from './ads.js';
import { PIT } from './trackPath.js';
import { simpleMaterial } from './materials.js';

const ROW_DEPTH = 0.85, ROW_RISE = 0.42, FRONT = 1.6; // front wall height above the floor
const SEAT_PITCH = 0.55;
const AISLE_EVERY = 14, AISLE_WIDTH = 1.2;
const SETBACK = 7; // gap from the barrier's concrete to the stand front (m)
const PLINTH = 4; // structure reaches this far below the floor

// shirt colours: team colours, flag colours and plenty of everyday ones
const SHIRTS = [0xe10600, 0xdc0000, 0x1e41ff, 0x0b1f4b, 0xff8000, 0xf2f2f2, 0x111111, 0xf2c200, 0x6b6b6b,
  0x2e7d32, 0x88c5ff, 0xc2185b, 0xffffff, 0x203a72, 0x8d6e63];
const PANTS = [0x1c2433, 0x111111, 0x2f3b52, 0x6b5b45, 0x3a3a3a, 0xc8b99a];
const SKIN = [0xf1d1b5, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21, 0xffdbac];
const SEATS = [0x1e41ff, 0xd81e1e, 0x1f7a3a, 0x8a8f96, 0xff8000, 0x1d2a4d];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Chooses stand sites: { i, side, L, rows, main }. A site must keep clear of every part
 * of the circuit and the pit lane, and the ground under it must be fairly level.
 */
function chooseSites(P) {
  const N = P.N, ds = P.ds;
  const sites = [];
  const out = (i, side) => (side > 0 ? P.wallL[i] + P.tyreL[i] : P.wallR[i] + P.tyreR[i]);
  const frame = (i, side) => {
    const lx = P.leftX(i) * side, lz = P.leftZ(i) * side;
    const d = out(i, side) + SETBACK;
    return { ox: P.px[i] + lx * d, oz: P.pz[i] + lz * d, ax: P.tx[i], az: P.tz[i], dx: lx, dz: lz };
  };
  // nearest centreline sample within 60 m (null if none): a spatial grid, as
  // P.query() scans the whole lap
  const CELL = 30, grid = new Map(), key = (cx, cz) => cx * 65536 + cz;
  for (let i = 0; i < N; i++) {
    const k = key(Math.floor(P.px[i] / CELL), Math.floor(P.pz[i] / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const nearest = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -1, bd = 60 * 60;
    for (let gx = cx - 2; gx <= cx + 2; gx++) {
      for (let gz = cz - 2; gz <= cz + 2; gz++) {
        for (const i of grid.get(key(gx, gz)) ?? []) {
          const d = (P.px[i] - x) ** 2 + (P.pz[i] - z) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
    }
    if (best < 0) return null;
    return { i: best, lateral: (x - P.px[best]) * P.leftX(best) + (z - P.pz[best]) * P.leftZ(best) };
  };
  const fits = (i, side, L, depth) => {
    const f = frame(i, side);
    // level enough?
    const half = Math.round(L / 2 / ds);
    let lo = Infinity, hi = -Infinity;
    for (let k = -half; k <= half; k++) {
      const h = P.py[P.wrap(i + k)];
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    if (hi - lo > 4) return null;
    for (let x = -L / 2; x <= L / 2 + 0.1; x += 8) {
      for (const z of [-1, depth / 2, depth + 2]) {
        const wx = f.ox + f.ax * x + f.dx * z, wz = f.oz + f.az * x + f.dz * z;
        const q = nearest(wx, wz);
        if (q && Math.abs(q.lateral) < out(q.i, q.lateral >= 0 ? 1 : -1) + 4) return null;
        if (P.pit) {
          const pq = P.pit.query(wx, wz);
          const d = Math.hypot(wx - P.pit.px[pq.j], wz - P.pit.pz[pq.j]);
          if (d < P.pit.outerHw(pq.j) + PIT.wallClear + 24) return null;
        }
      }
    }
    return { ...f, y0: lo - 0.6 };
  };
  const clearOfOthers = (f, L, depth) => sites.every((o) => {
    const d = Math.hypot(f.ox + f.dx * depth / 2 - (o.f.ox + o.f.dx * o.depth / 2), f.oz + f.dz * depth / 2 - (o.f.oz + o.f.dz * o.depth / 2));
    return d > (L + o.L) / 2 + 8;
  });
  const tryAdd = (i, side, lengths, rows, main) => {
    const depth = rows * ROW_DEPTH;
    for (const L of lengths) {
      const f = fits(i, side, L, depth);
      if (f && clearOfOthers(f, L, depth)) {
        sites.push({ i, side, L, rows, depth, main, f });
        return true;
      }
    }
    return false;
  };

  // main grandstand facing the grid, across from the pits
  let mainSide = P.pit ? -P.pit.side : null;
  if (mainSide === null) {
    let k = 0;
    for (let i = 0; i < N; i++) k += P.curvature[i];
    mainSide = k > 0 ? -1 : 1; // outside of a mostly-left (or right) loop
  }
  const iMain = P.wrap(-Math.round(50 / ds));
  tryAdd(iMain, mainSide, [150, 120, 90, 60], 16, true) || tryAdd(iMain, -mainSide, [120, 90, 60], 16, true);

  // corners, tightest first, spaced out around the lap
  const cands = [];
  const step = Math.max(1, Math.round(15 / ds));
  for (let i = 0; i < N; i += step) {
    const k = P.curvature[i];
    if (Math.abs(k) < 1 / 250) continue;
    cands.push({ i, side: k > 0 ? -1 : 1, score: Math.abs(k) });
  }
  cands.sort((a, b) => b.score - a.score);
  const maxStands = Math.min(10, Math.max(3, Math.round(P.length / 650)));
  const gap = 220;
  for (const c of cands) {
    if (sites.length >= maxStands) break;
    const far = sites.every((o) => {
      const d = Math.abs(c.i - o.i) * ds;
      return Math.min(d, P.length - d) > gap;
    });
    if (far) tryAdd(c.i, c.side, [90, 70, 50], 12, false);
  }
  return sites;
}

// ---------------------------------------------------------------- materials

function concreteMaterial() {
  return simpleMaterial(0xbdb9b0, 0.85);
}

/** Seat rows: uv.x = metres along, uv.y = 0 (front) .. 1 (back) of a tread. */
function seatMaterial(seatHex) {
  const m = new THREE.MeshStandardNodeMaterial();
  const x = fract(uv().x.div(SEAT_PITCH));
  const seat = step(0.08, x).mul(step(x, 0.92)).mul(step(0.4, uv().y)).mul(step(uv().y, 0.9));
  m.colorNode = mix(color(0xa9a59c), color(seatHex), seat);
  m.roughnessNode = mix(float(0.85), float(0.4), seat);
  return m;
}

function adMaterial(seed) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = adBoardColor(uv().x.add(100000), uv().y, 6.4, seed);
  m.roughnessNode = float(0.45);
  return m;
}

/**
 * Crowd: per-instance shirt, trousers and skin colours (instanced attributes), and the
 * excitable ones bounce. Geometry carries `part`: 0 shirt, 0.5 trousers, 1 skin.
 */
function crowdMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const part = attribute('part', 'float');
  const shirt = attribute('cShirt', 'vec3'), pants = attribute('cPants', 'vec3'), skin = attribute('cSkin', 'vec3');
  const legs = step(0.25, part).mul(step(part, 0.75));
  const head = step(0.75, part);
  m.colorNode = mix(mix(shirt, pants, legs), skin, head);
  m.roughnessNode = float(0.85);
  const anim = attribute('cAnim', 'vec2'); // x: phase, y: 1 = cheering
  const bounce = max(sin(time.mul(9).add(anim.x.mul(40))), 0).mul(0.12).mul(anim.y);
  m.positionNode = positionLocal.add(vec3(0, bounce, 0));
  return m;
}

// ---------------------------------------------------------------- geometry

/** Axis-aligned quad helper for the stand's local frame (-Z faces the track). */
function quad(a0, b0, a1, b1, n, uv0 = [0, 0], uv1 = [1, 1]) {
  return ribbonGeometry(2, (k) => ({
    a: k ? a1 : a0, b: k ? b1 : b0, na: n,
    uva: [k ? uv1[0] : uv0[0], uv0[1]], uvb: [k ? uv1[0] : uv0[0], uv1[1]],
  }));
}

/** A seated spectator facing -Z, origin on the tread under the seat. */
function personGeometry() {
  const parts = [];
  const box = (w, h, d, x, y, z, part) => parts.push({ w, h, d, x, y, z, part });
  box(0.4, 0.58, 0.26, 0, 0.77, 0.04, 0); // torso
  box(0.44, 0.14, 0.2, 0, 0.98, 0.04, 0); // shoulders
  box(0.2, 0.24, 0.22, 0, 1.22, 0.02, 1); // head
  box(0.36, 0.14, 0.44, 0, 0.42, -0.18, 0.5); // thighs
  box(0.32, 0.42, 0.12, 0, 0.21, -0.38, 0.5); // shins
  box(0.1, 0.36, 0.1, 0.24, 0.62, -0.08, 0); // arms
  box(0.1, 0.36, 0.1, -0.24, 0.62, -0.08, 0);
  const geos = [], partArr = [];
  for (const p of parts) {
    const g = ribbonBox(p.w, p.h, p.d);
    g.translate(p.x, p.y, p.z);
    for (let k = 0; k < g.attributes.position.count; k++) partArr.push(p.part);
    geos.push(g);
  }
  const geo = mergeGeometries(geos);
  geo.setAttribute('part', new THREE.Float32BufferAttribute(partArr, 1));
  return geo;
}

/** Box without its bottom face (never seen), centred on the origin. */
function ribbonBox(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  return mergeGeometries([
    quad([-x, -y, -z], [-x, y, -z], [x, -y, -z], [x, y, -z], [0, 0, -1]),
    quad([-x, -y, z], [-x, y, z], [x, -y, z], [x, y, z], [0, 0, 1]),
    quad([-x, -y, -z], [-x, y, -z], [-x, -y, z], [-x, y, z], [-1, 0, 0]),
    quad([x, -y, -z], [x, y, -z], [x, -y, z], [x, y, z], [1, 0, 0]),
    quad([-x, y, -z], [-x, y, z], [x, y, -z], [x, y, z], [0, 1, 0]),
  ]);
}

/**
 * One stand in its local frame: x along (-L/2..L/2), y up from the floor, z from the
 * front (0) back to `depth`. Returns { concrete, seats, ads, roof, columns } geometries.
 */
function standGeometry(L, rows) {
  const h = L / 2;
  const depth = rows * ROW_DEPTH;
  const yRow = (r) => FRONT + r * ROW_RISE;
  const top = yRow(rows - 1);
  const roofBack = top + 3.4, roofFront = top + 4.4, roofZ0 = depth * 0.22, roofZ1 = depth + 0.6;
  const concrete = [], seats = [], ads = [], roof = [], columns = [];
  // front wall: concrete with a sponsor fascia
  concrete.push(quad([-h, -PLINTH, 0], [-h, FRONT - 1.0, 0], [h, -PLINTH, 0], [h, FRONT - 1.0, 0], [0, 0, -1]));
  ads.push(quad([-h, FRONT - 1.0, -0.01], [-h, FRONT - 0.1, -0.01], [h, FRONT - 1.0, -0.01], [h, FRONT - 0.1, -0.01], [0, 0, -1], [h, 0], [-h, 1])); // u reversed: seen from the track, +X runs leftwards
  concrete.push(quad([-h, FRONT - 0.1, 0], [-h, FRONT, 0], [h, FRONT - 0.1, 0], [h, FRONT, 0], [0, 0, -1]));
  for (let r = 0; r < rows; r++) {
    const z0 = r * ROW_DEPTH, z1 = z0 + ROW_DEPTH, y = yRow(r);
    seats.push(quad([-h, y, z0], [-h, y, z1], [h, y, z0], [h, y, z1], [0, 1, 0], [-h, 0], [h, 1]));
    if (r) concrete.push(quad([-h, yRow(r - 1), z0], [-h, y, z0], [h, yRow(r - 1), z0], [h, y, z0], [0, 0, -1]));
    // stepped end walls
    for (const sx of [-1, 1]) concrete.push(quad([sx * h, -PLINTH, z0], [sx * h, y, z0], [sx * h, -PLINTH, z1], [sx * h, y, z1], [sx, 0, 0]));
  }
  // back wall, outside and in (the inside shows above the top row, under the roof)
  concrete.push(quad([-h, -PLINTH, depth], [-h, roofBack, depth], [h, -PLINTH, depth], [h, roofBack, depth], [0, 0, 1]));
  concrete.push(quad([-h, top, depth - 0.02], [-h, roofBack, depth - 0.02], [h, top, depth - 0.02], [h, roofBack, depth - 0.02], [0, 0, -1]));
  for (const sx of [-1, 1]) concrete.push(quad([sx * h, top, depth - 0.3], [sx * h, roofBack, depth - 0.3], [sx * h, top, depth], [sx * h, roofBack, depth], [sx, 0, 0]));
  // roof: slab rising towards the front, with a fascia board on its leading edge
  const yr = (z) => roofBack + ((roofZ1 - z) / (roofZ1 - roofZ0)) * (roofFront - roofBack);
  const T = 0.35;
  const slope = (roofFront - roofBack) / (roofZ1 - roofZ0);
  const nUp = new THREE.Vector3(0, 1, slope).normalize().toArray();
  roof.push(quad([-h - 1, yr(roofZ0), roofZ0], [-h - 1, yr(roofZ1), roofZ1], [h + 1, yr(roofZ0), roofZ0], [h + 1, yr(roofZ1), roofZ1], nUp));
  roof.push(quad([-h - 1, yr(roofZ0) - T, roofZ0], [-h - 1, yr(roofZ1) - T, roofZ1], [h + 1, yr(roofZ0) - T, roofZ0], [h + 1, yr(roofZ1) - T, roofZ1], nUp.map((v) => -v)));
  roof.push(quad([-h - 1, yr(roofZ1) - T, roofZ1], [-h - 1, yr(roofZ1), roofZ1], [h + 1, yr(roofZ1) - T, roofZ1], [h + 1, yr(roofZ1), roofZ1], [0, 0, 1]));
  for (const sx of [-1, 1]) {
    const x = sx * (h + 1);
    roof.push(quad([x, yr(roofZ0) - T, roofZ0], [x, yr(roofZ0), roofZ0], [x, yr(roofZ1) - T, roofZ1], [x, yr(roofZ1), roofZ1], [sx, 0, 0]));
  }
  const yF = yr(roofZ0);
  ads.push(quad([-h - 1, yF - 1.1, roofZ0 - 0.02], [-h - 1, yF + 0.05, roofZ0 - 0.02], [h + 1, yF - 1.1, roofZ0 - 0.02], [h + 1, yF + 0.05, roofZ0 - 0.02], [0, 0, -1], [h + 1, 0], [-h - 1, 1]));
  // steel columns behind the back wall, and raking roof beams
  const nCol = Math.max(2, Math.round(L / 12) + 1);
  for (let c = 0; c < nCol; c++) {
    const x = -h + (c / (nCol - 1)) * L;
    columns.push(ribbonBoxAt(0.35, roofBack + PLINTH, 0.35, x, (roofBack - PLINTH) / 2, depth + 0.3));
    const len = Math.hypot(roofZ1 - roofZ0, roofFront - roofBack);
    const beam = ribbonBox(0.25, 0.5, len);
    beam.rotateX(Math.atan(slope));
    beam.translate(x, (yr(roofZ0) + yr(roofZ1)) / 2 - T - 0.25, (roofZ0 + roofZ1) / 2);
    columns.push(beam);
  }
  return {
    concrete: mergeGeometries(concrete), seats: mergeGeometries(seats), ads: mergeGeometries(ads),
    roof: mergeGeometries(roof), columns: mergeGeometries(columns), depth, yRow,
  };
}

function ribbonBoxAt(w, hgt, d, x, y, z) {
  const g = ribbonBox(w, hgt, d);
  g.translate(x, y, z);
  return g;
}

// ---------------------------------------------------------------- builder

/**
 * Adds grandstands and their crowd to `group`. Returns footprints
 * [{ ox, oz, ax, az, dx, dz, L, depth }] (origin at front centre, a = along, d = away
 * from the track) so cameras can keep out of them.
 */
export function buildGrandstands(P, group) {
  const sites = chooseSites(P);
  if (!sites.length) return [];
  const rand = rng(Math.round(P.length * 10));
  const concrete = concreteMaterial();
  const roofMat = simpleMaterial(0xe4e6e8, 0.45, 0.3);
  const steel = simpleMaterial(0x5c6066, 0.5, 0.7);
  const people = []; // { m: Matrix4, shirt, pants, skin, anim }
  const footprints = [];
  const local = new THREE.Matrix4(), person = new THREE.Matrix4();
  sites.forEach((site, n) => {
    const { f, L, rows } = site;
    const geo = standGeometry(L, rows);
    // local +Z = away from the track, +Y up, X picked so the basis is right-handed
    const X = new THREE.Vector3(f.ax, 0, f.az), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(f.dx, 0, f.dz);
    if (new THREE.Vector3().crossVectors(X, Y).dot(Z) < 0) X.negate();
    const frame = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(f.ox, f.y0, f.oz);
    const stand = new THREE.Group();
    stand.matrixAutoUpdate = false;
    stand.matrix.copy(frame);
    const seatHex = SEATS[Math.floor(rand() * SEATS.length)];
    const parts = [
      [geo.concrete, concrete, false], [geo.seats, seatMaterial(seatHex), false],
      [geo.ads, adMaterial(n * 17 + 3), false], [geo.roof, roofMat, true], [geo.columns, steel, true],
    ];
    for (const [g, mat, cast] of parts) {
      const m = new THREE.Mesh(g, mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      stand.add(m);
    }
    group.add(stand);
    footprints.push({ ox: f.ox, oz: f.oz, ax: f.ax, az: f.az, dx: f.dx, dz: f.dz, L, depth: geo.depth });

    // crowd: fuller in the main stand; each stand leans towards one colour (team fans)
    const fill = site.main ? 0.92 : 0.8;
    const favourite = SHIRTS[Math.floor(rand() * 5)];
    for (let r = 0; r < rows; r++) {
      for (let x = -L / 2 + 0.4; x <= L / 2 - 0.4; x += SEAT_PITCH) {
        if ((x + L / 2) % AISLE_EVERY < AISLE_WIDTH) continue;
        if (rand() > fill) continue;
        const yaw = (rand() - 0.5) * 0.5;
        local.makeRotationY(yaw).setPosition(x + (rand() - 0.5) * 0.08, geo.yRow(r), r * ROW_DEPTH + 0.52);
        person.multiplyMatrices(frame, local);
        const shirt = rand() < 0.3 ? favourite : SHIRTS[Math.floor(rand() * SHIRTS.length)];
        people.push({
          m: person.clone(),
          shirt,
          pants: PANTS[Math.floor(rand() * PANTS.length)],
          skin: SKIN[Math.floor(rand() * SKIN.length)],
          anim: [rand(), rand() < 0.18 ? 1 : 0],
        });
      }
    }
  });

  const geo = personGeometry();
  const count = people.length;
  const shirt = new Float32Array(count * 3), pants = new Float32Array(count * 3), skin = new Float32Array(count * 3);
  const anim = new Float32Array(count * 2);
  const c = new THREE.Color();
  const crowd = new THREE.InstancedMesh(geo, crowdMaterial(), count);
  people.forEach((p, k) => {
    crowd.setMatrixAt(k, p.m);
    c.setHex(p.shirt).toArray(shirt, k * 3);
    c.setHex(p.pants).toArray(pants, k * 3);
    c.setHex(p.skin).toArray(skin, k * 3);
    anim.set(p.anim, k * 2);
  });
  geo.setAttribute('cShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  geo.setAttribute('cPants', new THREE.InstancedBufferAttribute(pants, 3));
  geo.setAttribute('cSkin', new THREE.InstancedBufferAttribute(skin, 3));
  geo.setAttribute('cAnim', new THREE.InstancedBufferAttribute(anim, 2));
  crowd.computeBoundingSphere();
  crowd.receiveShadow = true;
  group.add(crowd);
  return footprints;
}
