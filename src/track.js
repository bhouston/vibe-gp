// Builds the 3D circuit (road, kerbs, walls, start gantry, grid) for any track
// definition, using the centreline maths in trackPath.js.
import * as THREE from 'three/webgpu';
import { boxGeometry, ribbonGeometry, planeXZ } from './geometry.js';
import {
  asphaltMaterial, kerbMaterial, grassMaterial, wallMaterial, checkerMaterial, simpleMaterial,
} from './materials.js';
import { color, float, uv, mix, step, abs, fract, positionWorld, mx_noise_float, mx_fractal_noise_float } from 'three/tsl';
import { TrackPath, KERB_WIDTH, WALL_THICKNESS, PIT } from './trackPath.js';
import { TEAMS } from './teams.js';

const WALL_HEIGHT = 1.1;

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
  const p = (k, off, y) => [pts[idx(k)][0] + side[idx(k)][0] * off, y, pts[idx(k)][1] + side[idx(k)][1] * off];
  const geos = [];
  for (const sgn of [1, -1]) {
    geos.push(ribbonGeometry(count, (k) => ({
      a: p(k, sgn * t, 0), b: p(k, sgn * t, height),
      na: [side[idx(k)][0] * sgn, 0, side[idx(k)][1] * sgn],
      uva: [u(k), 0], uvb: [u(k), 1],
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
        a: p(k, (m * 2 - 1) * t, 0), b: p(k, (m * 2 - 1) * t, height),
        na: [dx / l, 0, dz / l], uva: [u(k), 0], uvb: [u(k), 1],
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

    // ground
    const b = P.bounds();
    const pad = 900;
    const ground = new THREE.Mesh(planeXZ(b.minX - pad, b.minZ - pad, b.maxX + pad, b.maxZ + pad, 0), grassMaterial());
    ground.receiveShadow = true;
    g.add(ground);

    // asphalt: uv.x = metres along, uv.y = 0 (right edge) .. 1 (left edge)
    // Flat layers a few cm apart are below depth precision from a high or distant camera,
    // so they are also layered with polygon offset: grass < road < kerbs / pit lane < paint.
    const road = this.strip(-P.hw, P.hw, 0.02, (lat) => (lat + P.hw) / P.width);
    g.add(this.mesh(road, layered(asphaltMaterial(), 1)));

    // kerbs on each side of every corner run (none where the pit wall or pit lane takes their place)
    const kerbMat = layered(kerbMaterial(1 / 4), 2); // one stripe every 4 m
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
    line.position.set(start.x, 0, start.z);
    line.rotation.y = start.yaw;
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

  /** Flat strip between two lateral offsets. uvY(lat) maps offset -> uv.y. */
  strip(latA, latB, y, uvY, i0 = 0, count = this.path.N + 1) {
    const P = this.path;
    return ribbonGeometry(count, (k) => {
      const i = P.wrap(i0 + k);
      const s = (i0 + k) * P.ds;
      const lx = P.leftX(i), lz = P.leftZ(i);
      return {
        a: [P.px[i] + lx * latA, y, P.pz[i] + lz * latA],
        b: [P.px[i] + lx * latB, y, P.pz[i] + lz * latB],
        na: [0, 1, 0],
        uva: [s, uvY(latA)],
        uvb: [s, uvY(latB)],
      };
    });
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
        a: [pit.px[j] + lx * inner, 0.025, pit.pz[j] + lz * inner],
        b: [pit.px[j] + lx * outer, 0.025, pit.pz[j] + lz * outer],
        na: [0, 1, 0],
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
      m.position.set(p.x, 0, p.z);
      m.rotation.y = p.yaw;
      g.add(m);
    }

    if (gLen <= 0) return;
    // garage block: facade on the lane's outer wall line, 16 m deep, 8 m tall
    const front = (j) => pit.outerHw(j) + PIT.wallClear;
    const depth = 16, height = 8;
    const j0 = Math.ceil(pit.garageStart / pit.ds), j1 = Math.floor(pit.garageEnd / pit.ds);
    const at = (j, lat, y) => [pit.px[j] + pit.leftX(j) * o * lat, y, pit.pz[j] + pit.leftZ(j) * o * lat];
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
      grp.position.set(p.x + pit.leftX(p.j) * o * lat, 0, p.z + pit.leftZ(p.j) * o * lat);
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
    g.position.set(pose.x, 0, pose.z);
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
      slot.position.set(p.x, 0.035, p.z);
      slot.rotation.y = p.yaw;
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
        y: 7,
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
