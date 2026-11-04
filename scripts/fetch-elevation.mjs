// Fetch a track's real elevation profile and write src/tracks/elevation/<trackId>.js.
//
//   node scripts/fetch-elevation.mjs <trackId>
//
// The sampled centreline is converted back to latitude/longitude with the track's `geo`
// origin (the inverse of the equirectangular projection its points were made with),
// sampled every 10 m from the start line, and looked up on the OpenTopoData public API
// (https://www.opentopodata.org, max 100 points per request, 1 request per second).
// The raw heights are filtered (optional median to drop spikes, then the smoothest
// profile within a tolerance band of the data), calibrated against the circuit's
// published figures, and stored every 20 m as metres above sea level.
//
// Calibration against real-life references:
//  - `range`: the published highest-to-lowest difference (Formula 1's "Highs and lows -
//    which F1 track has the most elevation changes?" article). The filtered DEM profile
//    is scaled about its mean to match it; the shape (where the track climbs and falls)
//    stays the terrain data's.
//  - `features`: short features the DEM's 25-30 m cells blur, given their documented
//    peak gradient. Inside [from, to] (lap metres from the start line) the profile is
//    rebuilt with the same heights and slopes at both ends and the same total climb,
//    but with the climb concentrated so the steepest point reaches `peakGrade`, at the
//    place the data has its steepest point.
// Raw lookups are cached in node_modules/.cache/elevation so re-runs don't refetch.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { TRACKS } from '../src/tracks/index.js';
import { TrackPath } from '../src/trackPath.js';
import { CIRCUITS } from './circuits.mjs';

// Per-track source, filtering and real-life references.
const SOURCES = {
  // Mapzen terrain tiles show the Eau Rouge dip (~388 m) and the climb over Raidillon
  // cleanly; eudem25m directly has forest-canopy bumps (Speaker's Corner).
  // ±2 m turns the DEM's steps on Kemmel and Blanchimont into steady ~3% climbs.
  // F1: 102.2 m from Malmedy (T7, highest) down to Paul Frère (T15, lowest).
  // Raidillon's gradient is widely quoted as 17%; the DEM resolves only ~14%.
  spa: {
    dataset: 'mapzen', label: 'Mapzen terrain tiles', median: 0, tol: 2, range: 102.2,
    features: [{ name: 'Eau Rouge-Raidillon', from: 890, to: 1260, peakGrade: 0.17 }],
  },
  // On circuits this flat the global DEMs' 1-2 m noise swamps the real shape, so these
  // use survey LiDAR of the track surface (centimetre accuracy) instead. The result is
  // only compared with F1's published range, not scaled to it (`checkRange`).
  // F1: 11.3 m, most notably the drop after Stowe down to Vale and Club.
  silverstone: {
    provider: 'ea-lidar', label: 'Environment Agency LiDAR Composite DTM 1 m (© Environment Agency)',
    median: 0, tol: 0.15, checkRange: 11.3,
  },
  // F1: 5.2 m ("almost as flat as the rowing lake beside it").
  montreal: {
    provider: 'nrcan-hrdem', label: 'NRCan HRDEM Mosaic DTM (LiDAR, Open Government Licence - Canada)',
    median: 0, tol: 0.15, checkRange: 5.2,
  },
};
// circuits imported by scripts/import-track.mjs keep their elevation settings in scripts/circuits.mjs
// (`elevation: { dataset | provider, label, median, tol, range | checkRange | maxRange, features }`)
for (const [cid, c] of Object.entries(CIRCUITS)) if (c.elevation) SOURCES[cid] = c.elevation;
const SAMPLE = 10; // m between lookups
const STORE = 20; // m between stored heights

const id = process.argv[2];
const def = TRACKS.find((t) => t.id === id);
const src = SOURCES[id];
if (!def || !src || !def.geo) {
  console.error(`Usage: node scripts/fetch-elevation.mjs <${Object.keys(SOURCES).join('|')}>`);
  process.exit(1);
}

