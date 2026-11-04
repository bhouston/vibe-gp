// Fetch the land around a circuit from OpenStreetMap and write src/tracks/land/osm/<id>.js.
//
//   node scripts/fetch-land.mjs <trackId> [<trackId> ...]     (or "all")
//
// Data (c) OpenStreetMap contributors, ODbL, via the Overpass API (cached in
// node_modules/.cache/osm/<id>-land.json). Everything is in the track's map metres (+x east,
// +y north, origin on the start line), rounded to 0.1 m, within REACH of the centreline:
//  - areas: [kind, x0, y0, x1, y1, ...] outer rings of land cover, kind one of LAND_KINDS
//    (src/land.js): landuse / natural / leisure / amenity=parking / water polygons.
//  - roads: [width, x0, y0, ...] public roads and tracks as centrelines (not the circuit).
//  - coast: natural=coastline polylines (land on the left, sea on the right).
//  - treeRows: natural=tree_row polylines; trees: [x, y, ...] single trees.
//  - buildings: [height, minHeight, x0, y0, ...] footprints (as scripts/fetch-city.mjs),
//    without grandstands and roofs (the game builds its own stands and pit garages).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TRACKS } from '../src/tracks/index.js';
import { TrackPath } from '../src/trackPath.js';

const REACH = 900; // m from the centreline
const R = 6371008.8, d2r = Math.PI / 180;

// OSM tags -> land kind (first match wins)
function kindOf(t) {
  const lu = t.landuse, na = t.natural, le = t.leisure;
  // the circuit's own outline (the whole venue as one raceway / sports-centre area) is not land cover
  if (t['area:highway'] === 'raceway' || t.highway === 'raceway' || /^(sports_centre|stadium|track)$/.test(le ?? '')) return null;
  if (na === 'water' || t.water || t.waterway === 'riverbank' || /^(reservoir|basin|salt_pond)$/.test(lu ?? '')) return 'water';
  if (lu === 'forest' || na === 'wood') return 'forest';
  if (na === 'scrub' || na === 'heath') return 'scrub';
  if (/^(sand|beach|dune)$/.test(na ?? '')) return 'sand';
  if (/^(shingle|scree|bare_rock)$/.test(na ?? '') || /^(quarry|construction|brownfield|landfill)$/.test(lu ?? '')) return 'gravel';
  if (t.amenity === 'parking' || t['area:highway'] || (t.highway && t.area === 'yes' && t.highway !== 'pedestrian')) return 'asphalt';
  if (t.highway === 'pedestrian' || t.place === 'square') return 'concrete';
  if (/^(grass|recreation_ground|village_green|cemetery)$/.test(lu ?? '') || /^(park|garden|golf_course|pitch|playground|dog_park|common)$/.test(le ?? '') || na === 'grassland') return 'grass';
  if (/^(meadow|greenfield|plant_nursery)$/.test(lu ?? '') || na === 'wetland') return 'meadow';
  if (/^(farmland|orchard|vineyard|allotments|farmyard|greenhouse_horticulture)$/.test(lu ?? '')) return 'farmland';
  if (/^(residential|commercial|retail|industrial|military|railway|garages)$/.test(lu ?? '')) return 'urban';
  return null;
}
const ROAD_WIDTH = {
  motorway: 22, trunk: 18, primary: 12, secondary: 10, tertiary: 8, unclassified: 6, residential: 6,
  motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 6, tertiary_link: 6,
  living_street: 5, service: 4, track: 3,
  raceway: 8, // kart tracks, old loops, other circuits nearby (the circuit itself is under its corridor)
};

const ids = process.argv[2] === 'all' ? TRACKS.filter((t) => t.geo).map((t) => t.id) : process.argv.slice(2);
if (!ids.length) {
  console.error('Usage: node scripts/fetch-land.mjs <trackId ...|all>');
  process.exit(1);
}
for (const id of ids) await fetchLand(id);

