// The player's steering wheel, seen from the driver view: a carbon wheel with rubber
// grips, coloured buttons and rotaries, a row of shift lights and a dash display
// (speed, gear, position, lap, tyres and assists), turning with the front wheels.
// Body frame (+Z forward, +Y up, +X left), facing the driver. Built for the player's
// car only; the display is only redrawn while the driver view is on.
import * as THREE from 'three/webgpu';
import { float, texture } from 'three/tsl';
import { tubeGeometry } from './geometry.js';
import { plateGeometry } from './carGeometry.js';
import { simpleMaterial } from './materials.js';

// centre of the wheel, and how far it leans back towards the driver's eyes
const AT = [0, 0.728, 0.36];
const LEAN = 0.32; // rad
const RATIO = 4; // steering wheel turns per front wheel turn (full lock ~125 degrees)
const THICK = 0.026;
const FACE = -THICK / 2; // the face towards the driver is at -Z
// the dash panel (shift lights + screen) in wheel coordinates (x, y), metres
const PANEL = { w: 0.136, h: 0.074, y: 0.014 };
const CANVAS = [512, 280];
const REDRAW = 1 / 20; // s between display updates

// buttons around the panel: [x, y, colour]; mirrored left / right where it reads like a wheel
const BUTTONS = [
  [0.088, 0.058, 0x2bb24c], [0.108, 0.032, 0x2f6fe0], [0.106, 0.004, 0xf2c200], [0.1, -0.024, 0xffffff],
  [-0.088, 0.058, 0xff7a00], [-0.108, 0.032, 0xd8202a], [-0.106, 0.004, 0x1fb5c4], [-0.1, -0.024, 0xffffff],
  [-0.012, -0.05, 0x2bb24c], [0.012, -0.05, 0xd8202a],
];
// rotaries below the panel: [x, y, tick colour]
const ROTARIES = [[0.072, -0.045, 0xf2c200], [0.04, -0.04, 0x2f6fe0], [-0.04, -0.04, 0xff7a00], [-0.072, -0.045, 0x2bb24c]];

export class SteeringWheel {
  constructor(carbon) {
    this.group = new THREE.Group(); // tilted towards the driver
    this.group.position.set(...AT);
    this.group.rotation.x = LEAN; // top forward, face tipped up towards the eyes
    this.spin = new THREE.Group(); // turns with the steering
    this.group.add(this.spin);
    this.materials = [];
    this.geometries = [];
    const mat = (m) => (this.materials.push(m), m);
    const mesh = (geo, m, pos, rot) => {
      this.geometries.push(geo);
      const o = new THREE.Mesh(geo, m);
      if (pos) o.position.set(...pos);
      if (rot) o.rotation.set(...rot);
      this.spin.add(o);
      return o;
    };

    // carbon body: wide at the top, grips down the sides, cut away at the bottom
    const outline = [
      [-0.1, 0.075], [0.1, 0.075], [0.132, 0.062], [0.152, 0.025], [0.15, -0.05], [0.132, -0.084], [0.102, -0.09],
      [0.084, -0.07], [0.05, -0.064], [-0.05, -0.064], [-0.084, -0.07], [-0.102, -0.09], [-0.132, -0.084],
      [-0.15, -0.05], [-0.152, 0.025], [-0.132, 0.062],
    ];
    // plateGeometry lays the outline flat (x, z); stand it up so the outline's second axis is y
    mesh(plateGeometry(outline, THICK, 'y', 0), carbon, null, [-Math.PI / 2, 0, 0]);
    // rubber grips
    const rubber = mat(simpleMaterial(0x161616, 0.9));
    for (const s of [1, -1]) {
      mesh(tubeGeometry([[s * 0.142, 0.05, 0.004], [s * 0.147, 0.0, 0.004], [s * 0.144, -0.07, 0.004]], 0.019, 10), rubber);
    }
    // a short column into the dash
    mesh(tubeGeometry([[0, -0.02, 0.01], [0, -0.03, 0.12]], 0.022, 10), carbon);

    // buttons and rotaries
    const button = new THREE.CylinderGeometry(0.0085, 0.0085, 0.008, 16);
    const knob = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 20);
    const tick = new THREE.BoxGeometry(0.003, 0.009, 0.002);
    this.geometries.push(button, knob, tick);
    const colours = new Map();
    const colourMat = (hex) => {
      if (!colours.has(hex)) colours.set(hex, mat(simpleMaterial(hex, 0.45)));
      return colours.get(hex);
    };
    const ring = mat(simpleMaterial(0x2a2a2a, 0.5, 0.4));
    for (const [x, y, hex] of BUTTONS) {
      const b = new THREE.Mesh(button, colourMat(hex));
      b.position.set(x, y, FACE - 0.003);
      b.rotation.x = Math.PI / 2;
      this.spin.add(b);
    }
    for (const [x, y, hex] of ROTARIES) {
      const k = new THREE.Mesh(knob, ring);
      k.position.set(x, y, FACE - 0.006);
      k.rotation.x = Math.PI / 2;
      this.spin.add(k);
      const t = new THREE.Mesh(tick, colourMat(hex));
      t.position.set(x, y + 0.006, FACE - 0.0125);
      this.spin.add(t);
    }

