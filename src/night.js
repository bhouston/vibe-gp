// Night races (def.night): floodlight towers along the circuit, a "floodlit" mask that
// keeps the corridor bright while the land beyond falls into darkness, and a small pool
// of real point lights that follows the camera between the nearest lamp heads.
//
// Lighting model: the scene's key light is a near-vertical "floodlight" directional (main.js),
// which lights everything evenly like the hundreds of real lamps do along the track. The
// mask darkens the albedo of every track-group surface by distance from the circuit, so
// the lit area ends where the towers do instead of the whole countryside being floodlit.
import * as THREE from 'three/webgpu';
import {
  texture, uniform, positionWorld, vec2, vec3, vec4, uv, float, smoothstep, length,
  materialColor, instancedBufferAttribute, color, mix, sin,
} from 'three/tsl';
import { boxGeometry, ribbonGeometry } from './geometry.js';
import { WALL_HEIGHT } from './barriers.js';
import { PIT, WALL_THICKNESS } from './trackPath.js';
import { VERGE } from './terrain.js';

const CELL = 4; // mask resolution (m per texel)
const MARGIN = 500; // mask covers the circuit bounds plus this much (m)
const FALLOFF = 55; // light fades to the floor over this far beyond the corridor (m)
export const NIGHT_FLOOR = 0.07; // albedo scale in the dark, far from any floodlight

// 1x1 white until a night track installs its mask: day tracks are unaffected
const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;
const maskOrigin = uniform(new THREE.Vector2(0, 0));
const maskSize = uniform(new THREE.Vector2(1, 1));
const maskTex = texture(white, vec2(0.5));
/** 1 on the floodlit circuit, NIGHT_FLOOR out in the dark (1 everywhere by day). */
export const floodLit = maskTex.sample(positionWorld.xz.sub(maskOrigin).div(maskSize)).r;
/** 1 at night, 0 by day: drives emissive city windows etc. */
export const nightU = uniform(0);

/** Install (or clear, with null) the floodlight mask that `floodLit` samples. */
export function setFloodMask(mask) {
  maskTex.value = mask ? mask.texture : white;
  maskOrigin.value.set(mask ? mask.x0 : 0, mask ? mask.z0 : 0);
  maskSize.value.set(mask ? mask.w : 1, mask ? mask.h : 1);
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Rasterise the floodlit area: the track corridor out to its walls and verges, the pit
 * lane with its garages, and every grandstand, each fading out over `falloff` metres to
 * `floor` (a brightly lit city circuit keeps far more light beyond its walls).
 */
export function buildFloodMask(P, stands, { floor = NIGHT_FLOOR, falloff = FALLOFF } = {}) {
  const b = P.bounds();
  const x0 = b.minX - MARGIN, z0 = b.minZ - MARGIN;
  const nx = Math.ceil((b.maxX - b.minX + 2 * MARGIN) / CELL), nz = Math.ceil((b.maxZ - b.minZ + 2 * MARGIN) / CELL);
  const lit = new Float32Array(nx * nz);
  // disc of radius r0 fully lit, fading to 0 at r0 + FALLOFF
  const stamp = (x, z, r0) => {
    const R = r0 + falloff;
    const ci = (x - x0) / CELL, cj = (z - z0) / CELL, rc = Math.ceil(R / CELL);
    for (let j = Math.max(0, Math.floor(cj - rc)); j <= Math.min(nz - 1, Math.ceil(cj + rc)); j++) {
      for (let i = Math.max(0, Math.floor(ci - rc)); i <= Math.min(nx - 1, Math.ceil(ci + rc)); i++) {
        const d = Math.hypot((i + 0.5) * CELL + x0 - x, (j + 0.5) * CELL + z0 - z);
        if (d >= R) continue;
        const v = smooth(R, r0, d);
        const k = j * nx + i;
        if (v > lit[k]) lit[k] = v;
      }
    }
  };
  const step = Math.max(1, Math.round(CELL / P.ds));
  for (let i = 0; i < P.N; i += step) {
    stamp(P.px[i], P.pz[i], Math.max(P.wallL[i] + P.tyreL[i], P.wallR[i] + P.tyreR[i]) + VERGE + 4);
  }
  const pit = P.pit;
  if (pit) {
    const ps = Math.max(1, Math.round(CELL / pit.ds));
    for (let j = 0; j < pit.N; j += ps) stamp(pit.px[j], pit.pz[j], pit.outerHw(j) + PIT.wallClear + 22);
  }
  for (const f of stands) {
    for (let a = -f.L / 2; a <= f.L / 2; a += CELL * 2) {
      for (let d = 0; d <= f.depth; d += CELL * 2) stamp(f.ox + f.ax * a + f.dx * d, f.oz + f.az * a + f.dz * d, 4);
    }
  }
  const data = new Uint8Array(nx * nz);
  for (let k = 0; k < data.length; k++) data[k] = Math.round(255 * (floor + (1 - floor) * lit[k]));
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { texture: tex, x0, z0, w: nx * CELL, h: nz * CELL };
}

/**
 * Darken every material in `group` by the floodlight mask (albedo only, so lamps,
 * emissive windows and halos still glow). Materials marked userData.noFlood are skipped.
 */
export function applyFloodMask(group) {
  const done = new Set();
  group.traverse((o) => {
    if (!o.isMesh && !o.isSprite) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.isNodeMaterial || done.has(m) || m.userData.noFlood) continue;
      done.add(m);
      const base = vec4(m.colorNode ?? materialColor);
      m.colorNode = vec4(base.rgb.mul(floodLit), base.a);
    }
  });
}

