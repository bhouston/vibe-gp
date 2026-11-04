// Real land cover around a circuit: OpenStreetMap areas, roads and coastline
// (def.landOsm, from scripts/fetch-land.mjs) plus hand-traced areas (def.land.areas, from
// src/tracks/land/<id>.js), rasterised on a CELL grid around the circuit.
//
//  - The ground shader (materials.js landBlend) samples one texture of the land's colours,
//    baked per cell on the CPU (bakeColours), so fields, car parks, roads and
//    woods show on the terrain. Nothing is drawn inside the track's corridor (its walls,
//    verges and the pit area), whose run-off comes from src/tracks/land/<id>.js `surfaces`.
//  - Water: lakes, rivers and basins, and the sea (flooded from the coastline). Each body
//    gets one level from its shore heights; the terrain dips under it (TerrainField) and a
//    flat surface is drawn at that level (buildWater).
//  - Trees: woods are wooded, parks and gardens lightly, fields not at all (terrain.js).
//
// Map coordinates: +x east, +y north; world.x = x, world.z = -y.
import * as THREE from 'three/webgpu';
import { texture, uniform, positionWorld, vec2 } from 'three/tsl';
import { VERGE } from './terrain.js';
import { PIT } from './trackPath.js';

/** Land kinds, lowest priority first (a later kind is drawn over an earlier one). */
export const LAND_KINDS = ['urban', 'farmland', 'meadow', 'grass', 'scrub', 'forest', 'sand', 'gravel', 'concrete', 'asphalt', 'water'];
export const KIND = Object.fromEntries(LAND_KINDS.map((k, i) => [k, i]));
const NONE = 255;
const CELL = 4; // m per raster cell
const PAD = 900; // raster covers the circuit's bounds plus this much (m)

// ---- shader side: one colour texture, swapped per track (1x1 transparent = no land) ----
// The land's look is baked per cell on the CPU (bakeColours), so the ground shader only
// samples it: rgb = the land's colour there, a = how much land covers the ground.
const clear = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
clear.needsUpdate = true;
const landOrigin = uniform(new THREE.Vector2(0, 0));
const landSize = uniform(new THREE.Vector2(1, 1));
const landTex = texture(clear, vec2(0.5));
/** The baked land colour (rgb) and coverage (a) at the shaded point. */
export const landSample = landTex.sample(positionWorld.xz.sub(landOrigin).div(landSize));

/** Install (or clear, with null) a track's land texture. */
export function setLandMaps(land) {
  landTex.value = land ? land.texture : clear;
  landOrigin.value.set(land ? land.x0 : 0, land ? land.z0 : 0);
  landSize.value.set(land ? land.nx * CELL : 1, land ? land.nz * CELL : 1);
}

// ---- CPU side ----

const pairs = (flat, from = 0) => {
  const out = [];
  for (let k = from; k + 1 < flat.length; k += 2) out.push([flat[k], flat[k + 1]]);
  return out;
};
/** An OSM area's rings: outer first, then holes, separated by nulls in the flat list. */
const ringsOf = (a) => {
  const rings = [[]];
  for (let k = 1; k < a.length; ) {
    if (a[k] == null) { rings.push([]); k++; continue; } // null (or an empty slot)
    rings[rings.length - 1].push([a[k], a[k + 1]]);
    k += 2;
  }
  return rings.filter((r) => r.length >= 3);
};

