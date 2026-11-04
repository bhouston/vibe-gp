// Geometry builders for the car's more sculpted parts. Like geometry.js, everything
// is assembled from raw vertex/index buffers (no three.js primitive geometries).
import * as THREE from 'three/webgpu';
import { makeGeometry } from './geometry.js';

/**
 * Skin a list of closed 3D rings (each an array of [x, y, z], all the same length).
 * Faces are oriented outward per ring, so curved/swept shapes (wings that sweep up
 * at the tips, sidepods that drop away) stay correct. uv.x runs around the ring
 * (0..1), uv.y along the rings (0..1). Ends are capped with a fan.
 */
export function ringLoft(rings, { caps = true } = {}) {
  const n = rings[0].length;
  const positions = [], uvs = [], indices = [];
  const centroid = (r) => r.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
  const cents = rings.map(centroid);
  rings.forEach((ring, ri) => {
    for (let j = 0; j <= n; j++) {
      positions.push(...ring[j % n]);
      uvs.push(j / n, ri / (rings.length - 1));
    }
  });
  const row = n + 1;
  const P = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const tri = (a, b, c, out) => {
    // flip so the face normal points along `out`
    const pa = P(a), pb = P(b), pc = P(c);
    const e1 = sub(pb, pa), e2 = sub(pc, pa);
    const nn = cross(e1, e2);
    if (dot(nn, out) < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const mid = lerp3(cents[ri], cents[ri + 1], 0.5);
    for (let j = 0; j < n; j++) {
      const a = ri * row + j, b = a + 1, c = a + row, d = c + 1;
      const m = lerp3(lerp3(P(a), P(d), 0.5), lerp3(P(b), P(c), 0.5), 0.5);
      // direction away from the local spine, ignoring the component along the loft axis
      const axis = norm(sub(cents[ri + 1], cents[ri]));
      let out = sub(m, mid);
      out = sub(out, scale(axis, dot(out, axis)));
      tri(a, b, c, out);
      tri(b, d, c, out);
    }
  }
  if (caps) {
    for (const [ri, away] of [[0, 1], [rings.length - 1, rings.length - 2]]) {
      const base = positions.length / 3;
      const c = cents[ri];
      positions.push(...c);
      uvs.push(0.5, 0.5);
      for (const p of rings[ri]) {
        positions.push(...p);
        uvs.push(0.5, 0.5);
      }
      const out = sub(c, cents[away]);
      for (let j = 0; j < n; j++) tri(base, base + 1 + j, base + 1 + ((j + 1) % n), out);
    }
  }
  const g = makeGeometry({ positions, uvs, indices });
  return g;
}

/** Convert loftGeometry-style sections ({ z, pts: [[x, y]] }) into rings. */
export function sectionsToRings(sections) {
  return sections.map(({ z, pts }) => pts.map(([x, y]) => [x, y, z]));
}

/**
 * Rounded "superellipse" section with optional undercut: the lower half is pulled
 * toward the inboard edge (`side` = +1 left, -1 right) by `undercut` (0..1).
 * Point order matches geometry.roundedSection, so uv.x = 0.25 is still the top centre.
 */
export function podSection(w, h, n, power, cx, cy, side = 1, undercut = 0) {
  const pts = [];
  const inner = cx - (side * w) / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    let x = Math.sign(c) * Math.pow(Math.abs(c), 2 / power) * (w / 2) + cx;
    const y = Math.sign(s) * Math.pow(Math.abs(s), 2 / power) * (h / 2) + cy;
    if (s < 0) x = inner + (x - inner) * (1 - undercut * Math.pow(-s, 0.7));
    pts.push([x, y]);
  }
  return pts;
}

/**
 * Thin airfoil ring at span position x: chord along Z, leading edge forward (+Z).
 * `angle` pitches the trailing edge up (radians); (z, y) is the chord centre.
 */
export function airfoilRing(x, z, y, chord, thick, angle, n = 14) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const zc = -Math.cos(t) * (chord / 2); // t=0 -> trailing edge (rear)
    // thicker towards the leading edge, plus a little camber
    const yc = Math.sin(t) * (thick / 2) * (0.6 - 0.4 * Math.cos(t)) + (1 - Math.cos(t) ** 2) * thick * 0.25;
    ring.push([x, y + yc * ca - zc * sa, z + zc * ca + yc * sa]);
  }
  return ring;
}

/**
 * Flat plate extruded from a 2D outline.
 * axis 'x': outline in (z, y), plate centred on x = `at`, `thickness` wide (endplates, fins).
 * axis 'y': outline in (x, z), plate centred on y = `at` (floor, deflector tops).
 */
