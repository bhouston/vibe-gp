// Ground around the circuit: a terrain heightfield that meets the track's verges and
// rolls away into natural hills out to the horizon, plus instanced trees.
//
// TerrainField answers "how high is the ground here, and how close to the track":
//  - within each path's corridor (track or pit lane out past the walls and verges) the
//    ground sits TERRAIN_DROP below the lowest nearby road, hidden under the verges;
//  - over the next BLEND metres it eases into a smooth inverse-distance interpolation
//    of the whole lap's heights, plus fractal undulation that grows with distance
//    (bigger on circuits with more relief), so far ground has believable hills.
import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { color, float, vec3, mix, step, fract, floor, abs, smoothstep as sstep, positionLocal, positionWorld, normalWorld, mx_noise_float, bumpMap } from 'three/tsl';
import { PIT } from './trackPath.js';
import { nightU } from './night.js';
import { LAND_KINDS } from './land.js';

export const TERRAIN_DROP = 0.6; // ground sits this far below the verges around the track
export const VERGE = 1.5; // flat grass beyond the wall (m)
export const SKIRT = 6; // then a grass skirt slopes down under the terrain over this width (m)
const CELL = 50, BLEND = 150;

// Per-circuit scenery: tree cover (0..1 share of the land near the track) and how many of the
// trees are conifers. Imported circuits carry their own `scenery` in the track definition,
// which can also set palms (palm trees instead of most broadleaves), desert / dunes (ground
// colour, see grassMaterial), paved (painted asphalt run-off and paved ground instead of
// any grass or sand, see pavedMaterial; `paint` = its two colours), illuminated (a brightly
// lit night circuit, see ILLUMINATED in track.js), city (blocks of buildings beyond the circuit, see buildCity)
// and tall (building height scale, e.g. the Las Vegas casinos).
const SCENERY = {
  spa: { trees: 0.62, conifer: 0.7 }, // in the Ardennes forest: spruce and beech
  silverstone: { trees: 0.16, conifer: 0.1 }, // open farmland with tree lines
  montreal: { trees: 0.42, conifer: 0.08 }, // park island: maples, ash, poplars
};
const DEFAULT_SCENERY = { trees: 0.25, conifer: 0.3 };

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic hash → [0, 1). */
function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