export class LandMap {
  /**
   * P: TrackPath; def: the track definition; field: TerrainField (for shore heights; its
   * own water dip is switched on once the levels are known).
   */
  constructor(P, def, field) {
    const osm = def.landOsm ?? {};
    const b = P.bounds();
    this.x0 = b.minX - PAD;
    this.z0 = b.minZ - PAD;
    this.nx = Math.ceil((b.maxX - b.minX + 2 * PAD) / CELL);
    this.nz = Math.ceil((b.maxZ - b.minZ + 2 * PAD) / CELL);
    this.cls = new Uint8Array(this.nx * this.nz).fill(NONE);
    this.osm = osm;

    // areas by kind priority: OpenStreetMap first, then the hand-traced ones over them
    const byKind = (list) => [...list].sort((a, c) => KIND[a.kind] - KIND[c.kind]);
    const osmAreas = (osm.areas ?? []).map((a) => ({ kind: a[0], pts: ringsOf(a) })).filter((a) => a.kind in KIND);
    const hand = (def.land?.areas ?? []).filter((a) => a.kind in KIND);
    // hand areas with noTrees: no trees inside at all (also mapped single trees and rows);
    // such an area may leave out `kind` to only clear trees
    this.treeless = new Uint8Array(this.nx * this.nz);
    for (const a of def.land?.areas ?? []) if (a.noTrees) this.fillPoly(a.pts, 1, this.treeless);
    for (const a of byKind(osmAreas)) {
      if (a.kind === 'water') continue; // after the roads, so bridges don't cut rivers
      this.fillPoly(a.pts, KIND[a.kind]);
    }
    for (const r of osm.roads ?? []) this.stampLine(pairs(r, 1), r[0] / 2, KIND.asphalt);
    for (const a of osmAreas) if (a.kind === 'water') this.fillPoly(a.pts, KIND.water);
    this.sea = this.floodSea(osm.coast ?? []);
    for (const a of byKind(hand.filter((a) => !a.over))) this.fillPoly(a.pts, KIND[a.kind]);
    this.clearCorridor(P);
    // hand areas marked `over` are drawn into the corridor too (an infield car park or link
    // road between two parts of the circuit): looks only, the run-off still drives as set
    for (const a of byKind(hand.filter((a) => a.over))) this.fillPoly(a.pts, KIND[a.kind]);
    this.waterBodies(field);
    this.texture = this.bakeColours(def.surfaces?.gravel, def.scenery?.landColors);
  }

  idx(x, z) {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }

  /** True where a hand area says no trees grow. */
  noTrees(x, z) {
    const k = this.idx(x, z);
    return k >= 0 && this.treeless[k] === 1;
  }

  /** Land kind index at a world point, or -1 (unmapped / outside the raster / the track). */
  kindAt(x, z) {
    const k = this.idx(x, z);
    return k < 0 || this.cls[k] === NONE ? -1 : this.cls[k];
  }

