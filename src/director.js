// Director mode: M turns the game's own view into a broadcast director's monitor wall.
//  - the main view follows one car (the camera views, C, ride on it; it drives itself
//    unless you take the wheel with G), named at the top,
//  - a column of small onboard monitors down the left, one per car in race order, from
//    the camera on its airbox (T-cam),
//  - the timing tower as the running order, on the right under the minimap,
//  - the highlights in the bottom right: the incident monitor's crashes, spins and
//    replays (src/incidents.js).
// Click a monitor, the highlight or a name in the tower to put that car in the main view.
//
// Each small monitor is a render target drawn on a quad hung on the main camera (see
// fitQuad in incidents.js), on the monitors' layer, so no monitor's camera sees another.
// Every one is a whole extra render of the scene, so they take turns: PER_FRAME a frame.
import * as THREE from 'three/webgpu';
import { texture, uv, vec2 } from 'three/tsl';
import { MONITOR_LAYER, fitQuad } from './incidents.js';
import { MOBILE } from './quality.js';

const TILES = 11;
const RES = [320, 180];
const PER_FRAME = MOBILE ? 1 : 2; // (the light profile: one)
const FAR = 600; // m: the small monitors see less far than the main view (fewer objects to draw)
const CAPTION_EVERY = 0.25; // s between caption updates
// T-cam on the airbox, in the car's body frame, and a point far ahead to look at
const TCAM = new THREE.Vector3(0, 1.22, -0.3);
const AHEAD = new THREE.Vector3(0, 0.6, 20);

export class Director {
  constructor(camera) {
    this.camera = camera;
    this.on = false;
    this.el = document.getElementById('director');
    this.label = document.getElementById('director-label');
    this.onPick = null; // (race entry) => void: a monitor was clicked
    this.tiles = [];
    for (let i = 0; i < TILES; i++) {
      const el = document.createElement('div');
      el.className = 'dv-tile';
      el.innerHTML = '<div class="dv-view"></div><div class="dv-caption"></div>';
      el.addEventListener('click', () => this.tiles[i].entry && this.onPick?.(this.tiles[i].entry));
      this.el.appendChild(el);
      const target = new THREE.RenderTarget(RES[0], RES[1], { type: THREE.HalfFloatType, samples: 4 });
      target.texture.colorSpace = THREE.LinearSRGBColorSpace; // as the mirrors (see car.js)
      const mat = new THREE.MeshBasicNodeMaterial({ fog: false, depthTest: false, depthWrite: false });
      const u = uv();
      mat.colorNode = texture(target.texture, vec2(u.x, u.y.oneMinus())).rgb;
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      quad.layers.set(MONITOR_LAYER);
      quad.renderOrder = 1000;
      quad.frustumCulled = false;
      quad.visible = false;
      camera.add(quad);
      this.tiles.push({
        el, view: el.querySelector('.dv-view'), caption: el.querySelector('.dv-caption'),
        target, quad, cam: new THREE.PerspectiveCamera(70, RES[0] / RES[1], 0.1, FAR),
        entry: null, drawn: false,
      });
    }
    this.turn = 0;
    this.captionAt = -1;
    this.rects = null;
    this._v = new THREE.Vector3();
    addEventListener('resize', () => (this.rects = null));
  }

  /** M: on / off. */
  toggle(on = !this.on) {
    this.on = on;
    this.el.hidden = !on;
    this.label.hidden = !on;
    // (not .director: that's the strip's own class)
    document.getElementById('hud').classList.toggle('director-on', on);
    this.rects = null;
    this.captionAt = -1;
    for (const t of this.tiles) {
      t.quad.visible = false;
      t.drawn = false;
    }
  }

  /**
   * Which car each monitor shows (race order), and now and then the captions. focus: the car
   * in the main view; view: its camera view's name.
   */
  update(race, time, focus, view = '') {
    if (!this.on) return;
    const order = race ? race.order : [];
    this.tiles.forEach((t, i) => {
      t.entry = order[i] ?? null;
      if (t.el.hidden !== !t.entry) {
        t.el.hidden = !t.entry;
        this.rects = null; // fewer cars: the strip reflows
      }
      const on = !!t.entry && t.entry === focus;
      if (t.on !== on) t.el.classList.toggle('on', (t.on = on));
    });
    if (time - this.captionAt < CAPTION_EVERY && this.captionAt >= 0) return;
    this.captionAt = time;
    for (const t of this.tiles) {
      const e = t.entry;
      if (!e) continue;
      const kmh = Math.round(Math.abs(e.physics.speed) * 3.6);
      const state = e.retired ? 'OUT' : e.finished ? 'FIN' : e.physics.onPitLane ? 'PIT' : `${kmh}`;
      t.caption.innerHTML = `<b>P${e.position}</b><span>${e.isPlayer ? 'YOU' : e.team.name}</span><em>${state}</em>`;
      t.el.style.setProperty('--team', e.team.ui.primary);
      t.el.classList.toggle('out', e.retired);
    }
    if (focus) {
      const kmh = Math.round(Math.abs(focus.physics.speed) * 3.6);
      const state = focus.retired ? 'OUT' : focus.physics.onPitLane ? 'IN THE PITS' : `${kmh} km/h`;
      this.label.innerHTML = `<b>P${focus.position}</b><span>${focus.isPlayer ? 'YOUR CAR' : focus.team.name.toUpperCase()}</span><span>${state}</span><small>${view.toUpperCase()} · C: VIEWS · CLICK A MONITOR TO SWITCH</small>`;
      this.label.style.setProperty('--team', focus.team.ui.primary);
    }
  }

  /** Redraw this frame's share of the monitors (before the main render) and line the quads up. */
  render(renderer, scene, carOf) {
    if (!this.on) return;
    const live = this.tiles.filter((t) => t.entry && !t.entry.retired);
    const prev = renderer.getRenderTarget();
    for (let k = 0; k < Math.min(PER_FRAME, live.length); k++) {
      const t = live[(this.turn + k) % live.length];
      const body = carOf(t.entry).body;
      body.updateWorldMatrix(true, false);
      t.cam.position.copy(body.localToWorld(this._v.copy(TCAM)));
      t.cam.lookAt(body.localToWorld(this._v.copy(AHEAD)));
      renderer.setRenderTarget(t.target);
      renderer.render(scene, t.cam);
      t.drawn = true;
    }
    this.turn = (this.turn + PER_FRAME) % Math.max(1, live.length);
    renderer.setRenderTarget(prev);
    if (!this.rects) this.rects = this.tiles.map((t) => t.view.getBoundingClientRect());
    this.tiles.forEach((t, i) => {
      // a retired car's last picture stays up, dimmed by its frame
      t.quad.visible = !!t.entry && t.drawn;
      if (t.quad.visible) fitQuad(t.quad, this.rects[i], this.camera);
    });
  }

  /** Every car's position while it's on (for the AI cars' level of detail: every car is a camera). */
  get viewpoints() {
    return this.on ? this.tiles.filter((t) => t.entry).map((t) => t.entry.physics.position) : null;
  }
}
