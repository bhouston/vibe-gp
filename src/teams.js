// Teams and their liveries. Everything is procedural TSL: each team paints the
// lofted body panels as a function of the panel's local position (car body frame:
// +Z forward, +Y up, +X = car's left) and the loft's uv (uv.x runs around the
// cross-section: 0.25 = top centre, 0.75 = underside).
//
// Parts painted by `body(part)`: 'monocoque' (nose + chassis), 'sidepod',
// 'engine' (airbox + engine cover), 'fin' (shark fin plate).
// Liveries follow each team's current colour blocking; sponsor wordmarks and
// team crests are left out (abstract shapes stand in for the big logos).
import { color, float, mix, smoothstep, positionLocal, uv, sin, abs, max, vec2, length } from 'three/tsl';

// ---- small mask helpers (all return 0..1 float nodes) ----
const SOFT = 0.006;
/** 1 where x > t. */
const above = (x, t, s = SOFT) =>
  typeof t === 'number' ? smoothstep(t - s, t + s, x) : smoothstep(t.sub(s), t.add(s), x);
/** 1 where x < t. */
const below = (x, t, s = SOFT) => above(x, t, s).oneMinus();
/** 1 where a < x < b. */
const band = (x, a, b, s = SOFT) => above(x, a, s).mul(below(x, b, s));
/** Vertical position around the section: +1 top, 0 widest point, -1 underside. */
const around = () => sin(uv().x.mul(Math.PI * 2));
/** Filled ellipse in the body's side (z, y) plane. */
const ellipse = (cz, cy, rz, ry) => {
  const p = positionLocal;
  const d = length(vec2(p.z.sub(cz).div(rz), p.y.sub(cy).div(ry)));
  return below(d, 1, 0.06);
};