function fbm(x, z, octaves) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let k = 0; k < octaves; k++) {
    s += amp * noise2(x * f + k * 17.3, z * f - k * 9.1);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export class TerrainField {
  constructor(P) {
    this.P = P;
    const pit = P.pit;
    // reference points { x, z, h, r }: r = corridor half-width that stays under the verges
    const refs = [];
    for (let i = 0; i < P.N; i += 2) {
      refs.push({ x: P.px[i], z: P.pz[i], h: P.py[i], r: Math.max(P.wallL[i] + P.tyreL[i], P.wallR[i] + P.tyreR[i]) + VERGE + SKIRT });
    }
    if (pit) {
      for (let j = 0; j < pit.N; j += 4) {
        refs.push({ x: pit.px[j], z: pit.pz[j], h: pit.py[j], r: pit.outerHw(j) + PIT.wallClear + 20 + SKIRT });
      }
    }
    this.grid = new Map();
    let rMax = 0;
    for (const p of refs) {
      rMax = Math.max(rMax, p.r);
      const k = this.key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(p);
    }
    this.reach = Math.ceil((rMax + BLEND) / CELL);
    this.far = [];
    const farStep = Math.max(1, Math.round(25 / P.ds));
    for (let i = 0; i < P.N; i += farStep) this.far.push([P.px[i], P.pz[i], P.py[i]]);
    // hills: a few metres on a flat circuit, ~10 m around Spa, more towards the horizon
    this.hillAmp = Math.min(10, Math.max(2, P.elevationRange * 0.1));
  }

  key(cx, cz) {
    return cx * 100003 + cz;
  }

  /**
   * Ground at (x, z), with the land map's water (this.land, src/land.js) cut in: the
   * ground dips well under each lake, river and the sea, outside the track's corridor.
   */
  sample(x, z) {
    const s = this.sampleBase(x, z);
    const wat = this.land?.waterAt(x, z);
    if (wat && s.clear > 0) {
      const t = Math.min(1, wat.w * 1.6) * Math.min(1, s.clear / 8);
      s.y = Math.min(s.y, s.y + (wat.level - 2.5 - s.y) * t);
    }
    return s;
  }

  /**
   * Ground at (x, z) without water: { y, clear, mown }. clear = metres beyond the nearest corridor
   * (< 0 inside one, Infinity far away); mown = 1 on the cut grass by the track, fading
   * to 0 in the meadow.
   */
  sampleBase(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), R = this.reach;
    let inside = Infinity, eMin = Infinity, ws = 0, hs = 0;
    for (let gx = cx - R; gx <= cx + R; gx++) {
      for (let gz = cz - R; gz <= cz + R; gz++) {
        const list = this.grid.get(this.key(gx, gz));
        if (!list) continue;
        for (const p of list) {
          const e = Math.hypot(p.x - x, p.z - z) - p.r;
          if (e < 0) {
            inside = Math.min(inside, p.h);
            eMin = Math.min(eMin, e);
          } else if (e < BLEND) {
            const w = Math.exp(-e / 25);
            ws += w;
            hs += w * p.h;
            eMin = Math.min(eMin, e);
          }
        }
      }
    }
    if (inside < Infinity) return { y: inside - TERRAIN_DROP, clear: eMin, mown: 1 };

    let fw = 0, fh = 0, d2min = Infinity;
    for (const [px, pz, ph] of this.far) {
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      d2min = Math.min(d2min, d2);
      const w = 1 / (d2 + 120 * 120);
      fw += w;
      fh += w * ph;
    }
    const dist = Math.sqrt(d2min);
    const amp = this.hillAmp * (1 + 2.5 * smoothstep(700, 3500, dist));
    const hills = amp * (fbm(x / 520, z / 520, 4) + 0.35 * fbm(x / 140, z / 140, 2) * smoothstep(1500, 300, dist));
    const t = ws > 0 ? smoothstep(0, BLEND, eMin) : 1;
    const hFar = fh / fw + hills * t;
    const y = ws > 0 ? (hs / ws - TERRAIN_DROP) * (1 - t) + hFar * t : hFar;
    return { y, clear: ws > 0 ? eMin : Infinity, mown: ws > 0 ? 1 - smoothstep(0, 30, eMin) : 0 };
  }
}

/**
 * Terrain mesh on a rectilinear grid: 10 m cells over the circuit and 600 m around it,
 * then cells growing outwards to ~4 km so the ground reaches the hazy horizon.
 * Attribute `grass` = (mowX, mowZ, stripes, mown) as grassMaterial expects.
 */