const R = 6371008.8, d2r = Math.PI / 180;
const { lat, lon, projLat = lat } = def.geo;
const P = new TrackPath({ ...def, elevation: undefined });
const n = Math.round(P.length / SAMPLE);
const locs = [];
for (let k = 0; k < n; k++) {
  const p = P.poseAt((k / n) * P.length);
  const x = p.x, y = -p.z; // map metres: +x east, +y north
  locs.push([lat + y / R / d2r, lon + x / (R * Math.cos(projLat * d2r)) / d2r]);
}

const cacheDir = 'node_modules/.cache/elevation';
mkdirSync(cacheDir, { recursive: true });
const UA = { 'User-Agent': 'vibe-gp-elevation-script/1.0' };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function fetchRetry(url, as) {
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return as === 'buffer' ? Buffer.from(await r.arrayBuffer()) : as === 'json' ? await r.json() : await r.text();
      if (tries > 4) throw new Error(`${r.status} for ${url}`);
    } catch (e) {
      if (tries > 4) throw e;
    }
    await sleep(1500 * (tries + 1));
  }
}

/** OpenTopoData point lookups (global DEMs, 25-30 m cells, ~1-2 m vertical noise). */
async function openTopoData(dataset) {
  const cacheFile = `${cacheDir}/${id}-${dataset}-${n}.json`;
  const raw = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : [];
  for (let a = raw.length; a < n; a += 100) {
    const q = locs.slice(a, a + 100).map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`).join('|');
    const j = await fetchRetry(`https://api.opentopodata.org/v1/${dataset}?locations=${q}`, 'json');
    if (j?.status !== 'OK') throw new Error(`OpenTopoData failed: ${JSON.stringify(j)}`);
    raw.push(...j.results.map((x) => x.elevation));
    await sleep(1100);
    process.stdout.write('.');
  }
  writeFileSync(cacheFile, JSON.stringify(raw));
  return raw;
}

/**
 * Survey LiDAR terrain models, fetched as raster tiles along the track. Each centreline
 * point takes the median of the pixels within ROAD_R metres of it: the road surface
 * itself, robust to the odd kerb, drain or missing pixel.
 * A tile fetcher returns { get(i, j), w, h, lonAt(i), latAt(j) } with NaN for no data.
 */
const ROAD_R = +(process.env.ROAD_R ?? 3.5);
async function lidar(tileDeg, fetchTile) {
  const [tLat, tLon] = tileDeg;
  const tiles = new Map();
  for (const [la, lo] of locs) tiles.set(`${Math.floor(la / tLat)},${Math.floor(lo / tLon)}`, true);
  const out = new Array(n).fill(NaN);
  const mLat = R * d2r, mLon = R * d2r * Math.cos(lat * d2r);
  for (const key of tiles.keys()) {
    const [a, b] = key.split(',').map(Number);
    const pad = 0.0001; // ~10 m overlap so points near an edge see all their pixels
    const box = [a * tLat - pad, b * tLon - pad, (a + 1) * tLat + pad, (b + 1) * tLon + pad]; // lat0, lon0, lat1, lon1
    const t = await fetchTile(box, key);
    process.stdout.write('.');
    for (let k = 0; k < n; k++) {
      const [la, lo] = locs[k];
      if (`${Math.floor(la / tLat)},${Math.floor(lo / tLon)}` !== key) continue;
      const vals = [];
      for (let j = 0; j < t.h; j++) {
        const dy = (t.latAt(j) - la) * mLat;
        if (Math.abs(dy) > ROAD_R) continue;
        for (let i = 0; i < t.w; i++) {
          const dx = (t.lonAt(i) - lo) * mLon;
          if (dx * dx + dy * dy > ROAD_R * ROAD_R) continue;
          const v = t.get(i, j);
          if (Number.isFinite(v)) vals.push(v);
        }
      }
      if (vals.length) out[k] = vals.sort((x, y) => x - y)[vals.length >> 1];
    }
  }
  // fill any points with no data from their neighbours
  const missing = out.filter((v) => !Number.isFinite(v)).length;
  if (missing) console.log(`\n${missing} points without LiDAR data, interpolated`);
  for (let k = 0; k < n; k++) {
    if (Number.isFinite(out[k])) continue;
    let a = 1, b = 1;
    while (!Number.isFinite(out[(k - a + n) % n]) && a < n) a++;
    while (!Number.isFinite(out[(k + b) % n]) && b < n) b++;
    out[k] = (out[(k - a + n) % n] * b + out[(k + b) % n] * a) / (a + b);
  }
  return out;
}

