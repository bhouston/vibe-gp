// The real city around a street circuit (def.city, from OpenStreetMap via
// scripts/fetch-city.mjs): every building footprint extruded on the terrain, the tunnels
// (def.tunnels) and old fortress walls (def.city.walls).
//
//  - buildCityscape: footprints that would stand on the road, the pit lane or a grandstand
//    are clipped back behind the walls (or dropped); buildings over a tunnel are kept and
//    stand on its roof. Walls and flat roofs merged into one mesh per TILE, one facade
//    material: storeys and windows come from the shader (uv = bays along the wall, metres
//    up), the colour per building from a vertex colour.
//  - buildTunnels: side walls, ceiling and roof over the road wall to wall, portals and
//    rows of ceiling lights; a shade mask darkens everything under the ceiling.
//  - buildCityWalls: thick crenellated sandstone walls with round towers, cut where they
//    would cross the track's corridor.
//
// Map coordinates: +x east, +y north; world.x = x, world.z = -y.
import * as THREE from 'three/webgpu';
import {
  attribute, color, float, vec2, vec3, vec4, uv, mix, step, fract, floor, abs, max, min,
  smoothstep, positionWorld, normalWorld, mx_noise_float, texture, materialColor,
} from 'three/tsl';
import { nightU } from './night.js';
import { VERGE } from './terrain.js';
import { PIT } from './trackPath.js';
import { simpleMaterial } from './materials.js';

const TILE = 350; // building meshes are merged per tile so views and shadows cull whole tiles
const CEIL = 6.5; // tunnel ceiling above the road (m)
const ROOF = 7.7; // top of the tunnel's roof slab above the road (m)
const TUNNEL_OUT = 2.2; // tunnel structure reaches this far beyond the barrier face (m)
const CLEAR = 1.0; // buildings keep this far back from the walls (m)

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Barrier offset on one side (wall line + any tyre stack), as the concrete stands. */
const wallAt = (P, i, side) => (side > 0 ? P.wallL[i] + P.tyreL[i] : P.wallR[i] + P.tyreR[i]);

function polyArea(pts) {
  let a = 0;
  for (let k = 0; k < pts.length; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[(k + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

function inPoly(pts, x, z) {
  let inside = false;
  for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
    const [xi, zi] = pts[k], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Keep the part of a polygon where (p - o) . n >= d (Sutherland-Hodgman, one plane). */
function clipHalf(pts, ox, oz, nx, nz, d) {
  const out = [];
  const f = (p) => (p[0] - ox) * nx + (p[1] - oz) * nz - d;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  // drop near-duplicate points
  return out.filter((p, k) => {
    const q = out[(k + 1) % out.length];
    return out.length < 2 || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05;
  });
}

/** Points every `step` m along the polygon's outline (closed). */
function densify(pts, stepLen) {
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / stepLen));
    for (let m = 0; m < n; m++) out.push([a[0] + ((b[0] - a[0]) * m) / n, a[1] + ((b[1] - a[1]) * m) / n]);
  }
  return out;
}

/**
 * Which points are inside the circuit's corridor: the track out to its walls (+ pad),
 * the pit lane and its garage block. probe() reports the deepest sample it is inside.
 */
class Corridor {
  constructor(P, pad) {
    this.P = P;
    this.pad = pad;
    this.cell = 16;
    this.grid = new Map();
    let reach = 0;
    for (let i = 0; i < P.N; i++) {
      this.add(P.px[i], P.pz[i], i);
      reach = Math.max(reach, wallAt(P, i, 1), wallAt(P, i, -1));
    }
    const pit = P.pit;
    if (pit) {
      for (let j = 0; j < pit.N; j++) {
        this.add(pit.px[j], pit.pz[j], -1 - j);
        reach = Math.max(reach, this.pitLim(j, pit.outer));
      }
    }
    this.R = Math.ceil((reach + pad + 4) / this.cell);
  }

  add(x, z, id) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(id);
  }

  key(cx, cz) {
    return cx * 100003 + cz;
  }

  /** Pit-lane corridor half width on one side (left = +1): the garage block on its outer side. */
  pitLim(j, side) {
    const pit = this.P.pit;
    if (side !== pit.outer) return PIT.hw + 2.5;
    return pit.outerHw(j) + PIT.wallClear + (pit.inGarage(j) || Math.abs(j * pit.ds - (pit.garageStart + pit.garageEnd) / 2) < (pit.garageEnd - pit.garageStart) / 2 + 12 ? 17 : 2.5);
  }

  /**
   * Deepest corridor sample containing (x, z): { pen (m inside), i (main sample) or j
   * (pit sample), side, ox, oz, nx, nz, lim } or null. `limFn(i, side)` overrides the main
   * corridor half width (default: barrier + pad).
   */
  probe(x, z, limFn = null, pitToo = true) {
    const P = this.P, pit = P.pit;
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell), R = this.R;
    let best = null;
    for (let gx = cx - R; gx <= cx + R; gx++) {
      for (let gz = cz - R; gz <= cz + R; gz++) {
        const list = this.grid.get(this.key(gx, gz));
        if (!list) continue;
        for (const id of list) {
          let ox, oz, tx, tz, lx, lz, ds;
          if (id >= 0) {
            ox = P.px[id]; oz = P.pz[id]; tx = P.tx[id]; tz = P.tz[id]; lx = P.leftX(id); lz = P.leftZ(id); ds = P.ds;
          } else {
            if (!pitToo) continue;
            const j = -1 - id;
            ox = pit.px[j]; oz = pit.pz[j]; tx = pit.tx[j]; tz = pit.tz[j]; lx = pit.leftX(j); lz = pit.leftZ(j); ds = pit.ds;
          }
          const dx = x - ox, dz = z - oz;
          if (Math.abs(dx * tx + dz * tz) > ds * 0.75) continue;
          const lat = dx * lx + dz * lz;
          const side = lat >= 0 ? 1 : -1;
          const lim = id >= 0 ? (limFn ? limFn(id, side) : wallAt(P, id, side) + this.pad) : this.pitLim(-1 - id, side);
          if (lim <= 0) continue;
          const pen = lim - Math.abs(lat);
          if (pen > 0 && (!best || pen > best.pen)) {
            best = { pen, i: id >= 0 ? id : -1, j: id >= 0 ? -1 : -1 - id, side, ox, oz, nx: lx * side, nz: lz * side, lim };
          }
        }
      }
    }
    return best;
  }

  /** Corridor centre points inside a polygon (the road runs right through it)? */
  crossing(pts, bb) {
    const P = this.P, pit = P.pit;
    const hits = [];
    const cx0 = Math.floor(bb[0] / this.cell), cx1 = Math.floor(bb[2] / this.cell);
    const cz0 = Math.floor(bb[1] / this.cell), cz1 = Math.floor(bb[3] / this.cell);
    for (let gx = cx0; gx <= cx1; gx++) {
      for (let gz = cz0; gz <= cz1; gz++) {
        for (const id of this.grid.get(this.key(gx, gz)) ?? []) {
          const x = id >= 0 ? P.px[id] : pit.px[-1 - id], z = id >= 0 ? P.pz[id] : pit.pz[-1 - id];
          if (x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3] && inPoly(pts, x, z)) hits.push(id);
        }
      }
    }
    return hits;
  }
}

