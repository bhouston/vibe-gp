// Cadillac: livery, sponsors and car shape (see src/teams.js).
// MAC-26 (2026): a two-sided livery, gloss white on the car's left and black on its
// right, joined along the spine, with "digital" pixel blocks dissolving one into the
// other towards the rear; white nose, black wings with white top flaps.
import { positionLocal, abs, floor, fract, sin, vec2, dot } from 'three/tsl';
import { above, below, band, around, paint, numberMask, logo, slots } from './livery.js';

const CAD = { black: 0x0d0d0f, white: 0xeef0f2, silver: 0xa6abb2, grey: 0x5a5e64 };

/** 0..1 pseudo-random value per cell of a (z, y) grid: the pixel-block pattern. */
const cells = (p, sz, sy) => fract(sin(dot(floor(vec2(p.z.mul(sz), p.y.mul(sy))), vec2(12.9898, 78.233))).mul(43758.5453));

export default {
  id: 'cadillac',
  logo: 'cadillac',
  name: 'Cadillac',
  car: 'CAD-V',
  number: 11,
  finish: { roughness: 0.26, metalness: 0.12, clearcoat: 1.0 },
  ui: { primary: '#0e0e10', secondary: '#f2f2f2', accent: '#b8bcc2' },
  wings: {
    frontMain: CAD.black, frontFlaps: CAD.black, frontTopFlap: CAD.white, frontEndplate: CAD.black,
    rearMain: CAD.white, rearFlap: CAD.black, rearEndplate: CAD.white,
  },
  colors: { halo: CAD.silver, wheelCover: CAD.black, wheelRing: CAD.white, tcam: 0xffe600, mirror: CAD.white },
  helmet: 0x0e0e10,
  shape: {
    // sidepods: a tall letterbox inlet under the chassis shoulder, a moderate undercut
    // and a long downwash ramp to the floor
    sidepod: [
      [0.68, 0.18, 0.3, 0.5, 0.45, 0.0],
      [0.6, 0.33, 0.34, 0.5, 0.5, 0.4],
      [0.35, 0.37, 0.36, 0.49, 0.53, 0.6],
      [0.0, 0.36, 0.33, 0.46, 0.53, 0.65],
      [-0.4, 0.32, 0.26, 0.4, 0.5, 0.6],
      [-0.8, 0.25, 0.2, 0.33, 0.45, 0.45],
      [-1.15, 0.17, 0.14, 0.26, 0.4, 0.3],
      [-1.4, 0.1, 0.09, 0.21, 0.36, 0.2],
    ],
    sidepodInlet: { x: 0.45, y: 0.5, w: 0.14, h: 0.27, z: 0.692, power: 3.6 },
    // tall roll-hoop hump, then a full engine cover sloping evenly to the gearbox
    engineCover: [
      [-0.16, 0.2, 0.2, 0.96],
      [-0.28, 0.28, 0.32, 0.9],
      [-0.6, 0.31, 0.42, 0.82],
      [-1.0, 0.27, 0.42, 0.72],
      [-1.4, 0.2, 0.36, 0.61],
      [-1.8, 0.14, 0.28, 0.51],
      [-2.2, 0.1, 0.2, 0.43],
      [-2.45, 0.08, 0.13, 0.37],
    ],
    // low blade along the spine carrying the number
    fin: [[-0.95, 0.93], [-1.6, 0.89], [-2.22, 0.8], [-2.3, 0.73], [-2.2, 0.5], [-1.8, 0.6], [-1.4, 0.72], [-1.05, 0.88]],
  },
  sponsors: [
    // sidepods: TWG AI across the flank (on the white side and on a silver fade on the black)
    logo('sidepod', 'twg', [-0.22, 0.49], [0.46, 0.17], CAD.black),
    // chassis: "Cadillac" on the white panel ahead of the sidepod, Tommy below it
    logo('monocoque', 'cadillacText', [1.12, 0.47], [0.4, 0.072], CAD.black),
    logo('monocoque', 'tommy', [1.0, 0.33], [0.26, 0.054], CAD.white),
    // engine cover: the crest high on the roll-hoop flank
    logo('engine', 'cadillac', [-0.5, 0.9], [0.1, 0.12], CAD.grey),
    // wings: CADILLAC across the rear wing top, crest on the endplates
    ...slots({
      rearEpHi: ['cadillacText', CAD.black], rearFlap: ['cadillacText', CAD.white],
      rearMain: ['cadillacText', CAD.black], frontEp: ['cadillacText', CAD.white], frontMain: ['twg', CAD.white],
    }),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    const left = above(p.x, 0, 0.002); // the car's left (+X) is the white side
    if (part === 'monocoque') {
      return paint(CAD.black, [
        [CAD.white, left.mul(above(s, -0.15, 0.03)).mul(below(p.z, 1.3, 0.02))], // cockpit surround
        [CAD.white, band(s, -0.12, 0.62, 0.03).mul(band(p.z, 0.7, 2.0, 0.02))], // script panel, both sides
        [CAD.white, above(s, -0.3, 0.03).mul(above(p.z, 1.95, 0.02))], // white nose
        [CAD.silver, above(p.z, 2.75, 0.02)],
        [CAD.white, numberMask(p.x, p.z.negate(), '11', 0, -1.62, 0.17).mul(above(s, 0.4, 0.05))],
      ]);
    }
    if (part === 'sidepod') {
      // left: white upper over a black lower wedge growing to the rear, with pixel
      // blocks breaking up the edge; right: black with a silver fade behind the TWG
      const edge = s.sub(p.z.mul(0.75).sub(0.3));
      const px = cells(p, 22, 40);
      const white = below(px, above(edge, 0, 0.07), 0.01);
      const fade = band(p.z, -0.55, 0.1, 0.12).mul(band(s, -0.45, 0.75, 0.15));
      return paint(CAD.black, [
        [CAD.white, left.mul(white)],
        [CAD.silver, left.oneMinus().mul(fade)],
      ]);
    }
    if (part === 'engine') {
      // white left / black right, the white breaking into pixels towards the gearbox
      const px = cells(p, 18, 30);
      const keep = below(px, below(p.z, -1.1, 0.5).oneMinus().add(0.15), 0.01);
      const blocks = below(px, band(p.z, -1.9, -0.9, 0.3).mul(0.5), 0.01).mul(below(s, 0.7, 0.05));
      return paint(CAD.black, [
        [CAD.white, left.mul(keep)],
        [CAD.silver, left.oneMinus().mul(blocks)],
        [CAD.black, below(s, -0.4, 0.03)],
      ]);
    }
    // fin: black with the number in white on both faces
    const u = p.z.negate().mul(p.x.sign());
    return paint(CAD.black, [[CAD.white, numberMask(u, p.y, '11', p.x.sign().mul(1.86), 0.765, 0.11)]]);
  },
};
