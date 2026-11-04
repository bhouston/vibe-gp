// Fetch the city around a street circuit from OpenStreetMap and write src/tracks/city/<id>.js.
//
//   node scripts/fetch-city.mjs <trackId>
//
// Data (c) OpenStreetMap contributors, ODbL, via the Overpass API (cached in
// node_modules/.cache/osm/<id>-city.json). Everything is in the track's map metres (the
// same equirectangular projection about def.geo as its points: +x east, +y north, origin
// on the start line), rounded to 0.1 m:
//  - buildings: [height, minHeight, x0, y0, x1, y1, ...] footprints (outer rings, simplified
//    to 0.4 m) within REACH of the centreline. height from height=*, else building:levels
//    x 3.2 m (+ roof), else the circuit's typical height; minHeight from min_height=* /
//    building:min_level (bridges and overhangs). Underground and roof-only structures skipped.
//  - coast: natural=coastline polylines (land on the left, sea on the right, OSM convention).
//  - water: closed outlines of inland water / harbour basins (natural=water, water=*).
//  - walls: barrier=city_wall / historic=citywalls polylines (old fortress walls).
//  - piers: man_made=pier / breakwater polylines and outlines (land reaching into the water).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TRACKS } from '../src/tracks/index.js';
import { TrackPath } from '../src/trackPath.js';

const REACH = 650; // m from the centreline
const DEFAULT_HEIGHT = { monaco: 22, baku: 16 };
const id = process.argv[2];
const def = TRACKS.find((t) => t.id === id);
if (!def?.geo) {
  console.error('Usage: node scripts/fetch-city.mjs <trackId with geo>');
  process.exit(1);
}
const R = 6371008.8, d2r = Math.PI / 180;
const { lat, lon, projLat = lat } = def.geo;
const proj = (la, lo) => [(lo - lon) * d2r * R * Math.cos(projLat * d2r), (la - lat) * d2r * R];
const P = new TrackPath({ ...def, city: undefined, elevation: undefined });
const b = P.bounds();
const pad = REACH + 200;
// map coords: x = world x, y = -world z
const minX = b.minX - pad, maxX = b.maxX + pad, minY = -b.maxZ - pad, maxY = -b.minZ + pad;
const toLat = (y) => lat + y / R / d2r, toLon = (x) => lon + x / (R * Math.cos(projLat * d2r)) / d2r;
const bbox = `${toLat(minY).toFixed(6)},${toLon(minX).toFixed(6)},${toLat(maxY).toFixed(6)},${toLon(maxX).toFixed(6)}`;
const coastPad = 2500;
const cbbox = `${toLat(minY - coastPad).toFixed(6)},${toLon(minX - coastPad).toFixed(6)},${toLat(maxY + coastPad).toFixed(6)},${toLon(maxX + coastPad).toFixed(6)}`;

