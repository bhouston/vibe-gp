# Vibe GP

A small F1-style racing game built with [three.js](https://threejs.org/) using `WebGPURenderer` and node-based (TSL) materials. All track and car geometry is built by hand in code, and all surface detail is procedural (no textures or models).

## Running

```sh
pnpm install
pnpm dev
```

Then open http://localhost:5173. A browser with WebGPU support is recommended; three.js falls back to WebGL2 otherwise.

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Throttle |
| S / ↓ | Brake / reverse |
| A D / ← → | Steer |
| Space | Handbrake |
| C | Cycle camera (chase, far, onboard, TV) |
| R | Reset to the grid |

## Project layout

- `src/geometry.js`: hand-built geometry helpers (rings, walls, boxes, lofts, tubes, wheels)
- `src/materials.js`: TSL node materials and the sky
- `src/track.js`: the circular circuit
- `src/car.js`: the car model
- `src/physics.js`: driving model and tuning parameters
- `src/camera.js`, `src/race.js`, `src/hud.js`, `src/input.js`: cameras, lap timing, HUD, keyboard input
