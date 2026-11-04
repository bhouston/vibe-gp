// Sponsor decals: logos (src/logos.js) and wordmarks are drawn into one canvas atlas
// per body part at runtime and projected onto the bodywork in TSL (planar projection in
// the car body frame), so they wrap over the hand-built panels without UV layouts.
// One atlas per material keeps every part at a single texture binding however many
// sponsors it carries.
import * as THREE from 'three/webgpu';
import {
  mix, smoothstep, positionLocal, normalLocal, texture, vec2, abs, sign, float, pow, max,
} from 'three/tsl';
import { drawLogo } from './logos.js';

const FONTS = {
  sans: '800 {px}px "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  italic: 'italic 900 {px}px "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  wide: '900 {px}px "Arial Black", "Segoe UI", Arial, sans-serif',
  serif: '700 {px}px Georgia, "Times New Roman", serif',
};

const PX_PER_M = 4200; // atlas resolution on the car (~0.24 mm per texel)
const MAX_W = 4096;
const PAD = 24; // transparent gutter between atlas rows, so mip levels don't bleed

const hexCss = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

/** Draw a plain wordmark decal (no logo) fitted inside the box. */
function drawText(g, d, x, y, w, h, ink) {
  let px = h * 0.86;
  const set = () => {
    g.font = FONTS[d.font ?? 'sans'].replace('{px}', Math.round(px));
    if ('letterSpacing' in g) g.letterSpacing = `${(d.spacing ?? 0) * px}px`;
  };
  set();
  const width = () => g.measureText(d.text).width;
  if (width() > w * 0.96) {
    px *= (w * 0.96) / width();
    set();
  }
  g.fillStyle = ink ?? '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(d.text, x + w / 2, y + h / 2 + px * 0.04);
}

/**
 * Pack every decal of one part into a single canvas, one row each.
 * Returns the texture and each decal's row rectangle in uv space.
 */
function buildAtlas(decals) {
  const rows = decals.map((d) => {
    const [w, h] = d.size;
    const pw = Math.min(MAX_W, Math.max(128, Math.round(w * PX_PER_M)));
    return { pw, ph: Math.max(32, Math.round((pw * h) / w)) };
  });
  const W = Math.max(...rows.map((r) => r.pw)) + PAD * 2;
  const H = rows.reduce((s, r) => s + r.ph + PAD, PAD);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  let y = PAD;
  const rects = decals.map((d, i) => {
    const { pw, ph } = rows[i];
    const ink = d.color == null ? null : hexCss(d.color);
    g.save();
    g.beginPath();
    g.rect(PAD, y, pw, ph);
    g.clip();
    if (d.logo) drawLogo(g, d.logo, PAD, y, pw, ph, ink);
    else drawText(g, d, PAD, y, pw, ph, ink);
    g.restore();
    // uv rect: canvas textures upload with flipY, so v = 1 is the canvas top
    const rect = { u0: PAD / W, du: pw / W, v0: 1 - (y + ph) / H, dv: ph / H };
    y += ph + PAD;
    return rect;
  });
  const tex = new THREE.CanvasTexture(cv);
  // premultiplied + raw values: filtering then stays fringe-free at the logo edges,
  // and the shader does the sRGB decode on the un-premultiplied colour
  tex.premultiplyAlpha = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, rects };
}

/**
 * Layer decals over a colour node.
 * Each decal: { logo | text, at: [a, b], size: [w, h], color, facing, font, spacing }
 *   logo:  an id from src/logos.js; `color` null/undefined draws it in brand colours,
 *          a hex draws it single-colour in that ink
 *   text:  a plain wordmark in `font`, tinted `color`
 *   side:  projected along X onto both flanks, `at` = [z, y], reads front-to-back on each side
 *   rear:  projected along Z onto rear-facing surfaces, `at` = [x, y], reads left-to-right from behind
 *   top:   projected down Y onto upward surfaces, `at` = [x, z], reads from behind the car
 *          (top of the logo towards the nose)
 * Returns { node, textures } so the caller can dispose the textures.
 */
export function applyDecals(base, decals = []) {
  const p = positionLocal;
  const n = normalLocal;
  if (!decals.length) return { node: base, textures: [] };
  const { tex, rects } = buildAtlas(decals);
  let c = base;
  decals.forEach((d, i) => {
    const [w, h] = d.size;
    let u, v, facing;
    if (d.facing === 'rear') {
      // viewer behind the car looks along +Z: their right is the car's -X
      u = float(d.at[0]).sub(p.x).div(w).add(0.5);
      v = p.y.sub(d.at[1]).div(h).add(0.5);
      facing = smoothstep(-0.15, -0.35, n.z);
    } else if (d.facing === 'top') {
      u = float(d.at[0]).sub(p.x).div(w).add(0.5);
      v = p.z.sub(d.at[1]).div(h).add(0.5);
      facing = smoothstep(0.45, 0.7, n.y);
    } else {
      // on a left-facing (+X) surface the reader's right is towards the rear; mirrored on
      // right-facing ones. Going by the normal keeps inner faces of endplates readable too.
      u = float(d.at[0]).sub(p.z).mul(sign(n.x)).div(w).add(0.5);
      v = p.y.sub(d.at[1]).div(h).add(0.5);
      facing = smoothstep(0.3, 0.5, abs(n.x));
    }
    const inside = smoothstep(0.0, 0.002, u).mul(smoothstep(1.0, 0.998, u))
      .mul(smoothstep(0.0, 0.002, v)).mul(smoothstep(1.0, 0.998, v));
    const r = rects[i];
    const st = vec2(u.clamp(0, 1).mul(r.du).add(r.u0), v.clamp(0, 1).mul(r.dv).add(r.v0));
    const s = texture(tex, st);
    const a = s.a;
    // un-premultiply, then sRGB -> linear (close enough to the exact curve for paint)
    const rgb = pow(s.rgb.div(max(a, 1e-4)).clamp(0, 1), 2.2);
    c = mix(c, rgb, a.mul(inside).mul(facing));
  });
  return { node: c, textures: [tex] };
}
