// Mercedes: livery, sponsors and car shape (see src/teams.js).
// W17 (2026): a mostly gloss-black car with a silver spine along the top of the nose and
// chassis, a Petronas-teal pinstripe and swoosh along the flanks, silver "rhombus"
// chevrons on the sidepod tops and engine cover, and a teal 63 on the fin.
import { positionLocal, normalLocal, fract, abs, sign } from 'three/tsl';
import { above, below, band, around, paint, noseNumber, numberMask, logo } from './livery.js';

const MER = { silver: 0xb9bec4, black: 0x0f1012, teal: 0x00c9b0, white: 0xf4f4f4 };

/** Diagonal stripes: 1 on the stripes. `k` stripes per metre along z, `slant` x-shear. */
const stripes = (p, k, slant, duty) => below(abs(fract(p.z.mul(k).add(abs(p.x).mul(slant))).sub(0.5)), duty * 0.5, 0.02);

export default {
  id: 'mercedes',
  logo: 'mercedes',
  name: 'Mercedes',
  car: 'W-V',
  number: 63,
  // gloss black with metallic silver: shiny clear coat, a little metal flake
  finish: { roughness: 0.28, metalness: 0.12, clearcoat: 0.6 },
  ui: { primary: '#b9bec4', secondary: '#0f1012', accent: '#00c9b0' },
  wings: {
    frontMain: MER.black, frontFlaps: MER.black, frontTopFlap: MER.black, frontEndplate: MER.black,
    rearMain: MER.black, rearFlap: MER.black, rearEndplate: MER.black,
  },
  colors: { halo: MER.black, wheelCover: MER.black, wheelRing: MER.teal, tcam: 0xffe600, mirror: MER.black },
  helmet: 0xf2f2f2,
  shape: {
    // slimmer, pointier nose than the default
    monocoque: [
      [2.92, 0.07, 0.05, 0.165],
      [2.8, 0.14, 0.08, 0.175],
      [2.55, 0.2, 0.115, 0.205],
      [2.2, 0.25, 0.165, 0.25],
      [1.8, 0.3, 0.235, 0.31],
      [1.4, 0.36, 0.33, 0.36],
      [1.0, 0.47, 0.44, 0.39],
      [0.6, 0.6, 0.52, 0.41],
      [0.2, 0.68, 0.58, 0.4],
      [-0.4, 0.68, 0.56, 0.4],
      [-0.9, 0.56, 0.5, 0.39],
      [-1.4, 0.4, 0.4, 0.36],
      [-1.9, 0.28, 0.3, 0.33],
      [-2.3, 0.19, 0.2, 0.31],
      [-2.5, 0.13, 0.13, 0.31],
    ],
    // tall, narrow inlet; the top ramps down hard behind the cockpit over a deep undercut
    sidepod: [
      [0.66, 0.18, 0.3, 0.52, 0.45, 0.0],
      [0.58, 0.31, 0.34, 0.52, 0.5, 0.35],
      [0.35, 0.35, 0.35, 0.5, 0.52, 0.6],
      [0.0, 0.35, 0.3, 0.45, 0.52, 0.65],
      [-0.4, 0.31, 0.22, 0.37, 0.49, 0.6],
      [-0.8, 0.24, 0.17, 0.3, 0.44, 0.45],
      [-1.15, 0.17, 0.13, 0.24, 0.4, 0.3],
      [-1.4, 0.1, 0.09, 0.2, 0.36, 0.2],
    ],
    sidepodInlet: { x: 0.45, y: 0.52, w: 0.13, h: 0.26, z: 0.672, power: 3.2 },
    // slim engine cover
    engineCover: [
      [-0.16, 0.19, 0.18, 0.95],
      [-0.28, 0.25, 0.3, 0.9],
      [-0.6, 0.27, 0.42, 0.82],
      [-1.0, 0.23, 0.43, 0.72],
      [-1.4, 0.18, 0.37, 0.62],
      [-1.8, 0.13, 0.29, 0.52],
      [-2.2, 0.09, 0.22, 0.44],
      [-2.45, 0.07, 0.14, 0.38],
    ],
  },
  sponsors: [
    // sidepod: big white PETRONAS below the teal swoosh, AMG by the inlet
    logo('sidepod', 'petronas', [-0.12, 0.39], [0.46, 0.08], MER.white),
    logo('sidepod', 'amg', [0.42, 0.62], [0.14, 0.035], MER.white),
    // airbox flank: Microsoft in colour; CrowdStrike on the cover behind it
    logo('engine', 'microsoft', [-0.42, 0.93], [0.26, 0.06]),
    logo('engine', 'crowdstrike', [-1.2, 0.72], [0.3, 0.05], MER.white),
    logo('engine', 'mercedes', [-1.75, 0.57], [0.14, 0.12], MER.silver),
    // nose: INEOS down the side, the star on the tip, Petronas drop on top
    logo('monocoque', 'ineos', [2.05, 0.27], [0.3, 0.06], MER.white),
    logo('monocoque', 'mercedes', [0, 2.62], [0.09, 0.09], MER.black, 'top'),
    logo('monocoque', 'petronas', [0, 2.15], [0.2, 0.05], MER.teal, 'top'),
    logo('monocoque', 'crowdstrike', [0, 1.25], [0.24, 0.045], MER.black, 'top'),
    logo('monocoque', 'ubs', [0.95, 0.36], [0.2, 0.05], MER.white),
    // wings: PETRONAS across the rear wing, Microsoft on the front endplates
    logo('rearFlap', 'petronas', [0, 1.0], [0.56, 0.1], MER.white, 'rear'),
    logo('rearMain', 'petronas', [0, -2.4], [0.5, 0.11], MER.white, 'top'),
    logo('rearEndplate', 'crowdstrike', [-2.47, 0.96], [0.4, 0.07], MER.white),
    logo('rearEndplate', 'petronas', [-2.5, 0.76], [0.3, 0.07], MER.teal),
    logo('frontEndplate', 'microsoft', [2.62, 0.2], [0.3, 0.07], MER.white),
    logo('frontMain', 'petronas', [0, 2.8], [0.5, 0.08], MER.white, 'top'),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      // silver spine from the nose tip to the cockpit, edged in teal, black flanks
      const spine = above(s, 0.62, 0.03).mul(above(p.z, 0.35, 0.05));
      const pin = band(s, 0.5, 0.6, 0.01).mul(above(p.z, 0.2, 0.05)).mul(below(p.z, 2.75, 0.02));
      return paint(MER.black, [
        [MER.silver, spine],
        [MER.silver, above(p.z, 2.72, 0.02).mul(above(s, 0.2, 0.05))], // silver tip
        [MER.teal, pin],
        [MER.black, noseNumber('63').mul(0.85)],
      ]);
    }
    if (part === 'sidepod') {
      // teal swoosh along the shoulder, silver chevrons over the top towards the rear
      const top = above(s, 0.45, 0.04);
      const chev = stripes(p, 6, 1.4, 0.45).mul(top).mul(band(p.z, -0.6, 0.15, 0.04));
      const swoosh = band(s, 0.2, 0.32, 0.01).mul(below(p.z, 0.55, 0.05));
      return paint(MER.black, [[MER.silver, chev], [MER.teal, swoosh]]);
    }
    if (part === 'engine') {
      // silver rhombus chevrons fanning back from the airbox, teal line along the base
      const chev = below(abs(fract(p.z.add(p.y.mul(0.9)).mul(7)).sub(0.5)), 0.2, 0.02).mul(band(p.z, -1.15, -0.45, 0.04)).mul(band(s, -0.1, 0.7, 0.05));
      const line = band(s, -0.3, -0.18, 0.01).mul(below(p.z, -0.35, 0.05));
      return paint(MER.black, [[MER.silver, chev], [MER.teal, line]]);
    }
    // fin: teal 63, readable on both sides
    const sx = sign(normalLocal.x);
    const num = numberMask(p.z.add(1.95).mul(sx).negate(), p.y, '63', 0, 0.8, 0.16);
    return paint(MER.black, [[MER.teal, num], [MER.teal, above(p.y, 0.945, 0.004)]]);
  },
};