export function terrainGeometry(field) {
  const b = field.P.bounds();
  const axis = (lo, hi) => {
    const xs = [];
    for (let x = lo; x < hi; x += 10) xs.push(x);
    xs.push(hi);
    for (const dir of [-1, 1]) {
      let d = 10, x = dir < 0 ? xs[0] : xs[xs.length - 1];
      while (Math.abs(x - (dir < 0 ? lo : hi)) < 3800) {
        d *= 1.18;
        x += dir * d;
        if (dir < 0) xs.unshift(x);
        else xs.push(x);
      }
    }
    return xs;
  };
  const pad = 600;
  const xs = axis(b.minX - pad, b.maxX + pad), zs = axis(b.minZ - pad, b.maxZ + pad);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), grass = new Float32Array(nx * nz * 4);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const k = iz * nx + ix;
      const s = field.sample(xs[ix], zs[iz]);
      pos.set([xs[ix], s.y, zs[iz]], k * 3);
      grass[k * 4 + 3] = s.mown;
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
  geo.setAttribute('grass', new THREE.BufferAttribute(grass, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------- trees

/** Spruce: short trunk and three stacked cones (local origin at the base, ~1 m tall). */
function coniferGeometry() {
  const crown = [];
  const tiers = [[0.36, 0.5, 0.18], [0.28, 0.42, 0.4], [0.18, 0.34, 0.62]]; // radius, height, base
  for (const [r, h, y] of tiers) {
    const c = new THREE.ConeGeometry(r, h, 11, 1, true);
    c.translate(0, y + h / 2, 0);
    crown.push(c);
  }
  const trunk = new THREE.CylinderGeometry(0.02, 0.03, 0.3, 5, 1, true);
  trunk.translate(0, 0.15, 0);
  return { crown: mergeGeometries(crown), trunk };
}

/** Palm: a tall thin trunk and a head of drooping fronds (local origin at the base, ~1 m tall). */
function palmGeometry() {
  const fronds = [];
  for (let k = 0; k < 9; k++) {
    // a thin flattened cone tipped out and down from the top of the trunk
    const f = new THREE.ConeGeometry(0.06, 0.55, 4, 1, true);
    f.scale(1, 1, 0.25);
    f.translate(0, 0.275, 0);
    f.rotateZ(-1.15 - (k % 3) * 0.25);
    f.rotateY((k / 9) * Math.PI * 2 + (k % 2) * 0.3);
    f.translate(0, 0.92, 0);
    fronds.push(f);
  }
  const trunk = new THREE.CylinderGeometry(0.018, 0.03, 0.94, 6, 1, true);
  trunk.translate(0, 0.47, 0);
  return { crown: mergeGeometries(fronds), trunk };
}

/** Broadleaf: trunk and a lumpy rounded crown (local origin at the base, ~1 m tall). */
function broadleafGeometry() {
  // polyhedra come unindexed (flat shaded); weld them so the lumps shade smoothly
  const crown = mergeVertices(new THREE.IcosahedronGeometry(0.5, 2).deleteAttribute('normal').deleteAttribute('uv'));
  const p = crown.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bump = 1 + 0.14 * noise2(x * 5 + 3.1, z * 5 + y * 4) + 0.07 * noise2(x * 13 - y * 7, z * 13 + 1.7);
    p.setXYZ(i, x * bump * 1.05, y * bump * 0.85, z * bump * 1.05);
  }
  crown.translate(0, 0.6, 0);
  crown.computeVertexNormals();
  const trunk = new THREE.CylinderGeometry(0.03, 0.05, 0.4, 5, 1, true);
  trunk.translate(0, 0.2, 0);
  return { crown, trunk };
}

/**
 * Foliage: darker low down and in the crown's hollows, lighter on leafy clumps (fakes
 * self-shadowing), with a clumpy bump so crowns read as masses of leaves or needles
 * rather than smooth plastic. Local units: the tree is ~1 tall before instancing.
 */
function foliageMaterial(tipLight, clumpScale) {
  const m = new THREE.MeshStandardNodeMaterial();
  const h = positionLocal.y; // 0..1 up the tree
  const clumps = mx_noise_float(positionLocal.mul(clumpScale)).mul(0.5).add(0.5);
  const leaves = mx_noise_float(positionLocal.mul(clumpScale * 4.3)).mul(0.5).add(0.5);
  const occl = mix(float(0.5), float(1.05), h.mul(0.5).add(clumps.mul(tipLight)).add(leaves.mul(0.15)).clamp(0, 1));
  m.colorNode = vec3(occl); // multiplied by each tree's instance colour
  m.normalNode = bumpMap(clumps.mul(0.7).add(leaves.mul(0.3)), 1.2);
  m.roughnessNode = float(0.85);
  m.metalnessNode = float(0.0);
  return m;
}

/**
 * Scatter trees outside the circuit: forests where a large-scale noise field says so
 * (more on wooded circuits), thinning out towards forest edges and away from the track,
 * never in a corridor, the pit area or on a grandstand (nor where `occupied(x, z)` says a
 * real building stands; without it, city circuits keep trees out of the procedural blocks).
 */
export function buildTrees(P, field, stands, group, trackId, scenery, occupied = null, land = null) {
  const sc = { ...DEFAULT_SCENERY, ...SCENERY[trackId], ...scenery };
  // with a land map: trees where the map has woods (and some in parks, gardens and towns),
  // none in fields, car parks or water; the noise forest only on unmapped land
  const LAND_TREES = { forest: 1, scrub: 0.3, grass: 0.07, urban: 0.06, meadow: 0.04, farmland: 0.004 };
  // (scenery.landTrees overrides per kind, e.g. { scrub: 0.02 } for open dunes)
  const landTrees = land ? LAND_KINDS.map((k) => sc.landTrees?.[k] ?? LAND_TREES[k] ?? 0) : null;
  if (sc.trees <= 0 && !land) return;
  const rand = rng(Math.round(P.length * 7) + 11);
  const b = P.bounds();
  const REACH = 380; // trees within this distance of the circuit
  const spacing = 9;
  const items = { conifer: [], broadleaf: [], palm: [] };
  const onStand = (x, z) => stands.some((f) => {
    const a = (x - f.ox) * f.ax + (z - f.oz) * f.az, d = (x - f.ox) * f.dx + (z - f.oz) * f.dz;
    return Math.abs(a) < f.L / 2 + 12 && d > -12 && d < f.depth + 12;
  });
  // the threshold that leaves roughly sc.trees of the land wooded
  const thresh = 0.55 - sc.trees * 1.1;
  for (let x = b.minX - REACH; x < b.maxX + REACH; x += spacing) {
    for (let z = b.minZ - REACH; z < b.maxZ + REACH; z += spacing) {
      const jx = x + (rand() - 0.5) * spacing * 0.9, jz = z + (rand() - 0.5) * spacing * 0.9;
      if (land?.noTrees(jx, jz)) continue;
      const kind = land ? land.kindAt(jx, jz) : -1;
      if (kind >= 0) {
        if (rand() >= landTrees[kind]) continue;
      } else {
        if (sc.trees <= 0) continue;
        const forest = fbm(jx / 260, jz / 260, 3) + 0.25 * noise2(jx / 45, jz / 45);
        const r = rand();
        if (forest < thresh + (r - 0.5) * 0.25) continue;
      }
      const s = field.sample(jx, jz);
      if (s.clear < 14 || s.clear === Infinity && !nearTrack(field, jx, jz, REACH)) continue;
      if (s.clear !== Infinity && s.clear > REACH) continue;
      if (onStand(jx, jz)) continue;
      if (occupied ? occupied(jx, jz) : sc.city && cityBlock(jx, jz, s)) continue;
      // fewer trees near the edge of the reach, so the woods fade rather than stop
      const dist = s.clear === Infinity ? farDist(field, jx, jz) : s.clear;
      if (rand() > smoothstep(REACH, REACH * 0.6, dist)) continue;
      const conifer = rand() < sc.conifer;
      const palm = !conifer && sc.palms && rand() < 0.8;
      const height = conifer ? 15 + rand() * 13 : palm ? 9 + rand() * 7 : 9 + rand() * 9;
      const width = height * (conifer ? 0.75 + rand() * 0.3 : palm ? 0.55 + rand() * 0.2 : 0.8 + rand() * 0.35);
      (conifer ? items.conifer : palm ? items.palm : items.broadleaf).push({ x: jx, y: s.y - 0.3, z: jz, height, width, yaw: rand() * Math.PI * 2, tint: rand() });
    }
  }

  // mapped tree rows (every ~7 m) and single trees
  if (land) {
    const one = (x, y) => {
      const jz = -y, s = field.sample(x, jz);
      if (s.clear < 6 || onStand(x, jz) || occupied?.(x, jz) || land.waterAt(x, jz) || land.noTrees(x, jz)) return;
      const conifer = rand() < sc.conifer * 0.6, palm = !conifer && sc.palms && rand() < 0.8;
      const height = conifer ? 14 + rand() * 10 : palm ? 9 + rand() * 6 : 9 + rand() * 8;
      const width = height * (conifer ? 0.75 : palm ? 0.6 : 0.9);
      (conifer ? items.conifer : palm ? items.palm : items.broadleaf).push({ x, y: s.y - 0.3, z: jz, height, width, yaw: rand() * Math.PI * 2, tint: rand() });
    };
    for (const row of land.osm.treeRows ?? []) {
      for (let k = 2; k < row.length; k += 2) {
        const ax = row[k - 2], ay = row[k - 1], bx = row[k], by = row[k + 1];
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 7));
        for (let t = 0; t < n; t++) one(ax + ((bx - ax) * t) / n, ay + ((by - ay) * t) / n);
      }
    }
    const t1 = land.osm.trees ?? [];
    for (let k = 0; k + 1 < t1.length; k += 2) one(t1[k], t1[k + 1]);
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const c = new THREE.Color();
  const trunkMat = new THREE.MeshStandardNodeMaterial();
  trunkMat.colorNode = color(0x4a3a2c);
  trunkMat.roughnessNode = float(0.95);
  const kinds = [
    ['conifer', coniferGeometry(), [0x2c4a30, 0x365632, 0x284530], 0.3, 18],
    ['broadleaf', broadleafGeometry(), [0x426a29, 0x527633, 0x5d7d2e, 0x4a6e31], 0.55, 9],
    ['palm', palmGeometry(), [0x4f7a2e, 0x5d8a34, 0x6b8f3a], 0.5, 14],
  ];
  // one instanced mesh per 300 m tile, so the view, the mirrors and the (small) shadow
  // frustum each cull whole tiles instead of drawing every tree every time
  const TILE = 300;
  for (const [name, geo, palette, tipLight, clumpScale] of kinds) {
    const tiles = new Map();
    for (const t of items[name]) {
      const k = `${Math.floor(t.x / TILE)},${Math.floor(t.z / TILE)}`;
      if (!tiles.has(k)) tiles.set(k, []);
      tiles.get(k).push(t);
    }
    if (!tiles.size) continue;
    const leafMat = foliageMaterial(tipLight, clumpScale);
    for (const list of tiles.values()) {
      const crown = new THREE.InstancedMesh(geo.crown, leafMat, list.length);
      const trunk = new THREE.InstancedMesh(geo.trunk, trunkMat, list.length);
      list.forEach((t, k) => {
        q.setFromAxisAngle(up, t.yaw);
        m.compose(pos.set(t.x, t.y, t.z), q, scl.set(t.width, t.height, t.width));
        crown.setMatrixAt(k, m);
        trunk.setMatrixAt(k, m);
        c.setHex(palette[Math.floor(t.tint * palette.length) % palette.length]);
        c.offsetHSL(0, 0, (t.tint * 7 % 1 - 0.5) * 0.05);
        crown.setColorAt(k, c);
      });
      crown.castShadow = true;
      crown.receiveShadow = true;
      trunk.receiveShadow = true;
      crown.computeBoundingSphere();
      trunk.computeBoundingSphere();
      group.add(crown, trunk);
    }
  }
}

