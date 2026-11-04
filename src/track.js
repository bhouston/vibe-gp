// Builds the 3D circuit (terrain, road, kerbs, walls, start gantry, grid) for any track
// definition, using the centreline maths in trackPath.js. Everything follows the
// track's height profile (TrackPath.py); the road is level across its width.
import * as THREE from 'three/webgpu';
import { boxGeometry, ribbonGeometry, planeXZ } from './geometry.js';
import {
  asphaltMaterial, kerbMaterial, grassMaterial, wallMaterial, checkerMaterial, simpleMaterial,
} from './materials.js';
import { color, float, uv, mix, step, abs, fract, positionWorld, mx_noise_float, mx_fractal_noise_float } from 'three/tsl';
import { TrackPath, KERB_WIDTH, WALL_THICKNESS, PIT, angleDiff } from './trackPath.js';
import { TEAMS } from './teams.js';

const WALL_HEIGHT = 1.1;
const WALL_FOOT = 0.5; // walls reach this far below the road, so they never float over the grass
const TERRAIN_DROP = 0.6; // terrain sits this far below the verges around the track
const VERGE = 1.5; // flat grass beyond the wall (m)
const SKIRT = 6; // then a grass skirt slopes down under the terrain over this width (m)

/** Unit surface normal of a road sloping by `grade` along the unit tangent (tx, tz). */
function slopeNormal(grade, tx, tz) {
  const l = Math.hypot(grade, 1);
  return [(-grade * tx) / l, 1 / l, (-grade * tz) / l];
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Barrier along a polyline [[x, z], ...]: both faces, the top, and end caps on open
 * lines. uv.x = metres along, uv.y = 0 (foot) .. 1 (top), as wallMaterial expects.
 */
function polyWallGeometry(pts, closed, height, thickness) {
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
  // y is relative to each point's own foot height (pts[k][2]); the foot is sunk WALL_FOOT
  const p = (k, off, y) => [pts[idx(k)][0] + side[idx(k)][0] * off, (pts[idx(k)][2] ?? 0) + y, pts[idx(k)][1] + side[idx(k)][1] * off];
  const v0 = -WALL_FOOT / height;
  const geos = [];
  for (const sgn of [1, -1]) {
    geos.push(ribbonGeometry(count, (k) => ({
      a: p(k, sgn * t, -WALL_FOOT), b: p(k, sgn * t, height),
      na: [side[idx(k)][0] * sgn, 0, side[idx(k)][1] * sgn],
      uva: [u(k), v0], uvb: [u(k), 1],
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

/** Concatenate indexed geometries with position/normal/uv into one. */
function mergeGeometries(geos) {
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
 * Pit lane surface. uv.x = metres along the lane, uv.y = metres across from the lane
 * centre towards the garages. White line on the track side, white line between the
 * fast lane and the working lane, yellow pit-box dividers in front of each garage.
 * Drawn on top where the lane overlaps the track at the merges.
 */
function pitLaneMaterial(garageStart, pitch, garages) {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const grain = mx_noise_float(p.mul(9.0)).mul(0.5).add(0.5);
  const patches = mx_fractal_noise_float(p.mul(0.08), 3).mul(0.5).add(0.5);
  const tarmac = mix(color(0x2c2d30), color(0x3d3e42), grain.mul(0.6).add(patches.mul(0.4)));
  const across = uv().y, along = uv().x;
  const working = step(PIT.hw + 0.1, across); // working lane in front of the garages
  let c = mix(tarmac, color(0x55565a).add(grain.mul(0.05)), working);
  const white = step(across, -PIT.hw + 0.25).add(step(abs(across.sub(PIT.hw)), 0.1)).clamp(0, 1);
  c = mix(c, color(0xe8e8e8), white);
  if (garages > 0) {
    const t = along.sub(garageStart).div(pitch);
    const inBoxes = step(0, t).mul(step(t, garages)).mul(working);
    const divider = step(abs(fract(t.add(0.5)).sub(0.5)), 0.12 / pitch);
    c = mix(c, color(0xf2c200), divider.mul(inBoxes));
  }
  m.colorNode = c;
  m.roughnessNode = float(0.85).sub(grain.mul(0.08));
  m.metalnessNode = float(0.0);
  return layered(m, 2);
}

/** Draw a flat ground-level material on top of the layers below it (see build()). */
function layered(m, level) {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -level;
  m.polygonOffsetUnits = -level * 2;
  return m;
}

export class Track {
  constructor(def) {
    this.def = def;
    this.path = new TrackPath(def);
    this.group = new THREE.Group();
    this.build();
    this.tvCams = this.placeTvCams();
  }

  build() {
    const P = this.path;
    const g = this.group;

    // ground: a terrain heightfield following the track's height, and flat grass verges
    // at road level out past the walls (the terrain drops just below them)
    const grass = grassMaterial();
    const ground = new THREE.Mesh(this.terrainGeometry(), grass);
    ground.receiveShadow = true;
    g.add(ground);
    for (const geo of this.vergeGeometries()) g.add(this.mesh(geo, grass));

    // asphalt: uv.x = metres along, uv.y = 0 (right edge) .. 1 (left edge)
    // Flat layers a few cm apart are below depth precision from a high or distant camera,
    // so they are also layered with polygon offset: grass < road < kerbs / pit lane < paint.
    const road = this.strip(-P.hw, P.hw, 0.02, (lat) => (lat + P.hw) / P.width);
    g.add(this.mesh(road, layered(asphaltMaterial(), 1)));

    // kerbs on each side of every corner run (none where the pit wall or pit lane takes their place)
    const kerbMat = layered(kerbMaterial(1 / 4, this.def.kerb?.colors), 2); // one stripe pair every 4 m
    for (const side of [1, -1]) {
      for (const [i0, count] of this.runs(side > 0 ? P.kerbL : P.kerbR)) {
        const a = side * P.hw, bEdge = side * (P.hw + KERB_WIDTH);
        g.add(this.mesh(this.strip(a, bEdge, 0.04, (lat) => Math.abs(lat), i0, count), kerbMat));
      }
    }

    // barrier walls: every polyline from the track path (track walls, pit wall, pit lane walls)
    const wallMat = wallMaterial(1 / 6);
    for (const line of P.walls) {
      if (line.render) g.add(this.mesh(polyWallGeometry(line.pts, line.closed, WALL_HEIGHT, WALL_THICKNESS), wallMat));
    }

    if (P.pit) this.buildPitLane();

    // start line, gantry, grid boxes
    const start = P.poseAt(0);
    const line = new THREE.Mesh(
      planeXZ(-P.hw, -0.6, P.hw, 0.6, 0.03),
      layered(checkerMaterial(P.width / 0.6, 2), 3),
    );
    line.position.set(start.x, start.y, start.z);
    line.rotation.set(-Math.atan(start.grade), start.yaw, 0, 'YXZ');
    line.receiveShadow = true;
    g.add(line);
    g.add(this.gantry(start));
    g.add(this.gridSlots());

    g.traverse((o) => {
      if (o.isMesh && o !== ground) o.receiveShadow = true;
    });
  }

  mesh(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    return m;
  }

  /** Contiguous index runs where flags[i] is set: [[start, count], ...] (wraps). */
  runs(flags) {
    const N = flags.length;
    if (flags.every((f) => f)) return [[0, N + 1]];
    let start = flags.findIndex((f) => !f); // begin scanning just after a gap
    const out = [];
    let runStart = -1;
    for (let k = 1; k <= N; k++) {
      const i = (start + k) % N;
      if (flags[i] && runStart < 0) runStart = i;
      if (!flags[i] && runStart >= 0) {
        out.push([runStart, (i - runStart + N) % N + 1]);
        runStart = -1;
      }
    }
    if (runStart >= 0) out.push([runStart, (start - runStart + N) % N + 1]);
    return out;
  }

  /** Strip between two lateral offsets, `y` above the road. uvY(lat) maps offset -> uv.y. */
  strip(latA, latB, y, uvY, i0 = 0, count = this.path.N + 1) {
    const P = this.path;
    return ribbonGeometry(count, (k) => {
      const i = P.wrap(i0 + k);
      const s = (i0 + k) * P.ds;
      const lx = P.leftX(i), lz = P.leftZ(i), h = P.py[i] + y;
      return {
        a: [P.px[i] + lx * latA, h, P.pz[i] + lz * latA],
        b: [P.px[i] + lx * latB, h, P.pz[i] + lz * latB],
        na: slopeNormal(P.grade[i], P.tx[i], P.tz[i]),
        uva: [s, uvY(latA)],
        uvb: [s, uvY(latB)],
      };
    });
  }

  /**
   * Grass at road level beside the track (centre out to just past each wall) and beside
   * the pit lane, each edged with a skirt sloping down under the terrain. Widths are
   * capped on the inside of bends so the strips never fold over themselves.
   */
  vergeGeometries() {
    const P = this.path, pit = P.pit;
    const geos = [];
    // one side of a path: flat from the centre to edge(k), then down to outer(k)
    const side = (count, at, edge, outer) => {
      geos.push(ribbonGeometry(count, (k) => {
        const c = at(k);
        return { a: c.p(0, 0), b: c.p(edge(k), 0), na: c.n, uva: [0, 0], uvb: [0, 0] };
      }));
      geos.push(ribbonGeometry(count, (k) => {
        const c = at(k);
        return { a: c.p(edge(k), 0), b: c.p(outer(k), -TERRAIN_DROP - 0.4), na: c.n, uva: [0, 0], uvb: [0, 0] };
      }));
    };
    const insideCap = (k, sgn) => (sgn * k > 0 ? 0.9 / Math.abs(k) : Infinity);

    const mainAt = (k) => {
      const i = P.wrap(k);
      const lx = P.leftX(i), lz = P.leftZ(i), h = P.py[i];
      return { n: slopeNormal(P.grade[i], P.tx[i], P.tz[i]), p: (lat, dy) => [P.px[i] + lx * lat, h + dy, P.pz[i] + lz * lat] };
    };
    for (const sgn of [1, -1]) {
      const wall = sgn > 0 ? P.wallL : P.wallR;
      const minEdge = P.hw + KERB_WIDTH + 0.5;
      const cap = (k) => insideCap(P.curvature[P.wrap(k)], sgn);
      const edge = (k) => sgn * Math.max(minEdge, Math.min(wall[P.wrap(k)] + VERGE, cap(k)));
      const outer = (k) => sgn * Math.max(Math.abs(edge(k)) + 0.5, Math.min(wall[P.wrap(k)] + VERGE + SKIRT, cap(k)));
      side(P.N + 1, mainAt, edge, outer);
    }

    if (pit) {
      const kp = new Float64Array(pit.N); // lane curvature (+ = turning left)
      for (let j = 1; j < pit.N - 1; j++) kp[j] = angleDiff(pit.heading[j + 1], pit.heading[j - 1]) / (2 * pit.ds);
      const laneAt = (j) => {
        const lx = pit.leftX(j), lz = pit.leftZ(j), h = pit.py[j];
        return { n: slopeNormal(pit.grade[j], pit.tx[j], pit.tz[j]), p: (lat, dy) => [pit.px[j] + lx * lat, h + dy, pit.pz[j] + lz * lat] };
      };
      for (const sgn of [1, -1]) {
        // the garage side reaches back under the garage block
        const width = sgn === pit.outer ? (j) => pit.outerHw(j) + PIT.wallClear + 20 : () => PIT.hw + 4;
        const cap = (j) => insideCap(kp[j], sgn);
        const edge = (j) => sgn * Math.max(PIT.hw + 0.5, Math.min(width(j), cap(j)));
        const outer = (j) => sgn * Math.max(Math.abs(edge(j)) + 0.5, Math.min(width(j) + SKIRT, cap(j)));
        side(pit.N, laneAt, edge, outer);
      }
    }
    return geos;
  }

  /**
   * Terrain heightfield (10 m grid). Within each path's corridor it sits TERRAIN_DROP
   * below the lowest nearby road (hidden under the verges); further out it blends over
   * ~150 m into a smooth inverse-distance interpolation of the whole track's heights.
   */
  terrainGeometry() {
    const P = this.path, pit = P.pit;
    const CELL = 50, BLEND = 150;
    // reference points { x, z, h, r }: r = corridor half-width that stays under the verges
    const refs = [];
    for (let i = 0; i < P.N; i += 2) {
      refs.push({ x: P.px[i], z: P.pz[i], h: P.py[i], r: Math.max(P.wallL[i], P.wallR[i]) + VERGE + SKIRT });
    }
    if (pit) {
      for (let j = 0; j < pit.N; j += 4) {
        refs.push({ x: pit.px[j], z: pit.pz[j], h: pit.py[j], r: pit.outerHw(j) + PIT.wallClear + 20 + SKIRT });
      }
    }
    const grid = new Map();
    const key = (cx, cz) => cx * 100003 + cz;
    let rMax = 0;
    for (const p of refs) {
      rMax = Math.max(rMax, p.r);
      const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(p);
    }
    const far = [];
    const farStep = Math.max(1, Math.round(25 / P.ds));
    for (let i = 0; i < P.N; i += farStep) far.push([P.px[i], P.pz[i], P.py[i]]);
    const L2 = 120 * 120;

    const b = P.bounds();
    const pad = 800, step = 10;
    const x0 = b.minX - pad, z0 = b.minZ - pad;
    const nx = Math.ceil((b.maxX + pad - x0) / step) + 1, nz = Math.ceil((b.maxZ + pad - z0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const reach = Math.ceil((rMax + BLEND) / CELL);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = x0 + ix * step, z = z0 + iz * step;
        const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
        let inside = Infinity, eMin = Infinity, ws = 0, hs = 0;
        for (let gx = cx - reach; gx <= cx + reach; gx++) {
          for (let gz = cz - reach; gz <= cz + reach; gz++) {
            const list = grid.get(key(gx, gz));
            if (!list) continue;
            for (const p of list) {
              const e = Math.hypot(p.x - x, p.z - z) - p.r;
              if (e < 0) inside = Math.min(inside, p.h);
              else if (e < BLEND) {
                const w = Math.exp(-e / 25);
                ws += w;
                hs += w * p.h;
                eMin = Math.min(eMin, e);
              }
            }
          }
        }
        let y;
        if (inside < Infinity) y = inside - TERRAIN_DROP;
        else {
          let fw = 0, fh = 0;
          for (const [px, pz, ph] of far) {
            const w = 1 / ((px - x) ** 2 + (pz - z) ** 2 + L2);
            fw += w;
            fh += w * ph;
          }
          const hFar = fh / fw;
          if (ws > 0) {
            const t = smoothstep(0, BLEND, eMin);
            y = (hs / ws - TERRAIN_DROP) * (1 - t) + hFar * t;
          } else y = hFar;
        }
        const o = (iz * nx + ix) * 3;
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = z;
      }
    }
    const index = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let n = 0;
    for (let iz = 0; iz < nz - 1; iz++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iz * nx + ix, c = a + nx;
        index.set([a, c, a + 1, a + 1, c, c + 1], n); // counter-clockwise seen from above
        n += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nx * nz * 2), 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /** Pit lane asphalt and markings, speed-limit lines and the garage block. */
  buildPitLane() {
    const pit = this.path.pit;
    const g = this.group;
    const o = pit.outer; // garage side, as a sign on the lane's left normal
    const nGar = PIT.garages;
    const gLen = pit.garageEnd - pit.garageStart;
    const pitch = gLen > 0 ? gLen / nGar : PIT.garagePitch;

    // lane surface: uv.x = metres along the lane, uv.y = metres across towards the garages
    const lane = ribbonGeometry(pit.N, (j) => {
      const inner = -PIT.hw, outer = pit.outerHw(j);
      const lx = pit.leftX(j) * o, lz = pit.leftZ(j) * o;
      return {
        a: [pit.px[j] + lx * inner, pit.py[j] + 0.025, pit.pz[j] + lz * inner],
        b: [pit.px[j] + lx * outer, pit.py[j] + 0.025, pit.pz[j] + lz * outer],
        na: slopeNormal(pit.grade[j], pit.tx[j], pit.tz[j]),
        uva: [j * pit.ds, inner],
        uvb: [j * pit.ds, outer],
      };
    });
    g.add(this.mesh(lane, pitLaneMaterial(pit.garageStart, pitch, gLen > 0 ? nGar : 0)));

    // speed-limit lines across the lane
    const paint = layered(simpleMaterial(0xf2f2f2, 0.6), 3);
    for (const s of [pit.limitStart, pit.limitEnd]) {
      const p = pit.poseAt(s);
      const m = new THREE.Mesh(planeXZ(-PIT.hw, -0.3, PIT.hw, 0.3, 0.03), paint);
      m.position.set(p.x, p.y, p.z);
      m.rotation.set(-Math.atan(p.grade), p.yaw, 0, 'YXZ');
      g.add(m);
    }

    if (gLen <= 0) return;
    // garage block: facade on the lane's outer wall line, 16 m deep, 8 m tall
    const front = (j) => pit.outerHw(j) + PIT.wallClear;
    const depth = 16, height = 8;
    const j0 = Math.ceil(pit.garageStart / pit.ds), j1 = Math.floor(pit.garageEnd / pit.ds);
    // y is relative to the lane; the block's foot (y = 0) is sunk 1 m so it never floats on a slope
    const at = (j, lat, y) => [pit.px[j] + pit.leftX(j) * o * lat, pit.py[j] + (y === 0 ? -1 : y), pit.pz[j] + pit.leftZ(j) * o * lat];
    const count = j1 - j0 + 1;
    const nIn = (j) => [-pit.leftX(j) * o, 0, -pit.leftZ(j) * o]; // facing the lane
    const concrete = simpleMaterial(0xd9d6cf, 0.85);
    const faces = [
      ribbonGeometry(count, (k) => { const j = j0 + k; return { a: at(j, front(j), 0), b: at(j, front(j), height), na: nIn(j), uva: [k, 0], uvb: [k, 1] }; }),
      ribbonGeometry(count, (k) => { const j = j0 + k; return { a: at(j, front(j), height), b: at(j, front(j) + depth, height), na: [0, 1, 0], uva: [k, 0], uvb: [k, 1] }; }),
      ribbonGeometry(count, (k) => { const j = j0 + k; const n = nIn(j); return { a: at(j, front(j) + depth, 0), b: at(j, front(j) + depth, height), na: [-n[0], 0, -n[2]], uva: [k, 0], uvb: [k, 1] }; }),
    ];
    for (const j of [j0, j1]) {
      const n = [pit.tx[j] * (j === j0 ? -1 : 1), 0, pit.tz[j] * (j === j0 ? -1 : 1)];
      faces.push(ribbonGeometry(2, (k) => ({ a: at(j, front(j) + k * depth, 0), b: at(j, front(j) + k * depth, height), na: n, uva: [k, 0], uvb: [k, 1] })));
    }
    for (const f of faces) {
      const m = this.mesh(f, concrete);
      m.castShadow = true;
      g.add(m);
    }
    // one garage per team: dark open door with the team's colour band above
    const door = simpleMaterial(0x15161a, 0.9);
    for (let k = 0; k < nGar; k++) {
      const p = pit.poseAt(pit.garageStart + (k + 0.5) * pitch);
      const grp = new THREE.Group();
      const lat = front(p.j) - 0.1;
      grp.position.set(p.x + pit.leftX(p.j) * o * lat, p.y, p.z + pit.leftZ(p.j) * o * lat);
      grp.rotation.y = p.yaw; // local +X = lane's left
      const w = pitch * 0.72;
      const d = new THREE.Mesh(boxGeometry(0.2, 4.6, w), door);
      d.position.set(0, 2.3, 0);
      const team = TEAMS[k % TEAMS.length];
      const band = new THREE.Mesh(boxGeometry(0.2, 1.1, pitch * 0.94), simpleMaterial(team.ui.primary, 0.5));
      band.position.set(0, 5.6, 0);
      grp.add(d, band);
      g.add(grp);
    }
  }

  /** Overhead start gantry with five start lights, spanning the track at s = 0. */
  gantry(pose) {
    const P = this.path;
    const g = new THREE.Group();
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.y = pose.yaw; // local +X = driver's left, local +Z = forward
    const steel = simpleMaterial(0x3a3d44, 0.4, 0.8);
    const postH = 8;
    const half = P.hw + KERB_WIDTH + 2;
    // a post never stands beyond the wall (on the pit side it sits on the pit wall)
    const xl = Math.min(half, P.wallL[pose.i]), xr = -Math.min(half, P.wallR[pose.i]);
    for (const x of [xr, xl]) {
      const post = new THREE.Mesh(boxGeometry(0.6, postH, 0.6), steel);
      post.position.set(x, postH / 2, 0);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(boxGeometry(xl - xr, 1.4, 0.8), simpleMaterial(0x15171b, 0.5, 0.3));
    beam.position.set((xl + xr) / 2, postH - 0.3, 0);
    beam.castShadow = true;
    g.add(beam);
    const lightMat = new THREE.MeshStandardNodeMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
    for (let i = 0; i < 5; i++) {
      const pod = new THREE.Mesh(boxGeometry(0.7, 0.7, 0.2), lightMat);
      pod.position.set(-2.4 + i * 1.2, postH - 0.3, -0.5); // facing cars approaching from -Z
      g.add(pod);
    }
    return g;
  }

  gridSlots() {
    const g = new THREE.Group();
    const paint = layered(simpleMaterial(0xf0f0f0, 0.6), 3);
    for (let i = 0; i < 6; i++) {
      const p = this.path.gridPose(i);
      const slot = new THREE.Group();
      slot.position.set(p.x, p.y + 0.035, p.z);
      slot.rotation.set(-Math.atan(p.grade), p.yaw, 0, 'YXZ');
      const bar = new THREE.Mesh(boxGeometry(2.4, 0.01, 0.25), paint);
      bar.position.set(0, 0, 3.2);
      slot.add(bar);
      for (const sx of [-1.2, 1.2]) {
        const side = new THREE.Mesh(boxGeometry(0.2, 0.01, 1.4), paint);
        side.position.set(sx, 0, 2.6);
        slot.add(side);
      }
      g.add(slot);
    }
    return g;
  }

  /** Trackside TV camera spots every ~160 m, on the outside of the bend. */
  placeTvCams() {
    const P = this.path;
    const cams = [];
    const step = Math.max(1, Math.round(160 / P.ds));
    for (let i = 0; i < P.N; i += step) {
      const k = P.curvature[i];
      const side = k > 0 ? -1 : 1; // outside of the corner
      const wall = side > 0 ? P.wallL[i] : P.wallR[i];
      const lat = side * (wall + 8);
      cams.push({
        x: P.px[i] + P.leftX(i) * lat,
        z: P.pz[i] + P.leftZ(i) * lat,
        y: P.py[i] + 7,
      });
    }
    return cams;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
}