/** Lap-sample flags for every def.tunnels range (+ margin samples each end). */
function tunnelFlags(P, def, margin = 0) {
  const flags = new Uint8Array(P.N);
  for (const [s0, s1] of def.tunnels ?? []) {
    const a = Math.ceil(s0 / P.ds) - margin, b = Math.floor(s1 / P.ds) + margin;
    for (let i = a; i <= b; i++) flags[P.wrap(i)] = 1;
  }
  return flags;
}

function bbox(pts) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1];
}

/**
 * Decide what to build: each kept building as { pts (world xz, CCW seen from above),
 * height, minHeight, tunnel (true: stands on a tunnel roof) }. Pure data (no three.js),
 * so scripts can check it. Returns { list, stats }.
 */
export function planBuildings(P, def, stands = []) {
  const corridor = new Corridor(P, CLEAR);
  const inTunnel = tunnelFlags(P, def, 3);
  const standHit = (x, z) => stands.some((f) => {
    const a = (x - f.ox) * f.ax + (z - f.oz) * f.az, d = (x - f.ox) * f.dx + (z - f.oz) * f.dz;
    return Math.abs(a) < f.L / 2 + 2 && d > -2 && d < f.depth + 2;
  });
  const standCorners = stands.map((f) => [[-1, 0], [1, 0], [-1, 1], [1, 1], [0, 0.5]].map(([sa, sd]) => [
    f.ox + f.ax * (sa * f.L) / 2 + f.dx * sd * f.depth, f.oz + f.az * (sa * f.L) / 2 + f.dz * sd * f.depth,
  ]));
  const stats = { total: 0, kept: 0, clipped: 0, dropped: 0, tunnel: 0, stand: 0 };
  const list = [];
  for (const b of def.city?.buildings ?? []) {
    stats.total++;
    const [height, minHeight] = b;
    let pts = [];
    for (let k = 2; k + 1 < b.length; k += 2) pts.push([b[k], -b[k + 1]]);
    if (pts.length < 3) continue;
    if (polyArea(pts) < 0) pts.reverse(); // CCW in (x, z) maths terms
    const area0 = polyArea(pts);
    if (area0 < 4) continue;
    let bb = bbox(pts);
    // grandstands: drop
    if (densify(pts, 2).some(([x, z]) => standHit(x, z)) || standCorners.some((cs) => cs.some(([x, z]) => inPoly(pts, x, z)))) {
      stats.stand++;
      continue;
    }
    // the road: over a tunnel it is fine (the building stands on the roof), else clip back
    const cross = corridor.crossing(pts, bb);
    const probes = densify(pts, 1.5).map(([x, z]) => corridor.probe(x, z)).filter(Boolean);
    if (!cross.length && !probes.length) {
      list.push({ pts, height, minHeight, tunnel: false });
      stats.kept++;
      continue;
    }
    const tunnelOnly = cross.every((id) => id >= 0 && inTunnel[id]) && probes.every((p) => p.i >= 0 && inTunnel[p.i]);
    if (tunnelOnly) {
      list.push({ pts, height, minHeight, tunnel: true });
      stats.tunnel++;
      continue;
    }
    if (cross.length) {
      stats.dropped++;
      continue;
    }
    let ok = false;
    for (let it = 0; it < 12 && pts.length >= 3; it++) {
      let worst = null;
      for (const [x, z] of densify(pts, 1.0)) {
        const p = corridor.probe(x, z);
        if (p && (!worst || p.pen > worst.pen)) worst = p;
      }
      if (!worst) {
        ok = true;
        break;
      }
      pts = clipHalf(pts, worst.ox, worst.oz, worst.nx, worst.nz, worst.lim + 0.15);
    }
    bb = pts.length >= 3 ? bbox(pts) : bb;
    if (!ok || pts.length < 3 || polyArea(pts) < Math.max(25, area0 * 0.3) || corridor.crossing(pts, bb).length) {
      stats.dropped++;
      continue;
    }
    list.push({ pts, height, minHeight, tunnel: false });
    stats.clipped++;
  }
  return { list, stats, corridor };
}

// ---------------------------------------------------------------- mesh building

