// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Interlagos (Esri World Imagery, ~0.55 m/px crops): almost no gravel; run-off is grass in the
// infield and big blue-green (teal) painted asphalt at the heavy-braking corners (Senna S, Curva
// do Sol, Descida do Lago, Ferradura, Mergulho), with dark plain asphalt in the Senna S.
export default {
  surfaces: {
    gravel: 0xa59a86, // no gravel traps are visible on the imagery
    paint: [0x1f8f86, 0x2ba79b], // teal / blue-green painted run-off
    widen: 0,
    width: [
      // pit straight (driving south): pit wall on the left, grandstand wall on the right
      [0, 'L', 0, 330, 3],
      [0, 'R', 0, 330, 6],
      // S do Senna: T1 left-hander, vast run-off outside (right); T2 right-hander
      [330, 'L', 0, 100, 10],
      [330, 'R', 0, 100, 45],
      [430, 'L', 0, 100, 10], // outside of T2, wall against the pit-exit lane
      [430, 'R', 0, 100, 35], // inside of T2: the big dark asphalt apron
      // run down to Curva do Sol
      [530, 'L', 0, 170, 10],
      [530, 'R', 0, 170, 14],
      // Curva do Sol and the Reta Oposta (teal paint on the right/outside)
      [700, 'L', 0, 350, 5],
      [700, 'R', 0, 350, 16],
      [1050, 'L', 0, 330, 6],
      [1050, 'R', 0, 330, 8],
      // Descida do Lago (left-hander), huge painted run-off outside towards the lake
      [1380, 'L', 0, 220, 15],
      [1380, 'R', 0, 220, 30],
      [1600, 'L', 0, 100, 8],
      [1600, 'R', 0, 100, 20],
      [1700, 'L', 0, 200, 10],
      [1700, 'R', 0, 200, 12],
      [1900, 'both', 0, 100, 10],
      // Ferradura (right-hander), painted run-off outside (left)
      [2000, 'L', 0, 170, 32],
      [2000, 'R', 0, 170, 10],
      // Curva do Laranjinha, outside (left) is the paved paddock / service road
      [2170, 'L', 0, 130, 20],
      [2170, 'R', 0, 130, 8],
      [2300, 'L', 0, 80, 10],
      [2300, 'R', 0, 80, 10],
      // infield: Esse, Pinheirinho, Bico de Pato, all grass
      [2380, 'both', 0, 520, 12],
      [2410, 'R', 0, 120, 16], // Pinheirinho outside
      [2750, 'L', 0, 80, 10],     // Bico de Pato outside
      // Mergulho (left), painted then dark asphalt run-off outside (right)
      [2900, 'L', 0, 350, 12],
      [2900, 'R', 0, 60, 12],
      [2960, 'R', 0, 160, 25],
      [3120, 'R', 0, 130, 25],
      // Junção, then the climb past Café
      [3250, 'L', 0, 80, 15],
      [3250, 'R', 0, 80, 8],
      [3330, 'L', 0, 320, 12],
      [3330, 'R', 0, 320, 22],
      // Subida dos Boxes / Arquibancadas: pit entry wall on the left, grandstands on the right
      [3650, 'both', 0, 150, 8],
      [3800, 'L', 0, 501, 3],
      [3800, 'R', 0, 501, 6],
    ],
    paved: [
      [0, 'R', 0, 330, 'paint'],
      // Senna S: teal band next to the kerb, then the vast dark asphalt apron
      [330, 'R', 0, 200, { paint: [0x1f8f86, 0x2ba79b], strip: 8, beyond: 'asphalt' }],
      [330, 'L', 0, 80, 'paint'],
      [430, 'L', 0, 100, 'paint'],
      [530, 'R', 0, 120, { paint: [0x3b3e44, 0x3b3e44], strip: 6, beyond: 'grass' }], // dark strip, then grass bank
      [700, 'R', 0, 350, 'paint'],   // Curva do Sol / start of Reta Oposta
      [1380, 'R', 0, 420, 'paint'],  // Descida do Lago and the exit
      [1800, 'R', 0, 100, 'asphalt'],
      [2000, 'L', 0, 170, 'paint'],  // Ferradura
      [2030, 'R', 0, 220, { paint: [0x3b3e44, 0x3b3e44], strip: 4, beyond: 'grass' }], // dark apex strip, Ferradura/Laranjinha
      [2170, 'L', 0, 210, 'asphalt'],// Laranjinha outside: paddock road
      [2960, 'R', 0, 160, 'paint'],  // Mergulho
      [3120, 'R', 0, 130, 'asphalt'],// dark asphalt apron with sponsor logos before Junção
      [3330, 'R', 0, 320, { paint: [0xa9aaa4, 0xb4b5ae], strip: 10, beyond: 'grass' }],// light grey paved strip along the climb (Café), grass bank beyond
      [3800, 'R', 0, 501, 'paint'],
    ],
    traps: [],
    sausages: [
      [2960, 'L', 0, 90],  // Mergulho apex
      [1520, 'L', 0, 120], // Descida do Lago / exit apex
    ],
  },
  bridges: [
    [1023, 'foot'], // slim footbridge over the Reta Oposta and the service road beside it
    [3845, 'foot'], // footbridge over the main straight between the grandstands
  ],
  ground: 'grass',
  scenery: {
    trees: 0.05, // the infield is open grass with almost no trees; woods come from OSM
    landTrees: { grass: 0.02 },
    landColors: { gravel: 0xa8643f }, // red earth (the 'gravel' areas below); no gravel traps on track
  },
  stands: [
    [3800, 'R', 0, 501, 16], // Arquibancadas: continuous stands along the west side to the line
    [0, 'R', 0, 300, 16],    // main stand with the "City of São Paulo" roof, west of the pit straight
  ],
  areas: [
    // open infield (Laranjinha to Junção and the climb): no trees
    { noTrees: true, pts: [[25, 170], [55, 120], [140, 100], [200, 140], [300, 275], [355, 355], [370, 420], [340, 470], [310, 470], [380, 580], [395, 640], [370, 665], [290, 690], [180, 670], [60, 610], [30, 560], [10, 450], [-20, 330], [-25, 240]] },
    // red-earth cutting between the Reta Oposta and the wooded hill (west side)
    { kind: 'gravel', pts: [[465.8, 49.3], [506.8, 38.4], [498, -38.1], [479.4, -114.6], [457.6, -180.2], [424.8, -180.2], [441.2, -103.7], [457.6, -38.1], [457.6, 16.5]] },
    // sandy service road east of the Reta Oposta
    { kind: 'sand', pts: [[596.7, 125.8], [615.8, 125.8], [528.5, -204], [509.4, -204]] },
    // red-brown dirt patch beyond the Descida do Lago run-off, by the lake
    { kind: 'gravel', pts: [[584.9, 495.3], [658.6, 489.9], [642.2, 418.9], [625.9, 424.3]] },
    // dark asphalt car park south of Mergulho
    { kind: 'asphalt', pts: [[193.4, 390], [258.9, 392], [256.1, 350.6], [190.5, 353.3]] },
  ],
  notes: `Interlagos sits in a bowl surrounded by dense São Paulo city (red-roofed houses, favela on the hill north of Café).
- Pit straight / Arquibancadas (3800-330): long grandstands with a "City of São Paulo" roof on the right (west); pit lane and the long white pit building / paddock on the left (east). Avenue with trees beyond the west grandstands.
- Senna S (330-530): very large dark asphalt run-off apron outside T1 and inside T2 with teal bands near the track; south of it a grass bank, a perimeter road and housing.
- Curva do Sol (600-800): pit-exit lane on the left; on the right a teal painted strip, grass and an open car park / service area with parked trucks.
- Reta Oposta (800-1380): on the left a red-earth cutting and dense woodland (central hill, festival / parking area with lighting towers beyond); on the right a sandy service road and a kart track (Kartódromo) further east, then houses.
- Descida do Lago (1380-1600): big teal painted run-off outside; behind it a red-brown dirt/clay patch and the lake (Lago) north-east; woods inside.
- 1600-2000: woodland on the left (south-east), the lower infield and the old circuit roads on the right.
- Ferradura / Laranjinha (2000-2300): teal run-off and the paddock / hospitality building beyond; service roads.
- Infield (2300-3250): open grass with dirt patches, old disused track loops and access roads; dark asphalt car park around 3000-3100 south of Mergulho.
- Junção / Café (3250-3650): the lake and team hospitality tents east of Junção; climbing outside wall with a perimeter road and woods/favela beyond to the north.
No gravel traps are visible anywhere; widths are approximate (±3 m). Kerbs appear white/coloured stripes but colours are not resolvable at this resolution.`,
};