const cached = async (key, ext, get) => {
  const f = `${cacheDir}/${key}.${ext}`;
  if (existsSync(f)) return readFileSync(f);
  const v = await get();
  writeFileSync(f, v);
  return Buffer.from(v);
};

/** England: Environment Agency LiDAR Composite DTM 1 m (WCS 2.0.1, plain-text grid). */
async function eaLidar() {
  const base = 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs';
  const cov = '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m';
  return lidar([0.0025, 0.004], async ([la0, lo0, la1, lo1], key) => {
    const url = `${base}?service=WCS&version=2.0.1&request=GetCoverage&CoverageId=${cov}&format=text/plain` +
      `&subsettingCrs=http://www.opengis.net/def/crs/EPSG/0/4326&subset=Lat(${la0},${la1})&subset=Long(${lo0},${lo1})`;
    const txt = (await cached(`ea-${key}`, 'txt', () => fetchRetry(url, 'text'))).toString();
    const num = (name) => +txt.match(new RegExp(`"${name}", ([-0-9.eE]+)`))[1];
    const [c0, , r0] = txt.match(/GeneralGridEnvelope\[(\d+)\.\.(\d+), (\d+)\.\.(\d+)\]/).slice(1).map(Number);
    const rows = txt.slice(txt.indexOf('Band 0:') + 7).trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
    const sx = num('elt_0_0'), ox = num('elt_0_2'), sy = num('elt_1_1'), oy = num('elt_1_2');
    return {
      w: rows[0].length, h: rows.length,
      get: (i, j) => (rows[j][i] > -1000 ? rows[j][i] : NaN),
      lonAt: (i) => ox + (c0 + i + 0.5) * sx,
      latAt: (j) => oy + (r0 + j + 0.5) * sy,
    };
  });
}

/** Canada: NRCan HRDEM Mosaic DTM (1-2 m LiDAR; WCS 1.1.1, float32 GeoTIFF in EPSG:3857). */
async function nrcanHrdem() {
  const base = 'https://datacube.services.geo.ca/wrapper/ogc/elevation-hrdem-mosaic';
  const merc = (la, lo) => [6378137 * lo * d2r, 6378137 * Math.log(Math.tan(Math.PI / 4 + (la * d2r) / 2))];
  const unmerc = (x, y) => [(2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) / d2r, x / 6378137 / d2r];
  // ~150 m tiles: the service answers with a single 256 px tile at ~1.2 m
  return lidar([0.0013, 0.0019], async ([la0, lo0, la1, lo1], key) => {
    const [x0, y0] = merc(la0, lo0), [x1, y1] = merc(la1, lo1);
    const url = `${base}?service=WCS&version=1.1.1&request=GetCoverage&identifier=dtm&format=image/geotiff` +
      `&BoundingBox=${x0.toFixed(1)},${y0.toFixed(1)},${x1.toFixed(1)},${y1.toFixed(1)},urn:ogc:def:crs:EPSG::3857` +
      `&GridBaseCRS=urn:ogc:def:crs:EPSG::3857&GridOffsets=1,-1`;
    const t = readGeoTiff(await cached(`hrdem-${key}`, 'tif', () => fetchRetry(url, 'buffer')));
    return {
      w: t.w, h: t.h,
      get: (i, j) => t.get(i, j),
      lonAt: (i) => unmerc(t.ox + (i + 0.5) * t.sx, t.oy)[1],
      latAt: (j) => unmerc(t.ox, t.oy - (j + 0.5) * t.sy)[0],
    };
  });
}