/** Layer colours over a base: layers = [[hex, mask], ...], later layers win. */
function paint(baseHex, layers) {
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
function numberMask(u, v, text, cu, cv, height) {
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
function noseNumber(text, z = 1.62) {
  const p = positionLocal;
  return numberMask(p.x, p.z.negate(), text, 0, -z, 0.2).mul(above(around(), 0.4, 0.05));
}

/** Masks for the side of a body panel (excludes the top and underside). */
const sides = (lo = -0.45, hi = 0.6) => band(around(), lo, hi, 0.05);

const RB = { navy: 0x1a2142, red: 0xd6143c, yellow: 0xffc906, white: 0xf2f2f2 };
const SF = { red: 0xd8001b, black: 0x141414, white: 0xf4f4f4, yellow: 0xfff200 };
const MCL = { papaya: 0xff8700, black: 0x1d1e22, white: 0xf4f4f4 };

export const TEAMS = [
  {
    id: 'redbull',
    name: 'Red Bull',
    car: 'RB-V',
    number: 1,
    // matte navy: the paint has very little gloss
    finish: { roughness: 0.6, metalness: 0.05, clearcoat: 0.12 },
    ui: { primary: '#1a2142', secondary: '#d6143c', accent: '#ffc906' },
    wings: {
      frontMain: RB.navy, frontFlaps: RB.navy, frontTopFlap: RB.red, frontEndplate: RB.navy,
      rearMain: RB.navy, rearFlap: RB.red, rearEndplate: RB.navy,
    },
    colors: { halo: RB.navy, wheelCover: RB.navy, wheelRing: RB.red, tcam: 0xffe600, mirror: RB.navy },
    helmet: 0xe9edf5,
    sponsors: [
      { part: 'sidepod', text: 'Red Bull', at: [0.05, 0.37], size: [0.42, 0.075], color: RB.red, font: 'italic' },
      { part: 'sidepod', text: 'ORACLE', at: [-0.55, 0.39], size: [0.36, 0.06], color: RB.white, font: 'sans', spacing: 0.08 },
      { part: 'engine', text: 'ORACLE', at: [-1.55, 0.6], size: [0.4, 0.07], color: RB.white, font: 'sans', spacing: 0.08 },
      { part: 'monocoque', text: 'Mobil 1', at: [1.8, 0.31], size: [0.36, 0.07], color: RB.white, font: 'italic' },
      { part: 'monocoque', text: 'TAG Heuer', at: [0.95, 0.43], size: [0.3, 0.055], color: RB.white, font: 'sans' },
      { part: 'rearEndplate', text: 'ORACLE', at: [-2.47, 0.95], size: [0.44, 0.11], color: RB.white, font: 'sans', spacing: 0.08 },
      { part: 'rearFlap', text: 'ORACLE', facing: 'rear', at: [0, 1.0], size: [0.62, 0.075], color: RB.white, font: 'sans', spacing: 0.1 },
      { part: 'frontEndplate', text: 'Red Bull', at: [2.62, 0.2], size: [0.32, 0.07], color: RB.red, font: 'italic' },
    ],
    body(part) {
      const p = positionLocal;
      // the big sidepod/engine-cover logo: a yellow sun disc between two red charging shapes
      const logo = (cz, cy, k) => [
        [RB.red, ellipse(cz + 0.14 * k, cy + 0.005, 0.11 * k, 0.045 * k).mul(sides())],
        [RB.red, ellipse(cz - 0.14 * k, cy + 0.005, 0.11 * k, 0.045 * k).mul(sides())],
        [RB.yellow, ellipse(cz, cy + 0.01, 0.07 * k, 0.07 * k).mul(sides())],
      ];
      if (part === 'monocoque') {
        return paint(RB.navy, [
          [RB.yellow, above(p.z, 2.5)], // yellow nose tip
          [RB.red, band(p.z, 2.18, 2.5).mul(sides(-0.6, 0.5))], // red lettering block on the nose sides
          [RB.white, noseNumber('1')],
          [RB.red, band(p.y, 0.27, 0.3).mul(band(p.z, -0.6, 0.9)).mul(sides())], // red waist line
        ]);
      }
      if (part === 'sidepod') {
        return paint(RB.navy, [
          ...logo(0.05, 0.47, 1),
        ]);
      }
      if (part === 'engine') return paint(RB.navy, logo(-1.0, 0.76, 0.75));
      return paint(RB.navy, [[RB.red, above(p.y, 0.9)]]); // fin
    },
  },
  {
    id: 'ferrari',
    name: 'Ferrari',
    car: 'SF-V',
    number: 16,
    finish: { roughness: 0.22, metalness: 0.08, clearcoat: 1.0 },
    ui: { primary: '#d8001b', secondary: '#141414', accent: '#fff200' },
    wings: {
      frontMain: null, frontFlaps: SF.red, frontTopFlap: SF.red, frontEndplate: SF.red,
      rearMain: SF.red, rearFlap: SF.red, rearEndplate: SF.red,
    },
    colors: { halo: null, wheelCover: SF.black, wheelRing: SF.red, tcam: 0xffe600, mirror: SF.red },
    helmet: 0xf2f2f2,
    sponsors: [
      { part: 'engine', text: 'HP', at: [-1.55, 0.62], size: [0.2, 0.12], color: SF.white, font: 'wide' },
      { part: 'sidepod', text: 'Shell', at: [0.2, 0.41], size: [0.26, 0.07], color: SF.white, font: 'sans' },
      { part: 'sidepod', text: 'UniCredit', at: [-0.55, 0.36], size: [0.3, 0.055], color: SF.white, font: 'sans' },
      { part: 'monocoque', text: 'Santander', at: [1.9, 0.31], size: [0.4, 0.065], color: SF.white, font: 'sans' },
      { part: 'rearEndplate', text: 'Santander', at: [-2.47, 0.95], size: [0.46, 0.1], color: SF.white, font: 'sans' },
      { part: 'rearFlap', text: 'Shell', facing: 'rear', at: [0, 1.0], size: [0.4, 0.08], color: SF.white, font: 'sans' },
      { part: 'frontEndplate', text: 'Ray-Ban', at: [2.62, 0.2], size: [0.3, 0.07], color: SF.white, font: 'serif' },
    ],
    body(part) {
      const p = positionLocal;
      const s = around();
      // white-over-yellow stripe sweeping down the flanks towards the rear
      const sweep = (y0, slope) => {
        const d = p.y.sub(p.z.mul(slope).add(y0));
        return [
          [SF.white, band(d, 0.0, 0.03).mul(sides(-0.3, 0.7))],
          [SF.yellow, band(d, -0.022, 0.0).mul(sides(-0.3, 0.7))],
        ];
      };
      if (part === 'monocoque') {
        return paint(SF.red, [
          [SF.black, below(s, -0.35)], // exposed carbon underneath
          [SF.yellow, band(p.z, 1.26, 1.42).mul(band(p.y, 0.31, 0.43)).mul(sides(-0.4, 0.5))], // shield panel
          [SF.white, noseNumber('16')],
          [SF.white, band(abs(p.x), 0.03, 0.045).mul(band(p.z, 0.75, 1.6)).mul(above(s, 0.6))], // twin pinstripes
        ]);
      }
      if (part === 'sidepod') {
        // black lower half (exposed carbon undercut) with a white cut line
        return paint(SF.red, [
          [SF.black, below(s, -0.05, 0.02)],
          [SF.white, band(s, -0.05, 0.03, 0.02)],
          ...sweep(0.52, 0.12),
        ]);
      }
      if (part === 'engine') {
        return paint(SF.red, [
          ...sweep(1.02, 0.18),
          [SF.black, below(p.z, -2.05)],
        ]);
      }
      return paint(SF.red, []);
    },
  },
  {
    id: 'mclaren',
    name: 'McLaren',
    car: 'MCL-V',
    number: 4,
    finish: { roughness: 0.28, metalness: 0.1, clearcoat: 1.0 },
    ui: { primary: '#ff8700', secondary: '#1d1e22', accent: '#ffb15c' },
    wings: {
      frontMain: MCL.black, frontFlaps: MCL.black, frontTopFlap: MCL.papaya, frontEndplate: MCL.papaya,
      rearMain: MCL.black, rearFlap: MCL.papaya, rearEndplate: MCL.black,
    },
    colors: { halo: MCL.papaya, wheelCover: MCL.black, wheelRing: MCL.papaya, tcam: 0xffe600, mirror: MCL.papaya },
    helmet: MCL.papaya,
    sponsors: [
      { part: 'sidepod', text: 'OKX', at: [-0.2, 0.38], size: [0.24, 0.09], color: MCL.white, font: 'wide' },
      { part: 'engine', text: 'Google', at: [-1.3, 0.64], size: [0.3, 0.08], color: MCL.white, font: 'sans' },
      { part: 'monocoque', text: 'Mastercard', at: [2.05, 0.29], size: [0.44, 0.06], color: MCL.black, font: 'sans' },
      { part: 'monocoque', text: 'Google', at: [0.95, 0.42], size: [0.26, 0.065], color: MCL.white, font: 'sans' },
      { part: 'rearEndplate', text: 'OKX', at: [-2.47, 0.95], size: [0.3, 0.12], color: MCL.papaya, font: 'wide' },
      { part: 'rearFlap', text: 'OKX', facing: 'rear', at: [0, 1.0], size: [0.3, 0.085], color: MCL.black, font: 'wide' },
      { part: 'frontEndplate', text: 'Mastercard', at: [2.62, 0.2], size: [0.34, 0.06], color: MCL.black, font: 'sans' },
    ],
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        // papaya top, anthracite flanks; the nose is papaya all round
        return paint(MCL.papaya, [
          [MCL.black, below(s, 0.3, 0.02).mul(below(p.z, 1.9, 0.02))],
          [MCL.black, noseNumber('4')],
        ]);
      }
      if (part === 'sidepod') {
        // papaya shoulders, anthracite below; the black grows towards the rear
        const cut = p.z.mul(-0.28).add(0.42);
        return paint(MCL.papaya, [[MCL.black, below(s, cut, 0.02)]]);
      }
      if (part === 'engine') {
        // papaya spine, anthracite flanks
        return paint(MCL.papaya, [[MCL.black, below(s, 0.62, 0.02).mul(below(p.z, -0.3))]]);
      }
      return paint(MCL.papaya, []);
    },
  },
];

