// Run-off and surroundings for this circuit, matched to aerial imagery: see src/tracks/land/README.md.
// Barcelona-Catalunya, current layout (no final chicane). Lap metres as labelled on the reference
// aerials (game lap 4654 m). Widths measured at ~0.45 m/px from the real asphalt edge to the wall/fence.
const TEAL = (strip) => ({ paint: [0x2e8a86, 0x2e8a86], strip, beyond: 'asphalt' }); // solid teal-green band
const RED = (strip) => ({ paint: [0xc8323a, 0xc8323a], strip, beyond: 'asphalt' }); // solid red band

export default {
  surfaces: {
    gravel: 0xc2b49a, // pale beige/grey-brown Catalan gravel
    paint: [0xc8323a, 0xf2f2f2], // red/white chequer (only the T10 logo uses the default paint)
    widen: 0,
    width: [
      // main straight: grandstands on the left, pit wall on the right
      [0, 'L', 0, 230, 5],
      [0, 'R', 0, 260, 3],
      [230, 'L', 0, 570, 6],
      [260, 'R', 0, 190, 10],
      [450, 'R', 0, 200, 12],
      [650, 'R', 0, 160, 20],
      // T1 Elf / T2
      [800, 'L', 0, 30, 15],
      [830, 'L', 0, 180, 45],
      [810, 'R', 0, 110, 25],
      [920, 'R', 0, 130, 22],
      [1010, 'L', 0, 50, 10],
      // T3 Renault (long right)
      [1060, 'L', 0, 360, 25],
      [1050, 'R', 0, 370, 20],
      // back straight to T4
      [1420, 'L', 0, 280, 28],
      [1420, 'R', 0, 280, 7],
      // T4 Repsol (right hairpin-ish), huge gravel outside
      [1700, 'L', 0, 180, 60],
      [1700, 'R', 0, 200, 6],
      [1880, 'L', 0, 200, 30],
      [1900, 'R', 0, 180, 6],
      // T5 Seat (left)
      [2080, 'R', 0, 120, 55],
      [2080, 'L', 0, 120, 15],
      // T6 to T7/T8
      [2200, 'L', 0, 120, 10],
      [2200, 'R', 0, 120, 12],
      [2320, 'L', 0, 140, 10],
      [2320, 'R', 0, 140, 15],
      [2460, 'R', 0, 160, 50],
      [2460, 'L', 0, 160, 10],
      [2620, 'L', 0, 180, 25],
      [2620, 'R', 0, 180, 25],
      // T9 Campsa (fast right)
      [2800, 'L', 0, 160, 35],
      [2800, 'R', 0, 160, 12],
      // straight to T10
      [2960, 'L', 0, 210, 40],
      [2960, 'R', 0, 490, 6],
      [3170, 'L', 0, 280, 15],
      // T10 La Caixa (left hairpin) and T11
      [3450, 'R', 0, 90, 12],
      [3450, 'L', 0, 90, 12],
      [3540, 'L', 0, 180, 25],
      [3540, 'R', 0, 180, 30],
      // T12 Banc Sabadell (long right) along the grandstands
      [3720, 'L', 0, 160, 15],
      [3720, 'R', 0, 160, 12],
      [3880, 'L', 0, 160, 15],
      [3880, 'R', 0, 160, 15],
      // T13 (right) by the RACC area
      [4040, 'L', 0, 210, 40],
      [4040, 'R', 0, 210, 10],
      // T14 (fast right onto the pit straight)
      [4250, 'L', 0, 200, 45],
      [4250, 'R', 0, 404, 8],
      [4450, 'L', 0, 110, 30],
      [4560, 'L', 0, 94, 8],
    ],
    paved: [
      [0, 'L', 0, 800, 'asphalt'],
      [0, 'R', 0, 650, 'asphalt'],
      [660, 'R', 0, 120, RED(6)], // red painted wedge before T1
      [800, 'L', 0, 210, TEAL(8)], // teal band outside T1, gravel beyond
      [920, 'R', 0, 130, RED(3)],
      [1010, 'L', 0, 50, TEAL(4)],
      [1060, 'L', 0, 360, RED(4)], // red band then grey tarmac outside T3
      [1060, 'R', 0, 360, { paint: [0x8a8f93, 0x8a8f93], strip: 3, beyond: 'grass' }],
      [1420, 'L', 0, 660, RED(3)],
      [1420, 'R', 0, 660, 'asphalt'],
      [2080, 'L', 0, 120, { paint: [0xc8323a, 0xc8323a], strip: 6, beyond: 'grass' }], // red inside T5
      [2320, 'L', 0, 140, 'asphalt'],
      [2370, 'R', 0, 80, RED(10)], // red painted wedge (T6 exit)
      [2560, 'L', 0, 60, { paint: [0xc8323a, 0xc8323a], strip: 4, beyond: 'grass' }],
      [2620, 'L', 0, 550, 'asphalt'],
      [2850, 'R', 0, 100, { paint: [0xc8323a, 0xc8323a], strip: 4, beyond: 'grass' }], // red inside T9
      [3180, 'L', 0, 40, RED(8)],
      [3450, 'R', 0, 90, TEAL(10)], // teal outside T10
      [3450, 'L', 0, 270, 'paint'], // red/white chequered "Circuit de Barcelona" logo inside T10
      [3540, 'R', 0, 180, TEAL(5)],
      [3720, 'L', 0, 160, RED(4)], // red band outside T12
      [3720, 'R', 0, 330, TEAL(8)], // teal inside T12
      [3880, 'L', 0, 160, 'asphalt'],
      [4040, 'L', 0, 410, RED(7)], // wide red band outside T13/T14
      [4050, 'R', 0, 200, TEAL(14)], // teal RACC logo area inside T13
      [4250, 'R', 0, 200, TEAL(6)],
      [4450, 'L', 0, 204, 'asphalt'],
    ],
    traps: [
      [830, 'L', 0, 180, 8], // T1
      [940, 'R', 0, 100, 8], // T2 outside
      [1080, 'L', 0, 330, 8], // T3
      [1420, 'L', 0, 280, 8], // back straight
      [1700, 'L', 0, 380, 4], // T4 and on to T5
      [2085, 'R', 0, 115, 4], // T5
      [2470, 'R', 0, 150, 4], // T7
      [2630, 'L', 0, 330, 6], // T8 to T9
      [2970, 'L', 0, 190, 10], // T10 approach, left
      [3560, 'L', 0, 160, 15], // behind the T10/T11 painted logo
      [3560, 'R', 0, 160, 6], // outside T11
      [4050, 'L', 0, 200, 8], // T13
      [4260, 'L', 0, 280, 10], // T14
      [4540, 'L', 0, 30, 8],
    ],
    sausages: [],
  },
  stands: [
    [0, 'L', 0, 230, 16], // covered main grandstand opposite the pits
    [450, 'L', 0, 350, 12], // stands along the rest of the main straight
    [900, 'L', 0, 110, 12], // T1 stand behind the gravel
    [2850, 'L', 0, 110, 12], // outside T9 Campsa
    [3740, 'L', 0, 280, 16], // big curved stand outside T12
    [4020, 'L', 0, 70, 10], // outside T13
  ],
  scenery: { landColors: { gravel: 0xc2b49a } },
  bridges: [
    [5, 'gantry'], // start-light gantry
    [1660, 'foot'], // footbridge on the run to T4
    [2310, 'foot'], // footbridge between T5 and T6
    [2790, 'gantry'], // gantry before T9
    [3370, 'foot'], // big pink/red footbridge before T10
  ],
  areas: [
    // big beige gravel run-off fields inside the T10-T13 complex (OSM has it as grass)
    { kind: 'gravel', pts: [[-186, 288], [-150, 315], [-97, 331], [-43, 335], [1, 326], [37, 306], [46, 288], [1, 288], [-25, 279], [-79, 275], [-133, 273], [-177, 270]] },
    { kind: 'gravel', pts: [[-159, 212], [-97, 226], [-43, 221], [-34, 199], [-79, 183], [-133, 172], [-168, 179]] },
  ],
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  ground: 'grass',
  notes: `Run-off: mostly pale beige gravel traps behind a 4-10 m band of asphalt that is painted
red or teal-green near the kerbs (the distinctive Barcelona look). Big traps outside T1 (~45 m),
T4 Repsol (~60 m), T5 Seat (~55 m, right), T7 (~50 m), T13/T14 (40-45 m). Main straight is walled:
grandstands with roofs ~5-6 m off the left edge, pit wall on the right with the pit-exit lane merging
around 260-450 m (big yellow "CATALUNYA" lettering painted on the asphalt there). A red painted wedge
sits on the right at 650-800 m before T1. Inside T10 a large red/white chequered "Circuit de Barcelona"
logo is painted on the run-off; inside T12/T13 a teal painted area carries a yellow "RACC" logo and a
small kart-style infield track; dark asphalt service road loops inside T12-T13.

Structures: pit building/paddock roofs along the right of the main straight (0-250 m); covered main
grandstand on the left 0-230 m, uncovered stands left 450-800 m; footbridge over the track at ~1650
(T4 approach), ~2320 (T6/T7) and a pinkish gantry/bridge at ~3370 (before T10); grandstands outside
T9 (left), outside T12 (left, 3750-4000, very close) and outside T13. Control tower/heliport and
the main paddock car park east of T10 between the back straight and the pit straight.

Surroundings: east of the main straight a railway line and the Montmeló/Granollers industrial estate
(large warehouses); south (beyond T1-T3) pine woods and a service road; west of the back straight
(1300-1600 m) a motocross dirt track and fields; north-west the C-17/AP-7 roads and farmland;
north of T12-T14 hilly grass with scattered pines and a motorway beyond. Infield between T3 and T5
is grassy bank with pines; infield between T5-T9 and the main straight has paddock buildings, car parks
and the karting/driving school area. Ground mostly dry grass and pine woodland.`,
};
