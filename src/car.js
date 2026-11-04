// Open-wheel race car built from hand-made geometry.
// Local frame: +Z forward, +Y up, +X is the car's left. Origin on the ground under the car's centre.
import * as THREE from 'three/webgpu';
import {
  loftGeometry, roundedSection, boxGeometry, wheelGeometry, tubeGeometry, sphereGeometry,
} from './geometry.js';
import {
  liveryMaterial, paintMaterial, carbonMaterial, tyreMaterial, rimMaterial, simpleMaterial,
} from './materials.js';

export const CAR_DIMS = {
  wheelbase: 3.4,
  frontAxle: 1.75,
  rearAxle: -1.65,
  track: 0.8, // half-track: wheel centre x offset
  frontRadius: 0.34,
  rearRadius: 0.36,
  frontWidth: 0.3,
  rearWidth: 0.4,
};

const BASE = 0x1446a0;
const ACCENT = 0xffc400;

export class Car {
  constructor() {
    this.group = new THREE.Group(); // world transform (position + yaw)
    this.body = new THREE.Group(); // sprung mass (pitch/roll)
    this.group.add(this.body);

    const livery = liveryMaterial(BASE, ACCENT);
    const paint = paintMaterial(BASE);
    const accent = paintMaterial(ACCENT);
    const carbon = carbonMaterial();
    const black = simpleMaterial(0x0b0b0c, 0.5);

    this.add(this.body, this.monocoque(), livery);
    for (const side of [-1, 1]) this.add(this.body, this.sidepod(side), paint);
    this.add(this.body, this.engineCover(), livery);
    this.add(this.body, this.floor(), carbon);
    this.frontWing(carbon, accent);
    this.rearWing(carbon, accent);
    this.cockpit(black);
    this.add(this.body, this.halo(), carbon);

    this.wheels = [];
    this.buildWheels(carbon);

    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  add(parent, geo, mat, pos, rot) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  }

  monocoque() {
    // [z, width, height, centre y]
    const s = [
      [2.78, 0.12, 0.08, 0.26],
      [2.6, 0.2, 0.13, 0.28],
      [2.2, 0.28, 0.18, 0.31],
      [1.6, 0.36, 0.25, 0.36],
      [1.0, 0.46, 0.33, 0.41],
      [0.5, 0.6, 0.4, 0.44],
      [0.0, 0.7, 0.42, 0.45],
      [-0.5, 0.7, 0.46, 0.46],
      [-1.1, 0.56, 0.44, 0.45],
      [-1.7, 0.38, 0.34, 0.41],
      [-2.15, 0.22, 0.22, 0.38],
    ];
    return loftGeometry(s.map(([z, w, h, y]) => ({ z, pts: roundedSection(w, h, 24, 3.2, y, 0.3) })));
  }

  sidepod(side) {
    // [z, width, height, centre y, x offset]
    const s = [
      [0.55, 0.12, 0.18, 0.36, 0.42],
      [0.45, 0.42, 0.34, 0.36, 0.5],
      [0.0, 0.46, 0.36, 0.36, 0.52],
      [-0.6, 0.38, 0.32, 0.34, 0.46],
      [-1.2, 0.22, 0.24, 0.3, 0.36],
      [-1.6, 0.1, 0.14, 0.26, 0.28],
    ];
    return loftGeometry(
      s.map(([z, w, h, y, x]) => ({
        z,
        pts: roundedSection(w, h, 20, 3.5, y, 0.2).map(([px, py]) => [px + x * side, py]),
      })),
    );
  }

  engineCover() {
    // airbox above/behind the driver tapering into a fin
    const s = [
      [-0.15, 0.18, 0.18, 0.9],
      [-0.3, 0.3, 0.34, 0.86],
      [-0.7, 0.3, 0.42, 0.78],
      [-1.2, 0.2, 0.4, 0.7],
      [-1.8, 0.1, 0.3, 0.6],
      [-2.2, 0.04, 0.22, 0.55],
    ];
    return loftGeometry(s.map(([z, w, h, y]) => ({ z, pts: roundedSection(w, h, 16, 2.6, y) })));
  }

  floor() {
    return boxGeometry(1.35, 0.03, 3.4).translate(0, 0.07, -0.35);
  }

  frontWing(carbon, accent) {
    const b = this.body;
    this.add(b, boxGeometry(1.9, 0.03, 0.42), carbon, [0, 0.1, 2.6]);
    this.add(b, boxGeometry(1.7, 0.025, 0.24), accent, [0, 0.17, 2.42], [-0.35, 0, 0]);
    this.add(b, boxGeometry(1.5, 0.02, 0.18), carbon, [0, 0.23, 2.3], [-0.6, 0, 0]);
    for (const x of [-0.96, 0.96]) this.add(b, boxGeometry(0.03, 0.26, 0.62), carbon, [x, 0.17, 2.52]);
    // pylons from nose to wing
    for (const x of [-0.07, 0.07]) this.add(b, boxGeometry(0.02, 0.16, 0.3), carbon, [x, 0.17, 2.55]);
  }

