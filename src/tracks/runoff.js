// Gravel traps and sausage kerbs, per circuit, where the real circuits have them.
//
// Kept apart from the generated track files (scripts/import-track.mjs rewrites those), keyed
// by track id. Each entry is [at, side, from, to]:
//   at:   a corner name from the track's `corners` (its apex), or a number 0..1 = fraction
//         of the lap from the start line (for circuits whose corners aren't named)
//   side: 'out' / 'in' (outside / inside of the corner at `at`), 'L' / 'R' (driver's left /
//         right), 'both', or for sausages 'apexes' (the inside of each turn along the stretch)
//   from, to: metres relative to `at` along the lap (negative = before it)
// Gravel fills the run-off from just past the kerb out to the barrier (TrackPath.computeRunoff),
// and only where there is room for it; sausage kerbs sit just behind the painted kerb.
// `gravel` (optional) is the stone colour.
//
// Sources: circuit maps and onboard footage as of the 2024-2025 seasons; Spa's 2022 rebuild
// (gravel returned at La Source, Raidillon, Les Combes, Stavelot and Blanchimont). Corners
// marked "likely" are less certain than the rest.
export const RUNOFF = {
  spa: {
    gravel: 0xa29d92, // grey Ardennes stone
    traps: [
      ['La Source', 'out', -10, 70],
      ['Raidillon', 'out', -50, 130], // the 2022 rebuild: gravel the whole way up the climb
      ['Raidillon', 'in', 10, 110],
      ['Les Combes', 'out', -20, 70],
      ['Malmedy', 'out', -20, 60],
      ['Bruxelles', 'out', -20, 60],
      ['Pouhon', 'out', -40, 160],
      ['Fagnes', 'out', -20, 80],
      ['Campus', 'out', -20, 60],
      ['Stavelot', 'out', -30, 120],
      ['Blanchimont', 'out', -60, 180],
    ],
    sausages: [
      ['Bus Stop', 'apexes', -20, 30], // yellow sausages inside the chicane
    ],
  },
  silverstone: {
    gravel: 0xb8a582, // light sand-coloured gravel
    traps: [
      ['Abbey', 'out', 0, 90],
      ['Brooklands', 'out', -10, 70],
      ['Luffield', 'out', -10, 90],
      ['Copse', 'out', -10, 160],
      // Maggotts-Becketts-Chapel: gravel on both sides the whole way through (the OSM corner
      // names sit an apex off, so this is one stretch rather than per-corner outsides)
      ['Maggotts', 'both', -60, 380],
      ['Stowe', 'out', -20, 150],
    ],
    sausages: [],
  },
  // A walled island circuit: grass and concrete almost everywhere. The one big gravel trap
  // is around the outside of the Senna S at the end of the pit straight.
  montreal: {
    gravel: 0xa8a08e,
    traps: [
      ['Senna S (T1)', 'out', -30, 50],
      ['Senna S (T2)', 'out', -20, 60],
    ],
    sausages: [],
  },
  imola: {
    gravel: 0xb39c78,
    traps: [
      ['Variante Tamburello', 'out', -20, 110],
      ['Variante Villeneuve', 'out', -20, 80],
      ['Tosa', 'out', -20, 90],
      ['Piratella', 'out', -10, 90],
      ['Acque Minerali', 'out', -30, 110],
      ['Gresini', 'out', -10, 70], // Variante Alta
      ['Rivazza', 'out', -30, 170],
    ],
    sausages: [
      // chicanes: sausages on the inside of each part
      ['Variante Tamburello', 'apexes', -20, 50],
      ['Gresini', 'apexes', -25, 25], // the Variante Alta's yellow sausages
    ],
  },
  suzuka: {
    gravel: 0xa9a294,
    traps: [
      ['First Turn', 'out', -30, 60],
      ['Second Turn', 'out', -20, 60],
      ["'S' Curves", 'both', -60, 120], // gravel close in on both sides through the esses
      ['Gyaku Curve', 'out', -20, 60],
      ['NIPPO Corner', 'out', -20, 80], // Dunlop
      ['Degner Curve 1', 'out', -10, 70],
      ['Degner Curve 2', 'out', -10, 60],
      ['NISSIN Brake Hairpin', 'out', -10, 60], // likely
      ['Spoon Curve', 'out', -40, 180],
      ['130R', 'out', 10, 120], // likely: asphalt first, gravel beyond
    ],
    sausages: [],
  },
  // Not listed: circuits with asphalt run-off or walls in the places that matter (Jeddah,
  // Miami, Bahrain, Shanghai) and the test oval.
};
