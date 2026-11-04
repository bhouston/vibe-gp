// Node-based (TSL) materials. All surface detail is procedural — no textures.
import * as THREE from 'three/webgpu';
import {
  color, float, vec2, vec3, uv, mix, step, fract, floor, abs, smoothstep, sin,
  positionWorld, positionWorldDirection, mx_noise_float, mx_fractal_noise_float, length, max,
  positionLocal, normalLocal, texture, attribute, cameraPosition, fwidth, bumpMap,
  positionGeometry, normalGeometry, uniform,
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

/** Kerbs: alternating stripes of two colours (red/white by default) along uv.x. */
export function kerbMaterial(stripes, [a, b] = [0xd81e1e, 0xf2f2f2]) {
  const m = new THREE.MeshStandardNodeMaterial();
  const s = step(0.5, fract(uv().x.mul(stripes)));
  m.colorNode = mix(color(a), color(b), s);
  m.roughnessNode = float(0.55);
  return m;
}

/**
 * Grass for the terrain and the verges. Vertex attribute `grass` = (mowX, mowZ, stripes, mown):
 *  - mown = 1: close-cut run-off grass, brighter and even; 0: rougher meadow with
 *    patchy colour (darker clumps, dry straw-coloured patches) at several scales.
 *  - stripes = 1: mowing stripes in bands parallel to the track (uv.y = lateral offset).
 *    Like real mowing stripes they come from the blades lying in alternate directions
 *    (mow), so each band looks light when its grass leans away from the viewer and
 *    dark when it leans towards them, and the pattern flips as the view changes.
 * Fine detail (clumps, blade-scale bump) fades with distance so it never shimmers.
 */
export function grassMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const g = attribute('grass', 'vec4');
  const mown = g.w, striped = g.z;
  const dist = length(cameraPosition.sub(positionWorld));
  const near = smoothstep(220.0, 30.0, dist); // blade-scale detail only up close

  const macro = mx_fractal_noise_float(p.mul(0.0025), 3).mul(0.5).add(0.5); // ~400 m
  const mid = mx_fractal_noise_float(p.mul(0.018), 3).mul(0.5).add(0.5); // ~50 m
  const clump = mx_noise_float(p.mul(0.9)).mul(0.5).add(0.5); // ~1 m tufts

  // meadow: olive to fresh green, with darker lush hollows and dry patches
  let meadow = mix(color(0x4a6a2a), color(0x617f34), macro);
  meadow = mix(meadow, color(0x8c8a52), smoothstep(0.6, 0.82, mid).mul(0.4));
  meadow = mix(meadow, color(0x3a5626), smoothstep(0.42, 0.18, mid).mul(0.55));
  // mown: shorter, fresher and more even
  const lawn = mix(color(0x447a2c), color(0x528834), macro.mul(0.6).add(mid.mul(0.4)));
  let c = mix(meadow, lawn, mown);

  // mowing stripes: 3.5 m bands, alternate blade lean along the mowing direction
  const band = abs(uv().y).div(3.5);
  const aa = fwidth(band).add(0.001);
  const dir = smoothstep(float(0.5).sub(aa), float(0.5).add(aa), fract(band)).mul(2.0).sub(1.0);
  const view = positionWorld.xz.sub(cameraPosition.xz).normalize();
  const lean = view.dot(vec2(g.x, g.y)).mul(dir); // + = blades lean away from the viewer: lighter
  const stripeFade = smoothstep(450.0, 120.0, dist).mul(striped);
  c = c.mul(lean.mul(0.16).mul(stripeFade).add(1.0));

  // tufts: a little light/dark variation, stronger in the meadow
  const patchy = mx_noise_float(p.mul(0.25)).mul(0.5); // ~4 m wear and growth patches
  const tuft = clump.sub(0.5).add(patchy).mul(mix(float(0.24), float(0.14), mown)).mul(near);
  c = c.mul(tuft.add(1.0));
  m.colorNode = c;
  m.roughnessNode = mix(float(0.97), float(0.9), mown);
  m.metalnessNode = float(0.0);
  // blade-scale bumpiness breaks up the flat, plastic sheen in low sun
  const blades = mx_noise_float(p.mul(6.0)).mul(0.6).add(mx_noise_float(p.mul(19.0)).mul(0.4));
  m.normalNode = bumpMap(blades.mul(near), 0.35);
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

/**
 * Sidewall lettering strip, repeated around the tyre: "P ZERO" in white (tinted with the
 * compound colour in the shader) and "PIRELLI" in yellow, told apart by the blue channel.
 */
let sidewallTex = null;
function sidewallTexture() {
  if (sidewallTex) return sidewallTex;
  const W = 2048, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.textBaseline = 'middle';
  g.font = 'italic 900 96px "Segoe UI", Arial, sans-serif';
  for (const [x, text, col] of [[60, 'P ZERO', '#ffffff'], [560, 'PIRELLI', '#f2c200'], [1084, 'P ZERO', '#ffffff'], [1584, 'PIRELLI', '#f2c200']]) {
    g.fillStyle = col;
    g.fillText(text, x, H / 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  sidewallTex = tex;
  return tex;
}

/**
 * Smooth slick tyre (expects tyreGeometry: uv.x around the tyre, local origin at the hub).
 * A thin compound-coloured ring and sidewall lettering sit on each sidewall; the
 * lettering also makes the wheel's rotation readable. `radius` is the outer radius.
 * The compound colour is a uniform (m.userData.compound) so a tyre change needs no new
 * shader; the pattern uses the raw geometry so it also works on instanced tyres.
 */
export function tyreMaterial(radius, compoundHex = 0xd8261c) {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionGeometry;
  const compound = uniform(new THREE.Color(compoundHex));
  const rr = length(p.yz).div(radius); // 0.63 at the bead, 1 on the tread
  const side = smoothstep(0.55, 0.75, abs(normalGeometry.x)); // sidewall faces only
  const ring = smoothstep(0.715, 0.725, rr).mul(smoothstep(0.765, 0.755, rr)).mul(side);
  // lettering band above the ring
  const v = rr.sub(0.785).div(0.085);
  const inBand = smoothstep(0.0, 0.02, v).mul(smoothstep(1.0, 0.98, v)).mul(side);
  const tex = sidewallTexture();
  const t = texture(tex, vec2(uv().x.mul(2.0), v.clamp(0, 1)));
  const letters = mix(color(0xf2c200), compound, t.b); // white letters take the compound colour
  // rubber: very slightly mottled, scrubbed tread a touch lighter and glossier than the sidewall
  const grain = mx_noise_float(p.mul(60.0)).mul(0.012);
  const tread = smoothstep(0.75, 0.55, abs(normalGeometry.x));
  let c = mix(color(0x161617), color(0x1c1c1e), tread).add(grain);
  c = mix(c, compound, ring);
  c = mix(c, letters, t.a.mul(inBand));
  m.colorNode = c;
  m.roughnessNode = mix(float(0.86), float(0.7), tread);
  m.metalnessNode = float(0.0);
  m.userData.compound = compound;
  return m;
}

export function rimMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = color(0x9a9da3);
  m.metalnessNode = float(0.9);
  m.roughnessNode = float(0.3);
  return m;
}

/**
 * Draw a flat ground-level material on top of the layers below it: flat layers a few cm
 * apart are below depth precision from a high or distant camera, so they are also
 * layered with polygon offset (grass < road < kerbs / pit lane < paint < paint detail).
 */
export function layered(m, level) {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -level;
  m.polygonOffsetUnits = -level * 2;
  return m;
}

export function simpleMaterial(hex, roughness = 0.6, metalness = 0) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = color(hex);
  m.roughnessNode = float(roughness);
  m.metalnessNode = float(metalness);
  return m;
}

/**
 * Sky gradient + sun glow, used as scene.backgroundNode and (prefiltered) as the IBL environment.
 * `sunDisc: false` drops the bright disc so a directional light can stand in for it.
 */
export function skyNode(sunDir, { sunDisc = true } = {}) {
  const d = positionWorldDirection;
  const h = max(d.y, 0.0);
  const horizon = color(0xcfe3f2), zenith = color(0x3a76c4);
  let sky = mix(horizon, zenith, h.pow(0.55));
  const sun = max(d.dot(vec3(...sunDir).normalize()), 0.0);
  const disc = sunDisc ? sun.pow(400.0).mul(2.0) : float(0.0);
  sky = sky.add(color(0xfff1d0).mul(disc.add(sun.pow(12.0).mul(0.25))));
  // below horizon fades to a hazy ground colour
  const below = smoothstep(0.0, -0.08, d.y);
  return mix(sky, color(0x8fa38a), below);
}
