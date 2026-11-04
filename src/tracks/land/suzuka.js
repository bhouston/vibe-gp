// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Suzuka, matched to Esri World Imagery crops (~0.5 m/px) every 250 m round the lap.
// Lap metres below are the game's lap (5797 m); corners: First Turn ~529, Second Turn ~681,
// S curves ~900-1300, Gyaku ~1380, NIPPO/Dunlop ~1590, Degner 1 ~2120, Degner 2 ~2290,
// crossover bridge ~2390/4770, hairpin ~2750, Spoon ~3640, 130R ~4870, chicane ~5256.
// teal-green painted strip beside the kerb, dark asphalt beyond
const TEAL = { paint: [0x2a9c86, 0x2a9c86], strip: 5, beyond: 'asphalt' };

export default {
  surfaces: {
    gravel: 0xbcaa8a, // pale tan/beige gravel
    paint: [0x2a9c86, 0x2a9c86], // teal-green paint (strips beside kerbs, chicane island)
    widen: 0,
    width: [
      // pit straight: grandstand wall on the left, pit wall on the right
      [5500, 'L', 0, 297, 6],
      [5500, 'R', 0, 297, 7],
      [0, 'L', 0, 180, 6],
      [0, 'R', 0, 180, 7],
      [180, 'L', 0, 220, 12], // grass bank under the stands
      [180, 'R', 0, 220, 9], // pit exit lane beside
      [400, 'L', 0, 80, 16],
      [400, 'R', 0, 80, 10],
      // First / Second Turn (right-handers): wide asphalt then gravel on the outside
      [480, 'L', 0, 280, 33],
      [480, 'R', 0, 280, 14],
      [760, 'L', 0, 120, 25],
      [760, 'R', 0, 120, 15],
      // S curves
      [880, 'L', 0, 100, 40],
      [880, 'R', 0, 40, 15],
      [980, 'L', 0, 120, 35],
      [1100, 'L', 0, 150, 18],
      [1250, 'L', 0, 170, 22],
      // Gyaku exit up to NIPPO (Dunlop)
      [1420, 'L', 0, 140, 25],
      // R kept constant through the S-curve/Gyaku gravel (real: ~15-30 m) so the barrier has no
      // width steps inside the trap (see note on the engine's pit-wall flag)
      [920, 'R', 0, 640, 22],
      [1560, 'L', 0, 220, 10],
      [1560, 'R', 0, 220, 32],
      [1780, 'L', 0, 120, 10],
      [1780, 'R', 0, 120, 30],
      [1900, 'L', 0, 180, 10],
      [1900, 'R', 0, 180, 14],
      // Degner 1 and 2 (right-handers): big gravel on the outside
      [2080, 'L', 0, 170, 45],
      [2080, 'R', 0, 170, 14],
      [2250, 'L', 0, 80, 22],
      [2250, 'R', 0, 80, 6],
      // under the bridge and up to the hairpin
      [2330, 'L', 0, 370, 6],
      [2330, 'R', 0, 370, 9],
      [2550, 'L', 0, 150, 12],
      // hairpin (left-hander)
      [2700, 'L', 0, 100, 8],
      [2650, 'R', 0, 200, 25],
      [2800, 'L', 0, 300, 8],
      [2850, 'R', 0, 250, 14],
      // run to Spoon
      [3100, 'L', 0, 300, 10],
      [3100, 'R', 0, 300, 10],
      [3400, 'L', 0, 170, 12],
      [3400, 'R', 0, 170, 20],
      // Spoon (double left-hander)
      [3570, 'L', 0, 390, 12],
      [3570, 'R', 0, 390, 32],
      [3960, 'L', 0, 140, 18],
      [3960, 'R', 0, 140, 18],
      // back straight (pond to the south)
      [4100, 'L', 0, 650, 12],
      [4100, 'R', 0, 650, 10],
      [4750, 'both', 0, 50, 4], // over the crossover bridge
      // 130R (left-hander): asphalt then gravel on the outside
      [4800, 'L', 0, 180, 12],
      [4800, 'R', 0, 180, 40],
      [4980, 'L', 0, 200, 14],
      [4980, 'R', 0, 200, 22],
      // chicane and last curve
      [5180, 'L', 0, 160, 25],
      [5180, 'R', 0, 160, 30],
      [5340, 'L', 0, 160, 14],
      [5340, 'R', 0, 160, 25],
    ],
    paved: [
      [5500, 'both', 0, 297, 'asphalt'],
      [0, 'both', 0, 180, 'asphalt'],
      [180, 'R', 0, 300, 'asphalt'],
      [470, 'L', 0, 310, TEAL], // T1/T2 outside: teal strip + dark asphalt, gravel beyond
      [2550, 'L', 0, 150, 'asphalt'], // grey service road behind the left barrier line
      [3380, 'L', 0, 100, 'asphalt'], // Spoon entry inside: pale apron
      [3570, 'R', 0, 390, TEAL], // Spoon outside: teal strip + asphalt, gravel beyond
      [4800, 'R', 0, 350, TEAL], // 130R outside: teal strip + asphalt, gravel beyond
      [5150, 'R', 0, 110, 'asphalt'], // chicane escape road
      [5240, 'R', 0, 35, 'paint'], // teal-painted island inside the chicane
    ],
    traps: [
      [480, 'L', 0, 300, 15], // First/Second Turn: gravel band beyond ~15 m of asphalt
      [940, 'R', 0, 620, 2], // S curves to Gyaku exit: gravel close in on the right
      [980, 'L', 0, 130, 2],
      [1260, 'L', 0, 300, 2], // Gyaku outside and on up the left
      [1560, 'R', 0, 360, 2], // NIPPO (Dunlop) outside and the run to Degner
      [2090, 'L', 0, 240, 2], // Degner 1 + 2
      [2680, 'R', 0, 150, 2], // hairpin
      [3580, 'R', 0, 380, 14], // Spoon: gravel beyond the asphalt
      [3960, 'R', 0, 100, 2], // Spoon exit
      [4800, 'R', 0, 200, 15], // 130R
      [5000, 'R', 0, 150, 10],
      [5180, 'L', 0, 300, 2], // chicane + last curve outside
      [5270, 'R', 0, 180, 2],
    ],
    sausages: [],
  },
  bridges: [
    [170, 'foot'], // walkway bridge over the pit straight
    [3198, 'foot'], [4350, 'foot'], // one footbridge spanning both the Spoon approach and the back straight
    [3300, 'foot'], [4234, 'foot'], // a second one, ~110 m further west
    [5152, 'foot'], // before the chicane
  ],
  areas: [
    // large asphalt pad (painted "SUZUKA CIRCUIT" logo) inside Spoon: OSM has grass
    { kind: 'asphalt', pts: [[-1595, 476], [-1540, 482], [-1480, 468], [-1455, 420], [-1438, 380], [-1438, 324], [-1466, 318], [-1510, 349], [-1554, 368], [-1593, 390]] },
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'grass',
  notes: `Suzuka sits in hilly country: dense broadleaf woods to the west and south-west, solar
farms and dirt sports fields north of the hairpin/Spoon section, rice paddies south-east of
T1/T2 and south of the S curves, Suzuka Circuit amusement park (karting tracks, Ferris wheel,
roller coaster, pools) north-east of the final curve and pit straight.
Pit straight: long pit building + paddock car park on the right (SW), the main grandstand
(roofed) on the left, close to the track; a footbridge/gantry crosses the straight ~200 m
after the line; pit exit runs on the right to ~450 m. T1/T2: big grandstands on the outside
(south), a pond and car park inside. S curves: tan gravel both sides, grandstands and woods
on the left. Gyaku/NIPPO: grandstands on the inside (west), paddock/car park and a helipad
east. Degner: wide gravel on the outside, woods beyond; a separate small East-course loop
and karting area west of Degner 2. The lap passes UNDER the back straight at ~2390 m
(figure-eight crossover bridge at ~4770 m of the lap). Hairpin: grandstands west of the
approach, workshop buildings east. Spoon: large asphalt pad with a painted "SUZUKA CIRCUIT"
logo inside the curve; woods outside. Back straight: two footbridges cross both the back
straight and the parallel Spoon approach (~3200/4300 m); a sizeable pond with woods ~40 m
south of the back straight (~4000-4150 m) and a smaller pond inside the hairpin-to-back-
straight triangle. 130R: grandstands on the inside; outside a wide teal strip + asphalt then
gravel. Casio/Hitachi chicane: teal-painted sponsor island inside, escape road behind;
grandstands along the north side of the chicane and last curve; baseball/rugby fields north
of 130R exit. Teal-green painted strips line the outside of T1/T2, Spoon and 130R next to the
kerbs (~5 m) before dark asphalt.`,
};