/* ---------------- floodlight towers ---------------- */

const SPACING = 52; // metres between towers on each side (staggered between the sides)
const HEIGHT = 17; // lamp bank height above the road (m)
const REACH = 3.2; // arm length out over the fence, towards the track (m)

/**
 * Towers just beyond the walls on both sides of the lap: a steel mast, an arm reaching
 * towards the track and a bank of lamps aimed down at the racing surface, with a soft
 * halo. Skips anywhere a tower would stand on another part of the track, in the pit
 * lane or on a grandstand. Returns the lamp-head positions (for the point-light pool).
 */
export function buildFloodlights(P, field, stands, group, spacing = SPACING) {
  const pit = P.pit;
  // centreline points on a coarse grid, to check a tower is clear of every other section
  const G = 40, grid = new Map();
  const key = (x, z) => Math.floor(x / G) * 100003 + Math.floor(z / G);
  for (let i = 0; i < P.N; i += 2) {
    const k = key(P.px[i], P.pz[i]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const nearestTrack = (x, z) => {
    let best = Infinity;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    for (let a = gx - 1; a <= gx + 1; a++) {
      for (let c = gz - 1; c <= gz + 1; c++) {
        for (const i of grid.get(a * 100003 + c) ?? []) {
          // distance beyond that section's wall on the side the point lies
          const left = (x - P.px[i]) * P.leftX(i) + (z - P.pz[i]) * P.leftZ(i) > 0;
          const wall = left ? P.wallL[i] + P.tyreL[i] : P.wallR[i] + P.tyreR[i];
          const d = Math.hypot(P.px[i] - x, P.pz[i] - z) - wall;
          if (d < best) best = d;
        }
      }
    }
    return best;
  };
  const inPit = (x, z) => {
    if (!pit) return false;
    for (let j = 0; j < pit.N; j += 2) {
      if (Math.hypot(pit.px[j] - x, pit.pz[j] - z) < pit.outerHw(j) + PIT.wallClear + 14) return true;
    }
    return false;
  };
  const onStand = (x, z) => stands.some((f) => {
    const a = (x - f.ox) * f.ax + (z - f.oz) * f.az, d = (x - f.ox) * f.dx + (z - f.oz) * f.dz;
    return Math.abs(a) < f.L / 2 + 3 && d > -3 && d < f.depth + 3;
  });
  const nearBridge = (i) => {
    for (let k = -30; k <= 30; k += 3) if (P.bridge[P.wrap(i + k)]) return true;
    return false;
  };

  const towers = []; // { x, z, y0, y1, yaw }  yaw: direction from mast to track
  const every = Math.max(1, Math.round(spacing / P.ds));
  for (const side of [1, -1]) {
    const off = side > 0 ? 0 : Math.round(every / 2);
    for (let i = off; i < P.N; i += every) {
      if (nearBridge(i)) continue;
      const wall = side > 0 ? P.wallL[i] + P.tyreL[i] : P.wallR[i] + P.tyreR[i];
      const lat = side * (wall + VERGE * 0.6);
      const x = P.px[i] + P.leftX(i) * lat, z = P.pz[i] + P.leftZ(i) * lat;
      // the mast must be beside this section: nothing else (a parallel straight, a hairpin) closer
      if (nearestTrack(x, z) < VERGE * 0.6 - 0.5) continue;
      if (inPit(x, z) || onStand(x, z)) continue;
      const ground = Math.min(P.py[i], field.sample(x, z).y);
      towers.push({ x, z, y0: ground - 1, y1: P.py[i] + HEIGHT, yaw: Math.atan2(-P.leftX(i) * side, -P.leftZ(i) * side) });
    }
  }
  if (!towers.length) return [];

  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x8c9096, roughness: 0.55, metalness: 0.6 });
  const housing = new THREE.MeshStandardNodeMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.4 });
  // lamp faces: far brighter than white so they stay white through the tone mapping
  const lamp = new THREE.MeshBasicNodeMaterial();
  lamp.colorNode = color(0xfff4e2).mul(8.0);
  lamp.userData.noFlood = true;
  lamp.fog = false;

  const mast = new THREE.InstancedMesh(boxGeometry(0.55, 1, 0.55), steel, towers.length);
  const arm = new THREE.InstancedMesh(boxGeometry(0.3, 0.3, REACH), steel, towers.length);
  const bank = new THREE.InstancedMesh(boxGeometry(4.2, 1.6, 0.5), housing, towers.length);
  const face = new THREE.InstancedMesh(boxGeometry(3.9, 1.3, 0.05), lamp, towers.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const heads = [];
  towers.forEach((t, k) => {
    const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw); // towards the track
    q.setFromEuler(e.set(0, t.yaw, 0));
    mast.setMatrixAt(k, m.compose(p.set(t.x, (t.y0 + t.y1) / 2, t.z), q, s.set(1, t.y1 - t.y0 + 1, 1)));
    arm.setMatrixAt(k, m.compose(p.set(t.x + fx * REACH / 2, t.y1, t.z + fz * REACH / 2), q, s.set(1, 1, 1)));
    // the bank tilts 50 degrees face-down towards the track
    const hx = t.x + fx * REACH, hz = t.z + fz * REACH, hy = t.y1 + 0.3;
    q.setFromEuler(e.set(0.87, t.yaw, 0, 'YXZ'));
    bank.setMatrixAt(k, m.compose(p.set(hx, hy, hz), q, s.set(1, 1, 1)));
    // the face sits on the bank's track-facing side, which points forward and down
    const nx = fx * Math.cos(0.87), ny = -Math.sin(0.87), nz = fz * Math.cos(0.87);
    face.setMatrixAt(k, m.compose(p.set(hx + nx * 0.27, hy + ny * 0.27, hz + nz * 0.27), q, s.set(1, 1, 1)));
    heads.push(new THREE.Vector3(hx + nx * 0.6, hy + ny * 0.6, hz + nz * 0.6));
  });
  for (const im of [mast, arm, bank]) im.castShadow = true;
  group.add(mast, arm, bank, face);

  // halos: camera-facing glow sprites, one per lamp bank, drawn additively
  const pos = new Float32Array(heads.length * 3);
  heads.forEach((h, k) => h.toArray(pos, k * 3));
  const halo = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  halo.positionNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(pos, 3));
  const r = length(uv().sub(0.5)).mul(2.0);
  const glow = smoothstep(1.0, 0.0, r).pow(4.0).mul(0.6).add(smoothstep(0.3, 0.0, r).mul(1.2));
  halo.colorNode = vec4(vec3(1.0, 0.93, 0.8).mul(glow), float(1));
  halo.scaleNode = float(6);
  halo.userData.noFlood = true;
  const sprites = new THREE.Sprite(halo);
  sprites.count = heads.length;
  sprites.frustumCulled = false;
  sprites.renderOrder = 10;
  group.add(sprites);
  return heads;
}