/**
 * Japan: GSI (Geospatial Information Authority of Japan) DEM5A, the 5 m grid from airborne
 * laser survey, served as 256 px CSV tiles at zoom 15 (~3.9 m pixels at Suzuka's latitude).
 * Each lidar() box is mosaicked from the XYZ tiles it touches ('e' = no data).
 */
async function gsiDem5a() {
  const z = 15, N = 2 ** z * 256; // global pixels across at this zoom
  const px = (lo) => ((lo + 180) / 360) * N;
  const py = (la) => ((1 - Math.log(Math.tan(Math.PI / 4 + (la * d2r) / 2)) / Math.PI) / 2) * N;
  const lonOf = (x) => (x / N) * 360 - 180;
  const latOf = (y) => (2 * Math.atan(Math.exp(Math.PI * (1 - (2 * y) / N))) - Math.PI / 2) / d2r;
  return lidar([0.002, 0.002], async ([la0, lo0, la1, lo1]) => {
    const x0 = Math.floor(px(lo0)), x1 = Math.ceil(px(lo1)), y0 = Math.floor(py(la1)), y1 = Math.ceil(py(la0));
    const tiles = new Map();
    for (let ty = y0 >> 8; ty <= y1 >> 8; ty++) {
      for (let tx = x0 >> 8; tx <= x1 >> 8; tx++) {
        const url = `https://cyberjapandata.gsi.go.jp/xyz/dem5a/${z}/${tx}/${ty}.txt`;
        const buf = await cached(`gsi-dem5a-${z}-${tx}-${ty}`, 'txt', () => fetchRetry(url, 'text'));
        tiles.set(`${tx},${ty}`, buf.toString().trim().split('\n').map((l) => l.split(',').map((v) => (v.trim() === 'e' ? NaN : +v))));
      }
    }
    return {
      w: x1 - x0, h: y1 - y0,
      get: (i, j) => {
        const gx = x0 + i, gy = y0 + j;
        return tiles.get(`${gx >> 8},${gy >> 8}`)?.[gy & 255]?.[gx & 255] ?? NaN;
      },
      lonAt: (i) => lonOf(x0 + i + 0.5),
      latAt: (j) => latOf(y0 + j + 0.5),
    };
  });
}

/** Minimal GeoTIFF reader: one band, float32, uncompressed, strips or tiles. */
function readGeoTiff(buf) {
  const le = buf.toString('ascii', 0, 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const f32 = (o) => (le ? buf.readFloatLE(o) : buf.readFloatBE(o));
  const f64 = (o) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8 };
  const ifd = u32(4), tags = {};
  for (let k = 0; k < u16(ifd); k++) {
    const e = ifd + 2 + k * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
    const off = size[type] * cnt <= 4 ? e + 8 : u32(e + 8);
    tags[tag] = Array.from({ length: cnt }, (_, i) => {
      const o = off + i * size[type];
      return type === 3 ? u16(o) : type === 12 ? f64(o) : type === 11 ? f32(o) : type === 2 ? buf[o] : u32(o);
    });
  }
  if (tags[259][0] !== 1 || tags[258][0] !== 32 || tags[339]?.[0] !== 3) throw new Error('expected uncompressed float32 GeoTIFF');
  const w = tags[256][0], h = tags[257][0];
  const nodata = tags[42113] ? parseFloat(String.fromCharCode(...tags[42113].filter(Boolean))) : NaN;
  const tw = tags[322]?.[0] ?? w, th = tags[323]?.[0] ?? tags[278]?.[0] ?? h;
  const offs = tags[324] ?? tags[273];
  const across = Math.ceil(w / tw);
  const get = (i, j) => {
    const t = Math.floor(j / th) * across + Math.floor(i / tw);
    const v = f32(offs[t] + ((j % th) * tw + (i % tw)) * 4);
    return v === nodata || v < -1000 ? NaN : v;
  };
  const [sx, sy] = tags[33550], tie = tags[33922];
  return { w, h, get, sx, sy, ox: tie[3] - tie[0] * sx, oy: tie[4] + tie[1] * sy };
}

