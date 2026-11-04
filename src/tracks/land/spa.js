// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Spa-Francorchamps, from Esri World Imagery (post-2022 rebuild: new Raidillon grandstand, gravel
// back at Les Combes, Malmedy, Bruxelles, Pouhon, Fagnes, Campus, Stavelot, Paul Frere and
// Blanchimont). Anchors are lap metres as labelled on the reference crops (lap = 6975 m).
// Widths: track edge to barrier face, measured at ~0.38 m/px; expect +-3 m.
const GREEN = 0x1f9a72, GREEN_2 = 0x2aa67c; // Spa's teal-green painted run-off
const YELLOW = 0xe8c23a;
const STRIP = { paint: [0xc8302a, YELLOW], strip: 4, beyond: 'grass' }; // red/yellow edge strip
const ASPHALT_THEN_GRASS = { paint: [0x3d3f43, 0x3d3f43], strip: 10, beyond: 'grass' };

export default {
  surfaces: {
    gravel: 0xc4b8a0, // pale beige-grey Ardennes stone (reads almost cream from above)
    paint: [0xc8302a, 0xe8c23a], // Spa's red/yellow painted run-off (Raidillon, Bus Stop, Speaker's Corner)
    widen: 0,
    width: [
      // start/finish straight and La Source approach: grass/asphalt verge to the wall on the
      // left, pit wall on the right
      [6780, 'L', 0, 195, 15],
      [0, 'L', 0, 150, 17],
      [6770, 'R', 0, 205, 3],
      [0, 'R', 0, 180, 3],
      // La Source: straight-on asphalt escape, then a big gravel trap round the outside
      [150, 'L', 0, 50, 30],
      [200, 'L', 0, 120, 50],
      [320, 'L', 0, 70, 30],
      [180, 'R', 0, 60, 12], // inside of the hairpin, asphalt (green painted patch at the apex)
      // downhill to Eau Rouge: pit-exit lane walled off on the right, wide grass on the left
      [240, 'R', 0, 600, 4],
      [390, 'L', 0, 180, 40],
      [570, 'L', 0, 190, 30],
      [760, 'L', 0, 70, 40],
      [830, 'L', 0, 50, 25],
      [840, 'R', 0, 40, 12],
      // Eau Rouge / Raidillon
      [880, 'L', 0, 170, 40], // outside of Raidillon: red/yellow paint
      [1050, 'L', 0, 250, 28], // green paint up to the Raidillon grandstand wall
      [880, 'R', 0, 170, 20], // inside of Raidillon: grass bank to the service road
      [1050, 'R', 0, 270, 40], // exit of Raidillon: broad red/yellow paint to the tyre wall
      // Kemmel straight
      [1300, 'L', 0, 150, 8],
      [1450, 'L', 0, 550, 35], // wide grass, gravel service track behind
      [2000, 'L', 0, 80, 20],
      [1320, 'R', 0, 760, 15],
      // Les Combes (T5 right, T6 left) and on to Malmedy
      [2080, 'L', 0, 140, 15],
      [2080, 'R', 0, 120, 10],
      [2200, 'R', 0, 60, 12],
      [2220, 'L', 0, 40, 30], // straight-on asphalt escape road
      [2260, 'L', 0, 70, 40], // dark asphalt inside the T6 left-hander
      [2260, 'R', 0, 80, 40],
      [2330, 'R', 0, 130, 25],
      [2330, 'L', 0, 110, 30],
      // Malmedy (right) and the run down to Bruxelles
      [2440, 'L', 0, 120, 40],
      [2560, 'L', 0, 60, 20],
      [2620, 'L', 0, 160, 10], // campervan park right behind the fence
      [2460, 'R', 0, 320, 12],
      // Bruxelles / Rivage hairpin (right)
      [2780, 'L', 0, 180, 30],
      [2960, 'L', 0, 50, 35],
      [2780, 'R', 0, 220, 15],
      [3010, 'L', 0, 110, 25],
      [3000, 'R', 0, 90, 6],
      // Speaker's Corner (left) and the run to Pouhon
      [3090, 'R', 0, 50, 15],
      [3140, 'R', 0, 150, 15],
      [3120, 'L', 0, 170, 15], // parallel asphalt lane, grandstand behind
      [3290, 'L', 0, 310, 10],
      [3290, 'R', 0, 190, 15],
      [3480, 'R', 0, 140, 8],
      // Pouhon (double left): asphalt then gravel on the outside
      [3620, 'R', 0, 60, 40],
      [3680, 'R', 0, 240, 50],
      [3920, 'R', 0, 180, 38],
      [4100, 'R', 0, 100, 30],
      [3600, 'L', 0, 330, 10],
      [3930, 'L', 0, 220, 8],
      // Fagnes (right) / Campus (left)
      [4150, 'L', 0, 70, 6],
      [4220, 'L', 0, 190, 38],
      [4200, 'R', 0, 230, 15],
      [4430, 'R', 0, 110, 35],
      [4540, 'R', 0, 100, 18],
      [4640, 'R', 0, 60, 15],
      [4410, 'L', 0, 290, 15],
      // Stavelot (right) and Courbe Paul Frere
      [4700, 'L', 0, 40, 20],
      [4740, 'L', 0, 280, 32],
      [5020, 'L', 0, 110, 28],
      [4700, 'R', 0, 450, 8],
      // run to Blanchimont
      [5130, 'L', 0, 400, 30],
      [5150, 'R', 0, 410, 8], // karting track / car park fence
      [5530, 'L', 0, 150, 10],
      [5560, 'R', 0, 100, 6],
      // Blanchimont (left): asphalt then long gravel trap on the outside
      [5660, 'R', 0, 570, 32],
      [5680, 'L', 0, 270, 10],
      [5950, 'L', 0, 150, 25],
      [6100, 'L', 0, 340, 10],
      [6230, 'R', 0, 210, 30],
      // Bus Stop chicane
      [6440, 'L', 0, 180, 18],
      [6440, 'R', 0, 120, 6],
      [6560, 'R', 0, 60, 12],
      [6620, 'R', 0, 150, 22],
      [6620, 'L', 0, 160, 30], // old chicane escape: plain asphalt and a concrete pad
    ],
    paved: [
      [150, 'L', 0, 50, 'asphalt'],
      [180, 'R', 0, 60, 'asphalt'],
      [390, 'L', 0, 260, ASPHALT_THEN_GRASS], // old wide straight: ~10 m tarmac, then grass
      [760, 'L', 0, 70, 'asphalt'],
      [880, 'L', 0, 170, 'paint'],
      [1050, 'L', 0, 250, { paint: [GREEN, GREEN_2] }], // green paint up to the Raidillon grandstand
      [195, 'R', 0, 30, { paint: [GREEN, GREEN_2] }], // green patch at the La Source apex
      [2080, 'L', 0, 130, STRIP], // red/yellow painted strip, grass behind
      [2550, 'R', 0, 110, STRIP],
      [4150, 'L', 0, 70, STRIP],
      [4600, 'L', 0, 110, STRIP],
      [4640, 'R', 0, 70, STRIP],
      [1050, 'R', 0, 270, 'paint'],
      [2220, 'L', 0, 40, 'asphalt'],
      [2260, 'L', 0, 70, 'asphalt'],
      [2780, 'L', 0, 180, 'asphalt'],
      [3090, 'R', 0, 200, 'paint'],
      [3120, 'L', 0, 170, 'asphalt'],
      [3480, 'R', 0, 140, { paint: [YELLOW, YELLOW], strip: 3, beyond: 'grass' }],
      [3620, 'R', 0, 580, 'asphalt'],
      [5130, 'L', 0, 400, 'asphalt'],
      [5660, 'R', 0, 570, 'asphalt'],
      [6440, 'L', 0, 180, 'paint'],
      [6440, 'R', 0, 120, { paint: [GREEN, GREEN_2], strip: 5, beyond: 'grass' }],
      [6560, 'R', 0, 60, { paint: [GREEN, GREEN_2] }], // green triangle at the first apex
      [6620, 'R', 0, 150, 'paint'],
      [6620, 'L', 0, 160, 'asphalt'],
    ],
    traps: [
      [200, 'L', 0, 190, 3], // La Source
      [2200, 'R', 0, 60, 1.2], // inside of Les Combes T5
      [2260, 'R', 0, 200, 1.2], // outside of the T6 left and on to Malmedy
      [2440, 'L', 0, 180, 1.2], // Malmedy
      [2780, 'L', 0, 180, 10], // Bruxelles, behind ~10 m of asphalt
      [2960, 'L', 0, 50, 3],
      [3140, 'R', 0, 150, 4], // after Speaker's Corner, behind a painted strip
      [3620, 'R', 0, 580, 16], // Pouhon, behind ~15-20 m of asphalt
      [4220, 'L', 0, 190, 1.2], // Fagnes
      [4430, 'R', 0, 210, 1.2], // Campus
      [4700, 'L', 0, 430, 1.2], // Stavelot / Paul Frere
      [5130, 'L', 0, 400, 10], // run to Blanchimont, behind asphalt
      [5660, 'R', 0, 570, 10], // Blanchimont, behind asphalt
    ],
    sausages: [],
  },
  bridges: [
    [3390, 'gantry'],
    [4180, 'gantry'],
    [4630, 'foot'],
    [5570, 'foot'],
    [6355, 'foot'],
  ],
  kerb: { colors: [0xd0201c, 0xf5c400] }, // red/yellow throughout (confirmed on the imagery)
  ground: 'grass',
  scenery: { conifer: 0.75 }, // Ardennes spruce plantations dominate (Kemmel, Pouhon, Blanchimont)
  areas: [
    // OSM marks the event fields SE of Malmedy / along the run to Bruxelles as car park
    // (dark asphalt); on the imagery they are grass fields used for camping.
    { kind: 'meadow', pts: [[472, -892], [545, -865], [640, -865], [640, -945], [530, -945], [430, -1005], [330, -1010], [300, -1012]] },
  ],
  notes: `Imagery is post-2022: the Raidillon grandstand exists and the beige gravel traps are back at
most corners; tyre/TecPro walls round the traps are covered in red/yellow (the Wallonia colours).

Surfaces the format only approximates:
- Raidillon and Bus Stop red/yellow paint is in long bands running ALONG the track (red,
  pink, yellow, cream, like a rainbow), not diagonal stripes. Green (teal) paint: inside of
  Raidillon 1050-1300 L, Bus Stop 6440-6620 R, La Source apex - set as paint objects.
- Many traps are asphalt-then-gravel (Bruxelles, Pouhon, run to Blanchimont, Blanchimont):
  a 8-20 m dark asphalt band next to the kerb, then gravel to the wall.
- Sausage kerbs not resolvable at this resolution (0.38 m/px), so none are placed.

Surroundings (beyond the barriers):
- Start straight / La Source: paddock, pit building and team hospitality on the right (east),
  big red-roofed building at ~6800 L, large gravel car parks west of the straight, buildings and
  small grandstands outside La Source, a big open grass/scrub slope NE of La Source/400-600.
- 500-900: grandstands (blue seats) along the left from 450 to 900, a big paved event
  car park beyond; on the right the paddock/media buildings and trucks.
- Eau Rouge: a public road runs just west of Eau Rouge/Raidillon, with buildings and trees; the new tall Raidillon grandstand sits on the left from ~1000 to ~1180.
- Kemmel straight (1300-2100): dense spruce forest on both sides; a public road (N-road)
  parallels it ~150-200 m east; gravel service tracks along both sides.
- Les Combes / Malmedy: forest west; open fields and a public road east; campervan/caravan
  park and a farm-field patchwork south of Malmedy and along 2550-2800 L.
- Bruxelles: forest inside the hairpin (the old track loop forms a grey ring road round it);
  car park and farmland (yellow-green fields) to the south-west.
- Speaker's Corner to Pouhon: blue-seat grandstand at 3150-3300 L; forest both sides; open
  grass/scrub field inside Pouhon and a gravel car park/spectator area outside it.
- Fagnes/Campus: forest; a large gravel spectator/car park area inside (north) of Fagnes.
- Stavelot / Paul Frere: circuit buildings (medical/race control style flat-roofed blocks)
  inside Stavelot, a helipad (circle) at ~5000 L beyond the gravel, public road and
  roundabout west, fields south.
- 5150-5550 R: a karting track and its car park directly beside the circuit.
- Structures over the track (in \`bridges\`): thin dark crossings on the imagery at ~3390,
  ~4180 (gantries?), ~4630, ~5570 and ~6355 (footbridges). Types are guesses from shadows.
- Blanchimont: forest left; gravel service area, a small water/retention basin (light blue,
  ~6200 R behind the barrier) and a truck park on the right.
- Bus Stop: hospitality tents/marquees (white) west at 6450-6550, paddock buildings east.
Ground overall: grass verges, Ardennes conifer/beech forest everywhere not built on.`,
};
