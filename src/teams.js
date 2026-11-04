// Teams and their liveries. Everything is procedural TSL: each team paints the
// lofted body panels as a function of the panel's local position (car body frame:
// +Z forward, +Y up, +X = car's left) and the loft's uv (uv.x runs around the
// cross-section: 0.25 = top centre, 0.75 = underside).
//
// Parts painted by `body(part)`: 'monocoque' (nose + chassis), 'sidepod',
// 'engine' (airbox + engine cover), 'fin' (shark fin plate).
// Liveries follow each team's current colour blocking. Sponsor logos are decals
// (src/decals.js) drawn from src/logos.js: `sponsors` lists them per part.
import { color, float, mix, smoothstep, positionLocal, uv, sin, abs, max } from 'three/tsl';

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

/**
 * One sponsor decal. `at`/`size` are in metres in the car body frame (see applyDecals);
 * `ink` null draws the logo in its brand colours, a hex draws it single-colour.
 */
const logo = (part, id, at, size, ink = null, facing = 'side') => ({ part, logo: id, at, size, color: ink, facing });
/** The same top-facing logo on both sidepods. */
const podTops = (id, z, size, ink) => [-1, 1].map((s) => logo('sidepod', id, [0.53 * s, z], size, ink, 'top'));

const RB = { navy: 0x1a2142, red: 0xd6143c, yellow: 0xffc906, white: 0xf2f2f2 };
const SF = { red: 0xd8001b, black: 0x141414, white: 0xf4f4f4, yellow: 0xfff200 };
const MCL = { papaya: 0xff8700, black: 0x1d1e22, white: 0xf4f4f4 };
const MER = { silver: 0xc3c7cc, black: 0x161718, teal: 0x00d7b6, white: 0xf4f4f4 };
const WIL = { navy: 0x041e42, blue: 0x00a3e0, white: 0xf4f4f4 };
const VCA = { white: 0xf2f4f8, blue: 0x1c3fd0, navy: 0x0b1640, red: 0xe30a17 };
const AM = { green: 0x00594f, dark: 0x0b2b26, lime: 0xcedc00, white: 0xf4f4f4 };
const HAS = { white: 0xf2f2f2, black: 0x121314, red: 0xe6002d };
const AUD = { ti: 0xa8adb2, dark: 0x1b1c1e, red: 0xf50537 };
const ALP = { blue: 0x0078d7, navy: 0x0a1a3a, pink: 0xff5fa2, white: 0xf4f4f4 };
const CAD = { black: 0x0e0e10, white: 0xf2f2f2, silver: 0xb8bcc2 };
const W = 0xf4f4f4; // white ink

