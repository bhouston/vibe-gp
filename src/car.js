// Open-wheel race car built from hand-made geometry.
// Local frame: +Z forward, +Y up, +X is the car's left. Origin on the ground under the car's centre.
import * as THREE from 'three/webgpu';
import {
  roundedSection, boxGeometry, tubeGeometry, sphereGeometry,
} from './geometry.js';
import {
  ringLoft, sectionsToRings, podSection, airfoilRing, plateGeometry, arcStrip, latheShell, discFacing,
  tyreGeometry, quadGeometry,
} from './carGeometry.js';
import { applyDecals } from './decals.js';
import {
  liveryMaterial, paintMaterial, carbonMaterial, tyreMaterial, rimMaterial, simpleMaterial, wheelCoverMaterial,
} from './materials.js';
import { color, texture, uv, vec2, vec3, smoothstep } from 'three/tsl';

/** Layer holding the mirror glass: the main camera must enable it, mirror cameras don't. */
export const MIRROR_LAYER = 1;

// Mirror glass placement (car frame), size, camera optics and render-target resolution.
const MIRROR = {
  x: 0.47, y: 0.72, z: 0.62,
  w: 0.16, h: 0.06,
  fov: 15, // vertical; ~40 deg across
  yaw: 0.16, // toe-out of the view, radians
  pitch: -0.03,
  res: [512, 192],
};

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

export class Car {
  /** @param team an entry from TEAMS (src/teams.js) */
  constructor(team) {
    this.team = team;
    this.group = new THREE.Group(); // world transform (position + yaw)
    this.body = new THREE.Group(); // sprung mass (pitch/roll)
    this.group.add(this.body);

    const carbon = carbonMaterial();
    const black = simpleMaterial(0x0b0b0c, 0.5);
    this.textures = [];
    // team paint with that part's sponsor decals layered on top
    const decorate = (node, part) => {
      const decals = (team.sponsors ?? []).filter((s) => s.part === part);
      if (!decals.length) return node;
      const { node: out, textures } = applyDecals(node, decals);
      this.textures.push(...textures);
      return out;
    };
    const livery = (part) => liveryMaterial(decorate(team.body(part), part), team.finish);
    // solid team paint; null means bare carbon
    const paint = (hex, part) => (hex == null ? carbon : liveryMaterial(decorate(color(hex), part), team.finish));
    const W = team.wings;
    const wings = {
      frontMain: paint(W.frontMain), frontFlaps: paint(W.frontFlaps), frontTop: paint(W.frontTopFlap),
      frontEndplate: paint(W.frontEndplate, 'frontEndplate'), rearMain: paint(W.rearMain),
      rearFlap: paint(W.rearFlap, 'rearFlap'), rearEndplate: paint(W.rearEndplate, 'rearEndplate'),
    };
    this.mirrorPaint = liveryMaterial(color(team.colors.mirror ?? 0x111111), team.finish);
    this.mirrorPaint.side = THREE.DoubleSide;

    this.add(this.body, this.monocoque(), livery('monocoque'));
    const sidepodMat = livery('sidepod');
    for (const side of [-1, 1]) this.add(this.body, this.sidepod(side), sidepodMat);
    this.add(this.body, this.engineCover(), livery('engine'));
    this.add(this.body, this.sharkFin(), livery('fin'));
    this.intakes(black);
    this.floor(carbon);
    this.frontWing(carbon, wings);
    this.rearWing(carbon, wings);
    this.cockpit(black, carbon, paintMaterial(team.helmet), paint(team.colors.tcam));
    this.add(this.body, this.halo(), paint(team.colors.halo));

    this.wheels = [];
    this.buildWheels(carbon, wheelCoverMaterial(team.colors.wheelCover, team.colors.wheelRing));

    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    for (const m of this.mirrors) m.glass.castShadow = m.glass.receiveShadow = false;
  }