/** Growable vertex arrays: position, normal, uv, color, facade (kind, seed, wall height). */
class Builder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.fac = []; this.idx = [];
  }

  get count() {
    return this.pos.length / 3;
  }

  v(p, n, u, c, f) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(u[0], u[1]);
    if (c) this.col.push(c[0], c[1], c[2]);
    if (f) this.fac.push(f[0], f[1], f[2]);
    return this.count - 1;
  }

  /** Triangle a, b, c (indices), flipped if needed so it faces along n. */
  tri(a, b, c, n) {
    const P = this.pos;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    if (d >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  /** Quad a-b-c-d (in order around it) facing n. Each corner: [pos, uv]. */
  quad(corners, n, c, f) {
    const [a, b, cc, d] = corners.map(([p, u]) => this.v(p, n, u, c, f));
    this.tri(a, b, cc, n);
    this.tri(a, cc, d, n);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.fac.length) g.setAttribute('facade', new THREE.Float32BufferAttribute(this.fac, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const hex = (h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
// facades (linear colours via THREE.Color), and roofs
const PALETTES = {
  monaco: {
    walls: [0xf1e6cc, 0xead7a8, 0xe3b98a, 0xe9a98c, 0xf2dd96, 0xf5f2ea, 0xe8c6a6, 0xdcc08f, 0xf0cfb8, 0xd99a72],
    glass: [0x8ea8b6, 0x6f8b99, 0x9db3b4, 0x7d93a3],
    roofs: [0xa9553a, 0xb8644a, 0x9a8f84, 0xa49d92],
    glassFrom: 42, // buildings this tall may be modern glass towers
  },
  baku: {
    walls: [0xd9c49a, 0xe2d4b6, 0xcdb68a, 0xd4bf98, 0xe6dcc6, 0xc7ad80, 0xddcba8],
    glass: [0x86a2b4, 0x6c8797, 0x93aab8, 0x7a8e9c],
    roofs: [0x9d968a, 0xb0a48c, 0x8d877d],
    glassFrom: 34,
  },
};

/**
 * Facade material. uv.x = bay coordinate along the wall (integer bays per wall segment),
 * uv.y = metres above the building's foot; facade = (kind: 0 masonry / 1 glass, seed,
 * wall top in the same metres). Roofs (normal up) take the plain vertex colour.
 */
function cityFacadeMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const f = attribute('facade', 'vec3');
  const kind = f.x, seed = f.y, top = f.z;
  const base = attribute('color', 'vec3');
  const u = uv().x, v = uv().y;
  const wall = step(abs(normalWorld.y), 0.5);
  const glassy = step(0.5, kind);
  const storey = mix(float(3.25), float(3.7), glassy);
  const fy = fract(v.div(storey)), level = floor(v.div(storey));
  const bx = abs(fract(u).sub(0.5)); // 0 at the middle of a bay, 0.5 at its edges
  const below = step(v, top.sub(0.9)); // no windows in the cornice / parapet band
  // masonry: tall shuttered windows, shop fronts on the ground floor, a string course per storey
  const ground = step(level, 0.5);
  const winW = mix(float(0.19), float(0.25), fract(seed.mul(7.3)));
  const winM = step(bx, winW).mul(step(0.28, fy)).mul(step(fy, 0.86));
  const shop = step(bx, 0.4).mul(step(0.08, fy)).mul(step(fy, 0.8));
  const masonryWin = mix(winM, shop, ground).mul(below).mul(step(1.0, top.sub(2.5)));
  const shutters = step(0.45, fract(seed.mul(3.1))).mul(step(winW, bx)).mul(step(bx, winW.add(0.1))).mul(step(0.28, fy)).mul(step(fy, 0.86)).mul(float(1).sub(ground)).mul(below);
  const course = step(fy, 0.05).mul(float(1).sub(ground)).add(step(top.sub(0.9), v).mul(0.6)).clamp(0, 1);
  // glass: full-height panes between thin mullions, a dark spandrel at each floor slab
  const glassWin = step(bx, 0.46).mul(step(0.16, fy)).mul(below);
  const win = mix(masonryWin, glassWin, glassy).mul(wall);
  const grime = mx_noise_float(positionWorld.mul(0.25)).mul(0.06).add(mx_noise_float(positionWorld.mul(1.7)).mul(0.03));
  const shutterCol = mix(color(0x55684a), color(0x7a5a3c), step(0.7, fract(seed.mul(5.7))));
  // masonry wall, courses a little lighter, shutters, then the panes
  let wallCol = base.mul(float(1).add(grime).add(course.mul(0.08)));
  wallCol = mix(wallCol, shutterCol, shutters);
  const spandrel = base.mul(0.45);
  const glassCol = mix(vec3(0.11, 0.13, 0.15), base.mul(0.55), glassy);
  const facade = mix(mix(wallCol, spandrel, glassy), glassCol, win);
  const roof = base.mul(float(0.92).add(mx_noise_float(positionWorld.xz.mul(0.4)).mul(0.08)));
  m.colorNode = mix(roof, facade, wall);
  m.roughnessNode = mix(float(0.88), mix(float(0.25), float(0.08), glassy), win);
  m.metalnessNode = mix(float(0.0), mix(float(0.3), float(0.75), glassy), win);
  // at night about a third of the windows are lit
  const cell = vec3(floor(u), level, seed.mul(173.0)).mul(0.731);
  const on = smoothstep(0.1, 0.18, mx_noise_float(cell));
  const tint = mix(color(0xffc98a), color(0xdce8ff), smoothstep(-0.2, 0.2, mx_noise_float(cell.mul(1.9).add(5.3))));
  m.emissiveNode = tint.mul(win.mul(on).mul(nightU).mul(1.5));
  return m;
}

/**
 * Real buildings around the circuit: see the module header. Returns { occupied(x, z) }
 * (is there a building here?) for other scenery to keep out of.
 */
export function buildCityscape(P, field, stands, group, def) {
  const { list, stats } = planBuildings(P, def, stands);
  const pal = PALETTES[def.id] ?? PALETTES.monaco;
  const tunnelCorr = def.tunnels ? new Corridor(P, 0) : null;
  const tFlags = tunnelFlags(P, def, 0);
  // under the tunnel's roof: inside the tunnel structure's footprint, within the tunnel range
  const roofLim = (i, side) => (tFlags[i] ? wallAt(P, i, side) + 0.3 + TUNNEL_OUT + 0.2 : -1);
  const tiles = new Map();
  const rand = rng(Math.round(P.length * 31) + 7);
  // occupancy grid (4 m cells) so trees keep out of buildings
  const OCC = 4, occ = new Set();
  const okey = (cx, cz) => cx * 100003 + cz;
  for (const b of list) {
    const pts = b.pts;
    const ys = pts.map(([x, z]) => field.sample(x, z).y);
    const gMin = Math.min(...ys), gAvg = ys.reduce((a, y) => a + y, 0) / ys.length;
    let foot = gMin - 1.2;
    let top = gAvg + Math.max(3.5, b.height);
    const r = rand(), r2 = rand();
    const glass = b.height >= pal.glassFrom && r < (b.height > 70 ? 0.75 : 0.45);
    const wallCol = hex(glass ? pal.glass[Math.floor(r2 * pal.glass.length)] : pal.walls[Math.floor(r2 * pal.walls.length)]);
    const shade = 0.94 + rand() * 0.1;
    for (let k = 0; k < 3; k++) wallCol[k] *= shade;
    const lowRoof = def.id === 'monaco' && b.height < 24 && rand() < 0.7;
    const roofCol = hex(lowRoof ? pal.roofs[Math.floor(rand() * 2)] : pal.roofs[2 + Math.floor(rand() * (pal.roofs.length - 2))]);
    const seed = rand();
    const bay = glass ? 1.6 : 2.7 + seed * 0.9;
    // each outline piece: [x0, z0, x1, z1, foot] (a tunnel building's walls over the tunnel start on its roof)
    let pieces = [];
    let roofMax = -Infinity;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], c = pts[(k + 1) % pts.length];
      if (!b.tunnel) {
        pieces.push([a[0], a[1], c[0], c[1], null]);
        continue;
      }
      const n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 1.5));
      for (let m = 0; m < n; m++) {
        const t0 = m / n, t1 = (m + 1) / n, tm = (t0 + t1) / 2;
        const pr = tunnelCorr.probe(a[0] + (c[0] - a[0]) * tm, a[1] + (c[1] - a[1]) * tm, roofLim, false);
        const y = pr ? P.py[pr.i] + ROOF : null;
        if (y !== null) roofMax = Math.max(roofMax, y);
        const p0 = [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0];
        const p1 = [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1];
        const last = pieces[pieces.length - 1];
        // merge consecutive pieces with the same foot
        if (last && m > 0 && (last[4] === null) === (y === null) && (y === null || Math.abs(last[4] - y) < 0.3)) {
          last[2] = p1[0]; last[3] = p1[1];
        } else pieces.push([p0[0], p0[1], p1[0], p1[1], y]);
      }
    }
    if (b.tunnel && roofMax > -Infinity) top = Math.max(top, roofMax + 6.5);
    const under = b.minHeight > 0 ? gAvg + b.minHeight : null;
    if (under !== null) foot = under;
    if (top < foot + 2.5) continue;
    const wallTop = top - foot;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const tk = `${Math.floor(cx / TILE)},${Math.floor(cz / TILE)}`;
    if (!tiles.has(tk)) tiles.set(tk, new Builder());
    const B = tiles.get(tk);
    const fac = [glass ? 1 : 0, seed, wallTop];
    // walls: one quad per outline piece, bays fitted to its length, continuing around the building
    let uAcc = 0;
    for (const [x0, z0, x1, z1, pf] of pieces) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const nb = len < 1.6 ? 0 : Math.max(1, Math.round(len / bay));
      const f0 = pf ?? foot;
      // outward normal of a CCW (x, z) outline: (dz, -dx)
      const n = [(z1 - z0) / len, 0, -(x1 - x0) / len];
      const v0 = f0 - foot;
      const u0 = nb ? uAcc : uAcc + 0.5, u1 = nb ? uAcc + nb : uAcc + 0.5; // no bays on short walls
      B.quad([
        [[x0, f0, z0], [u0, v0]], [[x1, f0, z1], [u1, v0]], [[x1, top, z1], [u1, wallTop]], [[x0, top, z0], [u0, wallTop]],
      ], n, wallCol, fac);
      uAcc += nb;
    }
    // flat roof (and an underside for raised buildings)
    const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [y, n, cl] of [[top, [0, 1, 0], roofCol], ...(under !== null ? [[foot, [0, -1, 0], wallCol]] : [])]) {
      const base = B.count;
      for (const [x, z] of pts) B.v([x, y, z], n, [0, wallTop], cl, fac);
      for (const [a, c, d] of tris) B.tri(base + a, base + c, base + d, n);
    }
    // occupancy
    const bb = bbox(pts);
    for (let gx = Math.floor(bb[0] / OCC); gx <= Math.floor(bb[2] / OCC); gx++) {
      for (let gz = Math.floor(bb[1] / OCC); gz <= Math.floor(bb[3] / OCC); gz++) {
        if (inPoly(pts, (gx + 0.5) * OCC, (gz + 0.5) * OCC)) occ.add(okey(gx, gz));
      }
    }
  }
  const mat = cityFacadeMaterial();
  let verts = 0;
  for (const B of tiles.values()) {
    if (!B.count) continue;
    verts += B.count;
    const mesh = new THREE.Mesh(B.geometry(), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (import.meta.env?.DEV) console.info(`cityscape ${def.id}:`, stats, `${tiles.size} tiles, ${verts} vertices`);
  return {
    occupied: (x, z) => {
      const gx = Math.floor(x / OCC), gz = Math.floor(z / OCC);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (occ.has(okey(gx + dx, gz + dz))) return true;
      return false;
    },
  };
}

// ---------------------------------------------------------------- tunnels

/** Tunnel lining: grimy dark band low down, pale tiles above. uv = (metres along, metres up). */
function tunnelWallMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const u = uv().x, v = uv().y;
  const joint = step(fract(u.div(0.6)), 0.04).add(step(fract(v.div(0.3)), 0.06)).clamp(0, 1);
  const grime = mx_noise_float(positionWorld.mul(0.6)).mul(0.08);
  const tiles = mix(color(0xc9c2ae), color(0x8f8a7c), joint).mul(float(1).add(grime));
  const band = color(0x3c4046).mul(float(1).add(grime));
  m.colorNode = mix(band, tiles, step(1.4, v));
  m.roughnessNode = mix(float(0.9), float(0.6), step(1.4, v));
  m.metalnessNode = float(0);
  return m;
}