export const teamById = (id) => TEAMS.find((t) => t.id === id) ?? TEAMS[0];

/** Small side-profile SVG of the car in team colours, for the menu cards. */
export function teamCarSvg(team) {
  const { primary, secondary, accent } = team.ui;
  return `
    <svg viewBox="0 0 220 70" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M4 50 L40 46 L72 38 L104 34 L118 24 L134 24 L142 32 L172 34 L190 24 L210 22 L210 46 L182 52 L20 54 Z" fill="${primary}"/>
      <path d="M78 46 L172 44 L182 52 L70 52 Z" fill="${secondary}"/>
      <path d="M4 50 L22 48.5 L22 54 L16 54 Z" fill="${accent}"/>
      <rect x="196" y="14" width="16" height="8" fill="${secondary}"/>
      <rect x="0" y="52" width="40" height="5" fill="${secondary}"/>
      <circle cx="52" cy="52" r="14" fill="#111"/><circle cx="52" cy="52" r="8" fill="${secondary}"/>
      <circle cx="180" cy="51" r="15" fill="#111"/><circle cx="180" cy="51" r="8.5" fill="${secondary}"/>
      <text x="150" y="46" font-size="11" font-weight="800" fill="#fff" text-anchor="middle" font-style="italic">${team.number}</text>
    </svg>`;
}
