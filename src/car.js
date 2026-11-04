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
import { color, texture, uv, vec2, vec3, smoothstep, uniform } from 'three/tsl';
import { DAMAGE } from './damage.js';

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

// Front wing: each half hinges off the centre section where it would bend in a hit.
const FRONT_WING = { span: 0.975, hinge: 0.3, pivotY: 0.1, pivotZ: 2.62, centreY: 0.13 };
const ENDPLATE_OFF = 0.4; // wing damage at which that side's endplate is knocked off
const MAX_DEBRIS = 24;
const REAR_WING_PIVOT = [0, 0.95, -2.45]; // where the rear wing sits on its swan necks
const FLOOR_EDGE_OFF = 0.6; // floor damage at which the floor-edge wing tears off
const SMOKE = { count: 36, life: 1.6, at: [0, 0.5, -2.35] }; // engine smoke puffs (car frame emitter)

export class Car {
  /** @param team an entry from TEAMS (src/teams.js) */
  constructor(team) {
    this.team = team;
    this.group = new THREE.Group(); // world transform (position + yaw)
    this.body = new THREE.Group(); // sprung mass (pitch/roll)
    this.group.add(this.body);
    // world-space things that belong to this car but aren't on it: broken-off wing parts
    // lying on the track, and the wings the pit crew is carrying (add to the scene too)
    this.debris = new THREE.Group();
    this.pieces = [];

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
      frontMain: paint(W.frontMain, 'frontMain'), frontFlaps: paint(W.frontFlaps), frontTop: paint(W.frontTopFlap),
      frontEndplate: paint(W.frontEndplate, 'frontEndplate'), rearMain: paint(W.rearMain, 'rearMain'),
      rearFlap: paint(W.rearFlap, 'rearFlap'), rearEndplate: paint(W.rearEndplate, 'rearEndplate'),
    };
    this.mirrorPaint = liveryMaterial(color(team.colors.mirror ?? 0x111111), team.finish);
    this.mirrorPaint.side = THREE.DoubleSide;

    this.add(this.body, this.monocoque(), livery('monocoque'));
    const sidepodMat = livery('sidepod');
    // index 0 = left (+x), 1 = right, like the damage model; each crumples on its own
    this.sidepods = [1, -1].map((side) => [this.add(this.body, this.sidepod(side), sidepodMat)]);
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

    this.buildSmoke();

