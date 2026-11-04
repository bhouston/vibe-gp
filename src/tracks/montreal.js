// Circuit Gilles Villeneuve, Montreal: current F1 layout, 4.361 km, run clockwise on Ile Notre-Dame.
// The start/finish line ("Salut Gilles") is on the pit straight, which runs south-south-east into the
// Senna S (T1 left, T2 tight right). The track then follows the western (river) side of the island
// north through the T3-T4 chicane, the T5 kink, the T6-T7 esses and the T8-T9 chicane, turns back at
// the L'Epingle hairpin (T10) at the northern tip, runs south down the Casino straight beside the
// Olympic rowing basin, and takes the T13-T14 final chicane (Wall of Champions on the outside of its
// exit) onto the pit straight.
//
// Reference: OpenStreetMap way 136717490 "Circuit Gilles-Villeneuve" (ODbL, (c) OpenStreetMap
// contributors), projected to local metres (equirectangular at 45.505 N) with the origin on the start
// line (OSM node 5775641515), resampled every ~10 m in corners and up to ~70 m on straights.
import elevation from './elevation/montreal.js';

export default {
  id: 'montreal',
  name: 'Circuit Gilles Villeneuve',
  country: 'Canada',
  realLength: 4361, // metres, official lap length
  width: 14,
  // projection origin of the points (the start line; scale taken at 45.505 N), for scripts/fetch-elevation.mjs
  geo: { lat: 45.500082, lon: -73.5227086, projLat: 45.505 },
  elevation, // m above sea level around the lap (real terrain, see the generated file)
  // red/white kerbs
  kerb: { colors: [0xd0201c, 0xf2f2f2] },
  corners: [
    { name: 'Senna S (T1)', at: 7 },
    { name: 'Senna S (T2)', at: 17 },
    { name: 'T3', at: 28 },
    { name: 'T4', at: 33 },
    { name: 'T5', at: 40 },
    { name: 'T6', at: 48 },
    { name: 'T7', at: 55 },
    { name: 'T8', at: 68 },
    { name: 'T9', at: 73 },
    { name: "L'Epingle (T10)", at: 88 },
    { name: 'Final chicane (T13)', at: 113 },
    { name: 'Wall of Champions (T14)', at: 117 },
  ],
  points: [
    [0, 0], [10, -69], [9, -128], [1, -196], [-3, -224], [-4, -236], [-4, -245], [-2, -253],
    [5, -260], [15, -266], [32, -273], [41, -277], [49, -283], [55, -290], [58, -299], [57, -307],
    [54, -316], [49, -323], [40, -330], [30, -334], [16, -335], [-50, -319], [-104, -299], [-160, -260],
    [-213, -215], [-243, -187], [-251, -180], [-257, -173], [-261, -166], [-261, -157], [-258, -147], [-253, -133],
    [-251, -122], [-251, -111], [-254, -102], [-296, -49], [-327, -9], [-343, 8], [-368, 24], [-384, 38],
    [-398, 54], [-412, 83], [-419, 124], [-419, 193], [-418, 257], [-418, 270], [-419, 281], [-422, 289],
    [-428, 296], [-436, 300], [-446, 302], [-457, 302], [-469, 298], [-480, 296], [-490, 297], [-503, 302],
    [-520, 315], [-534, 335], [-552, 401], [-558, 469], [-562, 538], [-564, 607], [-560, 676], [-553, 744],
    [-540, 810], [-521, 877], [-505, 935], [-503, 944], [-500, 953], [-493, 959], [-485, 960], [-472, 960],
    [-462, 962], [-450, 968], [-436, 981], [-426, 998], [-405, 1064], [-388, 1131], [-374, 1198], [-363, 1266],
    [-357, 1334], [-357, 1388], [-367, 1453], [-381, 1522], [-386, 1542], [-388, 1553], [-389, 1563], [-386, 1572],
    [-379, 1578], [-371, 1580], [-362, 1577], [-356, 1571], [-352, 1563], [-345, 1522], [-343, 1485], [-321, 1424],
    [-292, 1362], [-267, 1297], [-242, 1232], [-217, 1167], [-204, 1130], [-188, 1064], [-175, 996], [-161, 928],
    [-146, 860], [-132, 792], [-117, 723], [-103, 655], [-88, 587], [-74, 520], [-63, 464], [-60, 451],
    [-59, 441], [-60, 432], [-65, 426], [-73, 422], [-80, 417], [-84, 409], [-84, 400], [-70, 332],
    [-56, 263], [-41, 195], [-27, 127], [-12, 58],
  ],
  // Pit lane: OSM way 413000959, registered onto the centreline above (fit residual 0.7 m median).
  // Entry on the left before the final chicane, cutting inside T13-T14; the lane runs down the left
  // of the pit straight past the garages and rejoins on the left after the Senna S (T2).
  pitlane: {
    points: [
      [-59, 446.7], [-50.9, 417.2], [-44.9, 389.1], [-40.8, 369.3], [-39.3, 360.5], [-38.8, 352.8],
      [-39, 344], [-40.9, 332], [-47.8, 310.7], [-50, 302.1], [-50.5, 297.5], [-50.1, 293.6],
      [-49.3, 289.7], [-48.5, 284.1], [10.5, 4.2], [16.4, -23.5], [17.3, -29.1], [20.4, -48.5],
      [23.5, -68.9], [24.7, -81.8], [24.9, -93.4], [24.4, -108.2], [24.8, -117.6], [25.6, -123.9],
      [27.3, -134.8], [57.5, -276], [62, -296.2], [62.5, -303.5], [62.2, -307.7], [61.5, -312.2],
      [59.3, -318.3], [54.7, -324.5], [52.7, -327], [50.3, -329], [46.8, -331.2], [42.4, -333.2],
      [38, -334.7], [32.6, -335.5], [27.1, -336.1], [19.3, -336],
    ],
  },
};
