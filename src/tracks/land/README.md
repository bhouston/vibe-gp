# Circuit run-off and surroundings (`src/tracks/land/<id>.js`)

One hand-written file per circuit, matched to real aerial imagery, merged into the
generated track definition by `src/tracks/index.js` (`withLand`). Everything is optional;
an empty object keeps the defaults (and the circuit's entry in `src/tracks/runoff.js`).

```js
export default {
  // Inside the barriers: what the car drives on. Replaces the circuit's runoff.js entry.
  surfaces: {
    gravel: 0xb8a582,            // gravel stone colour, as seen from above
    paint: [0x2f6db5, 0xc8202a], // the two colours of painted run-off bands (same colour twice = plain paint)
    widen: 0,                    // 0 when `width` entries set the run-off (else fast corners widen it automatically)
    width: [[at, side, from, to, metres], ...],
    paved: [[at, side, from, to, kind], ...],
    traps: [[at, side, from, to, inset], ...],
    sausages: [[at, side, from, to], ...],
  },
  kerb: { colors: [0xd0201c, 0xf2f2f2] }, // kerb stripe colours, if the generated ones are wrong
  ground: 'grass',            // beyond the barriers where nothing else is mapped:
                              // 'grass' | 'desert' | 'dunes' | 'city' | 'paved'
  scenery: { trees: 0.3, conifer: 0.2, palms: false }, // overrides of the generated scenery
  areas: [{ kind: 'water', pts: [[x, y], ...] }, ...], // hand-traced extras, map metres (see below)
  notes: `Free text: what surrounds the circuit, for reference.`,
};
```

## Lap-relative entries: `[at, side, from, to, ...]`

- `at`: where the entry is anchored:
  - a number above 1 = **metres along the lap from the start line**, as labelled on the
    reference aerial images (ticks every 100 m, labels every 200 m);
  - a number 0..1 = a fraction of the lap;
  - a corner name from the track file's `corners`.
- `side`: `'L'` / `'R'` = the driver's left / right; `'both'`; `'out'` / `'in'` (outside /
  inside of the corner at `at`); `'apexes'` (sausages only: the inside of each turn).
- `from`, `to`: metres relative to `at` along the lap (negative = before it). Using the lap
  metre itself as `at` and `0, length` for the span is the simplest: `[1240, 'L', 0, 90]`.
- Later entries win where they overlap.

### `width`: `[at, side, from, to, metres]`

Run-off width from the edge of the track's asphalt to the face of the barrier (wall,
tyre stack or fence), as measured on the imagery. Without an entry the default is ~14 m,
widened at fast corners unless `widen: 0`. The game still pulls a barrier in where it would
hit another part of the circuit or the pit lane, and never puts it closer than ~3 m.

### `paved`: `[at, side, from, to, kind]`

Asphalt run-off from the kerb out to the barrier (or to a gravel trap's inner edge):
`kind` = `'asphalt'` (plain dark tarmac) or `'paint'` (painted in `surfaces.paint`
colours: diagonal bands of the two colours). `'paint'` takes an optional 6th value, the
width (m) of a painted strip past the kerb, with plain asphalt beyond it:
`[1240, 'L', 0, 90, 'paint', 5]`. For more control `kind` can be an object:
`{ paint: [0x2a9d4a, 0x2a9d4a], strip: 4, beyond: 'grass', pattern: 'along' }`: its own paint colours,
the pattern (`'diagonal'` 3 m bands at 45 degrees, the default; `'along'` 1.5 m bands
parallel to the track, like rainbow run-off; `'solid'` the first colour only; set the
default for `surfaces.paint` with `surfaces.paintPattern`)
(instead of `surfaces.paint`), an optional painted strip width, and what lies beyond the
strip (`'asphalt'`, the default, or `'grass'`). Anywhere without a `paved` or `traps` entry
the run-off is the circuit's ground (grass on most circuits). Paved run-off drives like
dusty asphalt; grass and gravel slow the car hard.

### `traps`: `[at, side, from, to, inset]`

Gravel, from `inset` metres past the kerb's outer edge (default 1.2; the strip before it
is grass, or asphalt where a `paved` entry covers it) out to the barrier. Ends taper.

### `sausages`: `[at, side, from, to]`

Yellow sausage kerbs just behind the painted kerb.

## `bridges`: structures over the track

`bridges: [[at, kind], ...]` with `at` as above (usually lap metres) and `kind` one of
`'foot'` (an enclosed footbridge on stair towers), `'road'` (a wide concrete road bridge)
or `'gantry'` (a slim steel advertising gantry). Each spans the track from barrier to
barrier with its supports just beyond them.

## `stands`: where the grandstands are

`stands: [[at, side, from, to, rows], ...]` (lap-relative like the run-off entries; `side`
'L' / 'R'; `rows` of seats, default 12, 16 for a big main stand). With this list the game
puts stands only there (long ones split into stands of up to 150 m, each shortened to fit
where needed); without it, it picks spots itself. A stand that would stand on the track,
the pit lane or water is left out.

## `areas`: hand-traced polygons beyond the barriers

OpenStreetMap land cover around each circuit (water, woods, fields, grass, car parks,
buildings) is imported automatically (`scripts/fetch-land.mjs`). Add `areas` only for
things that are clearly visible on the imagery near the circuit but missing or wrong in
OSM. `pts` are map metres: `+x` east, `+y` north, origin on the start line (the same
coordinates as the track file's `points`). Kinds: `'water'`, `'forest'`, `'grass'`,
`'farmland'`, `'sand'`, `'gravel'`, `'asphalt'`, `'concrete'`, `'meadow'`, `'scrub'`, `'urban'`.
Hand areas are drawn over OSM ones (including the sea). They stop at the track's barriers
unless marked `over: true` (`{ kind: 'asphalt', over: true, pts }`), which draws them into
the run-off corridor too, for an infield car park or a link road between two parts of the
circuit (looks only: the run-off still drives as `surfaces` sets it).

An area with `noTrees: true` clears every tree inside it (mapped ones too); it may leave out
`kind` to only do that: `{ noTrees: true, pts }`.

Trees grow by land kind: woods fully, scrub 30%, grass 7%, towns 6%, meadows 4%, fields
almost none. `scenery.landTrees` overrides any kind, e.g. `{ scrub: 0.02 }` for open dunes.
`scenery.landColors` overrides the land's colours as seen from above (keys as in src/land.js
bakeColours: urban, meadow, meadow2, grass, grass2, scrub, scrubDark, canopy, canopy2,
sand, sand2, gravel, concrete, asphalt, asphalt2, water), e.g. `{ scrub: 0xb3a77e }`.