export function plateGeometry(outline, thickness, axis = 'x', at = 0) {
  const pts2 = outline.map(([a, b]) => new THREE.Vector2(a, b));
  if (THREE.ShapeUtils.isClockWise(pts2)) pts2.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
  const h = thickness / 2;
  const to3 = (p, off) => (axis === 'x' ? [at + off, p.y, p.x] : [p.x, at + off, p.y]);
  const positions = [], uvs = [], indices = [];
  const minA = Math.min(...pts2.map((p) => p.x)), maxA = Math.max(...pts2.map((p) => p.x));
  const minB = Math.min(...pts2.map((p) => p.y)), maxB = Math.max(...pts2.map((p) => p.y));
  const uv = (p) => [(p.x - minA) / (maxA - minA || 1), (p.y - minB) / (maxB - minB || 1)];
  // two faces
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (const p of pts2) {
      positions.push(...to3(p, side * h));
      uvs.push(...uv(p));
    }
    const faceOut = axis === 'x' ? [side, 0, 0] : [0, side, 0];
    for (const [a, b, c] of tris) {
      const pa = to3(pts2[a], 0), pb = to3(pts2[b], 0), pc = to3(pts2[c], 0);
      const nn = cross(sub(pb, pa), sub(pc, pa));
      if (dot(nn, faceOut) < 0) indices.push(base + a, base + c, base + b);
      else indices.push(base + a, base + b, base + c);
    }
  }
  // rim
  const cx = pts2.reduce((s, p) => s + p.x, 0) / pts2.length;
  const cy = pts2.reduce((s, p) => s + p.y, 0) / pts2.length;
  for (let i = 0; i < pts2.length; i++) {
    const p = pts2[i], q = pts2[(i + 1) % pts2.length];
    const base = positions.length / 3;
    positions.push(...to3(p, h), ...to3(q, h), ...to3(q, -h), ...to3(p, -h));
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    const mid = new THREE.Vector2((p.x + q.x) / 2 - cx, (p.y + q.y) / 2 - cy);
    const out = to3(mid, 0).map((v, k) => v - (axis === 'x' && k === 0 ? at : 0) - (axis === 'y' && k === 1 ? at : 0));
    const pa = positions.slice(base * 3, base * 3 + 3);
    const pb = positions.slice(base * 3 + 3, base * 3 + 6);
    const pc = positions.slice(base * 3 + 6, base * 3 + 9);
    if (dot(cross(sub(pb, pa), sub(pc, pa)), out) < 0) indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return makeGeometry({ positions, uvs, indices });
}

/**
 * Curved strip around the X axis (a section of a cylinder shell), for the
 * front wheel-wake deflectors. Angles in radians, 0 = forward (+Z), PI/2 = up.
 */
export function arcStrip(radius, width, thickness, a0, a1, seg = 10) {
  const rings = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const c = Math.cos(a), s = Math.sin(a);
    const r0 = radius, r1 = radius + thickness;
    rings.push([
      [-width / 2, s * r0, c * r0],
      [width / 2, s * r0, c * r0],
      [width / 2, s * r1, c * r1],
      [-width / 2, s * r1, c * r1],
    ]);
  }
  return ringLoft(rings);
}

/** Open ring of quads swept around the X axis from a (x, r) profile — wheel rim barrels etc. */
export function latheShell(profile, segments) {
  const positions = [], uvs = [], indices = [];
  const rows = profile.length;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    for (let j = 0; j < rows; j++) {
      const [px, r] = profile[j];
      positions.push(px, c * r, s * r);
      uvs.push(i / segments, j / (rows - 1));
    }
  }
  // wound so faces point away from the axle when the profile runs towards +x
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = a + 1, c = a + rows, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return makeGeometry({ positions, uvs, indices });
}

/**
 * Smooth slick tyre around the X axis: bead -> gently bulged sidewall -> rounded
 * shoulder -> slightly crowned tread -> back down the other side. `rimFrac` is the
 * bead radius as a fraction of the outer radius. uv.x runs around the tyre.
 */
export function tyreGeometry(radius, width, rimFrac = 0.63, segments = 96) {
  const hw = width / 2;
  const rs = radius * 0.14; // shoulder radius
  const half = [];
  // sidewall: bead up to the start of the shoulder, bulging slightly outward
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const r = radius * rimFrac + (radius - rs - radius * rimFrac) * t;
    half.push([-(hw * 0.92 + hw * 0.08 * Math.sin(Math.PI * Math.min(t * 1.15, 1))), r]);
  }
  // shoulder: quarter circle from the sidewall onto the tread
  for (let i = 1; i <= 10; i++) {
    const a = Math.PI - (i / 10) * (Math.PI / 2);
    half.push([-(hw - rs) + Math.cos(a) * rs, radius - rs + Math.sin(a) * rs]);
  }
  // tread to the centreline, with a little crown
  for (let i = 1; i <= 5; i++) {
    const x = -(hw - rs) * (1 - i / 5);
    half.push([x, radius + (1 - (x / (hw - rs)) ** 2) * radius * 0.006]);
  }
  const profile = [...half, ...half.slice(0, -1).reverse().map(([x, r]) => [-x, r])];
  return latheShell(profile, segments);
}

/** Single quad in the XY plane facing +Z, uv 0..1 (mirror glass). */
export function quadGeometry(w, h) {
  const x = w / 2, y = h / 2;
  return makeGeometry({
    positions: [-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  });
}

/** Flat disc facing ±X at x = offset; uv is planar (0.5, 0.5 at the centre). */
export function discFacing(radius, offset, side, segments = 36) {
  const positions = [offset, 0, 0];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(offset, Math.cos(a) * radius, Math.sin(a) * radius);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < segments; i++) {
    if (side > 0) indices.push(0, 1 + i, 2 + i);
    else indices.push(0, 2 + i, 1 + i);
  }
  const normals = [];
  for (let i = 0; i < positions.length / 3; i++) normals.push(side, 0, 0);
  return makeGeometry({ positions, normals, uvs, indices });
}

/** Merge geometries that share position/normal/uv attributes. */
export function mergeGeometries(geos) {
  const out = new THREE.BufferGeometry();
  const data = { position: [], normal: [], uv: [] };
  const index = [];
  let offset = 0;
  for (const g of geos) {
    data.position.push(...g.attributes.position.array);
    data.normal.push(...g.attributes.normal.array);
    data.uv.push(...(g.attributes.uv?.array ?? new Float32Array(g.attributes.position.count * 2)));
    for (const i of g.index.array) index.push(i + offset);
    offset += g.attributes.position.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  out.setIndex(index);
  out.computeBoundingSphere();
  return out;
}

// ---- tiny vec3 helpers ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
