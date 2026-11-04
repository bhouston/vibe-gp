// Validate a track definition and simulate autopilot laps with the real car physics.
//
//   node scripts/track-check.mjs <trackId> [outDir]
//
// Prints layout stats and writes <outDir>/<trackId>.svg (default outDir: ./track-check)
// showing the road, pit lane, walls, start line (green), direction arrows and distance
// markers, plus <trackId>-pit.svg zoomed in on the pit lane. If the track has a pit
// lane, a second autopilot lap drives through it and reports the time lost.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRACKS } from '../src/tracks/index.js';
import { TrackPath, KERB_WIDTH, PIT } from '../src/trackPath.js';
import { CarPhysics, PARAMS } from '../src/physics.js';
import { formatTime } from '../src/race.js';
import { TEAMS, teamGarage } from '../src/teams.js';
import { PitStop } from '../src/pitStop.js';

const id = process.argv[2];
const outDir = process.argv[3] || 'track-check';
const def = TRACKS.find((t) => t.id === id);
if (!def) {
  console.error(`Unknown track "${id}". Known: ${TRACKS.map((t) => t.id).join(', ')}`);
  process.exit(1);
}

const P = new TrackPath(def);
const pit = P.pit;
const tight = P.tightest();
const b = P.bounds();
const problems = [];

console.log(`== ${def.name} (${def.id}) ==`);
console.log(`control points:   ${def.points.length}`);
console.log(`lap length:       ${P.length.toFixed(0)} m` + (def.realLength ? `  (real ${def.realLength} m, ${(((P.length - def.realLength) / def.realLength) * 100).toFixed(1)}%)` : ''));
console.log(`extent:           ${(b.maxX - b.minX).toFixed(0)} m E-W x ${(b.maxZ - b.minZ).toFixed(0)} m N-S`);
console.log(`tightest radius:  ${tight.radius.toFixed(1)} m at s=${tight.s.toFixed(0)} m`);
{
  let gi = 0, ci = 0, cr = 0;
  for (let i = 0; i < P.N; i++) {
    if (Math.abs(P.grade[i]) > Math.abs(P.grade[gi])) gi = i;
    if (P.vcurv[i] > P.vcurv[ci]) ci = i;
    if (P.vcurv[i] < P.vcurv[cr]) cr = i;
  }
  console.log(`elevation:        ${P.elevationRange.toFixed(1)} m range, steepest ${(P.grade[gi] * 100).toFixed(1)}% at s=${(gi * P.ds).toFixed(0)}` +
    (P.vcurv[ci] > 0 ? `, tightest dip R ${(1 / P.vcurv[ci]).toFixed(0)} m at s=${(ci * P.ds).toFixed(0)}` : '') +
    (P.vcurv[cr] < 0 ? `, tightest crest R ${(-1 / P.vcurv[cr]).toFixed(0)} m at s=${(cr * P.ds).toFixed(0)}` : ''));
  // crests a car would go weightless over at the speed it takes them
  const vlim = speedProfile(P, true);
  // the profile only limits braking: also cap how fast the car can accelerate out of corners
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i <= P.N; i++) vlim[i % P.N] = Math.min(vlim[i % P.N], Math.sqrt(vlim[i - 1] ** 2 + 2 * 8 * P.ds));
  }
  for (let i = 0; i < P.N; i++) {
    const v = Math.min(vlim[i], 95);
    if (v * v * -P.vcurv[i] > 9.81) {
      problems.push(`crest at s=${(i * P.ds).toFixed(0)} (R ${(-1 / P.vcurv[i]).toFixed(0)} m) unloads the car fully at ${(v * 3.6).toFixed(0)} km/h`);
      break;
    }
  }
}
{
  const m = (...arrs) => (arrs.reduce((n, a) => n + a.reduce((k, v) => k + (v > 0), 0), 0) * P.ds).toFixed(0);
  console.log(`run-off:          gravel ${m(P.gravelOutL, P.gravelOutR)} m of track side, sausage kerbs ${m(P.sausageL, P.sausageR)} m`);
  for (const w of P.runoffWarnings) problems.push(`run-off (src/tracks/runoff.js): ${w}`);
}
if (def.realLength && Math.abs(P.length - def.realLength) / def.realLength > 0.03) problems.push('lap length is more than 3% off the real length');
if (tight.radius < (def.minRadius ?? 12)) problems.push(`a corner is tighter than ${def.minRadius ?? 12} m radius (s=${tight.s.toFixed(0)}) — likely a kink or a control point out of order`);

