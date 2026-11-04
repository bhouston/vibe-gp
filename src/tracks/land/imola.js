// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Lap metres as labelled on the reference aerials (lap ~4896 m, driven anticlockwise; the start
// line is on the pit straight heading west, so the pits and the river are on the driver's RIGHT
// along the straight, and the main grandstands on the LEFT).
export default {
  surfaces: {
    gravel: 0xc8b48f, // light tan, almost sandy from above
    paint: [0x2a9a74, 0x2a9a74], // teal-green painted run-off (red only at Acque Minerali, see notes)
    widen: 0,
    width: [
      // pit straight and run to Tamburello
      [2, 'L', -2, 400, 8], // grass, wall, then main grandstand / solar-roofed stand and car parks
      [4700, 'L', 0, 196, 18], // old Variante Bassa asphalt, gravel strip beyond
      [2, 'R', -2, 400, 4], // pit wall
      [400, 'L', 0, 220, 10],
      [400, 'R', 0, 220, 6], // grass verge, wall, service road, trees, Santerno river
      // Tamburello
      [620, 'R', 0, 60, 28],
      [680, 'R', 0, 80, 35],
      [760, 'R', 0, 140, 65], // the huge gravel bed between the chicane and the river wall
      [900, 'R', 0, 60, 35],
      [960, 'R', 0, 80, 18],
      [620, 'L', 0, 80, 15],
      [700, 'L', 0, 140, 18], // gravel inside the chicane
      [840, 'L', 0, 460, 6], // short grass then wall, park beyond
      // Tamburello to Villeneuve
      [1040, 'R', 0, 260, 20],
      // Villeneuve
      [1300, 'R', 0, 40, 20],
      [1340, 'R', 0, 160, 40],
      [1300, 'L', 0, 100, 15],
      [1400, 'L', 0, 130, 35],
      // to Tosa
      [1500, 'R', 0, 120, 10],
      [1530, 'L', 0, 110, 15],
      [1620, 'R', 0, 160, 45], // Tosa gravel
      [1640, 'L', 0, 140, 10],
      // Tosa to Piratella (uphill straight)
      [1780, 'L', 0, 500, 8],
      [1780, 'R', 0, 500, 10],
      // Piratella
      [2280, 'R', 0, 170, 50],
      [2450, 'R', 0, 110, 28],
      [2560, 'R', 0, 90, 18],
      [2280, 'L', 0, 400, 8],
      // Acque Minerali
      [2650, 'L', 0, 30, 10],
      [2680, 'L', 0, 60, 15],
      [2740, 'L', 0, 90, 40],
      [2830, 'L', 0, 70, 50],
      [2900, 'L', 0, 60, 30],
      [2650, 'R', 0, 300, 10],
      // to Variante Alta
      [2960, 'L', 0, 380, 6],
      [2950, 'R', 0, 390, 10],
      // Variante Alta
      [3340, 'R', 0, 70, 12],
      [3340, 'L', 0, 80, 12],
      [3410, 'R', 0, 50, 18],
      [3460, 'R', 0, 60, 20],
      [3420, 'L', 0, 90, 18],
      // descent to Rivazza
      [3510, 'L', 0, 550, 12],
      [3520, 'R', 0, 530, 10],
      // Rivazza
      [4050, 'R', 0, 50, 30],
      [4100, 'R', 0, 150, 55],
      [4250, 'R', 0, 170, 22],
      [4060, 'L', 0, 240, 12],
      // back onto the pit straight
      [4300, 'L', 0, 400, 8],
      [4420, 'R', 0, 476, 4], // pit wall from the pit entry
    ],
    paved: [
      [4700, 'L', 0, 196, 'asphalt'], // remains of the old Variante Bassa
      [620, 'R', 0, 60, 'asphalt'],
      [680, 'R', 0, 360, 'asphalt'], // narrow tarmac strip before the Tamburello gravel
      [1620, 'R', 0, 160, 'asphalt'], // tarmac strip before the Tosa gravel
      [2740, 'L', 0, 140, 'paint'], // Acque Minerali: green (then red at the apex) paint before gravel
      [3340, 'both', 0, 80, 'paint'], // Variante Alta: green paint all round
      [3410, 'R', 0, 110, 'paint'],
      [3420, 'L', 0, 90, 'asphalt'],
    ],
    traps: [
      [680, 'R', 0, 360, 4], // Tamburello outside (river side)
      [700, 'L', 0, 140, 1.2], // inside the Tamburello chicane
      [1310, 'R', 0, 190, 1.5], // Villeneuve outside
      [1410, 'L', 0, 120, 1.5], // Villeneuve exit, south side
      [1620, 'R', 0, 160, 5], // Tosa
      [2300, 'R', 0, 350, 1.5], // Piratella: long bed on the right from the left kink to the crest
      [2680, 'L', 0, 60, 1.2], // Acque Minerali approach
      [2740, 'L', 0, 220, 6], // Acque Minerali outside, behind the paint
      [3395, 'L', 0, 30, 8], // small bed between the Variante Alta's two parts
      [3410, 'R', 0, 50, 4], // Variante Alta exit
      [4050, 'R', 0, 370, 1.5], // Rivazza 1 and 2 outside
    ],
    sausages: [
      [880, 'apexes', -40, 60], // Tamburello
      [1410, 'apexes', -30, 40], // Villeneuve
      [3348, 'apexes', -25, 70], // Variante Alta
    ],
  },
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'grass',
  notes: `Imola (Autodromo Enzo e Dino Ferrari), driven anticlockwise. Esri imagery, ~0.43 m/px.
- Pit straight (4400 -> 0 -> 400): pits, paddock buildings, big paddock car park/truck park and a
  helipad north (driver's right) of the pit lane; beyond them the Santerno river runs west along
  the whole northern edge of the circuit. South (left): main grandstand (white roof) at 0-100, a long
  solar-panel-roofed grandstand at 150-300, car parks behind, then the town of Imola (houses) south-east.
  At 4700-4896 the left side is a wide grey asphalt area (remains of the old Variante Bassa) with a
  gravel strip behind it. Temporary seat rows on the grass south of 4450-4550.
- 400-650: track runs between the river (right, beyond a service road and a line of trees/scrub) and a
  stadium/athletics track and tennis courts (left, in trees).
- Tamburello (650-1000): enormous light-tan gravel bed on the outside (river side), up to ~65 m deep,
  with a white wall along the river bank; gravel also inside the chicane. Left after 850: wooded
  public park (Parco delle Acque Minerali, paths, a bandstand) behind a wall just a few metres away.
- 1000-1300: long grass verges both sides; river and riverside woods on the right (west), a service road
  with parked cars and farm fields on the left. Villeneuve (1300-1530): gravel both sides, white tyre
  barriers; a road bridge over the Santerno and a weir just to the west.
- Tosa hairpin (~1700): deep gravel on the outside behind a narrow tarmac strip; low garage/stand
  buildings with green roofs behind it; a public road loops around outside. Inside: grass, a farmhouse.
- 1780-2280 (climb to Piratella): narrow grass verges, a thin painted teal stripe outside the right
  edge (too narrow to model), olive groves, orchards and fields both sides; footbridge over the track
  at ~2110.
- Piratella (2300-2650): long gravel bed on the right; the left is wooded hillside with villas.
- Acque Minerali (2700-2960): gravel on the outside (left), with green then RED painted run-off
  at the apex (2830-2880) before the gravel; small stands in the trees above. Inside: dense woods.
- 2960-3340: straight along a tree line (left) and open fields (right); footbridge at ~3000.
- Variante Alta (3340-3520): green paint all round, small gravel beds, large blue-seated grandstands
  to the south (right), dark asphalt area on the left after the exit.
- 3520-4050 (downhill to Rivazza): grass verges, public road just beyond the right-hand wall, villas
  and gardens both sides; road bridge over the track at ~3920; grandstands (green roofs) at ~3950 right.
- Rivazza (4050-4420): deep gravel on the outside (right) against the town (houses, a roundabout).
  The large infield between Rivazza and the pit straight is bare earth/dry grass with seating rows.
- Other bridges over the track: a footbridge/gantry near the start line (~0) and another at ~290,
  one at ~4370 near the pit entry.`,
};