const raw0 = src.provider === 'ea-lidar' ? await eaLidar() : src.provider === 'nrcan-hrdem' ? await nrcanHrdem() : src.provider === 'gsi-dem5a' ? await gsiDem5a() : await openTopoData(src.dataset);
console.log();
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(raw0));
// No-data points (eudem25m has none over the sea) and `gaps` (lap metres [from, to] where the DEM
// shows something other than the road surface: tunnels, bridges) are bridged by straight lines
// between the data on either side.
const valid = raw0.map((v, k) => Number.isFinite(v) && !(src.gaps ?? []).some(([a, b]) => k * SAMPLE >= a && k * SAMPLE <= b));
if (!valid.some(Boolean)) throw new Error('no elevation data');
const raw = raw0.map((v, k) => {
  if (valid[k]) return v;
  let a = 1, b = 1;
  while (!valid[(k - a + n) % n]) a++;
  while (!valid[(k + b) % n]) b++;
  return (raw0[(k - a + n) % n] * b + raw0[(k + b) % n] * a) / (a + b);
});

// filter around the closed loop
const at = (arr, i) => arr[((i % n) + n) % n];
// `notches: { maxLen, depth }`: bare-earth LiDAR removes bridge decks, so where the track
// crosses over a tunnel or another road the profile drops into a short, steep-sided notch
// (the ground underneath). Any run up to maxLen metres lying more than `depth` below the
// straight line across it is replaced by that line: the deck.
if (src.notches) {
  const { maxLen = 60, depth = 1.5 } = src.notches;
  const W = Math.round(maxLen / SAMPLE);
  for (let a = 0; a < n; a++) {
    for (let w = W; w >= 1; w--) {
      const y0 = at(raw, a), y1 = at(raw, a + w + 1);
      let ok = true;
      for (let k = 1; k <= w && ok; k++) ok = y0 + ((y1 - y0) * k) / (w + 1) - at(raw, a + k) > depth;
      if (!ok) continue;
      for (let k = 1; k <= w; k++) raw[(a + k) % n] = y0 + ((y1 - y0) * k) / (w + 1);
      console.log(`deck over a notch at s=${(a + 1) * SAMPLE}..${(a + w) * SAMPLE} (${w * SAMPLE} m)`);
      break;
    }
  }
}
let h = raw;
if (src.median > 0) {
  const r = Math.round(src.median / SAMPLE / 2);
  h = h.map((_, i) => {
    const w = [];
    for (let k = -r; k <= r; k++) w.push(at(raw, i + k));
    return w.sort((a, b) => a - b)[r];
  });
}
const gauss = (arr, sigmaM) => {
  const sig = sigmaM / SAMPLE, rad = Math.ceil(sig * 3);
  return arr.map((_, i) => {
    let s = 0, w = 0;
    for (let k = -rad; k <= rad; k++) {
      const e = Math.exp(-(k * k) / (2 * sig * sig));
      s += e * at(arr, i + k);
      w += e;
    }
    return s / w;
  });
};
// Smoothest profile within ±tol of the data. A plain low-pass filter either leaves
// the DEM's 1-2 m wiggles as hills on the straights or flattens real features; this
// turns wiggles inside the error band into steady grades and keeps anything bigger.
// Alternating projections: smooth, then clamp back into the band, repeatedly.
const base = gauss(h, 15); // removes the 1 m quantisation steps
// steep ground (Raidillon) is pinned closer to the data so it keeps its gradient
const tol = base.map((_, i) => {
  const g = Math.abs(at(base, i + 1) - at(base, i - 1)) / (2 * SAMPLE);
  return src.tol + (Math.min(src.tol, 0.6) - src.tol) * Math.min(1, Math.max(0, (g - 0.05) / 0.04));
});
h = gauss(base, 150);
for (let it = 0; it < 400; it++) {
  h = gauss(h, 30).map((v, i) => Math.min(base[i] + tol[i], Math.max(base[i] - tol[i], v)));
}
h = gauss(h, src.smooth ?? 15); // round off the kinks where the profile touches the band

