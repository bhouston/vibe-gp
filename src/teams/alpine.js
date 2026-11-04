// Alpine: livery, sponsors and car shape (see src/teams.js).
// A526 (2026): gloss French blue with a hot-pink top to the nose and chassis that fades
// into blue down the flanks, a pink halo, big pink BWT on the sidepods, dark carbon
// undersides, and pink front-wing flaps, rear wing and rear endplates.
import { positionLocal } from 'three/tsl';
import { above, below, band, around, paint, noseNumber, logo, podTops } from './livery.js';

const ALP = { blue: 0x0a4fd0, light: 0x1f8cff, navy: 0x0b1530, pink: 0xff4fb4, white: 0xf4f4f4, dark: 0x111318 };

export default {
  id: 'alpine',
  logo: 'alpine',
  logoHasName: true, // the logo spells out the name (garage board shows it alone)
  name: 'Alpine',
  car: 'A-V',
  number: 10,
  finish: { roughness: 0.26, metalness: 0.15, clearcoat: 0.8 },
  ui: { primary: '#0a4fd0', secondary: '#0b1530', accent: '#ff4fb4' },
  wings: {
    frontMain: ALP.dark, frontFlaps: ALP.pink, frontTopFlap: ALP.pink, frontEndplate: ALP.dark,
    rearMain: ALP.pink, rearFlap: ALP.pink, rearEndplate: ALP.pink,
  },
  colors: { halo: ALP.pink, wheelCover: ALP.navy, wheelRing: ALP.pink, tcam: 0x111318, mirror: ALP.blue },
  helmet: 0x0a4fd0,
  shape: {
    // broad, blunt nose running right out to the mainplane
    monocoque: [
      [2.94, 0.12, 0.06, 0.16],
      [2.8, 0.19, 0.09, 0.17],
      [2.55, 0.24, 0.125, 0.2],
      [2.2, 0.28, 0.17, 0.25],
      [1.8, 0.32, 0.24, 0.31],
      [1.4, 0.38, 0.33, 0.36],
      [1.0, 0.47, 0.44, 0.39],
      [0.6, 0.6, 0.52, 0.41],
      [0.2, 0.7, 0.58, 0.4],
      [-0.4, 0.72, 0.58, 0.4],
      [-0.9, 0.6, 0.52, 0.39],
      [-1.4, 0.44, 0.42, 0.36],
      [-1.9, 0.3, 0.3, 0.33],
      [-2.3, 0.2, 0.2, 0.31],
      [-2.5, 0.14, 0.13, 0.31],
    ],
    monocoquePower: 3.6,
    // boxy, high-shouldered sidepods that hold their height further back before dropping
    sidepod: [
      [0.66, 0.24, 0.3, 0.5, 0.46, 0.0],
      [0.58, 0.36, 0.34, 0.5, 0.51, 0.3],
      [0.35, 0.39, 0.36, 0.49, 0.53, 0.5],
      [0.0, 0.39, 0.35, 0.47, 0.53, 0.55],
      [-0.4, 0.36, 0.31, 0.43, 0.51, 0.5],
      [-0.8, 0.28, 0.24, 0.36, 0.46, 0.4],
      [-1.15, 0.19, 0.17, 0.28, 0.4, 0.3],
      [-1.4, 0.1, 0.1, 0.21, 0.36, 0.2],
    ],
    sidepodPower: 4,
    // wide letterbox inlet
    sidepodInlet: { x: 0.46, y: 0.5, w: 0.2, h: 0.24, z: 0.672, power: 4 },
  },
  sponsors: [
    // sidepods: big pink BWT, Alpine on top
    logo('sidepod', 'bwt', [-0.22, 0.43], [0.56, 0.2], ALP.pink),
    logo('sidepod', 'alpine', [0.42, 0.6], [0.18, 0.04], ALP.white),
    ...podTops('alpine', -0.25, [0.24, 0.06], ALP.white),
    // engine cover
    logo('engine', 'alpine', [-1.0, 0.76], [0.4, 0.09], ALP.white),
    logo('engine', 'castore', [-0.5, 0.94], [0.24, 0.05], ALP.white),
    logo('engine', 'bwt', [-1.72, 0.56], [0.3, 0.07], ALP.pink),
    logo('fin', 'bwt', [-1.7, 0.84], [0.36, 0.09], ALP.white),
    // chassis and nose: BWT in navy on the pink nose top, Castore by the cockpit
    logo('monocoque', 'bwt', [0, 2.15], [0.16, 0.06], ALP.navy, 'top'),
    logo('monocoque', 'alpine', [2.3, 0.22], [0.28, 0.06], ALP.white),
    logo('monocoque', 'castore', [0.95, 0.36], [0.2, 0.05], ALP.white),
    // wings: navy BWT on the pink rear wing, BWT on the front
    logo('rearEndplate', 'bwt', [-2.47, 0.96], [0.36, 0.1], ALP.navy),
    logo('rearEndplate', 'alpine', [-2.5, 0.75], [0.3, 0.06], ALP.white),
    logo('rearFlap', 'bwt', [0, 1.0], [0.52, 0.1], ALP.navy, 'rear'),
    logo('rearMain', 'bwt', [0, -2.4], [0.5, 0.13], ALP.navy, 'top'),
    logo('frontEndplate', 'alpine', [2.62, 0.2], [0.3, 0.06], ALP.white),
    logo('frontMain', 'bwt', [0, 2.8], [0.5, 0.11], ALP.pink, 'top'),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      // pink over the top from just behind the tip to the cockpit, fading into blue down
      // the flanks; blue tip, bright blue sides, dark underside
      const top = above(s, 0.2, 0.18).mul(above(p.z, 0.45, 0.06)).mul(below(p.z, 2.62, 0.04));
      return paint(ALP.blue, [
        [ALP.light, band(s, -0.35, 0.25, 0.15).mul(above(p.z, 0.6, 0.1))],
        [ALP.dark, below(s, -0.55, 0.05)],
        [ALP.pink, top],
        [ALP.navy, noseNumber('10')],
      ]);
    }
    if (part === 'sidepod') {
      // blue with a pink flash on the shoulder by the inlet, dark carbon undercut
      return paint(ALP.blue, [
        [ALP.dark, below(s, -0.25, 0.04)],
        [ALP.pink, band(s, 0.25, 0.6, 0.02).mul(above(p.z, 0.42, 0.03))],
      ]);
    }
    if (part === 'engine') {
      // blue cover; pink at the tail where it meets the rear wing
      return paint(ALP.blue, [[ALP.pink, below(p.z, -1.95, 0.05)], [ALP.dark, below(s, -0.5, 0.04)]]);
    }
    return paint(ALP.blue, [[ALP.pink, above(p.y, 0.88, 0.006)]]); // fin
  },
};
