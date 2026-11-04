# Vibe GP

A small F1-style racing game built with [three.js](https://threejs.org/) using `WebGPURenderer` and node-based (TSL) materials. All track and car geometry is built by hand in code, and all surface detail is procedural (no textures or models).

## Running

```sh
pnpm install
pnpm dev
```

Then open http://localhost:5173 and pick a circuit: the Test Oval, Spa-Francorchamps, Silverstone or Circuit Gilles Villeneuve. A browser with WebGPU support is recommended; three.js falls back to WebGL2 otherwise.

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Throttle |
| S / ↓ | Brake / reverse |
| A D / ← → | Steer |
| T | Toggle traction, stability & steering assists |
| B | Toggle brake assist (anti-lock) |
| C | Cycle camera (chase, far, T-cam, driver, TV); the side mirrors work in every view |
| R | Reset to the grid |
| Esc | Back to the track selector |

## Project layout

- `src/geometry.js`: hand-built geometry helpers (rings, walls, boxes, lofts, tubes, wheels)
- `src/materials.js`: TSL node materials and the sky
- `src/tracks/*.js`: track definitions (centreline control points in metres, start line first, in racing direction)
- `src/trackPath.js`: centreline sampling, kerbs, wall clearance and nearest-point queries
- `src/track.js`: builds the road, kerbs, walls, gantry and grid for any track definition
- `src/car.js`: the car model (current-era F1 shape: multi-element wings, downwash sidepods, sculpted floor, working mirrors)
- `src/carGeometry.js`: car-specific geometry builders (ring lofts, airfoils, extruded plates, slick tyres)
- `src/teams.js`: the Red Bull, Ferrari and McLaren liveries (procedural TSL paint), race numbers and sponsor lists
- `src/decals.js`: sponsor wordmarks drawn to canvas textures and projected onto the bodywork
- `src/physics.js`: four-wheel vehicle model (aero, load transfer, wheel spin, assists) and tuning parameters
- `src/tyres.js`: tyre model and surface table (asphalt, kerb, grass)
- `src/camera.js`, `src/race.js`, `src/hud.js`, `src/input.js`: cameras, lap timing, HUD, keyboard input

## Adding a track

Create `src/tracks/<id>.js` (see `oval.js` for the format), register it in `src/tracks/index.js`, then check it:

```sh
node scripts/track-check.mjs <id>
```

This prints the lap length, the tightest corner, any sections that are too close together, and an autopilot lap time. It also writes an SVG map to `track-check/<id>.svg`.

A track can have a pit lane: add `pitlane: { points: [...] }` with the lane's centreline in the same map coordinates, in the driving direction, from where it leaves the track to where it rejoins. The real circuits use the pit lane ways from OpenStreetMap, registered onto the track's centreline. The game builds the pit wall, merges, outer wall, garages and the 80 km/h speed-limit zone from that line. `track-check` then drives a lap through the lane and reports the drive-through time loss, and also writes `track-check/<id>-pit.svg`.

## Driving physics

Grip comes from a tyre model rather than fixed grip numbers, so each of the four tyres can be on a different surface.

- **Tyre forces**: a Pacejka "Magic Formula" curve on combined slip (slip angle and slip ratio share one friction ellipse). Slicks peak at about 5° slip angle and 10% slip ratio, then fall away into a slide.
- **Balance**: the rear tyres are wider (405 mm vs 305 mm), so they get 10% more grip, which keeps the rear stable.
- **Load sensitivity**: peak force grows with vertical load to the power 0.85, so the friction coefficient drops as downforce and load transfer pile on. Weight shifting onto the outside tyres costs total grip.
- **Aero and load transfer**: downforce and drag grow with v² (ClA 4.6, CdA 1.27). Each wheel's load includes weight, downforce split by aero balance, and longitudinal and lateral load transfer.
- **Wheel spin**: each wheel's spin is integrated against drive, brake and tyre torque, so wheelspin and lock-ups happen on their own. Traction control and brake assist cap torque at what the tyres can take (keyboard input is on/off, so both default on). Steering assist, also on that key, aims the front tyres at their peak-grip slip angle relative to where the front axle is travelling, so full lock on the keyboard always gives the tightest turn the tyres allow without scrubbing. Stability control, on the same key as traction control, countersteers toward the direction of travel and trims the throttle once the car slides more than about 4°, so quick corrections and rejoining from the grass don't spin the car.
- **Tyre temperature**: tread temperature rises with sliding and carcass flex and falls with airflow. Grip peaks at 105 °C with about 1% loss at 100 °C and 115 °C (Pirelli's stated window). Tyres start at the 70 °C blanket temperature. The HUD shows each tyre's temperature, outlined white when sliding, red on a kerb and green on grass.

| Surface | μ | Other effects |
| --- | --- | --- |
| Asphalt | 1.8 | none |
| Kerb | 1.6 (non-slip paint) | ridges make the tyre load fluctuate; the floor loses ~20% downforce per wheel on the kerb |
| Grass | 0.55 | flat slip curve (sliding is about as good as gripping), extra rolling resistance, ~20% downforce loss, picks up dirt that costs up to 8% grip until it scrubs off on asphalt |

Checked against F1 figures: about 1.8 g mechanical grip in slow corners, about 4.2 g at 280 km/h, 0–100 km/h in 2.5 s on warm tyres, 300–0 km/h in about 130 m, and a 330 km/h top speed. On grass, cornering grip falls to roughly a quarter of the asphalt figure.