// sections too close together for walls to fit between them
if (P.overlaps.length) {
  const seen = new Set();
  for (const o of P.overlaps) {
    const k = `${Math.round((o.i * P.ds) / 100)}-${Math.round((o.j * P.ds) / 100)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    problems.push(`sections at s=${(o.i * P.ds).toFixed(0)} and s=${(o.j * P.ds).toFixed(0)} are only ${o.d.toFixed(1)} m apart (centreline to centreline)`);
  }
}

// how much run-off survives (walls squeezed in by nearby sections / tight corners; pit wall excluded)
let squeezed = 0;
for (let i = 0; i < P.N; i++) {
  if (P.pitWall[i] || P.openL[i] || P.openR[i]) continue;
  if (Math.min(P.wallL[i], P.wallR[i]) < P.hw + KERB_WIDTH + 4) squeezed++;
}
console.log(`walls squeezed:   ${((squeezed / P.N) * 100).toFixed(1)}% of the lap has < 4 m run-off on a side`);

if (pit) {
  const side = pit.side > 0 ? 'left' : 'right';
  const metres = (a) => (a.reduce((s, v) => s + v, 0) * P.ds).toFixed(0);
  console.log(`pit lane:         ${pit.length.toFixed(0)} m on the ${side}, entry at s=${pit.entryS.toFixed(0)}, exit at s=${pit.exitS.toFixed(0)}`);
  console.log(`                  speed limit ${(PIT.speedLimit * 3.6).toFixed(0)} km/h over ${(pit.limitEnd - pit.limitStart).toFixed(0)} m, garages ${pit.garageStart >= 0 ? `${(pit.garageEnd - pit.garageStart).toFixed(0)} m (lap s ${pit.lapS(pit.garageStart).toFixed(0)}..${pit.lapS(pit.garageEnd).toFixed(0)})` : 'none'}`);
  console.log(`                  pit wall ${metres(P.pitWall)} m, merges ${metres(pit.side > 0 ? P.openL : P.openR)} m` + (pit.nudge > 0 ? `, lane moved out ${pit.nudge.toFixed(1)} m to fit a pit wall beside the ${P.width} m track` : ''));
  if (pit.garageStart < 0) problems.push('no straight stretch of pit lane long enough for garages');
  if (P.pitConflicts.length) problems.push(`the pit lane's outer wall comes within a wall of the track at ${P.pitConflicts.length} samples`);
  const closes = P.walls.filter((w) => w.kind === 'close').length;
  if (closes < 2) problems.push(`expected run-off closing walls at the pit entry and exit, found ${closes}`);
}

// --- autopilot laps ---
const sim = simulateLap(false);
report('autopilot lap:   ', sim);
if (!sim.completed) problems.push('autopilot could not complete a lap');
if (pit) {
  // the lane usually straddles the start line, so time an in-lap and out-lap together
  const ps = simulateLap(true, 2);
  report('2 laps via pits:', ps);
  if (!ps.completed) problems.push('autopilot could not complete a lap through the pit lane');
  else {
    console.log(`                  pit lane time loss: ${(ps.time - 2 * sim.time).toFixed(1)} s (drive-through), max ${(ps.pitVmax * 3.6).toFixed(0)} km/h in the limit zone`);
    if (ps.pitWallFrames > 0) problems.push(`wall contact while driving the pit lane (${ps.pitWallFrames} frames)`);
    if (ps.pitOffFrames > 0) problems.push(`left the asphalt while driving the pit lane (${ps.pitOffFrames} frames)`);
  }
  // every team pulls into its own box, stops, is serviced and drives out
  for (const team of TEAMS) {
    const k = teamGarage(team);
    const r = simulatePitStop(k);
    const where = r.box ? `box ${k + 1} (lane s ${r.box.s.toFixed(0)}, lap s ${pit.lapS(r.box.s).toFixed(0)})` : 'no box';
    console.log(`pit stop ${team.name.padEnd(9)} ${where}: ` + (r.serviced ? `stopped ${r.miss.toFixed(2)} m off the marks, ${r.duration.toFixed(1)} s stop, out of the lane ${r.exited ? 'ok' : 'NOT REACHED'}` : 'NOT SERVICED'));
    if (!r.box) problems.push(`${team.name} has no pit box (garage ${k + 1} of ${pit.garageCount})`);
    else if (!r.serviced) problems.push(`autopilot could not stop in ${team.name}'s pit box`);
    else if (!r.exited) problems.push(`autopilot could not leave ${team.name}'s pit box`);
    if (r.wallFrames > 0) problems.push(`wall contact during ${team.name}'s pit stop (${r.wallFrames} frames)`);
    if (r.offFrames > 0) problems.push(`left the asphalt during ${team.name}'s pit stop (${r.offFrames} frames)`);
  }
}

/**
 * Drive the pit lane from the speed-limit line, pull into box k, stop on the marks,
 * wait for the crew, and drive out to the end of the lane.
 */
function simulatePitStop(k) {
  const box = pit.box(k);
  if (!box) return { box: null };
  const s0 = pit.limitStart + 5;
  const car = new CarPhysics(P, pit.poseAt(s0));
  const stop = new PitStop();
  stop.setBox(pit, k);
  const dt = 1 / 120;
  const vpit = speedProfile(pit, false, (j) => (j * pit.ds >= pit.limitStart - 5 && j * pit.ds <= pit.limitEnd ? PIT.speedLimit - 1 : 95));
  let serviced = false, exited = false, miss = 0, wallFrames = 0, offFrames = 0;
  for (let t = 0; t < 120 && !exited; t += dt) {
    const pq = pit.query(car.position.x, car.position.z);
    // ease across into the working lane over the 30 m before the box, and back out after it
    const toBox = box.s - pq.s;
    const look = 5 + Math.abs(car.speed) * 0.25;
    const w = serviced ? 1 - smooth((pq.s - box.s) / 25) : smooth(1 - (toBox - 6) / 30);
    const tgt = pit.poseAt(pq.s + look, box.lat * w);
    // speed: limiter pace, then brake to stop with the car's origin on the box centre
    let vt = vpit[Math.min(pit.N - 1, Math.round(pq.s / pit.ds) + 2)];
    if (!serviced) vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * 5 * toBox)));
    const want = Math.atan2(tgt.x - car.position.x, tgt.z - car.position.z);
    const err = Math.atan2(Math.sin(want - car.yaw), Math.cos(want - car.yaw));
    let input = {
      steer: Math.max(-1, Math.min(1, err * 4)),
      throttle: car.speed < vt - 0.3 ? 1 : 0,
      brake: car.speed > vt + 0.5 || (!serviced && toBox < 0.3) ? 1 : 0,
    };
    input = stop.update(car, input, dt);
    if (stop.released) {
      serviced = true;
      const o = stop.offset(car);
      miss = Math.hypot(o.along, o.across);
    }
    car.step(input, dt);
    if (car.wallHit > 0.05) wallFrames++;
    if (car.surface === 'grass') offFrames++;
    if (serviced && pq.s > pit.limitEnd) exited = true;
  }
  return { box, serviced, exited, miss, duration: stop.lastStop ?? 0, wallFrames, offFrames };
}

