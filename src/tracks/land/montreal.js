// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Circuit Gilles Villeneuve (Ile Notre-Dame), run clockwise. Lap directions, for the L/R sides below:
//   0-240 south down the pit straight (L = east: pit lane, garages, rowing basin; R = west: grandstands, beach lake)
//   400-720 west-north-west along the south shore (L = St Lawrence; R = park)
//   720-2690 north up the west side of the island (L = St Lawrence / Chenal Le Moyne; R = park, canals)
//   2690-4356 south down the Casino straight and the pit straight (L = east: Olympic rowing basin, then pits;
//   R = west: canals, car parks, Casino, the inner beach lake).
// Imagery shows no gravel traps anywhere: run-off is grass or plain asphalt, with walls very close
// along most of the lap.
export default {
  surfaces: {
    gravel: 0xa8a08e,
    paint: [0xc8202a, 0xf2f2f2], // red/white painted strips (pit-exit blend, T7 exit, hairpin exit, T13 approach)
    widen: 0,
    width: [
      // pit straight to the Senna S
      [0, 'L', 0, 100, 4], //       pit wall
      [0, 'R', 0, 240, 3.5], //     wall in front of the grandstands
      [100, 'L', 0, 200, 30], //    grass triangle between track and pit lane (inside T1)
      [230, 'R', 0, 50, 8], //      T1 outside: asphalt to the red/white tyre wall
      [280, 'R', 0, 60, 32], //     straight-on escape area from T1 (inside T2)
      [340, 'R', 0, 60, 12], //     grass inside the T2 apex
      [300, 'L', 0, 120, 16], //    T2 outside: grass to the tyre wall (pit lane behind)
      // along the south shore
      [400, 'R', 0, 50, 10],
      [420, 'L', 0, 300, 6], //     grass, wall, perimeter road, river bank
      [450, 'R', 0, 270, 5],
      // T3-T4
      [720, 'L', 0, 40, 6],
      [740, 'L', 0, 60, 24], //     grass triangle to the zig-zag tyre wall (T3 outside)
      [800, 'L', 0, 60, 18], //     asphalt patch after T4
      [720, 'R', 0, 140, 3.5], //   wall right behind the kerbs
      // T5 and the run north to T6 (walls close on both sides, woods)
      [860, 'L', 0, 290, 4],
      [860, 'R', 0, 370, 3],
      [1150, 'L', 0, 80, 10], //    grass strip before T6
      // T6-T7
      [1230, 'R', 0, 90, 25], //    T6 outside: asphalt run-off up to the car park fence
      [1230, 'L', 0, 70, 10], //    grass inside T6
      [1300, 'L', 0, 60, 12], //    T7 outside: asphalt
      [1320, 'R', 0, 40, 20], //    grass inside T7
      // the river side run north to the T8-T9 chicane
      [1360, 'L', 0, 100, 5], //    red/white painted strip on the exit of T7
      [1360, 'R', 0, 140, 6],
      [1460, 'L', 0, 500, 4],
      [1500, 'R', 0, 480, 4],
      // T8-T9
      [1960, 'L', 0, 20, 10],
      [1980, 'L', 0, 80, 35], //    T8 outside: big asphalt escape area to the tyre wall
      [2060, 'L', 0, 70, 30], //    grass island inside T9 (asphalt beyond it)
      [1980, 'R', 0, 150, 5],
      // up to the hairpin
      [2130, 'L', 0, 470, 6],
      [2130, 'R', 0, 470, 4], //    fence, then the canal
      [2600, 'L', 0, 60, 10],
      [2660, 'L', 0, 90, 55], //    L'Epingle outside: huge asphalt apron (painted "Bonjour"), tyre wall at the far end
      [2600, 'R', 0, 300, 8], //    grass median between the two legs of the hairpin
      [2750, 'L', 0, 200, 8],
      [2900, 'R', 0, 50, 5],
      // Casino straight beside the rowing basin
      [2950, 'L', 0, 930, 9], //    grass, then concrete wall, service road, basin edge
      [2950, 'R', 0, 900, 4],
      // final chicane and the pit straight
      [3850, 'R', 0, 70, 4],
      [3880, 'L', 0, 130, 30], //   straight-on escape area at T13 (pit entry beside it)
      [3920, 'R', 0, 70, 3], //     Wall of Champions, right at the exit kerb of T14
      [3990, 'R', 0, 366, 3.5],
      [4010, 'L', 0, 346, 4], //    pit wall
    ],
    paved: [
      [0, 'L', 0, 100, 'asphalt'],
      [100, 'L', 0, 70, { paint: [0xc0302a, 0xc0302a], strip: 6, beyond: 'grass' }], // solid red pit-exit blend
      [230, 'R', 0, 110, 'asphalt'],
      [400, 'R', 0, 50, 'asphalt'],
      [800, 'L', 0, 60, 'asphalt'],
      [1230, 'R', 0, 90, 'asphalt'],
      [1300, 'L', 0, 60, 'asphalt'],
      [1360, 'L', 0, 100, { paint: [0xc8202a, 0xf2f2f2], strip: 3, beyond: 'grass' }], // thin red/white strip, then grass to the wall
      [1960, 'L', 0, 100, 'asphalt'],
      [2600, 'L', 0, 150, 'asphalt'],
      [2780, 'L', 0, 50, { paint: [0xc8202a, 0xf2f2f2], strip: 3, beyond: 'grass' }],
      [3850, 'R', 0, 60, { paint: [0xc8202a, 0xf2f2f2], strip: 3, beyond: 'asphalt' }],
      [3880, 'L', 0, 476, 'asphalt'], // escape area, then the strip to the pit wall
      [0, 'R', 0, 240, 'asphalt'], // narrow concrete/asphalt strip in front of the grandstands
      [3990, 'R', 0, 366, 'asphalt'],
    ],
    traps: [],
    sausages: [],
  },
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'grass',
  scenery: { trees: 0.6, conifer: 0.1, palms: false },
  // grandstands as on the aerial (white/grey flat roofs); none on the river side
  stands: [
    [3990, 'R', 0, 366, 16], // pit straight main stands (west side, opposite the pits)
    [0, 'R', 0, 230, 16], //    continuing to the Senna S
    [240, 'R', 0, 60, 12], //   behind the T1 run-off
    [330, 'L', 0, 80, 12], //   outside T2
    [390, 'L', 0, 70, 12], //   T2 exit, south of the track
    [1235, 'R', 0, 70, 8], //   temporary stands behind the T6 apron
    [1985, 'L', 0, 80, 10], //  behind the T8 escape area
    [2555, 'L', 0, 85, 12], //  hairpin approach
    [2670, 'L', 0, 50, 12], //  beyond the hairpin apron
    [2735, 'L', 0, 150, 12], // hairpin exit
    [2870, 'L', 0, 130, 12], // start of the Casino straight
    [3845, 'R', 0, 50, 12], //  final chicane approach
  ],
  bridges: [
    [479, 'foot'], // footbridge over the south-shore run
    [1935, 'road'], // Pont de la Concorde (wide road deck) just before T8
    [2238, 'foot'],
    [2421, 'foot'],
    [3021, 'foot'],
    [3717, 'foot'], // by the Casino
    [4063, 'foot'], // to the paddock, just after the final chicane
  ],
  areas: [
    // Ile Sainte-Helene (Parc Jean-Drapeau, Biosphere), across the ~150-250 m Chenal Le Moyne west of the
    // run north to the hairpin: OSM's St Lawrence multipolygon comes in as its outer ring only and floods
    // the whole island. East shore traced from the overview aerial (+-20 m); wooded park.
    { kind: 'forest', pts: [[-560, 2500], [-570, 2050], [-580, 1817], [-622, 1425], [-713, 1150], [-747, 933], [-797, 750], [-813, 650], [-1500, 650], [-1500, 2500]] },
    // Paddock and pit-building apron on the rowing basin's west bank: OSM's basin outline runs a straight
    // line from (59,-9) to (-9,308) and floods the paddock; the real bank bulges ~25-30 m further east
    // (plus a paved pier at y -55..34).
    { kind: 'concrete', pts: [[-11, 323], [23, 313], [29, 279], [40, 208], [50, 145], [58, 104], [62, 40], [95, 34], [95, -55], [68, -58], [59, -9], [-9, 308]] },
    // Floralies gardens between the run north to the hairpin and the Casino straight: OSM's canal
    // multipolygon is imported as its outer ring only, filling the whole garden island with water.
    // Re-lay the island (OSM's own grass, wood and gravel-lot outlines) so only the ~10-20 m canal ring
    // around it stays water.
    { kind: 'grass', pts: [[-356, 564], [-350, 667], [-355, 685], [-352, 706], [-347, 713], [-322, 848], [-309, 864], [-310, 872], [-314, 871], [-322, 896], [-304, 916], [-285, 981], [-261, 1074], [-239, 1152], [-265, 1218], [-268, 1223], [-327, 1233], [-331, 1232], [-333, 1228], [-356, 1111], [-408, 930], [-406, 921], [-407, 914], [-417, 904], [-417, 899], [-414, 890], [-414, 881], [-424, 866], [-428, 838], [-425, 834], [-400, 829], [-396, 825], [-399, 801], [-403, 798], [-430, 803], [-436, 802], [-439, 798], [-446, 746], [-451, 689], [-458, 638], [-461, 563], [-362, 559], [-356, 564]] },
    { kind: 'forest', pts: [[-327, 1233], [-268, 1223], [-265, 1218], [-239, 1152], [-261, 1074], [-285, 981], [-300, 931], [-315, 934], [-303, 973], [-302, 983], [-308, 1002], [-318, 1015], [-313, 1028], [-309, 1033], [-300, 1034], [-287, 1040], [-281, 1047], [-261, 1130], [-272, 1198], [-270, 1215], [-278, 1216], [-282, 1201], [-284, 1198], [-292, 1200], [-294, 1203], [-294, 1211], [-291, 1217], [-287, 1219], [-278, 1219], [-278, 1222], [-295, 1222], [-297, 1219], [-299, 1210], [-301, 1207], [-305, 1207], [-310, 1208], [-313, 1219], [-316, 1220], [-323, 1218], [-337, 1092], [-345, 1082], [-347, 1077], [-345, 1069], [-361, 1016], [-376, 1004], [-380, 982], [-380, 966], [-373, 953], [-373, 948], [-376, 946], [-402, 951], [-356, 1111], [-333, 1228], [-331, 1232], [-327, 1233]] },
    { kind: 'gravel', pts: [[-287, 1194], [-283, 1190], [-303, 1138], [-306, 1116], [-334, 1121], [-337, 1092], [-345, 1082], [-347, 1077], [-345, 1069], [-362, 1013], [-360, 1004], [-365, 996], [-363, 982], [-367, 964], [-373, 948], [-376, 946], [-360, 942], [-359, 950], [-357, 955], [-328, 963], [-309, 965], [-305, 967], [-303, 973], [-302, 983], [-305, 993], [-308, 1002], [-318, 1015], [-313, 1028], [-309, 1033], [-300, 1034], [-287, 1040], [-281, 1047], [-261, 1130], [-272, 1198], [-270, 1215], [-278, 1216], [-282, 1201], [-284, 1198], [-288, 1198], [-292, 1200], [-294, 1203], [-294, 1211], [-291, 1217], [-287, 1219], [-278, 1219], [-278, 1222], [-295, 1222], [-297, 1219], [-299, 1210], [-298, 1204], [-294, 1198], [-287, 1194]] },
  ],
  notes: `Island park circuit on Ile Notre-Dame; almost the whole lap is lined by concrete walls with
debris fencing only 3-6 m from the track edge, and there is no gravel anywhere: run-off is grass or plain
asphalt (big asphalt aprons only at T1-T2, T6, T8, the L'Epingle hairpin and the final chicane).

Water (all should come from OSM, but it dominates the view):
- St Lawrence river (Chenal Le Moyne on the west, the main river on the south): along the driver's left
  from the T2 exit (~400 m) all the way north to the hairpin approach (~2600 m). Between the track wall and
  the water is a narrow strip (10-40 m) of trees/scrub plus a paved perimeter service road and cycle path.
- Olympic rowing basin (Bassin olympique): a long straight-edged canal ~150 m wide immediately on the
  driver's left along the whole Casino back straight (~2900-3900 m) and beyond the pit buildings on the pit
  straight; ~20-30 m from the track edge (grass, wall, service road, concrete basin edge). Beyond it a
  tree-lined dyke and then the St Lawrence Seaway channel.
- Inner lake / Plage Jean-Dore (beach lake with sand beach, piers): on the driver's right behind the
  pit-straight grandstands (~4200-4356 and 0-200 m) and the start of the Senna S; the Casino lagoons on the
  right of the back straight around 3750-3950 m.
- Narrow canals of the Floralies gardens run parallel on the right of the run north to the hairpin
  (~2100-2600 m) and on the right of the start of the back straight (~2950-3300 m).

Structures:
- Pont de la Concorde (road bridge, wide concrete deck) crosses OVER the track at ~1920 m, just before T8.
- Pedestrian footbridges over the track at ~479, 2238, 2421, 3021, 3717 (by the Casino) and 4063 m (to the paddock).
- A road bridge from the west (Pont du Cosmos) ends at a roundabout beside the track at ~2560 m (left).
- Pit building with a long flat roof and the paddock (rows of white team units) on the left of the pit
  straight between track and rowing basin (~3990-4356, 0-100 m); grandstands (covered, grey roofs) along the
  right of the pit straight and at the Senna S, beside the T6 run-off (temporary stands), the
  hairpin (white hospitality buildings both sides of the return leg) and around the final chicane.
- Casino de Montreal (former French pavilion, large tiered building) right of the back straight at
  ~3650-3800 m; the Biosphere is off on Ile Sainte-Helene to the north-west, across the channel.
- Car parks: right of T6-T7 (~1250-1400 m), right of the back straight (~3300-3600 m).

Ground beyond the walls: mown grass and dense deciduous park woodland over most of the island, paved paths.`,
};
