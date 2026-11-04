// Node-based (TSL) materials. All surface detail is procedural — no textures.
import * as THREE from 'three/webgpu';
import {
  color, float, vec2, vec3, uv, mix, step, fract, floor, abs, smoothstep, sin,
  positionWorld, positionWorldDirection, mx_noise_float, mx_fractal_noise_float, length, max,
  positionLocal, normalLocal, texture, attribute, cameraPosition, fwidth, bumpMap,
  positionGeometry, normalGeometry, uniform, mx_worley_noise_float, time,
} from 'three/tsl';
import { landSample } from './land.js';

/**
 * Tileable noise in a texture (256 x 256, repeating): r and g = 3-octave fractal noise with
 * 4 base periods per tile, b = smooth noise with 16 periods, a = smooth noise with 32.
 * All in 0..1. Sampling it is far cheaper to compile and run than procedural noise (the
 * ground shader built from mx_ noise took seconds to compile), so big always-visible
 * surfaces use it.
 */
const NOISE_TEX = (() => {
  const N = 256, data = new Uint8Array(N * N * 4);
  const hash = (x, y, s) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // value noise with `period` cells across the tile, wrapping
  const vn = (x, y, period, s) => {
    const fx = (x / N) * period, fy = (y / N) * period;
    const xi = Math.floor(fx), yi = Math.floor(fy), tx = fx - xi, ty = fy - yi;
    const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
    const w = (a) => ((a % period) + period) % period;
    const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, s) => (vn(x, y, 4, s) * 0.57 + vn(x, y, 8, s + 1) * 0.29 + vn(x, y, 16, s + 2) * 0.14);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4;
      data[k] = Math.round(255 * fbm(x, y, 11));
      data[k + 1] = Math.round(255 * fbm(x, y, 37));
      data[k + 2] = Math.round(255 * vn(x, y, 16, 71));
      data[k + 3] = Math.round(255 * vn(x, y, 32, 93));
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
})();
/** Sample the noise texture at world xz `p` scaled by `s` (texture tiles per metre). */
const tnoise = (p, s) => texture(NOISE_TEX, p.mul(s));

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

/**
 * Gravel trap: rounded stones (a Worley cell pattern, each stone its own shade), raked
 * into faint furrows along the track, with darker dished patches where cars have ploughed
 * through. Stone-scale detail and bump fade out with distance so they never shimmer.
 */
export function gravelMaterial(hex = 0xab9f88) {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const dist = length(cameraPosition.sub(positionWorld));
  const near = smoothstep(90.0, 12.0, dist);
  const stones = mx_worley_noise_float(p.mul(16.0)); // ~6 cm stones: 0 at a stone's centre
  const shade = mx_noise_float(floor(p.mul(16.0)).mul(0.37)).mul(0.5).add(0.5); // per-cell tint
  const patches = mx_fractal_noise_float(p.mul(0.15), 3).mul(0.5).add(0.5);
  const furrows = sin(uv().y.mul(9.0).add(mx_noise_float(p.mul(0.4)).mul(2.0))).mul(0.5).add(0.5);
  const base = color(hex);
  let c = base.mul(mix(float(0.82), float(1.12), shade.mul(near).add(float(0.5).mul(near.oneMinus()))));
  c = c.mul(mix(float(1.0), float(0.72), smoothstep(0.25, 0.75, stones).mul(near))); // gaps between stones
  c = c.mul(mix(float(0.86), float(1.04), patches)).mul(mix(float(0.96), float(1.02), furrows));
  m.colorNode = c;
  m.roughnessNode = float(0.95);
  m.metalnessNode = float(0.0);
  m.normalNode = bumpMap(stones.oneMinus().mul(near).add(furrows.mul(0.15)), 0.6);
  return m;
}

/** Sausage kerb: weathered yellow paint on the raised hump, scuffed by tyres. */
export function sausageMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const scuff = mx_fractal_noise_float(p.mul(2.5), 3).mul(0.5).add(0.5);
  m.colorNode = mix(color(0xf2c400), color(0x6a5a2a), smoothstep(0.62, 0.9, scuff).mul(0.6));
  m.roughnessNode = float(0.6);
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
/**
 * Ground beside and beyond the track. ground: 'grass' (default), 'desert' (sand beyond a
 * strip of dusty compacted run-off, no mowing stripes), 'dunes' (coastal grass with sand
 * blow-outs) or 'city' (park grass worn into dusty, paved patches).
 */