async function fetchLand(id) {
  const def = TRACKS.find((t) => t.id === id);
  if (!def?.geo) throw new Error(`no track with geo: ${id}`);
  const { lat, lon, projLat = lat } = def.geo;
  const proj = (la, lo) => [(lo - lon) * d2r * R * Math.cos(projLat * d2r), (la - lat) * d2r * R];
  const P = new TrackPath({ ...def, city: undefined, elevation: undefined });
  const b = P.bounds();
  const toLat = (y) => lat + y / R / d2r, toLon = (x) => lon + x / (R * Math.cos(projLat * d2r)) / d2r;
  const box = (pad) => `${toLat(-b.maxZ - pad).toFixed(6)},${toLon(b.minX - pad).toFixed(6)},${toLat(-b.minZ + pad).toFixed(6)},${toLon(b.maxX + pad).toFixed(6)}`;
  const bbox = box(REACH + 100), cbbox = box(REACH + 3000);

  const cacheDir = 'node_modules/.cache/osm';
  mkdirSync(cacheDir, { recursive: true });
  const cacheFile = `${cacheDir}/${id}-land.json`;
  // two queries (land and roads; buildings and trees) so neither times out on a big circuit
  const queries = [`[out:json][timeout:300];
(
  way["landuse"](${bbox}); relation["landuse"]["type"="multipolygon"](${bbox});
  way["natural"~"^(wood|scrub|heath|grassland|sand|beach|dune|shingle|scree|bare_rock|water|wetland)$"](${bbox});
  relation["natural"~"^(wood|scrub|heath|grassland|sand|beach|water|wetland)$"]["type"="multipolygon"](${bbox});
  way["leisure"~"^(park|garden|golf_course|pitch|playground|common)$"](${bbox});
  relation["leisure"~"^(park|garden|golf_course)$"]["type"="multipolygon"](${bbox});
  way["amenity"="parking"](${bbox}); relation["amenity"="parking"]["type"="multipolygon"](${bbox});
  way["area:highway"](${bbox}); way["highway"]["area"="yes"](${bbox}); way["place"="square"](${bbox});
  way["waterway"="riverbank"](${bbox}); way["water"](${bbox}); relation["water"]["type"="multipolygon"](${bbox});
  way["highway"~"^(${Object.keys(ROAD_WIDTH).join('|')})$"]["area"!="yes"](${bbox});
  way["natural"="coastline"](${cbbox});
);
out body geom;`, `[out:json][timeout:300];
(
  way["natural"="tree_row"](${bbox}); node["natural"="tree"](${bbox});
  way["building"](${bbox}); relation["building"]["type"="multipolygon"](${bbox});
);
out body geom;`];
  let data;
  // raceway ways came later: an old cache gets just those added (a small extra query)
  if (existsSync(cacheFile)) {
    data = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (!data.raceways) {
      const extra = await overpass(`[out:json][timeout:120];(way["highway"="raceway"](${bbox}););out body geom;`, id);
      data.elements.push(...extra.elements);
      data.raceways = true;
      writeFileSync(cacheFile, JSON.stringify(data));
    }
  }
  else {
    data = { elements: [], raceways: true };
    const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    for (const [qi, query] of queries.entries()) {
      let got = null;
      for (let tries = 0; !got; tries++) {
        const url = mirrors[tries % mirrors.length];
        try {
          const r = await fetch(url, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            headers: { 'User-Agent': 'vibe-gp-land-import/1.0', 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            signal: AbortSignal.timeout(320000),
          });
          if (r.ok) got = await r.json();
          else console.log(`  ${id} query ${qi + 1}: ${url} -> ${r.status}`);
        } catch (e) {
          console.log(`  ${id} query ${qi + 1}: ${url} -> ${e.message}`);
        }
        if (!got) {
          if (tries > 8) throw new Error(`Overpass failed for ${id}`);
          await new Promise((res) => setTimeout(res, 5000 * (tries + 1)));
        }
      }
      data.elements.push(...got.elements);
    }
    writeFileSync(cacheFile, JSON.stringify(data));
  }

  // distance from the centreline (spatial hash of its samples)
  const cell = 50, grid = new Map();
  for (let i = 0; i < P.N; i++) {
    const k = `${Math.floor(P.px[i] / cell)},${Math.floor(-P.pz[i] / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const near = (x, y, r) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), n = Math.ceil(r / cell);
    for (let gx = cx - n; gx <= cx + n; gx++) {
      for (let gy = cy - n; gy <= cy + n; gy++) {
        for (const i of grid.get(`${gx},${gy}`) ?? []) if (Math.hypot(P.px[i] - x, -P.pz[i] - y) < r) return true;
      }
    }
    return false;
  };
  const anyNear = (pts, r) => pts.some(([x, y], k) => k % 3 === 0 && near(x, y, r)) || near(...centroid(pts), r);
  const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const r1 = (v) => Math.round(v * 10) / 10;
  const ring = (geom) => geom.filter(Boolean).map((g) => proj(g.lat, g.lon));
  const closed = (r) => r.length > 3 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.01;
  const area = (pts) => Math.abs(pts.reduce((s, [x, y], k) => { const [x2, y2] = pts[(k + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0) / 2);
  const num = (v) => { const m = String(v ?? '').match(/^-?[0-9.]+/); return m ? parseFloat(m[0]) : NaN; };

  const areas = [], roads = [], coast = [], treeRows = [], trees = [], buildings = [];
  const stats = {};
  // multipolygon outers come as separate member ways: join them into closed rings
  const joinRings = (members) => {
    const parts = members.map((m) => ring(m.geometry ?? [])).filter((r) => r.length > 1);
    const out = [];
    while (parts.length) {
      let cur = parts.shift();
      for (let changed = true; changed && !closed(cur); ) {
        changed = false;
        for (let k = 0; k < parts.length; k++) {
          const p = parts[k], e = cur[cur.length - 1];
          const same = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1]) < 0.05;
          if (same(e, p[0])) cur = [...cur, ...p.slice(1)];
          else if (same(e, p[p.length - 1])) cur = [...cur, ...p.slice(0, -1).reverse()];
          else continue;
          parts.splice(k, 1);
          changed = true;
          break;
        }
      }
      if (closed(cur)) out.push(cur);
    }
    return out;
  };
  for (const e of data.elements) {
    const t = e.tags ?? {};
    if (e.type === 'node' && t.natural === 'tree') {
      const [x, y] = proj(e.lat, e.lon);
      if (near(x, y, REACH)) trees.push(r1(x), r1(y));
      continue;
    }
    if (e.type === 'way' && t.natural === 'coastline' && e.geometry) {
      coast.push(simplify(ring(e.geometry), 1));
      continue;
    }
    if (e.type === 'way' && t.natural === 'tree_row' && e.geometry) {
      const r = ring(e.geometry);
      if (anyNear(r, REACH)) treeRows.push(simplify(r, 0.5));
      continue;
    }
    if (t.building) {
      if (/^(roof|carport|canopy|ruins|construction|grandstand)$/.test(t.building) || t.leisure === 'stadium' || num(t.layer) < 0 || t.location === 'underground') continue;
      const rings = e.type === 'way' ? [ring(e.geometry ?? [])] : joinRings((e.members ?? []).filter((m) => m.role === 'outer'));
      for (let pts of rings) {
        if (closed(pts)) pts = pts.slice(0, -1);
        pts = simplify([...pts, pts[0]], 0.4).slice(0, -1);
        if (pts.length < 3 || area(pts) < 15 || !near(...centroid(pts), REACH)) continue;
        let h = num(t.height);
        if (!(h > 0)) {
          const lv = num(t['building:levels']);
          const [cx, cy] = centroid(pts);
          h = lv > 0 ? lv * 3.2 + 1 : /^(house|detached|semidetached_house|garage|shed|hut|farm_auxiliary)$/.test(t.building) ? 6 + (Math.abs(cx * 7.1 + cy * 3.3) % 1) * 3 : 8 + (Math.abs(cx * 7.1 + cy * 3.3) % 1) * 6;
        }
        let mh = num(t.min_height);
        if (!(mh > 0)) mh = num(t['building:min_level']) > 0 ? num(t['building:min_level']) * 3.2 : 0;
        const signed = pts.reduce((s, [x, y], k) => { const [x2, y2] = pts[(k + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0);
        if (signed < 0) pts.reverse();
        buildings.push([r1(h), r1(mh), ...pts.flat().map(r1)]);
      }
      continue;
    }
    if (e.type === 'way' && t.highway && ROAD_WIDTH[t.highway] && t.area !== 'yes' && e.geometry) {
      const r = ring(e.geometry);
      if (!anyNear(r, REACH)) continue;
      const lanes = num(t.lanes);
      const w = lanes > 0 && t.highway !== 'track' ? Math.max(ROAD_WIDTH[t.highway] * 0.6, lanes * 3.4) : ROAD_WIDTH[t.highway];
      roads.push([r1(w), ...simplify(r, 0.5).flat().map(r1)]);
      continue;
    }
    const kind = kindOf(t);
    if (!kind) continue;
    const rings = e.type === 'way' ? [ring(e.geometry ?? [])].filter(closed) : joinRings((e.members ?? []).filter((m) => m.role === 'outer'));
    for (const r of rings) {
      if (area(r) < 60 || !anyNear(r, REACH)) continue;
      if ((kind === 'asphalt' || kind === 'concrete') && area(r) > 150000) continue; // a whole site, not a car park
      areas.push([kind, ...simplify(r, 1).flat().map(r1)]);
      stats[kind] = (stats[kind] ?? 0) + 1;
    }
  }
  // big areas first so smaller ones of the same kind don't matter; land.js orders by kind
  areas.sort((a, c) => area(pairs(c.slice(1))) - area(pairs(a.slice(1))));

  const rows = (list) => list.map((a) => `    [${a.map((v) => (typeof v === 'string' ? `'${v}'` : v)).join(', ')}],`).join('\n');
  const flat = (list) => list.filter((p) => p.length > 1).map((p) => p.flat().map(r1));
  mkdirSync('src/tracks/land/osm', { recursive: true });
  writeFileSync(`src/tracks/land/osm/${id}.js`, `// Generated by scripts/fetch-land.mjs: do not edit by hand (hand additions go in ../${id}.js).
// ${def.name}: land within ${REACH} m of the circuit from OpenStreetMap ((c) OpenStreetMap contributors, ODbL),
// in the track's map metres (+x east, +y north, origin on the start line). See the script's header.
// ${Object.entries(stats).map(([k, v]) => `${v} ${k}`).join(', ')} areas; ${roads.length} roads, ${coast.length} coastline ways,
// ${treeRows.length} tree rows, ${trees.length / 2} trees, ${buildings.length} buildings.
export default {
  areas: [
${rows(areas)}
  ],
  roads: [
${rows(roads)}
  ],
  coast: [
${rows(flat(coast))}
  ],
  treeRows: [
${rows(flat(treeRows))}
  ],
  trees: [${trees.join(', ')}],
  buildings: [
${rows(buildings)}
  ],
};
`);
  console.log(`${id}: ${data.elements.length} elements -> ${areas.length} areas (${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(', ')}), ${roads.length} roads, ${coast.length} coast, ${buildings.length} buildings, ${trees.length / 2} trees`);
}

async function overpass(query, id) {
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (let tries = 0; ; tries++) {
    const url = mirrors[tries % mirrors.length];
    try {
      const r = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'User-Agent': 'vibe-gp-land-import/1.0', 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        signal: AbortSignal.timeout(180000),
      });
      if (r.ok) return await r.json();
      console.log(`  ${id} raceway query: ${url} -> ${r.status}`);
    } catch (e) {
      console.log(`  ${id} raceway query: ${url} -> ${e.message}`);
    }
    if (tries > 8) throw new Error(`Overpass failed for ${id}`);
    await new Promise((res) => setTimeout(res, 5000 * (tries + 1)));
  }
}

function pairs(flat) {
  const out = [];
  for (let k = 0; k < flat.length; k += 2) out.push([flat[k], flat[k + 1]]);
  return out;
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [fx, fy] = pts[0], [lx, ly] = pts[pts.length - 1];
  if (pts.length > 3 && Math.hypot(fx - lx, fy - ly) < 0.01) {
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
