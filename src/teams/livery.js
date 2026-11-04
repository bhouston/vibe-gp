// Shared livery helpers for the team definitions in src/teams/*.js (see src/teams.js).
import { color, float, mix, smoothstep, positionLocal, uv, sin, abs, max } from 'three/tsl';

// ---- small mask helpers (all return 0..1 float nodes) ----
export const SOFT = 0.006;
/** 1 where x > t. */
export const above = (x, t, s = SOFT) =>
  typeof t === 'number' ? smoothstep(t - s, t + s, x) : smoothstep(t.sub(s), t.add(s), x);
/** 1 where x < t. */
export const below = (x, t, s = SOFT) => above(x, t, s).oneMinus();
/** 1 where a < x < b. */
export const band = (x, a, b, s = SOFT) => above(x, a, s).mul(below(x, b, s));
/** Vertical position around the section: +1 top, 0 widest point, -1 underside. */
export const around = () => sin(uv().x.mul(Math.PI * 2));

/** Layer colours over a base: layers = [[hex, mask], ...], later layers win. */
export function paint(baseHex, layers) {
  let c = color(baseHex);
  for (const [hex, mask] of layers) c = mix(c, color(hex), mask.clamp(0, 1));
  return c;
}

// ---- race numbers: rounded seven-segment digits drawn in TSL ----
// digit space: x 0..1, y 0..2. [centre x, centre y, half w, half h]
const SEG = {
  a: [0.5, 1.87, 0.37, 0.13], b: [0.87, 1.45, 0.13, 0.38], c: [0.87, 0.55, 0.13, 0.38],
  d: [0.5, 0.13, 0.37, 0.13], e: [0.13, 0.55, 0.13, 0.38], f: [0.13, 1.45, 0.13, 0.38],
  g: [0.5, 1.0, 0.33, 0.12],
};
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

/**
 * Mask for `text` (digits) laid out on a surface, with u to the reader's right and
 * v up the digits, centred on (cu, cv) with digit height `height` (metres).
 */
export function numberMask(u, v, text, cu, cv, height) {
  const s = height / 2;
  const adv = 1.3;
  const total = text.length * adv - 0.3;
  let m = float(0);
  [...text].forEach((ch, i) => {
    // a lone "1" uses the right-hand segments; shift it so it sits centred in its cell
    const qx = u.sub(cu).div(s).add(total / 2 - i * adv + (ch === '1' ? 0.37 : 0));
    const qy = v.sub(cv).div(s).add(1);
    for (const k of DIGITS[+ch]) {
      const [cx, cy, hx, hy] = SEG[k];
      const d = max(abs(qx.sub(cx)).sub(hx), abs(qy.sub(cy)).sub(hy));
      m = max(m, below(d, 0, 0.04));
    }
  });
  return m;
}

/**
 * Number on top of the nose, readable when standing in front of the car:
 * the tops of the digits point back towards the cockpit.
 */
export function noseNumber(text, z = 1.62) {
  const p = positionLocal;
  return numberMask(p.x, p.z.negate(), text, 0, -z, 0.2).mul(above(around(), 0.4, 0.05));
}

/** Masks for the side of a body panel (excludes the top and underside). */
export const sides = (lo = -0.45, hi = 0.6) => band(around(), lo, hi, 0.05);

/**
 * One sponsor decal. `at`/`size` are in metres in the car body frame (see applyDecals);
 * `ink` null draws the logo in its brand colours, a hex draws it single-colour.
 */
export const logo = (part, id, at, size, ink = null, facing = 'side') => ({ part, logo: id, at, size, color: ink, facing });
/** The same top-facing logo on both sidepods. */
export const podTops = (id, z, size, ink) => [-1, 1].map((s) => logo('sidepod', id, [0.53 * s, z], size, ink, 'top'));

export const W = 0xf4f4f4; // white ink

// Standard decal positions shared by the liveries: [part, at, size, facing].
// Each fits a panel of the shared car body (see the Red Bull layout for the originals).
export const SLOT = {
  podBig: ['sidepod', [0.1, 0.5], [0.44, 0.22]], // main sidepod logo
  podLow: ['sidepod', [-0.62, 0.37], [0.36, 0.064]], // lower rear of the sidepod
  podFront: ['sidepod', [0.42, 0.6], [0.18, 0.04]], // by the inlet
  engBig: ['engine', [-1.05, 0.74], [0.4, 0.18]], // engine cover flank
  engLow: ['engine', [-1.72, 0.56], [0.34, 0.07]],
  engFront: ['engine', [-0.5, 0.94], [0.3, 0.058]], // under the airbox
  fin: ['fin', [-1.68, 0.84], [0.44, 0.09]],
  nose: ['monocoque', [1.97, 0.28], [0.34, 0.09]],
  noseRear: ['monocoque', [1.42, 0.36], [0.16, 0.08]],
  cockpitHi: ['monocoque', [0.98, 0.45], [0.3, 0.068]],
  cockpitLo: ['monocoque', [0.95, 0.33], [0.22, 0.061]],
  rearEpHi: ['rearEndplate', [-2.47, 0.96], [0.44, 0.09]],
  rearEpLo: ['rearEndplate', [-2.5, 0.74], [0.3, 0.09]],
  rearFlap: ['rearFlap', [0, 1.0], [0.52, 0.093], 'rear'],
  rearMain: ['rearMain', [0, -2.4], [0.5, 0.12], 'top'],
  frontEp: ['frontEndplate', [2.62, 0.2], [0.3, 0.08]],
  frontMain: ['frontMain', [0, 2.8], [0.5, 0.09], 'top'],
};
/** Sponsors from { slotName: [logoId, ink?] }, plus any extra decals. */
export const slots = (spec, extra = []) => [
  ...Object.entries(spec).map(([k, [id, ink]]) => {
    const [part, at, size, facing] = SLOT[k];
    return logo(part, id, at, size, ink ?? null, facing);
  }),
  ...extra,
];