export function grassMaterial(ground = 'grass') {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const g = attribute('grass', 'vec4');
  const mown = g.w, striped = g.z;
  const dist = length(cameraPosition.sub(positionWorld));
  const near = smoothstep(220.0, 30.0, dist); // blade-scale detail only up close

  // (noise from the noise texture: see NOISE_TEX)
  const macro = tnoise(p, 0.0025 / 4).r; // ~400 m
  const mid = tnoise(p, 0.018 / 4).g; // ~50 m
  const clump = tnoise(p, 0.9 / 16).b; // ~1 m tufts

  let meadow, lawn;
  if (ground === 'desert') {
    // pale sand with darker gravelly flats; compacted, slightly darker sand by the track
    meadow = mix(color(0xc9a36a), color(0xd9bb87), macro);
    meadow = mix(meadow, color(0xa8875a), smoothstep(0.6, 0.85, mid).mul(0.5));
    meadow = mix(meadow, color(0xe2c89a), smoothstep(0.4, 0.15, mid).mul(0.4));
    lawn = mix(color(0xb8946a), color(0xc4a274), macro.mul(0.6).add(mid.mul(0.4)));
  } else {
    // meadow: olive to fresh green, with darker lush hollows and dry patches
    meadow = mix(color(0x4a6a2a), color(0x617f34), macro);
    meadow = mix(meadow, color(0x8c8a52), smoothstep(0.6, 0.82, mid).mul(0.4));
    meadow = mix(meadow, color(0x3a5626), smoothstep(0.42, 0.18, mid).mul(0.55));
    // mown: shorter, fresher and more even
    lawn = mix(color(0x447a2c), color(0x528834), macro.mul(0.6).add(mid.mul(0.4)));
    if (ground === 'dunes') meadow = mix(meadow, color(0xcdb98e), smoothstep(0.55, 0.8, mid).mul(0.85));
    if (ground === 'city') meadow = mix(meadow, color(0x8f8a80), smoothstep(0.5, 0.75, mid).mul(0.7));
  }
  let c = mix(meadow, lawn, mown);

  // mowing stripes: 3.5 m bands, alternate blade lean along the mowing direction
  const band = abs(uv().y).div(3.5);
  const aa = fwidth(band).add(0.001);
  const dir = smoothstep(float(0.5).sub(aa), float(0.5).add(aa), fract(band)).mul(2.0).sub(1.0);
  const view = positionWorld.xz.sub(cameraPosition.xz).normalize();
  const lean = view.dot(vec2(g.x, g.y)).mul(dir); // + = blades lean away from the viewer: lighter
  const stripeFade = smoothstep(450.0, 120.0, dist).mul(striped).mul(ground === 'desert' ? 0 : 1);
  c = c.mul(lean.mul(0.16).mul(stripeFade).add(1.0));

  // tufts: a little light/dark variation, stronger in the meadow
  const patchy = tnoise(p, 0.25 / 32).a.mul(0.5); // ~4 m wear and growth patches
  const tuft = clump.sub(0.5).add(patchy).mul(mix(float(0.24), float(0.14), mown)).mul(near);
  c = c.mul(tuft.add(1.0));
  const land = landBlend(c, mix(float(0.97), float(0.9), mown));
  m.colorNode = land.color;
  m.roughnessNode = land.rough;
  m.metalnessNode = float(0.0);
  // blade-scale bumpiness breaks up the flat, plastic sheen in low sun
  const blades = tnoise(p, 6.0 / 16).b.mul(0.6).add(tnoise(p, 19.0 / 32).a.mul(0.4));
  m.normalNode = bumpMap(blades.mul(near), 0.35);
  return m;
}

/**
 * Blend the real land cover (src/land.js: woods, fields, car parks, roads, towns...) over
 * a ground colour. The land's look is baked into a texture per track, so this is one
 * lookup plus a little grain. Returns { color, rough } nodes.
 */
