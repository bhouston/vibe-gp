// Incident monitor: in free cam, a small picture-in-picture window pops up in the corner
// (and in director mode, src/director.js, as its highlights)
// whenever a car crashes, spins or goes off, with a camera of its own hovering near that
// car, so you can watch it while flying somewhere else. Once the car has sorted itself out
// the window rewinds and replays the incident in slow motion, from a couple of seconds
// before it went wrong. A retirement replays the crash that caused it, and B replays the
// last incident again. Click the window to watch that car.
//
// Rewind: every car's pose (body on the road, pitch / roll, steering) is recorded at
// 30 Hz for the last BUFFER seconds. A replay puts every car back where it was at that
// moment just for the monitor's render, then back where it is now for the main view.
//
// The window is a render target drawn on a quad stuck to the main camera, lined up with an
// HTML frame (#monitor) that holds the border and caption. The quad sits on its own layer,
// which only the main camera draws, so the monitor's camera never sees itself.
import * as THREE from 'three/webgpu';
import { texture, uv, vec2 } from 'three/tsl';

export const MONITOR_LAYER = 2;
const RES = [480, 270];
const SHOW = 5; // s of live view before the replay (longer while the car is still in trouble)
const MAX_LIVE = 10;
const BEFORE = 2.5; // s of lead-up the replay starts with
const REPLAY_LEN = 9; // s of race time a replay covers at most
const SLOW = 0.6; // replay speed
const REPLACE_AFTER = 3.5; // s before a new incident of the same weight can take over
const COOLDOWN = 8; // s before the same car is picked again for the same thing
const BUFFER = 60; // s of recorded poses (about 0.9 MB for a full grid)
const HZ = 30;
// what happened, and how much it beats something else on screen
const KINDS = {
  retire: { label: 'RETIRED', weight: 4 },
  crash: { label: 'CRASH', weight: 3 },
  contact: { label: 'CONTACT', weight: 3 },
  spin: { label: 'SPIN', weight: 2 },
  off: { label: 'OFF', weight: 1 },
};
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * Put a unit quad that hangs on `camera` (one unit in front of it) exactly over the screen
 * rectangle r (a DOMRect), so a picture drawn on it lines up with an HTML frame.
 */
export function fitQuad(quad, r, camera) {
  const W = innerWidth, H = innerHeight;
  const h = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), w = h * camera.aspect;
  const cx = ((r.left + r.width / 2) / W) * 2 - 1, cy = 1 - ((r.top + r.height / 2) / H) * 2;
  quad.position.set(cx * w, cy * h, -1);
  quad.scale.set((r.width / W) * 2 * w, (r.height / H) * 2 * h, 1);
}

/**
 * The last BUFFER seconds of every car's pose. Per sample and car: group position (3) and
 * quaternion (4), body pitch, roll and heave (3), front wheel steer (1).
 */
const F = 11;
const SCRATCH_Q = new THREE.Quaternion();
class PoseRecorder {
  constructor() {
    this.n = BUFFER * HZ;
    this.times = new Float64Array(this.n);
    this.cars = new Map(); // Car -> Float32Array(n * F)
    this.reset();
  }

  reset() {
    this.head = 0;
    this.count = 0;
    this.last = -Infinity;
    this.cars.clear();
  }

  /** Record the cars' poses (field: race entries, carOf: entry -> Car), at most HZ times a second. */
  record(time, field, carOf) {
    if (time - this.last < 1 / HZ - 1e-6) return;
    this.last = time;
    const i = this.head, o = i * F;
    this.times[i] = time;
    for (const e of field) {
      const c = carOf(e);
      let b = this.cars.get(c);
      if (!b) this.cars.set(c, (b = new Float32Array(this.n * F).fill(NaN)));
      const g = c.group, q = g.quaternion;
      b[o] = g.position.x; b[o + 1] = g.position.y; b[o + 2] = g.position.z;
      b[o + 3] = q.x; b[o + 4] = q.y; b[o + 5] = q.z; b[o + 6] = q.w;
      b[o + 7] = c.body.rotation.x; b[o + 8] = c.body.rotation.z; b[o + 9] = c.body.position.y;
      b[o + 10] = c.wheels[0].steer.rotation.y;
    }
    this.head = (i + 1) % this.n;
    this.count = Math.min(this.count + 1, this.n);
  }

