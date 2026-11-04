// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Jeddah Corniche: a walled street circuit, so concrete walls sit 2-4 m from the track edge for most
// of the lap. There is no gravel or grass run-off. The only real run-off is painted asphalt in
// decorated patches (blue, purple and pink graphics) at the corners and in the gaps between the two
// carriageways. In the game the lap runs north from the start, around the north hairpin (2250-2450),
// south along the seafront, along the spit between the sea and the lagoon (4550-5300), round the south
// hairpin (5400-5550) and north up the main straight.
export default {
  surfaces: {
    gravel: 0xb8a582, // unused: there are no gravel traps
    paint: [0x2b4fa8, 0x7a5cb5], // royal blue + violet, the main colours of the decorated run-off
    widen: 0,
    width: [
      // default: concrete walls hard against the track
      [0, 'both', 0, 6179, 3],
      // main straight: pit wall on the left, grandstand wall on the right
      [5880, 'L', 0, 600, 2.5],
      // T1 (left), outside: black/white chequered painted strip
      [340, 'R', 0, 80, 12],
      // T2-T3 north exit: pink strip between the carriageways (L), painted F1-car plaza (R)
      [420, 'L', 0, 110, 8],
      [420, 'R', 0, 110, 15],
      // left-hand bend toward the car park: violet "camel" painted area on the right
      [880, 'R', 0, 120, 25],
      // cream painted run-off on the right, out to the red/white barrier along the car park
      [1200, 'R', 0, 30, 18],
      [1230, 'R', 0, 30, 30],
      [1260, 'R', 0, 50, 40], // the barrier's sharp corner
      [1310, 'R', 0, 40, 32],
      [1350, 'R', 0, 40, 18],
      [1390, 'R', 0, 50, 8],
      // esses: wide violet/pink painted area on the left, violet chequered strip on the right
      [1380, 'L', 0, 260, 30],
      [1580, 'R', 0, 140, 20],
      // north hairpin: big blue/violet wave-painted run-off on the outside; park on the inside
      [2240, 'R', 0, 190, 45],
      [2240, 'L', 0, 190, 4],
      // southbound behind the hairpin: light-blue painted strip with a diamond pattern on the right
      [2560, 'R', 0, 270, 10],
      // the right/left flick at 3000: pink/yellow sun-graphic painted wedge on the left
      [2960, 'L', 0, 160, 30],
      // returning past T1: pink strip between the carriageways (L), big blue run-off with the sponsor logo (R)
      [4130, 'L', 0, 100, 8],
      [4180, 'R', 0, 140, 50],
      // lagoon side: a dark asphalt apron between the track and the lagoon wall
      [4690, 'L', 0, 180, 20],
      // south hairpin: painted circle on the inside, blue/white chequered run-off on the outside
      [5380, 'L', 0, 180, 22],
      [5380, 'R', 0, 180, 25],
    ],
    paved: [
      // the narrow strip between kerb and wall: plain grey tarmac/concrete
      [0, 'both', 0, 6179, 'asphalt'],
      // decorated painted patches, each in its own colours
      [340, 'R', 0, 80, { paint: [0x1c1c1c, 0xe8e8e8] }], // black/white chequers outside T1
      [420, 'L', 0, 110, { paint: [0xe0508f, 0xf0e4ec] }], // pink/white strip between the carriageways
      [420, 'R', 0, 110, { paint: [0x1f4a55, 0x1f4a55], pattern: 'solid' }], // dark teal F1-car plaza
      [880, 'R', 0, 120, { paint: [0x6a55b0, 0x6a55b0], pattern: 'solid' }], // violet "camel" area
      [1200, 'R', 0, 240, { bands: [[24, 0xefe2b6], [4.5, 0x1f5a44], [20, 0xefe2b6]] }], // flat cream, dark green stripe near the barrier
      [1380, 'L', 0, 100, { paint: [0x7a5cb5, 0x7a5cb5], pattern: 'solid' }], // violet
      [1480, 'L', 0, 160, { bands: [[3, 0xf6ead0], [30, 0xe8689a]] }], // hot pink, cream by the kerb
      [1580, 'R', 0, 140, { paint: [0x7a5cb5, 0x7a5cb5], pattern: 'solid' }], // violet with white chequered flags
      [2240, 'R', 0, 190, { paint: [0x3550b0, 0x8a5ab8], pattern: 'along' }], // blue/violet waves, north hairpin
      [2560, 'R', 0, 270, { paint: [0x5fb8d8, 0x5fb8d8], pattern: 'solid' }], // light blue with dark-blue diamonds
      [2960, 'L', 0, 160, { bands: [[14, 0xe8689a], [6, 0x2a3a90], [12, 0xf0b030]] }], // pink, navy zigzag, yellow sunburst
      [4130, 'L', 0, 100, { paint: [0xe0508f, 0xf0e4ec] }], // pink/white strip
      [4180, 'R', 0, 140, { paint: [0x2550b0, 0x2550b0] }], // plain royal blue with a white sponsor logo
      [4690, 'L', 0, 180, 'asphalt'], // dark apron by the lagoon
      [5380, 'L', 0, 180, { paint: [0x4f8fd0, 0x2a4f9a], pattern: 'along' }], // painted circle inside the south hairpin
      [5380, 'R', 0, 180, { bands: [[18, 0x1f4a55], [10, 0xdfe4ee]] }], // dark teal, pale chequered edge
      [5880, 'L', 0, 110, { paint: [0xd8406a, 0xe8e8e8] }], // red/white painted pit-entry island
    ],
    traps: [],
    sausages: [],
  },
  bridges: [
    [540, 'road'], [4075, 'road'], // hospitality/grandstand bridge over both legs north of T1-T3
    [4335, 'road'], // building bridge over the leg after the blue run-off
    [1157, 'foot'], [3480, 'foot'], // footbridge over both legs by the car park
    [1900, 'foot'], [2760, 'foot'], // footbridge over both legs south of the hairpin
    [5790, 'foot'], [5895, 'foot'], // footbridges on the run up to the main straight
  ],
  stands: [
    // long white-roofed main stand opposite the pits
    [6075, 'R', 0, 270, 16],
    [190, 'R', 0, 125, 16], // open tiered stand, nine blocks, on to T1
    [1190, 'L', 0, 75, 12], // white-roofed block between the legs (probably a stand)
    [3390, 'L', 0, 80, 12], // its twin, facing the seafront leg
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] }, // red/white seen at 3600-3700; elsewhere the photo shows white/dark dashes (one colour pair only)
  ground: 'paved',
  scenery: { trees: 0, paved: true, illuminated: true, city: true, tall: 1.4, sea: 'west', paint: [0x4a4c50, 0x4a4c50] }, // paint: plain grey verge behind the walls
  areas: [
    // the spit 4550-5300: the road and promenade between the track and the sea wall. OSM's coastline
    // is already within ~10 m of the photo here; this mainly gives the strip a concrete look
    { kind: 'concrete', pts: [[-283, -55], [-281.7, -82.6], [-287.2, -115.9], [-281.7, -149.2], [-267.8, -204.7], [-253.9, -254.6],
      [-244.9, -300.4], [-231.0, -355.8], [-208.8, -411.3], [-172.8, -466.7], [-139.5, -511.1], [-122.9, -544.4], [-118.6, -583.1],
      [-76.1, -561.1], [-90.2, -546.3], [-102.3, -532.7], [-113.7, -517.7], [-125.7, -501.8], [-137.4, -485.3], [-148.4, -468.1],
      [-163.2, -444.2], [-173.1, -426.5], [-182.1, -408], [-191.2, -387.8], [-201.5, -361.2], [-211.6, -332.7], [-218.8, -309.6],
      [-225.3, -286.1], [-230, -264.2], [-234.4, -242.5], [-240.3, -219.8], [-245.4, -198.3], [-248.7, -177.9], [-250.7, -157.5],
      [-251.4, -132.9], [-250.2, -110.2], [-247.3, -87.8], [-243.9, -69.6], [-239.4, -51.6]] },
    // the concrete promenade along the lagoon side, 4565-5300, which OSM leaves as water
    { kind: 'concrete', pts: [[-196.8, 10], [-211.4, -20.9], [-223.2, -53.5], [-230.9, -86.6], [-234.7, -120.5], [-234.7, -154.9],
      [-230.7, -188.7], [-223.2, -222.2], [-215.2, -256.6], [-207.5, -290.3], [-197.7, -323.6], [-186.3, -356.2], [-173.4, -388.3],
      [-158.8, -419.4], [-141.2, -449.4], [-122.6, -478.5], [-102.1, -506.6], [-80.4, -533.3], [-56.2, -557.7], [-30.5, -581.1],
      [-3.7, -602.5], [24.7, -622.7], [32, -612], [3.9, -591.9], [-21.9, -571.4], [-47.3, -548.3], [-70.7, -524.7], [-91.7, -498.7],
      [-112.1, -471], [-130.1, -442.5], [-147.4, -413.1], [-161.6, -383], [-174.2, -351.5], [-185.3, -319.7], [-191.1, -285.8],
      [-190.7, -251.6], [-199, -215.9], [-206.1, -184.7], [-209.8, -154.1], [-209.8, -121.9], [-212.2, -90.1], [-205.2, -59.5],
      [-193.8, -27.9], [-179.9, 1.2]] },
  ],
  notes: `Jeddah Corniche Circuit: a walled street circuit on the Red Sea corniche, raced at night under floodlights.
Run-off: walls 2-4 m from the track edge almost everywhere. There is no gravel and no grass. The run-off is
painted asphalt in decorated patches, mostly royal blue, violet and hot pink with sponsor logos and graphics
(an F1 car, camels, a sunburst, waves). The largest are a ~50 m blue area with a sponsor logo outside the
kink at 4180-4320, the blue/violet wave area outside the north hairpin (2240-2430), and the violet/pink area
on the left through the esses (1380-1640).
Surroundings, going round the lap:
- 0-300 main straight: pit building and garages on the left (west), a long white grandstand roof on the
  right, then the Corniche road and tower blocks.
- 300-550 T1-T3: a compact complex with painted plazas, under a footbridge/grandstand bridge at ~560.
- 550-1000: northbound beside the Corniche road (east). On the west are a planted median and a paved plaza
  with a triangle pattern, then the southbound return leg (3600-4000).
- 1000-1400: a large tarmac car park east of the track. At 1200-1440 flat cream painted run-off, with a
  dark green stripe, runs up to 32 m out to a red/white barrier along the car park. It is paint, not a sand
  lot: there is no wall between it and the track. The red/white rows round the painted patches are barriers.
  Footbridge over both legs at ~1180/3500.
- 1400-2000: the esses, with car parks and a tall tower to the east and a park with a tennis court between
  the legs. Footbridge at ~1900/2780.
- 2000-2250: a park/scrub plot on the left and a building site/compound on the right.
- 2250-2450 north hairpin: wraps round a circular park with a white dome monument in the middle. A marina,
  yachts and a harbour lie north-west, beyond the outer road.
- 2450-3600: southbound along the seafront. On the right (west) is a dual carriageway, then a promenade,
  low beach pavilions and the Red Sea 40-80 m away. Gardens are on the left, between the legs.
- 3600-4300: seafront road and buildings to the west. The large blue run-off at 4180-4320 lies against the
  coastal buildings.
- 4400-4550: a car park and helipads to the west.
- 4550-5300: the track runs on a narrow spit. The open sea is ~40 m to the right (west), past a parallel road
  and the sea wall. A shallow lagoon is directly beyond a 4-8 m concrete promenade on the left (east),
  with a dark asphalt apron at 4690-4870.
- 5300-5550 south hairpin: a fun-fair island in the lagoon to the north and white tent structures to the
  south-west. The hairpin goes round a painted circle.
- 5550-5900: northbound, with lagoon islands, a car park and a footbridge (~5780) on the left and tower
  blocks across the Corniche road on the right.
OSM provides the sea and lagoon. Concrete areas mark the road and promenade west of the spit and the promenade
on its lagoon side. Each painted patch has its own colour pair, but the real ones
are pictures (an F1 car, camels, a sunburst, logos) that diagonal bands only suggest. Barriers show as thin lines, and as red/white rows
round the painted patches. The white-roofed blocks at 1190-1265 and 3390-3470 are read as stands from their
look alone. The long white roof at 6075-165 is the main stand; the game currently leaves it out.`,
};