function farDist(field, x, z) {
  let d2 = Infinity;
  for (const [px, pz] of field.far) d2 = Math.min(d2, (px - x) ** 2 + (pz - z) ** 2);
  return Math.sqrt(d2);
}

function nearTrack(field, x, z, reach) {
  return farDist(field, x, z) < reach;
}

// ---------------------------------------------------------------- city

/**
 * Whether a city block (buildings) stands at (x, z): a large-scale noise field and a
 * warped street grid leave streets and squares between blocks; nothing within 30 m of the
 * circuit.
 */
/**
 * For a seafront circuit with the sea to the `sea` side ('west' or 'east'): is (x, z) on
 * the landward side of every part of the circuit within 200 m north or south of it?
 * Past the ends of the circuit, the coast is taken to run on from the nearest end.
 */
function seaFilter(P, sea) {
  const dir = sea === 'west' ? 1 : -1; // landward = +x for a sea to the west
  const BAND = 50, edge = new Map(); // z band -> the circuit's landward-most x in it
  for (let i = 0; i < P.N; i++) {
    const k = Math.floor(P.pz[i] / BAND), v = P.px[i] * dir;
    if (!(edge.get(k) >= v)) edge.set(k, v);
  }
  const keys = [...edge.keys()], lo = Math.min(...keys), hi = Math.max(...keys);
  return (x, z) => {
    const k = Math.min(hi, Math.max(lo, Math.floor(z / BAND)));
    let e = -Infinity;
    for (let d = -4; d <= 4; d++) if (edge.has(k + d)) e = Math.max(e, edge.get(k + d));
    return x * dir > e + 30;
  };
}

