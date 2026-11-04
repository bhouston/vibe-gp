// Circular test circuit, built entirely from hand-made geometry.
import * as THREE from 'three/webgpu';
import { ringGeometry, wallGeometry, boxGeometry, makeGeometry, tubeGeometry } from './geometry.js';
import {
  asphaltMaterial, kerbMaterial, grassMaterial, wallMaterial, checkerMaterial, simpleMaterial,
} from './materials.js';

export const TRACK = {
  radius: 200, // centreline radius (m)
  width: 16, // asphalt width (m)
  kerb: 1.6, // kerb width on each side
  runoff: 14, // grass between kerb and wall
  wallHeight: 1.1,
  wallThickness: 0.6,
};
TRACK.inner = TRACK.radius - TRACK.width / 2;
TRACK.outer = TRACK.radius + TRACK.width / 2;
TRACK.innerWall = TRACK.inner - TRACK.kerb - TRACK.runoff;
TRACK.outerWall = TRACK.outer + TRACK.kerb + TRACK.runoff;

const SEG = 512; // segments around the circle

export function buildTrack() {
  const group = new THREE.Group();
  const circumference = Math.PI * 2 * TRACK.radius;

  // Ground: big disc of grass
  const ground = new THREE.Mesh(ringGeometry(0.01, 1400, 128, 0), grassMaterial());
  ground.receiveShadow = true;
  group.add(ground);

  // Asphalt
  const road = new THREE.Mesh(ringGeometry(TRACK.inner, TRACK.outer, SEG, 0.02, 1), asphaltMaterial());
  road.receiveShadow = true;
  group.add(road);

  // Kerbs (stripe every ~4m)
  const kerbStripes = Math.round(circumference / 4);
  const kerbMat = kerbMaterial(kerbStripes);
  for (const [r0, r1] of [
    [TRACK.inner - TRACK.kerb, TRACK.inner],
    [TRACK.outer, TRACK.outer + TRACK.kerb],
  ]) {
    const kerb = new THREE.Mesh(ringGeometry(r0, r1, SEG, 0.04, 1), kerbMat);
    kerb.receiveShadow = true;
    group.add(kerb);
  }

  // Barrier walls
  for (const r of [TRACK.innerWall, TRACK.outerWall]) {
    const stripes = Math.round((Math.PI * 2 * r) / 6);
    const wall = new THREE.Mesh(
      wallGeometry(r, TRACK.wallHeight, TRACK.wallThickness, SEG, 1),
      wallMaterial(stripes),
    );
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }

  // Start / finish line at angle 0 (the +X axis), spanning the asphalt
  group.add(startLine());
  group.add(gantry());
  group.add(gridSlots());

  return group;
}

/** Chequered strip across the track at angle 0 (z = 0, x from inner to outer). */
function startLine() {
  const depth = 1.2;
  const y = 0.03;
  const positions = [
    TRACK.inner, y, -depth / 2,
    TRACK.outer, y, -depth / 2,
    TRACK.outer, y, depth / 2,
    TRACK.inner, y, depth / 2,
  ];
  const geo = makeGeometry({
    positions,
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 2, 1, 0, 3, 2],
  });
  const mesh = new THREE.Mesh(geo, checkerMaterial(TRACK.width / 0.6, 2));
  mesh.receiveShadow = true;
  return mesh;
}

/** Overhead start gantry with posts, a beam and five start lights. */
function gantry() {
  const g = new THREE.Group();
  const steel = simpleMaterial(0x3a3d44, 0.4, 0.8);
  const postH = 8;
  const x0 = TRACK.inner - TRACK.kerb - 2, x1 = TRACK.outer + TRACK.kerb + 2;
  for (const x of [x0, x1]) {
    const post = new THREE.Mesh(boxGeometry(0.6, postH, 0.6), steel);
    post.position.set(x, postH / 2, 0);
    post.castShadow = true;
    g.add(post);
  }
  const span = x1 - x0;
  const beam = new THREE.Mesh(boxGeometry(span, 1.4, 0.8), simpleMaterial(0x15171b, 0.5, 0.3));
  beam.position.set((x0 + x1) / 2, postH - 0.3, 0);
  beam.castShadow = true;
  g.add(beam);
  // light pods facing the cars arriving from -Z
  const lightMat = new THREE.MeshStandardNodeMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
  for (let i = 0; i < 5; i++) {
    const pod = new THREE.Mesh(boxGeometry(0.7, 0.7, 0.2), lightMat);
    pod.position.set(TRACK.radius - 2.4 + i * 1.2, postH - 0.3, -0.5);
    g.add(pod);
  }
  // a simple sponsor-ish board as a tube arch frame for visual interest
  const arch = new THREE.Mesh(
    tubeGeometry([[x0, postH, 0.45], [x1, postH, 0.45]], 0.08, 8),
    steel,
  );
  g.add(arch);
  return g;
}

/** Painted grid boxes behind the start line. */
function gridSlots() {
  const g = new THREE.Group();
  const paint = simpleMaterial(0xf0f0f0, 0.6);
  for (let i = 0; i < 6; i++) {
    const slot = new THREE.Group();
    const p = gridPose(i);
    slot.position.set(p.x, 0.035, p.z);
    slot.rotation.y = p.yaw;
    // a "[" shaped mark ahead of the car's nose: front bar + two short sides
    const bar = new THREE.Mesh(boxGeometry(2.4, 0.01, 0.25), paint);
    bar.position.set(0, 0, 3.2);
    slot.add(bar);
    for (const sx of [-1.2, 1.2]) {
      const side = new THREE.Mesh(boxGeometry(0.2, 0.01, 1.4), paint);
      side.position.set(sx, 0, 2.6);
      slot.add(side);
    }
    g.add(slot);
  }
  return g;
}

/**
 * Pose of grid slot i (0 = pole). Cars race in the direction of increasing
 * angle around the circle, so the grid sits at small negative angles.
 */
export function gridPose(i) {
  const dist = 11 + i * 8; // metres of arc behind the line
  const offset = i % 2 === 0 ? -3.5 : 3.5;
  const r = TRACK.radius + offset;
  const a = -dist / TRACK.radius;
  // tangent for increasing angle is (-sin a, cos a); yaw = atan2(fx, fz) = -a
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: -a };
}

export function startPose() {
  return gridPose(0);
}
