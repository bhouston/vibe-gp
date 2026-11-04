// Ferrari: livery, sponsors and car shape (see src/teams.js).
// 2026 SF-26: gloss red with a white cockpit surround and engine-cover top (a nod to the
// 312T), outlined by a thin white pinstripe; bare carbon wings, floor and undercut.
import { positionLocal, sign } from 'three/tsl';
import { above, below, band, around, paint, noseNumber, numberMask, logo } from './livery.js';

const SF = { red: 0xd40018, white: 0xf4f4f2, black: 0x141414 };

export default {
  id: 'ferrari',
  logo: 'ferrari', // team logo on the garage and its pit box
  name: 'Ferrari',
  car: 'SF-V',
  number: 16,
  // back to a gloss finish for 2026
  finish: { roughness: 0.28, metalness: 0.05, clearcoat: 0.7 },
  ui: { primary: '#d40018', secondary: '#f4f4f2', accent: '#141414' },
  // wings and halo are bare carbon
  wings: {
    frontMain: null, frontFlaps: null, frontTopFlap: null, frontEndplate: null,
    rearMain: null, rearFlap: null, rearEndplate: null,
  },
  colors: { halo: null, wheelCover: SF.black, wheelRing: SF.red, tcam: 0x111111, mirror: SF.red },
  helmet: 0xf2f2f2,
  shape: {
    // slim, long, low nose; full shoulders around the cockpit
    monocoque: [
      [2.92, 0.07, 0.05, 0.15],
      [2.8, 0.14, 0.075, 0.16],
      [2.55, 0.2, 0.11, 0.19],
      [2.2, 0.25, 0.16, 0.24],
      [1.8, 0.3, 0.23, 0.3],
      [1.4, 0.36, 0.32, 0.35],
      [1.0, 0.46, 0.43, 0.385],
      [0.6, 0.6, 0.52, 0.41],
      [0.2, 0.7, 0.58, 0.4],
      [-0.4, 0.72, 0.58, 0.4],
      [-0.9, 0.6, 0.52, 0.39],
      [-1.4, 0.44, 0.42, 0.36],
      [-1.9, 0.3, 0.3, 0.33],
      [-2.3, 0.2, 0.2, 0.31],
      [-2.5, 0.14, 0.13, 0.31],
    ],
    // wide shoulders up front, deep undercut and a steep downwash ramp to the floor
    sidepod: [
      [0.66, 0.2, 0.3, 0.52, 0.45, 0.0],
      [0.58, 0.36, 0.34, 0.52, 0.51, 0.35],
      [0.35, 0.4, 0.36, 0.5, 0.54, 0.6],
      [0.0, 0.39, 0.32, 0.46, 0.54, 0.65],
      [-0.4, 0.34, 0.25, 0.39, 0.5, 0.6],
      [-0.8, 0.25, 0.18, 0.31, 0.45, 0.45],
      [-1.15, 0.17, 0.13, 0.25, 0.4, 0.3],
      [-1.4, 0.1, 0.09, 0.21, 0.36, 0.2],
    ],
    sidepodInlet: { x: 0.46, y: 0.53, w: 0.17, h: 0.22, z: 0.672, power: 4 },
    // tall engine cover that holds its height back to the rear axle
    engineCover: [
      [-0.16, 0.2, 0.18, 0.95],
      [-0.28, 0.28, 0.3, 0.9],
      [-0.6, 0.31, 0.43, 0.82],
      [-1.0, 0.27, 0.46, 0.73],
      [-1.4, 0.21, 0.4, 0.64],
      [-1.8, 0.15, 0.31, 0.53],
      [-2.2, 0.1, 0.22, 0.44],
      [-2.45, 0.08, 0.14, 0.38],
    ],
    // small fin stepping down off the engine cover
    fin: [[-1.3, 0.87], [-1.75, 0.9], [-2.1, 0.86], [-2.25, 0.79], [-2.22, 0.58], [-1.95, 0.66], [-1.6, 0.77], [-1.35, 0.83]],
  },
  sponsors: [
    // engine cover: HP on the white panel, UniCredit low on the red behind it
    logo('engine', 'hp', [-0.92, 0.84], [0.19, 0.19]),
    logo('engine', 'hp', [0, -0.95], [0.16, 0.16], null, 'top'),
    logo('engine', 'unicredit', [-1.48, 0.58], [0.34, 0.072], SF.white),
    logo('engine', 'ibm', [-0.42, 0.7], [0.13, 0.055], SF.black),
    // sidepods: the Shell pecten, IBM on the shoulders
    logo('sidepod', 'shell', [-0.18, 0.43], [0.16, 0.15]),
    logo('sidepod', 'puma', [0.3, 0.55], [0.13, 0.04], SF.white),
    logo('sidepod', 'ibm', [0.53, 0.1], [0.12, 0.05], SF.white, 'top'),
    logo('sidepod', 'ibm', [-0.53, 0.1], [0.12, 0.05], SF.white, 'top'),
    // chassis side: prancing horse shield and Richard Mille ahead of the sidepod
    logo('monocoque', 'ferrari', [1.32, 0.42], [0.07, 0.097]),
    logo('monocoque', 'richardmille', [0.95, 0.44], [0.3, 0.04], SF.white),
    logo('monocoque', 'unicredit', [2.2, 0.25], [0.3, 0.064], SF.white),
    // nose top, cockpit to tip: Bitdefender, (16), Shell, IBM, UniCredit, shield
    logo('monocoque', 'bitdefender', [0, 1.14], [0.26, 0.05], SF.white, 'top'),
    logo('monocoque', 'shell', [0, 1.76], [0.13, 0.122], null, 'top'),
    logo('monocoque', 'ibm', [0, 1.97], [0.13, 0.054], SF.white, 'top'),
    logo('monocoque', 'unicredit', [0, 2.28], [0.18, 0.04], SF.white, 'top'),
    logo('monocoque', 'ferrari', [0, 2.62], [0.05, 0.07], null, 'top'),
    // wings: HP on the rear wing, Ray-Ban and HP on the front wing
    logo('rearMain', 'hp', [0.38, -2.4], [0.12, 0.12], null, 'top'),
    logo('rearMain', 'hp', [-0.38, -2.4], [0.12, 0.12], null, 'top'),
    logo('rearEndplate', 'shellText', [-2.47, 0.98], [0.3, 0.094], SF.white),
    logo('rearEndplate', 'santander', [-2.5, 0.78], [0.36, 0.078], SF.white),
    logo('rearFlap', 'hp', [0, 1.02], [0.1, 0.1], null, 'rear'),
    logo('frontEndplate', 'rayban', [2.62, 0.19], [0.28, 0.1], SF.white),
    logo('frontMain', 'rayban', [0.55, 2.8], [0.24, 0.086], SF.white, 'top'),
    logo('frontMain', 'rayban', [-0.55, 2.8], [0.24, 0.086], SF.white, 'top'),
    logo('frontMain', 'hp', [0.3, 2.75], [0.08, 0.08], null, 'top'),
    logo('frontMain', 'hp', [-0.3, 2.75], [0.08, 0.08], null, 'top'),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      // white cockpit surround: from just ahead of the halo back, down to the shoulders,
      // outlined by a red gap and a thin white pinstripe
      const front = p.z.sub(0.62);
      const top = p.y.sub(0.6);
      return paint(SF.red, [
        [SF.black, below(s, -0.4)], // carbon underside
        [SF.white, below(front, 0).mul(above(top, 0))],
        [SF.white, band(front, 0.03, 0.045).mul(above(top, 0.03))],
        [SF.white, below(front, 0.03).mul(band(top, -0.045, -0.03))],
        [SF.white, noseNumber('16', 1.44)],
      ]);
    }
    if (part === 'sidepod') {
      return paint(SF.red, [
        [SF.black, below(s, -0.1, 0.03)], // carbon undercut
      ]);
    }
    if (part === 'engine') {
      // white top panel: its edge rises from shoulder level towards the rear, then
      // closes to a point behind the rear axle; pinstripe below, race number on the red
      const panel = p.y.sub(p.z.negate().mul(0.15).add(0.66)).sub(p.z.add(1.25).negate().max(0).mul(1.1));
      const num = numberMask(p.z.sub(-1.62).negate().mul(sign(p.x)), p.y, '16', 0, 0.6, 0.14);
      return paint(SF.red, [
        [SF.white, above(panel, 0)],
        [SF.white, band(panel, -0.05, -0.035)],
        [SF.white, num.mul(below(panel, -0.06))],
        [SF.black, below(p.y, 0.47).mul(below(p.z, -1.7))],
      ]);
    }
    return paint(SF.red, []); // fin
  },
};