function cityBlock(x, z, s) {
  if (s.clear !== Infinity && s.clear < 30) return false;
  const street = Math.abs(Math.sin(x / 41 + 0.7 * Math.sin(z / 230))) < 0.12 || Math.abs(Math.sin(z / 47 + 0.7 * Math.sin(x / 260))) < 0.12;
  return !street && fbm(x / 320, z / 320, 2) > -0.25;
}

/** Facades: rows of windows in world space (3.4 m storeys), plain roofs; tinted per building. */
function facadeMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld;
  const along = p.x.add(p.z);
  const win = step(0.32, fract(p.y.div(3.4))).mul(step(abs(fract(along.div(3.1)).sub(0.5)), 0.33));
  const wall = step(abs(normalWorld.y), 0.5);
  const glass = win.mul(wall);
  m.colorNode = mix(vec3(1), vec3(0.32, 0.38, 0.46), glass); // multiplied by the instance colour
  m.roughnessNode = mix(float(0.85), float(0.15), glass);
  m.metalnessNode = mix(float(0.0), float(0.5), glass);
  // at night about a third of the windows are lit, in warm and cool office tones
  const cell = vec3(floor(along.div(3.1)), floor(p.y.div(3.4)), floor(p.x.sub(p.z).div(9.7))).mul(0.731);
  const on = sstep(0.12, 0.2, mx_noise_float(cell));
  const tint = mix(color(0xffc98a), color(0xd8e6ff), sstep(-0.2, 0.2, mx_noise_float(cell.mul(1.9).add(5.3))));
  m.emissiveNode = tint.mul(glass.mul(on).mul(nightU).mul(1.6));
  return m;
}

