// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Zandvoort: narrow grass verges and close walls/fences almost everywhere, with very pale
// (near-white from above) gravel traps at the slow/medium corners, a few plain asphalt
// run-offs, and open dunes (marram grass, scrub, sand blowouts, small ponds) all around.
export default {
  surfaces: {
    gravel: 0xd8cfba, // light beige-grey dune gravel (reads almost white on the imagery)
    widen: 0,
    width: [
      // main straight: thin grass strip then wall on the left (grandstands); pit wall on the right
      [0, 'L', 0, 260, 6],
      [0, 'R', 0, 260, 3],
      // Tarzanbocht: asphalt escape straight on, then the big gravel trap round the outside
      [260, 'L', 0, 60, 18],
      [320, 'L', 0, 60, 40],
      [380, 'L', 0, 50, 25],
      [430, 'L', 0, 50, 20],
      [480, 'L', 0, 50, 15],
      [260, 'R', 0, 300, 8],
      // back stretch to Gerlach: grass verges, walls/fences close
      [530, 'L', 0, 120, 7],
      [560, 'R', 0, 90, 6],
      // Gerlachbocht: asphalt strip + gravel to a red/white tyre wall outside, pit lane wall inside
      [650, 'L', 0, 30, 10],
      [680, 'L', 0, 100, 14],
      [650, 'R', 0, 130, 5],
      // Hugenholtzbocht (banked left hairpin): wall + tyres right at the outside edge, grass bank inside
      [780, 'R', 0, 120, 4],
      [780, 'L', 0, 140, 10],
      // exit: dark asphalt run-off on the inside/left, grass + barrier on the right
      [920, 'L', 0, 80, 15],
      [900, 'R', 0, 100, 9],
      // Hunserug: grass verges both sides
      [1000, 'both', 0, 300, 9],
      // Slotemakerbocht: wide asphalt on the right (junction with the short-circuit link road)
      [1300, 'R', 0, 120, 30],
      [1300, 'L', 0, 250, 6],
      [1420, 'R', 0, 130, 7],
      // run to Scheivlak: light asphalt apron on the left, then the long gravel trap round the outside
      [1550, 'L', 0, 70, 15],
      [1620, 'L', 0, 40, 20],
      [1660, 'L', 0, 60, 30],
      [1720, 'L', 0, 80, 24],
      [1800, 'L', 0, 80, 18],
      [1880, 'L', 0, 40, 8],
      [1920, 'L', 0, 110, 7],
      [1550, 'R', 0, 450, 6],
      // Mastersbocht: wedge of gravel to a tyre wall outside, then a strip of asphalt along the wall
      [2030, 'L', 0, 30, 12],
      [2060, 'L', 0, 30, 40],
      [2090, 'L', 0, 40, 22],
      [2130, 'L', 0, 100, 10],
      [2000, 'R', 0, 200, 8],
      // right-hander at the west end (T10): gravel outside
      [2230, 'L', 0, 50, 30],
      [2280, 'L', 0, 40, 20],
      [2320, 'L', 0, 30, 10],
      [2350, 'L', 0, 90, 7],
      [2200, 'R', 0, 240, 7],
      // long left loop round the inner car park (T11/T12): big gravel trap outside (right)
      [2430, 'R', 0, 40, 22],
      [2470, 'R', 0, 90, 32],
      [2560, 'R', 0, 60, 20],
      [2620, 'R', 0, 50, 11],
      [2440, 'L', 0, 240, 10],
      // back straight to the chicane: grass verges, link road joins on the right
      [2670, 'both', 0, 420, 8],
      [2705, 'R', 0, 60, 20],
      // Hans Ernst chicane: gravel 'D' (with a flat advertising panel) on the left, grass outside
      [3090, 'L', 0, 40, 30],
      [3130, 'L', 0, 70, 45],
      [3200, 'L', 0, 30, 25],
      [3230, 'L', 0, 70, 5],
      [3080, 'R', 0, 220, 9],
      [3300, 'both', 0, 160, 9],
      // T13 right-hander: light asphalt run-off outside to a tyre wall
      [3460, 'L', 0, 30, 14],
      [3490, 'L', 0, 50, 22],
      [3540, 'L', 0, 80, 18],
      [3620, 'L', 0, 50, 10],
      [3460, 'R', 0, 210, 9],
      // Arie Luyendykbocht (banked): wall a few metres off on both sides
      [3670, 'L', 0, 280, 4],
      [3670, 'R', 0, 280, 5],
      // final straight
      [3950, 'L', 0, 295, 6],
      [3950, 'R', 0, 295, 4],
    ],
    paved: [
      [260, 'L', 0, 120, 'asphalt'], // Tarzan straight-on escape
      [680, 'L', 0, 100, 'asphalt'], // Gerlach: strip before the gravel
      [920, 'L', 0, 80, 'asphalt'], // Hugenholtz exit, inside
      [1300, 'R', 0, 120, 'asphalt'], // Slotemaker / link-road junction
      [1550, 'L', 0, 70, 'asphalt'], // apron before Scheivlak
      [2130, 'L', 0, 100, 'asphalt'], // Mastersbocht exit along the tyre wall
      [2705, 'R', 0, 60, 'asphalt'], // link road from Slotemaker joins (behind a wall in reality)
      [3460, 'L', 0, 210, 'asphalt'], // T13 outside
    ],
    traps: [
      [370, 'L', 0, 165, 2], // Tarzanbocht
      [690, 'L', 0, 90, 4], // Gerlachbocht (behind the asphalt strip)
      [1620, 'L', 0, 300, 2], // Scheivlak
      [2030, 'L', 0, 100, 2], // Mastersbocht
      [2230, 'L', 0, 120, 2], // T10
      [2430, 'R', 0, 240, 2], // T11/T12 loop
      [3090, 'L', 0, 140, 2], // Hans Ernst chicane
    ],
    sausages: [],
  },
  bridges: [
    [100, 'foot'], // footbridge over the main straight (pit straight, ~100 m after the line)
    [1915, 'foot'], // footbridge after Scheivlak
    [2830, 'foot'], // footbridge over the back straight towards the chicane
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'dunes',
  // open dunes: marram grass and low scrub, few trees; pale tan and grey-green from above
  scenery: { landTrees: { scrub: 0.02 }, landColors: { scrub: 0xa9a27c, scrubDark: 0x8a8c62 } },
  areas: [
    // paved car park inside the Tarzan hairpin (OSM leaves it as grass)
    { kind: 'asphalt', over: true, pts: [[134.1, 279.9], [170.5, 279.9], [179.6, 263.5], [168.7, 205.2], [141.4, 201.6], [114.1, 210.7], [121.4, 245.3]] },
    // the short-circuit link road between Slotemakerbocht (~1310/1400) and the back straight (~2730)
    { kind: 'asphalt', over: true, pts: [[467.6, -68.8], [477.6, -78.8], [479.4, -96.1], [527.6, -91.5], [518.5, -85.2], [518.5, -70.6], [529.5, -52.4], [544, -34.2], [554.9, -21.5], [536.7, -26.9], [514.9, -37.8], [481.2, -59.7]] },
    { kind: 'grass', over: true, pts: [[484, -60.6], [498.5, -71.5], [509.4, -68.8], [518.5, -54.2], [533.1, -32.4], [514.9, -39.7]] },
  ],
  notes: `Circuit Zandvoort, in the coastal dunes right behind the North Sea beach (the beach and sea are
~300-400 m west of the main straight, beyond the coast road, a holiday-bungalow park and a big paved plaza).
Run-off is generally tight: 3-10 m grass verges to walls/catch fences on most straights; tyre walls are
red/white stacks. Gravel is very pale (near white from the air).
- Main straight (3950-260): left = grass strip, wall, main grandstand (large white roof at the start
  line) and a vast paved area/car park; right = pit wall, pit building and paddock (trucks, cars).
  Pit lane runs between the main straight and the Tarzan-to-Gerlach return stretch.
- Tarzanbocht (300-520): dark asphalt escape straight on, then a large gravel trap round the outside to a
  red/white tyre wall; inside is a grassy bank with a car park in the middle of the hairpin. Open dunes
  beyond the outer fence.
- 520-680: dunes on the left (east), paddock car park on the right.
- Hugenholtzbocht (780-920): steeply banked left hairpin (~19 deg), concrete wall + red/white tyres hard
  against the outside; grassy mound with bushes inside. Hunserug (1000-1300) climbs over a dune crest:
  open dunes and sandy paths north, a service hall/building and paved areas south.
- Slotemakerbocht (~1350) is banked; a short-circuit link road leaves to the south here and rejoins at ~2750.
- Scheivlak (1650-1900) drops downhill through a fast right with a long gravel trap on the outside; dense
  dune scrub/woodland beyond the outer fence (a maintenance road runs parallel). Inside is rough dune scrub
  with small ponds.
- Mastersbocht (~2050) and the west end (2200-2350): ponds with reed/trees inside, sports fields and
  more ponds south/west beyond the fences.
- 2430-2680 loop: left-hand curve round a paved car park (grass with large letters on the inside verge),
  big gravel trap outside.
- 2700-3080: straight between a pond (south, 2700-2850) and a large unpaved/dirt car park (south),
  paddock hall and car parks north.
- Hans Ernst chicane (3080-3230): the area inside is gravel with a large flat sponsor panel and a tyre wall;
  huge paved paddock/old-track asphalt west of it.
- 3300-3460: car park and two large ponds to the east; T13 has a light asphalt run-off to a tyre wall.
- Arie Luyendykbocht (3650-3950): banked ~18 deg right-hander along a dune slope, walls close on both
  sides; a grandstand/building on the dune outside (~3800), scrubby wood inside, bungalow park south-west.
Beyond barriers everywhere: dunes (marram grass, low scrub, sand blowouts, small ponds), few trees.`,
};