  add(parent, geo, mat, pos, rot) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  }

  monocoque() {
    // long, low nose that meets the front wing mainplane, rising to the survival cell
    // and tapering into the gearbox / rear crash structure. [z, width, height, centre y]
    const s = [
      [2.92, 0.08, 0.05, 0.16],
      [2.8, 0.16, 0.08, 0.17],
      [2.55, 0.22, 0.12, 0.2],
      [2.2, 0.27, 0.17, 0.25],
      [1.8, 0.31, 0.24, 0.31],
      [1.4, 0.37, 0.33, 0.36],
      [1.0, 0.47, 0.44, 0.39],
      [0.6, 0.6, 0.52, 0.41],
      [0.2, 0.7, 0.58, 0.4],
      [-0.4, 0.72, 0.58, 0.4],
      [-0.9, 0.6, 0.52, 0.39],
      [-1.4, 0.44, 0.42, 0.36],
      [-1.9, 0.3, 0.3, 0.33],
      [-2.3, 0.2, 0.2, 0.31],
      [-2.5, 0.14, 0.13, 0.31],
    ];
    return ringLoft(sectionsToRings(s.map(([z, w, h, y]) => ({ z, pts: roundedSection(w, h, 32, 3.2, y, 0.1) }))));
  }

  sidepod(side) {
    // downwash sidepod: high letterbox inlet, deep undercut beneath, top surface
    // ramping down to the floor at the rear. [z, width, height, centre y, centre x, undercut]
    const s = [
      [0.66, 0.2, 0.3, 0.5, 0.45, 0.0],
      [0.58, 0.34, 0.34, 0.5, 0.5, 0.3],
      [0.35, 0.38, 0.36, 0.48, 0.53, 0.5],
      [0.0, 0.38, 0.34, 0.45, 0.53, 0.55],
      [-0.4, 0.34, 0.28, 0.4, 0.5, 0.5],
      [-0.8, 0.26, 0.22, 0.33, 0.45, 0.4],
      [-1.15, 0.18, 0.16, 0.26, 0.4, 0.3],
      [-1.4, 0.1, 0.1, 0.21, 0.36, 0.2],
    ];
    return ringLoft(sectionsToRings(
      s.map(([z, w, h, y, x, u]) => ({ z, pts: podSection(w, h, 28, 3.4, x * side, y, side, u) })),
    ));
  }

  engineCover() {
    // roll-hoop airbox above/behind the driver, flowing into the engine cover spine
    const s = [
      [-0.16, 0.2, 0.18, 0.95],
      [-0.28, 0.27, 0.3, 0.9],
      [-0.6, 0.3, 0.42, 0.82],
      [-1.0, 0.26, 0.44, 0.72],
      [-1.4, 0.2, 0.38, 0.62],
      [-1.8, 0.14, 0.3, 0.52],
      [-2.2, 0.1, 0.22, 0.44],
      [-2.45, 0.08, 0.14, 0.38],
    ];
    return ringLoft(sectionsToRings(s.map(([z, w, h, y]) => ({ z, pts: roundedSection(w, h, 24, 2.6, y) }))));
  }

  sharkFin() {
    const outline = [
      [-0.85, 0.93], [-1.6, 0.96], [-2.25, 0.93], [-2.33, 0.85], [-2.2, 0.5], [-1.8, 0.62], [-1.4, 0.76], [-1.0, 0.88],
    ];
    return plateGeometry(outline, 0.012, 'x');
  }

  /** Dark openings: sidepod letterbox inlets and the airbox mouth. */
  intakes(black) {
    for (const side of [-1, 1]) {
      const ring = (z, k) => podSection(0.16 * k, 0.26 * k, 20, 3.4, 0.45 * side, 0.5, side, 0).map(([x, y]) => [x, y, z]);
      this.add(this.body, ringLoft([ring(0.672, 1), ring(0.64, 0.9)]), black);
    }
    const mouth = (z, k) => roundedSection(0.16 * k, 0.14 * k, 16, 2.2, 0.965).map(([x, y]) => [x, y, z]);
    this.add(this.body, ringLoft([mouth(-0.152, 1), mouth(-0.2, 0.85)]), black);
  }

  floor(carbon) {
    const b = this.body;
    // plan-view outline: narrow at the leading edge, full width between the wheels,
    // necking in ahead of the rear tyres into the diffuser
    const half = [
      [0.3, 1.25], [0.6, 1.12], [0.8, 0.95], [0.85, 0.5], [0.85, -0.6], [0.78, -0.95],
      [0.62, -1.2], [0.55, -1.32], [0.52, -2.3],
    ];
    const outline = [...half, ...half.map(([x, z]) => [-x, z]).reverse()];
    this.add(b, plateGeometry(outline, 0.02, 'y', 0.075), carbon);
    for (const s of [-1, 1]) {
      // floor-edge wing curling up along the outer edge
      this.add(b, plateGeometry([[0.9, 0.065], [-0.6, 0.065], [-0.62, 0.115], [0.9, 0.095]], 0.01, 'x', s * 0.845), carbon);
      // fences under the leading edge of the floor
      for (const x of [0.36, 0.46, 0.56]) {
        this.add(b, plateGeometry([[1.18, 0.075], [0.55, 0.075], [0.55, 0.025], [1.08, 0.035]], 0.008, 'x', s * x), carbon);
      }
      // diffuser side walls
      this.add(b, plateGeometry([[-1.3, 0.065], [-2.42, 0.065], [-2.42, 0.34], [-1.3, 0.09]], 0.012, 'x', s * 0.52), carbon);
    }
    // diffuser roof ramping up towards the rear, with strakes
    const roof = plateGeometry([[-0.52, -0.56], [0.52, -0.56], [0.52, 0.56], [-0.52, 0.56]], 0.012, 'y');
    this.add(b, roof, carbon, [0, 0.2, -1.86], [0.21, 0, 0]);
    for (const x of [-0.26, 0, 0.26]) {
      this.add(b, plateGeometry([[-1.4, 0.07], [-2.4, 0.07], [-2.4, 0.3], [-1.4, 0.1]], 0.008, 'x', x), carbon);
    }
  }

  /** Multi-element wing skinned across span stations. elem(x) -> { z, y, chord, thick, angle }. */
  wingElement(xs, elem) {
    return ringLoft(xs.map((x) => {
      const e = elem(x);
      return airfoilRing(x, e.z, e.y, e.chord, e.thick, e.angle);
    }));
  }

  frontWing(carbon, wings) {
    const b = this.body;
    const span = 0.975;
    const xs = Array.from({ length: 25 }, (_, i) => -span + (2 * span * i) / 24);
    // 0 inboard (neutral section under the nose) -> 1 at the endplate
    const t = (x) => {
      const k = Math.min(Math.max((Math.abs(x) - 0.22) / 0.7, 0), 1);
      return k * k * (3 - 2 * k);
    };
    const els = [
      [wings.frontMain, (x) => ({ z: 2.78, y: 0.08 + t(x) * 0.015, chord: 0.32, thick: 0.028, angle: 0.05 + t(x) * 0.05 })],
      [wings.frontFlaps, (x) => ({ z: 2.6, y: 0.125 + t(x) * 0.04, chord: 0.18, thick: 0.02, angle: 0.18 + t(x) * 0.15 })],
      [wings.frontFlaps, (x) => ({ z: 2.47 - t(x) * 0.01, y: 0.16 + t(x) * 0.07, chord: 0.14, thick: 0.018, angle: 0.3 + t(x) * 0.2 })],
      [wings.frontTop, (x) => ({ z: 2.37 - t(x) * 0.02, y: 0.195 + t(x) * 0.1, chord: 0.11, thick: 0.016, angle: 0.42 + t(x) * 0.25 })],
    ];
    for (const [mat, fn] of els) this.add(b, this.wingElement(xs, fn), mat);
    const endplate = [[2.98, 0.04], [2.3, 0.04], [2.28, 0.26], [2.34, 0.36], [2.5, 0.35], [2.74, 0.2], [2.98, 0.12]];
    for (const s of [-1, 1]) this.add(b, plateGeometry(endplate, 0.014, 'x', s * (span + 0.008)), wings.frontEndplate);
  }

  rearWing(carbon, wings) {
    const b = this.body;
    const span = 0.5;
    const xs = Array.from({ length: 17 }, (_, i) => -span + (2 * span * i) / 16);
    // rounded tips: the elements droop into the endplates
    const droop = (x) => Math.max(0, (Math.abs(x) - 0.36) / 0.14) ** 2 * 0.07;
    this.add(b, this.wingElement(xs, (x) => ({ z: -2.4, y: 0.9 - droop(x), chord: 0.32, thick: 0.035, angle: 0.15 })), wings.rearMain);
    this.add(b, this.wingElement(xs, (x) => ({ z: -2.6, y: 1.02 - droop(x) * 0.6, chord: 0.2, thick: 0.022, angle: 0.6 })), wings.rearFlap);
    const endplate = [[-2.2, 0.86], [-2.22, 1.07], [-2.45, 1.12], [-2.72, 1.08], [-2.74, 0.8], [-2.6, 0.6], [-2.4, 0.64]];
    for (const s of [-1, 1]) this.add(b, plateGeometry(endplate, 0.015, 'x', s * (span + 0.008)), wings.rearEndplate);
    // swan-neck pylons hooking over the mainplane from the crash structure
    const neck = [[-2.32, 0.34], [-2.44, 0.34], [-2.52, 0.62], [-2.5, 0.99], [-2.36, 0.99], [-2.4, 0.95], [-2.44, 0.62]];
    for (const x of [-0.06, 0.06]) this.add(b, plateGeometry(neck, 0.014, 'x', x), carbon);
    // two-element beam wing between the diffuser walls
    const bx = Array.from({ length: 9 }, (_, i) => -0.5 + i / 8);
    this.add(b, this.wingElement(bx, () => ({ z: -2.44, y: 0.33, chord: 0.15, thick: 0.02, angle: 0.2 })), carbon);
    this.add(b, this.wingElement(bx, () => ({ z: -2.56, y: 0.41, chord: 0.11, thick: 0.016, angle: 0.5 })), carbon);
    // FIA rain light on the crash structure
    const light = new THREE.MeshStandardNodeMaterial();
    light.colorNode = color(0x300000);
    light.emissiveNode = color(0xff2a2a).mul(1.6);
    this.add(b, boxGeometry(0.09, 0.045, 0.02), light, [0, 0.31, -2.51]);
  }

  cockpit(black, carbon, helmetMat, tcamMat) {
    const b = this.body;
    // cockpit opening: dark tub with a carbon rim around it
    const opening = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      return [Math.cos(a) * 0.2, 0.1 + Math.sin(a) * 0.42];
    });
    this.add(b, plateGeometry(opening, 0.012, 'y', 0.696), black);
    const rim = opening.map(([x, z]) => [x * 1.04, 0.7, z * 1.02 + 0.002]);
    this.add(b, tubeGeometry([...rim, rim[0]], 0.016, 6), carbon);
    // T-cam on top of the airbox (yellow / black identifies the driver)
    this.add(b, boxGeometry(0.11, 0.03, 0.07), tcamMat, [0, 1.07, -0.33]);
    // driver helmet
    const helmet = sphereGeometry(0.13, 20, 14, [1, 1.05, 1.15]);
    this.add(b, helmet, helmetMat, [0, 0.76, -0.02]);
    this.add(b, boxGeometry(0.2, 0.06, 0.04), simpleMaterial(0x111111, 0.1, 0.6), [0, 0.78, 0.12]);
    this.buildMirrors(carbon);
  }

  /**
   * Rear-view mirrors. Each glass face shows a render target filled by a small
   * camera sitting at the glass and looking backwards (see renderMirrors).
   */
  buildMirrors(carbon) {
    const b = this.body;
    const M = MIRROR;
    this.mirrors = [];
    for (const s of [-1, 1]) {
      const [x, y, z] = [s * M.x, M.y, M.z];
      // swept carbon stalk from the chassis shoulder up to the housing
      this.add(b, tubeGeometry([[s * 0.3, 0.64, z + 0.07], [s * (M.x - 0.03), y - 0.035, z + 0.05]], 0.011, 6), carbon);
      // aero housing in team paint: open at the back around the glass, tapering to a rounded nose.
      // [z offset, width, height] — the back ring sits just behind the glass so it frames it.
      const shell = [[-0.008, 1.12, 1.25], [0.012, 1.18, 1.32], [0.04, 1.1, 1.18], [0.07, 0.82, 0.86], [0.095, 0.42, 0.44], [0.108, 0.08, 0.08]];
      const housing = ringLoft(shell.map(([dz, kw, kh]) => (
        roundedSection(M.w * kw, M.h * kh, 28, 3.4, y).map(([px, py]) => [x + px, py, z + dz])
      )), { caps: false });
      this.add(b, housing, this.mirrorPaint);

      const target = new THREE.RenderTarget(M.res[0], M.res[1], { type: THREE.HalfFloatType, samples: 4 });
      const glassMat = new THREE.MeshBasicNodeMaterial({ fog: false });
      // glass faces the driver (-Z): flip u so the image reads as a reflection.
      // three stores render targets top-row-first on every backend, hence the flipped v.
      const u = uv();
      const img = texture(target.texture, vec2(u.x.oneMinus(), u.y.oneMinus())).rgb;
      // slight tint + darkened edges so it reads as glass in a housing
      const edge = smoothstep(0.0, 0.08, u.x.min(u.x.oneMinus())).mul(smoothstep(0.0, 0.16, u.y.min(u.y.oneMinus())));
      glassMat.colorNode = img.mul(vec3(0.82, 0.86, 0.9)).mul(edge.mul(0.35).add(0.65));
      const glass = new THREE.Mesh(quadGeometry(M.w, M.h), glassMat);
      glass.position.set(x, y, z - 0.0005);
      glass.rotation.y = Math.PI;
      // mirror cameras don't render this layer, so no glass ever samples the target it's drawing into
      glass.layers.set(MIRROR_LAYER);
      b.add(glass);

      const cam = new THREE.PerspectiveCamera(M.fov, M.w / M.h, 0.05, 900);
      cam.position.set(x, y, z - 0.01);
      // looking backwards (camera -Z = car -Z), toed out to see past the sidepod
      cam.rotation.set(M.pitch, -s * M.yaw, 0, 'YXZ');
      b.add(cam);

      this.mirrors.push({ target, camera: cam, glass });
    }
  }

  /** Re-render the image in each mirror. Call after the main render each frame. */
  renderMirrors(renderer, scene) {
    const prev = renderer.getRenderTarget();
    for (const m of this.mirrors) {
      renderer.setRenderTarget(m.target);
      renderer.render(scene, m.camera);
    }
    renderer.setRenderTarget(prev);
  }

  halo() {
    const y = 0.88;
    const loop = [
      [-0.3, 0.6, -0.4], [-0.32, 0.78, -0.25], [-0.3, y, -0.02], [-0.2, y + 0.02, 0.22],
      [0, y + 0.03, 0.32], [0.2, y + 0.02, 0.22], [0.3, y, -0.02], [0.32, 0.78, -0.25], [0.3, 0.6, -0.4],
    ];
    const hoop = tubeGeometry(loop, 0.028, 10);
    const pillar = tubeGeometry([[0, y + 0.03, 0.32], [0, 0.78, 0.48], [0, 0.6, 0.6]], 0.026, 10);
    return mergeGeometries([hoop, pillar]);
  }

  buildWheels(carbon, coverMat) {
    const d = CAR_DIMS;
    // one tyre material per axle: the sidewall lettering is laid out relative to the radius
    const tyreMats = { front: tyreMaterial(d.frontRadius), rear: tyreMaterial(d.rearRadius) };
    this.textures.push(...Object.values(tyreMats).map((m) => m.userData.texture));
    const rimMat = rimMaterial();
    const brakeMat = simpleMaterial(0x1a1a1c, 0.7, 0.2);
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
      spin.add(new THREE.Mesh(tyreGeometry(c.r, c.w, 0.63, 96), c.front ? tyreMats.front : tyreMats.rear));
      // 18" rim: barrel just inside the tyre bead, flat aero cover on the outer face,
      // brake assembly visible on the inner face
      const sx = Math.sign(c.x);
      const hw = c.w / 2;
      const rr = c.r * 0.63;
      spin.add(new THREE.Mesh(latheShell([[-hw * 0.96, rr], [-hw * 0.9, rr * 0.97], [hw * 0.9, rr * 0.97], [hw * 0.96, rr]], 36), rimMat));
      spin.add(new THREE.Mesh(discFacing(rr * 0.99, sx * hw * 0.93, sx, 40), coverMat));
      spin.add(new THREE.Mesh(discFacing(rr * 0.99, -sx * hw * 0.9, -sx, 24), brakeMat));
      // centre nut stays put relative to the spinning cover
      spin.add(new THREE.Mesh(discFacing(rr * 0.12, sx * hw * 0.95, sx, 12), rimMat));
      if (c.front) {
        // wheel-wake deflector arcing over the front of the tyre; steers with the wheel
        steer.add(new THREE.Mesh(arcStrip(c.r + 0.035, c.w * 0.8, 0.008, 0.45, 1.35), carbon));
      }

      // suspension, all mounted to the sprung body
      const inner = sx * (c.front ? 0.17 : 0.2);
      const hub = c.x - sx * c.w * 0.45;
      const tube = (pts, r = 0.016) => this.add(this.body, tubeGeometry(pts, r, 6), carbon);
      for (const [yIn, yOut] of [[c.front ? 0.5 : 0.46, c.r + 0.12], [0.26, c.r - 0.1]]) {
        tube([[inner, yIn, c.z + 0.2], [hub, yOut, c.z], [inner, yIn, c.z - 0.2]], 0.017);
      }
      if (c.front) {
        // push rod (lower outboard -> top of chassis) and track rod
        tube([[hub, c.r - 0.08, c.z], [sx * 0.11, 0.56, c.z + 0.06]], 0.014);
        tube([[sx * 0.16, 0.34, c.z + 0.12], [hub, c.r - 0.02, c.z + 0.12]], 0.012);
      } else {
        // pull rod (upper outboard -> bottom of gearbox) and toe link
        tube([[hub, c.r + 0.1, c.z], [sx * 0.15, 0.17, c.z + 0.14]], 0.014);
        tube([[sx * 0.19, 0.3, c.z - 0.16], [hub, c.r - 0.04, c.z - 0.14]], 0.012);
      }
      this.wheels.push({ steer, spin, radius: c.r, front: c.front });
    }
  }

  /** Free GPU resources (call after removing the car from the scene). */
  dispose() {
    const mats = new Set();
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        mats.add(o.material);
      }
    });
    for (const m of mats) m.dispose();
    for (const m of this.mirrors) m.target.dispose();
    for (const t of this.textures) t.dispose();
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