// Standard decal positions shared by the liveries: [part, at, size, facing].
// Each fits a panel of the shared car body (see the Red Bull layout for the originals).
const SLOT = {
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
const slots = (spec, extra = []) => [
  ...Object.entries(spec).map(([k, [id, ink]]) => {
    const [part, at, size, facing] = SLOT[k];
    return logo(part, id, at, size, ink ?? null, facing);
  }),
  ...extra,
];

const TEAM_DEFS = [
  {
    id: 'redbull',
    logo: 'redbull', // team logo on the garage and its pit box
    logoHasName: true, // the logo spells out the name (garage board shows it alone)
    name: 'Red Bull',
    car: 'RB-V',
    number: 3,
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
      // sidepods: the charging-bulls logo, title partner below, Bybit on top
      logo('sidepod', 'redbull', [0.1, 0.5], [0.44, 0.25]),
      logo('sidepod', 'oracle', [-0.62, 0.37], [0.36, 0.064], RB.white),
      logo('sidepod', 'castore', [0.42, 0.6], [0.18, 0.036], RB.white),
      ...podTops('bybit', -0.25, [0.24, 0.067], RB.white),
      // engine cover: bulls again, Oracle, Ford on the fin
      logo('engine', 'redbull', [-1.02, 0.75], [0.4, 0.23]),
      logo('engine', 'oracle', [-1.72, 0.56], [0.34, 0.06], RB.white),
      logo('fin', 'ford', [-1.72, 0.82], [0.22, 0.1]),
      // chassis and nose
      logo('monocoque', 'mobil1', [1.97, 0.28], [0.34, 0.094], RB.white),
      logo('monocoque', 'ford', [1.42, 0.36], [0.16, 0.073]),
      logo('monocoque', 'hardrock', [0.98, 0.45], [0.3, 0.068], RB.white),
      logo('monocoque', 'bybit', [0.95, 0.33], [0.22, 0.061], RB.white),
      // wings
      logo('rearEndplate', 'oracle', [-2.47, 0.96], [0.44, 0.079], RB.white),
      logo('rearEndplate', 'bybit', [-2.5, 0.75], [0.3, 0.083], RB.white),
      logo('rearFlap', 'oracle', [0, 1.0], [0.52, 0.093], RB.white, 'rear'),
      logo('rearMain', 'redbullText', [0, -2.4], [0.5, 0.12], RB.white, 'top'),
      logo('frontEndplate', 'redbullText', [2.62, 0.2], [0.3, 0.071], RB.red),
      logo('frontMain', 'oracle', [0, 2.8], [0.5, 0.09], RB.white, 'top'),
    ],
    body(part) {
      const p = positionLocal;
      if (part === 'monocoque') {
        return paint(RB.navy, [
          [RB.yellow, above(p.z, 2.5)], // yellow nose tip
          [RB.white, noseNumber('3')],
          [RB.red, band(p.y, 0.27, 0.3).mul(band(p.z, -0.6, 0.9)).mul(sides())], // red waist line
        ]);
      }
      if (part === 'sidepod' || part === 'engine') return paint(RB.navy, []);
      return paint(RB.navy, [[RB.red, above(p.y, 0.9)]]); // fin
    },
  },
  {
    id: 'ferrari',
    logo: 'ferrari', // team logo on the garage and its pit box
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
      // engine cover: title partner HP, Shell, Bitdefender ahead of them
      logo('engine', 'hp', [-1.12, 0.74], [0.2, 0.2], SF.white),
      logo('engine', 'shell', [-1.62, 0.6], [0.15, 0.14]),
      logo('engine', 'bitdefender', [-0.5, 0.94], [0.3, 0.058], SF.white),
      logo('fin', 'richardmille', [-1.65, 0.86], [0.48, 0.064], SF.white),
      // sidepods
      logo('sidepod', 'shell', [0.22, 0.48], [0.13, 0.123]),
      logo('sidepod', 'unicredit', [-0.42, 0.42], [0.32, 0.07], SF.white),
      logo('sidepod', 'ibm', [-0.86, 0.33], [0.14, 0.058], SF.white),
      ...podTops('celsius', -0.1, [0.26, 0.059], SF.white),
      // chassis and nose
      logo('monocoque', 'ferrari', [1.34, 0.37], [0.09, 0.125]),
      logo('monocoque', 'santander', [2.0, 0.28], [0.36, 0.078], SF.white),
      logo('monocoque', 'puma', [0.95, 0.47], [0.22, 0.069], SF.white),
      logo('monocoque', 'aws', [0.95, 0.33], [0.13, 0.076], SF.white),
      // wings
      logo('rearEndplate', 'santander', [-2.47, 0.96], [0.44, 0.096], SF.white),
      logo('rearEndplate', 'aws', [-2.5, 0.74], [0.17, 0.1], SF.white),
      logo('rearFlap', 'shellText', [0, 1.0], [0.3, 0.094], SF.white, 'rear'),
      logo('rearMain', 'santander', [0, -2.4], [0.55, 0.12], SF.white, 'top'),
      logo('frontEndplate', 'rayban', [2.62, 0.19], [0.28, 0.1], SF.white),
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
    logo: 'mclaren', // team logo on the garage and its pit box
    logoHasName: true, // the logo spells out the name (garage board shows it alone)
    name: 'McLaren',
    car: 'MCL-V',
    number: 1,
    finish: { roughness: 0.28, metalness: 0.1, clearcoat: 1.0 },
    ui: { primary: '#ff8700', secondary: '#1d1e22', accent: '#ffb15c' },
    wings: {
      frontMain: MCL.black, frontFlaps: MCL.black, frontTopFlap: MCL.papaya, frontEndplate: MCL.papaya,
      rearMain: MCL.black, rearFlap: MCL.papaya, rearEndplate: MCL.black,
    },
    colors: { halo: MCL.papaya, wheelCover: MCL.black, wheelRing: MCL.papaya, tcam: 0xffe600, mirror: MCL.papaya },
    helmet: MCL.papaya,
    sponsors: [
      // sidepods: OKX on the anthracite, Mastercard on the papaya shoulder
      logo('sidepod', 'okx', [-0.28, 0.39], [0.27, 0.084], MCL.white),
      logo('sidepod', 'mastercard', [0.3, 0.53], [0.14, 0.086]),
      logo('sidepod', 'estrella', [-0.86, 0.31], [0.24, 0.057], MCL.white),
      ...podTops('hilton', -0.15, [0.22, 0.065], MCL.black),
      // engine cover and fin
      logo('engine', 'google', [-1.12, 0.7], [0.3, 0.1]),
      logo('engine', 'dell', [-1.72, 0.55], [0.2, 0.077], MCL.white),
      logo('fin', 'mclaren', [-1.65, 0.84], [0.4, 0.091], MCL.black),
      // chassis and nose
      logo('monocoque', 'mastercard', [2.12, 0.27], [0.16, 0.099]),
      logo('monocoque', 'mastercardText', [1.72, 0.31], [0.3, 0.054], MCL.black),
      logo('monocoque', 'google', [1.05, 0.42], [0.26, 0.087], MCL.white),
      logo('monocoque', 'monster', [1.36, 0.37], [0.07, 0.082]),
      logo('monocoque', 'velo', [0.95, 0.3], [0.16, 0.047], MCL.white),
      // wings
      logo('rearEndplate', 'okx', [-2.47, 0.96], [0.3, 0.094], MCL.papaya),
      logo('rearEndplate', 'gulf', [-2.5, 0.73], [0.15, 0.107]),
      logo('rearFlap', 'okx', [0, 1.0], [0.3, 0.094], MCL.black, 'rear'),
      logo('rearMain', 'mastercardText', [0, -2.4], [0.5, 0.089], MCL.white, 'top'),
      logo('frontEndplate', 'mastercardText', [2.62, 0.2], [0.34, 0.061], MCL.black),
      logo('frontMain', 'okx', [0, 2.8], [0.3, 0.094], MCL.papaya, 'top'),
    ],
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        // papaya top, anthracite flanks; the nose is papaya all round
        return paint(MCL.papaya, [
          [MCL.black, below(s, 0.3, 0.02).mul(below(p.z, 1.9, 0.02))],
          [MCL.black, noseNumber('1')],
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
  {
    id: 'mercedes',
    logo: 'mercedes',
    name: 'Mercedes',
    car: 'W-V',
    number: 63,
    // silver arrow: a metallic paint with a lot of gloss
    finish: { roughness: 0.24, metalness: 0.45, clearcoat: 1.0 },
    ui: { primary: '#c3c7cc', secondary: '#161718', accent: '#00d7b6' },
    wings: {
      frontMain: MER.black, frontFlaps: MER.black, frontTopFlap: MER.teal, frontEndplate: MER.black,
      rearMain: MER.black, rearFlap: MER.silver, rearEndplate: MER.black,
    },
    colors: { halo: MER.black, wheelCover: MER.black, wheelRing: MER.teal, tcam: 0xffe600, mirror: MER.silver },
    helmet: 0xf2f2f2,
    sponsors: slots({
      podBig: ['petronas', MER.teal], podLow: ['ineos', W], podFront: ['amg', MER.black],
      engBig: ['mercedes', W], engLow: ['microsoft', W], engFront: ['crowdstrike'],
      fin: ['petronas', MER.teal], nose: ['petronas', W], noseRear: ['mercedes', W],
      cockpitHi: ['ubs'], cockpitLo: ['microsoft', W],
      rearEpHi: ['petronas', MER.teal], rearEpLo: ['ineos', W], rearFlap: ['petronas', MER.black],
      rearMain: ['amg', W], frontEp: ['mercedes', W], frontMain: ['petronas', W],
    }, podTops('crowdstrike', -0.2, [0.26, 0.042])),
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        // silver over black, split by a teal line
        return paint(MER.silver, [
          [MER.black, below(s, 0.15, 0.02)],
          [MER.teal, band(s, 0.15, 0.21, 0.01).mul(below(p.z, 2.6))],
          [MER.black, noseNumber('63')],
        ]);
      }
      if (part === 'sidepod') {
        return paint(MER.black, [[MER.silver, above(s, 0.35, 0.02)], [MER.teal, band(s, 0.3, 0.35, 0.01)]]);
      }
      if (part === 'engine') {
        const rear = below(p.z, -0.4);
        return paint(MER.silver, [[MER.black, below(s, 0.4, 0.02).mul(rear)], [MER.teal, band(s, 0.4, 0.46, 0.01).mul(rear)]]);
      }
      return paint(MER.black, [[MER.teal, above(p.y, 0.9)]]);
    },
  },
  {
    id: 'williams',
    logo: 'williams',
    logoHasName: true, // the logo spells out the name (garage board shows it alone)
    name: 'Williams',
    car: 'FW-V',
    number: 55,
    finish: { roughness: 0.4, metalness: 0.08, clearcoat: 0.6 },
    ui: { primary: '#041e42', secondary: '#00a3e0', accent: '#ffffff' },
    wings: {
      frontMain: WIL.navy, frontFlaps: WIL.navy, frontTopFlap: WIL.blue, frontEndplate: WIL.navy,
      rearMain: WIL.navy, rearFlap: WIL.blue, rearEndplate: WIL.navy,
    },
    colors: { halo: WIL.navy, wheelCover: WIL.navy, wheelRing: WIL.blue, tcam: 0x111111, mirror: WIL.navy },
    helmet: 0xe2231a,
    sponsors: slots({
      podBig: ['atlassian', W], podLow: ['komatsu', W], podFront: ['duracell'],
      engBig: ['williams', W], engLow: ['barclays', W], engFront: ['kraken', W],
      fin: ['atlassian', W], nose: ['barclays', W], noseRear: ['williams', W],
      cockpitHi: ['santander', W], cockpitLo: ['gulf'],
      rearEpHi: ['atlassian', W], rearEpLo: ['komatsu', W], rearFlap: ['atlassian', W],
      rearMain: ['williams', W], frontEp: ['duracell', W], frontMain: ['atlassian', W],
    }, podTops('kraken', -0.2, [0.22, 0.065], W)),
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        return paint(WIL.navy, [
          [WIL.blue, below(s, -0.25, 0.02).mul(below(p.z, 2.3))],
          [WIL.white, band(s, -0.25, -0.2, 0.01).mul(below(p.z, 2.3))],
          [WIL.white, noseNumber('55')],
        ]);
      }
      if (part === 'sidepod') {
        // light-blue lower flank, rising towards the rear
        const cut = p.z.mul(-0.25).add(-0.1);
        return paint(WIL.navy, [[WIL.blue, below(s, cut, 0.02)], [WIL.white, band(s, cut, cut.add(0.05), 0.01)]]);
      }
      if (part === 'engine') return paint(WIL.navy, [[WIL.blue, below(s, 0.1, 0.02).mul(below(p.z, -1.0))]]);
      return paint(WIL.navy, [[WIL.blue, above(p.y, 0.9)]]);
    },
  },
  {
    id: 'racingbulls',
    logo: 'racingbulls',
    logoHasName: true, // the logo spells out the name (garage board shows it alone)
    name: 'Racing Bulls',
    car: 'VCARB-V',
    number: 30,
    finish: { roughness: 0.3, metalness: 0.05, clearcoat: 1.0 },
    ui: { primary: '#f2f4f8', secondary: '#1c3fd0', accent: '#e30a17' },
    wings: {
      frontMain: VCA.blue, frontFlaps: VCA.blue, frontTopFlap: VCA.white, frontEndplate: VCA.blue,
      rearMain: VCA.blue, rearFlap: VCA.white, rearEndplate: VCA.blue,
    },
    colors: { halo: VCA.blue, wheelCover: VCA.white, wheelRing: VCA.blue, tcam: 0x111111, mirror: VCA.white },
    helmet: 0x1c3fd0,
    sponsors: slots({
      podBig: ['racingbulls'], podLow: ['visa', W], podFront: ['cashapp'],
      engBig: ['visa', W], engLow: ['cashapp', W], engFront: ['visa', VCA.blue],
      fin: ['racingbulls', W], nose: ['visa', VCA.blue], noseRear: ['cashapp'],
      cockpitHi: ['visa', VCA.blue], cockpitLo: ['cashapp', W],
      rearEpHi: ['visa', W], rearEpLo: ['cashapp', W], rearFlap: ['visa', VCA.blue],
      rearMain: ['visa', W], frontEp: ['visa', W], frontMain: ['visa', W],
    }, podTops('cashapp', -0.2, [0.22, 0.058])),
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        // white nose and top, blue lower chassis with a red pinstripe
        const chassis = below(p.z, 1.5, 0.03);
        return paint(VCA.white, [
          [VCA.blue, below(s, 0.0, 0.02).mul(chassis)],
          [VCA.red, band(s, 0.0, 0.05, 0.01).mul(chassis)],
          [VCA.navy, noseNumber('30')],
        ]);
      }
      if (part === 'sidepod') return paint(VCA.white, [[VCA.blue, below(s, 0.1, 0.02)], [VCA.red, band(s, 0.1, 0.15, 0.01)]]);
      if (part === 'engine') return paint(VCA.white, [[VCA.blue, below(s, 0.45, 0.02).mul(below(p.z, -0.5))]]);
      return paint(VCA.blue, []);
    },
  },
  {
    id: 'astonmartin',
    logo: 'aston',
    logoHasName: true, // the logo spells out the name (garage board shows it alone)
    name: 'Aston Martin',
    car: 'AMR-V',
    number: 14,
    finish: { roughness: 0.34, metalness: 0.2, clearcoat: 0.9 },
    ui: { primary: '#00594f', secondary: '#0b2b26', accent: '#cedc00' },
    wings: {
      frontMain: AM.dark, frontFlaps: AM.green, frontTopFlap: AM.lime, frontEndplate: AM.green,
      rearMain: AM.green, rearFlap: AM.lime, rearEndplate: AM.green,
    },
    colors: { halo: AM.green, wheelCover: AM.dark, wheelRing: AM.lime, tcam: 0xffe600, mirror: AM.green },
    helmet: 0x1e5aa8,
    sponsors: slots({
      podBig: ['aramco', W], podLow: ['coinbase', W], podFront: ['valvoline', W],
      engBig: ['aston', W], engLow: ['honda', W], engFront: ['aramco', AM.lime],
      fin: ['aramco', W], nose: ['aramco', W], noseRear: ['aston', W],
      cockpitHi: ['honda', W], cockpitLo: ['valvoline', W],
      rearEpHi: ['aramco', W], rearEpLo: ['coinbase', W], rearFlap: ['aramco', AM.green],
      rearMain: ['aston', W], frontEp: ['aramco', W], frontMain: ['aramco', AM.lime],
    }, podTops('honda', -0.2, [0.2, 0.077], W)),
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        return paint(AM.green, [
          [AM.dark, below(s, -0.35, 0.02)],
          [AM.lime, band(s, -0.12, -0.06, 0.01).mul(below(p.z, 2.5))],
          [AM.white, noseNumber('14')],
        ]);
      }
      if (part === 'sidepod') return paint(AM.green, [[AM.dark, below(s, -0.2, 0.02)], [AM.lime, band(s, -0.15, -0.09, 0.01)]]);
      if (part === 'engine') return paint(AM.green, [[AM.lime, above(s, 0.94, 0.01).mul(below(p.z, -0.3))]]);
      return paint(AM.green, [[AM.lime, above(p.y, 0.9)]]);
    },
  },
  {
    id: 'haas',
    logo: 'haas',
    logoHasName: true, // the logo spells out the name (garage board shows it alone)
    name: 'Haas',
    car: 'VF-V',
    number: 31,
    finish: { roughness: 0.35, metalness: 0.05, clearcoat: 0.9 },
    ui: { primary: '#f2f2f2', secondary: '#121314', accent: '#e6002d' },
    wings: {
      frontMain: HAS.black, frontFlaps: HAS.black, frontTopFlap: HAS.red, frontEndplate: HAS.black,
      rearMain: HAS.black, rearFlap: HAS.white, rearEndplate: HAS.black,
    },
    colors: { halo: HAS.black, wheelCover: HAS.black, wheelRing: HAS.red, tcam: 0xffe600, mirror: HAS.white },
    helmet: 0xf2f2f2,
    sponsors: slots({
      podBig: ['haas'], podLow: ['moneygram', W], podFront: ['tgr', HAS.black],
      engBig: ['tgr'], engLow: ['moneygram'], engFront: ['haas'],
      fin: ['haas', W], nose: ['moneygram'], noseRear: ['haas'],
      cockpitHi: ['tgr'],
      rearEpHi: ['moneygram', W], rearEpLo: ['tgr', W], rearFlap: ['haas'],
      rearMain: ['tgr', W], frontEp: ['haas', W], frontMain: ['moneygram', W],
    }, podTops('haas', -0.2, [0.2, 0.067])),
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        return paint(HAS.white, [
          [HAS.black, below(s, -0.2, 0.02)],
          [HAS.red, band(s, -0.2, -0.14, 0.01).mul(below(p.z, 2.4))],
          [HAS.black, noseNumber('31')],
        ]);
      }
      if (part === 'sidepod') {
        // black undercut, and a red slash rising across the flank
        return paint(HAS.white, [
          [HAS.black, below(s, -0.05, 0.02)],
          [HAS.red, band(p.z.add(p.y.mul(1.4)), -0.28, -0.2).mul(sides())],
        ]);
      }
      if (part === 'engine') return paint(HAS.white, [[HAS.black, below(p.z, -1.95)], [HAS.red, band(p.z, -1.95, -1.9)]]);
      return paint(HAS.black, [[HAS.red, above(p.y, 0.9)]]);
    },
  },
  {
    id: 'audi',
    logo: 'audi',
    name: 'Audi',
    car: 'R-V',
    number: 27,
    // titanium paint: brushed-metal sheen
    finish: { roughness: 0.3, metalness: 0.5, clearcoat: 0.7 },
    ui: { primary: '#a8adb2', secondary: '#1b1c1e', accent: '#f50537' },
    wings: {
      frontMain: AUD.dark, frontFlaps: AUD.ti, frontTopFlap: AUD.red, frontEndplate: AUD.dark,
      rearMain: AUD.dark, rearFlap: AUD.red, rearEndplate: AUD.dark,
    },
    colors: { halo: AUD.dark, wheelCover: AUD.dark, wheelRing: AUD.red, tcam: 0x111111, mirror: AUD.ti },
    helmet: 0xf2f2f2,
    sponsors: slots({
      podBig: ['audi', AUD.dark], podLow: ['revolut', W], podFront: ['adidas', AUD.dark],
      engBig: ['revolut', AUD.dark], engLow: ['adidas', AUD.dark], engFront: ['audi', AUD.red],
      fin: ['audi', W], nose: ['revolut', AUD.dark], noseRear: ['audi', AUD.dark],
      cockpitHi: ['adidas', AUD.dark],
      rearEpHi: ['revolut', W], rearEpLo: ['audi', W], rearFlap: ['revolut', W],
      rearMain: ['audi', W], frontEp: ['audi', W], frontMain: ['revolut', W],
    }, podTops('revolut', -0.2, [0.22, 0.061], AUD.dark)),
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        return paint(AUD.ti, [
          [AUD.dark, below(s, -0.3, 0.02)],
          [AUD.red, above(p.z, 2.6)], // red nose tip
          [AUD.dark, noseNumber('27')],
        ]);
      }
      if (part === 'sidepod') return paint(AUD.ti, [[AUD.dark, below(s, -0.05, 0.02)], [AUD.red, band(s, -0.05, 0.01, 0.01)]]);
      if (part === 'engine') return paint(AUD.ti, [[AUD.red, above(s, 0.9, 0.01)], [AUD.dark, below(p.z, -1.7)]]);
      return paint(AUD.red, []);
    },
  },
  {
    id: 'alpine',
    logo: 'alpine',
    logoHasName: true, // the logo spells out the name (garage board shows it alone)
    name: 'Alpine',
    car: 'A-V',
    number: 10,
    finish: { roughness: 0.3, metalness: 0.12, clearcoat: 1.0 },
    ui: { primary: '#0078d7', secondary: '#0a1a3a', accent: '#ff5fa2' },
    wings: {
      frontMain: ALP.blue, frontFlaps: ALP.blue, frontTopFlap: ALP.pink, frontEndplate: ALP.pink,
      rearMain: ALP.navy, rearFlap: ALP.pink, rearEndplate: ALP.pink,
    },
    colors: { halo: ALP.blue, wheelCover: ALP.navy, wheelRing: ALP.pink, tcam: 0xffe600, mirror: ALP.blue },
    helmet: 0x0078d7,
    sponsors: slots({
      podBig: ['bwt', W], podLow: ['mercadolibre'], podFront: ['kappa', W],
      engBig: ['alpine', W], engLow: ['bwt', W], engFront: ['kappa', W],
      fin: ['alpine', W], nose: ['bwt', W], noseRear: ['alpine', W],
      cockpitHi: ['mercadolibre'], cockpitLo: ['kappa', W],
      rearEpHi: ['bwt', W], rearEpLo: ['alpine', W], rearFlap: ['bwt', W],
      rearMain: ['alpine', W], frontEp: ['bwt', W], frontMain: ['bwt', W],
    }, podTops('mercadolibre', -0.2, [0.24, 0.067])),
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        return paint(ALP.blue, [
          [ALP.navy, below(s, -0.3, 0.02)],
          [ALP.pink, above(p.z, 2.55)], // pink nose tip
          [ALP.white, noseNumber('10')],
        ]);
      }
      // blue at the front fading to pink towards the rear
      if (part === 'sidepod') return paint(ALP.blue, [[ALP.pink, below(p.z, -0.35, 0.18)], [ALP.navy, below(s, -0.2, 0.02)]]);
      if (part === 'engine') return paint(ALP.pink, [[ALP.blue, above(p.z, -0.9, 0.18)]]);
      return paint(ALP.pink, []);
    },
  },
  {
    id: 'cadillac',
    logo: 'cadillac',
    name: 'Cadillac',
    car: 'CAD-V',
    number: 11,
    finish: { roughness: 0.28, metalness: 0.1, clearcoat: 1.0 },
    ui: { primary: '#0e0e10', secondary: '#f2f2f2', accent: '#b8bcc2' },
    wings: {
      frontMain: CAD.black, frontFlaps: CAD.black, frontTopFlap: CAD.white, frontEndplate: CAD.black,
      rearMain: CAD.black, rearFlap: CAD.white, rearEndplate: CAD.black,
    },
    colors: { halo: CAD.black, wheelCover: CAD.black, wheelRing: CAD.white, tcam: 0xffe600, mirror: CAD.white },
    helmet: 0x0e0e10,
    sponsors: slots({
      podBig: ['cadillac', W], podLow: ['tommy', W], podFront: ['twg', W],
      engBig: ['cadillacText', W], engLow: ['tommy', W], engFront: ['twg', W],
      fin: ['cadillac', CAD.black], nose: ['cadillacText', CAD.black], noseRear: ['cadillac', CAD.black],
      cockpitHi: ['tommy'], cockpitLo: ['twg', W],
      rearEpHi: ['cadillacText', W], rearEpLo: ['tommy', W], rearFlap: ['cadillacText', CAD.black],
      rearMain: ['cadillac', W], frontEp: ['cadillacText', W], frontMain: ['twg', W],
    }, podTops('tommy', -0.2, [0.26, 0.054], W)),
    body(part) {
      const p = positionLocal;
      const s = around();
      if (part === 'monocoque') {
        // white nose and upper chassis, black below
        return paint(CAD.white, [
          [CAD.black, below(s, -0.1, 0.02).mul(below(p.z, 1.5, 0.03))],
          [CAD.black, noseNumber('11')],
        ]);
      }
      if (part === 'sidepod') return paint(CAD.black, [[CAD.silver, band(s, 0.3, 0.34, 0.01)]]);
      if (part === 'engine') return paint(CAD.black, [[CAD.white, above(s, 0.8, 0.02)]]);
      return paint(CAD.white, []);
    },
  },
];

/**
 * The 2026 grid, in order of the 2025 constructors' championship (Cadillac, the new
 * entry, last). This is the menu order and the garage order down the pit lane.
 */
const GRID = [
  'mclaren', 'mercedes', 'redbull', 'ferrari', 'williams', 'racingbulls',
  'astonmartin', 'haas', 'audi', 'alpine', 'cadillac',
];
export const TEAMS = GRID.map((id) => TEAM_DEFS.find((t) => t.id === id));

export const teamById = (id) => TEAMS.find((t) => t.id === id) ?? TEAMS[0];

/**
 * Each team's designated garage and pit box, counted from the pit entry: one per
 * team, in TEAMS order. Garages past the last team stay closed.
 */
export const teamGarage = (team) => TEAMS.findIndex((t) => t.id === team.id);
export const garageTeam = (k) => TEAMS[k] ?? null;

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
