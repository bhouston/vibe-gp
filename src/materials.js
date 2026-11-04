// Node-based (TSL) materials. All surface detail is procedural — no textures.
import * as THREE from 'three/webgpu';
import {
  color, float, vec2, vec3, uv, mix, step, fract, floor, abs, smoothstep, sin,
  positionWorld, positionWorldDirection, mx_noise_float, mx_fractal_noise_float, length, max,
} from 'three/tsl';

/** Tarmac: fine grain noise + a darker rubbered-in racing line. */
export function asphaltMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const grain = mx_noise_float(p.mul(9.0)).mul(0.5).add(0.5);
  const patches = mx_fractal_noise_float(p.mul(0.08), 3).mul(0.5).add(0.5);
  const base = mix(color(0x2a2b2e), color(0x3b3c40), grain.mul(0.6).add(patches.mul(0.4)));
  // uv.y spans inner (0) -> outer (1) edge of the track; racing line sits near the middle
  const across = uv().y;
  const line = smoothstep(0.22, 0.0, abs(across.sub(0.5)));
  const lined = mix(base, color(0x1d1e20), line.mul(0.55));
  // painted white edge lines
  const edge = step(0.965, across).add(step(across, 0.035)).clamp(0, 1);
  m.colorNode = mix(lined, color(0xe8e8e8), edge);
  m.roughnessNode = mix(float(0.9), float(0.75), line).sub(grain.mul(0.08));
  m.metalnessNode = float(0.0);
  return m;
}

/** Red/white kerbs: stripes along the ring. */
export function kerbMaterial(stripes) {
  const m = new THREE.MeshStandardNodeMaterial();
  const s = step(0.5, fract(uv().x.mul(stripes)));
  m.colorNode = mix(color(0xd81e1e), color(0xf2f2f2), s);
  m.roughnessNode = float(0.55);
  return m;
}

/** Grass with mown stripes and colour variation. */
export function grassMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const n = mx_fractal_noise_float(p.mul(0.05), 4).mul(0.5).add(0.5);
  const fine = mx_noise_float(p.mul(3.0)).mul(0.5).add(0.5);
  // mown stripes follow concentric rings around the circuit
  const r = length(p);
  const stripe = step(0.5, fract(r.div(8.0)));
  const g1 = color(0x3f7a2c), g2 = color(0x4c8f35);
  let c = mix(g1, g2, stripe);
  c = mix(c, color(0x5e8a2a), n.mul(0.45));
  c = c.mul(fine.mul(0.2).add(0.9));
  m.colorNode = c;
  m.roughnessNode = float(0.95);
  return m;
}

/** Concrete barrier wall with red/white painted band. */
export function wallMaterial(stripes) {
  const m = new THREE.MeshStandardNodeMaterial();
  const v = uv().y;
  const band = step(0.55, v);
  const s = step(0.5, fract(uv().x.mul(stripes)));
  const paint = mix(color(0xc81414), color(0xf5f5f5), s);
  const grain = mx_noise_float(positionWorld.mul(4.0)).mul(0.06);
  m.colorNode = mix(color(0xb8b8b2).add(grain), paint, band);
  m.roughnessNode = float(0.8);
  return m;
}

/** Chequered start/finish line. */
export function checkerMaterial(cols, rows) {
  const m = new THREE.MeshStandardNodeMaterial();
  const c = uv().mul(vec2(cols, rows)).floor();
  const k = fract(c.x.add(c.y).mul(0.5)).mul(2.0);
  m.colorNode = mix(color(0x111111), color(0xf0f0f0), k);
  m.roughnessNode = float(0.6);
  return m;
}

/** Glossy car paint with clearcoat. */
export function paintMaterial(hex) {
  const m = new THREE.MeshPhysicalNodeMaterial();
  m.colorNode = color(hex);
  m.roughnessNode = float(0.32);
  m.metalnessNode = float(0.15);
  m.clearcoatNode = float(1.0);
  m.clearcoatRoughnessNode = float(0.06);
  return m;
}

/** Body paint: base colour with a contrasting livery stripe down the spine (local x near 0). */
export function liveryMaterial(baseHex, stripeHex) {
  const m = paintMaterial(baseHex);
  // uv.x of the loft runs around the cross-section; 0.25 is the top centre
  const u = uv().x;
  const stripe = smoothstep(0.06, 0.04, abs(u.sub(0.25)));
  m.colorNode = mix(color(baseHex), color(stripeHex), stripe);
  return m;
}

export function carbonMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  // tiny procedural weave
  const w = uv().mul(140.0);
  const weave = step(0.5, fract(w.x.add(floor(w.y).mul(0.5))));
  m.colorNode = mix(color(0x0d0d0f), color(0x1c1c20), weave);
  m.roughnessNode = float(0.35);
  m.metalnessNode = float(0.3);
  return m;
}

export function tyreMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  // sidewall stripe (soft compound = red band) near the shoulder
  const v = uv().y;
  const band = step(0.07, abs(v.sub(0.15))).oneMinus().add(step(0.07, abs(v.sub(0.85))).oneMinus());
  // tread marks around the circumference so wheel spin is visible
  const tread = step(0.5, fract(uv().x.mul(24.0))).mul(0.04);
  m.colorNode = mix(color(0x141414).add(tread), color(0xd8261c), band.clamp(0, 1));
  m.roughnessNode = float(0.85);
  return m;
}

export function rimMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = color(0x9a9da3);
  m.metalnessNode = float(0.9);
  m.roughnessNode = float(0.3);
  return m;
}

export function simpleMaterial(hex, roughness = 0.6, metalness = 0) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = color(hex);
  m.roughnessNode = float(roughness);
  m.metalnessNode = float(metalness);
  return m;
}

/** Sky gradient + sun glow, used as scene.backgroundNode. */
export function skyNode(sunDir) {
  const d = positionWorldDirection;
  const h = max(d.y, 0.0);
  const horizon = color(0xcfe3f2), zenith = color(0x3a76c4);
  let sky = mix(horizon, zenith, h.pow(0.55));
  const sun = max(d.dot(vec3(...sunDir).normalize()), 0.0);
  sky = sky.add(color(0xfff1d0).mul(sun.pow(400.0).mul(2.0).add(sun.pow(12.0).mul(0.25))));
  // below horizon fades to a hazy ground colour
  const below = smoothstep(0.0, -0.08, d.y);
  return mix(sky, color(0x8fa38a), below);
}