/**
 * Covered sections of the lap (def.tunnels): from each barrier's face a wall up to the
 * ceiling, the ceiling slab, the roof and its outer walls down to the ground, a portal
 * headwall at each end and two rows of ceiling lights. Everything under a ceiling is
 * darkened through a shade mask on every material in `group` (call this after the rest
 * of the circuit is built), since the sun's shadow map only reaches a few tens of metres.
 */
export function buildTunnels(P, group, def) {
  const ranges = def.tunnels ?? [];
  if (!ranges.length) return;
  const wallB = new Builder(), ceilB = new Builder(), outB = new Builder(), lightB = new Builder(), hotelB = new Builder();
  const pt = (i, lat, y) => [P.px[i] + P.leftX(i) * lat, P.py[i] + y, P.pz[i] + P.leftZ(i) * lat];
  const inner = (i, side) => side * (wallAt(P, i, side) + 0.3);
  const outer = (i, side) => side * (wallAt(P, i, side) + 0.3 + TUNNEL_OUT);
  const strip = (B, i0, n, fa, fb, nrm, uvb) => {
    for (let k = 0; k < n - 1; k++) {
      const a = P.wrap(i0 + k), b = P.wrap(i0 + k + 1);
      const sA = k * P.ds, sB = (k + 1) * P.ds;
      const nn = nrm(a);
      B.quad([[fa(a), [sA, uvb[0]]], [fa(b), [sB, uvb[0]]], [fb(b), [sB, uvb[1]]], [fb(a), [sA, uvb[1]]]], nn);
    }
  };
  for (const [s0, s1] of ranges) {
    const i0 = Math.ceil(s0 / P.ds), n = Math.floor(s1 / P.ds) - i0 + 1;
    for (const side of [1, -1]) {
      const inward = (i) => [-P.leftX(i) * side, 0, -P.leftZ(i) * side];
      const outward = (i) => [P.leftX(i) * side, 0, P.leftZ(i) * side];
      // lining from just below the road to the ceiling
      strip(wallB, i0, n, (i) => pt(i, inner(i, side), -0.4), (i) => pt(i, inner(i, side), CEIL), inward, [-0.4, CEIL]);
      // outer wall from below the ground to the roof
      strip(outB, i0, n, (i) => pt(i, outer(i, side), -4), (i) => pt(i, outer(i, side), ROOF), outward, [0, ROOF + 4]);
    }
    // ceiling (facing down) and roof (facing up), wall to wall
    strip(ceilB, i0, n, (i) => pt(i, inner(i, -1), CEIL), (i) => pt(i, inner(i, 1), CEIL), () => [0, -1, 0], [0, 1]);
    strip(outB, i0, n, (i) => pt(i, outer(i, -1), ROOF), (i) => pt(i, outer(i, 1), ROOF), () => [0, 1, 0], [0, 1]);
    // portals: a headwall over each mouth, the ends of the side structure, and a parapet
    for (const [i, dir] of [[P.wrap(i0), -1], [P.wrap(i0 + n - 1), 1]]) {
      const nn = [P.tx[i] * dir, 0, P.tz[i] * dir];
      const L = outer(i, 1), R = outer(i, -1);
      outB.quad([[pt(i, R, CEIL), [0, 0]], [pt(i, L, CEIL), [1, 0]], [pt(i, L, ROOF + 1.1), [1, 1]], [pt(i, R, ROOF + 1.1), [0, 1]]], nn);
      for (const side of [1, -1]) {
        outB.quad([[pt(i, inner(i, side), -4), [0, 0]], [pt(i, outer(i, side), -4), [1, 0]], [pt(i, outer(i, side), ROOF), [1, 1]], [pt(i, inner(i, side), ROOF), [0, 1]]], nn);
      }
      // parapet back face and top, 0.6 m thick
      const back = (lat, y) => { const p = pt(i, lat, y); return [p[0] - nn[0] * 0.6, p[1], p[2] - nn[2] * 0.6]; };
      outB.quad([[back(R, ROOF), [0, 0]], [back(L, ROOF), [1, 0]], [back(L, ROOF + 1.1), [1, 1]], [back(R, ROOF + 1.1), [0, 1]]], [-nn[0], 0, -nn[2]]);
      outB.quad([[pt(i, R, ROOF + 1.1), [0, 0]], [pt(i, L, ROOF + 1.1), [1, 0]], [back(L, ROOF + 1.1), [1, 1]], [back(R, ROOF + 1.1), [0, 1]]], [0, 1, 0]);
    }
    // a hotel block over the first half (Monaco's tunnel runs under the Fairmont)
    const h0 = Math.round(n * 0.04), h1 = Math.round(n * 0.58), HOTEL = 24;
    const top = (i) => P.py[i] + ROOF + HOTEL;
    const fac = [0, 0.37, HOTEL];
    const cream = hex(0xf0e8d6);
    let along = 0;
    for (let k = h0; k < h1; k++) {
      const a = P.wrap(i0 + k), b = P.wrap(i0 + k + 1);
      const ua = along / 3, ub = (along + P.ds) / 3;
      for (const side of [1, -1]) {
        const out = [P.leftX(a) * side, 0, P.leftZ(a) * side];
        hotelB.quad([
          [pt(a, outer(a, side), ROOF), [ua, 0]], [pt(b, outer(b, side), ROOF), [ub, 0]],
          [pt(b, outer(b, side), ROOF + HOTEL), [ub, HOTEL]], [pt(a, outer(a, side), ROOF + HOTEL), [ua, HOTEL]],
        ], out, cream, fac);
      }
      const roofCol = hex(0x9a948a);
      hotelB.quad([
        [[...pt(a, outer(a, -1), 0)].map((v, c) => (c === 1 ? top(a) : v)), [0, HOTEL]],
        [[...pt(b, outer(b, -1), 0)].map((v, c) => (c === 1 ? top(b) : v)), [0, HOTEL]],
        [[...pt(b, outer(b, 1), 0)].map((v, c) => (c === 1 ? top(b) : v)), [0, HOTEL]],
        [[...pt(a, outer(a, 1), 0)].map((v, c) => (c === 1 ? top(a) : v)), [0, HOTEL]],
      ], [0, 1, 0], roofCol, fac);
      along += P.ds;
    }
    for (const [k, dir] of [[h0, -1], [h1, 1]]) {
      const i = P.wrap(i0 + k), nn = [P.tx[i] * dir, 0, P.tz[i] * dir];
      const L = outer(i, 1), R = outer(i, -1), w = (L - R) / 3;
      hotelB.quad([
        [pt(i, R, ROOF), [0, 0]], [pt(i, L, ROOF), [w, 0]], [pt(i, L, ROOF + HOTEL), [w, HOTEL]], [pt(i, R, ROOF + HOTEL), [0, HOTEL]],
      ], nn, cream, fac);
    }

    // ceiling lights: two rows of warm strips, one every 6 m
    const every = Math.max(1, Math.round(6 / P.ds));
    for (let k = 1; k < n - 1; k += every) {
      const i = P.wrap(i0 + k);
      for (const lat of [P.hw * 0.42, -P.hw * 0.42]) {
        const a = (dl, ds) => {
          const p = pt(i, lat + dl, CEIL - 0.06);
          return [p[0] + P.tx[i] * ds, p[1], p[2] + P.tz[i] * ds];
        };
        lightB.quad([[a(-0.14, -0.8), [0, 0]], [a(0.14, -0.8), [1, 0]], [a(0.14, 0.8), [1, 1]], [a(-0.14, 0.8), [0, 1]]], [0, -1, 0]);
      }
    }
  }
  const concrete = simpleMaterial(0xa39d92, 0.9);
  const ceiling = simpleMaterial(0x34363a, 0.95);
  const lamp = new THREE.MeshBasicNodeMaterial();
  lamp.colorNode = vec3(2.6, 2.35, 1.9);
  lamp.userData.noFlood = lamp.userData.noTunnelShade = true;
  lamp.fog = true;
  const meshes = [[wallB, tunnelWallMaterial()], [ceilB, ceiling], [outB, concrete], [lightB, lamp], [hotelB, cityFacadeMaterial()]];
  for (const [B, m] of meshes) {
    if (!B.count) continue;
    const mesh = new THREE.Mesh(B.geometry(), m);
    mesh.castShadow = B !== lightB;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  applyTunnelShade(P, group, ranges);
}

/**
 * Shade mask over the tunnels: a texture (1 m texels) holding how far under cover a spot
 * is (fading in over the first ~25 m from each portal) and the ceiling height there. Every
 * material in `group` has its colour multiplied down beneath a ceiling.
 */
function applyTunnelShade(P, group, ranges) {
  const CELL = 1, PAD = 30;
  const samples = [];
  for (const [s0, s1] of ranges) {
    const i0 = Math.ceil(s0 / P.ds), n = Math.floor(s1 / P.ds) - i0 + 1;
    for (let k = 0; k < n; k++) samples.push({ i: P.wrap(i0 + k), into: Math.min(k, n - 1 - k) * P.ds });
  }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const { i } of samples) {
    x0 = Math.min(x0, P.px[i]); x1 = Math.max(x1, P.px[i]); z0 = Math.min(z0, P.pz[i]); z1 = Math.max(z1, P.pz[i]);
  }
  x0 -= PAD; z0 -= PAD; x1 += PAD; z1 += PAD;
  const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
  const data = new Uint16Array(nx * nz * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let jz = 0; jz < nz; jz++) {
    for (let jx = 0; jx < nx; jx++) {
      const x = x0 + (jx + 0.5) * CELL, z = z0 + (jz + 0.5) * CELL;
      let best = null, bd = Infinity;
      for (const s of samples) {
        const d = (P.px[s.i] - x) ** 2 + (P.pz[s.i] - z) ** 2;
        if (d < bd) { bd = d; best = s; }
      }
      const i = best.i, dx = x - P.px[i], dz = z - P.pz[i];
      const lat = dx * P.leftX(i) + dz * P.leftZ(i), along = dx * P.tx[i] + dz * P.tz[i];
      const lim = wallAt(P, i, lat >= 0 ? 1 : -1) + 0.3 + TUNNEL_OUT - 0.8; // the lining sits well inside
      const into = best.into + (best.into < 1 ? -Math.abs(along) : 0); // beyond the mouth: negative
      const cover = Math.abs(lat) <= lim ? Math.min(1, Math.max(0, (into + 2) / 27)) : 0;
      const k = (jz * nx + jx) * 4;
      data[k] = toHalf(cover * cover * (3 - 2 * cover));
      data[k + 1] = toHalf(P.py[i] + CEIL);
      data[k + 3] = toHalf(1);
    }
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const m = texture(tex, positionWorld.xz.sub(vec2(x0, z0)).div(vec2(nx * CELL, nz * CELL)));
  const under = m.r.mul(smoothstep(0.15, -0.15, positionWorld.y.sub(m.g)));
  // albedo down (direct light: the shadow map only covers the car's surroundings) and the
  // sky's diffuse and reflected light occluded
  const shadeCol = mix(vec3(1), vec3(0.5, 0.46, 0.38), under);
  const occl = mix(float(1), float(0.3), under);
  const done = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mt?.isNodeMaterial || done.has(mt) || mt.userData.noTunnelShade) continue;
      done.add(mt);
      const base = vec4(mt.colorNode ?? materialColor);
      mt.colorNode = vec4(base.rgb.mul(shadeCol), base.a);
      if (mt.isMeshStandardNodeMaterial) mt.aoNode = mt.aoNode ? mt.aoNode.mul(occl) : occl;
    }
  });
  group.userData.tunnelShadeTexture = tex;
}