  /** Oldest recorded time (or Infinity with nothing yet). */
  get oldest() {
    return this.count ? this.times[(this.head - this.count + this.n) % this.n] : Infinity;
  }

  /** Two samples around `time` and the blend between them: [i, j, t], or null. */
  find(time) {
    if (!this.count) return null;
    const newest = (this.head - 1 + this.n) % this.n;
    // samples are about 1/HZ apart: start from the estimate and walk to the right pair
    let back = Math.round((this.times[newest] - time) * HZ);
    back = Math.max(0, Math.min(this.count - 1, back));
    let j = (newest - back + this.n) % this.n;
    while (back > 0 && this.times[j] < time) { back--; j = (j + 1) % this.n; }
    while (back < this.count - 1 && this.times[j] > time) { back++; j = (j - 1 + this.n) % this.n; }
    const k = back > 0 ? (j + 1) % this.n : j;
    const t0 = this.times[j], t1 = this.times[k];
    return [j, k, t1 > t0 ? Math.min(1, Math.max(0, (time - t0) / (t1 - t0))) : 0];
  }

  /** Where car c was at `found` (from find): { pos, quat, pitch, roll, heave, steer } or null. */
  pose(c, found, out) {
    const b = this.cars.get(c);
    if (!b || !found) return null;
    const [i, j, t] = found;
    const a = i * F, z = j * F;
    if (Number.isNaN(b[a]) || Number.isNaN(b[z])) return null; // not recorded then (a new car)
    const l = (k) => b[a + k] + (b[z + k] - b[a + k]) * t;
    out.pos.set(l(0), l(1), l(2));
    out.quat.set(b[a + 3], b[a + 4], b[a + 5], b[a + 6]).slerp(SCRATCH_Q.set(b[z + 3], b[z + 4], b[z + 5], b[z + 6]), t);
    out.pitch = l(7);
    out.roll = l(8);
    out.heave = l(9);
    out.steer = l(10);
    return out;
  }
}

export class IncidentMonitor {
  /** carOf(entry) gives the Car (visual) of a race entry. */
  constructor(camera, carOf) {
    this.camera = camera;
    this.carOf = carOf;
    this.cam = new THREE.PerspectiveCamera(48, RES[0] / RES[1], 0.1, 2500);
    this.target = new THREE.RenderTarget(RES[0], RES[1], { type: THREE.HalfFloatType, samples: 4 });
    // the main frame buffer's (linear) colour space: see the mirrors in car.js for why
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const mat = new THREE.MeshBasicNodeMaterial({ fog: false, depthTest: false, depthWrite: false });
    const u = uv();
    mat.colorNode = texture(this.target.texture, vec2(u.x, u.y.oneMinus())).rgb; // render targets are stored top row first
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.quad.layers.set(MONITOR_LAYER);
    this.quad.renderOrder = 1000;
    this.quad.frustumCulled = false;
    this.quad.visible = false;
    camera.add(this.quad);
    camera.layers.enable(MONITOR_LAYER);

    this.el = document.getElementById('monitor');
    this.caption = this.el.querySelector('.monitor-caption');
    this.view = this.el.querySelector('.monitor-view');
    this.onPick = null; // (race entry) => void: the monitor was clicked
    this.el.addEventListener('click', () => this.shown && this.onPick?.(this.shown.entry));

    this.rec = new PoseRecorder();
    this.shown = null; // { entry, kind, at, age, calm, off, replay: { from, to, t } | null }
    this.lastIncident = null; // the most recent one shown, for B
    this.lastBad = new Map(); // entry -> { at, off }: its latest crash / spin (a retirement replays it)
    this.last = new Map(); // entry -> { kind: time } it was last picked for that
    this.time = 0; // race clock (stops while paused)
    this.inGame = false; // free cam or director mode: show it (it keeps watching for incidents either way)
    this.lookAt = new THREE.Vector3();
    this._a = new THREE.Vector3(); // scratch
    this._pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this._saved = [];
  }

  /** A new race or track: forget everything recorded. */
  reset() {
    this.rec.reset();
    this.hide();
    this.lastIncident = null;
    this.lastBad.clear();
    this.last.clear();
  }