    // pit crew props: a pristine spare wing, and a copy of the removed one (made per stop)
    this.spareWing = this.wingProp();
    this.oldWing = null;
    this.oldWingStop = -1;
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
      this.sidepods[side > 0 ? 0 : 1].push(this.add(this.body, ringLoft([ring(0.672, 1), ring(0.64, 0.9)]), black));
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
    this.floorEdges = [];
    for (const s of [1, -1]) {
      // floor-edge wing curling up along the outer edge (tears off when the floor is damaged)
      this.floorEdges.push(this.add(b, plateGeometry([[0.9, 0.065], [-0.6, 0.065], [-0.62, 0.115], [0.9, 0.095]], 0.01, 'x', s * 0.845), carbon));
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
    const F = FRONT_WING;
    const span = F.span;
    const fw = new THREE.Group();
    this.body.add(fw);
    this.frontWingGroup = fw;
    // centre section (the neutral section under the nose) and two outer halves, each on
    // a pivot at the hinge line so damage can bend it back and down
    const centre = new THREE.Group();
    fw.add(centre);
    this.wingSides = [1, -1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * F.hinge, F.pivotY, F.pivotZ);
      const inner = new THREE.Group();
      inner.position.set(-sx * F.hinge, -F.pivotY, -F.pivotZ);
      pivot.add(inner);
      fw.add(pivot);
      return { sx, pivot, inner, endplate: null, broken: false, endplateOff: false };
    });
    const stations = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
    const parts = [
      [centre, stations(-F.hinge, F.hinge, 8)],
      [this.wingSides[0].inner, stations(F.hinge, span, 10)],
      [this.wingSides[1].inner, stations(-span, -F.hinge, 10)],
    ];
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
    for (const [parent, xs] of parts) for (const [mat, fn] of els) this.add(parent, this.wingElement(xs, fn), mat);
    const endplate = [[2.98, 0.04], [2.3, 0.04], [2.28, 0.26], [2.34, 0.36], [2.5, 0.35], [2.74, 0.2], [2.98, 0.12]];
    for (const side of this.wingSides) {
      side.endplate = this.add(side.inner, plateGeometry(endplate, 0.014, 'x', side.sx * (span + 0.008)), wings.frontEndplate);
    }
  }

  /**
   * Pose the front wing for its damage (damage.wing[0 left, 1 right], 0..1). mode:
   * 'car' as damaged, 'off' removed by the crew, 'new' a fresh wing just fitted.
   * Parts that break off in a crash fly off as debris (state: the physics, for speed).
   */
  setWing(damage, mode, state) {
    this.frontWingGroup.visible = mode !== 'off';
    for (let i = 0; i < 2; i++) {
      const side = this.wingSides[i];
      const d = mode === 'new' ? 0 : damage.wing[i];
      const broken = d >= DAMAGE.wingBreak, endplateOff = d >= ENDPLATE_OFF;
      // crash damage (not the crew taking the wing off): the lost part flies away
      if (mode === 'car' && state) {
        if (broken && !side.broken) this.spawnDebris(side.pivot, state, side.sx);
        else if (endplateOff && !side.endplateOff) this.spawnDebris(side.endplate, state, side.sx);
      }
      side.broken = broken;
      side.endplateOff = endplateOff;
      side.pivot.visible = !broken;
      side.endplate.visible = !endplateOff;
      // bent: swept back, drooping and twisted a little more the harder it was hit
      const k = Math.min(1, Math.max(0, (d - 0.08) / (DAMAGE.wingBreak - 0.08)));
      side.pivot.rotation.set(k * 0.12, side.sx * k * 0.22, -side.sx * k * 0.06);
    }
  }

  /**
   * Show the rest of the car's damage (see damage.js): rear wing, sidepods, floor edges,
   * mirrors, suspension, and smoke from a hurt engine. Parts that break off fly away as
   * debris (state: the physics, for the car's speed). Call after update().
   */
  setDamage(damage, state, dt) {
    // rear wing: folds back and twists, then snaps off
    const rw = damage.rearWing;
    const rwBroken = damage.rearWingBroken;
    if (rwBroken && !this.rearWingBroken && state) this.spawnDebris(this.rearWingPivot, state, 0);
    this.rearWingBroken = rwBroken;
    this.rearWingPivot.visible = !rwBroken;
    const kr = Math.min(1, rw / DAMAGE.rearWingBreak);
    this.rearWingPivot.rotation.set(-kr * 0.4, 0, kr * 0.12);
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? 1 : -1;
      // sidepod: crushed in towards the chassis and down
      const d = damage.sidepod[i];
      for (const m of this.sidepods[i]) {
        m.scale.set(1 - 0.3 * d, 1 - 0.15 * d, 1 - 0.05 * d);
        m.rotation.z = sx * 0.06 * d;
      }
      // floor edge: tears off
      const edge = this.floorEdges[i];
      const off = damage.floor[i] >= FLOOR_EDGE_OFF;
      if (off && edge.visible && state) this.spawnDebris(edge, state, sx);
      edge.visible = !off;
      // mirror: knocked off
      const m = this.mirrors[i];
      const gone = damage.mirror[i] >= 1;
      if (gone && !m.broken && state) this.spawnDebris(m.group, state, sx);
      m.broken = gone;
      m.group.visible = !gone;
    }
    // suspension: toe-out (as in the physics), camber and sag
    this.wheels.forEach((w, i) => {
      const d = damage.suspension[i];
      w.toe = w.sx * DAMAGE.suspToe * d * 2; // a little exaggerated so it can be seen
      w.camber = w.sx * DAMAGE.suspCamber * d;
      w.drop = 0.05 * d;
    });
    this.updateSmoke(Math.min(1, Math.max(0, (damage.engine - 0.25) / 0.6)), state, dt);
  }

  /** Smoke puffs for a damaged engine: sprites in world space, each with its own fade. */
  buildSmoke() {
    this.smoke = [];
    this.smokeNext = 0;
    this.smokeAcc = 0;
    for (let k = 0; k < SMOKE.count; k++) {
      const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
      const alpha = uniform(0);
      const shade = uniform(0.3);
      const d = uv().sub(0.5).length();
      mat.colorNode = vec3(shade, shade, shade.add(0.02));
      mat.opacityNode = alpha.mul(smoothstep(0.5, 0.1, d));
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.castShadow = false;
      this.debris.add(sprite);
      this.smoke.push({ sprite, alpha, shade, age: Infinity, v: new THREE.Vector3(), grow: 1 });
    }
  }

  /** Emit (intensity 0..1) and age the smoke puffs. */
  updateSmoke(intensity, state, dt) {
    if (intensity > 0 && state && dt > 0) {
      this.smokeAcc += dt * (6 + 24 * intensity);
      const at = new THREE.Vector3();
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        const p = this.smoke[this.smokeNext];
        this.smokeNext = (this.smokeNext + 1) % this.smoke.length;
        this.group.localToWorld(at.set(...SMOKE.at));
        p.sprite.position.copy(at);
        // left behind by the car, rising and spreading
        p.v.set(state.vel.x * 0.15 + (Math.random() - 0.5), 1 + Math.random() * 0.8, state.vel.z * 0.15 + (Math.random() - 0.5));
        p.age = 0;
        p.grow = 0.8 + intensity * 1.6;
        p.peak = 0.25 + 0.45 * intensity;
        p.shade.value = 0.42 - 0.3 * intensity; // grey wisps, thick black smoke when it's bad
        p.sprite.visible = true;
      }
    }
    for (const p of this.smoke) {
      if (p.age === Infinity) continue;
      p.age += dt;
      const t = p.age / SMOKE.life;
      if (t >= 1) {
        p.age = Infinity;
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.exp(-1.5 * dt));
      p.sprite.scale.setScalar(0.35 + p.grow * t);
      p.alpha.value = p.peak * Math.min(1, t * 6) * (1 - t);
    }
  }

  /** A copy of the current front wing (as damaged) on its own, centred on its origin. */
  wingProp() {
    const F = FRONT_WING;
    const prop = new THREE.Group();
    const wing = this.frontWingGroup.clone();
    wing.visible = true;
    wing.position.set(0, -F.centreY, -F.pivotZ);
    prop.add(wing);
    prop.matrixAutoUpdate = false;
    prop.visible = false;
    this.debris.add(prop);
    return prop;
  }

  /**
   * Show the wings the pit crew is handling. props: { old, fresh } world matrices or null,
   * and `stop` (a counter that changes for every stop with a wing change).
   */
  setWingProps(props) {
    if (props.stop !== this.oldWingStop && props.old) {
      // a new wing change: the copy of the old wing is taken as the crew lifts it off
      if (this.oldWing) this.debris.remove(this.oldWing);
      this.oldWing = this.wingProp();
      this.oldWingStop = props.stop;
    }
    for (const [prop, m] of [[this.oldWing, props.old], [this.spareWing, props.fresh]]) {
      if (!prop) continue;
      prop.visible = !!m;
      if (m) {
        prop.matrix.copy(m);
        prop.matrixWorldNeedsUpdate = true;
      }
    }
  }

  /** Throw a copy of `part` (a piece of the car that just broke off) onto the track. */
  spawnDebris(part, state, sx) {
    this.group.updateMatrixWorld(true);
    const piece = part.clone();
    piece.visible = true;
    part.matrixWorld.decompose(piece.position, piece.quaternion, piece.scale);
    this.debris.add(piece);
    // carried along by the car's speed, thrown outwards and up, tumbling
    const yaw = state.yaw;
    const lx = Math.cos(yaw) * sx, lz = -Math.sin(yaw) * sx; // the car's left (sx = 1) or right
    const out = 2 + Math.random() * 3;
    this.pieces.push({
      obj: piece,
      v: new THREE.Vector3(state.vel.x * 0.75 + lx * out, 2 + Math.random() * 3, state.vel.z * 0.75 + lz * out),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14),
      ground: (state.height ?? 0) + 0.02,
      rest: false,
    });
    while (this.pieces.length > MAX_DEBRIS) this.debris.remove(this.pieces.shift().obj);
  }

  /** Fly and bounce the debris until it settles on the road. */
  updateDebris(dt) {
    const e = new THREE.Euler(), q = new THREE.Quaternion();
    for (const p of this.pieces) {
      if (p.rest) continue;
      const o = p.obj;
      p.v.y -= 9.81 * dt;
      o.position.addScaledVector(p.v, dt);
      o.quaternion.premultiply(q.setFromEuler(e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt)));
      if (o.position.y < p.ground) {
        o.position.y = p.ground;
        p.v.y = Math.abs(p.v.y) * 0.25;
        p.v.x *= 0.55;
        p.v.z *= 0.55;
        p.spin.multiplyScalar(0.45);
        if (p.v.lengthSq() < 0.3) {
          // flat on the road: keep its heading, lay it down
          e.setFromQuaternion(o.quaternion, 'YXZ');
          o.quaternion.setFromEuler(e.set(0, e.y, 0, 'YXZ'));
          p.rest = true;
        }
      }
    }
  }

  /** Clear the track of debris (reset, new track) and drop the pit crew's old wing. */
  clearDebris() {
    for (const p of this.pieces) this.debris.remove(p.obj);
    this.pieces.length = 0;
    for (const p of this.smoke ?? []) {
      p.age = Infinity;
      p.sprite.visible = false;
    }
    if (this.oldWing) this.debris.remove(this.oldWing);
    this.oldWing = null;
  }

  rearWing(carbon, wings) {
    const b = this.body;
    // the wing proper (mainplane, flap, endplates) on a pivot at the top of the swan
    // necks, so damage can fold it back and twist it, and a big hit snaps it off
    const pivot = new THREE.Group();
    pivot.position.set(...REAR_WING_PIVOT);
    const rw = new THREE.Group();
    rw.position.set(...REAR_WING_PIVOT.map((v) => -v));
    pivot.add(rw);
    b.add(pivot);
    this.rearWingPivot = pivot;
    this.rearWingBroken = false;
    const span = 0.5;
    const xs = Array.from({ length: 17 }, (_, i) => -span + (2 * span * i) / 16);
    // rounded tips: the elements droop into the endplates
    const droop = (x) => Math.max(0, (Math.abs(x) - 0.36) / 0.14) ** 2 * 0.07;
    this.add(rw, this.wingElement(xs, (x) => ({ z: -2.4, y: 0.9 - droop(x), chord: 0.32, thick: 0.035, angle: 0.15 })), wings.rearMain);
    this.add(rw, this.wingElement(xs, (x) => ({ z: -2.6, y: 1.02 - droop(x) * 0.6, chord: 0.2, thick: 0.022, angle: 0.6 })), wings.rearFlap);
    const endplate = [[-2.2, 0.86], [-2.22, 1.07], [-2.45, 1.12], [-2.72, 1.08], [-2.74, 0.8], [-2.6, 0.6], [-2.4, 0.64]];
    for (const s of [-1, 1]) this.add(rw, plateGeometry(endplate, 0.015, 'x', s * (span + 0.008)), wings.rearEndplate);
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
    const M = MIRROR;
    this.mirrors = [];
    // index 0 = left (+x), 1 = right; each mirror (stalk, housing, glass, camera) is one
    // group so a hit can knock it off
    for (const s of [1, -1]) {
      const b = new THREE.Group();
      this.body.add(b);
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

      this.mirrors.push({ target, camera: cam, glass, group: b, broken: false });
    }
  }

  /** Re-render the image in each mirror. Call after the main render each frame. */
  renderMirrors(renderer, scene) {
    const prev = renderer.getRenderTarget();
    for (const m of this.mirrors) {
      if (m.broken) continue; // knocked off: nothing to show
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
    // (the sidewall lettering texture is shared by every tyre, so it is not disposed with the car)
    const tyreMats = { front: tyreMaterial(d.frontRadius), rear: tyreMaterial(d.rearRadius) };
    this.tyreMats = Object.values(tyreMats);
    this.compound = null;
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
      steer.rotation.order = 'YZX'; // steer and toe, then camber in the wheel's own frame
      this.wheels.push({ steer, spin, radius: c.r, front: c.front, sx, toe: 0, camber: 0, drop: 0 });
    }
  }

  /** Free GPU resources (call after removing the car from the scene). */
  dispose() {
    this.clearDebris();
    const mats = new Set();
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        mats.add(o.material);
      }
    });
    for (const m of mats) m.dispose();
    for (const m of this.mirrors) m.target.dispose();
    for (const p of this.smoke) p.sprite.material.dispose();
    this.smokeGeo?.dispose();
    for (const t of this.textures) t.dispose();
  }

  /** Sidewall colours for the compound fitted (an entry of COMPOUNDS). */
  setCompound(compound) {
    if (compound === this.compound) return;
    this.compound = compound;
    for (const m of this.tyreMats) m.userData.compound.value.setHex(compound.hex);
  }

  /** Show or hide wheel i (0 FL, 1 FR, 2 RL, 3 RR): off the car mid pit stop. */
  setWheelVisible(i, on) {
    this.wheels[i].spin.visible = on;
  }

  /**
   * Sync visuals with the physics state. `lift` raises the whole car (m), for the
   * jacks during a pit stop.
   */
  update(state, dt, lift = 0) {
    // ride the road: its height, and the slope along and across the car's heading
    this.group.position.set(state.position.x, (state.height ?? 0) + lift, state.position.z);
    this.group.rotation.set(-Math.atan(state.gradeF ?? 0), state.yaw, Math.atan(state.gradeL ?? 0), 'YXZ');
    for (const w of this.wheels) {
      // bent suspension: the wheel toes out, leans in at the top and sags a little
      w.steer.rotation.y = (w.front ? state.steerAngle : 0) + w.toe;
      w.steer.rotation.z = w.camber;
      w.steer.position.y = w.radius - w.drop;
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