// ---------------------------------------------------------------- old city walls

/** Dressed sandstone in courses (uv = metres along, metres up), lighter on top faces. */
function sandstoneMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const u = uv().x, v = uv().y;
  const row = floor(v.div(0.55));
  const off = fract(row.mul(0.5)).mul(0.9);
  const joint = max(step(fract(v.div(0.55)), 0.07), step(fract(u.add(off).div(1.1)), 0.04));
  const blockVar = mx_noise_float(vec3(floor(u.add(off).div(1.1)), row, 0).mul(0.77)).mul(0.07);
  const weather = mx_noise_float(positionWorld.mul(0.12)).mul(0.1).add(mx_noise_float(positionWorld.mul(2.1)).mul(0.04));
  const top = step(0.5, normalWorld.y);
  const stone = mix(color(0xc2a274), color(0xd3b98e), top).mul(float(1).add(blockVar).add(weather));
  m.colorNode = mix(stone, stone.mul(0.72), joint.mul(float(1).sub(top)));
  m.roughnessNode = float(0.92);
  m.metalnessNode = float(0);
  return m;
}

/**
 * The old fortress walls (def.city.walls polylines): ~3 m thick, ~9 m tall, crenellated,
 * with round towers every ~50 m, following the ground; any stretch that would come inside
 * the circuit's corridor (walls + verge) is left out.
 */
