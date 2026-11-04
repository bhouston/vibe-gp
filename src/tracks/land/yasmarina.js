// Yas Marina Circuit (2021 layout): run-off and surroundings, matched to Esri World Imagery.
// Lap metres as on the reference aerials (start line = 0, anticlockwise lap of ~5280 m).
// Blue = the circuit's signature painted run-off; grey = plain asphalt run-off;
// CREAM = pale concrete hardstanding beside the hotel section.
const CREAM = { paint: [0xe6dcc2, 0xe6dcc2], pattern: 'solid' };
const CHEVRON = { paint: [0xc8202a, 0xf2f2f2], pattern: 'diagonal' };

export default {
  surfaces: {
    gravel: 0xc8b48c,              // no real gravel traps at Yas; kept for completeness
    paint: [0x2f64b4, 0x2f64b4],   // flat royal-blue painted run-off (plain, no bands)
    paintPattern: 'solid',
    widen: 0,
    width: [
      // pit straight: grandstand wall on the left, pit wall on the right
      [0, 'L', 0, 200, 4],
      [0, 'R', 0, 170, 3],
      // Turn 1 (left): the blue run-off is a triangle with its tip at the north-east corner
      [170, 'R', 0, 55, 14],
      [225, 'R', 0, 20, 22],
      [245, 'R', 0, 20, 42],
      [265, 'R', 0, 30, 38],
      [295, 'R', 0, 50, 33],
      [345, 'R', 0, 55, 22],
      [400, 'R', 0, 70, 14],
      [200, 'L', 0, 280, 8],
      // Turns 2-4 (left sweep, then right kink to the north)
      [470, 'R', 0, 100, 30],
      [480, 'L', 0, 100, 4],
      [570, 'R', 0, 80, 20],
      [580, 'L', 0, 70, 8],
      // north-bound run: old-layout tarmac on the left, then the blue lens
      [650, 'L', 0, 200, 25],
      [650, 'R', 0, 410, 5],
      [850, 'L', 0, 75, 45],
      [925, 'L', 0, 105, 28],
      // Turn 5 approach, hairpin, and the run back south past the west grandstand
      [1030, 'L', 0, 150, 5],
      [1060, 'R', 0, 120, 6],
      [1180, 'R', 0, 85, 12],
      [1265, 'R', 0, 15, 20],
      [1280, 'R', 0, 15, 35],
      [1180, 'L', 0, 110, 20],
      [1295, 'R', 0, 25, 60],
      [1320, 'R', 0, 20, 35],
      [1290, 'L', 0, 50, 8],
      [1340, 'R', 0, 260, 18],
      [1340, 'L', 0, 110, 12],
      [1450, 'L', 0, 150, 10],
      // back straight (south-south-west)
      [1600, 'L', 0, 650, 6],
      [1600, 'R', 0, 870, 8],
      [2250, 'L', 0, 220, 12],
      // left-hander onto the SE straight (outside = right)
      [2470, 'R', 0, 90, 18],
      [2470, 'L', 0, 90, 5],
      [2560, 'R', 0, 50, 24],
      [2610, 'R', 0, 40, 16],
      [2650, 'R', 0, 50, 8],
      [2560, 'L', 0, 140, 12],
      // kink under the road bridge, then the south straight past the south grandstand
      [2700, 'both', 0, 80, 6],
      [2780, 'R', 0, 120, 15],
      [2780, 'L', 0, 720, 5],
      [2900, 'R', 0, 635, 5],
      // Turn 9 (long left): the blue has a square corner to the south-east
      [3535, 'R', 0, 15, 18],
      [3550, 'R', 0, 10, 45],
      [3560, 'R', 0, 40, 70],
      [3600, 'R', 0, 20, 40],
      [3620, 'R', 0, 100, 28],
      [3720, 'R', 0, 30, 20],
      [3500, 'L', 0, 490, 5],
      // marina straight (west-bound): blue strip, wall, promenade, marina water on the right
      [3750, 'R', 0, 175, 12],
      [3925, 'R', 0, 65, 5],
      // right kinks into the hotel section
      [3990, 'L', 0, 130, 25],
      [3990, 'R', 0, 310, 4],
      [4120, 'L', 0, 120, 35],
      [4240, 'L', 0, 60, 30],
      [4300, 'L', 0, 70, 18],
      [4370, 'L', 0, 20, 8],
      [4300, 'R', 0, 90, 12],
      // under the Yas hotel (north-bound), then west along the marina
      [4390, 'both', 0, 100, 4],
      [4490, 'R', 0, 230, 11],
      [4490, 'L', 0, 235, 4],
      [4725, 'L', 0, 25, 16],
      [4750, 'L', 0, 30, 42],
      [4780, 'L', 0, 20, 50],
      [4720, 'R', 0, 80, 6],
      [4800, 'L', 0, 150, 25],
      [4800, 'R', 0, 150, 4],
      // final corner (right) onto the pit straight
      [4950, 'L', 0, 60, 25],
      [4950, 'R', 0, 60, 4],
      [5010, 'L', 0, 75, 8],
      [5085, 'L', 0, 205, 4],
      [5010, 'R', 0, 280, 3],
    ],
    paved: [
      // default: plain asphalt hardstanding everywhere
      [0, 'both', 0, 5300, 'asphalt'],
      // blue painted run-off
      [180, 'R', 0, 375, 'paint'],      // T1 outside through T2
      [570, 'L', 0, 30, CHEVRON],       // red/white chevrons at the T3 exit
      [850, 'L', 0, 180, 'paint'],      // blue fields west of the north straight
      [1180, 'both', 0, 270, 'paint'],  // around the T5 hairpin (both sides)
      [1450, 'R', 0, 150, 'paint'],     // west side, south-bound past the T5 grandstand
      [2470, 'R', 0, 230, 'paint'],     // outside of the left-hander after the back straight
      [2780, 'R', 0, 120, 'paint'],     // after the road bridge
      [2900, 'R', 0, 635, 'paint', 2.5], // thin blue strip along the south grandstand
      [3535, 'R', 0, 390, 'paint'],     // Turn 9 and the marina straight
      [3990, 'L', 0, 130, CREAM],       // pale concrete triangle
      [4120, 'L', 0, 270, 'paint'],     // big blue field west of the hotel approach, on along 4300
      [4300, 'R', 0, 90, CREAM],
      [4485, 'R', 0, 45, CREAM],
      [4725, 'L', 0, 75, 'paint'],      // blue triangle before the bridge turn
      [4965, 'L', 0, 120, 'paint'],     // final corner outside, on along the pit straight
    ],
    traps: [],
    sausages: [],
  },
  bridges: [
    [490, 'foot'], [970, 'foot'], [1590, 'foot'], [2190, 'foot'],
    [2760, 'road'],                 // road flyover
    [3125, 'foot'], [3625, 'foot'], [3995, 'foot'],
    [4440, 'road'],                 // Yas Hotel link bridge
    [4640, 'foot'], [4795, 'foot'],
    [5265, 'gantry'],               // start gantry
  ],
  stands: [
    [5125, 'L', 0, 110, 16],        // main grandstand, across the start line
    [5240, 'L', 0, 220, 16],
    [985, 'R', 0, 120, 16],        // north grandstand
    [1150, 'R', 0, 130, 16],        // Turn 5 horseshoe, east arm
    [1335, 'R', 0, 135, 16],        // Turn 5 horseshoe, west arm
    [1930, 'R', 0, 60, 10],
    [2365, 'R', 0, 100, 14],        // west grandstand
    [2545, 'R', 0, 60, 12],
    [2862, 'R', 0, 275, 14],        // south grandstand
    [3338, 'R', 0, 192, 14],
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'paved',
  scenery: { desert: false, palms: true, trees: 0.02, illuminated: true },
  areas: [
    // Yas Hotel footprints: the OSM outline crosses the track so the game drops it, leaving
    // sea under the east ring
    { kind: 'concrete', noTrees: true, pts: [[105, -204], [126, -199], [148, -215], [162, -258], [162, -313], [145, -334], [124, -329], [110, -302], [102, -248]] },
    { kind: 'concrete', noTrees: true, pts: [[-67, -291], [-45, -272], [4, -267], [45, -272], [53, -288], [31, -307], [-34, -313]] },
    // quay between the marina and the wall, north of 4520-4700
    { kind: 'concrete', pts: [[-53, -209], [102, -197], [115, -230], [-53, -232]] },
    // sand lots inside Turn 2
    { kind: 'sand', pts: [[133, 277], [182, 275], [212, 242], [204, 199], [188, 220], [158, 250], [136, 258]] },
    { kind: 'sand', pts: [[65, 283], [120, 283], [120, 250], [65, 250]] },
  ],
  notes: `Yas Marina is a fully urban/resort venue: no gravel traps anywhere (only plain asphalt and
flat royal-blue painted run-off; Turn 9's outside run-off has a darker-blue arabesque pattern painted
on it). Kerbs red/white. Barriers are close (3-8 m) along most straights, set back at corners with
blue run-off: about 60 m at the Turn 5 apex and the south-east corner of Turn 9.

Lap walk: pit straight (0-170 and 5010-5280) runs between two long white tent roofs, the pit lane on
the driver's right; south of them is the west marina basin. Turn 1 (left, ~240 m) has a triangular
blue run-off; beyond it lawns with palms, a domed kiosk and buildings to the east. North-bound run
(300-650): car park and a sand lot to the left, big lawns with calligraphy planting to the right.
650-1060: old-layout tarmac and blue fields among the disused kerbed loops on the left; on the right
a lawn with a huge UAE flag, then a tent-roofed grandstand. Turn 5 hairpin (~1300) is wrapped in a
horseshoe of tent roof with a wide blue run-off; a karting track and sports courts lie east of it.
Back straight (1600-2450): lawns and kerbed loops on the left, service road, car parks and a highway
on the right. Left-hander at ~2500 beside the west tent roofs; a road flyover crosses at ~2760. South
straight (2900-3500): tent roofs on the right, a lawn with a calligraphy garden on the left. Beyond
Turn 9's wall are a perimeter road and the open water to the east.

Marina water: the main basin (dark water, pontoons, moored super-yachts) lies on the driver's RIGHT
from ~3730 to ~4400 and again from ~4490 to ~4720: wall, then a paved quay, then the water, about
25-30 m from the track edge where measured (4250, 4550). A second basin lies south of the pit
building. Pontoons and yachts are not expressible.

Yas Hotel: two curved buildings under a wavy gridshell (lit by changing LED colours at night), a
ring to the east of the track and an oval to the west, joined by a neck crossing over the track at
about 4440 (a 'road' bridge stands in for it). The hotel itself is NOT drawn: only flat concrete
footprints in 'areas'. Pale cream concrete fills the triangle at 3990-4120 left and the strips at
4300-4390 and 4485-4530 right. The real pit exit runs in a tunnel near Turn 1 (from general
knowledge, not visible on the imagery); the game's pit lane merges just before Turn 1.`,
};
