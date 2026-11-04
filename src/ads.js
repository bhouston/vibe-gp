// Trackside advertising: one canvas atlas of made-up sponsor boards, and a TSL helper
// that tiles them along any surface whose uv.x runs in metres.
import * as THREE from 'three/webgpu';
import { float, vec2, floor, fract, hash, texture } from 'three/tsl';

// [text, background, text colour, font style]
const BOARDS = [
  ['VIBE GP', '#e10600', '#ffffff', 'italic 900'],
  ['APEX FUEL', '#101820', '#f2c200', 'italic 900'],
  ['TURBO COLA', '#c8102e', '#ffffff', '900'],
  ['GRIDLINE', '#ffffff', '#0b3d91', 'italic 800'],
  ['NORTHWIND AIR', '#0b3d91', '#ffffff', '800'],
  ['VELOCITA', '#1b1b1b', '#ffffff', 'italic 300'],
  ['KOMETA', '#0f5132', '#e8d9a8', '700'],
  ['PITBOX TYRES', '#f2c200', '#111111', '900'],
];
const PX_W = 1024, PX_H = 128; // one board, 8:1
export const AD_ASPECT = PX_W / PX_H;

let atlas = null;

/** The shared atlas texture: boards stacked vertically, top row = board 0. */
export function adAtlas() {
  if (atlas) return atlas;
  const K = BOARDS.length;
  const cv = document.createElement('canvas');
  cv.width = PX_W;
  cv.height = PX_H * K;
  const g = cv.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  BOARDS.forEach(([text, bg, fg, style], k) => {
    const y0 = k * PX_H;
    g.fillStyle = bg;
    g.fillRect(0, y0, PX_W, PX_H);
    let px = 84;
    const set = () => (g.font = `${style} ${px}px "Segoe UI", "Arial Black", Arial, sans-serif`);
    set();
    const w = g.measureText(text).width;
    if (w > PX_W * 0.8) {
      px *= (PX_W * 0.8) / w;
      set();
    }
    g.fillStyle = fg;
    g.fillText(text, PX_W / 2, y0 + PX_H / 2 + 4);
    // thin accent rule under the wordmark
    g.fillRect(PX_W * 0.25, y0 + PX_H - 14, PX_W * 0.5, 4);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  atlas = { texture: tex, count: K };
  return atlas;
}

/**
 * Colour of a run of boards. `along` = metres along the surface, `v` = 0..1 up the
 * board, `boardLen` = metres per board. Each board picks a sponsor from a hash of its
 * index (offset by `seed`), so neighbouring walls don't repeat in lock-step.
 */
export function adBoardColor(along, v, boardLen, seed = 0) {
  const { texture: tex, count } = adAtlas();
  const cell = along.div(boardLen);
  const idx = floor(hash(floor(cell).add(seed)).mul(count)).min(count - 1);
  // inset each row slightly so mip filtering doesn't bleed the neighbouring board in
  const vv = v.clamp(0.04, 0.96);
  const row = float(count - 1).sub(idx).add(vv).div(count); // flipY: board 0 is at the top
  return texture(tex, vec2(fract(cell), row)).rgb;
}