export function buildCityWalls(P, field, group, def) {
  const lines = def.city?.walls ?? [];
  if (!lines.length) return;
  const H = 9, T = 3.0, TOWER_R = 4.6, TOWER_H = 11.5;
  const corridor = new Corridor(P, VERGE + T / 2 + 0.6);
  const B = new Builder();
  const rand = rng(97);
  for (const line of lines) {
    const raw = [];
    for (let k = 0; k + 1 < line.length; k += 2) raw.push([line[k], -line[k + 1]]);
    const closed = raw.length > 2 && Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 0.5;
    if (closed) raw.pop();
    // centroid: the outside (towers, merlons) faces away from it on a ring
    const cx = raw.reduce((s, p) => s + p[0], 0) / raw.length, cz = raw.reduce((s, p) => s + p[1], 0) / raw.length;
    // resample every ~1.5 m, keeping the corners
    const pts = [];
    const segs = closed ? raw.length : raw.length - 1;
    for (let k = 0; k < segs; k++) {
      const a = raw[k], b = raw[(k + 1) % raw.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
      for (let m = 0; m < n; m++) pts.push({ x: a[0] + ((b[0] - a[0]) * m) / n, z: a[1] + ((b[1] - a[1]) * m) / n, corner: m === 0 });
    }
    if (!closed) pts.push({ x: raw[raw.length - 1][0], z: raw[raw.length - 1][1], corner: true });
    for (const p of pts) {
      p.ok = !corridor.probe(p.x, p.z);
      p.y = field.sample(p.x, p.z).y;
    }
    // runs of consecutive clear points (a ring starts at a gap, if any)
    const N = pts.length;
    let start = 0;
    if (closed) {
      const g = pts.findIndex((p) => !p.ok);
      start = g < 0 ? 0 : g;
    }
    const runs = [];
    let cur = [];
    const total = closed ? N + (pts.every((p) => p.ok) ? 1 : 0) : N;
    for (let k = 0; k < total; k++) {
      const p = pts[(start + k) % N];
      if (p.ok) cur.push(p);
      else if (cur.length) { runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    for (const run of runs) {
      if (run.length < 4) continue;
      wallRun(B, run, cx, cz, H, T);
      // towers at corners and every ~50 m, clear of the corridor and of the run's cut ends
      let dist = 0, last = -Infinity;
      const ends = run.length * 1.5;
      for (let k = 0; k < run.length; k++) {
        if (k > 0) dist += Math.hypot(run[k].x - run[k - 1].x, run[k].z - run[k - 1].z);
        const p = run[k];
        if (dist < 4 || ends - dist < 4 || dist - last < 22) continue;
        if (!(p.corner || dist - last > 46 + rand() * 12)) continue;
        // centre pushed half out of the wall, away from the enclosed side
        const q = run[Math.min(run.length - 1, k + 1)], o = run[Math.max(0, k - 1)];
        let nx = q.z - o.z, nz = -(q.x - o.x);
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        if ((p.x - cx) * nx + (p.z - cz) * nz < 0) { nx = -nx; nz = -nz; }
        const tx = p.x + nx * 1.6, tz = p.z + nz * 1.6;
        let clear = true;
        for (let a = 0; a < 8 && clear; a++) {
          const ang = (a / 8) * Math.PI * 2;
          if (corridor.probe(tx + Math.cos(ang) * TOWER_R, tz + Math.sin(ang) * TOWER_R)) clear = false;
        }
        if (!clear) continue;
        tower(B, tx, tz, field.sample(tx, tz).y, TOWER_R, TOWER_H);
        last = dist;
      }
    }
  }
  if (!B.count) return;
  const mesh = new THREE.Mesh(B.geometry(), sandstoneMaterial());
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}

/** One continuous stretch of wall along points {x, z, y}: sides, walkway, merlons, end caps. */
function wallRun(B, run, cx, cz, H, T) {
  const n = run.length;
  // per point: unit normal (towards the outside), along distance
  const nor = [], dist = [0];
  for (let k = 0; k < n; k++) {
    const q = run[Math.min(n - 1, k + 1)], o = run[Math.max(0, k - 1)];
    let nx = q.z - o.z, nz = -(q.x - o.x);
    const l = Math.hypot(nx, nz) || 1;
    nor.push([nx / l, nz / l]);
    if (k) dist.push(dist[k - 1] + Math.hypot(run[k].x - run[k - 1].x, run[k].z - run[k - 1].z));
  }
  // flip all normals to face away from the centroid (on average)
  let s = 0;
  for (let k = 0; k < n; k++) s += (run[k].x - cx) * nor[k][0] + (run[k].z - cz) * nor[k][1];
  if (s < 0) for (const v of nor) { v[0] = -v[0]; v[1] = -v[1]; }
  const at = (k, off, y) => [run[k].x + nor[k][0] * off, y, run[k].z + nor[k][1] * off];
  const foot = (k) => run[k].y - 1.5;
  for (let k = 0; k < n - 1; k++) {
    const yk = run[k].y, yk1 = run[k + 1].y;
    for (const sgn of [1, -1]) {
      // a slight batter: the foot is 0.4 m wider each side
      const n0 = [nor[k][0] * sgn, 0.05, nor[k][1] * sgn];
      B.quad([
        [at(k, sgn * (T / 2 + 0.4), foot(k)), [dist[k], foot(k) - yk]],
        [at(k + 1, sgn * (T / 2 + 0.4), foot(k + 1)), [dist[k + 1], foot(k + 1) - yk1]],
        [at(k + 1, sgn * (T / 2), yk1 + H), [dist[k + 1], H]],
        [at(k, sgn * (T / 2), yk + H), [dist[k], H]],
      ], n0);
    }
    // walkway
    B.quad([
      [at(k, -T / 2, yk + H), [dist[k], 0]], [at(k + 1, -T / 2, yk1 + H), [dist[k + 1], 0]],
      [at(k + 1, T / 2, yk1 + H), [dist[k + 1], T]], [at(k, T / 2, yk + H), [dist[k], T]],
    ], [0, 1, 0]);
  }
  // end caps
  for (const [k, dir] of [[0, -1], [n - 1, 1]]) {
    const o = run[Math.max(0, Math.min(n - 1, k - dir))];
    let tx = run[k].x - o.x, tz = run[k].z - o.z;
    const l = Math.hypot(tx, tz) || 1;
    const y = run[k].y;
    B.quad([
      [at(k, -T / 2 - 0.4, foot(k)), [0, -1.5]], [at(k, T / 2 + 0.4, foot(k)), [T, -1.5]],
      [at(k, T / 2, y + H), [T, H]], [at(k, -T / 2, y + H), [0, H]],
    ], [tx / l, 0, tz / l]);
  }
  // merlons along the outer edge (and a low parapet on the inner edge), every 2.2 m
  const pitch = 2.2, mw = 1.2, mh = 1.2, md = 0.7;
  const total = dist[n - 1];
  let k = 0;
  for (let d = 1; d + mw < total; d += pitch) {
    while (k < n - 2 && dist[k + 1] < d) k++;
    const t = (d - dist[k]) / Math.max(1e-6, dist[k + 1] - dist[k]);
    const px = run[k].x + (run[k + 1].x - run[k].x) * t, pz = run[k].z + (run[k + 1].z - run[k].z) * t;
    const py = run[k].y + (run[k + 1].y - run[k].y) * t + H;
    let tx = run[k + 1].x - run[k].x, tz = run[k + 1].z - run[k].z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const nx = nor[k][0], nz = nor[k][1];
    const c = [px + nx * (T / 2 - md / 2) + tx * (mw / 2), pz + nz * (T / 2 - md / 2) + tz * (mw / 2)];
    box(B, c[0], py, c[1], tx, tz, mw, mh, md, d);
    if (Math.round(d / pitch) % 2 === 0) {
      const ci = [px - nx * (T / 2 - 0.25) + tx * (pitch / 2), pz - nz * (T / 2 - 0.25) + tz * (pitch / 2)];
      box(B, ci[0], py, ci[1], tx, tz, pitch * 2, 0.6, 0.5, d);
    }
  }
}

/** Box standing on y, centred on (x, z), length along (tx, tz). */
function box(B, x, y, z, tx, tz, len, h, depth, u0 = 0) {
  const nx = -tz, nz = tx; // across
  const c = (a, b, yy) => [x + tx * a + nx * b, yy, z + tz * a + nz * b];
  const L = len / 2, D = depth / 2;
  const faces = [
    [[c(-L, D, y), c(L, D, y), c(L, D, y + h), c(-L, D, y + h)], [nx, 0, nz], len],
    [[c(L, -D, y), c(-L, -D, y), c(-L, -D, y + h), c(L, -D, y + h)], [-nx, 0, -nz], len],
    [[c(L, D, y), c(L, -D, y), c(L, -D, y + h), c(L, D, y + h)], [tx, 0, tz], depth],
    [[c(-L, -D, y), c(-L, D, y), c(-L, D, y + h), c(-L, -D, y + h)], [-tx, 0, -tz], depth],
  ];
  for (const [q, n, w] of faces) {
    B.quad([[q[0], [u0, 0]], [q[1], [u0 + w, 0]], [q[2], [u0 + w, h]], [q[3], [u0, h]]], n);
  }
  B.quad([[c(-L, -D, y + h), [0, 0]], [c(L, -D, y + h), [len, 0]], [c(L, D, y + h), [len, depth]], [c(-L, D, y + h), [0, depth]]], [0, 1, 0]);
}

/** Round tower: a 16-sided drum from below the ground, a flat top and a ring of merlons. */
function tower(B, x, z, ground, r, h) {
  const S = 16, y0 = ground - 1.5, y1 = ground + h;
  for (let k = 0; k < S; k++) {
    const a0 = (k / S) * Math.PI * 2, a1 = ((k + 1) / S) * Math.PI * 2, am = (a0 + a1) / 2;
    const p = (a, rr, y) => [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr];
    const rb = r + 0.5; // battered foot
    B.quad([[p(a0, rb, y0), [a0 * r, y0 - ground]], [p(a1, rb, y0), [a1 * r, y0 - ground]], [p(a1, r, y1), [a1 * r, h]], [p(a0, r, y1), [a0 * r, h]]], [Math.cos(am), 0.05, Math.sin(am)]);
    if (k % 2 === 0) box(B, x + Math.cos(am) * (r - 0.35), y1, z + Math.sin(am) * (r - 0.35), -Math.sin(am), Math.cos(am), (2 * Math.PI * r) / S - 0.05, 1.2, 0.7, a0 * r);
  }
  const base = B.count;
  B.v([x, y1, z], [0, 1, 0], [0, 0]);
  for (let k = 0; k <= S; k++) {
    const a = (k / S) * Math.PI * 2;
    B.v([x + Math.cos(a) * r, y1, z + Math.sin(a) * r], [0, 1, 0], [Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let k = 0; k < S; k++) B.tri(base, base + 1 + k, base + 2 + k, [0, 1, 0]);
}