const range = (arr) => Math.max(...arr) - Math.min(...arr);
const slope = (arr, i) => (at(arr, i + 1) - at(arr, i - 1)) / (2 * SAMPLE);
const dataRange = range(h);
if (src.checkRange) console.log(`range ${dataRange.toFixed(2)} m from the data, ${src.checkRange} m published (F1)`);

// calibrate the total climb to the published figure (maxRange: only ever scale down to it,
// for flat circuits with no published figure where the DEM's noise adds false hills)
if (src.maxRange && dataRange > src.maxRange) {
  const mean = h.reduce((s, v) => s + v, 0) / n, k = src.maxRange / dataRange;
  h = h.map((v) => mean + (v - mean) * k);
  console.log(`scaled down from ${dataRange.toFixed(1)} m to the ${src.maxRange} m cap`);
}
if (src.range) {
  const mean = h.reduce((s, v) => s + v, 0) / n, k = src.range / dataRange;
  h = h.map((v) => mean + (v - mean) * k);
}

// sharpen features the DEM blurs (see the header)
for (const f of src.features ?? []) {
  const i0 = Math.round(f.from / SAMPLE), i1 = Math.round(f.to / SAMPLE), L = (i1 - i0) * SAMPLE;
  const dh = at(h, i1) - at(h, i0), g0 = slope(h, i0), g1 = slope(h, i1);
  let iPk = i0;
  for (let i = i0; i <= i1; i++) if (Math.abs(slope(h, i)) > Math.abs(slope(h, iPk))) iPk = i;
  const dataPeak = Math.abs(slope(h, iPk));
  const c = Math.min(0.8, Math.max(0.2, (iPk - i0) / (i1 - i0)));
  const warp = Math.log(0.5) / Math.log(c); // puts the bump's peak at c
  // grade = linear blend of the end slopes + a bump; sharper bump (p) = higher peak
  const build = (p) => {
    const bump = (u) => Math.sin(Math.PI * u ** warp) ** p;
    let area = 0;
    const steps = i1 - i0;
    for (let k = 0; k < steps; k++) area += bump((k + 0.5) / steps) / steps;
    const A = (dh / L - (g0 + g1) / 2) / area;
    const grade = (u) => g0 * (1 - u) + g1 * u + A * bump(u);
    let peak = 0;
    for (let k = 0; k <= 200; k++) peak = Math.max(peak, Math.abs(grade(k / 200)));
    return { grade, peak };
  };
  let lo = 1, hi = 40;
  for (let it = 0; it < 50; it++) {
    const mid = (lo + hi) / 2;
    if (build(mid).peak < f.peakGrade) lo = mid;
    else hi = mid;
  }
  const { grade, peak } = build(lo);
  // integrate the new grade from the start of the window (sub-stepped)
  let y = at(h, i0);
  for (let i = i0 + 1; i <= i1; i++) {
    for (let k = 0; k < 10; k++) y += grade((i - i0 - 1 + (k + 0.5) / 10) / (i1 - i0)) * SAMPLE / 10;
    h[((i % n) + n) % n] = y;
  }
  console.log(`${f.name}: ${dh.toFixed(1)} m over ${L} m, peak grade ${(peak * 100).toFixed(1)}% (terrain data ${(dataPeak * 100).toFixed(1)}%)`);
}

