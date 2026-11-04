// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Las Vegas Strip Circuit: a temporary street circuit. Everything inside the walls is road or
// car-park asphalt; walls (concrete blocks with debris fencing) sit at the road edges.
// Lap metres below are as on the reference aerials (game lap ~6170 m).
export default {
  surfaces: {
    paint: [0xc8202a, 0xf2f2f2], // red/white painted run-off, as seen at Turn 1 and the last corner
    widen: 0,
    width: [
      // start/finish straight through the paddock lot (heading NE): pit wall on the left,
      // main grandstand close on the right
      [0, 'L', 0, 240, 3],
      [0, 'R', 0, 240, 5],
      // Turn 1 left hairpin: wide car-park asphalt on the outside up to the grandstand
      [240, 'R', 0, 220, 20],
      [240, 'L', 0, 220, 6],
      // long left sweep across the car park towards Koval Lane: open lot on the inside
      [460, 'R', 0, 220, 6],
      [460, 'L', 0, 220, 15],
      // Koval Lane northbound: walls at the kerbs of a ~25 m road
      [680, 'L', 0, 910, 5],
      [680, 'R', 0, 910, 4],
      // right turn off Koval Lane, then east along the service road south of the Sphere
      [1590, 'L', 0, 70, 8],
      [1590, 'R', 0, 70, 3],
      [1660, 'both', 0, 220, 4],
      // Sphere section: left turn north, the S around the Sphere's east car park
      [1880, 'both', 0, 160, 5],
      [2040, 'R', 0, 100, 8], // outside of the Sphere left-hander, car-park asphalt
      [2040, 'L', 0, 100, 4],
      [2140, 'both', 0, 170, 4],
      // Sands Avenue westbound past the Sphere (Sphere wall on the left, median right)
      [2310, 'L', 0, 300, 4],
      [2310, 'R', 0, 300, 6],
      [2610, 'both', 0, 90, 5],
      // the long right-hand curve of Sands Avenue: wide multi-lane road, track on its north half
      [2700, 'L', 0, 450, 10],
      [2700, 'R', 0, 450, 4],
      // left onto the Strip at the Sands/Las Vegas Blvd intersection (wide junction outside)
      [3150, 'R', 0, 110, 12],
      [3150, 'L', 0, 110, 5],
      // the Strip southbound: walls at the west kerb (sidewalk) and the palm median on the left;
      // the real carriageway sits a few metres west (right) of the game centreline
      [3260, 'L', 0, 1930, 3],
      [3260, 'R', 0, 1930, 8],
      // left onto Harmon Avenue (wide intersection on the outside)
      [5190, 'R', 0, 120, 10],
      [5190, 'L', 0, 120, 4],
      // Harmon Avenue eastbound: game centreline sits on the road's south kerb; the road
      // (with turn lanes) extends far to the left
      [5310, 'L', 0, 200, 16],
      [5310, 'R', 0, 200, 3],
      [5510, 'L', 0, 490, 12],
      [5510, 'R', 0, 490, 3],
      // last corner: left off Harmon/Koval junction back into the paddock lot
      [6000, 'R', 0, 120, 6],
      [6000, 'L', 0, 120, 4],
      [6120, 'L', 0, 60, 3],
      [6120, 'R', 0, 60, 5],
    ],
    paved: [
      [0, 'both', 0, 6170, 'asphalt'],
      // red/white painted strip behind the kerb on corner exits/outsides, plain tarmac beyond
      [240, 'R', 0, 220, { paint: [0xc8202a, 0xf2f2f2], strip: 4, beyond: 'asphalt' }],  // Turn 1
      [3150, 'R', 0, 110, { paint: [0xc8202a, 0xf2f2f2], strip: 3, beyond: 'asphalt' }], // onto the Strip
      [5190, 'R', 0, 120, { paint: [0xc8202a, 0xf2f2f2], strip: 3, beyond: 'asphalt' }], // onto Harmon
      [6000, 'R', 0, 120, { paint: [0xc8202a, 0xf2f2f2], strip: 3, beyond: 'asphalt' }], // last corner
    ],
    traps: [],
    sausages: [],
  },
  // pedestrian footbridges over the track (Koval Lane, Sands Avenue, the Strip, Harmon Avenue)
  bridges: [
    [745, 'foot'], [2555, 'foot'], [3175, 'foot'], [3545, 'foot'],
    [4440, 'foot'], [4550, 'foot'], [5115, 'foot'], [5270, 'foot'],
  ],
  // Bellagio: a ~17 m pavement/promenade (balustrade, trees) separates the Strip from the
  // fountain lake; OSM's lake runs right up to the barrier
  areas: [
    { kind: 'concrete', pts: [[-953, 640], [-971, 640], [-981, 290], [-963, 290], [-957, 475]] },
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'paved',
  scenery: {
    trees: 0, desert: false, city: true, paved: true, illuminated: true,
    // the only OSM 'scrub' is the bare dirt/gravel lot west of Koval Lane (~700-850): no trees, dusty tan
    landTrees: { scrub: 0 },
    landColors: { scrub: 0x8c8272, scrubDark: 0x7a705f },
  },
  notes: `Urban night street circuit: no sand or grass anywhere near the track; beyond the walls it
is roads, open-air car parks, casinos/hotels and some vacant/construction lots, so ground is
'paved' and the scenery 'illuminated' (the Strip's neon fits the bright festival lighting).
- Start/finish (0-240): straight runs NE through the former car park east of Koval Lane. Left:
  pit lane and the permanent 4-storey paddock/pit building (long, red-outlined roof, ~300 m)
  along the whole straight. Right: long main grandstand, then open car-park/service compound.
- Turn 1 (~250-450) left hairpin: big asphalt run-off on the outside up to a red-roofed
  grandstand along the road on the north edge of the lot; hospitality units at the apex. Then a long left sweep (460-680) across open car park, a small grandstand
  on the inside, low warehouse building on the outside.
- Koval Lane (680-1590) northbound: ~25 m urban road with walls at both kerbs. West: open car
  parks, low commercial buildings, a convention-centre warehouse; East: hotel/apartment blocks
  (red/terracotta roofs, palms), an electrical substation (~1150). Cross street (E Flamingo Rd)
  at ~1100 and bridge-like junctions at ~800 and ~1400.
- 1600-2300: right then east along the service road, then left around the east side of the
  Sphere (huge dark dome ~150 m across, LED exterior) with its landscaped car parks; large
  open surface car park on the right (east). This is the 'Sphere' corner complex.
- Sands Avenue (2300-3150): westbound past the Sphere and the Venetian/Palazzo expo centre
  (huge flat roofs with solar panels, north side), then a long right curve between the
  Venetian/Palazzo towers and trees; the elevated monorail-style pedestrian bridges cross at
  ~2560 and ~3180.
- The Strip (3200-5190): 1.9 km flat-out run south on Las Vegas Blvd's southbound carriageway,
  palm-lined median on the left, casino frontages both sides with pedestrian bridges overhead
  (~3480, ~4500, ~4560). Right (west): Treasure Island/Mirage area with a big construction
  site (~3600-3900), Caesars Palace (~4000-4400), Bellagio and its fountain lake (~4550-4870).
  Left (east): Venetian, LINQ/Flamingo, Horseshoe, Paris with its Eiffel Tower replica and
  balloon (~4870), Cosmopolitan. Very tall towers cast heavy shadows.
- Harmon Avenue (5250-6000): eastbound, wide road with turning lanes to the left (north) of
  the game line; Planet Hollywood/Hilton buildings on the left, big open car parks then the
  Hard Rock/Virgin tower and a Topgolf-style green driving range (~5900-6000, south side).
- Last corner (6000-6120): left from the Harmon/Koval junction back into the paddock lot,
  painted red/white run-off; car park and a hotel with tennis courts to the south.
No gravel traps and no visible sausage kerbs on the imagery.`,
};
