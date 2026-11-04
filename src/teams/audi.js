// Audi: livery, sponsors and car shape (see src/teams.js).
// R26 (2026): titanium front half, a vertical Audi Red block across the rear of the
// sidepods, carbon black from the airbox back (engine cover, rear bodywork, wings).
import { positionLocal } from 'three/tsl';
import { above, below, around, paint, noseNumber, logo, slots, W } from './livery.js';

const AUD = { ti: 0x8f9399, dark: 0x1a1b1d, red: 0xe8402e, gun: 0x3a3d41 };

// Red block on the flanks: starts at a vertical line just behind the cockpit and ends at
// an edge raked backwards towards the floor; black behind it.
const RED_FRONT = -0.35;
const redRear = (y) => y.sub(0.2).mul(0.625).add(-1.02); // z of the rear edge at height y
const redZone = (p) => below(p.z, RED_FRONT, 0.008).mul(above(p.z, redRear(p.y), 0.008));
const blackZone = (p) => below(p.z, redRear(p.y), 0.008);

export default {
  id: 'audi',
  logo: 'audi',
  name: 'Audi',
  car: 'R26',
  number: 27,
  // titanium paint: metallic, glossy clear coat
  finish: { roughness: 0.35, metalness: 0.35, clearcoat: 0.7 },
  ui: { primary: '#8f9399', secondary: '#17181a', accent: '#e8402e' },
  wings: {
    frontMain: AUD.dark, frontFlaps: AUD.gun, frontTopFlap: AUD.gun, frontEndplate: AUD.dark,
    rearMain: AUD.dark, rearFlap: AUD.dark, rearEndplate: AUD.dark,
  },
  colors: { halo: AUD.ti, wheelCover: AUD.dark, wheelRing: AUD.gun, tcam: 0x111111, mirror: AUD.ti },
  helmet: 0xf2f2f2,
  sponsors: slots({
    cockpitHi: ['adidas', AUD.dark],
    rearEpHi: ['revolut', W],
    rearFlap: ['revolut', W],
  }, [
    // big black Revolut across the titanium sidepod flank
    logo('sidepod', 'revolut', [0.06, 0.47], [0.46, 0.128], AUD.dark),
    // red four rings on the black engine cover, behind the airbox
    logo('engine', 'audi', [-0.62, 0.9], [0.27, 0.142], AUD.red),
    // small red rings near the nose tip
    logo('monocoque', 'audi', [2.52, 0.215], [0.13, 0.068], AUD.red),
    // rings on the rear wing, Revolut twice across the front wing
    logo('rearMain', 'audi', [0, -2.4], [0.36, 0.19], AUD.red, 'top'),
    logo('frontMain', 'revolut', [0.5, 2.8], [0.34, 0.085], W, 'top'),
    logo('frontMain', 'revolut', [-0.5, 2.8], [0.34, 0.085], W, 'top'),
  ]),
  shape: {
    // slightly blunter, longer nose tip
    monocoque: [
      [2.98, 0.1, 0.06, 0.19],
      [2.86, 0.17, 0.09, 0.2],
      [2.6, 0.22, 0.12, 0.22],
      [2.2, 0.27, 0.17, 0.26],
      [1.8, 0.31, 0.24, 0.31],
      [1.4, 0.37, 0.33, 0.36],
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
    // high inlet with a deep undercut, long gently falling top
    sidepod: [
      [0.74, 0.2, 0.28, 0.52, 0.45, 0.0],
      [0.66, 0.34, 0.33, 0.52, 0.5, 0.4],
      [0.4, 0.38, 0.35, 0.5, 0.53, 0.62],
      [0.0, 0.38, 0.33, 0.47, 0.53, 0.62],
      [-0.4, 0.34, 0.29, 0.43, 0.5, 0.52],
      [-0.8, 0.27, 0.23, 0.36, 0.46, 0.4],
      [-1.15, 0.19, 0.17, 0.28, 0.41, 0.3],
      [-1.4, 0.1, 0.1, 0.22, 0.36, 0.2],
    ],
    sidepodInlet: { x: 0.45, y: 0.53, w: 0.15, h: 0.23, z: 0.752, power: 3.4 },
    // full engine cover that stays high and drops late towards the rear wing
    engineCover: [
      [-0.16, 0.2, 0.18, 0.95],
      [-0.28, 0.27, 0.3, 0.9],
      [-0.6, 0.3, 0.42, 0.83],
      [-1.0, 0.27, 0.44, 0.76],
      [-1.4, 0.22, 0.4, 0.7],
      [-1.8, 0.16, 0.34, 0.6],
      [-2.2, 0.11, 0.26, 0.48],
      [-2.45, 0.08, 0.16, 0.4],
    ],
    fin: null, // no shark fin on the R26
  },
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      return paint(AUD.ti, [
        [AUD.dark, below(s, -0.35, 0.03)], // dark underside
        [AUD.dark, below(p.z, -0.8, 0.01)], // gearbox under the black engine cover
        [AUD.dark, noseNumber('27')],
      ]);
    }
    if (part === 'sidepod') {
      return paint(AUD.ti, [
        [AUD.red, redZone(p)],
        [AUD.dark, blackZone(p)],
        [AUD.dark, below(s, -0.4, 0.03)], // undercut in shadow-black
      ]);
    }
    if (part === 'engine') {
      return paint(AUD.ti, [
        [AUD.dark, below(p.z, -0.3, 0.008)],
        [AUD.red, redZone(p).mul(below(p.y, 0.68, 0.006))],
      ]);
    }
    return paint(AUD.dark, []);
  },
};
