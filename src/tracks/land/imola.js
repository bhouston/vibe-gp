// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Lap metres as labelled on the reference aerials (lap ~4896 m, driven anticlockwise; the start
// line is on the pit straight heading west, so the pits and the river are on the driver's RIGHT
// along the straight, and the main grandstands on the LEFT).
const GREEN = 0x1f9e78; // the teal-green run-off paint
const strip = (paint, m, beyond) => ({ paint: [paint, paint], strip: m, pattern: 'solid', ...(beyond ? { beyond } : {}) });

export default {
  surfaces: {
    gravel: 0xc8b48f, // light tan, almost sandy from above
    paint: [GREEN, GREEN],
    paintPattern: 'solid',
    widen: 0,
    width: [
      // pit straight and run to Tamburello
      [2, 'L', -2, 400, 8], // grass, wall, then the solar-roofed main stand and car parks
      [2, 'R', -2, 400, 4], // pit wall
      [400, 'L', 0, 220, 10],
      [400, 'R', 0, 220, 6], // grass verge, wall, service road, trees, Santerno river
      // Tamburello (widths from the river wall traced on the imagery)
      [620, 'R', 0, 60, 14],
      [664, 'R', 0, 20, 20],
      [684, 'R', 0, 30, 45],
      [714, 'R', 0, 92, 65], // the huge gravel bed between the chicane and the river wall
      [806, 'R', 0, 40, 55],
      [846, 'R', 0, 40, 42],
      [886, 'R', 0, 65, 28],
      [951, 'R', 0, 45, 23],
      [996, 'R', 0, 54, 17],
      [620, 'L', 0, 80, 15],
      [700, 'L', 0, 140, 18], // gravel inside the chicane
      [840, 'L', 0, 460, 6], // short grass then wall, park beyond
      // Tamburello to Villeneuve
      [1040, 'R', 0, 260, 20],
      // Villeneuve
      [1300, 'R', 0, 40, 25],
      [1324, 'R', 0, 35, 42],
      [1359, 'R', 0, 97, 55],
      [1456, 'R', 0, 30, 40],
      [1486, 'R', 0, 24, 22],
      [1300, 'L', 0, 100, 15],
      [1384, 'L', 0, 30, 22],
      [1414, 'L', 0, 97, 42],
      [1511, 'L', 0, 25, 18],
      // to Tosa
      [1500, 'R', 0, 120, 10],
      [1530, 'L', 0, 110, 15],
      [1620, 'R', 0, 40, 18], // Tosa gravel
      [1644, 'R', 0, 30, 32],
      [1674, 'R', 0, 51, 50],
      [1725, 'R', 0, 35, 28],
      [1760, 'R', 0, 20, 12],
      [1640, 'L', 0, 140, 10],
      // Tosa to Piratella (uphill straight)
      [1780, 'L', 0, 500, 8],
      [1780, 'R', 0, 500, 10],
      // Piratella
      [2300, 'R', 0, 35, 21],
      [2320, 'R', 0, 30, 35],
      [2350, 'R', 0, 60, 48],
      [2410, 'R', 0, 15, 35],
      [2425, 'R', 0, 30, 22],
      [2455, 'R', 0, 30, 12],
      [2485, 'R', 0, 90, 8],
      [2575, 'R', 0, 75, 12],
      [2280, 'L', 0, 400, 8],
      // Acque Minerali
      [2650, 'L', 0, 95, 7],
      [2745, 'L', 0, 30, 32],
      [2775, 'L', 0, 60, 36],
      [2835, 'L', 0, 90, 44],
      [2925, 'L', 0, 40, 28],
      [2650, 'R', 0, 300, 10],
      // to Variante Alta
      [2960, 'L', 0, 380, 6],
      [2950, 'R', 0, 390, 10],
      // Variante Alta
      [3340, 'R', 0, 35, 12],
      [3375, 'R', 0, 35, 16],
      [3340, 'L', 0, 80, 14],
      [3410, 'R', 0, 60, 16],
      [3470, 'R', 0, 45, 18],
      [3420, 'L', 0, 90, 26], // grass, with a dark asphalt yard behind it
      // descent to Rivazza
      [3510, 'L', 0, 475, 12],
      [3515, 'R', 0, 535, 10],
      // Rivazza
      [3985, 'L', 0, 25, 30], // infield bed before the turn-in
      [4010, 'L', 0, 30, 36],
      [4040, 'L', 0, 30, 43],
      [4070, 'L', 0, 25, 48],
      [4095, 'L', 0, 205, 12],
      [4050, 'R', 0, 45, 25],
      [4095, 'R', 0, 35, 50],
      [4130, 'R', 0, 25, 55],
      [4155, 'R', 0, 30, 43],
      [4185, 'R', 0, 30, 35],
      [4215, 'R', 0, 35, 25],
      [4250, 'R', 0, 50, 18],
      [4300, 'R', 0, 30, 22],
      [4330, 'R', 0, 30, 14],
      [4360, 'R', 0, 60, 8],
      // back onto the pit straight
      [4300, 'L', 0, 320, 9],
      [4620, 'L', 0, 170, 26], // gravel in front of the green-roofed stand
      [4790, 'L', 0, 60, 32], // old Variante Bassa tarmac with gravel behind it
      [4850, 'L', 0, 46, 22],
      [4420, 'R', 0, 476, 4], // pit wall from the pit entry
    ],
    paved: [
      [4790, 'L', 0, 106, 'asphalt'], // remains of the old Variante Bassa
      [645, 'R', 0, 70, strip(GREEN, 3.5)], // Tamburello entry, gravel behind it
      [2745, 'L', 0, 33, strip(GREEN, 6)], // Acque Minerali: green, white, then red at the apex
      [2775, 'L', 0, 58, strip(0xe6e3da, 9)],
      [2830, 'L', 0, 55, strip(0xd8393c, 11)],
      [3350, 'L', 0, 35, strip(GREEN, 3, 'grass')], // Variante Alta
      [3375, 'R', 0, 48, strip(GREEN, 14)],
      [3420, 'R', 0, 50, strip(GREEN, 3)],
      [3470, 'R', 0, 45, strip(GREEN, 18)],
    ],
    // Runs with different insets overlap by 20 m: each entry's ends taper over 10 m, and the
    // widest band wins, so abutting entries would leave a notch at the joint.
    traps: [
      [635, 'R', 0, 90, 3.5], // Tamburello outside (river side), behind the green strip
      [705, 'R', 0, 335, 2.5],
      [700, 'L', 0, 140, 1.2], // inside the Tamburello chicane
      [1310, 'R', 0, 190, 1.5], // Villeneuve outside
      [1410, 'L', 0, 120, 1.5], // Villeneuve exit, south side
      [1620, 'R', 0, 125, 1.5], // Tosa
      [2300, 'R', 0, 345, 1.5], // Piratella: long bed on the right from the left kink to the crest
      [2670, 'L', 0, 95, 1.5], // Acque Minerali approach
      [2735, 'L', 0, 55, 6], // behind the green
      [2770, 'L', 0, 72, 9], // behind the white
      [2820, 'L', 0, 75, 11], // behind the red
      [2875, 'L', 0, 90, 1.5],
      [3400, 'R', 0, 80, 3], // Variante Alta exit
      [3985, 'L', 0, 110, 4], // Rivazza infield bed (half of it reads darker on the imagery)
      [4060, 'R', 0, 175, 1.5], // Rivazza 1
      [4260, 'R', 0, 140, 1.5], // Rivazza 2
      [4640, 'L', 0, 170, 1.5], // pit straight, before the old chicane
      [4770, 'L', 0, 126, 15], // behind the old Variante Bassa tarmac
    ],
    sausages: [
      [880, 'apexes', -40, 60], // Tamburello
      [1410, 'apexes', -30, 40], // Villeneuve
      [3348, 'apexes', -25, 70], // Variante Alta
    ],
  },
  bridges: [
    [16, 'foot'], [275, 'foot'], [2120, 'foot'], [2985, 'foot'], [3925, 'road'], [4412, 'foot'],
  ],
  stands: [
    [120, 'L', 0, 150, 16], // main stand, solar roof
    [2930, 'L', 0, 50, 6], // green-roofed stands above Acque Minerali (the game currently rejects this spot)
    [3400, 'R', 0, 90, 12], // blue seating at Variante Alta
    [3950, 'R', 0, 90, 10], // green-roofed stands before Rivazza
    [4450, 'L', 0, 130, 8], // seating banks on the Rivazza infield
    [4655, 'L', 0, 120, 10], // green-roofed stand behind the pit-straight gravel
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'grass',
  // OSM maps these as (event) car parks, but they are fields and orchards on the imagery
  areas: [
    { kind: 'farmland', pts: [[-845, -455], [-845, -505], [-610, -600], [-505, -610], [-525, -500], [-700, -470], [-815, -452]] },
    { kind: 'meadow', pts: [[-810, 215], [-695, 165], [-720, 142], [-686, 106], [-600, 160], [-490, 176], [-485, 203], [-640, 282], [-672, 263], [-762, 306]] },
    { kind: 'meadow', pts: [[212, -382], [232, -420], [150, -466], [112, -526], [84, -504], [66, -452]] },
    // the bare, dry infield inside Rivazza
    { kind: 'meadow', noTrees: true, pts: [[508, -51], [631, 27], [627, 62], [610, 74], [476, 42], [506, -24]] },
  ],
  notes: `Imola (Autodromo Enzo e Dino Ferrari), driven anticlockwise. Esri imagery, ~0.43 m/px.
The game's centreline sits a few metres off the real asphalt in places (about 3 m right of centre at
lap 2000, about 5 m left at lap 1200), so barriers can look shifted against the photo.
- Pit straight (4400 -> 0 -> 400): pits, paddock, truck park and a helipad north (driver's right) of
  the pit lane; beyond them the Santerno runs west along the whole northern edge of the circuit.
  South (left): gravel at 4640-4790 with a green-roofed stand behind it, then the tarmac of the old
  Variante Bassa at 4790-4896 with gravel behind that; a white-roofed building at about 0-80 set back
  beyond a road; the solar-roofed main stand at about 120-270; car parks behind; then town houses.
  Seating banks on the grass south of 4450-4580.
- 400-650: between the river (right, beyond a service road and trees) and the athletics stadium and
  tennis courts (left, in trees).
- Tamburello (640-1040): enormous light-tan gravel bed on the outside (river side), up to ~65 m deep,
  with a white wall along the river bank; green strip at the entry; gravel inside the chicane. Left
  after 850: wooded public park (paths, a bandstand) behind a wall a few metres away.
- 1040-1300: long grass verges; river and riverside woods on the right, a service road with parked
  cars and farm fields on the left. Villeneuve (1300-1530): gravel both sides, white barriers; a
  bridge over the Santerno just to the west.
- Tosa hairpin (~1700): deep gravel on the outside, green-roofed stands behind it, a public road
  beyond. Inside: grass, a farmhouse and a small dark pad at about 1650-1690.
- 1780-2280 (climb to Piratella): narrow grass verges, olive groves, orchards and fields both sides.
- Piratella (2300-2650): long gravel bed on the right; on the left a wooded hillside with villas.
- Acque Minerali (2680-2965): gravel on the outside (left), with green, white, then red paint at the
  track edge before it; green-roofed stands above. Inside: dense woods.
- 2960-3340: straight along a tree row (left) and open fields (right).
- Variante Alta (3340-3515): green paint, a gravel strip at the exit, blue seating to the south
  (right), and on the left grass with a small gravel patch and a dark asphalt yard behind it.
- 3515-4050 (downhill to Rivazza): grass verges, public road just beyond the right-hand wall, villas
  and gardens both sides; green-roofed stands at about 3950-4040 on the right.
- Rivazza (3985-4400): gravel bed on the infield before the turn-in (half of it reads darker, so
  it may be a different surface); deep gravel on the outside against the town (houses, a roundabout).
  The rest of the infield is bare earth and dry grass.`,
};
