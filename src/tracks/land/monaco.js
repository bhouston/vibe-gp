// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Circuit de Monaco: walls/guardrails ~2 m from the kerb almost everywhere; only the classic escape
// roads (Sainte-Devote, Mirabeau, Nouvelle Chicane, Piscine, Rascasse) are wider. Lap metres as
// labelled on the reference aerials (lap 3292 m in the game).
export default {
  surfaces: {
    gravel: 0xa8a29a, // unused: no gravel anywhere
    paint: [0xc8202a, 0xf2f2f2], // red/white striped run-off (swimming pool section)
    widen: 0,
    width: [
      // street circuit: barrier faces 2 m from the asphalt edge all the way round
      [0, 'both', 0, 3292, 2],
      // Sainte-Devote (right-hander at the roundabout): escape road straight on, up the old
      // roundabout towards Bd Princesse Charlotte, on the outside (driver's left)
      [185, 'L', 0, 60, 18],
      // Mirabeau Haute (right-hander): short escape road straight on (northwards) on the outside
      [1105, 'L', 0, 40, 14],
      // Nouvelle Chicane: the old straight road (Quai des Etats-Unis) continues as the escape road
      // on the right while the chicane jinks left towards the harbour
      [2035, 'R', 0, 80, 16],
      // Piscine entry (fast left-right): wide paved area between the track and the rock breakwater
      [2480, 'L', 0, 75, 12],
      // Piscine exit (slow right-left by the pool): run-off on the harbour side
      [2600, 'L', 0, 50, 8],
      // La Rascasse: escape on the outside towards the quay before the restaurant
      [2840, 'L', 0, 40, 8],
    ],
    paved: [
      [0, 'both', 0, 3292, 'asphalt'],
      [185, 'L', 0, 60, 'asphalt'],
      [1105, 'L', 0, 40, 'asphalt'],
      [2035, 'R', 0, 80, 'asphalt'],
      [2480, 'L', 0, 75, 'paint'],
      [2600, 'L', 0, 50, 'paint'],
      [2840, 'L', 0, 40, 'asphalt'],
    ],
    traps: [],
    sausages: [],
  },
  // the temporary grandstands (lettered as on the real ticket plan)
  stands: [
    [150, 'R', 0, 60, 10], // A: Sainte-Devote, on the paddock-plaza side of the straight's end
    [840, 'R', 0, 50, 8], // B: Casino square
    [2130, 'L', 0, 170, 10], // K: on the Quai des Etats-Unis, harbour side, chicane to Tabac
    [2380, 'R', 0, 90, 12], // L: Tabac / Piscine entry, on the plaza between the two straights
    [2600, 'L', 0, 100, 10], // N/O/P: swimming-pool section, harbour quay side
    [2780, 'L', 0, 70, 10], // V: Rascasse, on the wide quay
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] }, // red/white everywhere
  ground: 'paved',
  // The sea flooded from the OSM coastline fills Port Hercule right up to the barriers; the real
  // quays between the track and the water are put back here (hand areas override the sea).
  areas: [
    // west quay: Tabac -> Piscine breakwater -> swimming-pool complex -> quay down to Rascasse.
    // West edge runs along the track centreline; east edge = the real water's edge.
    {
      kind: 'concrete',
      pts: [
        [76.9, 194.1], [49, 152], [45, 100], [45.4, 48.1], [85.5, -32], [89.8, -122.6],
        [115.7, -208.8], [160, -262], [200, -262], [190, -243], [180, -240], [172, -217],
        [154.5, -178.6], [137.2, -144.2], [120, -101], [102.8, -53.6], [97, -5], [94, 12],
        [86, 42], [62, 61], [55, 68], [53.5, 119.6], [60, 148], [88, 184],
      ],
    },
    // north quay (Quai des Etats-Unis, Tabac -> Nouvelle Chicane) and the quay jutting into the
    // harbour at the chicane (yellow-roofed building): north edge follows the track centreline
    {
      kind: 'concrete',
      pts: [
        [84, 197], [130, 203], [176, 210], [206, 214], [277, 224], [300, 226], [315, 220],
        [330, 222], [336, 229], [340, 244], [363, 249], [410, 258], [430, 262],
        [430, 199], [300, 199], [300, 206], [268, 206], [260, 204], [150, 197], [88, 184],
      ],
    },
  ],
  notes: `Street circuit, clockwise, entirely city: guardrails/concrete walls ~2 m from the kerb,
debris fences on top, buildings or pavements right behind. Ground beyond the barriers is
paved city (pavements, plazas, roads), with planted median trees along the start straight.

Lap by lap metre:
- 0-185 Bd Albert 1er start/finish straight, heading N: left = pavement + apartment blocks;
  right = pit lane wall then a tree-lined median and the big paved paddock plaza (Darse).
- 185-245 Sainte-Devote (right): escape road straight on into the roundabout, ~18 m asphalt.
- 245-700 Beau Rivage climb (Av. d'Ostende), NE: buildings both sides, walls at 2 m.
- 700-900 Massenet (left, round the Hotel de Paris corner) and Casino (right): Casino square
  gardens/plaza on the right, Hotel de Paris / Casino buildings; no run-off.
- 900-1110 descent along Av. des Spelugues with the Casino gardens (trees) on the right.
- 1105-1145 Mirabeau (right): ~14 m escape road straight on to the north.
- 1150-1400 down to the Grand Hotel (Fairmont) hairpin at ~1254, tightest corner, walls
  hard against it; Portier (right) at ~1400 with the sea just beyond on the left.
- 1400-1862 the tunnel under the Fairmont hotel (curving right): solid walls, lit.
- 1862-2035 downhill to the harbour; a seafront terrace/yacht club building on the left.
- 2035-2115 Nouvelle Chicane (left-right): the straight old road ahead is the ~16 m escape
  road on the right, ending at tyre/TecPro barriers.
- 2115-2350 Quai des Etats-Unis along the north side of Port Hercule: harbour water and
  moored superyachts only ~5-10 m beyond the left barrier; road/buildings on the right.
- 2350 Tabac (left), then 2350-2480 along the west quay of the harbour, heading S: water
  ~10 m to the left (yachts), the paddock plaza on the right.
- 2480-2560 Piscine entry (left-right): wide paved run-off on the left, between the track
  and a rock breakwater; harbour water beyond. Painted red/white (approximate colours).
- 2560-2650 alongside the Rainier III swimming pool (large blue outdoor pool on the RIGHT,
  within ~10 m); exit chicane with some paved run-off on the left.
- 2650-2860 down the quay to La Rascasse: wide quay roads and pontoons on the left (harbour
  water 30-50 m away), paddock/temporary buildings and the Bd Albert 1er trees on the right.
- 2860-2900 La Rascasse (tight right round the restaurant building); small escape on the
  outside. 2900-3292 Anthony Noghes (right) and back up to the line; the pit entry branches
  off before Noghes. The Rock (Monaco-Ville cliff, dense pine woodland) rises steeply just
  south of Rascasse/Noghes.

Water: Port Hercule's basin sits east of the start straight/paddock and south of the
Quai des Etats-Unis section. It is deep dark navy (Esri imagery ~#0b1626), calm, packed with
white yachts on long pontoons (the central jetty and Quai Rainier III with buildings stick out
into it). The open Mediterranean lies further east past the outer breakwaters (cruise ships
moored there) and laps the rocks along the Portier / tunnel / Larvotto seafront. Water comes
from the OSM coastline; the 'areas' put back the concrete quays (west quay with the pool
complex, north quay, chicane quay) that the flooded sea otherwise covers. The pool itself
(~26 x 50 m, at about x 49..75, y -21..-71) sits under the game's pit building, so it is not drawn. Grandstands (temporary) line the harbour side and Piscine, not in the imagery.`,
};