const cacheDir = 'node_modules/.cache/osm';
mkdirSync(cacheDir, { recursive: true });
const cacheFile = `${cacheDir}/${id}-city.json`;
const query = `[out:json][timeout:240];
(
  way["building"](${bbox});
  relation["building"]["type"="multipolygon"](${bbox});
  way["natural"="coastline"](${cbbox});
  way["natural"="water"](${bbox});
  relation["natural"="water"](${bbox});
  way["barrier"="city_wall"](${bbox});
  way["historic"="citywalls"](${bbox});
  way["man_made"~"^(pier|breakwater|groyne)$"](${bbox});
);
out body geom;`;
let data;
if (existsSync(cacheFile)) data = JSON.parse(readFileSync(cacheFile, 'utf8'));
else {
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  for (let tries = 0; !data; tries++) {
    try {
      const r = await fetch(mirrors[tries % mirrors.length], {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'User-Agent': 'vibe-gp-city-import/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (r.ok) data = await r.json();
      else if (tries > 6) throw new Error(`Overpass ${r.status}`);
    } catch (e) {
      if (tries > 6) throw e;
    }
    if (!data) await new Promise((res) => setTimeout(res, 5000 * (tries + 1)));
  }
  writeFileSync(cacheFile, JSON.stringify(data));
}
console.log(`${data.elements.length} elements (OSM data ${data.osm3s?.timestamp_osm_base ?? '?'})`);

// distance from the centreline (spatial hash of its samples)
const cell = 50, grid = new Map();
for (let i = 0; i < P.N; i++) {
  const k = `${Math.floor(P.px[i] / cell)},${Math.floor(-P.pz[i] / cell)}`;
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(i);
}
const nearTrack = (x, y, r) => {
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell), n = Math.ceil(r / cell);
  for (let gx = cx - n; gx <= cx + n; gx++) {
    for (let gy = cy - n; gy <= cy + n; gy++) {
      for (const i of grid.get(`${gx},${gy}`) ?? []) if (Math.hypot(P.px[i] - x, -P.pz[i] - y) < r) return true;
    }
  }
  return false;
};

const r1 = (v) => Math.round(v * 10) / 10;
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [fx, fy] = pts[0], [lx, ly] = pts[pts.length - 1];
  if (pts.length > 3 && Math.hypot(fx - lx, fy - ly) < 0.01) {
    // closed: split at the point farthest from the first so neither half is degenerate
    let far = 0, fd = -1;
    pts.forEach(([x, y], k) => { const d = Math.hypot(x - fx, y - fy); if (d > fd) { fd = d; far = k; } });
    return [...simplify(pts.slice(0, far + 1), tol), ...simplify(pts.slice(far), tol).slice(1)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, c] = stack.pop();
    let best = -1, bd = tol;
    const [ax, ay] = pts[a], [cx, cy] = pts[c];
    const L = Math.hypot(cx - ax, cy - ay) || 1e-9;
    for (let k = a + 1; k < c; k++) {
      const d = Math.abs((cx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (cy - ay)) / L;
      if (d > bd) { bd = d; best = k; }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, c]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}
const ring = (geom) => geom.map((g) => proj(g.lat, g.lon));
const area = (pts) => Math.abs(pts.reduce((s, [x, y], k) => { const [x2, y2] = pts[(k + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0) / 2);
const num = (v) => {
  const m = String(v ?? '').match(/^-?[0-9.]+/);
  return m ? parseFloat(m[0]) : NaN;
};

const buildings = [], coast = [], water = [], walls = [], piers = [];
const outlines = []; // [tags, pts] building outlines incl. multipolygon outers
for (const e of data.elements) {
  const t = e.tags ?? {};
  if (e.type === 'way' && t.building && e.geometry) outlines.push([t, ring(e.geometry)]);
  if (e.type === 'relation' && t.building) {
    for (const m of e.members ?? []) if (m.role === 'outer' && m.geometry) outlines.push([t, ring(m.geometry)]);
  }
  if (e.type === 'way' && t.natural === 'coastline' && e.geometry) coast.push(simplify(ring(e.geometry), 1));
  if (t.natural === 'water') {
    // basins and lakes, not fountains and pools
    // only closed outlines: a big lake/sea relation comes as open pieces (its shore is the coastline)
    const add = (g) => {
      const r = ring(g);
      if (r.length > 3 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.01 && area(r) >= 1500) water.push(simplify(r, 1));
    };
    if (e.type === 'way' && e.geometry) add(e.geometry);
    for (const m of e.members ?? []) if (m.role === 'outer' && m.geometry) add(m.geometry);
  }
  if (e.type === 'way' && (t.barrier === 'city_wall' || t.historic === 'citywalls') && e.geometry) walls.push(simplify(ring(e.geometry), 0.3));
  if (e.type === 'way' && /^(pier|breakwater|groyne)$/.test(t.man_made ?? '') && e.geometry) piers.push(simplify(ring(e.geometry), 0.5));
}
const typical = DEFAULT_HEIGHT[id] ?? 15;
let skipped = 0;
for (const [t, pts0] of outlines) {
  if (['roof', 'carport', 'canopy', 'ruins', 'construction'].includes(t.building) || num(t.layer) < 0 || t.location === 'underground') { skipped++; continue; }
  let pts = pts0;
  if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  pts = simplify([...pts, pts[0]], 0.4).slice(0, -1);
  if (pts.length < 3 || area(pts) < 15) { skipped++; continue; }
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  if (!nearTrack(cx, cy, REACH)) continue;
  let h = num(t.height);
  if (!(h > 0)) {
    const lv = num(t['building:levels']);
    h = lv > 0 ? lv * 3.2 + (num(t['roof:levels']) > 0 ? num(t['roof:levels']) * 2.5 : 1) : typical * (0.7 + ((Math.abs(cx * 7.1 + cy * 3.3) % 1) * 0.6));
  }
  let mh = num(t.min_height);
  if (!(mh > 0)) mh = num(t['building:min_level']) > 0 ? num(t['building:min_level']) * 3.2 : 0;
  // counter-clockwise outlines (seen from above, +y north)
  const signed = pts.reduce((s, [x, y], k) => { const [x2, y2] = pts[(k + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0);
  if (signed < 0) pts.reverse();
  buildings.push([r1(h), r1(mh), ...pts.flat().map(r1)]);
}

const flat = (list) => list.filter((p) => p.length > 1).map((p) => p.flat().map(r1));
const rows = (list) => list.map((a) => `    [${a.join(', ')}],`).join('\n');
mkdirSync('src/tracks/city', { recursive: true });
writeFileSync(`src/tracks/city/${id}.js`, `// Generated by scripts/fetch-city.mjs: do not edit by hand.
// ${def.name}: the city around the circuit from OpenStreetMap ((c) OpenStreetMap contributors, ODbL),
// in the track's map metres (+x east, +y north, origin on the start line). See the script's header.
// ${buildings.length} buildings within ${REACH} m of the centreline, ${coast.length} coastline ways, ${water.length} water outlines, ${walls.length} city walls, ${piers.length} piers.
export default {
  buildings: [
${rows(buildings)}
  ],
  coast: [
${rows(flat(coast))}
  ],
  water: [
${rows(flat(water))}
  ],
  walls: [
${rows(flat(walls))}
  ],
  piers: [
${rows(flat(piers))}
  ],
};
`);
console.log(`${def.name}: ${buildings.length} buildings (${skipped} skipped), ${coast.length} coastline ways, ${water.length} water, ${walls.length} city walls, ${piers.length} piers -> src/tracks/city/${id}.js`);
