// Import a real circuit from OpenStreetMap and write src/tracks/<id>.js.
//
//   node scripts/import-track.mjs <id>        (or "all")
//
// Data (c) OpenStreetMap contributors, ODbL, via the Overpass API. Raw responses are
// cached in node_modules/.cache/osm so re-runs don't refetch.
//
// How a lap is found:
//  1. Fetch every highway=raceway way near the circuit plus, for street circuits, the
//     member ways of the circuit's OSM relation (type=circuit), and join them into a
//     graph (shared nodes, plus way ends snapped to a nearby node: mappers don't always
//     connect them).
//  2. Contract it to junctions, prune dead ends, and enumerate the simple cycles no
//     longer than the official lap + 20%. The lap is the cycle closest to the official
//     length that passes every `via` point (lat/lon, for circuits with several layouts
//     of similar length) and none of the `avoid` points.
//  3. Racing direction from the raceway ways' oneway tags (public roads' oneway tags
//     are road-traffic directions, so they are ignored), else the config's `dir`.
//  4. Start line: the circuit's raceway=finish (or start-finish) node (the timing line), else
//     raceway=start, else `start` (lat/lon), else abeam the middle of the pit lane.
//  5. Pit lane: raceway ways tagged as a pit lane (raceway=pit_lane/pitlane, service=pit_lane
//     or "pit" in the name), chained into the longest path that leaves and rejoins the
//     lap, oriented in the racing direction.
//     Corners tighter than `minRadius` (default 12.5 m) are eased locally: some OSM hairpins
//     are drawn as a curl tighter than the real kerb-to-kerb line. Parallel sections closer
//     than the game's road plus a wall each side (e.g. Baku's two carriageways of Neftchilar
//     Avenue, mapped as lane centrelines) are eased apart to share a median barrier.
//  6. Points are projected (equirectangular about the circuit) to metres with the start line
//     at the origin, lightly smoothed, and resampled densely in corners and sparsely on
//     straights (chord error ~0.3 m).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CIRCUITS } from './circuits.mjs';

const R = 6371008.8, d2r = Math.PI / 180;
const cacheDir = 'node_modules/.cache/osm';
mkdirSync(cacheDir, { recursive: true });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const arg = process.argv[2];
const ids = arg === 'all' ? Object.keys(CIRCUITS) : [arg];
if (!arg || ids.some((id) => !CIRCUITS[id])) {
  console.error(`Usage: node scripts/import-track.mjs <${Object.keys(CIRCUITS).join('|')}|all>`);
  process.exit(1);
}
for (const id of ids) await importTrack(id, CIRCUITS[id]);

async function overpass(key, query) {
  const f = `${cacheDir}/${key}.json`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(mirrors[tries % mirrors.length], {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'User-Agent': 'vibe-gp-track-import/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (r.ok) {
        const j = await r.json();
        writeFileSync(f, JSON.stringify(j));
        return j;
      }
      if (tries > 6) throw new Error(`Overpass ${r.status}`);
    } catch (e) {
      if (tries > 6) throw e;
    }
    await sleep(4000 * (tries + 1));
  }
}