  /**
   * Record the poses, look for incidents and move the monitor's camera. field: the race
   * entries; dt: 0 while paused; on: free cam is on (otherwise the monitor is hidden);
   * skip: the physics state whose impacts the sound reads (the sound resets it).
   */
  update(field, dt, on, skip = null) {
    if (!field?.length) return this.hide();
    this.time += dt;
    if (dt > 0) this.rec.record(this.time, field, this.carOf);
    for (const e of field) {
      const kind = this.detect(e, skip);
      if (!kind) continue;
      const bad = { at: this.time, off: this.offsetFor(e.physics) };
      if (kind !== 'off') this.lastBad.set(e, bad);
      if (!on) continue;
      const seen = this.last.get(e) ?? {};
      if (this.time - (seen[kind] ?? -Infinity) < COOLDOWN) continue;
      const cur = this.shown;
      const w = KINDS[kind].weight, cw = cur ? KINDS[cur.kind].weight : 0;
      const take = !cur || (cur.entry === e ? w > cw && !cur.replay : w > cw || (cur.age > REPLACE_AFTER && !cur.replay));
      if (!take) continue;
      seen[kind] = this.time;
      this.last.set(e, seen);
      this.show(e, kind, bad.at, cur?.entry === e && !cur.replay ? cur.off : bad.off);
    }
    if (!on) return this.hide();
    const s = this.shown;
    if (!s) return;
    s.age += dt;
    if (s.replay) {
      const r = s.replay;
      r.t += dt * SLOW;
      if (r.t > r.to) this.hide();
      return;
    }
    // live: stay with it while the car is still in trouble, then rewind and replay it
    const p = s.entry.physics;
    const trouble = this.slip(p) > 0.5 || p.wallHit > 0.05 || Math.abs(p.yawRate) > 1.5;
    s.calm = trouble ? 0 : s.calm + dt;
    if ((s.age > SHOW && s.calm > 1.5) || s.age > MAX_LIVE || s.entry.retired) this.startReplay(s, Math.min(this.time, s.at + REPLAY_LEN - BEFORE));
    else this.aim(p.position.x, p.height ?? 0, p.position.z, s, dt);
  }

  /** The monitor's camera: at a fixed bearing and height from (x, y, z), easing after it. */
  aim(x, y, z, s, dt) {
    const first = s.age <= dt + 1e-9 || s.snap;
    s.snap = false;
    const k = first ? 1 : 1 - Math.exp(-3 * dt);
    this.cam.position.lerp(this._a.set(x + s.off.x, y + s.off.y, z + s.off.z), k);
    this.lookAt.lerp(this._a.set(x, y + 0.6, z), first ? 1 : 1 - Math.exp(-8 * dt));
    this.cam.lookAt(this.lookAt);
  }

