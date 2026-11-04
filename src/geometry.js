// Hand-built geometry helpers. Every mesh in the game is constructed from
// raw vertex/index buffers here — no three.js primitive geometries.
import * as THREE from 'three/webgpu';

/** Wrap raw arrays into a BufferGeometry. */
export function makeGeometry({ positions, normals, uvs, indices }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  if (!normals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Flat annulus in the XZ plane (facing +Y).
 * uv.x runs around the ring (0..uRepeat), uv.y runs inner (0) -> outer (1).
 */
export function ringGeometry(innerR, outerR, segments, y = 0, uRepeat = 1) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    positions.push(c * innerR, y, s * innerR, c * outerR, y, s * outerR);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(t * uRepeat, 0, t * uRepeat, 1);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    // CCW when viewed from above (+Y)
    indices.push(a, c, b, b, c, d);
  }
  return makeGeometry({ positions, normals, uvs, indices });
}

/**
 * Circular wall: a rectangular profile (thickness x height) swept around a circle.
 * Builds inner face, outer face and top with hard normals.
 */
export function wallGeometry(radius, height, thickness, segments, uRepeat = 1) {
  const positions = [], normals = [], uvs = [], indices = [];
  const r0 = radius - thickness / 2, r1 = radius + thickness / 2;
  // each face: [rA, yA, rB, yB, normalFn]
  const faces = [
    { a: [r0, 0], b: [r0, height], n: (c, s) => [-c, 0, -s] }, // inner face
    { a: [r0, height], b: [r1, height], n: () => [0, 1, 0] }, // top
    { a: [r1, height], b: [r1, 0], n: (c, s) => [c, 0, s] }, // outer face
  ];
  for (const f of faces) {
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const ang = t * Math.PI * 2;
      const c = Math.cos(ang), s = Math.sin(ang);
      const n = f.n(c, s);
      positions.push(c * f.a[0], f.a[1], s * f.a[0], c * f.b[0], f.b[1], s * f.b[0]);
      normals.push(...n, ...n);
      uvs.push(t * uRepeat, 0, t * uRepeat, 1);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  fixWinding(positions, normals, indices);
  return makeGeometry({ positions, normals, uvs, indices });
}

/** Axis-aligned box centred on the origin with per-face normals and uvs. */
export function boxGeometry(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const positions = [], normals = [], uvs = [], indices = [];
  // [normal, u-axis, v-axis] for each of the 6 faces
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const ext = [x, y, z];
  for (const [n, u, v] of faces) {
    const base = positions.length / 3;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map((k) => (n[k] + u[k] * su + v[k] * sv) * ext[k]);
      positions.push(...p);
      normals.push(...n);
      uvs.push((su + 1) / 2, (sv + 1) / 2);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return makeGeometry({ positions, normals, uvs, indices });
}

/**
 * Wheel/tyre: cylinder whose axis is X, with rounded-ish shoulders and flat caps.
 * Returns { tyre, rim } geometries so they can take different materials.
 */
export function wheelGeometry(radius, width, segments = 32) {
  const hw = width / 2;
  // tyre profile in (x, r) — sweeps around the X axis
  const profile = [
    [-hw, radius * 0.62],
    [-hw, radius * 0.9],
    [-hw * 0.85, radius * 0.98],
    [-hw * 0.6, radius],
    [hw * 0.6, radius],
    [hw * 0.85, radius * 0.98],
    [hw, radius * 0.9],
    [hw, radius * 0.62],
  ];
  const tyre = latheX(profile, segments);
  const rim = discX(radius * 0.62, hw * 0.98, segments, true);
  return { tyre, rim };
}

/** Sweep a 2D (x, r) profile around the X axis. */
export function latheX(profile, segments) {
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
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = a + 1, c = a + rows, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = makeGeometry({ positions, uvs, indices });
  return g;
}

/** Two flat discs (both sides of the wheel) facing ±X at x = ±offset. */
export function discX(radius, offset, segments, spokes = false) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (const side of [-1, 1]) {
    const base = positions.length / 3;
    positions.push(side * offset, 0, 0);
    normals.push(side, 0, 0);
    uvs.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      // slight dish so spokes read when lit: pull alternating verts inward
      const r = spokes && i % 4 < 2 ? radius : radius * 0.92;
      positions.push(side * offset, Math.cos(a) * r, Math.sin(a) * r);
      normals.push(side, 0, 0);
      uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    }
    for (let i = 0; i < segments; i++) {
      if (side > 0) indices.push(base, base + 1 + i, base + 2 + i);
      else indices.push(base, base + 2 + i, base + 1 + i);
    }
  }
  return makeGeometry({ positions, normals, uvs, indices });
}

/**
 * Loft through a list of cross-sections along Z.
 * sections: [{ z, y = 0, pts: [[x, y], ...] }] — every section must have the
 * same number of points, ordered consistently (closed loop). Ends are capped.
 */