export function landBlend(base, baseRough) {
  const grain = tnoise(positionWorld.xz, 1.3 / 16).b.sub(0.5).mul(0.16).add(1.0);
  const t = landSample.a;
  return { color: mix(base, landSample.rgb.mul(grain), t), rough: mix(baseRough, float(0.9), t) };
}

/**
 * Paved ground for circuits with no sand or grass anywhere (Jeddah): the same `grass`
 * attribute as grassMaterial, read as (–, –, runoff, nearTrack).
 *  - runoff = 1 (the verges, kerb out to the wall): painted asphalt run-off in diagonal
 *    two-tone bands (uv = metres along, lateral offset), worn by tyre streaks.
 *  - elsewhere: asphalt and concrete hardstanding, plazas and car parks.
 * glow (night only, via nightU): coloured light washing over plazas and fan zones out
 * around the circuit (within the floodlit venue, from `floodLit`), emissive so the
 * floodlight mask doesn't darken it.
 */
export function pavedMaterial({ paint = [0x35587e, 0x474b52], glow = null } = {}, nightU = null, floodLit = null) {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const g = attribute('grass', 'vec4');
  const runoff = g.z;
  const dist = length(cameraPosition.sub(positionWorld));
  const near = smoothstep(160.0, 20.0, dist);

  const grain = mx_noise_float(p.mul(9.0)).mul(0.5).add(0.5);
  const macro = mx_fractal_noise_float(p.mul(0.004), 3).mul(0.5).add(0.5);
  const mid = mx_fractal_noise_float(p.mul(0.03), 3).mul(0.5).add(0.5);
  // hardstanding: dark asphalt, with paler concrete plazas and slab joints here and there
  let ground = mix(color(0x2c2d31), color(0x3a3b40), grain.mul(0.4).add(mid.mul(0.6)));
  const plaza = smoothstep(0.58, 0.66, macro);
  const slabs = fract(p.div(6.0));
  const joint = step(0.97, max(slabs.x, slabs.y)).mul(near);
  const concrete = mix(color(0x6c6a66), color(0x7d7b76), grain).mul(float(1).sub(joint.mul(0.35)));
  ground = mix(ground, concrete, plaza);

  // run-off: 3 m diagonal bands of paint over the asphalt, scuffed and streaked by tyres
  const band = uv().x.add(abs(uv().y)).div(6.0);
  const aa = fwidth(band).add(0.001);
  const b = smoothstep(float(0.5).sub(aa), float(0.5).add(aa), fract(band));
  let painted = mix(color(paint[0]), color(paint[1]), b);
  const wear = mx_fractal_noise_float(p.mul(vec2(0.6, 0.6)), 3).mul(0.5).add(0.5);
  painted = mix(painted, color(0x1f2022), smoothstep(0.62, 0.85, wear).mul(0.55));
  painted = painted.mul(grain.mul(0.1).add(0.95));
  const land = landBlend(mix(ground, painted, runoff), mix(mix(float(0.88), float(0.8), plaza), float(0.62), runoff).sub(grain.mul(0.06)));
  m.colorNode = land.color;
  m.roughnessNode = land.rough;
  m.metalnessNode = float(0.0);
  m.normalNode = bumpMap(grain.mul(near), 0.15);

  if (glow && nightU && floodLit) {
    // pools of purple and blue light in the plazas and fan zones around the circuit (not on
    // the run-off, and fading out with the floodlights so the land beyond stays dark)
    const venue = smoothstep(0.3, 0.75, floodLit);
    const pool = smoothstep(0.5, 0.7, mx_fractal_noise_float(p.mul(0.012).add(37.0), 2).mul(0.5).add(0.5)).mul(venue);
    const hue = smoothstep(0.35, 0.65, mx_noise_float(p.mul(0.003).add(11.0)).mul(0.5).add(0.5));
    const tint = mix(color(glow[0]), color(glow[1]), hue);
    m.emissiveNode = tint.mul(pool.mul(runoff.oneMinus()).mul(nightU).mul(0.45));
  }
  return m;
}

/**
 * Paved run-off between the kerb and the barrier (uv = metres along, lateral offset):
 * plain dusty tarmac, or painted (paint = [a, b]) in 3 m diagonal bands of the two
 * colours, worn darker where cars run wide.
 */