  /**
   * Even-odd scanline fill of a map-coordinate polygon (into `cls`, or another grid): one
   * ring [[x, y], ...], or several [[[x, y], ...], ...] (an outer ring and its holes).
   */
  fillPoly(pts, v, cls = this.cls) {
    const rings = Array.isArray(pts[0]?.[0]) ? pts : [pts];
    if (rings[0].length < 3) return;
    const { nx, nz, x0, z0 } = this;
    let zmin = Infinity, zmax = -Infinity;
    for (const r of rings) for (const [, y] of r) { zmin = Math.min(zmin, -y); zmax = Math.max(zmax, -y); }
    const j0 = Math.max(0, Math.floor((zmin - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((zmax - z0) / CELL));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * CELL;
      xs.length = 0;
      for (const r of rings) {
        for (let k = 0, m = r.length - 1; k < r.length; m = k++) {
          const za = -r[k][1], zb = -r[m][1];
          if ((za > z) !== (zb > z)) xs.push(r[k][0] + ((z - za) / (zb - za)) * (r[m][0] - r[k][0]));
        }
      }
      xs.sort((a, c) => a - c);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.round((xs[k] - x0) / CELL)), i1 = Math.min(nx - 1, Math.round((xs[k + 1] - x0) / CELL) - 1);
        for (let i = i0; i <= i1; i++) cls[j * nx + i] = v;
      }
    }
  }

  /** Thick polyline (map coordinates), half-width r. */
  stampLine(pts, r, v) {
    const { nx, nz, x0, z0, cls } = this;
    for (let k = 1; k < pts.length; k++) {
      const ax = pts[k - 1][0], az = -pts[k - 1][1], bx = pts[k][0], bz = -pts[k][1];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + r - x0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz) + r - z0) / CELL));
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
          const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
          if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= r) cls[j * nx + i] = v;
        }
      }
    }
  }

  /**
   * The sea: coastlines (land on the left, water on the right) wall off the raster; flood
   * from just right of each coastline. If the flood also reaches a cell just left of one
   * (a gap in the coastline), the result is unreliable and the sea is left out.
   */
  floodSea(coast) {
    if (!coast.length) return null;
    const { nx, nz, x0, z0 } = this;
    const wall = new Uint8Array(nx * nz), seeds = [], lands = [];
    for (const flat of coast) {
      const pts = pairs(flat);
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / (CELL * 0.5)));
        for (let s = 0; s <= n; s++) {
          const k2 = this.idx(ax + ((bx - ax) * s) / n, -(ay + ((by - ay) * s) / n));
          if (k2 >= 0) wall[k2] = 1;
        }
        // right of the direction of travel (map coords): (dy, -dx)
        const mx = (ax + bx) / 2, my = (ay + by) / 2, ux = (by - ay) / (len || 1), uy = -(bx - ax) / (len || 1);
        for (const [list, sgn] of [[seeds, 1], [lands, -1]]) {
          const k2 = this.idx(mx + ux * sgn * CELL * 1.6, -(my + uy * sgn * CELL * 1.6));
          if (k2 >= 0) list.push(k2);
        }
      }
    }
    const sea = new Uint8Array(nx * nz), stack = [];
    for (const s of seeds) if (!wall[s] && !sea[s]) { sea[s] = 1; stack.push(s); }
    while (stack.length) {
      const k = stack.pop(), i = k % nx, j = (k / nx) | 0;
      for (const n of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < nz - 1 ? k + nx : -1]) {
        if (n >= 0 && !wall[n] && !sea[n]) { sea[n] = 1; stack.push(n); }
      }
    }
    let leaks = 0;
    for (const l of lands) if (sea[l] && !wall[l]) leaks++;
    if (leaks > lands.length * 0.05) {
      console.warn(`land: coastline doesn't close (${leaks} leaks); sea left out`);
      return null;
    }
    for (let k = 0; k < sea.length; k++) if (sea[k] || (wall[k] && this.neighbourSea(sea, k))) this.cls[k] = KIND.water;
    return sea;
  }

  neighbourSea(sea, k) {
    const nx = this.nx;
    return sea[k - 1] || sea[k + 1] || sea[k - nx] || sea[k + nx];
  }

  /** Nothing inside the track's barriers and verges, the pit lane and garages. */
  clearCorridor(P) {
    const stamp = (x, z, r) => {
      const { nx, nz, x0, z0, cls } = this;
      const i0 = Math.max(0, Math.floor((x - r - x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((x + r - x0) / CELL));
      const j0 = Math.max(0, Math.floor((z - r - z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((z + r - z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          if (Math.hypot(x0 + (i + 0.5) * CELL - x, z0 + (j + 0.5) * CELL - z) <= r) cls[j * nx + i] = NONE;
        }
      }
    };
    for (let i = 0; i < P.N; i += 2) {
      // each side out to its own barrier
      for (const s of [1, -1]) {
        const w = s > 0 ? P.wallL[i] + P.tyreL[i] : P.wallR[i] + P.tyreR[i];
        for (let d = 0; d <= w + VERGE + 1; d += CELL) stamp(P.px[i] + P.leftX(i) * s * d, P.pz[i] + P.leftZ(i) * s * d, CELL * 0.8);
      }
    }
    const pit = P.pit;
    if (pit) for (let j = 0; j < pit.N; j += 2) stamp(pit.px[j], pit.pz[j], pit.outerHw(j) + PIT.wallClear + 22);
  }

  /** Connected bodies of water, each with a level from its shore heights. */
  waterBodies(field) {
    const { nx, nz, x0, z0, cls } = this;
    this.body = new Int32Array(nx * nz).fill(-1);
    this.levels = [];
    this.bodies = [];
    const W = KIND.water;
    for (let s = 0; s < cls.length; s++) {
      if (cls[s] !== W || this.body[s] >= 0) continue;
      const id = this.levels.length, cells = [s], shore = [];
      this.body[s] = id;
      for (let q = 0; q < cells.length; q++) {
        const k = cells[q], i = k % nx, j = (k / nx) | 0;
        for (const n of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < nz - 1 ? k + nx : -1]) {
          if (n < 0) continue;
          if (cls[n] === W) {
            if (this.body[n] < 0) { this.body[n] = id; cells.push(n); }
          } else shore.push(n);
        }
      }
      // level: low on the shore (ground slopes down to the water), sampled sparsely
      const step = Math.max(1, Math.floor(shore.length / 300));
      const ys = [];
      for (let q = 0; q < shore.length; q += step) {
        const k = shore[q];
        ys.push(field.sample(x0 + ((k % nx) + 0.5) * CELL, z0 + (((k / nx) | 0) + 0.5) * CELL).y);
      }
      ys.sort((a, c) => a - c);
      const level = (ys.length ? ys[Math.floor(ys.length * 0.15)] : 0) - 0.5;
      this.levels.push(level);
      this.bodies.push(cells);
    }
  }

  /** Water at a world point: { w (0..1, bilinear), level } or null. */
  waterAt(x, z) {
    const fx = (x - this.x0) / CELL - 0.5, fz = (z - this.z0) / CELL - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    let w = 0, level = null;
    for (const [di, dj, f] of [[0, 0, (1 - tx) * (1 - tz)], [1, 0, tx * (1 - tz)], [0, 1, (1 - tx) * tz], [1, 1, tx * tz]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
      const b = this.body[jj * this.nx + ii];
      if (b >= 0) {
        w += f;
        level = level === null ? this.levels[b] : Math.min(level, this.levels[b]);
      }
    }
    return w > 0 ? { w, level } : null;
  }

  /**
   * Bake each cell's look into an sRGB texture: woods as a canopy of crowns, fields as a
   * patchwork of ~70 m crops, towns as a mottle of roofs, paving and gardens, car parks and
   * roads as tarmac (fine grain is added in the shader).
   */
  bakeColours(gravelHex, overrides = {}) {
    const { nx, nz, cls, x0, z0 } = this;
    const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const scale = (a, f) => [a[0] * f, a[1] * f, a[2] * f];
    const C = Object.fromEntries(Object.entries({
      urban: 0x86827a, urbanGreen: 0x5f6f45, meadow: 0x617c37, meadow2: 0x7b8545, grass: 0x4c7e30, grass2: 0x5b8d39,
      scrub: 0x5a693a, scrubDark: 0x34452a, canopy: 0x3d5e2c, canopy2: 0x4c6d33, canopyGap: 0x22331b,
      gravel: gravelHex ?? 0xa39b8b, // the circuit's own gravel colour
      sand: 0xd6c29a, sand2: 0xe4d4ae, concrete: 0x9b9891, asphalt: 0x3b3c40, asphalt2: 0x46474b, water: 0x22363a,
      ...overrides, // scenery.landColors: a circuit's own shades (e.g. pale dune scrub)
    }).map(([k, v]) => [k, hex(v)]));
    const CROPS = [0x6f8a38, 0x86913f, 0x9b9a52, 0xb9a46c, 0xa8945c, 0x7d6243, 0x5f7d33].map(hex);
    const data = new Uint8Array(nx * nz * 4);
    for (let j = 0; j < nz; j++) {
      const z = z0 + (j + 0.5) * CELL;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, c = cls[k];
        if (c === NONE) continue;
        const x = x0 + (i + 0.5) * CELL;
        const n1 = vnoise(x / 60, z / 60), n2 = vnoise(x / 9 + 17, z / 9 - 3), n3 = vnoise(x / 4.5 - 7, z / 4.5 + 5);
        let col;
        switch (LAND_KINDS[c]) {
          case 'urban': col = mixc(mixc(C.urban, C.urbanGreen, Math.min(1, Math.max(0, (n2 - 0.5) * 4)) * 0.7), scale(C.urban, 1.15), n3 * 0.5); break;
          case 'farmland': {
            // warped ~70 m fields, one crop each, with faint rows
            const wx = x + (vnoise(x / 250, z / 250) - 0.5) * 80, wz = z + (vnoise(x / 250 + 9, z / 250 + 4) - 0.5) * 80;
            const fid = hashc(Math.floor(wx / 70), Math.floor(wz / 70));
            col = CROPS[Math.floor(fid * CROPS.length)];
            col = mixc(col, scale(col, 0.88), (Math.sin((fid > 0.5 ? wx : wz) * 2.4) * 0.5 + 0.5) * 0.6);
            break;
          }
          case 'meadow': col = mixc(C.meadow, C.meadow2, n1); break;
          case 'grass': col = mixc(C.grass, C.grass2, n1); break;
          case 'scrub': col = mixc(C.scrub, C.scrubDark, Math.min(1, Math.max(0, (n2 - 0.35) * 2.5)) * 0.8); break;
          case 'forest': col = n3 < 0.3 ? C.canopyGap : mixc(C.canopy, C.canopy2, n1 * 0.6 + n3 * 0.4); break;
          case 'sand': col = mixc(C.sand, C.sand2, n1); break;
          case 'gravel': col = mixc(C.gravel, scale(C.gravel, 1.1), n2); break;
          case 'concrete': col = mixc(C.concrete, scale(C.concrete, 1.08), n2); break;
          case 'asphalt': col = mixc(C.asphalt, C.asphalt2, n1 * 0.6 + n2 * 0.4); break;
          default: col = C.water;
        }
        data[k * 4] = Math.min(255, col[0]);
        data[k * 4 + 1] = Math.min(255, col[1]);
        data[k * 4 + 2] = Math.min(255, col[2]);
        data[k * 4 + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  dispose() {
    this.texture.dispose();
  }
}

function hashc(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hashc(xi, zi), b = hashc(xi + 1, zi), c = hashc(xi, zi + 1), d = hashc(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Flat water surfaces, one mesh per body at its level: the body's cells merged into
 * runs along each raster row, reaching a little past the shore (the terrain, sloping
 * up out of the water, hides the stepped edge).
 */
export function buildWater(land, material, group) {
  const { nx, x0, z0 } = land;
  land.bodies.forEach((cells, id) => {
    const y = land.levels[id];
    const rows = new Map();
    for (const k of cells) {
      const j = (k / nx) | 0;
      if (!rows.has(j)) rows.set(j, []);
      rows.get(j).push(k % nx);
    }
    const pos = [], idx = [];
    for (const [j, list] of rows) {
      list.sort((a, c) => a - c);
      for (let s = 0; s < list.length; ) {
        let e = s;
        while (e + 1 < list.length && list[e + 1] === list[e] + 1) e++;
        const xa = x0 + list[s] * CELL - CELL, xb = x0 + (list[e] + 1) * CELL + CELL;
        const za = z0 + j * CELL - CELL * 0.5, zb = z0 + (j + 1) * CELL + CELL * 0.5;
        const v = pos.length / 3;
        pos.push(xa, y, za, xb, y, za, xb, y, zb, xa, y, zb);
        idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
        s = e + 1;
      }
    }
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  });
}
