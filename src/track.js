// Builds the 3D circuit (terrain, road, kerbs, walls, start gantry, grid) for any track
// definition, using the centreline maths in trackPath.js. Everything follows the
// track's height profile (TrackPath.py); the road is level across its width.
import * as THREE from 'three/webgpu';
import { boxGeometry, ribbonGeometry, planeXZ } from './geometry.js';
import {
  asphaltMaterial, kerbMaterial, grassMaterial, checkerMaterial, simpleMaterial, layered,
  gravelMaterial, sausageMaterial,
} from './materials.js';
import { buildGarageFronts } from './pitBoxes.js';
import { buildBarriers, slopeNormal } from './barriers.js';
import { buildGrandstands } from './grandstands.js';
import { color, float, uv, mix, step, abs, fract, positionWorld, mx_noise_float, mx_fractal_noise_float } from 'three/tsl';
import { TrackPath, KERB_WIDTH, PIT, SAUSAGE, angleDiff } from './trackPath.js';
import { buildFloodMask, applyFloodMask, buildFloodlights } from './night.js';
import { TerrainField, terrainGeometry, buildTrees, buildCity, TERRAIN_DROP, VERGE, SKIRT } from './terrain.js';

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
    const sc = this.def.scenery ?? {};
    const grass = grassMaterial(sc.desert ? 'desert' : sc.dunes ? 'dunes' : sc.city ? 'city' : 'grass');
    this.field = new TerrainField(P);
    const ground = new THREE.Mesh(terrainGeometry(this.field), grass);
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

    // gravel traps and sausage kerbs where the real circuit has them (src/tracks/runoff.js)
    this.buildRunoff();

    // barriers: concrete walls with ad boards, tyre stacks on the outside of corners,
    // catch fences (track walls, pit wall, pit lane walls)
    buildBarriers(P, g, this.def.kerb?.colors);

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

    // spectator grandstands wherever there is room beside the circuit
    this.stands = buildGrandstands(P, g);
    // woods and tree lines beyond the circuit, clear of the stands
    buildTrees(P, this.field, this.stands, g, this.def.id, this.def.scenery);
    if (this.def.scenery?.city) buildCity(P, this.field, this.stands, g, this.def.scenery);
    // decks under the road where the circuit crosses over itself
    if (P.bridge.some(Boolean)) g.add(this.bridges());

    // night races: floodlight towers, and the land beyond their reach falls into darkness
    this.floodHeads = [];
    if (this.def.night) {
      this.floodHeads = buildFloodlights(P, this.field, this.stands, g);
      this.floodMask = buildFloodMask(P, this.stands);
      applyFloodMask(g);
    }

    g.traverse((o) => {
      if (o.isMesh && o !== ground) o.receiveShadow = true;
    });
  }

  /**
   * Where the circuit passes over itself (P.bridge), a concrete deck under the road and its
   * verges, wall to wall: a soffit 1.4 m down and a fascia down each side. The approaches
   * are the terrain, which follows each road's own height outside the other's corridor.
   */
  bridges() {
    const P = this.path;
    const g = new THREE.Group();
    const mat = simpleMaterial(0x9a9890, 0.9);
    mat.side = THREE.DoubleSide;
    const DEPTH = 1.4;
    const pad = Math.round(25 / P.ds); // carry the deck onto the abutments
    const flags = Array.from(P.bridge, Boolean);
    const ext = flags.map((_, i) => { for (let k = -pad; k <= pad; k++) if (flags[P.wrap(i + k)]) return true; return false; });
    for (const [i0, count] of this.runs(ext)) {
      const at = (k) => P.wrap(i0 + k);
      const edge = (i, side) => side * ((side > 0 ? P.wallL[i] : P.wallR[i]) + VERGE);
      const pt = (i, lat, dy) => [P.px[i] + P.leftX(i) * lat, P.py[i] + dy, P.pz[i] + P.leftZ(i) * lat];
      g.add(new THREE.Mesh(ribbonGeometry(count, (k) => {
        const i = at(k);
        return { a: pt(i, edge(i, -1), -DEPTH), b: pt(i, edge(i, 1), -DEPTH), na: [0, -1, 0], uva: [k * P.ds, 0], uvb: [k * P.ds, 1] };
      }), mat));
      for (const side of [1, -1]) {
        g.add(new THREE.Mesh(ribbonGeometry(count, (k) => {
          const i = at(k), lat = edge(i, side);
          return { a: pt(i, lat, -0.05), b: pt(i, lat, -DEPTH), na: [P.leftX(i) * side, 0, P.leftZ(i) * side], uva: [k * P.ds, 0], uvb: [k * P.ds, 1] };
        }), mat));
      }
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    return g;
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
   * Gravel traps: a flat bed of stones over the verge between gravelIn and gravelOut on
   * each side (uv = metres along, lateral offset). Sausage kerbs: a rounded yellow hump
   * behind the painted kerb, ramping up and down at each end of a run.
   */
  buildRunoff() {
    const P = this.path, g = this.group;
    const gravelMat = layered(gravelMaterial(P.gravelColor), 1);
    for (const side of [1, -1]) {
      const inA = side > 0 ? P.gravelInL : P.gravelInR, outA = side > 0 ? P.gravelOutL : P.gravelOutR;
      for (const [i0, count] of this.runs(Array.from(outA, (v) => v > 0))) {
        const n = count - 1; // the run's last flag is the first sample past it
        if (n < 2) continue;
        const geo = ribbonGeometry(n, (k) => {
          const i = P.wrap(i0 + k), lx = P.leftX(i), lz = P.leftZ(i), h = P.py[i] + 0.012;
          const a = side * inA[i], b = side * outA[i];
          return {
            a: [P.px[i] + lx * a, h, P.pz[i] + lz * a],
            b: [P.px[i] + lx * b, h, P.pz[i] + lz * b],
            na: slopeNormal(P.grade[i], P.tx[i], P.tz[i]),
            uva: [(i0 + k) * P.ds, a],
            uvb: [(i0 + k) * P.ds, b],
          };
        });
        g.add(this.mesh(geo, gravelMat));
      }
    }

    // sausage kerbs: profile across the hump (lateral fraction, height fraction)
    const prof = [[0, 0], [0.12, 0.55], [0.3, 0.92], [0.5, 1], [0.7, 0.92], [0.88, 0.55], [1, 0]];
    const sMat = sausageMaterial();
    for (const side of [1, -1]) {
      const flags = side > 0 ? P.sausageL : P.sausageR;
      for (const [i0, count] of this.runs(Array.from(flags, Boolean))) {
        const n = count - 1;
        if (n < 2) continue;
        const pos = [], uvs = [], idx = [];
        for (let k = 0; k < n; k++) {
          const i = P.wrap(i0 + k), lx = P.leftX(i), lz = P.leftZ(i);
          const ramp = Math.min(1, k / 1.5, (n - 1 - k) / 1.5); // ends slope down to the ground
          for (const [f, hf] of prof) {
            const lat = side * (P.sausageLat + f * SAUSAGE.width);
            pos.push(P.px[i] + lx * lat, P.py[i] + 0.02 + hf * SAUSAGE.height * Math.max(0, ramp), P.pz[i] + lz * lat);
            uvs.push((i0 + k) * P.ds, f);
          }
        }
        const M = prof.length;
        for (let k = 0; k < n - 1; k++) {
          for (let j = 0; j < M - 1; j++) {
            const a = k * M + j, b = a + 1, c = a + M, d = c + 1;
            if (side > 0) idx.push(a, c, b, b, c, d);
            else idx.push(a, b, c, b, d, c);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        // make sure the hump faces up whichever way the strip winds
        const nrm = geo.attributes.normal;
        if (nrm.getY(M * Math.floor(n / 2) + 3) < 0) {
          idx.reverse();
          geo.setIndex(idx);
          geo.computeVertexNormals();
        }
        const mesh = this.mesh(geo, sMat);
        mesh.castShadow = true;
        g.add(mesh);
      }
    }
  }

  /**
   * Grass at road level beside the track (centre out to just past each wall) and beside
   * the pit lane, each edged with a skirt sloping down under the terrain. Widths are
   * capped on the inside of bends so the strips never fold over themselves.
   */
  vergeGeometries() {
    const P = this.path, pit = P.pit;
    const geos = [];
    // one side of a path: flat from the centre to edge(k), then down to outer(k).
    // uv = (metres along, lateral offset); attribute grass = (mowing direction, stripes, mown)
    const side = (count, at, edge, outer) => {
      for (const [from, to, drop] of [[() => 0, edge, 0], [edge, outer, -TERRAIN_DROP - 0.4]]) {
        const geo = ribbonGeometry(count, (k) => {
          const c = at(k), a = from(k), b = to(k);
          return { a: c.p(a, 0), b: c.p(b, drop), na: c.n, uva: [c.s, a], uvb: [c.s, b] };
        });
        const grass = new Float32Array(count * 8);
        for (let k = 0; k < count; k++) {
          const t = at(k).t;
          grass.set([t[0], t[1], 1, 1, t[0], t[1], 1, 1], k * 8);
        }
        geo.setAttribute('grass', new THREE.BufferAttribute(grass, 4));
        geos.push(geo);
      }
    };
    const insideCap = (k, sgn) => (sgn * k > 0 ? 0.9 / Math.abs(k) : Infinity);

    const mainAt = (k) => {
      const i = P.wrap(k);
      const lx = P.leftX(i), lz = P.leftZ(i), h = P.py[i];
      return { n: slopeNormal(P.grade[i], P.tx[i], P.tz[i]), t: [P.tx[i], P.tz[i]], s: k * P.ds, p: (lat, dy) => [P.px[i] + lx * lat, h + dy, P.pz[i] + lz * lat] };
    };
    for (const sgn of [1, -1]) {
      const w0 = sgn > 0 ? P.wallL : P.wallR, ty = sgn > 0 ? P.tyreL : P.tyreR;
      const wall = w0.map((w, i) => w + ty[i]); // concrete sits behind any tyre stack
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
        return { n: slopeNormal(pit.grade[j], pit.tx[j], pit.tz[j]), t: [pit.tx[j], pit.tz[j]], s: j * pit.ds, p: (lat, dy) => [pit.px[j] + lx * lat, h + dy, pit.pz[j] + lz * lat] };
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
    // each team's own garage (open, with its name board) and pit box; spare garages closed
    this.textures = buildGarageFronts(pit, g, front);
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

  /** Trackside TV camera spots every ~160 m, on the outside of the bend, between the fence and any stand. */
  placeTvCams() {
    const P = this.path;
    const cams = [];
    const step = Math.max(1, Math.round(160 / P.ds));
    for (let i = 0; i < P.N; i += step) {
      const k = P.curvature[i];
      const side = k > 0 ? -1 : 1; // outside of the corner
      const wall = side > 0 ? P.wallL[i] + P.tyreL[i] : P.wallR[i] + P.tyreR[i];
      const lat = side * (wall + 4.5);
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
    for (const t of this.textures ?? []) t.dispose();
    this.floodMask?.texture.dispose();
  }
}
