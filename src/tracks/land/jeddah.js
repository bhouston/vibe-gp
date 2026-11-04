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
      [420, 'R', 0, 110, { paint: [0x1f4a55, 0xd8487e] }], // dark teal F1-car plaza with pink graphics
      [880, 'R', 0, 120, { paint: [0x6a55b0, 0x3048a0] }], // violet/blue "camel" area
      [1380, 'L', 0, 260, { paint: [0x7a5cb5, 0xe2609a] }], // violet + hot pink esses area
      [1580, 'R', 0, 140, { paint: [0x7a5cb5, 0xd8d8e8] }], // violet with white chequered flags
      [2240, 'R', 0, 190, { paint: [0x3550b0, 0x8a5ab8] }], // blue/violet waves, north hairpin
      [2560, 'R', 0, 270, { paint: [0x5fb8d8, 0x2a4f9a] }], // light blue with dark-blue diamonds
      [2960, 'L', 0, 160, { paint: [0xe2609a, 0xf0c040] }], // pink/yellow sunburst
      [4130, 'L', 0, 100, { paint: [0xe0508f, 0xf0e4ec] }], // pink/white strip
      [4180, 'R', 0, 140, { paint: [0x2550b0, 0x2550b0] }], // plain royal blue with a white sponsor logo
      [4690, 'L', 0, 180, 'asphalt'], // dark apron by the lagoon
      [5380, 'L', 0, 180, { paint: [0x4f8fd0, 0x2a4f9a] }], // painted circle inside the south hairpin
      [5380, 'R', 0, 180, { paint: [0x2a4f9a, 0xe8e8e8] }], // blue/white chequers outside it
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
  kerb: { colors: [0xd0201c, 0xf2f2f2] }, // red/white, confirmed on the imagery
  ground: 'paved',
  scenery: { trees: 0, paved: true, illuminated: true, city: true, tall: 1.4, sea: 'west' },
  areas: [
    // sandy vacant lot beside the track at about 1150-1350, east of the wall (in front of the car park)
    { kind: 'sand', pts: [[-312.4, 1188.2], [-229.2, 1138.3], [-228.1, 1073.4], [-246.9, 1054.0], [-256.9, 1092.8], [-281.9, 1162.2]] },
    // the spit 4550-5300: OSM floods the sea right up to the west wall, but there are a road and a
    // promenade (30-55 m) between the track and the sea wall
    { kind: 'concrete', pts: [[-283, -55], [-281.7, -82.6], [-287.2, -115.9], [-281.7, -149.2], [-267.8, -204.7], [-253.9, -254.6],
      [-244.9, -300.4], [-231.0, -355.8], [-208.8, -411.3], [-172.8, -466.7], [-139.5, -511.1], [-122.9, -544.4], [-118.6, -583.1],
      [-76.1, -561.1], [-90.2, -546.3], [-102.3, -532.7], [-113.7, -517.7], [-125.7, -501.8], [-137.4, -485.3], [-148.4, -468.1],
      [-163.2, -444.2], [-173.1, -426.5], [-182.1, -408], [-191.2, -387.8], [-201.5, -361.2], [-211.6, -332.7], [-218.8, -309.6],
      [-225.3, -286.1], [-230, -264.2], [-234.4, -242.5], [-240.3, -219.8], [-245.4, -198.3], [-248.7, -177.9], [-250.7, -157.5],
      [-251.4, -132.9], [-250.2, -110.2], [-247.3, -87.8], [-243.9, -69.6], [-239.4, -51.6]] },
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
- 1000-1400: a large tarmac car park east of the track, with a beige sand lot at 1150-1350.
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
OSM provides the sea and lagoon. Along the spit, OSM's sea came too close to the west wall, so a concrete
area restores the road and promenade there. Each painted patch has its own colour pair, but the real ones
are pictures (an F1 car, camels, a sunburst, logos) that diagonal bands only suggest. Barriers are concrete walls with debris fencing,
with TecPro blocks at the corner ends.`,
};
