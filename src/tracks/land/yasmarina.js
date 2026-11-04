// Yas Marina Circuit (2021 layout): run-off and surroundings, matched to Esri World Imagery.
// Lap metres as on the reference aerials (start line = 0, anticlockwise lap of ~5280 m).
// Blue = the circuit's signature painted run-off; grey = plain asphalt run-off.
export default {
  surfaces: {
    gravel: 0xc8b48c,              // no real gravel traps at Yas; kept for completeness
    paint: [0x2f64b4, 0x2f64b4],   // flat royal-blue painted run-off (plain, no bands)
    widen: 0,
    width: [
      // pit straight: grandstand wall on the left, pit wall on the right
      [0, 'L', 0, 200, 4],
      [0, 'R', 0, 170, 3],
      // Turn 1 (left): huge blue run-off on the outside
      [170, 'R', 0, 30, 12],
      [200, 'R', 0, 120, 35],
      [320, 'R', 0, 150, 14],
      [200, 'L', 0, 280, 8],
      // Turns 2-4 (left sweep, then right kink to the north)
      [470, 'R', 0, 100, 30],
      [480, 'L', 0, 100, 4],
      [570, 'R', 0, 80, 20],
      [580, 'L', 0, 70, 8],
      // north-bound run to the old chicane site (old track tarmac on the left)
      [650, 'L', 0, 200, 25],
      [650, 'R', 0, 410, 5],
      [850, 'L', 0, 210, 30],
      // Turn 5 approach, hairpin, and the run back south past the west grandstand
      [1060, 'L', 0, 120, 5],
      [1060, 'R', 0, 120, 6],
      [1180, 'R', 0, 110, 12],
      [1180, 'L', 0, 110, 20],
      [1290, 'R', 0, 50, 35],
      [1290, 'L', 0, 50, 8],
      [1340, 'R', 0, 260, 18],
      [1340, 'L', 0, 110, 12],
      [1450, 'L', 0, 150, 10],
      // back straight (south-south-west)
      [1600, 'L', 0, 650, 6],
      [1600, 'R', 0, 870, 8],
      [2250, 'L', 0, 220, 12],
      // left-hander onto the SE straight (outside = right)
      [2470, 'R', 0, 90, 35],
      [2470, 'L', 0, 90, 5],
      [2560, 'R', 0, 140, 25],
      [2560, 'L', 0, 140, 12],
      // kink under the road bridge, then the south straight past the south grandstand
      [2700, 'both', 0, 80, 6],
      [2780, 'R', 0, 120, 15],
      [2780, 'L', 0, 720, 5],
      [2900, 'R', 0, 600, 5],
      // Turn 9 (long left): very wide patterned-blue run-off on the outside
      [3500, 'R', 0, 230, 45],
      [3500, 'L', 0, 490, 5],
      // marina straight (west-bound), wall then promenade then marina water on the right
      [3730, 'R', 0, 260, 6],
      // right kinks into the hotel section
      [3990, 'L', 0, 130, 25],
      [3990, 'R', 0, 310, 4],
      [4120, 'L', 0, 120, 35],
      [4240, 'L', 0, 60, 30],
      [4300, 'L', 0, 90, 4],
      [4300, 'R', 0, 90, 12],
      // under the Yas hotel (north-bound), then west along the marina
      [4390, 'both', 0, 100, 4],
      [4490, 'R', 0, 230, 11],
      [4490, 'L', 0, 230, 4],
      [4720, 'L', 0, 80, 25],
      [4720, 'R', 0, 80, 6],
      [4800, 'L', 0, 150, 25],
      [4800, 'R', 0, 150, 4],
      // final corner (right) onto the pit straight
      [4950, 'L', 0, 60, 25],
      [4950, 'R', 0, 60, 4],
      [5010, 'L', 0, 280, 4],
      [5010, 'R', 0, 280, 3],
    ],
    paved: [
      // default: plain asphalt hardstanding everywhere
      [0, 'both', 0, 5300, 'asphalt'],
      // blue painted run-off
      [180, 'R', 0, 400, 'paint'],      // T1 outside through T2
      [850, 'L', 0, 210, 'paint'],      // big blue field west of the north straight
      [1180, 'both', 0, 270, 'paint'],  // around the T5 hairpin (both sides)
      [1450, 'R', 0, 150, 'paint'],     // west side, south-bound past the T5 grandstand
      [2470, 'R', 0, 230, 'paint'],     // outside of the left-hander after the back straight
      [2780, 'R', 0, 120, 'paint'],     // after the road bridge
      [2900, 'R', 0, 600, 'paint'],     // thin blue strip along the south grandstand
      [3500, 'R', 0, 490, 'paint'],     // Turn 9 and the marina straight
      [4120, 'L', 0, 180, 'paint'],     // big blue field west of the hotel approach
      [4720, 'L', 0, 80, 'paint'],      // blue triangle before the bridge turn
      [4950, 'L', 0, 60, 'paint'],      // final corner outside
    ],
    traps: [],
    sausages: [],
  },
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'paved',
  scenery: { desert: false, palms: true, trees: 0.02, illuminated: true },
  notes: `Yas Marina is a fully urban/resort venue: no gravel traps anywhere (only plain asphalt and
flat royal-blue painted run-off; Turn 9's outside run-off has a darker-blue arabesque pattern painted
on it). Kerbs red/white; some white-edged painted strips. Barriers are concrete walls with debris
fencing, close (3-6 m) along most straights, set back 25-45 m only at corners with blue run-off.

Lap walk: pit straight (0-170 and 5010-5280) runs between two long white tent-roof grandstands
(north = main grandstand, south = pit building/garages with the pit lane on the driver's right);
south of the pit building is the west marina basin (water ~100 m off the track). Turn 1 (left,
~240 m) has a large blue run-off; beyond it landscaped lawns with palms, a domed kiosk and the
F1 paddock/marina buildings to the east. The north-bound run (300-650) has grandstand/hospitality
to the left, big lawns with an Arabic-calligraphy planting to the right. 650-1060: north-bound with
old-layout tarmac and the blue field (old hairpin site, the 2021 layout bypasses it) on the left;
right side a lawn with a huge painted UAE flag, then the north grandstand. Turn 5 hairpin (~1300) is
wrapped in a horseshoe tent grandstand with a wide blue run-off; a karting track and padel courts lie
east of it. The back straight (1600-2450) has lawns and old track loops on the left, a service road,
car parks and the highway (E12/Yas Leisure Drive) on the right. Left-hander at ~2500 next to the
west grandstand; a road flyover crosses the track at ~2760. South straight (2900-3500) passes the
south grandstand on the right and a landscaped infield (lawn, calligraphy garden) on the left.
Turn 9 (~3550-3720) has the widest blue run-off; beyond the wall a perimeter road and the open
sea channel to the east.

Marina water: the main Yas Marina basin (dark green-black water with yacht pontoons and moored
super-yachts) lies on the driver's RIGHT from ~3730 to ~4400 and again on the RIGHT from ~4490 to
~4720: track wall, then a 10-15 m stone quay/promenade (pale concrete), then the water. It is
closest (~12-20 m from the track edge) along 4000-4300 and 4500-4650. The basin wraps around the
hotel's north building: the north tower stands on a peninsula with the water east and north of it.
A second smaller marina basin lies south of the pit building (start straight, ~100 m to the right).

Yas Hotel: two curved buildings under one wavy gridshell canopy (lit by changing LED colours at
night). The track passes between them heading north (~4390-4490) and the canopy/link bridge spans
the track overhead around 4430-4480; a second slender pedestrian bridge crosses at ~4640 and another
at ~4800. In reality the pit exit dives through a tunnel under the track at Turn 1 and rejoins on
the right after Turn 2; the game's pit lane instead merges just before Turn 1 (not visible on imagery). Pale cream/beige concrete hardstanding (not sand) fills the triangle left of the
track at 3990-4120 and the strips right of the track at 4300-4390 and 4490-4720.
Night race: very bright floodlighting, purple/blue accent lighting on the hotel and grandstands.`,
};
