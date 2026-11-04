// Real circuits imported from OpenStreetMap by scripts/import-track.mjs.
//
// center: [lat, lon] near the middle of the circuit (also the projection latitude)
// relation: OSM relation id(s) of the circuit (needed for street circuits on public roads)
// realLength: official lap length (m); the lap is the OSM cycle closest to it
// dir: 'cw' | 'ccw' racing direction (used when the raceway ways carry no oneway tags,
//      and to check them when they do)
// via / avoid: [lat, lon] points the lap must / must not pass (for multi-layout venues)
// kerb: the two kerb stripe colours; scenery: see src/terrain.js
// night: a note, for races held under floodlights (dark sky, floodlight towers: src/night.js)
//
// Lengths and directions: Formula 1 / Wikipedia "List of Formula One circuits".
// Kerbs: almost every F1 circuit runs red/white kerbs; exceptions are noted per circuit.
const RED = 0xd0201c, WHITE = 0xf2f2f2;

export const CIRCUITS = {
  albertpark: {
    name: 'Albert Park', country: 'Australia', realLength: 5278, dir: 'cw',
    center: [-37.8497, 144.968], relation: 280443, width: 14,
    // the relation's pit_lane member is an untagged service road; start: its raceway=start-finish
    // node; smooth 5: the OSM corner nodes at T13 make a 9 m kink
    pitWays: [28119448], start: [-37.8500562, 144.9689843], smooth: 5,
    about: `Albert Park, Melbourne: public park roads around Albert Park Lake, driven clockwise
      (2022 layout without the old T9-T10 chicane). Start/finish on the pit straight, then the
      T1-T2 Brabham/Jones complex, the lakeside run through the fast T9-T10 sweepers and the
      T11-T12 chicane, and back past the pits.`,
    kerbNote: 'red/white kerbs: the green/yellow kerb markings were repainted for 2025 at the FIA\'s insistence',
    kerb: [RED, WHITE],
    scenery: { trees: 0.32, conifer: 0.05 },
    // F1: 2.6 m. Mapzen here is integer metres with ±4 m tree/lake noise: a 200 m median and a
    // ±2 m band leave only its long-wavelength trend, scaled to the published range.
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 200, tol: 2, range: 2.6 },
  },
  shanghai: {
    name: 'Shanghai International Circuit', country: 'China', realLength: 5451, dir: 'cw',
    center: [31.3389, 121.2197], relation: 2094941,
    // the relation's pit_lane members carry no pit tags; start: its role=start node (untagged)
    pitWays: [107371138, 107371147], start: [31.3373194, 121.2206097],
    about: `Shanghai International Circuit, driven clockwise: the tightening T1-T2 snail, the
      T3-T4 hairpin, the fast T7-T8 esses, the T11-T13 spiral onto the 1.2 km back straight and
      the T14 hairpin.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.1, conifer: 0.05 },
    // F1: 7.4 m. Mapzen is integer metres with ±2 m noise here (and water pixels in the infield):
    // a 150 m median keeps only its longer rises (the biggest, through T7-T8), scaled to the figure.
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 150, tol: 1, range: 7.4 },
  },
  suzuka: {
    name: 'Suzuka', country: 'Japan', realLength: 5807,
    center: [34.8431, 136.5407], relation: 284570,
    about: `Suzuka International Racing Course: the figure-of-eight Grand Prix layout. The back
      straight from Spoon to 130R crosses over the section between Degner and the hairpin on a
      bridge. Start/finish on the downhill pit straight, then the S curves, Dunlop, Degner,
      under the bridge, the hairpin, Spoon, over the bridge, 130R and the Casio Triangle.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.45, conifer: 0.35 },
    // F1: 40.4 m, low between T1 and T2, high just past Spoon. The crossover: about 7.5 m road
    // to road (a 1.5 m deck over 6 m of headroom).
    elevation: {
      provider: 'gsi-dem5a', label: 'GSI DEM5A 5 m airborne-laser DEM (Geospatial Information Authority of Japan)',
      median: 0, tol: 0.3, checkRange: 40.4,
      notches: { maxLen: 60, depth: 1.5 }, // tunnels and the crossover: decks missing from bare earth
      bridge: { clearance: 7.5, upper: 'later', blend: 350, lowerShare: 0.75 }, // the back straight is flat out
    },
  },
  bahrain: {
    name: 'Bahrain International Circuit', country: 'Bahrain', realLength: 5412, dir: 'cw',
    center: [26.0325, 50.5106], relation: 11987743,
    about: `Bahrain International Circuit, Sakhir: the Grand Prix layout, driven clockwise through
      the desert. (On the 2026 calendar but cancelled in March 2026.)`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    night: 'raced under floodlights since 2014', // floodlit night race
    scenery: { trees: 0.0, desert: true },
    // F1: 16.9 m, highest at T4, the main straight ~15 m lower.
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 60, tol: 1, range: 16.9 },
  },
  jeddah: {
    name: 'Jeddah Corniche Circuit', country: 'Saudi Arabia', realLength: 6174, dir: 'ccw', width: 13,
    center: [21.6319, 39.1044], radius: 3200,
    about: `Jeddah Corniche Circuit: the fast, walled seafront street circuit, driven anticlockwise.
      (On the 2026 calendar but cancelled in March 2026.)`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    night: 'raced under floodlights', // floodlit night race
    // no sand anywhere: painted asphalt run-off and paved ground, and lit up like a festival
    scenery: { trees: 0.0, paved: true, illuminated: true, city: true, tall: 1.4, sea: 'west' },
    // No published figure (nearly flat, up to ~8 m). Mapzen has ±3 m noise and a ~10 m dip (sea
    // pixels by the shore) before T13: a 200 m median drops it, a ±2 m band leaves gentle grades.
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 200, tol: 2, maxRange: 8 },
  },
  miami: {
    name: 'Miami International Autodrome', country: 'United States', realLength: 5412, dir: 'ccw',
    center: [25.9581, -80.2389], smooth: 4, // smooth: the T14-T15 chicane nodes make a 10 m kink
    about: `Miami International Autodrome: a temporary circuit around Hard Rock Stadium, Miami
      Gardens, driven anticlockwise.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.12, conifer: 0, palms: true },
    // No published figure (the T14-T15 ramp is ~3.4 m). The bare-earth DEM is 1-2 m flat car parks
    // with only ~1 m bumps at T14-T15 (it likely predates the ramp); a ±0.2 m band keeps them.
    elevation: { dataset: 'ned10m', label: 'USGS 3DEP 1/3 arc-second (NED 10 m)', median: 0, tol: 0.2, maxRange: 4 },
  },
  monaco: {
    name: 'Circuit de Monaco', country: 'Monaco', realLength: 3337, dir: 'cw',
    // narrow streets; the Grand Hotel hairpin is about 10 m radius and its two legs ~18 m apart
    width: 10, minRadius: 9,
    // a street circuit: walls close to the kerbs; the city around it from scripts/fetch-city.mjs
    runoff: 2, city: true,
    center: [43.7362, 7.4243], relation: 148194, radius: 1500,
    start: [43.7350269, 7.4212652], // OSM node 4937755860 raceway=start-finish
    corners: [
      ['Sainte-Devote', 43.73696, 7.42159], ['Massenet', 43.738406, 7.427848], ['Casino', 43.739407, 7.427192],
      ['Mirabeau', 43.741101, 7.428881], ['Grand Hotel Hairpin', 43.740213, 7.429608], ['Portier', 43.741078, 7.43027],
      ['Nouvelle Chicane', 43.737175, 7.425454], ['Tabac', 43.736749, 7.42219], ['Piscine', 43.735466, 7.421825],
      ['Rascasse', 43.732621, 7.42348], ['Anthony Noghes', 43.732382, 7.422539],
    ],
    about: `Circuit de Monaco: the streets of Monte Carlo, driven clockwise. Sainte-Devote, the
      climb up Beau Rivage to Massenet and Casino, the drop to Mirabeau, the Grand Hotel hairpin,
      Portier, the tunnel, the Nouvelle Chicane, Tabac, the Swimming Pool, Rascasse and Anthony
      Noghes.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.08, conifer: 0.2, city: true, sea: 0 }, // sea: water level (m above sea level), the Mediterranean
    // F1: 42 m, highest at Casino, lowest before Rascasse. The DEM includes buildings (the tunnel runs
    // under the Fairmont hotel): a median filter drops the spikes. From Portier to the Nouvelle Chicane
    // the DEM has the sea, the hotel and the hillside above the tunnel, and at Rascasse-Anthony Noghes
    // the buildings beside the road: both bridged. Mapzen follows the Beau Rivage climb better than EU-DEM.
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 60, tol: 2, range: 42, smooth: 40, gaps: [[1430, 2140], [2870, 3080]] },
  },
  barcelona: {
    name: 'Circuit de Barcelona-Catalunya', country: 'Spain', realLength: 4657, dir: 'cw',
    center: [41.57, 2.2611],
    start: [41.570986, 2.2620254], // OSM finish node 14202158171 on the pit straight (node 14202158170 sits at T12-T13)
    // keep the GP line: skip the old RACC chicane (1560896068, exits 921317985/1560896067), the inner T12-T13 link (1560896063, 921317983),
    // the unpaved old T10-T12 (921317981/2), the old Nissan chicane (975311489, 33742109), the T1 cut
    // (114293333/4) and the MotoGP long-lap-penalty loop (921317988)
    skipWays: [1560896068, 921317985, 1560896067, 1560896063, 921317983, 921317981, 921317982, 975311489, 33742109, 114293333, 114293334, 921317988],
    corners: [
      ['Elf (T1)', 41.564626, 2.25645], ['Renault (T3)', 41.564281, 2.252968], ['Repsol (T4)', 41.568408, 2.254355],
      ['Seat (T5)', 41.565427, 2.254066], ['Campsa (T9)', 41.570080, 2.256010], ['La Caixa (T10)', 41.572958, 2.261992],
      ['Banc Sabadell (T12)', 41.573235, 2.259110],
    ],
    about: `Circuit de Barcelona-Catalunya, Montmelo: the Grand Prix layout since 2023, without the
      final chicane (the last two corners are fast right-handers onto the pit straight).`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.22, conifer: 0.5 },
    // F1: 29.6 m (measured with the old chicane), highest at T12, lowest at T1
    elevation: { dataset: 'eudem25m', label: 'EU-DEM 25 m', median: 0, tol: 1, range: 29.6 },
  },
  redbullring: {
    name: 'Red Bull Ring', country: 'Austria', realLength: 4318, dir: 'cw',
    center: [47.2197, 14.7647],
    start: [47.2202964, 14.7667292], // OSM node 13826152422 'Finish Line' (untagged)
    about: `Red Bull Ring, Spielberg: the short Grand Prix layout on a Styrian hillside, driven
      clockwise. The climb from T1 up to the T3 hairpin is the steepest on the calendar.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.3, conifer: 0.75 },
    // F1: 63.5 m; the circuit quotes a 12% maximum incline (the climb from T1 to T3) and 9.3% maximum decline
    elevation: { dataset: 'eudem25m', label: 'EU-DEM 25 m', median: 0, tol: 1, range: 63.5 },
  },
  hungaroring: {
    name: 'Hungaroring', country: 'Hungary', realLength: 4381, dir: 'cw',
    center: [47.5789, 19.2486],
    pitWays: [231417580, 540411086], // 'Bokszutca' (Hungarian for pit lane)
    corners: [
      ['Turn 1', 47.582357, 19.242307], ['Turn 2', 47.580978, 19.2483], ['Turn 3', 47.582456, 19.24762],
      ['Turn 4', 47.586163, 19.250554], ['Turn 5', 47.588427, 19.250788], ['Turn 14', 47.578129, 19.251957],
    ],
    about: `Hungaroring, Mogyorod: a twisty circuit in a dusty valley bowl, driven clockwise.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.22, conifer: 0.2 },
    // F1: 34.7 m, dropping to T3 and climbing back to the main straight
    elevation: { dataset: 'eudem25m', label: 'EU-DEM 25 m', median: 0, tol: 1, range: 34.7 },
  },
  zandvoort: {
    name: 'Zandvoort', country: 'Netherlands', realLength: 4259, dir: 'cw',
    center: [52.3888, 4.5409],
    about: `Circuit Zandvoort: a roller-coaster circuit in the dunes by the North Sea, driven
      clockwise, with the banked Hugenholtz hairpin (T3) and Arie Luyendyk bocht (T14).`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.18, conifer: 0.5, dunes: true },
    // no F1 figure (sources say ~8-14 m): the data's shape, capped at 14 m. Both DEMs are coarse here (1 m
    // steps); Mapzen shows the Hunserug crest and the drop through Scheivlak, EU-DEM only 3 m in all.
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 0, tol: 1, maxRange: 14 },
  },
  monza: {
    name: 'Monza', country: 'Italy', realLength: 5793, dir: 'cw',
    center: [45.6156, 9.2811], relation: 284565,
    // no raceway=finish node: the start lights (OSM traffic_signals node 1828499259) on the pit straight
    start: [45.6189632, 9.2811729],
    about: `Autodromo Nazionale di Monza: the Grand Prix circuit in the royal park, driven clockwise.
      Rettifilo, Curva Grande, Roggia, the two Lesmos, Serraglio, Ascari, the back straight and
      the Parabolica (Curva Alboreto).`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.6, conifer: 0.1 },
    elevation: { dataset: 'eudem25m', label: 'EU-DEM 25 m', median: 60, tol: 1, range: 12.8 },
  },
  madring: {
    name: 'Madring', country: 'Spain', realLength: 5414, dir: 'cw',
    center: [40.465, -3.615], relation: 18813472,
    about: `Madring, Madrid: the new hybrid street circuit around IFEMA and Valdebebas, first raced
      in 2026, with the banked "La Monumental" T12.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.08, conifer: 0.3, city: true },
    elevation: { dataset: 'eudem25m', label: 'EU-DEM 25 m', median: 60, tol: 1, maxRange: 25 },
  },
  baku: {
    name: 'Baku City Circuit', country: 'Azerbaijan', realLength: 6003, dir: 'ccw', width: 12,
    // a street circuit: walls close to the kerbs; the city around it from scripts/fetch-city.mjs
    runoff: 3, city: true,
    center: [40.3685, 49.8433], relation: 11266687, radius: 2500,
    // OSM node 13826310747 name="Finish Line" (not tagged raceway=finish)
    start: [40.3721915, 49.8517072],
    about: `Baku City Circuit: streets of the Azerbaijani capital, driven anticlockwise. The narrow
      climb past the old city walls at the castle section and the 2.2 km flat-out run along the
      seafront boulevard to the start line.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.06, conifer: 0.1, city: true, sea: -28 }, // the Caspian is 28 m below sea level
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 100, tol: 2, smooth: 40, range: 26.8 },
  },
  singapore: {
    name: 'Marina Bay', country: 'Singapore', realLength: 4940, dir: 'ccw', width: 13,
    center: [1.2914, 103.864], relation: 421263,
    // OSM node 13826310653 name="Finish Line" (not tagged raceway=finish)
    start: [1.290463, 103.8643543],
    about: `Marina Bay Street Circuit, Singapore: the 2023 layout (without the old T16-T19
      section under the grandstand), driven anticlockwise around the Padang and Marina Bay.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    night: 'the original F1 night race (2008)', // floodlit night race
    scenery: { trees: 0.18, conifer: 0, palms: true, city: true },
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 250, tol: 1.5, range: 5.3 },
  },
  cota: {
    name: 'Circuit of the Americas', country: 'United States', realLength: 5513, dir: 'ccw',
    center: [30.1328, -97.6411],
    // the COTA Short Track way shares nodes with the GP lap and offered a hooked detour at T6-T7
    skipWays: [1482931764],
    about: `Circuit of the Americas, Austin: driven anticlockwise. The steep climb to the T1
      hairpin, the fast esses, the long back straight and the stadium section.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.1, conifer: 0.1 },
    elevation: { dataset: 'ned10m', label: 'USGS NED 1/3 arc-second (10 m)', median: 0, tol: 1, range: 30.9 },
  },
  mexico: {
    name: 'Autodromo Hermanos Rodriguez', country: 'Mexico', realLength: 4304, dir: 'cw',
    center: [19.4042, -99.0907], relation: 16251935,
    // OSM has the timing line only as a node named 'Finish Line' (no raceway tag); the grid's 'Start Line' is 130 m further on
    start: [19.4062874, -99.0949202],
    // Formula E links and the pre-2015 full Peraltada (the F1 lap goes through the Foro Sol)
    skipWays: [772754604, 772754607, 823823138, 772754609, 772754606, 1128592397, 772755822, 605367312, 823823139],
    about: `Autodromo Hermanos Rodriguez, Mexico City: driven clockwise, 2,240 m above sea level.
      The long run to T1, the esses, and the Foro Sol baseball stadium section before the
      Peraltada.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.25, conifer: 0.2 },
    corners: [
      ['Turn 1', 19.404763, -99.083472], ['Turn 4', 19.398168, -99.086159], ['Turn 6', 19.397173, -99.086858],
      ['Esses', 19.40055, -99.087271], ['Foro Sol', 19.405347, -99.095248], ['Peraltada', 19.406257, -99.096315],
    ],
    // F1: 2.8 m. A city DEM: the median drops buildings and bridges
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 250, tol: 3, range: 2.8 },
  },
  interlagos: {
    name: 'Interlagos', country: 'Brazil', realLength: 4309, dir: 'ccw',
    center: [-23.7036, -46.6997], relation: 6781071,
    // timing line: OSM node 'Finish Line' (untagged); the grid's 'Start Line' is 60 m further down the straight
    start: [-23.7032239, -46.7001274],
    about: `Autodromo Jose Carlos Pace, Interlagos, Sao Paulo: driven anticlockwise in a hilly
      bowl. The Senna S, the Reta Oposta, the infield, and the long uphill flat-out climb from
      Juncao past the pits.`,
    kerbNote: 'green/yellow kerbs, the colours of Brazil (some also carry white)',
    kerb: [0x1e9e3a, 0xffd100],
    scenery: { trees: 0.3, conifer: 0.1 },
    // F1: 43 m, highest between the line and T1, lowest at T5 (Descida do Lago)
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 60, tol: 3, range: 43 },
  },
  lasvegas: {
    name: 'Las Vegas Strip Circuit', country: 'United States', realLength: 6201, dir: 'ccw', width: 14,
    center: [36.1147, -115.1640], relation: 16696508, radius: 2500,
    about: `Las Vegas Strip Circuit: a night street circuit, driven anticlockwise, with a 1.9 km
      flat-out run up the Strip past the casinos.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    night: 'Saturday-night race on the Strip', // floodlit night race
    scenery: { trees: 0.0, desert: true, city: true },
    corners: [
      ['Turn 1', 36.11084, -115.160346], ['Koval Lane', 36.119195, -115.163966], ['Sphere', 36.120944, -115.160148],
      ['Sands Avenue', 36.122314, -115.164045], ['The Strip', 36.125545, -115.169356], ['Harmon Avenue', 36.108838, -115.173145],
    ],
    // no published figure: NED 10 m shows the gentle real slope (the Strip climbs ~12 m from Sands Avenue south to Harmon)
    elevation: { dataset: 'ned10m', label: 'USGS NED 1/3 arc-second (10 m)', median: 60, tol: 0.5, maxRange: 20 },
  },
  lusail: {
    name: 'Lusail International Circuit', country: 'Qatar', realLength: 5419, dir: 'cw',
    center: [25.49, 51.4542],
    // the timing line: OSM node 14134811030 (raceway=start-finish)
    start: [25.4890496, 51.4497373],
    corners: [['Turn 1', 25.493362, 51.447949], ['Turn 6', 25.494039, 51.453144], ['Turn 16', 25.483991, 51.45369]],
    // no published figure: essentially flat; DEM noise becomes gentle grades
    elevation: { dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 200, tol: 2.5, maxRange: 8 },
    about: `Lusail International Circuit: a flowing desert circuit of medium and fast corners,
      driven clockwise under floodlights.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    night: 'raced under floodlights', // floodlit night race
    scenery: { trees: 0.0, desert: true },
  },
  yasmarina: {
    name: 'Yas Marina', country: 'United Arab Emirates', realLength: 5281, dir: 'ccw',
    center: [24.4672, 54.6031], relation: 11378665,
    // the 2021 T5 hairpin, not the old T5-T7 chicane
    via: [[24.47857, 54.60559]],
    // OSM has no timing-line node: the line on the pit straight, ~250 m before T1 (from memory)
    start: [24.469582, 54.605589],
    // the real pit exit dives through a tunnel under T1 and rejoins after T2; the game's pit lane
    // is level with the track, so it ends where the tunnel begins, merging before T1.
    // 188471238 beside the back straight is the second (North/South circuit) pit lane
    skipPitWays: [176695255, 176695253, 188471238],
    pitTrim: [0, 60],
    corners: [
      ['Turn 1', 24.47032, 54.607928], ['Turn 5', 24.478626, 54.605255], ['Turn 9', 24.463196, 54.609129],
      ['Hotel', 24.466579, 54.605337],
    ],
    // F1: 10.7 m (pre-2021 layout, highest at T3)
    elevation: { dataset: 'aster30m', label: 'ASTER GDEM 30 m', median: 100, tol: 1, range: 10.7 },
    about: `Yas Marina Circuit, Abu Dhabi: the 2021 layout, driven anticlockwise around the marina
      and under the Yas hotel.`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    night: 'twilight race: starts at sunset, finishes under floodlights', // floodlit night race
    scenery: { trees: 0.02, desert: true, palms: true },
  },
  imola: {
    name: 'Imola', country: 'Italy', realLength: 4909, dir: 'ccw',
    center: [44.3439, 11.7167], relation: 9291096,
    about: `Autodromo Internazionale Enzo e Dino Ferrari, Imola: driven anticlockwise along the
      Santerno river. Tamburello, Villeneuve, Tosa, the climb to Piratella, the drop to Acque
      Minerali, Variante Alta and the downhill Rivazza. (Not on the 2026 calendar.)`,
    kerbNote: 'red/white kerbs',
    kerb: [RED, WHITE],
    scenery: { trees: 0.45, conifer: 0.15 },
    elevation: { dataset: 'eudem25m', label: 'EU-DEM 25 m', median: 0, tol: 1 },
  },
};