/* ---------------- LED strips ---------------- */

/**
 * Glowing LED strips along the track face of every main wall, just under its top edge
 * (above the advertising band), shading slowly between two colours along the lap like
 * the purple and blue lighting at Jeddah. Emissive, so they glow through the dark.
 */
export function buildLedStrips(P, group, [ca, cb]) {
  const mat = new THREE.MeshBasicNodeMaterial();
  const s = uv().x.div(90.0);
  const wave = sin(s).mul(0.5).add(0.5);
  // a soft brighter pulse travelling along each strip every ~25 m
  const pulse = smoothstep(0.75, 1.0, sin(s.mul(3.6)).mul(0.5).add(0.5)).mul(0.6).add(1.0);
  mat.colorNode = mix(color(ca), color(cb), wave).mul(pulse).mul(1.7);
  mat.userData.noFlood = true;
  const LO = WALL_HEIGHT - 0.17, HI = WALL_HEIGHT - 0.04;
  for (const line of P.walls) {
    if (!line.render || line.kind !== 'main') continue;
    const sd = line.side, idx = line.idx, n = idx.length;
    const tyre = sd > 0 ? P.tyreL : P.tyreR, wall = sd > 0 ? P.wallL : P.wallR;
    const I = (k) => idx[k % n];
    const at = (i) => {
      const lat = sd * (wall[i] + tyre[i] - WALL_THICKNESS / 2 - 0.015);
      return [P.px[i] + P.leftX(i) * lat, P.pz[i] + P.leftZ(i) * lat];
    };
    const count = line.closed ? n + 1 : n;
    let d = 0, prev = null;
    const geo = ribbonGeometry(count, (k) => {
      const i = I(k), [x, z] = at(i);
      if (prev) d += Math.hypot(x - prev[0], z - prev[1]);
      prev = [x, z];
      return {
        a: [x, P.py[i] + LO, z], b: [x, P.py[i] + HI, z],
        na: [-P.leftX(i) * sd, 0, -P.leftZ(i) * sd], uva: [d, 0], uvb: [d, 1],
      };
    });
    group.add(new THREE.Mesh(geo, mat));
  }
}