    // dash panel: shift lights and screen, drawn on a canvas
    this.canvas = document.createElement('canvas');
    [this.canvas.width, this.canvas.height] = CANVAS;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const screen = mat(new THREE.MeshBasicNodeMaterial({ fog: false }));
    // turned to face -Z below, which also puts its +u on the driver's right: no flip needed
    screen.colorNode = texture(this.tex).rgb.mul(float(1.15));
    screen.toneMapped = false;
    const panel = new THREE.PlaneGeometry(PANEL.w, PANEL.h);
    this.geometries.push(panel);
    const p = new THREE.Mesh(panel, screen);
    p.position.set(0, PANEL.y, FACE - 0.0008);
    p.rotation.y = Math.PI;
    this.spin.add(p);
    this.wait = 0;
    this.draw(null);

    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = false;
    });
  }

  /** Turn with the front wheels (rad of front wheel steer, + is left). */
  steer(angle) {
    // + steer turns left: the top of the wheel moves to the car's left (+X); seen from the
    // driver (looking +Z) that is anticlockwise
    this.spin.rotation.z = -angle * RATIO;
  }

  /**
   * Redraw the display (throttled). car: the physics state; info: { position, cars, lap,
   * laps } for a race, or { lap } when driving alone.
   */
  update(car, info, dt) {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = REDRAW;
    this.draw(car, info);
  }

  draw(car, info = {}) {
    const g = this.ctx;
    const [W, H] = CANVAS;
    g.fillStyle = '#0b0c0e';
    g.fillRect(0, 0, W, H);

    // shift lights: 5 green, 5 red, 5 blue, lighting up through the top of the rev range;
    // all blue flashing at the limiter, and alternating in the pit lane
    const rpm = car?.rpm ?? 0;
    const pit = !!car?.inPitLane;
    const lit = Math.round(Math.max(0, Math.min(1, (rpm - 0.62) / 0.33)) * 15);
    const flash = Math.floor(performance.now() / 120) % 2 === 0;
    const ledY = 22, ledR = 11;
    for (let i = 0; i < 15; i++) {
      const x = 46 + i * 30;
      let c = i < 5 ? '#27e05a' : i < 10 ? '#ff2a2a' : '#3d7bff';
      let on = i < lit;
      if (rpm > 0.97) { c = '#3d7bff'; on = flash; }
      if (pit) { c = '#3d7bff'; on = (i % 2 === 0) === flash; }
      g.beginPath();
      g.arc(x, ledY, ledR, 0, Math.PI * 2);
      g.fillStyle = on ? c : '#1b1d22';
      g.fill();
    }

    // screen
    const sx = 18, sy = 44, sw = W - 36, sh = H - 56;
    g.fillStyle = '#000';
    roundRect(g, sx, sy, sw, sh, 14);
    g.fill();
    g.strokeStyle = '#2a2d33';
    g.lineWidth = 3;
    g.stroke();
    if (!car) return this.done();

    g.textBaseline = 'middle';
    // gear, big in the middle
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.font = 'bold 150px system-ui, sans-serif';
    g.fillText(String(car.gear), W / 2, sy + sh / 2 - 6);
    // centre divider boxes
    g.strokeStyle = '#333840';
    g.lineWidth = 2;
    g.strokeRect(W / 2 - 78, sy + 10, 156, sh - 52);

    // left: speed, assists
    g.textAlign = 'left';
    g.font = 'bold 50px system-ui, sans-serif';
    g.fillText(String(Math.round(Math.abs(car.speed) * 3.6)), sx + 16, sy + 34);
    g.font = 'bold 20px system-ui, sans-serif';
    g.fillStyle = '#8b919c';
    g.fillText('KM/H', sx + 18, sy + 66);
    badge(g, 'TC', sx + 16, sy + 98, car.tc, car.tc && car.tcActive);
    badge(g, 'ABS', sx + 74, sy + 98, car.abs, car.abs && car.absActive);

    // right: position and lap
    g.textAlign = 'right';
    g.fillStyle = '#fff';
    g.font = 'bold 50px system-ui, sans-serif';
    const right = sx + sw - 16;
    g.fillText(info.position ? `P${info.position}` : 'P–', right, sy + 34);
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillStyle = '#c9ced6';
    const lap = info.lap ?? 0;
    g.fillText(lap === 0 ? 'OUT' : info.laps ? `L${Math.min(lap, info.laps)}/${info.laps}` : `L${lap}`, right, sy + 76);
    if (pit) {
      g.fillStyle = flash ? '#3d7bff' : '#fff';
      g.font = 'bold 26px system-ui, sans-serif';
      g.fillText('PIT 80', right, sy + 108);
    }

    // bottom: fitted compound and how much tread is left, like a fuel / energy bar
    const comp = car.compound;
    const wear = car.wheels.reduce((a, w) => Math.max(a, w.wear), 0);
    const left = Math.max(0, 1 - wear);
    const by = sy + sh - 36, bx = sx + 14, bw = sw - 28, bh = 26;
    g.fillStyle = '#1d2026';
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = comp?.css ?? '#ffd400';
    g.fillRect(bx, by, bw * left, bh);
    g.fillStyle = '#000';
    g.textAlign = 'center';
    g.font = 'bold 22px system-ui, sans-serif';
    g.fillText(`${comp?.letter ?? ''} ${Math.round(left * 100)}%`, bx + bw / 2, by + bh / 2 + 1);
    this.done();
  }

  done() {
    this.tex.needsUpdate = true;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.tex.dispose();
  }
}

function badge(g, text, x, y, on, active) {
  g.font = 'bold 20px system-ui, sans-serif';
  const w = g.measureText(text).width + 16;
  g.fillStyle = active ? '#f2c200' : on ? '#1f9d47' : '#2a2d33';
  roundRect(g, x, y - 14, w, 28, 6);
  g.fill();
  g.fillStyle = on || active ? '#000' : '#6c727c';
  g.textAlign = 'left';
  g.fillText(text, x + 8, y + 1);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

