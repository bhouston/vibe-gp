// A big floating marker in the pit lane beside the player's own pit box: a bobbing,
// spinning bright green down-arrow above a soft light beam and a glowing ring on the fast
// lane, so the box can be picked out from the pit entry. It stands on the lane rather than
// in the box so it never sits over the car and crew. Unlit (MeshBasic) so it reads in any light.
import * as THREE from 'three/webgpu';
import { color, float, uv, uniform, smoothstep, vec3, vec4 } from 'three/tsl';

const ARROW_Y = 10; // m above the box: clear of the car and the garage boards (5.6 m)
const ARROW_SCALE = 1.7;
const GREEN = 0x22ff44;
// The renderer's ACES tone mapping bleeds red and blue into any green (the best a plain
// green can come out is a pale #8ee254). This linear input was solved numerically so that
// it comes out of three's ACESFilmic curve as #22ff45: the negative red and blue cancel the
// bleed. It goes in as outputNode because the regular material output clamps colours at 0.
const VIVID = vec3(-2.016, 4.2, -0.462);

export class BoxMarker {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.tint = uniform(new THREE.Color(GREEN));
    this.pulse = uniform(1);
    this.time = 0;

    const solid = new THREE.MeshBasicNodeMaterial();
    solid.outputNode = vec4(VIVID.mul(this.pulse), 1);
    const outline = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
    outline.colorNode = color(0x111111);

    // down arrow: cone head + square shaft, with a dark shell for contrast against the sky
    this.arrow = new THREE.Group();
    const head = new THREE.ConeGeometry(1.5, 2.2, 4);
    head.rotateX(Math.PI);
    head.translate(0, 1.1, 0);
    const shaft = new THREE.BoxGeometry(1.0, 2.2, 1.0);
    shaft.translate(0, 3.3, 0);
    for (const geo of [head, shaft]) {
      this.arrow.add(new THREE.Mesh(geo, solid));
      const shell = new THREE.Mesh(geo, outline);
      shell.scale.setScalar(1.08);
      this.arrow.add(shell);
    }
    this.arrow.position.y = ARROW_Y;
    this.arrow.scale.setScalar(ARROW_SCALE);

    // light beam from the box up to the arrow, fading out towards the top
    const beamMat = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    beamMat.colorNode = color(this.tint);
    beamMat.opacityNode = smoothstep(1.0, 0.0, uv().y).mul(0.35).mul(this.pulse);
    const beamGeo = new THREE.CylinderGeometry(1.5, 1.5, ARROW_Y, 24, 1, true);
    beamGeo.translate(0, ARROW_Y / 2, 0);
    const beam = new THREE.Mesh(beamGeo, beamMat);

    // glowing ring on the fast lane (fits inside its 7 m width)
    const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    ringMat.outputNode = vec4(VIVID, float(0.85).mul(this.pulse));
    const ringGeo = new THREE.RingGeometry(2.9, 3.4, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.06;

    this.parts = [head, shaft, beamGeo, ringGeo, solid, outline, beamMat, ringMat];
    this.group.add(this.arrow, beam, ring);
    for (const o of this.group.children) o.traverse((m) => (m.castShadow = m.receiveShadow = false));
  }

  /** Stand on the pit lane's centre line level with `box` (from pit.box(k); null hides it). */
  setBox(box, pit) {
    this.box = box;
    if (!box) return;
    const p = pit.poseAt(box.s);
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.y = p.yaw;
  }

  /** Animate; hidden while the crew is working on the car (it would just be in the way). */
  update(dt, pitStop, show = true) {
    this.time += dt;
    const busy = pitStop.state === 'service' || pitStop.state === 'done';
    this.group.visible = Boolean(this.box) && show && !busy;
    if (!this.group.visible) return;
    this.arrow.position.y = ARROW_Y + Math.sin(this.time * 3) * 0.8;
    this.arrow.rotation.y = this.time * 1.5;
    this.pulse.value = 0.8 + 0.2 * Math.sin(this.time * 6);
  }

  dispose() {
    this.parts.forEach((p) => p.dispose());
  }
}