/**
 * A fixed pool of point lights parked at the lamp heads nearest the camera, so the car,
 * walls and road pick up local pools of light and moving reflections. Each light fades
 * out before the pool reassigns it, so lights never pop. The pool size never changes
 * (changing the light count would recompile every shader).
 */
export class FloodlightPool {
  constructor(count = 8) {
    this.group = new THREE.Group();
    this.lights = Array.from({ length: count }, () => {
      const l = new THREE.PointLight(0xfff1dc, 0, 75, 2);
      this.group.add(l);
      return l;
    });
    this.heads = [];
    this.order = [];
  }

  setHeads(heads) {
    this.heads = heads ?? [];
    this.order = this.heads.map((_, i) => i);
    if (!this.heads.length) for (const l of this.lights) l.intensity = 0;
  }

  update(camPos, strength = 650) {
    const H = this.heads, n = this.lights.length;
    if (!H.length) return;
    const d = H.map((h) => h.distanceToSquared(camPos));
    this.order.sort((a, b) => d[a] - d[b]);
    const cut = Math.sqrt(d[this.order[Math.min(n, H.length - 1)]]); // first head left out
    this.lights.forEach((l, k) => {
      const i = this.order[k];
      if (i === undefined || k >= H.length) { l.intensity = 0; return; }
      l.position.copy(H[i]);
      l.intensity = strength * smooth(cut, cut * 0.75, Math.sqrt(d[i]));
    });
  }
}