export function runoffMaterial(paint = null, pattern = 'diagonal') {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionWorld.xz;
  const dist = length(cameraPosition.sub(positionWorld));
  const near = smoothstep(160.0, 20.0, dist);
  const grain = mx_noise_float(p.mul(9.0)).mul(0.5).add(0.5);
  const patches = mx_fractal_noise_float(p.mul(0.06), 3).mul(0.5).add(0.5);
  const wear = mx_fractal_noise_float(p.mul(0.5), 3).mul(0.5).add(0.5);
  let c;
  if (paint) {
    // diagonal: 3 m bands across at 45 degrees; along: 1.5 m bands parallel to the track;
    // solid: the first colour only
    const band = pattern === 'along' ? abs(uv().y).div(3.0) : uv().x.add(abs(uv().y)).div(6.0);
    const aa = fwidth(band).add(0.001);
    const b = pattern === 'solid' ? float(0) : smoothstep(float(0.5).sub(aa), float(0.5).add(aa), fract(band));
    c = mix(color(paint[0]), color(paint[1] ?? paint[0]), b);
    c = mix(c, color(0x26272a), smoothstep(0.62, 0.88, wear).mul(0.5));
    c = c.mul(grain.mul(0.1).add(0.95));
  } else {
    // run-off tarmac: no rubber laid down, so paler and dustier than the racing surface
    c = mix(color(0x3a3b3f), color(0x4a4b4f), grain.mul(0.5).add(patches.mul(0.5)));
    c = mix(c, color(0x2a2b2e), smoothstep(0.65, 0.9, wear).mul(0.6));
  }
  m.colorNode = c;
  m.roughnessNode = float(paint ? 0.62 : 0.85).sub(grain.mul(0.06));
  m.metalnessNode = float(0.0);
  m.normalNode = bumpMap(grain.mul(near), 0.12);
  return m;
}

/**
 * Open water: dark blue-green, nearly mirror-smooth so it picks up the sky, with two
 * drifting layers of small ripples.
 */
export function waterMaterial() {
  const m = new THREE.MeshPhysicalNodeMaterial();
  const p = positionWorld.xz;
  const t = time.mul(0.6);
  const r1 = mx_noise_float(vec3(p.mul(0.45), t));
  const r2 = mx_noise_float(vec3(p.mul(vec2(1.6, 1.1)).add(31.0), t.mul(1.7)));
  const dist = length(cameraPosition.sub(positionWorld));
  m.colorNode = mix(color(0x0f2a33), color(0x1c3d44), mx_fractal_noise_float(p.mul(0.01), 2).mul(0.5).add(0.5));
  m.roughnessNode = float(0.06);
  m.metalnessNode = float(0.0);
  m.normalNode = bumpMap(r1.mul(0.6).add(r2.mul(0.4)).mul(smoothstep(400.0, 40.0, dist)), 0.25);
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

/**
 * Night sky for the floodlit races: near-black zenith, a warm glow of light pollution
 * low over the horizon from the city and the circuit's own floodlights, faint stars and
 * a moon. `stars: false` for the environment map, so the stars don't speckle reflections.
 */
export function nightSkyNode(moonDir, { stars = true } = {}) {
  const d = positionWorldDirection;
  const h = max(d.y, 0.0);
  let sky = mix(color(0x141a2a), color(0x020409), h.pow(0.35));
  // light dome: orange sodium/LED haze, strongest at the horizon
  sky = sky.add(color(0x6a4026).mul(h.mul(-9.0).exp().mul(0.55)));
  const moon = max(d.dot(vec3(...moonDir).normalize()), 0.0);
  sky = sky.add(color(0xdde6ff).mul(smoothstep(0.99985, 0.9999, moon).mul(1.5).add(moon.pow(60.0).mul(0.05))));
  if (stars) {
    // tiny sparse dots: peaks of a fine noise, fading out into the horizon haze
    const n = mx_noise_float(d.mul(420.0));
    const tw = mx_noise_float(d.mul(37.0)).mul(0.5).add(0.5);
    sky = sky.add(vec3(smoothstep(0.78, 0.95, n).mul(tw).mul(smoothstep(0.08, 0.35, h)).mul(0.9)));
  }
  const below = smoothstep(0.0, -0.08, d.y);
  return mix(sky, color(0x07080b), below);
}
