// McLaren MCL40 (2026): livery, sponsors and car shape (see src/teams.js).
// Papaya with anthracite diagonals: a black band sweeps from the engine-cover top down and
// forward across the sidepod (OKX, Mastercard), papaya ahead of it round the cockpit and
// behind it over the rear of the cover; a teal-green airbox top.
import { positionLocal } from 'three/tsl';
import { above, below, around, paint, noseNumber, logo } from './livery.js';

const MCL = { papaya: 0xff8000, black: 0x18191c, teal: 0x0f4a46, white: 0xf4f4f4 };

// The two diagonal edges of the black band, as seen from the side (y as a function of z).
// Black lies above edge A (rear) and below edge B (front).
const edgeA = (z) => z.add(0.93).mul(-0.78).add(0.75);
const edgeB = (z) => z.add(0.38).mul(-0.61).add(0.8);
const blackBand = (p) => above(p.y, edgeA(p.z), 0.008).mul(below(p.y, edgeB(p.z), 0.008));

export default {
  id: 'mclaren',
  logo: 'mclaren', // team logo on the garage and its pit box
  logoHasName: true, // the logo spells out the name (garage board shows it alone)
  name: 'McLaren',
  car: 'MCL-V',
  number: 1,
  finish: { roughness: 0.3, metalness: 0.1, clearcoat: 0.9 },
  ui: { primary: '#ff8000', secondary: '#18191c', accent: '#ffb15c' },
  shape: {
    // the cover stays high to the rear wing, then drops away to the gearbox
    engineCover: [
      [-0.16, 0.2, 0.18, 0.95],
      [-0.28, 0.27, 0.3, 0.9],
      [-0.6, 0.3, 0.42, 0.82],
      [-1.0, 0.26, 0.44, 0.74],
      [-1.4, 0.2, 0.4, 0.68],
      [-1.62, 0.15, 0.34, 0.64],
      [-1.85, 0.11, 0.24, 0.52],
      [-2.2, 0.09, 0.18, 0.44],
      [-2.45, 0.08, 0.14, 0.38],
    ],
    fin: null, // no shark fin on the 2026 car
  },
  wings: {
    frontMain: MCL.black, frontFlaps: MCL.black, frontTopFlap: MCL.papaya, frontEndplate: MCL.black,
    rearMain: MCL.papaya, rearFlap: MCL.papaya, rearEndplate: MCL.papaya,
  },
  colors: { halo: MCL.black, wheelCover: MCL.black, wheelRing: 0x3f8fe6, tcam: 0xc8f000, mirror: MCL.black },
  helmet: 0x2b6b5e,
  sponsors: [
    // sidepod: VELO on the papaya shoulder, OKX on the black band, Mastercard at its tip
    logo('sidepod', 'velo', [0.36, 0.55], [0.26, 0.075], MCL.black),
    logo('sidepod', 'okx', [0.0, 0.44], [0.24, 0.075], MCL.white),
    logo('sidepod', 'mastercard', [-0.32, 0.36], [0.13, 0.08]),
    // engine cover: Gemini (Google) big on the black, Dell on the papaya below
    logo('engine', 'google', [-0.66, 0.78], [0.46, 0.11], MCL.white),
    logo('engine', 'dell', [-1.1, 0.58], [0.2, 0.06], MCL.black),
    // nose top: Dell ahead of the number, Hilton behind it
    logo('monocoque', 'dell', [0, 1.9], [0.2, 0.06], MCL.black, 'top'),
    logo('monocoque', 'hilton', [0, 1.28], [0.2, 0.07], MCL.black, 'top'),
    // wings: OKX across the rear wing, McLaren on the endplates, Mastercard on the front flaps
    logo('rearEndplate', 'mclaren', [-2.45, 0.98], [0.36, 0.08], MCL.black),
    logo('rearFlap', 'okx', [0, 1.0], [0.36, 0.11], MCL.black, 'rear'),
    logo('rearMain', 'okx', [0, -2.4], [0.5, 0.15], MCL.black, 'top'),
    ...[-1, 1].map((s) => logo('frontMain', 'mastercard', [0.45 * s, 2.8], [0.13, 0.08], null, 'top')),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      // papaya, anthracite underside and lower flanks; the black band carries on under
      // the sidepods
      return paint(MCL.papaya, [
        [MCL.black, below(s, -0.15, 0.03)],
        [MCL.black, below(p.y, 0.34, 0.01).mul(below(p.z, 1.3, 0.05))],
        [MCL.black, blackBand(p).mul(below(p.z, 0.5))],
        [MCL.black, noseNumber('1', 1.58)],
      ]);
    }
    if (part === 'sidepod') {
      // papaya, the diagonal black band, and a black undercut towards the floor
      const floorCut = p.z.add(0.3).mul(0.15).add(0.3);
      return paint(MCL.papaya, [[MCL.black, blackBand(p)], [MCL.black, below(p.y, floorCut, 0.01)]]);
    }
    if (part === 'engine') {
      // band continues up over the cover; teal airbox top
      return paint(MCL.papaya, [
        [MCL.black, blackBand(p)],
        [MCL.teal, above(p.y, 0.97, 0.01).mul(above(p.z, -0.95, 0.03))],
      ]);
    }
    return paint(MCL.papaya, []);
  },
};