function smooth(x) {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
}

console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join('\n- ')}` : '\nOK: no problems found');

mkdirSync(outDir, { recursive: true });
const svgFile = join(outDir, `${def.id}.svg`);
writeFileSync(svgFile, svg());
console.log(`\nwrote ${svgFile}`);
if (pit) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let j = 0; j < pit.N; j++) {
    x0 = Math.min(x0, pit.px[j]); x1 = Math.max(x1, pit.px[j]);
    z0 = Math.min(z0, pit.pz[j]); z1 = Math.max(z1, pit.pz[j]);
  }
  const f = join(outDir, `${def.id}-pit.svg`);
  writeFileSync(f, svg({ minX: x0 - 50, minZ: z0 - 50, maxX: x1 + 50, maxZ: z1 + 50 }));
  console.log(`wrote ${f}`);
}

function report(label, r) {
  console.log(`${label} ${r.completed ? formatTime(r.time) : 'DID NOT FINISH'}  top ${(r.vmax * 3.6).toFixed(0)} km/h, min ${(r.vmin * 3.6).toFixed(0)} km/h`);
  console.log(`                  wall contacts: ${r.wallFrames} frames, off track: ${((r.offFrames / r.frames) * 100).toFixed(1)}%`);
}

/** Corner-limited speed profile with braking zones, for a sampled path. */
function speedProfile(path, closed, cap = () => 95) {
  const g = (v) => PARAMS.baseGrip + PARAMS.downforceGrip * v * v;
  const n = path.N;
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = closed ? path.wrap(i - 2) : Math.max(0, i - 2), c = closed ? path.wrap(i + 2) : Math.min(n - 1, i + 2);
    const span = closed ? 4 : c - a;
    k[i] = span ? Math.abs(Math.atan2(Math.sin(path.heading[c] - path.heading[a]), Math.cos(path.heading[c] - path.heading[a]))) / (span * path.ds) : 0;
  }
  const vlim = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const kk = Math.max(k[i], 1e-5);
    let v = 10;
    for (let it = 0; it < 20; it++) v = Math.sqrt((g(v) * 0.85) / kk); // fixed point (downforce)
    vlim[i] = Math.min(v, cap(i));
  }
  for (let pass = 0; pass < (closed ? 2 : 1); pass++) {
    for (let i = n - 1; i >= 0; i--) {
      if (!closed && i === n - 1) continue;
      const j = closed ? path.wrap(i + 1) : i + 1;
      vlim[i] = Math.min(vlim[i], Math.sqrt(vlim[j] ** 2 + 2 * PARAMS.brakeDecel * 0.6 * path.ds));
    }
  }
  return vlim;
}

function simulateLap(viaPit, laps = 1) {
  const car = new CarPhysics(P, P.gridPose(0));
  car.damageOn = false; // a wall brush shouldn't skew the reference lap time
  const dt = 1 / 120;
  const vlim = speedProfile(P, true);
  const vpit = pit && speedProfile(pit, false, (j) => (j * pit.ds >= pit.limitStart - 5 && j * pit.ds <= pit.limitEnd ? PIT.speedLimit - 0.5 : 95));
  let time = 0, started = false, half = false, prevF = null, vmax = 0, vmin = Infinity;
  let wallFrames = 0, offFrames = 0, frames = 0, pitWallFrames = 0, pitOffFrames = 0, pitVmax = 0;
  let phase = 'main'; // main -> pit -> done (once, on the first timed lap)
  let lapsDone = 0;
  while (time < 600) {
    // tighter line-following in the narrow pit lane
    const look = phase === 'pit' ? 6 + Math.abs(car.speed) * 0.2 : 10 + Math.abs(car.speed) * 0.35;
    let tgt, vt;
    const toEntry = pit ? (((pit.entryS - car.trackS) % P.length) + P.length) % P.length : Infinity;
    if (viaPit && started && phase === 'main' && toEntry < look) phase = 'pit';
    if (phase === 'pit') {
      const pq = pit.query(car.position.x, car.position.z);
      if (pq.s + look >= pit.length) phase = 'done';
      tgt = pit.poseAt(pq.s + look);
      vt = vpit[Math.min(pit.N - 1, Math.round(pq.s / pit.ds) + 2)];
      if (car.inPitLane) pitVmax = Math.max(pitVmax, car.speed);
      if (car.wallHit > 0.05) pitWallFrames++;
      if (car.surface === 'grass') pitOffFrames++;
    }
    if (phase !== 'pit') {
      tgt = P.poseAt(car.trackS + look, 0);
      vt = vlim[P.wrap(car.trackIndex < 0 ? 0 : car.trackIndex)];
      // brake for the pit entry
      if (viaPit && started && phase === 'main' && toEntry < 400) vt = Math.min(vt, Math.sqrt(vpit[0] ** 2 + 2 * PARAMS.brakeDecel * 0.6 * toEntry));
    }
    const want = Math.atan2(tgt.x - car.position.x, tgt.z - car.position.z);
    const err = Math.atan2(Math.sin(want - car.yaw), Math.cos(want - car.yaw));
    const input = {
      steer: Math.max(-1, Math.min(1, err * 4)),
      throttle: car.speed < vt ? 1 : 0,
      brake: car.speed > vt + 2 ? 1 : 0,
    };
    car.step(input, dt);
    time += dt;
    frames++;
    if (car.wallHit > 0.05) wallFrames++;
    if (car.surface === 'grass') offFrames++;
    const f = car.trackS / P.length;
    if (prevF !== null) {
      if (f > 0.4 && f < 0.6) half = true;
      if (prevF > 0.9 && f < 0.1) {
        if (!started) {
          started = true;
          time = 0;
          half = false;
          vmax = 0;
          vmin = Infinity;
          wallFrames = offFrames = frames = 0;
        } else if (half && ++lapsDone === laps) return { completed: true, time, vmax, vmin, wallFrames, offFrames, frames, pitWallFrames, pitOffFrames, pitVmax };
        else half = false;
      }
    }
    prevF = f;
    if (started) {
      vmax = Math.max(vmax, car.speed);
      vmin = Math.min(vmin, car.speed);
    }
  }
  return { completed: false, time, vmax, vmin, wallFrames, offFrames, frames: Math.max(frames, 1), pitWallFrames, pitOffFrames, pitVmax };
}

function svg(view = null) {
  const v = view ?? { minX: b.minX - 60, minZ: b.minZ - 60, maxX: b.maxX + 60, maxZ: b.maxZ + 60 };
  const w = v.maxX - v.minX, h = v.maxZ - v.minZ;
  const vb = `${v.minX} ${v.minZ} ${w} ${h}`;
  const sw = Math.max(w, h) / (view ? 900 : 400);
  const poly = (pts, closed) => pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + (closed ? 'Z' : '');
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="1400" height="${Math.round((1400 * h) / w)}">`;
  out += `<rect x="${v.minX}" y="${v.minZ}" width="${w}" height="${h}" fill="#3f7a2c"/>`;
  out += `<path d="${P.svgPath(view ? 1 : 2)}" fill="none" stroke="#333" stroke-width="${P.width}" stroke-linejoin="round"/>`;
  if (pit) {
    // lane asphalt (fast lane + working lane on the garage side)
    const edge = (sgn) => {
      const pts = [];
      for (let j = 0; j < pit.N; j++) {
        const o = sgn === pit.outer ? pit.outerHw(j) : PIT.hw;
        pts.push([pit.px[j] + pit.leftX(j) * sgn * o, pit.pz[j] + pit.leftZ(j) * sgn * o]);
      }
      return pts;
    };
    const ring = [...edge(1), ...edge(-1).reverse()];
    out += `<path d="${poly(ring, true)}" fill="#4a4a4a"/>`;
    out += `<path d="${pit.svgPath(2)}" fill="none" stroke="#9cf" stroke-width="${sw * 0.6}" stroke-dasharray="${sw * 3} ${sw * 3}"/>`;
    for (const s of [pit.limitStart, pit.limitEnd]) {
      const a = pit.poseAt(s, PIT.hw), c = pit.poseAt(s, -PIT.hw);
      out += `<path d="M${a.x} ${a.z}L${c.x} ${c.z}" stroke="#fd0" stroke-width="${sw * 1.5}"/>`;
    }
  }
  // gravel traps (filled bands) and sausage kerbs (yellow)
  for (const [inA, outA, sgn] of [[P.gravelInL, P.gravelOutL, 1], [P.gravelInR, P.gravelOutR, -1]]) {
    for (let i = 0; i < P.N; i++) {
      const j = P.wrap(i + 1);
      if (!outA[i] || !outA[j]) continue;
      const q = (k, lat) => [P.px[k] + P.leftX(k) * sgn * lat, P.pz[k] + P.leftZ(k) * sgn * lat];
      out += `<path d="${poly([q(i, inA[i]), q(j, inA[j]), q(j, outA[j]), q(i, outA[i])], true)}" fill="#c8b68e"/>`;
    }
  }
  for (let i = 0; i < P.N; i++) {
    for (const [flags, sgn] of [[P.sausageL, 1], [P.sausageR, -1]]) {
      if (!flags[i]) continue;
      const o = sgn * (P.sausageLat + 0.3);
      out += `<circle cx="${(P.px[i] + P.leftX(i) * o).toFixed(1)}" cy="${(P.pz[i] + P.leftZ(i) * o).toFixed(1)}" r="${sw * 1.6}" fill="#fc0"/>`;
    }
  }
  const colours = { main: '#e33', pit: '#3af', close: '#f0f' };
  for (const l of P.walls) {
    out += `<path d="${poly(l.pts, l.closed)}" fill="none" stroke="${colours[l.kind]}" stroke-width="${sw}"${l.render ? '' : ` stroke-dasharray="${sw * 4} ${sw * 2}"`}/>`;
  }
  // kerbs
  for (let i = 0; i < P.N; i += view ? 1 : 3) {
    for (const [flags, sgn] of [[P.kerbL, 1], [P.kerbR, -1]]) {
      if (!flags[i]) continue;
      const o = sgn * (P.hw + KERB_WIDTH / 2);
      out += `<circle cx="${(P.px[i] + P.leftX(i) * o).toFixed(1)}" cy="${(P.pz[i] + P.leftZ(i) * o).toFixed(1)}" r="${sw * 0.8}" fill="#fff"/>`;
    }
  }
  // distance markers + direction arrows
  const step = view ? 50 : 250;
  for (let s = step; s < P.length; s += step) {
    const p = P.poseAt(s);
    if (view && (p.x < v.minX || p.x > v.maxX || p.z < v.minZ || p.z > v.maxZ)) continue;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const L = sw * 10;
    out += `<path d="M${p.x - fx * L + fz * L * 0.6} ${p.z - fz * L - fx * L * 0.6}L${p.x + fx * L} ${p.z + fz * L}L${p.x - fx * L - fz * L * 0.6} ${p.z - fz * L + fx * L * 0.6}" fill="none" stroke="#ffd400" stroke-width="${sw}"/>`;
    out += `<text x="${p.x + fz * sw * 25}" y="${p.z - fx * sw * 25}" font-size="${sw * 9}" fill="#fff" font-family="sans-serif">${s}</text>`;
  }
  const st = P.poseAt(0);
  out += `<circle cx="${st.x}" cy="${st.z}" r="${sw * 6}" fill="#0f0"/>`;
  out += `<text x="${v.minX + sw * 10}" y="${v.minZ + sw * 20}" font-size="${sw * 14}" fill="#fff" font-family="sans-serif">${def.name}: ${P.length.toFixed(0)} m, north up, green = start; walls red, pit lane walls blue (dashed = garage fronts), closing walls magenta; gravel tan, sausage kerbs yellow</text>`;
  return out + '</svg>';
}