// bridges: where the centreline crosses itself (Suzuka), make sure the upper road clears
// the lower one. The DEM is bare earth (bridges removed), so it only knows the ground.
// `bridge: { clearance, upper: 'later' | 'earlier', blend, lowerShare }`: road-to-road height
// at the crossing, which pass is on top, over how many metres each side the change is eased
// in, and how much of it the lower road takes (default half).
if (src.bridge) {
  const { clearance, upper = 'later', blend = 300, lowerShare = 0.5 } = src.bridge;
  const segX = (i, j) => {
    const a = (k) => [P.px[k % P.N], P.pz[k % P.N]];
    const [p1, p2, p3, p4] = [a(i), a(i + 1), a(j), a(j + 1)];
    const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0;
  };
  for (let i = 0; i < P.N; i++) {
    for (let j = i + 20; j < P.N; j++) {
      if (P.N - j + i < 20 || !segX(i, j)) continue;
      const si = i * P.ds, sj = j * P.ds;
      const [sUp, sLo] = upper === 'later' ? [sj, si] : [si, sj];
      const iu = Math.round(sUp / SAMPLE), il = Math.round(sLo / SAMPLE);
      const gap = at(h, iu) - at(h, il);
      const need = clearance - gap;
      const r = Math.round(blend / SAMPLE);
      if (need > 0) {
        for (let k = -r; k <= r; k++) {
          const w = 0.5 * (1 + Math.cos((Math.PI * k) / r)) * need;
          h[(((iu + k) % n) + n) % n] += w * (1 - lowerShare);
          h[(((il + k) % n) + n) % n] -= w * lowerShare;
        }
      }
      console.log(`bridge at s=${sUp.toFixed(0)} over s=${sLo.toFixed(0)}: ${gap.toFixed(1)} m apart in the data, ${Math.max(gap, clearance).toFixed(1)} m after`);
    }
  }
}

const m = Math.round(P.length / STORE);
const out = [];
for (let k = 0; k < m; k++) {
  const f = (k / m) * n, i = Math.floor(f), t = f - i;
  out.push(+(at(h, i) * (1 - t) + at(h, i + 1) * t).toFixed(1));
}
const lo = Math.min(...out), hi = Math.max(...out);
console.log(`${def.name}: ${out.length} heights, ${lo} .. ${hi} m (range ${(hi - lo).toFixed(1)} m), start ${out[0]} m`);

const rows = [];
for (let k = 0; k < out.length; k += 12) rows.push('  ' + out.slice(k, k + 12).join(', ') + ',');
mkdirSync('src/tracks/elevation', { recursive: true });
writeFileSync(
  `src/tracks/elevation/${id}.js`,
  `// Generated by scripts/fetch-elevation.mjs: do not edit by hand.
// ${def.name} centreline height above sea level (m), evenly spaced around the lap from the
// start line (about every ${STORE} m), in the racing direction.
// Source: ${src.label}${src.provider ? ', road-surface median within ' + ROAD_R + ' m of the centreline' : ' via OpenTopoData'}, sampled every ${SAMPLE} m${src.gaps ? `, bridged over ${src.gaps.map(([a, b]) => `${a}-${b} m`).join(', ')}` : ''}${src.median ? `, ${src.median} m median filter` : ''}, smoothest profile within ±${src.tol} m of the data${src.smooth ? `, smoothed (sigma ${src.smooth} m)` : ''}.
// ${src.range ? `Calibrated to real-life figures: total range ${src.range} m (data ${dataRange.toFixed(1)} m)` : src.maxRange && dataRange > src.maxRange ? `Scaled down to a ${src.maxRange} m range (data ${dataRange.toFixed(1)} m)` : `Not calibrated: data range ${dataRange.toFixed(1)} m${src.checkRange ? ` (published ${src.checkRange} m)` : ''}`}${(src.features ?? []).map((f) => `; ${f.name} peak gradient ${f.peakGrade * 100}%`).join('')}${src.bridge ? `; roads ${src.bridge.clearance} m apart where they cross` : ''}.
// Range ${lo} .. ${hi} m.
export default [
${rows.join('\n')}
];
`,
);
console.log(`wrote src/tracks/elevation/${id}.js`);
