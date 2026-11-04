// Sponsor decals: wordmarks are drawn into small canvas textures at runtime and
// projected onto the bodywork in TSL (planar projection in the car body frame),
// so they wrap over the hand-built panels without needing UV layouts.
import * as THREE from 'three/webgpu';
import {
  color, mix, smoothstep, positionLocal, normalLocal, texture, vec2, abs, sign, float,
} from 'three/tsl';

const FONTS = {
  sans: '800 {px}px "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  italic: 'italic 900 {px}px "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  wide: '900 {px}px "Arial Black", "Segoe UI", Arial, sans-serif',
  serif: '700 {px}px Georgia, "Times New Roman", serif',
};

/**
 * Canvas texture with `text` fitted inside a w:h box (white on transparent;
 * the colour is applied in the shader so one texture serves any tint).
 */
export function textTexture(text, aspect, font = 'sans', letterSpacing = 0) {
  const W = 1024;
  const H = Math.max(32, Math.round(W / aspect));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  let px = H * 0.86;
  const set = () => {
    g.font = FONTS[font].replace('{px}', Math.round(px));
    if ('letterSpacing' in g) g.letterSpacing = `${letterSpacing * px}px`;
  };
  set();
  const width = () => g.measureText(text).width;
  if (width() > W * 0.96) {
    px *= (W * 0.96) / width();
    set();
  }
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + px * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/**
 * Layer decals over a colour node.
 * Each decal: { text, at: [a, b], size: [w, h], color, facing: 'side' | 'rear', font }
 *   side: projected along X onto both flanks, `at` = [z, y], reads front-to-back on each side
 *   rear: projected along Z onto rear-facing surfaces, `at` = [x, y], reads left-to-right from behind
 * Returns { node, textures } so the caller can dispose the textures.
 */
export function applyDecals(base, decals = []) {
  const p = positionLocal;
  const n = normalLocal;
  const textures = [];
  let c = base;
  for (const d of decals) {
    const [w, h] = d.size;
    const tex = textTexture(d.text, w / h, d.font, d.spacing ?? 0);
    textures.push(tex);
    let u, v, facing;
    if (d.facing === 'rear') {
      // viewer behind the car looks along +Z: their right is the car's -X
      u = float(d.at[0]).sub(p.x).div(w).add(0.5);
      v = p.y.sub(d.at[1]).div(h).add(0.5);
      facing = smoothstep(-0.15, -0.35, n.z);
    } else {
      // on a left-facing (+X) surface the reader's right is towards the rear; mirrored on
      // right-facing ones. Going by the normal keeps inner faces of endplates readable too.
      u = float(d.at[0]).sub(p.z).mul(sign(n.x)).div(w).add(0.5);
      v = p.y.sub(d.at[1]).div(h).add(0.5);
      facing = smoothstep(0.3, 0.5, abs(n.x));
    }
    const inside = smoothstep(0.0, 0.002, u).mul(smoothstep(1.0, 0.998, u))
      .mul(smoothstep(0.0, 0.002, v)).mul(smoothstep(1.0, 0.998, v));
    // canvas textures are uploaded with flipY, so v=1 is the top of the text
    const a = texture(tex, vec2(u.clamp(0, 1), v.clamp(0, 1))).a;
    c = mix(c, color(d.color), a.mul(inside).mul(facing));
  }
  return { node: c, textures };
}