async function importTrack(id, c) {
  const [lat0, lon0] = c.center;
  const rad = c.radius ?? 2500;
  const rels = [].concat(c.relation ?? []);
  const q = `[out:json][timeout:180];
(
  way["highway"="raceway"](around:${rad},${lat0},${lon0});
  ${rels.map((r) => `relation(${r});way(r);`).join('\n  ')}
  ${(c.extraWays ?? []).map((w) => `way(${w});`).join('\n  ')}
)->.w;
.w out body geom;
node(w.w)(if:count_tags()>0);
out body;`;
  const data = await overpass(id, q);
  const ways = data.elements.filter((e) => e.type === 'way' && e.geometry);
  const tagged = data.elements.filter((e) => e.type === 'node');
  const projLat = lat0;
  const proj = (la, lo) => [(lo - lon0) * d2r * R * Math.cos(projLat * d2r), (la - lat0) * d2r * R];

  // ---- graph
  const pos = new Map(); // node id -> [x, y]
  const adj = new Map(); // node id -> Map(neighbour -> { way, len })
  const link = (a, b, w) => {
    if (a === b) return;
    const [ax, ay] = pos.get(a), [bx, by] = pos.get(b);
    const len = Math.hypot(bx - ax, by - ay);
    if (!adj.has(a)) adj.set(a, new Map());
    if (!adj.has(b)) adj.set(b, new Map());
    adj.get(a).set(b, { way: w, len });
    adj.get(b).set(a, { way: w, len });
  };
  const skip = (w) => (c.skipWays ?? []).includes(w.id) || ['construction', 'proposed', 'abandoned'].includes(w.tags?.highway) || w.tags?.area === 'yes';
  const isPitWay = (w) => /pit/i.test(`${w.tags?.raceway ?? ''} ${w.tags?.service ?? ''} ${w.tags?.name ?? ''} ${w.tags?.['name:en'] ?? ''}`) || (c.pitWays ?? []).includes(w.id);
  const loopWays = ways.filter((w) => !skip(w) && !isPitWay(w));
  for (const w of ways) w.nodes.forEach((n, k) => pos.set(n, proj(w.geometry[k].lat, w.geometry[k].lon)));
  for (const w of loopWays) for (let k = 1; k < w.nodes.length; k++) link(w.nodes[k - 1], w.nodes[k], w);
  // snap loose way ends to a node within SNAP m on another way
  const SNAP = 4;
  const nodeIds = [...adj.keys()];
  for (const n of nodeIds) {
    if (adj.get(n).size !== 1) continue;
    const [x, y] = pos.get(n);
    let best = null, bd = SNAP;
    for (const m of nodeIds) {
      if (m === n || adj.get(n).has(m)) continue;
      const [mx, my] = pos.get(m);
      const d = Math.hypot(mx - x, my - y);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) link(n, best, { id: 0, tags: {} });
  }

  // prune dead ends repeatedly
  const deg = (n) => adj.get(n)?.size ?? 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of [...adj.keys()]) {
      if (deg(n) <= 1) {
        for (const m of adj.get(n).keys()) adj.get(m).delete(n);
        adj.delete(n);
        changed = true;
      }
    }
  }
  // contract to junctions: chains between nodes of degree != 2
  const junction = (n) => deg(n) !== 2;
  const chains = []; // { a, b, nodes, len, ways }
  const seenEdge = new Set();
  const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const starts = [...adj.keys()].filter(junction);
  // then any node left: rings with no junction (e.g. the whole lap when only other components branch)
  for (const n of adj.keys()) if (!junction(n)) starts.push(n);
  for (const a of starts) {
    for (const nb of adj.get(a).keys()) {
      if (seenEdge.has(ek(a, nb))) continue;
      const nodes = [a];
      let prev = a, cur = nb, len = 0;
      const wset = new Set();
      while (true) {
        const e = adj.get(prev).get(cur);
        seenEdge.add(ek(prev, cur));
        len += e.len;
        wset.add(e.way);
        nodes.push(cur);
        if (junction(cur) || cur === a) break;
        const next = [...adj.get(cur).keys()].find((m) => m !== prev);
        prev = cur;
        cur = next;
      }
      chains.push({ a, b: cur, nodes, len, ways: [...wset] });
    }
  }

  // ---- enumerate cycles
  const via = (c.via ?? []).map(([la, lo]) => proj(la, lo));
  const avoid = (c.avoid ?? []).map(([la, lo]) => proj(la, lo));
  const near = (chain, [x, y], r) => chain.nodes.some((n) => {
    const [nx, ny] = pos.get(n);
    return Math.hypot(nx - x, ny - y) < r;
  });
  const chainVia = chains.map((ch) => via.map((p) => near(ch, p, c.viaRadius ?? 30)));
  const chainAvoid = chains.map((ch) => avoid.some((p) => near(ch, p, 25)));
  const byNode = new Map();
  chains.forEach((ch, k) => {
    for (const n of [ch.a, ch.b]) {
      if (!byNode.has(n)) byNode.set(n, []);
      byNode.get(n).push(k);
    }
  });
  const maxLen = c.realLength * 1.2;
  let best = null, count = 0;
  const used = new Uint8Array(chains.length);
  const onPath = new Set();
  const consider = (cyc, len) => {
    count++;
    const hit = via.map((_, v) => cyc.some((k) => chainVia[k][v]));
    if (!hit.every(Boolean)) return;
    const score = Math.abs(len - c.realLength);
    if (!best || score < best.score) best = { cyc: [...cyc], len, score };
  };
  // DFS from each chain's start, only through chains with a higher index than the first (each cycle once)
  for (let k0 = 0; k0 < chains.length && count < 2e6; k0++) {
    if (chainAvoid[k0]) continue;
    const ch0 = chains[k0];
    if (ch0.a === ch0.b) { consider([k0], ch0.len); continue; }
    const start = ch0.a;
    const cyc = [k0];
    used[k0] = 1;
    onPath.add(start);
    onPath.add(ch0.b);
    const dfs = (node, len) => {
      if (count > 2e6) return;
      for (const k of byNode.get(node) ?? []) {
        if (used[k] || k < k0 || chainAvoid[k]) continue;
        const ch = chains[k];
        const other = ch.a === node ? ch.b : ch.a;
        const L = len + ch.len;
        if (L > maxLen) continue;
        if (other === start) {
          cyc.push(k);
          consider(cyc, L);
          cyc.pop();
          continue;
        }
        if (onPath.has(other)) continue;
        used[k] = 1;
        onPath.add(other);
        cyc.push(k);
        dfs(other, L);
        cyc.pop();
        onPath.delete(other);
        used[k] = 0;
      }
    };
    dfs(ch0.b, ch0.len);
    onPath.clear();
    used[k0] = 0;
  }
  if (!best) throw new Error(`${id}: no lap found (${chains.length} chains, ${count} cycles)`);

  // ---- walk the cycle into a node list
  let loop = [];
  {
    const first = chains[best.cyc[0]];
    let node = first.a;
    for (const k of best.cyc) {
      const ch = chains[k];
      const seq = ch.a === node ? ch.nodes : [...ch.nodes].reverse();
      loop.push(...seq.slice(0, -1));
      node = seq[seq.length - 1];
    }
  }
  // direction: oneway raceway ways vote
  let vote = 0;
  const idxOf = new Map(loop.map((n, k) => [n, k]));
  for (const w of loopWays) {
    if (w.tags?.highway !== 'raceway' || !['yes', '-1'].includes(w.tags?.oneway)) continue;
    const sgn = w.tags.oneway === '-1' ? -1 : 1;
    for (let k = 1; k < w.nodes.length; k++) {
      const a = idxOf.get(w.nodes[k - 1]), b = idxOf.get(w.nodes[k]);
      if (a === undefined || b === undefined) continue;
      const d = (b - a + loop.length) % loop.length;
      if (d === 1) vote += sgn;
      else if (d === loop.length - 1) vote -= sgn;
    }
  }
  const area = (pts) => pts.reduce((s, [x, y], k) => { const [x2, y2] = pts[(k + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0) / 2;
  const cwNow = area(loop.map((n) => pos.get(n))) < 0;
  let reverse = false, dirNote;
  if (vote !== 0) {
    reverse = vote < 0;
    const cw = reverse ? !cwNow : cwNow;
    dirNote = `oneway tags (${Math.abs(vote)} segments): ${cw ? 'clockwise' : 'anticlockwise'}`;
    if (c.dir && (c.dir === 'cw') !== cw) console.warn(`  !! ${id}: oneway tags say ${cw ? 'cw' : 'ccw'} but config says ${c.dir}; using the config`);
    if (c.dir) reverse = (c.dir === 'cw') !== cwNow;
  } else {
    if (!c.dir) throw new Error(`${id}: no oneway tags, set dir`);
    reverse = (c.dir === 'cw') !== cwNow;
    dirNote = `config: ${c.dir === 'cw' ? 'clockwise' : 'anticlockwise'}`;
  }
  if (reverse) loop.reverse();
  let pts = loop.map((n) => pos.get(n));

  // densify to ~2 m, light smoothing (closed)
  const dens = densify(pts, 2, true);
  const minR = c.minRadius ?? 12.5;
  const sm = limitRadius(separate(limitRadius(smoothClosed(dens, c.smooth ?? 2), minR), c.minGap ?? (c.width ?? 14) + 7.5), minR);
  const L = polyLen(sm, true);

  // ---- pit lane
  let pitPts = null, pitNote = 'none';
  if (c.pit !== false) {
    const pitWays = ways.filter((w) => !skip(w) && isPitWay(w) && !(c.skipPitWays ?? []).includes(w.id));
    if (pitWays.length) {
      const padj = new Map();
      const plink = (a, b) => {
        if (!padj.has(a)) padj.set(a, new Set());
        if (!padj.has(b)) padj.set(b, new Set());
        padj.get(a).add(b);
        padj.get(b).add(a);
      };
      for (const w of pitWays) for (let k = 1; k < w.nodes.length; k++) plink(w.nodes[k - 1], w.nodes[k]);
      // the longest simple path through the lane graph (small graphs: brute force from each end)
      const ends = [...padj.keys()].filter((n) => padj.get(n).size === 1);
      const plen = (a, b) => Math.hypot(pos.get(a)[0] - pos.get(b)[0], pos.get(a)[1] - pos.get(b)[1]);
      let bestPath = null, bestLen = 0;
      for (const s of ends.length ? ends : [...padj.keys()].slice(0, 1)) {
        // Dijkstra-free: longest path via DFS with a budget
        let budget = 20000;
        const path = [s], seen = new Set([s]);
        const go = (n, len) => {
          if (--budget < 0) return;
          if (len > bestLen && padj.get(n).size === 1 && n !== s) { bestLen = len; bestPath = [...path]; }
          for (const m of padj.get(n)) {
            if (seen.has(m)) continue;
            seen.add(m); path.push(m);
            go(m, len + plen(n, m));
            path.pop(); seen.delete(m);
          }
        };
        go(s, 0);
      }
      if (bestPath && bestLen > 150) {
        let pp = bestPath.map((n) => pos.get(n));
        // orient: the lane runs the same way as the lap, so going from its entry to its exit
        // covers less than half a lap (judged at the ends: mid-lane the nearest bit of track
        // can be another section, e.g. Monaco's lane between the start straight and the Pool)
        const qa = nearestOn(sm, pp[0]), qb = nearestOn(sm, pp[pp.length - 1]);
        let d = qb.s - qa.s;
        d = ((d % L) + L * 1.5) % L - L / 2;
        if (d < 0) pp.reverse();
        // make the ends meet the lap: extend each end to the nearest lap point if it stops short
        // (to 4 m from the centreline, not onto it, so the lane's walls start clear of the far side)
        const toward = (q, p) => {
          const f = Math.min(1, 4 / q.d);
          return [q.p[0] + (p[0] - q.p[0]) * f, q.p[1] + (p[1] - q.p[1]) * f];
        };
        // pitTrim: [entry m, exit m] cut off the lane's ends (e.g. Yas Marina's pit exit, which
        // tunnels under the track); a cut end then meets the lap at a shallow angle (4x its offset)
        const [trim0, trim1] = c.pitTrim ?? [0, 0];
        if (trim1 > 0) pp = densify(pp, 2, false).slice(0, -Math.round(trim1 / 2));
        if (trim0 > 0) pp = densify(pp, 2, false).slice(Math.round(trim0 / 2));
        const lapAt = (s) => sm[Math.round((((s % L) + L) % L) / (L / sm.length)) % sm.length];
        const q0 = nearestOn(sm, pp[0]), q1 = nearestOn(sm, pp[pp.length - 1]);
        if (q0.d > 5 && q0.d < 60) pp.unshift(trim0 > 0 ? lapAt(q0.s - 4 * q0.d) : toward(q0, pp[0]));
        if (q1.d > 5 && q1.d < 60) pp.push(trim1 > 0 ? lapAt(q1.s + 4 * q1.d) : toward(q1, pp[pp.length - 1]));
        pitPts = densify(pp, 2, false);
        pitPts = smoothOpen(pitPts, 1.5);
        pitNote = `${pitWays.length} way(s), ${bestLen.toFixed(0)} m`;
      }
    }
  }

  // ---- start line
  let startP = null, startNote;
  const onLoop = (n) => nearestOn(sm, pos.get(n)).d < 15;
  const fin = tagged.filter((n) => ['finish', 'start-finish', 'start_finish', 'finish_line'].includes(n.tags?.raceway) && pos.has(n.id) && onLoop(n.id));
  const sta = tagged.filter((n) => n.tags?.raceway === 'start' && pos.has(n.id) && onLoop(n.id));
  if (c.start) {
    startP = proj(...c.start);
    startNote = 'config';
  } else if (fin.length || sta.length) {
    const n = (fin.length ? fin : sta)[0];
    startP = pos.get(n.id);
    startNote = `OSM node ${n.id} raceway=${n.tags.raceway}`;
  } else if (pitPts) {
    startP = pitPts[Math.floor(pitPts.length / 2)];
    startNote = 'abeam the middle of the pit lane';
  } else {
    startP = sm[0];
    startNote = 'arbitrary';
  }
  const qs = nearestOn(sm, startP);
  let s0 = (qs.s + (c.startShift ?? 0) + L) % L;
  const k0 = Math.round(s0 / (L / sm.length)) % sm.length;
  const lap = [...sm.slice(k0), ...sm.slice(0, k0)];
  const origin = lap[0];
  // geo origin of the start line (the equirectangular inverse, scale at projLat)
  const geo = {
    lat: +(lat0 + origin[1] / R / d2r).toFixed(7),
    lon: +(lon0 + origin[0] / (R * Math.cos(projLat * d2r)) / d2r).toFixed(7),
    projLat: +projLat.toFixed(4),
  };
  const rel = (p) => [+(p[0] - origin[0]).toFixed(1), +(p[1] - origin[1]).toFixed(1)];

  // ---- control points: spacing from local radius
  const ctrl = resample(lap);
  const points = ctrl.map(rel);
  const pitOut = pitPts ? resampleOpen(pitPts).map(rel) : null;

  // corner names from named raceway ways on the lap
  const corners = [];
  if (c.corners) {
    for (const [name, la, lo] of c.corners) {
      const p = proj(la, lo).map((v, k) => v - origin[k]);
      let bk = 0, bd = Infinity;
      points.forEach((pt, k) => { const d = Math.hypot(pt[0] - p[0], pt[1] - p[1]); if (d < bd) { bd = d; bk = k; } });
      corners.push({ name, at: bk });
    }
  } else {
    const named = new Map();
    for (const w of loopWays) {
      const nm = w.tags?.['name:en'] && /[^\x00-\x7f]/.test(w.tags.name ?? '') ? w.tags['name:en'] : w.tags?.name;
      if (w.tags?.highway !== 'raceway' || !nm || /circuit|pit|straight|^rettifilo|reta |autodrom|track|course|strecke|piste|long lap/i.test(nm.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) continue;
      // the way must run along the lap, not just touch it at a junction
      const along = (k) => {
        const a = idxOf.get(w.nodes[k - 1]), b = idxOf.get(w.nodes[k]);
        return a !== undefined && b !== undefined && [1, loop.length - 1].includes(Math.abs(a - b));
      };
      if (!w.nodes.some((_, k) => k > 0 && along(k))) continue;
      const wp = w.nodes.filter((n) => idxOf.has(n)).map((n) => pos.get(n)).map((v) => [v[0] - origin[0], v[1] - origin[1]]);
      const mid = wp[Math.floor(wp.length / 2)];
      let bk = 0, bd = Infinity;
      points.forEach((pt, k) => { const d = Math.hypot(pt[0] - mid[0], pt[1] - mid[1]); if (d < bd) { bd = d; bk = k; } });
      if (!named.has(nm)) named.set(nm, bk);
    }
    for (const [name, at] of named) corners.push({ name, at });
    corners.sort((a, b) => a.at - b.at);
  }

  const wayIds = [...new Set(best.cyc.flatMap((k) => chains[k].ways.map((w) => w.id)).filter(Boolean))];
  console.log(`== ${c.name}: lap ${L.toFixed(0)} m (official ${c.realLength} m, ${(((L - c.realLength) / c.realLength) * 100).toFixed(1)}%), ` +
    `${best.cyc.length} chains of ${chains.length}, ${count} cycles searched; direction ${dirNote}; start ${startNote}; pit ${pitNote}; ${points.length} control points`);

  writeTrack(id, c, { points, pit: pitOut, geo, corners, wayIds, rels, L });
}

function writeTrack(id, c, { points, pit, geo, corners, wayIds, rels }) {
  const fmt = (arr) => {
    const rows = [];
    for (let k = 0; k < arr.length; k += 8) rows.push('    ' + arr.slice(k, k + 8).map(([x, y]) => `[${x}, ${y}]`).join(', ') + ',');
    return rows.join('\n');
  };
  const hex = (v) => '0x' + v.toString(16).padStart(6, '0');
  const src = rels.length ? `relation ${rels.join(', ')} ("${c.osmName ?? c.name}") and its member ways` : `highway=raceway ways ${wayIds.slice(0, 12).join(', ')}${wayIds.length > 12 ? ', ...' : ''}`;
  const desc = c.about.trim().split('\n').map((l) => `// ${l.trim()}`).join('\n');
  const out = `// Generated by scripts/import-track.mjs from scripts/circuits.mjs: edit those, not this file.
${desc}
//
// Reference: OpenStreetMap ${src} ((c) OpenStreetMap contributors, ODbL), chained into the
// lap, projected to local metres (equirectangular at ${geo.projLat}) with the origin on the start
// line, lightly smoothed and resampled (denser through corners).
import elevation from './elevation/${id}.js';

export default {
  id: '${id}',
  name: ${JSON.stringify(c.name)},
  country: ${JSON.stringify(c.country)},
  realLength: ${c.realLength}, // metres, official lap length
  width: ${c.width ?? 14},${c.minRadius ? `
  minRadius: ${c.minRadius}, // the tightest real corner (scripts/track-check.mjs accepts down to this)` : ''}
  // projection origin of the points (the start line), for scripts/fetch-elevation.mjs
  geo: { lat: ${geo.lat}, lon: ${geo.lon}, projLat: ${geo.projLat} },
  elevation, // m above sea level around the lap (real terrain, see the generated file)
  // ${c.kerbNote}
  kerb: { colors: [${c.kerb.map(hex).join(', ')}] },
${c.night ? `  night: true, // ${c.night}
` : ''}  scenery: ${JSON.stringify(c.scenery ?? {}).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ').replace(/"/g, "'")},
  corners: [
${corners.map((k) => `    { name: ${JSON.stringify(k.name)}, at: ${k.at} },`).join('\n')}
  ],
  points: [
${fmt(points)}
  ],${pit ? `
  // pit lane from OSM, from where it leaves the track to where it rejoins
  pitlane: {
    points: [
${fmt(pit).replace(/^ {4}/gm, '      ')}
    ],
  },` : ''}
};
`;
  mkdirSync('src/tracks/elevation', { recursive: true });
  writeFileSync(`src/tracks/${id}.js`, out);
  // a flat placeholder until scripts/fetch-elevation.mjs has run
  if (!existsSync(`src/tracks/elevation/${id}.js`)) writeFileSync(`src/tracks/elevation/${id}.js`, '// Placeholder: run node scripts/fetch-elevation.mjs ' + id + '\nexport default [];\n');
}

// ---------------------------------------------------------------- polyline helpers

function polyLen(p, closed) {
  let s = 0;
  for (let k = 1; k < p.length; k++) s += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
  if (closed) s += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
  return s;
}

function densify(p, step, closed) {
  const out = [];
  const n = p.length, m = closed ? n : n - 1;
  for (let k = 0; k < m; k++) {
    const a = p[k], b = p[(k + 1) % n];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const c = Math.max(1, Math.ceil(d / step));
    for (let j = 0; j < c; j++) out.push([a[0] + ((b[0] - a[0]) * j) / c, a[1] + ((b[1] - a[1]) * j) / c]);
  }
  if (!closed) out.push(p[n - 1]);
  // evenly respace to exactly `step`
  return respace(out, step, closed);
}

function respace(p, step, closed) {
  const L = polyLen(p, closed);
  const n = Math.max(2, Math.round(L / step));
  const out = [];
  let k = 0, acc = 0;
  const seg = (i) => [p[i], p[(i + 1) % p.length]];
  const m = closed ? p.length : p.length - 1;
  for (let j = 0; j < (closed ? n : n + 1); j++) {
    const target = (j * L) / n;
    while (k < m - 1) {
      const [a, b] = seg(k);
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + d >= target) break;
      acc += d;
      k++;
    }
    const [a, b] = seg(k);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = Math.min(1, Math.max(0, (target - acc) / d));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function smoothClosed(p, sigmaSamples) {
  const n = p.length, r = Math.ceil(sigmaSamples * 3);
  return p.map((_, i) => {
    let sx = 0, sy = 0, sw = 0;
    for (let k = -r; k <= r; k++) {
      const w = Math.exp(-(k * k) / (2 * sigmaSamples * sigmaSamples));
      const q = p[(((i + k) % n) + n) % n];
      sx += w * q[0]; sy += w * q[1]; sw += w;
    }
    return [sx / sw, sy / sw];
  });
}

function smoothOpen(p, sigmaSamples) {
  const n = p.length, r = Math.ceil(sigmaSamples * 3);
  return p.map((q0, i) => {
    if (i === 0 || i === n - 1) return q0;
    const rr = Math.min(r, i, n - 1 - i);
    let sx = 0, sy = 0, sw = 0;
    for (let k = -rr; k <= rr; k++) {
      const w = Math.exp(-(k * k) / (2 * sigmaSamples * sigmaSamples));
      sx += w * p[i + k][0]; sy += w * p[i + k][1]; sw += w;
    }
    return [sx / sw, sy / sw];
  });
}

/**
 * Ease corners tighter than minRadius: repeatedly average each too-tight sample (and its
 * neighbours) with its neighbours, so only the curl itself moves, not the whole lap.
 */
function limitRadius(p, minRadius) {
  const n = p.length;
  let q = p.map((v) => [...v]);
  const curvAt = (i) => {
    const a = q[(i - 2 + n) % n], b = q[i], c = q[(i + 2) % n];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    return (2 * cross) / Math.max(1e-9, ab * bc * ca); // 1 / circumradius
  };
  for (let it = 0; it < 400; it++) {
    const tight = [];
    for (let i = 0; i < n; i++) if (curvAt(i) > 1 / minRadius) tight.push(i);
    if (!tight.length) break;
    const mark = new Uint8Array(n);
    for (const i of tight) for (let k = -4; k <= 4; k++) mark[(i + k + n) % n] = 1;
    q = q.map((v, i) => {
      if (!mark[i]) return v;
      const a = q[(i - 1 + n) % n], c = q[(i + 1) % n];
      return [(a[0] + 2 * v[0] + c[0]) / 4, (a[1] + 2 * v[1] + c[1]) / 4];
    });
  }
  return respace(q, polyLen(q, true) / n, true);
}

/**
 * Push apart sections of the lap that run side by side (parallel or opposite) closer than
 * minGap, centreline to centreline. Each sample moves away from the other section by part of
 * the shortfall; the displacement is smoothed along the lap so the line stays fair. Crossing
 * sections (Suzuka's bridge) are left alone: only near-parallel pairs are pushed.
 */
function separate(p, minGap) {
  if (!(minGap > 0)) return p;
  const n = p.length, step = polyLen(p, true) / n;
  let q = p.map((v) => [...v]);
  const cell = minGap * 2;
  for (let it = 0; it < 60; it++) {
    const grid = new Map();
    q.forEach(([x, y], i) => {
      const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    });
    const tan = (i) => {
      const a = q[(i - 2 + n) % n], b = q[(i + 2) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const dx = new Float64Array(n), dy = new Float64Array(n);
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const [x, y] = q[i], cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const ti = tan(i);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const j of grid.get(`${gx},${gy}`) ?? []) {
            const sd = Math.min(Math.abs(i - j), n - Math.abs(i - j)) * step;
            const ex = x - q[j][0], ey = y - q[j][1], d = Math.hypot(ex, ey);
            if (d >= minGap || sd < 3 * minGap + 30 || d < 1e-6) continue;
            const tj = tan(j);
            if (Math.abs(ti[0] * tj[0] + ti[1] * tj[1]) < 0.85) continue; // crossing, not side by side
            // push across the track direction only
            const nx = -ti[1], ny = ti[0], side = Math.sign(ex * nx + ey * ny) || 1;
            const push = ((minGap - d) / 2) * 0.5;
            dx[i] += nx * side * push;
            dy[i] += ny * side * push;
            worst = Math.max(worst, minGap - d);
          }
        }
      }
    }
    if (worst < 0.05) break;
    // smooth the displacement along the lap (about ±40 m) so the line eases out and back
    const sig = 20 / step, r = Math.ceil(sig * 3);
    const sx = new Float64Array(n), sy = new Float64Array(n);
    let wsum = 0;
    for (let k = -r; k <= r; k++) wsum += Math.exp(-(k * k) / (2 * sig * sig));
    for (let i = 0; i < n; i++) {
      if (!dx[i] && !dy[i]) continue;
      for (let k = -r; k <= r; k++) {
        const w = Math.exp(-(k * k) / (2 * sig * sig)) / wsum;
        const j = (((i + k) % n) + n) % n;
        sx[j] += dx[i] * w;
        sy[j] += dy[i] * w;
      }
    }
    // the smoothing spreads each push thinly: scale it back up so the peak matches
    let peakRaw = 0, peakSm = 0;
    for (let i = 0; i < n; i++) {
      peakRaw = Math.max(peakRaw, Math.hypot(dx[i], dy[i]));
      peakSm = Math.max(peakSm, Math.hypot(sx[i], sy[i]));
    }
    const gain = peakSm > 0 ? Math.min(8, peakRaw / peakSm) : 0;
    q = q.map(([x, y], i) => [x + sx[i] * gain, y + sy[i] * gain]);
  }
  return respace(q, polyLen(q, true) / n, true);
}

function nearestOn(p, [x, y]) {
  let bk = 0, bd = Infinity;
  for (let k = 0; k < p.length; k++) {
    const d = Math.hypot(p[k][0] - x, p[k][1] - y);
    if (d < bd) { bd = d; bk = k; }
  }
  const step = polyLen(p, true) / p.length;
  return { k: bk, s: bk * step, d: bd, p: p[bk] };
}

/** Curvature-adaptive control points from an evenly spaced (~2 m) closed polyline. */
function resample(p) {
  const n = p.length, step = polyLen(p, true) / n;
  const head = p.map((_, i) => {
    const a = p[(i - 2 + n) % n], b = p[(i + 2) % n];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  });
  const curv = head.map((_, i) => {
    let d = head[(i + 1) % n] - head[(i - 1 + n) % n];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) / (2 * step);
  });
  // max curvature over a ±20 m window, so spacing tightens before a corner
  const win = Math.round(20 / step);
  const kmax = curv.map((_, i) => {
    let m = 0;
    for (let k = -win; k <= win; k++) m = Math.max(m, curv[(((i + k) % n) + n) % n]);
    return m;
  });
  const out = [p[0]];
  let acc = 0;
  for (let i = 1; i < n; i++) {
    acc += step;
    const rad = 1 / Math.max(kmax[i], 1e-5);
    const want = Math.min(70, Math.max(6, Math.sqrt(2.4 * rad)));
    if (acc >= want) {
      out.push(p[i]);
      acc = 0;
    }
  }
  // drop the last point if it crowds the first
  if (acc < 4 && out.length > 3) out.pop();
  return out;
}

function resampleOpen(p) {
  const out = [p[0]];
  let acc = 0;
  const n = p.length;
  for (let i = 1; i < n - 1; i++) {
    acc += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    const a = p[Math.max(0, i - 3)], b = p[Math.min(n - 1, i + 3)], m = p[i];
    // turn over ±6 m
    const h1 = Math.atan2(m[1] - a[1], m[0] - a[0]), h2 = Math.atan2(b[1] - m[1], b[0] - m[0]);
    const turn = Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
    const want = turn > 0.06 ? 4 : turn > 0.02 ? 10 : 25;
    if (acc >= want) {
      out.push(m);
      acc = 0;
    }
  }
  out.push(p[n - 1]);
  return out;
}
