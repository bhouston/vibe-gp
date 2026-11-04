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
| C | Cycle camera (chase, far, T-cam, driver, TV); the side mirrors work in every view |
| R | Reset to the grid |
| Esc | Back to the track selector |

## Project layout

- `src/geometry.js`: hand-built geometry helpers (rings, walls, boxes, lofts, tubes, wheels)
- `src/materials.js`: TSL node materials and the sky
- `src/tracks/*.js`: track definitions (centreline control points in metres, start line first, in racing direction)
- `src/trackPath.js`: centreline sampling, kerbs, wall clearance and nearest-point queries
- `src/track.js`: builds the road, kerbs, walls, gantry and grid for any track definition
- `src/barriers.js`: concrete walls with sponsor boards, tyre barriers (conveyor-belt facing) on the outside of corners, and leaning catch fences
- `src/grandstands.js`: picks grandstand sites (opposite the pits and around the tightest corners, clear of the circuit) and builds stepped, roofed stands with an instanced, animated crowd
- `src/ads.js`: the canvas atlas of made-up trackside sponsor boards
- `src/car.js`: the car model (current-era F1 shape: multi-element wings, downwash sidepods, sculpted floor, working mirrors)
- `src/carGeometry.js`: car-specific geometry builders (ring lofts, airfoils, extruded plates, slick tyres)
- `src/teams.js`: the full 2026 grid (11 teams, ordered by the 2025 constructors' standings, which is also the garage order): liveries in procedural TSL paint, race numbers and sponsor layouts
- `src/logos.js`: hand-drawn vector stand-ins for the team and sponsor logos (brand colours or single-colour ink)
- `src/decals.js`: packs each body part's logos into one canvas atlas and projects them onto the bodywork (side, rear and top-down)
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

Each team has its own garage and pit box, in `TEAMS` order from the pit entry (`teamGarage` in `src/teams.js`); spare garages have their shutters down. The box is painted on the working lane in team colours with a stop line for the front axle (`src/pitBoxes.js`). Pull into your team's box and stop on the marks: the crew holds the car and fits fresh tyres, and the stop takes longer the further you are off the marks (`src/pitStop.js`). The HUD counts down the distance to your box, and the minimap marks it. `track-check` also drives into every team's box, stops there and drives out.

## Driving physics

Grip comes from a tyre model rather than fixed grip numbers, so each of the four tyres can be on a different surface.

- **Tyre forces**: a Pacejka "Magic Formula" curve on combined slip (slip angle and slip ratio share one friction ellipse). Slicks peak at about 5° slip angle and 10% slip ratio, then fall away into a slide.
- **Balance**: the rear tyres are wider (405 mm vs 305 mm), so they get 5% more grip, which keeps the rear stable.
- **Load sensitivity**: peak force grows with vertical load to the power 0.85, so the friction coefficient drops as downforce and load transfer pile on. Weight shifting onto the outside tyres costs total grip.
- **Aero and load transfer**: downforce and drag grow with v² (ClA 7.5, about 3.8× the car's weight at 300 km/h; that's more than a real F1 car, chosen for grip; CdA 1.27). Each wheel's load includes weight, downforce split by aero balance, and longitudinal and lateral load transfer.
- **Wheel spin**: each wheel's spin is integrated against drive, brake and tyre torque, so wheelspin happens on its own. Traction control caps drive torque at what the rear tyres can take (on by default, since keyboard input is on/off). The brakes are always anti-lock: brake pressure is capped at each tyre's grip, a wheel can never slow past peak-grip slip, and while you steer about 30% of the front tyres' grip is held back for turning, so the car turns under braking. Steering assist, on the T key, aims the front tyres at their peak-grip slip angle relative to where the front axle is travelling, so full lock on the keyboard always gives the tightest turn the tyres allow without scrubbing. Stability control, on the same key as traction control, countersteers toward the direction of travel and trims the throttle once the car slides more than about 4°, so quick corrections and rejoining from the grass don't spin the car.
- **Tyre temperature**: tread temperature rises with sliding and carcass flex and falls with airflow. Grip peaks at 105 °C with about 1% loss at 100 °C and 115 °C (Pirelli's stated window). Tyres start at the 70 °C blanket temperature. The HUD shows each tyre's temperature, outlined white when sliding, red on a kerb and green on grass.

| Surface | μ | Other effects |
| --- | --- | --- |
| Asphalt | 1.8 | none |
| Kerb | 1.6 (non-slip paint) | ridges make the tyre load fluctuate; the floor loses ~20% downforce per wheel on the kerb |
| Grass | 0.55 | flat slip curve (sliding is about as good as gripping), extra rolling resistance, ~20% downforce loss, picks up dirt that costs up to 8% grip until it scrubs off on asphalt |

Measured in the model: about 2 g in slow corners, about 4.5 g at 230 km/h, 0–100 km/h in 2.5 s, 300–0 km/h in 85 m (peak deceleration about 7 g), and a 324 km/h top speed. Grip and braking are tuned above real F1 figures (about 5 g peak cornering, 300–0 km/h in about 4 s) to make the car more responsive.

