// Williams FW48 (2026): livery, sponsors and car shape (see src/teams.js).
// Gloss royal blue over a dark-navy lower body; a light-blue Barclays sweep along the
// sidepod shoulder and a white Komatsu panel on the lower rear of the sidepod.
import { positionLocal } from 'three/tsl';
import { above, below, around, paint, noseNumber, logo } from './livery.js';

const WIL = { royal: 0x1450d2, light: 0x3fb4f0, navy: 0x0b1330, white: 0xeef0f5, black: 0x15171c };

// side-view boundaries (y as a function of z)
const lightLo = (z) => z.mul(-0.086).add(0.463); // light blue above, white/navy below
const lightHi = (z) => z.mul(0.052).add(0.562); // light blue below, royal above

/** Sidepod / engine-cover flank colours shared by both panels. */
function flank(p, s) {
  const lower = below(p.y, lightLo(p.z), 0.008);
  const white = lower.mul(above(p.y, 0.25, 0.008)).mul(below(p.z, p.y.sub(0.4).mul(-1.0).add(0.15), 0.02));
  const light = above(p.y, lightLo(p.z), 0.008).mul(below(p.y, lightHi(p.z), 0.008)).mul(below(s, 0.75, 0.05));
  return [
    [WIL.light, light],
    [WIL.navy, lower],
    [WIL.white, white],
  ];
}

export default {
  id: 'williams',
  logo: 'williams',
  logoHasName: true, // the logo spells out the name (garage board shows it alone)
  name: 'Williams',
  car: 'FW-V',
  number: 55,
  finish: { roughness: 0.25, metalness: 0.12, clearcoat: 1.0 },
  ui: { primary: '#1450d2', secondary: '#0b1330', accent: '#3fb4f0' },
  shape: {
    fin: null, // no shark fin on the 2026 car
  },
  wings: {
    frontMain: WIL.white, frontFlaps: WIL.black, frontTopFlap: WIL.black, frontEndplate: WIL.black,
    rearMain: WIL.black, rearFlap: WIL.black, rearEndplate: WIL.royal,
  },
  colors: { halo: WIL.black, wheelCover: WIL.navy, wheelRing: 0x9a7cf0, tcam: 0xd08a3a, mirror: WIL.royal },
  helmet: 0xe2231a,
  sponsors: [
    // sidepod: Barclays on the light blue, Komatsu on the white
    logo('sidepod', 'barclays', [0.14, 0.53], [0.44, 0.085], WIL.white),
    logo('sidepod', 'komatsu', [-0.56, 0.36], [0.56, 0.11]),
    // engine cover: Atlassian, Duracell on the airbox, Gulf at the back
    logo('engine', 'atlassian', [-0.78, 0.7], [0.6, 0.115], WIL.white),
    logo('engine', 'duracell', [-0.4, 0.97], [0.2, 0.045], WIL.white),
    logo('engine', 'gulf', [-1.15, 0.62], [0.12, 0.085]),
    // nose top: Barclays behind the number, Gulf and Komatsu ahead of it
    logo('monocoque', 'barclays', [0, 1.3], [0.2, 0.045], WIL.white, 'top'),
    logo('monocoque', 'gulf', [0, 2.0], [0.1, 0.07], null, 'top'),
    logo('monocoque', 'komatsu', [0, 2.2], [0.14, 0.03], WIL.white, 'top'),
    // wings
    logo('rearEndplate', 'komatsu', [-2.47, 1.0], [0.4, 0.08], WIL.white),
    logo('rearFlap', 'atlassian', [0, -2.6], [0.62, 0.12], WIL.white, 'top'),
    logo('rearFlap', 'atlassian', [0, 1.0], [0.52, 0.09], WIL.white, 'rear'),
    ...[-1, 1].map((s) => logo('frontMain', 'kraken', [0.5 * s, 2.8], [0.26, 0.08], null, 'top')),
  ],
  body(part) {
    const p = positionLocal;
    const s = around();
    if (part === 'monocoque') {
      // royal-blue top, navy flanks and underside; white 55 on the nose
      return paint(WIL.navy, [
        [WIL.royal, above(s, 0.35, 0.04)],
        [WIL.royal, above(p.y, 0.56, 0.01).mul(below(p.z, 1.3, 0.05))],
        [WIL.white, noseNumber('55', 1.6)],
      ]);
    }
    if (part === 'sidepod') return paint(WIL.royal, flank(p, s));
    if (part === 'engine') {
      return paint(WIL.royal, [
        ...flank(p, s),
        [WIL.navy, above(p.y, 0.93, 0.01).mul(above(p.z, -0.75, 0.03))], // dark airbox
      ]);
    }
    return paint(WIL.royal, []);
  },
};