/**
 * Blocks of buildings around a street circuit, beyond its walls, verges and grandstands:
 * instanced boxes on a jittered grid, taller further from the track (scenery.tall scales
 * them, e.g. the Las Vegas casinos).
 */
export function buildCity(P, field, stands, group, sc) {
  const rand = rng(Math.round(P.length * 13) + 5);
  const b = P.bounds();
  const REACH = 700, step = 34;
  const tall = sc.tall ?? 1;
  const onStand = (x, z) => stands.some((f) => {
    const a = (x - f.ox) * f.ax + (z - f.oz) * f.az, d = (x - f.ox) * f.dx + (z - f.oz) * f.dz;
    return Math.abs(a) < f.L / 2 + 25 && d > -25 && d < f.depth + 25;
  });
  // sc.sea ('west' / 'east'): a seafront circuit, buildings only on the landward side of
  // the whole circuit at each latitude (none between its legs or out on the water side)
  const landward = sc.sea ? seaFilter(P, sc.sea) : () => true;
  const list = [];
  for (let x = b.minX - REACH; x < b.maxX + REACH; x += step) {
    for (let z = b.minZ - REACH; z < b.maxZ + REACH; z += step) {
      const jx = x + (rand() - 0.5) * 8, jz = z + (rand() - 0.5) * 8;
      const s = field.sample(jx, jz);
      if (s.clear !== Infinity && s.clear < 30) continue;
      const dist = s.clear === Infinity ? farDist(field, jx, jz) : s.clear;
      if (dist > REACH || !cityBlock(jx, jz, s) || onStand(jx, jz) || !landward(jx, jz)) continue;
      // the whole footprint must be clear of the circuit
      const w = 14 + rand() * 14, d = 14 + rand() * 14;
      const yaw = Math.round(rand() * 2) * 0.05;
      let ok = true, lo = s.y;
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const c = field.sample(jx + (cx * w) / 2, jz + (cz * d) / 2);
        if (c.clear !== Infinity && c.clear < 22) ok = false;
        lo = Math.min(lo, c.y);
      }
      if (!ok) continue;
      const h = (8 + rand() * 22 + Math.min(dist, 500) * 0.05 * rand()) * tall * (rand() < 0.08 ? 2.2 : 1);
      list.push({ x: jx, y: lo - 1, z: jz, w, d, h: h + 1, yaw, tint: rand() });
    }
  }
  if (!list.length) return;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = facadeMaterial();
  const palette = [0xd8d2c4, 0xc9bfae, 0xe6e1d6, 0xb7b1a6, 0xcfc6b2, 0xa9b0b6, 0xe2d4bc];
  // one instanced mesh per 400 m tile so views and shadows cull whole tiles
  const TILE = 400;
  const tiles = new Map();
  for (const t of list) {
    const k = `${Math.floor(t.x / TILE)},${Math.floor(t.z / TILE)}`;
    if (!tiles.has(k)) tiles.set(k, []);
    tiles.get(k).push(t);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), c = new THREE.Color();
  for (const items of tiles.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((t, k) => {
      q.setFromAxisAngle(up, t.yaw);
      m.compose(pos.set(t.x, t.y, t.z), q, scl.set(t.w, t.h, t.d));
      mesh.setMatrixAt(k, m);
      c.setHex(palette[Math.floor(t.tint * palette.length) % palette.length]);
      mesh.setColorAt(k, c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}
