// Debug overlay of the cars' collision boxes (src/carShape.js): a wireframe of every box on
// every car, drawn through everything, so the boxes can be checked against the car model and
// contacts can be seen. Key O in a race toggles it. Off, it does nothing: no geometry is made
// until it is first switched on, and update() returns straight away.
//
// Colours: solid parts cyan, fragile ones (wings) orange, wheels yellow; a box that
// touched another car turns red for half a second (and while it overlaps one).
import * as THREE from 'three/webgpu';
import { BOXES, carBoxes, boxCorners, boxOverlap, boxGone } from './carShape.js';
import { CONTACTS } from './ai.js';

const HOLD = 60; // steps (0.5 s) a touched box stays red
const gone = boxGone; // a wing that has broken off isn't on the car: not drawn

const COLOUR = { solid: new THREE.Color(0x22e0ff), fragile: new THREE.Color(0xff9a1f), wheel: new THREE.Color(0xffe23a) };
const HIT = new THREE.Color(0xff2a2a);
const VERTS = 24; // 12 edges per box
// box edges as pairs of corner indices: 0-3 the bottom (FL FR RR RL), 4-7 the top
const EDGES = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
const LIFT = 0.01; // m: the bottom edges sit just above the road so they don't flicker into it

export class ShapeOverlay {
  constructor(scene) {
    this.scene = scene;
    this.on = false;
    this.lines = null;
    this.capacity = 0; // cars the buffers hold
    this.corners = new Array(8);
    this.hit = [];
  }

  toggle(on = !this.on) {
    this.on = on;
    if (this.lines) this.lines.visible = on;
    return on;
  }

  /** Redraw the boxes of these cars (physics states: position, yaw, height). */
  update(cars) {
    if (!this.on) return;
    if (cars.length > this.capacity) this.grow(cars.length);
    const pos = this.lines.geometry.attributes.position, col = this.lines.geometry.attributes.color;
    const P = pos.array, C = col.array;
    const n = BOXES.length;
    // boxes that overlap another car's
    const hit = this.hit;
    hit.length = cars.length * n;
    hit.fill(false);
    for (let a = 0; a < cars.length; a++) {
      for (let b = a + 1; b < cars.length; b++) {
        const A = cars[a], B = cars[b];
        const dx = B.position.x - A.position.x, dz = B.position.z - A.position.z;
        if (dx * dx + dz * dz > 49) continue;
        const ba = carBoxes(A), bb = carBoxes(B);
        for (let i = 0; i < n; i++) {
          if (gone(A, ba[i].def)) continue;
          for (let j = 0; j < n; j++) {
            if (!gone(B, bb[j].def) && boxOverlap(ba[i], bb[j])) hit[a * n + i] = hit[b * n + j] = true;
          }
        }
      }
    }
    let v = 0;
    const c = this.corners;
    for (let a = 0; a < cars.length; a++) {
      const boxes = carBoxes(cars[a]);
      for (let i = 0; i < n; i++) {
        const box = boxes[i];
        if (gone(cars[a], box.def)) continue;
        boxCorners(box, c);
        const touched = CONTACTS.step - (cars[a].touched?.[i] ?? -1e9) < HOLD;
        const rgb = hit[a * n + i] || touched ? HIT : COLOUR[box.def.kind];
        for (let e = 0; e < VERTS; e++) {
          const k = EDGES[e], q = k & 3;
          P[3 * v] = c[2 * q];
          P[3 * v + 1] = k < 4 ? box.h0 + LIFT : box.h1;
          P[3 * v + 2] = c[2 * q + 1];
          C[3 * v] = rgb.r; C[3 * v + 1] = rgb.g; C[3 * v + 2] = rgb.b;
          v++;
        }
      }
    }
    this.lines.geometry.setDrawRange(0, v);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  grow(cars) {
    const size = cars * BOXES.length * VERTS * 3;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(size), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(size), 3).setUsage(THREE.DynamicDrawUsage));
    if (this.lines) {
      this.scene.remove(this.lines);
      this.lines.geometry.dispose();
      this.lines.geometry = geometry;
    } else {
      const material = new THREE.LineBasicNodeMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, fog: false });
      this.lines = new THREE.LineSegments(geometry, material);
      this.lines.frustumCulled = false; // the positions are world space and change every frame
      this.lines.renderOrder = 999; // over the cars
    }
    this.lines.visible = this.on;
    this.scene.add(this.lines);
    this.capacity = cars;
  }
}
