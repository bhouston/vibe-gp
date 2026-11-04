// Haas: livery, sponsors and car shape (see src/teams.js).
// 2026 VF-26 (TGR Haas): gloss white with black undercuts and Toyota Gazoo Racing red
// slashes, a huge black HAAS on the sidepods and the GR badge across the engine cover;
// red rear wing, red-tipped black front wing.
import { positionLocal, abs } from 'three/tsl';
import { above, below, band, around, paint, noseNumber, logo } from './livery.js';

const HAS = { white: 0xf2f2f2, black: 0x121314, red: 0xe0001b };
const W = HAS.white;

// the GR badge spans the engine cover and the fin: the same decal on both lines up
const GR = (part) => logo(part, 'tgr', [-1.5, 0.82], [0.62, 0.24]);

export default {
  id: 'haas',
  logo: 'haas',
  logoHasName: true, // the logo spells out the name (garage board shows it alone)
  name: 'Haas',
  car: 'VF-V',
  number: 31,
  finish: { roughness: 0.3, metalness: 0.05, clearcoat: 0.8 },
  ui: { primary: '#f2f2f2', secondary: '#121314', accent: '#e0001b' },
  wings: {
    frontMain: HAS.black, frontFlaps: HAS.black, frontTopFlap: HAS.red, frontEndplate: HAS.red,
    rearMain: HAS.red, rearFlap: HAS.red, rearEndplate: HAS.white,
  },
  colors: { halo: HAS.white, wheelCover: HAS.black, wheelRing: HAS.red, tcam: 0x111111, mirror: HAS.black },
  helmet: 0xf2f2f2,
  shape: {
    // high, slab-sided sidepods that hold their height well back before dropping
    sidepod: [
      [0.66, 0.2, 0.3, 0.52, 0.45, 0.0],
      [0.58, 0.34, 0.35, 0.52, 0.5, 0.3],
      [0.35, 0.38, 0.37, 0.5, 0.53, 0.5],
      [0.0, 0.38, 0.36, 0.48, 0.53, 0.55],
      [-0.4, 0.35, 0.32, 0.44, 0.51, 0.55],
      [-0.8, 0.28, 0.25, 0.37, 0.46, 0.45],
      [-1.15, 0.19, 0.17, 0.28, 0.4, 0.3],
      [-1.4, 0.1, 0.1, 0.21, 0.36, 0.2],
    ],
    // small letterbox inlet high up, under the mirrors
    sidepodInlet: { x: 0.47, y: 0.55, w: 0.15, h: 0.18, z: 0.672, power: 4 },
    // tall, broad engine cover rising into a long spine
    engineCover: [
      [-0.16, 0.2, 0.18, 0.95],
      [-0.28, 0.28, 0.3, 0.9],
      [-0.6, 0.31, 0.44, 0.82],
      [-1.0, 0.27, 0.46, 0.74],
      [-1.4, 0.21, 0.4, 0.65],
      [-1.8, 0.15, 0.32, 0.55],
      [-2.2, 0.1, 0.22, 0.45],
      [-2.45, 0.08, 0.14, 0.38],
    ],
    fin: [[-0.85, 0.94], [-1.6, 0.97], [-2.2, 0.94], [-2.3, 0.86], [-2.2, 0.55], [-1.8, 0.68], [-1.4, 0.8], [-1.0, 0.9]],
  },
  sponsors: [
    // sidepods: the giant black HAAS across the flank, TGR on top
    logo('sidepod', 'haas', [-0.32, 0.43], [0.78, 0.26], HAS.black),
    logo('sidepod', 'tgr', [0.53, -0.25], [0.2, 0.077], null, 'top'),
    logo('sidepod', 'tgr', [-0.53, -0.25], [0.2, 0.077], null, 'top'),
    // engine cover + fin: the GR badge
    GR('engine'), GR('fin'),
    logo('engine', 'haas', [-0.55, 0.92], [0.22, 0.073], W),
    // nose and chassis
    logo('monocoque', 'haas', [0, 1.74], [0.17, 0.057], null, 'top'),
    logo('monocoque', 'tgr', [0, 1.98], [0.15, 0.058], null, 'top'),
    logo('monocoque', 'haas', [2.22, 0.24], [0.26, 0.087], W),
    logo('monocoque', 'tgr', [1.0, 0.48], [0.2, 0.077]),
    // wings: HAAS across the red rear wing, GR on the front wing
    logo('rearMain', 'haas', [0, -2.4], [0.6, 0.15], W, 'top'),
    logo('rearFlap', 'haas', [0, 1.02], [0.5, 0.11], W, 'rear'),
    logo('rearEndplate', 'tgr', [-2.47, 0.96], [0.3, 0.115]),
    logo('rearEndplate', 'haas', [-2.5, 0.75], [0.36, 0.12]),
    logo('frontEndplate', 'haas', [2.62, 0.2], [0.3, 0.1], W),
    logo('frontMain', 'tgr', [0.55, 2.8], [0.3, 0.115], W, 'top'),
    logo('frontMain', 'tgr', [-0.55, 2.8], [0.3, 0.115], W, 'top'),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      const nose = above(p.z, 1.15, 0.05);
      // black chevron on the chassis top ahead of the cockpit, outlined in red
      const v = abs(p.x).sub(p.z.negate().add(1.12).mul(0.42));
      const top = above(s, 0.55).mul(band(p.z, 0.62, 1.12));
      return paint(HAS.white, [
        [HAS.black, below(s, -0.35)],
        [HAS.black, below(s, -0.12).mul(nose)], // dark lower nose
        [HAS.red, band(s, -0.12, -0.02).mul(nose)], // red line along its top edge
        [HAS.red, below(v, 0.03).mul(top)],
        [HAS.black, below(v, 0).mul(top)],
        // red flash on the chassis flank ahead of the sidepod
        [HAS.red, band(p.y.sub(p.z.mul(0.12)), 0.5, 0.535).mul(band(p.z, 0.62, 1.25)).mul(below(s, 0.6))],
        [HAS.black, noseNumber('31', 1.45)],
      ]);
    }
    if (part === 'sidepod') {
      // black undercut rising towards the rear; red slash along the shoulder
      const cut = p.y.sub(p.z.negate().mul(0.07).add(0.33));
      return paint(HAS.white, [
        [HAS.black, below(cut, 0, 0.01)],
        [HAS.black, below(s, -0.3)],
        [HAS.red, band(s, 0.5, 0.7, 0.03).mul(band(p.z, -1.25, 0.3, 0.05))],
      ]);
    }
    if (part === 'engine') {
      // red airbox top; red stripe sweeping back along the lower flank; black at the rear
      const stripe = p.y.sub(p.z.negate().mul(-0.03).add(0.62));
      return paint(HAS.white, [
        [HAS.red, above(p.y, 0.97).mul(above(p.z, -0.55))],
        [HAS.red, band(stripe, -0.02, 0.05).mul(band(p.z, -1.45, -0.1))],
        [HAS.black, below(p.y, 0.47).mul(below(p.z, -1.7))],
      ]);
    }
    return paint(HAS.white, []); // fin
  },
};
