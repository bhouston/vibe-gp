// Red Bull: livery, sponsors and car shape (see src/teams.js).
// Follows the 2026 RB22: gloss heritage blue (the matte navy is gone), a yellow-to-orange
// nose tip, a yellow airbox with the giant charging bull across the engine cover, carbon
// lower flanks and black carbon wings. Downwash sidepods with a small high inlet and a
// deep undercut, a tall engine cover hump and no shark fin.
import { positionLocal, sign } from 'three/tsl';
import { above, below, band, around, paint, noseNumber, numberMask, logo } from './livery.js';

const RB = {
  blue: 0x1c2966, // gloss heritage blue
  deep: 0x121a45, // darker blue of the lower flanks
  carbon: 0x121318,
  red: 0xdb0a40,
  yellow: 0xffc400,
  orange: 0xf08a1c,
  white: 0xf2f2f2,
};

/** Side-reading number on a body flank, centred at (z, y), readable from both sides. */
const flankNumber = (text, z, y, h) => {
  const p = positionLocal;
  return numberMask(p.z.negate().add(z).mul(sign(p.x)), p.y, text, 0, y, h).mul(above(p.x.abs(), 0.02));
};

export default {
  id: 'redbull',
  logo: 'redbull', // team logo on the garage and its pit box
  logoHasName: true, // the logo spells out the name (garage board shows it alone)
  name: 'Red Bull',
  car: 'RB-V',
  number: 3,
  // the RB22 returned to a gloss finish with a slight metallic depth
  finish: { roughness: 0.4, metalness: 0.05, clearcoat: 0.35 },
  ui: { primary: '#1c2966', secondary: '#db0a40', accent: '#ffc400' },
  wings: {
    // black carbon wings; the endplates carry blue sponsor panels
    frontMain: null, frontFlaps: null, frontTopFlap: RB.blue, frontEndplate: RB.blue,
    rearMain: null, rearFlap: RB.carbon, rearEndplate: RB.blue,
  },
  colors: { halo: null, wheelCover: 0x14183a, wheelRing: RB.blue, tcam: 0x111111, mirror: RB.blue },
  helmet: 0xe9edf5,
  shape: {
    // slim nose reaching the front wing, a little higher and narrower at the tip
    monocoque: [
      [2.92, 0.07, 0.05, 0.17],
      [2.8, 0.14, 0.08, 0.18],
      [2.55, 0.2, 0.12, 0.21],
      [2.2, 0.25, 0.17, 0.26],
      [1.8, 0.3, 0.24, 0.32],
      [1.4, 0.36, 0.33, 0.37],
      [1.0, 0.46, 0.44, 0.4],
      [0.6, 0.6, 0.52, 0.41],
      [0.2, 0.7, 0.58, 0.4],
      [-0.4, 0.7, 0.58, 0.4],
      [-0.9, 0.56, 0.5, 0.39],
      [-1.4, 0.4, 0.4, 0.36],
      [-1.9, 0.28, 0.28, 0.33],
      [-2.3, 0.18, 0.18, 0.31],
      [-2.5, 0.12, 0.12, 0.31],
    ],
    // downwash pods: high, short inlet, deep undercut, top falling steeply to the floor
    sidepod: [
      [0.66, 0.18, 0.2, 0.56, 0.44, 0.0],
      [0.58, 0.32, 0.26, 0.55, 0.5, 0.45],
      [0.35, 0.36, 0.3, 0.52, 0.52, 0.7],
      [0.0, 0.36, 0.28, 0.47, 0.52, 0.72],
      [-0.4, 0.32, 0.22, 0.39, 0.49, 0.65],
      [-0.8, 0.24, 0.16, 0.3, 0.44, 0.5],
      [-1.15, 0.16, 0.12, 0.23, 0.39, 0.35],
      [-1.4, 0.1, 0.08, 0.19, 0.35, 0.2],
    ],
    sidepodInlet: { x: 0.45, y: 0.56, w: 0.17, h: 0.16, z: 0.672, power: 3.6 },
    // tall hump behind the airbox, held high and then tapering into a long tail
    engineCover: [
      [-0.16, 0.2, 0.18, 0.95],
      [-0.28, 0.28, 0.3, 0.9],
      [-0.6, 0.32, 0.44, 0.82],
      [-1.0, 0.28, 0.46, 0.74],
      [-1.4, 0.21, 0.4, 0.64],
      [-1.8, 0.15, 0.31, 0.54],
      [-2.2, 0.1, 0.22, 0.45],
      [-2.45, 0.08, 0.14, 0.38],
    ],
    fin: null,
    rearEndplate: [[-2.22, 0.84], [-2.24, 1.08], [-2.5, 1.12], [-2.72, 1.1], [-2.74, 0.78], [-2.58, 0.6], [-2.4, 0.66]],
  },
  sponsors: [
    // sidepods: Oracle along the flank
    logo('sidepod', 'oracle', [0.1, 0.45], [0.48, 0.086], RB.white),
    logo('sidepod', 'redbullText', [-0.5, 0.4], [0.32, 0.076]),
    logo('sidepod', 'hardrock', [-0.85, 0.29], [0.18, 0.04], RB.white),
    // engine cover: the giant charging bull over the airbox, Red Bull and Ford behind it
    logo('engine', 'redbull', [-0.86, 0.82], [0.74, 0.42]),
    logo('engine', 'ford', [-1.85, 0.53], [0.17, 0.077]),
    // chassis and nose: the bull on the yellow tip, Oracle and Ford by the cockpit
    logo('monocoque', 'redbull', [2.16, 0.27], [0.24, 0.137]),
    logo('monocoque', 'oracle', [1.15, 0.43], [0.32, 0.057], RB.white),
    logo('monocoque', 'ford', [1.62, 0.31], [0.12, 0.055]),
    logo('monocoque', 'ford', [0, 1.88], [0.12, 0.055], null, 'top'),
    // wings
    logo('rearEndplate', 'mobil1', [-2.48, 0.97], [0.36, 0.1], RB.white),
    logo('rearEndplate', 'oracle', [-2.5, 0.75], [0.36, 0.064], RB.white),
    logo('rearFlap', 'oracle', [0, 1.0], [0.56, 0.1], RB.white, 'rear'),
    logo('frontEndplate', 'mobil1', [2.6, 0.2], [0.3, 0.083], RB.white),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      // yellow tip shading to orange, the number in red on the nose top
      const tip = above(p.z, 2.02, 0.01);
      const tipColor = above(p.z, 2.3, 0.15);
      return paint(RB.blue, [
        [RB.deep, below(s, -0.15, 0.06).mul(below(p.z, 1.9, 0.05))],
        [RB.carbon, below(s, -0.55, 0.04).mul(below(p.z, 1.6, 0.05))],
        [RB.orange, tip],
        [RB.yellow, tip.mul(tipColor)],
        [RB.red, noseNumber('3')],
      ]);
    }
    if (part === 'sidepod') {
      // blue shoulders over a dark carbon undercut
      return paint(RB.blue, [[RB.deep, below(s, 0.1, 0.08)], [RB.carbon, below(s, -0.35, 0.05)]]);
    }
    if (part === 'engine') {
      // yellow airbox shading to orange behind the roll hoop, red race number at the back
      const box = above(p.z, -0.66, 0.08).mul(above(p.y, 0.72, 0.04));
      return paint(RB.blue, [
        [RB.carbon, below(s, -0.4, 0.05)],
        [RB.orange, box],
        [RB.yellow, box.mul(above(p.z, -0.45, 0.08))],
        [RB.red, flankNumber('3', -1.5, 0.72, 0.15)],
      ]);
    }
    return paint(RB.blue, [[RB.red, band(p.y, 0.9, 2)]]); // fin (none on this car)
  },
};
