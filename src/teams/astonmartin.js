// Aston Martin: livery, sponsors and car shape (see src/teams.js).
// AMR26 (2026): racing green over a black lower body, a lime pinstripe from the nose
// along the chassis and the sidepod shoulder, lime halftone on the sidepod top, black
// engine-cover spine; high, narrow, deeply undercut sidepods with a small high inlet.
import { positionLocal, abs, fract, vec2 } from 'three/tsl';
import { above, below, band, around, paint, numberMask, sides, logo, slots, W } from './livery.js';

const AM = { green: 0x006b5d, black: 0x0c0f0f, lime: 0xcde000, blue: 0x35a8e0 };

/** Pinstripe that rises from the nose along the chassis flank (its height at z). */
const stripeY = (z) => z.mul(-0.085).add(0.38); // ~0.22 at the nose tip, ~0.42 at the sidepod

export default {
  id: 'astonmartin',
  logo: 'aston',
  logoHasName: true, // the logo spells out the name (garage board shows it alone)
  name: 'Aston Martin',
  car: 'AMR-V',
  number: 14,
  // metallic racing green with a deep clearcoat
  finish: { roughness: 0.3, metalness: 0.25, clearcoat: 1.0 },
  ui: { primary: '#006b5d', secondary: '#0c0f0f', accent: '#cde000' },
  wings: {
    frontMain: AM.black, frontFlaps: AM.black, frontTopFlap: AM.green, frontEndplate: AM.green,
    rearMain: AM.blue, rearFlap: AM.black, rearEndplate: AM.green,
  },
  colors: { halo: AM.green, wheelCover: AM.black, wheelRing: AM.lime, tcam: 0xd8ea00, mirror: AM.green },
  helmet: 0x1e5aa8,
  shape: {
    // high, narrow sidepods with a small high inlet and a very deep undercut; the top
    // stays high and long before dropping into the coke-bottle
    sidepod: [
      [0.62, 0.16, 0.22, 0.585, 0.47, 0.0],
      [0.55, 0.3, 0.28, 0.575, 0.505, 0.55],
      [0.3, 0.35, 0.34, 0.545, 0.53, 0.78],
      [0.0, 0.34, 0.35, 0.525, 0.525, 0.82],
      [-0.4, 0.3, 0.33, 0.5, 0.49, 0.8],
      [-0.8, 0.23, 0.28, 0.45, 0.43, 0.7],
      [-1.15, 0.15, 0.2, 0.38, 0.37, 0.5],
      [-1.4, 0.09, 0.1, 0.3, 0.33, 0.3],
    ],
    sidepodPower: 3.8,
    sidepodInlet: { x: 0.47, y: 0.59, w: 0.12, h: 0.17, z: 0.632, power: 3.6 },
    // broad engine cover that stays full until well behind the sidepod shoulders
    engineCover: [
      [-0.16, 0.2, 0.18, 0.95],
      [-0.28, 0.27, 0.3, 0.9],
      [-0.6, 0.32, 0.42, 0.82],
      [-1.0, 0.3, 0.44, 0.73],
      [-1.4, 0.23, 0.4, 0.63],
      [-1.8, 0.15, 0.3, 0.52],
      [-2.2, 0.1, 0.22, 0.44],
      [-2.45, 0.08, 0.14, 0.38],
    ],
    // 2026 cars barely have a fin: a low blade along the spine
    fin: [[-0.9, 0.93], [-1.6, 0.89], [-2.22, 0.78], [-2.3, 0.72], [-2.2, 0.5], [-1.8, 0.62], [-1.4, 0.75], [-1.0, 0.88]],
  },
  sponsors: [
    // sidepods: aramco across the black lower flank
    logo('sidepod', 'aramco', [-0.22, 0.43], [0.62, 0.15], W),
    // engine cover flank: Valvoline, "powered by" Honda, aramco
    logo('engine', 'valvoline', [-0.78, 0.72], [0.34, 0.072], W),
    logo('engine', 'honda', [-1.2, 0.72], [0.22, 0.085], W),
    logo('engine', 'aramco', [-1.75, 0.62], [0.3, 0.075], W),
    // chassis: the Aston wings ahead of the sidepod, Valvoline on the nose, Honda H on top
    logo('monocoque', 'aston', [1.0, 0.5], [0.24, 0.08], W),
    logo('monocoque', 'valvoline', [0, 2.42], [0.15, 0.034], W, 'top'),
    logo('monocoque', 'honda', [0, 2.12], [0.1, 0.04], W, 'top'),
    // wings
    ...slots({
      rearEpHi: ['coinbase', W], rearFlap: ['valvoline', W], rearMain: ['aramco', W],
      frontEp: ['aramco', W], frontMain: ['aramco', W],
    }),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      const d = p.y.sub(stripeY(p.z));
      // number 14 in lime on the nose top, readable from in front of the car
      const num = numberMask(p.x, p.z.negate(), '14', 0, -1.6, 0.17).mul(above(s, 0.4, 0.05));
      return paint(AM.green, [
        [AM.black, below(s, -0.4, 0.03)], // carbon underside
        [AM.black, below(d, -0.012, 0.004).mul(below(s, 0.45, 0.05)).mul(below(p.z, 0.75, 0.1))], // into the black lower body
        [AM.lime, band(d, -0.012, 0.004, 0.003).mul(sides(-0.6, 0.5)).mul(below(p.z, 2.75))],
        [AM.lime, num],
        [AM.black, above(p.z, 2.86)], // carbon nose tip
      ]);
    }
    if (part === 'sidepod') {
      // black lower flank growing towards the rear, lime pinstripe on its edge
      const edge = s.sub(p.z.mul(0.25).add(0.12));
      // lime halftone on the shoulder: dots shrinking away towards the rear
      const cell = vec2(p.z.mul(70), p.x.mul(70));
      const dist = vec2(fract(cell.x).sub(0.5), fract(cell.y).sub(0.5)).length();
      const fade = band(p.z, -0.55, 0.15, 0.2);
      const dots = below(dist, fade.mul(0.42), 0.04).mul(band(s, 0.55, 0.88, 0.03)).mul(above(abs(p.x), 0.47, 0.01));
      return paint(AM.green, [
        [AM.black, below(edge, 0, 0.006)],
        [AM.lime, band(edge, 0.0, 0.03, 0.004).mul(below(p.z, 0.5))],
        [AM.lime, dots],
      ]);
    }
    if (part === 'engine') {
      return paint(AM.green, [
        [AM.black, above(s, 0.9, 0.02)], // black spine down the top of the cover
        [AM.black, below(s, -0.25, 0.03)],
        [AM.black, above(p.y, 0.95, 0.01).mul(above(p.z, -0.5, 0.02))], // airbox / roll hoop
      ]);
    }
    // fin: black blade
    return paint(AM.black, [[AM.green, below(p.y, 0.62)]]);
  },
};
