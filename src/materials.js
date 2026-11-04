// Node-based (TSL) materials. All surface detail is procedural — no textures.
import * as THREE from 'three/webgpu';
import {
  color, float, vec2, vec3, uv, mix, step, fract, floor, abs, smoothstep, sin,
  positionWorld, positionWorldDirection, mx_noise_float, mx_fractal_noise_float, length, max,
  positionLocal, normalLocal, texture,
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
  // straight mown stripes, 8 m wide
  const stripe = step(0.5, fract(p.x.add(p.y.mul(0.35)).div(8.0)));
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

/**
 * Team livery paint for a body panel. `colorNode` is the team's procedural pattern;
 * `finish` sets the paint character (e.g. satin vs. high gloss).
 */
export function liveryMaterial(colorNode, finish = {}) {
  const m = new THREE.MeshPhysicalNodeMaterial();
  m.colorNode = colorNode;
  m.roughnessNode = float(finish.roughness ?? 0.32);
  m.metalnessNode = float(finish.metalness ?? 0.15);
  m.clearcoatNode = float(finish.clearcoat ?? 1.0);
  m.clearcoatRoughnessNode = float(0.06);
  return m;
}

/**
 * Painted aero wheel cover: team colour with an accent ring near the rim and a small
 * off-centre mark so you can see the wheel turning. Expects discFacing() uvs.
 */
export function wheelCoverMaterial(baseHex, ringHex) {
  const m = new THREE.MeshPhysicalNodeMaterial();
  const d = uv().sub(0.5);
  const r = length(d).mul(2.0);
  const ring = smoothstep(0.76, 0.78, r).mul(smoothstep(0.88, 0.86, r));
  const mark = smoothstep(0.03, 0.02, abs(d.y)).mul(smoothstep(0.3, 0.32, r)).mul(smoothstep(0.62, 0.6, r)).mul(step(0.0, d.x));
  const hub = smoothstep(0.2, 0.18, r);
  let c = mix(color(baseHex), color(ringHex), ring.add(mark).clamp(0, 1));
  c = mix(c, color(0x0c0c0e), hub);
  m.colorNode = c;
  m.roughnessNode = float(0.35);
  m.metalnessNode = float(0.2);
  m.clearcoatNode = float(0.6);
  return m;
}

export function carbonMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  // tiny procedural weave
  const w = uv().mul(140.0);
  const weave = step(0.5, fract(w.x.add(floor(w.y).mul(0.5))));
  m.colorNode = mix(color(0x0d0d0f), color(0x1c1c20), weave);
  m.roughnessNode = float(0.42);
  m.metalnessNode = float(0.1);
  return m;
}

/** Sidewall lettering strip, repeated around the tyre: compound name + maker in compound colours. */
function sidewallTexture(compoundHex) {
  const W = 2048, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.textBaseline = 'middle';
  g.font = 'italic 900 96px "Segoe UI", Arial, sans-serif';
  const hex = `#${compoundHex.toString(16).padStart(6, '0')}`;
  // two blocks per strip: "P ZERO" in the compound colour, "PIRELLI" in yellow
  for (const [x, text, col] of [[60, 'P ZERO', hex], [560, 'PIRELLI', '#f2c200'], [1084, 'P ZERO', hex], [1584, 'PIRELLI', '#f2c200']]) {
    g.fillStyle = col;
    g.fillText(text, x, H / 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Smooth slick tyre (expects tyreGeometry: uv.x around the tyre, local origin at the hub).
 * A thin compound-coloured ring and sidewall lettering sit on each sidewall; the
 * lettering also makes the wheel's rotation readable. `radius` is the outer radius.
 */
export function tyreMaterial(radius, compoundHex = 0xd8261c) {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionLocal;
  const rr = length(p.yz).div(radius); // 0.63 at the bead, 1 on the tread
  const side = smoothstep(0.55, 0.75, abs(normalLocal.x)); // sidewall faces only
  const ring = smoothstep(0.715, 0.725, rr).mul(smoothstep(0.765, 0.755, rr)).mul(side);
  // lettering band above the ring
  const v = rr.sub(0.785).div(0.085);
  const inBand = smoothstep(0.0, 0.02, v).mul(smoothstep(1.0, 0.98, v)).mul(side);
  const tex = sidewallTexture(compoundHex);
  const t = texture(tex, vec2(uv().x.mul(2.0), v.clamp(0, 1)));
  // rubber: very slightly mottled, scrubbed tread a touch lighter and glossier than the sidewall
  const grain = mx_noise_float(p.mul(60.0)).mul(0.012);
  const tread = smoothstep(0.75, 0.55, abs(normalLocal.x));
  let c = mix(color(0x161617), color(0x1c1c1e), tread).add(grain);
  c = mix(c, color(compoundHex), ring);
  c = mix(c, t.rgb, t.a.mul(inBand));
  m.colorNode = c;
  m.roughnessNode = mix(float(0.86), float(0.7), tread);
  m.metalnessNode = float(0.0);
  m.userData.texture = tex;
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