  rearWing(carbon, accent) {
    const b = this.body;
    this.add(b, boxGeometry(1.0, 0.035, 0.34), carbon, [0, 0.9, -2.35], [0.12, 0, 0]);
    this.add(b, boxGeometry(1.0, 0.03, 0.2), accent, [0, 1.0, -2.5], [0.45, 0, 0]);
    for (const x of [-0.51, 0.51]) this.add(b, boxGeometry(0.03, 0.56, 0.72), carbon, [x, 0.78, -2.38]);
    this.add(b, boxGeometry(0.05, 0.42, 0.12), carbon, [0, 0.66, -2.28]);
    // beam wing + diffuser
    this.add(b, boxGeometry(0.9, 0.025, 0.16), carbon, [0, 0.42, -2.42], [0.3, 0, 0]);
    this.add(b, boxGeometry(1.0, 0.18, 0.4), carbon, [0, 0.12, -2.15], [-0.25, 0, 0]);
  }

  cockpit(black) {
    const b = this.body;
    // cockpit opening and headrest
    this.add(b, boxGeometry(0.42, 0.02, 0.7), black, [0, 0.665, 0.1]);
    // driver helmet
    const helmet = sphereGeometry(0.13, 20, 14, [1, 1.05, 1.15]);
    this.add(b, helmet, paintMaterial(0xf5f5f5), [0, 0.76, -0.02]);
    this.add(b, boxGeometry(0.2, 0.06, 0.04), simpleMaterial(0x111111, 0.1, 0.6), [0, 0.78, 0.12]);
    // mirrors
    const carbon = carbonMaterial();
    for (const s of [-1, 1]) {
      this.add(b, tubeGeometry([[s * 0.3, 0.6, 0.55], [s * 0.42, 0.7, 0.5]], 0.012, 6), carbon);
      this.add(b, boxGeometry(0.14, 0.06, 0.04), carbon, [s * 0.45, 0.71, 0.5]);
    }
  }

  halo() {
    const y = 0.86;
    const loop = [
      [-0.3, 0.6, -0.4], [-0.32, 0.78, -0.25], [-0.3, y, -0.02], [-0.2, y + 0.02, 0.22],
      [0, y + 0.03, 0.32], [0.2, y + 0.02, 0.22], [0.3, y, -0.02], [0.32, 0.78, -0.25], [0.3, 0.6, -0.4],
    ];
    const hoop = tubeGeometry(loop, 0.028, 10);
    const pillar = tubeGeometry([[0, y + 0.03, 0.32], [0, 0.78, 0.48], [0, 0.6, 0.6]], 0.026, 10);
    return mergeGeometries([hoop, pillar]);
  }

  buildWheels(carbon) {
    const d = CAR_DIMS;
    const tyreMat = tyreMaterial();
    const rimMat = rimMaterial();
    const corners = [
      { x: d.track, z: d.frontAxle, r: d.frontRadius, w: d.frontWidth, front: true },
      { x: -d.track, z: d.frontAxle, r: d.frontRadius, w: d.frontWidth, front: true },
      { x: d.track, z: d.rearAxle, r: d.rearRadius, w: d.rearWidth, front: false },
      { x: -d.track, z: d.rearAxle, r: d.rearRadius, w: d.rearWidth, front: false },
    ];
    for (const c of corners) {
      const steer = new THREE.Group();
      steer.position.set(c.x, c.r, c.z);
      this.group.add(steer); // unsprung: wheels don't pitch/roll with the body
      const spin = new THREE.Group();
      steer.add(spin);
      const { tyre, rim } = wheelGeometry(c.r, c.w, 36);
      spin.add(new THREE.Mesh(tyre, tyreMat));
      spin.add(new THREE.Mesh(rim, rimMat));
      // wishbones (upper + lower) from chassis to hub
      const inner = Math.sign(c.x) * 0.24;
      const hub = c.x - Math.sign(c.x) * c.w * 0.45;
      for (const [yIn, yOut] of [[0.48, c.r + 0.12], [0.3, c.r - 0.1]]) {
        const arm = tubeGeometry([[inner, yIn, c.z + 0.18], [hub, yOut, c.z], [inner, yIn, c.z - 0.18]], 0.018, 6);
        this.add(this.body, arm, carbon);
      }
      this.wheels.push({ steer, spin, radius: c.r, front: c.front });
    }
  }

  /** Sync visuals with the physics state. */
  update(state, dt) {
    this.group.position.set(state.position.x, 0, state.position.z);
    this.group.rotation.y = state.yaw;
    for (const w of this.wheels) {
      if (w.front) w.steer.rotation.y = state.steerAngle;
      w.spin.rotation.x += (state.speed / w.radius) * dt;
    }
    // body pitch under accel/brake, roll in corners (smoothed in physics)
    this.body.rotation.x = state.pitch;
    this.body.rotation.z = state.roll;
    this.body.position.y = state.heave;
  }
}

/** Minimal indexed geometry merge (position/normal/uv). */
function mergeGeometries(geos) {
  const out = new THREE.BufferGeometry();
  const attrs = ['position', 'normal', 'uv'];
  const data = { position: [], normal: [], uv: [] };
  const index = [];
  let offset = 0;
  for (const g of geos) {
    for (const a of attrs) data[a].push(...g.attributes[a].array);
    for (const i of g.index.array) index.push(i + offset);
    offset += g.attributes.position.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  out.setIndex(index);
  return out;
}