  /**
   * Ahead of the car and a little to the side it's on, high enough to see over the catch
   * fences, so it comes towards the camera.
   */
  offsetFor(p) {
    const side = Math.sign(p.lateral || 1);
    const f = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) }, l = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    return new THREE.Vector3(f.x * 15 + l.x * side * 6, 9, f.z * 15 + l.z * side * 6);
  }

  /** How far the car is sliding: angle between where it points and where it's going (rad). */
  slip(p) {
    const v = Math.hypot(p.vel.x, p.vel.z);
    return v < 8 ? 0 : Math.abs(angleDiff(Math.atan2(p.vel.x, p.vel.z), p.yaw));
  }

  /** What, if anything, is going wrong for entry e right now. */
  detect(e, skip) {
    if (e.retired || e.finished) return null;
    const p = e.physics;
    if (p.onPitLane) return null;
    let hit = 0;
    if (p !== skip) {
      hit = p.impact; // car-to-car (and wall) hits since last time
      p.impact = 0;
    }
    if (p.wallHit > 0.35) return 'crash';
    if (hit > 6) return 'contact';
    const v = Math.abs(p.speed);
    if ((v > 10 && this.slip(p) > 0.7) || (v > 8 && Math.abs(p.yawRate) > 2.6)) return 'spin';
    if (p.surface === 'gravel' && v > 20) return 'off';
    return null;
  }

  show(entry, kind, at, off) {
    const fresh = this.shown?.entry !== entry;
    this.shown = { entry, kind, at: fresh ? at : this.shown.at, age: fresh ? 0 : this.shown.age, calm: 0, off, replay: null, snap: fresh };
    this.lastIncident = { entry, kind, at: this.shown.at, off };
    this.label();
    this.el.style.setProperty('--team', entry.team.ui.primary);
    this.el.hidden = !this.inGame;
    this.quad.visible = this.inGame;
  }

  label() {
    const s = this.shown;
    const who = s.entry.isPlayer ? 'YOUR CAR' : s.entry.team.name.toUpperCase();
    const tag = s.replay ? '<i class="replay">⟲ REPLAY</i>' : '<i class="live">● LIVE</i>';
    this.caption.innerHTML = `${tag}<b>${KINDS[s.kind].label}</b> · ${who}<small>CLICK TO WATCH</small>`;
    this.el.classList.toggle('replaying', !!s.replay);
  }

  /** Rewind: replay the shown incident up to race time `to`. */
  startReplay(s, to) {
    const from = Math.max(this.rec.oldest, s.at - BEFORE);
    if (!(to > from + 0.5)) return this.hide();
    s.replay = { from, to, t: from };
    s.snap = true;
    this.label();
  }

  /** A car retired (in free cam): replay what put it out, or its last few seconds. */
  retired(entry, on) {
    if (!on) return;
    const bad = this.lastBad.get(entry);
    const recent = bad && this.time - bad.at < BUFFER - BEFORE;
    const at = recent ? bad.at : this.time - (REPLAY_LEN - BEFORE);
    this.show(entry, 'retire', at, recent ? bad.off : this.offsetFor(entry.physics));
    this.startReplay(this.shown, Math.min(this.time, at + REPLAY_LEN - BEFORE));
  }

  /** B: replay the most recent incident again. Returns false with nothing to replay. */
  replayLast(on) {
    const l = this.lastIncident;
    if (!on || !l || this.time - l.at > BUFFER - BEFORE) return false;
    this.show(l.entry, l.kind, l.at, l.off);
    this.startReplay(this.shown, Math.min(this.time, l.at + REPLAY_LEN - BEFORE));
    return !!this.shown;
  }

  hide() {
    if (!this.shown && this.el.hidden) return;
    this.shown = null;
    this.el.hidden = true;
    this.quad.visible = false;
  }

  /** The monitor's camera when it shows the live race (for the AI cars' level of detail), else null. */
  get liveCam() {
    return this.shown && !this.shown.replay ? this.cam : null;
  }

  /**
   * Draw the monitor's picture (before the main render) and line the quad up with its
   * frame. cars: every Car in the race. In a replay they're put back where they were for
   * this render, at full detail, and returned afterwards.
   */
  render(renderer, scene, cars, dt) {
    const s = this.shown;
    this.el.hidden = !(s && this.inGame);
    this.quad.visible = !!s && this.inGame;
    if (!s || !this.inGame) return;
    const saved = this._saved;
    saved.length = 0;
    if (s.replay) {
      const found = this.rec.find(s.replay.t);
      for (const c of cars) {
        const p = this.rec.pose(c, found, this._pose);
        const g = c.group, b = c.body;
        saved.push([c, g.position.clone(), g.quaternion.clone(), b.rotation.x, b.rotation.z, b.position.y, c.wheels[0].steer.rotation.y, c.wheels[1].steer.rotation.y, g.visible, c.lodLevel]);
        if (!p) {
          g.visible = false; // not in the race back then
          continue;
        }
        g.position.copy(p.pos);
        g.quaternion.copy(p.quat);
        b.rotation.x = p.pitch;
        b.rotation.z = p.roll;
        b.position.y = p.heave;
        c.wheels[0].steer.rotation.y = c.wheels[1].steer.rotation.y = p.steer;
        if (c.lodLevel !== undefined) c.setLod(0);
        if (c === this.carOf(s.entry)) this.aim(p.pos.x, p.pos.y, p.pos.z, s, dt * SLOW);
      }
    }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(prev);
    for (const [c, pos, quat, pitch, roll, heave, s0, s1, vis, lod] of saved) {
      c.group.position.copy(pos);
      c.group.quaternion.copy(quat);
      c.body.rotation.x = pitch;
      c.body.rotation.z = roll;
      c.body.position.y = heave;
      c.wheels[0].steer.rotation.y = s0;
      c.wheels[1].steer.rotation.y = s1;
      c.group.visible = vis;
      if (lod !== undefined) {
        c.lodLevel = -1; // force setLod to apply
        c.setLod([30, 100, 600, 5000][lod]);
      }
    }
    // the quad, one unit in front of the main camera, covering the frame's picture area
    fitQuad(this.quad, this.view.getBoundingClientRect(), this.camera);
  }

  dispose() {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
