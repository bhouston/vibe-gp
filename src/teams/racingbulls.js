// Racing Bulls: livery, sponsors and car shape (see src/teams.js).
// Follows the 2026 VCARB 03: gloss white body with blue accents tracing the chassis and a
// blue swoosh dropping across the sidepods, the Red Bull family yellow-orange nose tip and
// yellow airbox with the charging bull, carbon lower flanks and black carbon wings.
import { positionLocal, sign } from 'three/tsl';
import { above, below, band, around, paint, noseNumber, numberMask, logo } from './livery.js';

const VCA = {
  white: 0xf2f4f8,
  blue: 0x22309a, // the swoosh: a Ford-like royal blue
  navy: 0x141c5c,
  carbon: 0x121318,
  red: 0xdb0a40,
  yellow: 0xffc400,
  orange: 0xf08a1c,
};

/** Side-reading number on a body flank, centred at (z, y), readable from both sides. */
const flankNumber = (text, z, y, h) => {
  const p = positionLocal;
  return numberMask(p.z.negate().add(z).mul(sign(p.x)), p.y, text, 0, y, h).mul(above(p.x.abs(), 0.02));
};

export default {
  id: 'racingbulls',
  logo: 'racingbulls',
  logoHasName: true, // the logo spells out the name (garage board shows it alone)
  name: 'Racing Bulls',
  car: 'VCARB-V',
  number: 30,
  finish: { roughness: 0.3, metalness: 0.05, clearcoat: 0.8 },
  ui: { primary: '#f2f4f8', secondary: '#22309a', accent: '#db0a40' },
  wings: {
    frontMain: null, frontFlaps: null, frontTopFlap: VCA.white, frontEndplate: VCA.white,
    rearMain: null, rearFlap: VCA.carbon, rearEndplate: VCA.carbon,
  },
  colors: { halo: null, wheelCover: VCA.white, wheelRing: VCA.blue, tcam: 0xd8ff1a, mirror: VCA.carbon },
  helmet: 0x1c3fd0,
  shape: {
    // slim nose like its sister car
    monocoque: [
      [2.92, 0.07, 0.05, 0.17],
      [2.8, 0.14, 0.08, 0.18],
      [2.55, 0.2, 0.12, 0.21],
      [2.2, 0.26, 0.17, 0.26],
      [1.8, 0.31, 0.24, 0.32],
      [1.4, 0.37, 0.33, 0.37],
      [1.0, 0.47, 0.44, 0.4],
      [0.6, 0.6, 0.52, 0.41],
      [0.2, 0.7, 0.58, 0.4],
      [-0.4, 0.7, 0.58, 0.4],
      [-0.9, 0.58, 0.5, 0.39],
      [-1.4, 0.42, 0.4, 0.36],
      [-1.9, 0.28, 0.28, 0.33],
      [-2.3, 0.18, 0.18, 0.31],
      [-2.5, 0.12, 0.12, 0.31],
    ],
    // downwash pods with a fuller shoulder than the RB22 and a deep undercut
    sidepod: [
      [0.66, 0.2, 0.24, 0.55, 0.45, 0.0],
      [0.58, 0.34, 0.3, 0.54, 0.5, 0.4],
      [0.35, 0.38, 0.34, 0.51, 0.53, 0.62],
      [0.0, 0.38, 0.32, 0.47, 0.53, 0.66],
      [-0.4, 0.34, 0.25, 0.4, 0.5, 0.6],
      [-0.8, 0.26, 0.18, 0.31, 0.45, 0.48],
      [-1.15, 0.17, 0.13, 0.24, 0.4, 0.34],
      [-1.4, 0.1, 0.08, 0.19, 0.36, 0.2],
    ],
    sidepodInlet: { x: 0.45, y: 0.55, w: 0.17, h: 0.2, z: 0.672, power: 3.4 },
    engineCover: [
      [-0.16, 0.2, 0.18, 0.95],
      [-0.28, 0.28, 0.3, 0.9],
      [-0.6, 0.32, 0.44, 0.82],
      [-1.0, 0.28, 0.45, 0.74],
      [-1.4, 0.21, 0.39, 0.64],
      [-1.8, 0.15, 0.31, 0.54],
      [-2.2, 0.1, 0.22, 0.45],
      [-2.45, 0.08, 0.14, 0.38],
    ],
    fin: null,
    rearEndplate: [[-2.22, 0.84], [-2.24, 1.08], [-2.5, 1.12], [-2.72, 1.1], [-2.74, 0.78], [-2.58, 0.6], [-2.4, 0.66]],
  },
  sponsors: [
    // sidepods: the big Visa on the white
    logo('sidepod', 'visa', [-0.12, 0.42], [0.4, 0.15]),
    logo('sidepod', 'ford', [-0.82, 0.33], [0.13, 0.06]),
    // engine cover: the charging bull over the airbox with Red Bull under it
    logo('engine', 'redbull', [-0.86, 0.83], [0.66, 0.38]),
    // chassis and nose
    logo('monocoque', 'redbull', [2.16, 0.27], [0.22, 0.126]),
    logo('monocoque', 'visa', [1.78, 0.33], [0.13, 0.05], VCA.navy),
    logo('monocoque', 'cashapp', [0.98, 0.46], [0.24, 0.063]),
    logo('monocoque', 'mobil1', [1.18, 0.33], [0.2, 0.056], VCA.white),
    // wings
    logo('rearEndplate', 'visa', [-2.48, 0.98], [0.22, 0.085], VCA.white),
    logo('rearEndplate', 'racingbulls', [-2.48, 0.78], [0.24, 0.137], VCA.white),
    logo('rearFlap', 'cashapp', [0, 1.0], [0.46, 0.12], VCA.white, 'rear'),
    logo('frontEndplate', 'cashapp', [2.6, 0.2], [0.3, 0.079]),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      // white top with a blue line tracing the chassis shoulder, carbon below it,
      // and the family yellow-to-orange nose tip
      const chassis = below(p.z, 2.0, 0.02);
      const tip = above(p.z, 2.02, 0.01);
      return paint(VCA.white, [
        [VCA.carbon, below(s, -0.05, 0.03).mul(chassis)],
        [VCA.blue, band(s, -0.05, 0.12, 0.02).mul(chassis)],
        [VCA.orange, tip],
        [VCA.yellow, tip.mul(above(p.z, 2.3, 0.15))],
        [VCA.navy, noseNumber('30')],
      ]);
    }
    if (part === 'sidepod') {
      // blue swoosh dropping from the inboard shoulder at the inlet to the lower rear,
      // white flank under it for the Visa, carbon undercut
      const edge = p.z.mul(0.5).add(0.3); // swoosh lower edge in around() units
      return paint(VCA.white, [
        [VCA.blue, above(s, edge, 0.03).mul(below(p.z, 0.5, 0.05))],
        [VCA.navy, above(s, edge, 0.03).mul(below(s, edge.add(0.06), 0.02))],
        [VCA.carbon, below(s, -0.4, 0.04)],
      ]);
    }
    if (part === 'engine') {
      // yellow airbox under the bull, blue lower flank at the rear, red number
      const box = above(p.z, -0.66, 0.08).mul(above(p.y, 0.76, 0.04));
      return paint(VCA.white, [
        [VCA.blue, below(s, 0.05, 0.03).mul(below(p.z, -1.05, 0.06))],
        [VCA.carbon, below(s, -0.45, 0.04)],
        [VCA.orange, box],
        [VCA.yellow, box.mul(above(p.z, -0.45, 0.08))],
        [VCA.red, flankNumber('30', -1.4, 0.74, 0.12)],
      ]);
    }
    return paint(VCA.white, []); // fin (none on this car)
  },
};