export function loftGeometry(sections, { capStart = true, capEnd = true } = {}) {
  const positions = [], uvs = [], indices = [];
  const n = sections[0].pts.length;
  sections.forEach((sec, si) => {
    for (let j = 0; j <= n; j++) {
      const [px, py] = sec.pts[j % n];
      positions.push(px, py + (sec.y || 0), sec.z);
      uvs.push(j / n, si / (sections.length - 1));
    }
  });
  const row = n + 1;
  for (let si = 0; si < sections.length - 1; si++) {
    for (let j = 0; j < n; j++) {
      const a = si * row + j, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const cap = (sec) => {
    const base = positions.length / 3;
    const cx = sec.pts.reduce((s, p) => s + p[0], 0) / n;
    const cy = sec.pts.reduce((s, p) => s + p[1], 0) / n + (sec.y || 0);
    positions.push(cx, cy, sec.z);
    uvs.push(0.5, 0.5);
    for (let j = 0; j < n; j++) {
      positions.push(sec.pts[j][0], sec.pts[j][1] + (sec.y || 0), sec.z);
      uvs.push(0.5, 0.5);
    }
    for (let j = 0; j < n; j++) indices.push(base, base + 1 + j, base + 1 + ((j + 1) % n));
  };
  if (capStart) cap(sections[0]);
  if (capEnd) cap(sections[sections.length - 1]);
  const geo = makeGeometry({ positions, uvs, indices });
  orientOutward(geo);
  return geo;
}

/** Superellipse cross-section helper: a rounded rectangle-ish loop of points. */
export function roundedSection(w, h, n = 16, power = 3, yOffset = 0, flatBottom = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / power) * (w / 2);
    let y = Math.sign(s) * Math.pow(Math.abs(s), 2 / power) * (h / 2);
    if (s < 0) y *= 1 - flatBottom;
    pts.push([x, y + yOffset]);
  }
  return pts;
}

/** Tube with a circular cross-section following a polyline path. */
export function tubeGeometry(path, radius, radial = 8, closed = false) {
  const positions = [], normals = [], uvs = [], indices = [];
  const pts = path.map((p) => new THREE.Vector3(...p));
  const count = pts.length;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const prev = pts[closed ? (i - 1 + count) % count : Math.max(i - 1, 0)];
    const next = pts[closed ? (i + 1) % count : Math.min(i + 1, count - 1)];
    const tan = next.clone().sub(prev).normalize();
    let ref = Math.abs(tan.dot(up)) > 0.9 ? new THREE.Vector3(1, 0, 0) : up;
    const nrm = new THREE.Vector3().crossVectors(tan, ref).normalize();
    const bin = new THREE.Vector3().crossVectors(tan, nrm).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const dir = nrm.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
      const p = pts[i].clone().addScaledVector(dir, radius);
      positions.push(p.x, p.y, p.z);
      normals.push(dir.x, dir.y, dir.z);
      uvs.push(j / radial, i / (count - 1));
    }
  }
  const segs = closed ? count : count - 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const c = ((i + 1) % count) * (radial + 1) + j;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  fixWinding(positions, normals, indices);
  return makeGeometry({ positions, normals, uvs, indices });
}

/** UV sphere (optionally squashed). */
export function sphereGeometry(radius, wSeg = 24, hSeg = 16, scale = [1, 1, 1]) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let y = 0; y <= hSeg; y++) {
    const v = y / hSeg;
    const phi = v * Math.PI;
    for (let x = 0; x <= wSeg; x++) {
      const u = x / wSeg;
      const th = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
      positions.push(nx * radius * scale[0], ny * radius * scale[1], nz * radius * scale[2]);
      normals.push(nx, ny, nz);
      uvs.push(u, 1 - v);
    }
  }
  for (let y = 0; y < hSeg; y++) {
    for (let x = 0; x < wSeg; x++) {
      const a = y * (wSeg + 1) + x, b = a + wSeg + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  fixWinding(positions, normals, indices);
  return makeGeometry({ positions, normals, uvs, indices });
}

/**
 * Flips any triangle whose geometric normal disagrees with the supplied vertex
 * normals. Lets the builders above not worry about winding conventions.
 */
function fixWinding(positions, normals, indices) {
  const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let t = 0; t < indices.length; t += 3) {
    const [ia, ib, ic] = [indices[t], indices[t + 1], indices[t + 2]];
    const a = p(ia), b = p(ib), c = p(ic);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const vn = [0, 1, 2].map((k) => normals[ia * 3 + k] + normals[ib * 3 + k] + normals[ic * 3 + k]);
    if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] < 0) {
      indices[t + 1] = ic;
      indices[t + 2] = ib;
    }
  }
}

/** For closed convex-ish shapes (lofts/lathes): make triangles face away from the centroid. */
export function orientOutward(geo) {
  const pos = geo.attributes.position.array;
  const idx = geo.index.array;
  geo.computeBoundingBox();
  const center = new THREE.Vector3();
  geo.boundingBox.getCenter(center);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromArray(pos, idx[t] * 3);
    b.fromArray(pos, idx[t + 1] * 3);
    c.fromArray(pos, idx[t + 2] * 3);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    m.copy(a).add(b).add(c).divideScalar(3);
    // compare against the direction from the local spine (same z as the triangle)
    let out = m.clone().sub(new THREE.Vector3(center.x, center.y, m.z));
    // end caps face along Z: point them away from the shape's middle instead
    if (Math.abs(n.z) > 0.9 * n.length() || out.lengthSq() < 1e-8) out.set(0, 0, m.z - center.z);
    if (n.dot(out) < 0) {
      const tmp = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = tmp;
    }
  }
  geo.index.needsUpdate = true;
  geo.computeVertexNormals();
}
