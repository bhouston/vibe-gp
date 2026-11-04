// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Hungaroring (Esri World Imagery, ~0.4 m/px crops every 250 m). Lap metres as labelled on the
// reference images (game lap 4359 m). Clockwise lap: start/finish straight heading NW, T1 right,
// T2 left hairpin, T3 right, uphill back straight NE, T4 left, T5 right, T6/T7 chicane, T8 left,
// T9 right, T10 left kink, T11 right, T12 right, T13 left hairpin, T14 right onto the straight.
const GREEN = { paint: [0x3f8a55, 0x3f8a55], strip: 5, beyond: 'asphalt' };

export default {
  surfaces: {
    gravel: 0xc8b48c, // pale beige-tan valley gravel
    widen: 0,
    width: [
      // start/finish straight: main grandstand on the left, pit wall on the right
      [0, 'L', 0, 200, 8],
      [0, 'R', 0, 200, 3],
      [4100, 'L', 0, 259, 9],
      [4100, 'R', 0, 259, 4],
      // run to T1: grass to fences, grandstands on the left; pit exit alongside on the right
      [200, 'L', 0, 330, 15],
      [200, 'R', 0, 350, 6],
      // T1 (right): big asphalt run-off on the outside out to a blue Tecpro wall
      [520, 'L', 0, 25, 12],
      [545, 'L', 0, 165, 28],
      [550, 'R', 0, 160, 15],
      // T1 exit -> T2, downhill SE between grass verges and service roads
      [710, 'L', 0, 240, 18],
      [710, 'R', 0, 240, 14],
      // T2 (left hairpin): asphalt outside (dark band + paler apron), grass inside
      [950, 'R', 0, 60, 10],
      [1010, 'R', 0, 140, 25],
      [950, 'L', 0, 200, 12],
      [1150, 'R', 0, 80, 8],
      [1150, 'L', 0, 80, 15],
      // T3 (right): wide pale asphalt triangle on the outside, tapering by the back straight
      [1230, 'L', 0, 50, 20],
      [1280, 'L', 0, 60, 34],
      [1340, 'L', 0, 60, 20],
      [1400, 'L', 0, 20, 10],
      [1230, 'R', 0, 190, 10],
      // uphill back straight to T4: grass then fence/woods on the left, wall + service road right
      [1420, 'L', 0, 330, 12],
      [1420, 'R', 0, 280, 5],
      // T4 (left): pale asphalt paddock-like run-off on the outside out to a diagonal blue wall
      [1700, 'R', 0, 70, 12],
      [1770, 'R', 0, 60, 45],
      [1830, 'R', 0, 70, 30],
      [1900, 'R', 0, 50, 15],
      [1750, 'L', 0, 200, 10],
      // T5 (right): big pale asphalt run-off outside, grass inside
      [1925, 'L', 0, 25, 20],
      [1950, 'L', 0, 120, 30],
      [1950, 'R', 0, 300, 18],
      // T5 exit -> chicane: asphalt strip then wall with grandstands behind (left)
      [2070, 'L', 0, 260, 14],
      // T6/T7 chicane: gravel triangle on the left (outside of T6)
      [2250, 'R', 0, 80, 12],
      [2330, 'L', 0, 40, 42],
      [2370, 'L', 0, 30, 30],
      [2400, 'L', 0, 30, 15],
      [2330, 'R', 0, 200, 10],
      [2440, 'L', 0, 100, 14],
      // T8 (left): asphalt outside
      [2530, 'R', 0, 120, 20],
      [2530, 'L', 0, 120, 12],
      // T9 (right): wide asphalt outside, grass inside
      [2650, 'L', 0, 140, 34],
      [2790, 'L', 0, 60, 18],
      [2650, 'R', 0, 210, 12],
      // T10 (left kink): gravel triangle on the outside (right)
      [2850, 'L', 0, 160, 10],
      // (the engine erodes walls over +-16 m, so the wide part is given generously long)
      [2860, 'R', 0, 20, 12],
      [2878, 'R', 0, 25, 30],
      [2900, 'R', 0, 90, 50],
      [2990, 'R', 0, 30, 20],
      // T11 (right): very wide pale asphalt run-off outside, out to a blue Tecpro wall
      [3010, 'L', 0, 40, 25],
      [3050, 'L', 0, 80, 42],
      [3130, 'L', 0, 70, 20],
      [3030, 'R', 0, 120, 14],
      // run to T12: grass both sides, bridge over at ~3190
      [3200, 'L', 0, 220, 12],
      [3150, 'R', 0, 270, 20],
      // T12 (right): asphalt outside (with dark patch), grass inside
      [3420, 'L', 0, 100, 30],
      [3520, 'L', 0, 110, 20],
      [3420, 'R', 0, 220, 25],
      // T13 (left hairpin): asphalt outside, grass inside
      [3640, 'R', 0, 120, 22],
      [3630, 'L', 0, 150, 12],
      // T13 exit -> T14: grass, pit-lane entry alongside on the right
      [3780, 'L', 0, 160, 10],
      [3760, 'R', 0, 180, 12],
      // T14 (right): asphalt outside, grandstands beyond the wall
      [3940, 'L', 0, 160, 15],
      [3940, 'R', 0, 160, 10],
    ],
    paved: [
      // main straight verges are tarmac/concrete next to the pit wall and grandstand
      [0, 'both', 0, 200, 'asphalt'],
      [4100, 'both', 0, 259, 'asphalt'],
      [530, 'L', 0, 180, 'asphalt'],      // T1 outside
      [950, 'R', 0, 200, 'asphalt'],      // T2 outside
      [1230, 'L', 0, 190, 'asphalt'],     // T3 outside
      [1700, 'R', 0, 250, 'asphalt'],     // T4 outside
      [1925, 'L', 0, 405, 'asphalt'],     // T5 outside + strip past the grandstands
      [1960, 'L', 0, 100, GREEN],         // T5: green strip behind the outside kerb
      [2320, 'L', 0, 120, 'asphalt'],     // strip before the T6 gravel
      [2530, 'R', 0, 120, 'asphalt'],     // T8 outside
      [2650, 'L', 0, 180, 'asphalt'],     // T9 outside
      [3010, 'L', 0, 190, 'asphalt'],     // T11 outside
      [3020, 'L', 0, 70, GREEN],          // T11 green strip
      [3420, 'L', 0, 210, 'asphalt'],     // T12 outside
      [3435, 'L', 0, 50, GREEN],          // T12 green strip
      [3640, 'R', 0, 120, 'asphalt'],     // T13 outside
      [3940, 'L', 0, 160, 'asphalt'],     // T14 outside
    ],
    traps: [
      [2335, 'L', 0, 95, 6],   // T6 outside: beige triangle behind a ~6 m asphalt strip
      [2878, 'R', 0, 92, 5],  // T10 outside: beige triangle behind a grass strip
    ],
    sausages: [],
  },
  bridges: [
    [900, 'road'],    // wide service-road bridge between T1 and T2
    [2420, 'foot'],   // after the T6/T7 chicane
    [3188, 'foot'],   // steel truss footbridge after T11
    [3640, 'foot'],   // between T12 and T13
    [3795, 'foot'],   // T13 exit
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'grass',
  // woods are mapped by OSM; open land around the circuit is grass/bare earth, so keep the
  // noise-forest on unmapped land sparse (it put fake woods W and E of T11)
  scenery: { trees: 0.06 },
  notes: `Hungaroring sits in a dry valley bowl NE of Budapest (Mogyorod); bare beige earth, dusty service
roads and rough grass everywhere between patches of deciduous woodland.
- Start/finish straight (4100-200): huge covered main grandstand on the driver's left right behind the wall;
  long pit building + paddock on the right behind the pit wall. More open grandstand blocks along the left
  200-550 and around T1 entry; a large forest block lies SW beyond the grandstands.
- T1 (~600): large asphalt run-off (dark band near the kerb, paler grey beyond) with a blue/purple Tecpro
  wall; beyond it the circuit HQ / media buildings and car parks to the N and NW.
- 700-950: track falls SE between grass verges; old service loop on the inside; bare earth lot and
  truck/compound parks either side. Footbridge across the track at ~900.
- T2 (~1050): left hairpin with dark-grey asphalt band + pale apron outside, then a blue wall.
- T3 (~1270): wide pale asphalt triangle outside (left); inside is a grass island with service road.
  Beyond the left wall: truck/team compound with white/blue/red tents and a car park.
- Back straight 1420-1750 climbs NE: woodland right behind the left fence (with a big open field beyond),
  on the right a narrow verge, service road, a small pond and the woods of the infield.
- T4 (~1770) / T5 (~2000): big pale asphalt run-offs; the infield N end holds a driving-safety centre
  (skid pad circle, wide asphalt pads, white garages). Behind T5 a public road and an aqua park NW.
  T5, T11 and T12 have a thin green-painted band (~3-6 m) right behind the outside kerb, the rest of the
  run-off is pale grey asphalt (format can't express a partial-width paint strip).
- 2100-2350: long terraced spectator banks / grandstands on the left (NE), outside the wall and a road.
- T6/T7 chicane (~2330-2420): beige gravel triangle outside T6 (left) behind an asphalt strip.
  Footbridge across at ~2420. Infield W side: motocross/kart dirt tracks and grass.
- T8/T9 (2550-2700): pale asphalt run-offs with darker rectangular asphalt patches; inside of T8 the big
  infield woodland (dense deciduous forest filling the centre of the lap) begins.
- T10 (~2900): beige gravel triangle on the right with a blue tyre wall at its foot.
- T11 (~3050): very large pale asphalt run-off on the left out to a blue Tecpro wall; open grass fields and
  scattered trees to the E. Bridge over the track at ~3190.
- 3200-3450: grass verges, spectator banks on the left (S side), infield grass with a blue-roofed building.
- T12 (~3460) / T13 (~3700): pale asphalt run-offs with dark patches and blue walls; infield grass between.
  Footbridges at ~3640 and ~3790.
- T14 (~4000): asphalt outside with grandstand blocks right behind the wall; inside are two helipads and
  the pit-lane entry. South of the circuit: open farmland strips.`,
};
