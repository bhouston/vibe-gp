// Graphics quality.
//  - MOBILE: the light profile (no crowd, sparser trackside objects, no live mirrors, smaller
//    shadows and decal textures). Touch devices get it, and so does Settings > Graphics: Low.
//  - TOUCH: a touch device (fewer AI cars by default).
//  - AdaptiveResolution: with Graphics on Auto or Low, the render resolution drops a step at a
//    time while the frame rate is too low and comes back up once it is steady, so a weaker
//    GPU keeps the game smooth at a slightly softer picture.
// ?quality=mobile or ?quality=full overrides the profile, to compare the two on one device.
const forced = new URLSearchParams(location.search).get('quality');
let saved = null;
try {
  saved = JSON.parse(localStorage.getItem('vibegp.settings') || '{}').graphics ?? null;
} catch {
  /* storage unavailable: auto */
}
export const TOUCH = matchMedia('(pointer: coarse)').matches;
/** 'auto' | 'high' | 'low' (Settings > Graphics; read once, changing it reloads the game). */
export const GRAPHICS = forced === 'mobile' ? 'low' : forced === 'full' ? 'high' : ['auto', 'high', 'low'].includes(saved) ? saved : 'auto';
export const MOBILE = forced ? forced === 'mobile' : GRAPHICS === 'low' || (GRAPHICS === 'auto' && TOUCH);
/**
 * Anisotropic filtering for textures on the ground. From the driver's eye (~1 m up) the
 * ground ahead is seen at a grazing angle, where plain mipmapping blurs it to mush past a
 * few tens of metres. Both backends clamp this to what the GPU supports.
 */
export const ANISOTROPY = MOBILE ? 4 : 16;

const SLOW = 1 / 48; // s a frame: slower than this on average and the resolution steps down
const SMOOTH = 1 / 57; // faster than this for a few seconds and it steps back up
const STEP = 0.85;

/** Scales the renderer's pixel ratio between min and max to hold the frame rate. */
export class AdaptiveResolution {
  constructor(renderer, max, min = 0.5) {
    this.renderer = renderer;
    this.max = max;
    this.min = Math.min(min, max);
    this.ratio = max;
    this.avg = 1 / 60; // smoothed frame time
    this.clock = 0;
    this.hold = 0; // s before stepping back up after a drop (no see-sawing)
    this.good = 0; // smooth seconds in a row
    this.since = Infinity; // s since the last step up
    this.backoff = 0; // step-ups that had to be undone: wait longer before the next try
  }

  /** Once a frame with its real duration (0 while paused or in a menu: ignored). */
  update(dt) {
    if (!(dt > 0) || dt > 0.25) return; // paused, or a hitch (tab switch, track loading)
    this.avg += (dt - this.avg) * 0.05;
    this.hold = Math.max(0, this.hold - dt);
    this.since += dt;
    if ((this.clock += dt) < 1) return; // decide at most once a second
    this.clock = 0;
    if (this.avg > SLOW && this.ratio > this.min) {
      // a step up that didn't hold: try again later each time (15 s, 30, 60, 120)
      if (this.since < 8) this.backoff = Math.min(3, this.backoff + 1);
      this.set(this.ratio * STEP);
      this.hold = 15 * 2 ** this.backoff;
      this.good = 0;
      this.since = Infinity;
    } else if (this.avg < SMOOTH && this.ratio < this.max && this.hold === 0) {
      if (++this.good >= 4) {
        this.set(this.ratio / STEP);
        this.hold = 4;
        this.good = 0;
        this.since = 0;
      }
    } else this.good = 0;
  }

  set(r) {
    this.ratio = Math.min(this.max, Math.max(this.min, r));
    this.renderer.setPixelRatio(this.ratio);
  }
}
