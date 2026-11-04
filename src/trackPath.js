// Pure track-path maths: sampling a closed centreline, curvature, kerb placement,
// wall clearance and nearest-point queries. No rendering, so Node scripts can use it.
//
// Track definition format (see src/tracks/*.js):
//   points: [[x, y], ...] closed loop of centreline control points in metres,
//           map coordinates with +x = east and +y = north. points[0] is the
//           start/finish line and the order of points is the racing direction.
//   width:  asphalt width in metres (default 14)
//   elevation (optional): [h, ...] centreline heights in metres, evenly spaced around
//           the lap from the start line. The road is level across its width; world
//           heights are relative to the start line (py = 0 there).
//   kerb (optional): { colors: [a, b] } the two kerb stripe colours (default red/white)
//   land.banking (optional, src/tracks/land/<id>.js): banked corners. The road tilts about
//           its centreline, out to the kerb's outer edge; the run-off beyond is level with
//           that edge (roadY). Everything else in this file is the centreline height.
//   pitlane (optional): { points: [[x, y], ...] } open polyline of the pit lane's
//           centreline in the same map coordinates, in the driving direction, from
//           the point where it leaves the track to the point where it rejoins.
//
// World mapping: world.x = x, world.z = -y (so north is -Z, and a top-down view
// with -Z up matches the map).
//
// Barriers are explicit polylines (this.walls): the two main walls, opened where the
// pit lane merges, pulled in to form the pit wall where the lane runs beside the
// track, plus the pit lane's outer wall and short closing walls at the merges. The
// car collides against their segments (wallContact), so any layout works.
import { CatmullRomCurve3, Vector3 } from 'three/webgpu';
import { RUNOFF } from './tracks/runoff.js';
import { speedProfile, findCorners, wantedWalls, clearWidened, autoSurfaces } from './runoffPlan.js';

export const KERB_WIDTH = 1.6;
export const WALL_THICKNESS = 0.6;
export const DEFAULT_RUNOFF = 14;
const KERB_RADIUS = 320; // corners tighter than this get kerbs (m)
export const TYRE_DEPTH = 2.1; // depth of a tyre barrier stacked against the wall (m)
const TYRE_RADIUS = 300; // corners tighter than this get tyre barriers on the outside (m)
// Sections further apart in height than this cross on a bridge (Suzuka's figure of eight):
// they don't squeeze each other's walls, and their walls don't collide with each other.
export const GRADE_SEP = 4;
const BRIDGE_WALL = 3.5; // run-off (m) beside each road where the two cross
// sausage kerb: a raised yellow strip behind the painted kerb, its inner edge `gap` past
// the kerb's outer edge (m)
export const SAUSAGE = { gap: 0.15, width: 0.45, height: 0.11 };

export const PIT = {
  hw: 3.5, // half width of the pit lane's fast lane (m)
  apron: 5, // working lane in front of the garages (m)
  speedLimit: 80 / 3.6, // m/s
  wallGap: 1.6, // gap between track edge and pit lane edge needed for a pit wall (m)
  wallClear: 0.3, // outer wall face distance outside the lane edge (m)
  garages: 11, // one per team on the grid
  garagePitch: 24, // m of frontage per garage
  // pit box painted on the working lane in front of each team's garage; the car's
  // origin stops on its centre with the front axle on the stop line
  box: { length: 7.2, width: 3.4, stopLine: 1.75 },
  boxTol: { along: 1.6, across: 1.1, yaw: 0.45 }, // how well the car must stop to be "in the box"
};

export class TrackPath {
  constructor(def) {
    this.def = def;
    this.width = def.width ?? 14;
    this.hw = this.width / 2;
    this.runoff = def.runoff ?? DEFAULT_RUNOFF;
    this.sample();
    this.sampleElevation();
    this.computeKerbs();
    this.computeBanking();
    this.pit = def.pitlane ? new PitPath(this, def.pitlane) : null;
    this.computeWalls();
    this.applyPitWalls();
    this.computeTyreBarriers();
    this.computeRunoff();
    this.buildWallLines();
    this.buildWallIndex();
  }

  sample() {
    const pts = this.def.points.map(([x, y]) => new Vector3(x, 0, -y));
    const curve = new CatmullRomCurve3(pts, true, 'centripetal');
    const length = curve.getLength();
    const N = Math.max(200, Math.round(length / 2));
    const sp = curve.getSpacedPoints(N);
    sp.pop(); // closed curve repeats the first point
    this.N = N;
    this.length = length;
    this.ds = length / N;
    this.px = new Float64Array(N);
    this.pz = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.px[i] = sp[i].x;
      this.pz[i] = sp[i].z;
    }
    // tangent (unit), left normal, heading (yaw: forward = (sin, cos))
    this.tx = new Float64Array(N);
    this.tz = new Float64Array(N);
    this.heading = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = this.wrap(i - 1), b = this.wrap(i + 1);
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
      this.heading[i] = Math.atan2(this.tx[i], this.tz[i]);
    }
    // signed curvature: + = turning left (yaw increasing)
    const raw = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const d = angleDiff(this.heading[this.wrap(i + 1)], this.heading[this.wrap(i - 1)]);
      raw[i] = d / (2 * this.ds);
    }
    this.curvature = boxFilter(raw, 3);
  }

  wrap(i) {
    return ((i % this.N) + this.N) % this.N;
  }

  /**
   * Heights along the lap: py (m, relative to the start line), grade (dh/ds) and
   * vertical curvature vcurv (d²h/ds², 1/m; + = a dip that compresses the car).
   */
  sampleElevation() {
    const N = this.N, e = this.def.elevation;
    this.py = new Float64Array(N);
    if (e?.length > 3) {
      const n = e.length, at = (k) => e[((k % n) + n) % n] - e[0];
      for (let i = 0; i < N; i++) {
        const f = (i / N) * n, k = Math.floor(f), t = f - k;
        // periodic Catmull-Rom through the stored heights
        const p0 = at(k - 1), p1 = at(k), p2 = at(k + 1), p3 = at(k + 2);
        this.py[i] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      }
    }
    this.grade = new Float64Array(N);
    const curv = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = this.py[this.wrap(i - 1)], b = this.py[i], c = this.py[this.wrap(i + 1)];
      this.grade[i] = (c - a) / (2 * this.ds);
      curv[i] = (a - 2 * b + c) / (this.ds * this.ds);
    }
    this.vcurv = boxFilter(curv, Math.max(1, Math.round(10 / this.ds)));
    let lo = Infinity, hi = -Infinity;
    for (const h of this.py) {
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    this.elevationRange = hi - lo;
  }

  /** Interpolated per-sample value at lap distance s (wrapped). */
  lerpAt(arr, s) {
    const f = (((s % this.length) + this.length) % this.length) / this.ds;
    const i = Math.floor(f) % this.N;
    const t = f - Math.floor(f);
    return arr[i] + (arr[this.wrap(i + 1)] - arr[i]) * t;
  }

  /** Road height `lat` metres left of the centreline (the centreline itself by default). */
  heightAt(s, lat = 0) {
    const h = this.lerpAt(this.py, s);
    return lat === 0 ? h : h + this.lerpAt(this.bank, s) * Math.min(this.bankEdge, Math.max(-this.bankEdge, lat));
  }
  /** Rise of the road per metre to the left at s, at lateral offset lat (0 on the level run-off). */
  bankAt(s, lat = 0) {
    return Math.abs(lat) < this.bankEdge ? this.lerpAt(this.bank, s) : 0;
  }
  /** Ground height at sample i, `lat` metres left of the centreline. */
  roadY(i, lat) {
    return this.py[i] + this.bank[i] * Math.min(this.bankEdge, Math.max(-this.bankEdge, lat));
  }
  /** Unit normal of the road surface at sample i, along and across (the tilted part). */
  roadNormal(i) {
    const b = this.bank[i], g = this.grade[i];
    const x = -g * this.tx[i] - b * this.leftX(i), z = -g * this.tz[i] - b * this.leftZ(i);
    const l = Math.hypot(x, 1, z);
    return [x / l, 1 / l, z / l];
  }
  gradeAt(s) {
    return this.lerpAt(this.grade, s);
  }
  vcurvAt(s) {
    return this.lerpAt(this.vcurv, s);
  }

  /** Left normal at sample i (perpendicular to travel, pointing to the driver's left). */
  leftX(i) {
    return this.tz[i];
  }
  leftZ(i) {
    return -this.tx[i];
  }

  computeKerbs() {
    const N = this.N;
    const flag = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (Math.abs(this.curvature[i]) > 1 / KERB_RADIUS) flag[i] = 1;
    // extend each kerb run a little before and after the corner
    const ext = Math.round(14 / this.ds);
    this.kerb = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!flag[i]) continue;
      for (let k = -ext; k <= ext; k++) this.kerb[this.wrap(i + k)] = 1;
    }
  }

  /**
   * Wall offsets (distance from centreline to the wall's centre) for each side.
   * Starts at the default run-off, then shrinks to avoid (a) the inside of tight
   * corners folding over itself and (b) intruding on other parts of the circuit.
   */
  /**
   * How much the run-off widens on the outside of fast corners: runoff.js `widen`, else
   * none where the track sets its own run-off (a street circuit), less in a city.
   */
  widenScale() {
    const w = (this.def.surfaces ?? RUNOFF[this.def.id])?.widen;
    if (w !== undefined) return w;
    return this.def.runoff !== undefined ? 0 : this.def.scenery?.city ? 0.4 : 1;
  }

  computeWalls() {
    const N = this.N;
    const base = this.hw + KERB_WIDTH + this.runoff;
    const minWall = this.hw + KERB_WIDTH + 1.5;
    // the default run-off, widened on the outside of corners by how fast cars get there
    this.speedEst = speedProfile(this);
    this.turns = findCorners(this, this.speedEst);
    const want = wantedWalls(this, this.turns, this.widenScale());
    const wl = Float64Array.from(want.L);
    const wr = Float64Array.from(want.R);
    // measured run-off widths (track edge to barrier face), later entries winning
    this.resolveEntries(this.surfaceSpec().width, (i0, sgn, a, b, e) => {
      const w = sgn > 0 ? wl : wr;
      for (let d = a; d <= b; d++) w[this.wrap(i0 + d)] = this.hw + e[4] + WALL_THICKNESS / 2;
    });
    for (let i = 0; i < N; i++) {
      const k = this.curvature[i];
      if (Math.abs(k) > 1e-6) {
        const lim = 0.85 / Math.abs(k);
        if (k > 0) wl[i] = Math.min(wl[i], lim);
        else wr[i] = Math.min(wr[i], lim);
      }
    }
    // clearance against other sections of the circuit (spatial hash)
    const cell = 50;
    const grid = new Map();
    const key = (cx, cz) => `${cx},${cz}`;
    for (let i = 0; i < N; i++) {
      const kk = key(Math.floor(this.px[i] / cell), Math.floor(this.pz[i] / cell));
      if (!grid.has(kk)) grid.set(kk, []);
      grid.get(kk).push(i);
    }
    this.overlaps = []; // places where two sections are too close to fit walls
    this.bridge = new Uint8Array(N); // 1 where this section passes over another
    for (let i = 0; i < N; i++) {
      const cx = Math.floor(this.px[i] / cell), cz = Math.floor(this.pz[i] / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gz = cz - 1; gz <= cz + 1; gz++) {
          const list = grid.get(key(gx, gz));
          if (!list) continue;
          for (const j of list) {
            const dx = this.px[j] - this.px[i], dz = this.pz[j] - this.pz[i];
            const d = Math.hypot(dx, dz);
            if (d > 2 * base) continue;
            const sd = Math.abs(i - j) * this.ds;
            const sdist = Math.min(sd, this.length - sd);
            if (sdist < 2 * d + 30) continue; // same local section
            if (Math.abs(this.py[j] - this.py[i]) > GRADE_SEP) {
              // a crossing on a bridge: both roads get close walls (parapets above, the
              // abutments below) for as long as the other road is underneath / overhead
              if (d < this.hw * 2 + KERB_WIDTH + BRIDGE_WALL) {
                const lim = this.hw + KERB_WIDTH + BRIDGE_WALL;
                wl[i] = Math.min(wl[i], lim);
                wr[i] = Math.min(wr[i], lim);
                if (this.py[i] > this.py[j]) this.bridge[i] = 1;
              }
              continue;
            }
            const lim = d / 2 - 0.5;
            const side = dx * this.leftX(i) + dz * this.leftZ(i);
            if (side > 0) wl[i] = Math.min(wl[i], lim);
            else wr[i] = Math.min(wr[i], lim);
            if (lim < minWall && i < j) this.overlaps.push({ i, j, d });
          }
        }
      }
    }
    // widened run-off never reaches into another stretch's run-off or the pit lane
    clearWidened(this, wl, wr, base);
    // smooth: erode (min over a window) then blur, so walls never jump inwards abruptly
    const win = Math.round(16 / this.ds);
    this.wallL = boxFilter(minFilter(wl, win), win);
    this.wallR = boxFilter(minFilter(wr, win), win);
    for (let i = 0; i < N; i++) {
      this.wallL[i] = Math.max(this.wallL[i], minWall);
      this.wallR[i] = Math.max(this.wallR[i], minWall);
    }
    if (this.def.city) this.narrowToCity();
  }

  /**
   * Street circuits: real buildings and old city walls (def.city, see scripts/fetch-city.mjs)
   * stand at the edge of the street, so the barrier can't be further out than the facade.
   * Where they come closer than the usual wall, the wall moves in to just in front of them,
   * even inside the asphalt (Baku's castle section narrows to ~7.6 m). Obstacles that
   * would leave less than STREET_MIN of half width are taken as mapping noise (a footprint
   * drawn over the road) and ignored, as are raised structures and the tunnel stretches.
   */
  narrowToCity() {
    const N = this.N, c = this.def.city;
    const STREET_MIN = 3.9, FACADE_GAP = 1.0;
    // obstacle segments in world coordinates, hashed by cell
    const segs = [];
    const addLine = (flat, closed) => {
      const n = flat.length / 2;
      for (let k = 0; k < (closed ? n : n - 1); k++) {
        const a = k * 2, b = ((k + 1) % n) * 2;
        segs.push([flat[a], -flat[a + 1], flat[b], -flat[b + 1]]);
      }
    };
    for (const bld of c.buildings ?? []) if (bld[1] < 3) addLine(bld.slice(2), true);
    for (const w of c.walls ?? []) addLine(w, false);
    const cell = 20, grid = new Map();
    segs.forEach(([ax, az, bx, bz], k) => {
      const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
      const z0 = Math.floor(Math.min(az, bz) / cell), z1 = Math.floor(Math.max(az, bz) / cell);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const key = cellKey(gx, gz);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(k);
      }
    });
    const inTunnel = (i) => (this.def.tunnels ?? []).some(([a, b]) => i * this.ds >= a - 10 && i * this.ds <= b + 10);
    const reach = this.hw + KERB_WIDTH + this.runoff + 2;
    const limL = new Float64Array(N).fill(Infinity), limR = new Float64Array(N).fill(Infinity);
    for (let i = 0; i < N; i++) {
      if (inTunnel(i)) continue;
      for (const side of [1, -1]) {
        // march along the normal and take the first facade it crosses
        const ox = this.px[i], oz = this.pz[i];
        const dx = this.leftX(i) * side, dz = this.leftZ(i) * side;
        const ex = ox + dx * reach, ez = oz + dz * reach;
        const seen = new Set();
        let best = Infinity;
        for (let t = 0; t <= reach; t += cell / 2) {
          const key = cellKey(Math.floor((ox + dx * t) / cell), Math.floor((oz + dz * t) / cell));
          for (const k of grid.get(key) ?? []) {
            if (seen.has(k)) continue;
            seen.add(k);
            const [ax, az, bx, bz] = segs[k];
            const hit = segmentHit(ox, oz, ex, ez, ax, az, bx, bz);
            if (hit !== null) best = Math.min(best, hit * reach);
          }
        }
        if (best < STREET_MIN + FACADE_GAP - 0.2) continue; // mapped over the road: ignore
        (side > 0 ? limL : limR)[i] = best - FACADE_GAP;
      }
    }
    const win = Math.max(1, Math.round(10 / this.ds));
    this.cityNarrow = new Uint8Array(N);
    for (const [wall, lim] of [[this.wallL, limL], [this.wallR, limR]]) {
      const sm = boxFilter(minFilter(lim.map((v) => Math.min(v, 1e3)), win), win);
      for (let i = 0; i < N; i++) {
        if (sm[i] < wall[i]) {
          wall[i] = Math.max(sm[i], STREET_MIN);
          if (wall[i] < this.hw + 0.3) this.cityNarrow[i] = 1;
        }
      }
    }
  }

  /**
   * Where the pit lane runs beside the track, pull the wall on that side in to a pit
   * wall halfway between the track edge and the lane; where the lane merges (too
   * close for a wall), open the wall. Also splits kerbs per side, dropping them
   * where a wall or the pit lane takes their place.
   */
  applyPitWalls() {
    const N = this.N, hw = this.hw;
    this.openL = new Uint8Array(N);
    this.openR = new Uint8Array(N);
    this.pitWall = new Uint8Array(N); // wall on the pit side is a pit wall here
    this.pitConflicts = [];
    const pit = this.pit;
    if (pit) {
      const limL = Float64Array.from(this.wallL), limR = Float64Array.from(this.wallR);
      const cell = 40;
      const grid = new Map();
      for (let j = 0; j < pit.N; j++) {
        const k = cellKey(Math.floor(pit.px[j] / cell), Math.floor(pit.pz[j] / cell));
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(j);
      }
      for (let i = 0; i < N; i++) {
        const cx = Math.floor(this.px[i] / cell), cz = Math.floor(this.pz[i] / cell);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gz = cz - 1; gz <= cz + 1; gz++) {
            const list = grid.get(cellKey(gx, gz));
            if (!list) continue;
            for (const j of list) {
              const dx = pit.px[j] - this.px[i], dz = pit.pz[j] - this.pz[i];
              if (Math.abs(dx * this.tx[i] + dz * this.tz[i]) > 1.2) continue; // only lane points abeam
              const side = dx * this.leftX(i) + dz * this.leftZ(i);
              if (Math.sign(side) !== pit.side) continue; // the lane only ever runs on one side
              const d = Math.abs(side);
              // which edge of the lane faces this part of the track
              const facesOuter = Math.sign(-(dx * pit.leftX(j) + dz * pit.leftZ(j))) === pit.outer;
              let lim;
              if (d < hw + PIT.hw * 0.5) {
                // the lane overlaps the track (the merge itself): which edge faces it is meaningless
                (side > 0 ? this.openL : this.openR)[i] = 1;
                continue;
              }
              if (!facesOuter) {
                const gap = d - PIT.hw - hw;
                if (gap < PIT.wallGap * 0.75) {
                  (side > 0 ? this.openL : this.openR)[i] = 1;
                  continue;
                }
                lim = hw + gap / 2;
              } else {
                // garage side of the lane faces the track: keep the wall just inside the lane's outer wall
                lim = d - pit.outerHw(j) - PIT.wallClear - WALL_THICKNESS * 1.5;
                if (lim < hw + 0.45) {
                  this.pitConflicts.push({ i, j });
                  lim = hw + 0.45;
                }
              }
              const arr = side > 0 ? limL : limR;
              arr[i] = Math.min(arr[i], lim);
            }
          }
        }
      }
      for (const [wall, lim] of [[this.wallL, limL], [this.wallR, limR]]) {
        const sm = boxFilter(minFilter(lim, 2), 2);
        // only near samples the pit lane actually pulled in (the filters spread 4 samples):
        // elsewhere the filtered copy differs from the wall just because its width varies
        const near = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          if (lim[i] < wall[i] - 0.25) for (let d = -4; d <= 4; d++) near[this.wrap(i + d)] = 1;
        }
        for (let i = 0; i < N; i++) {
          if (near[i] && sm[i] < wall[i] - 0.25) {
            wall[i] = Math.max(sm[i], hw + 0.45);
            this.pitWall[i] = 1;
          }
        }
      }
    }
    // kerbs per side: none where the wall comes in over them or the pit lane merges
    this.kerbL = new Uint8Array(N);
    this.kerbR = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!this.kerb[i]) continue;
      this.kerbL[i] = !this.openL[i] && this.wallL[i] > hw + KERB_WIDTH + 0.5 ? 1 : 0;
      this.kerbR[i] = !this.openR[i] && this.wallR[i] > hw + KERB_WIDTH + 0.5 ? 1 : 0;
    }
  }

  /**
   * Tyre barriers on the outside of corners with full run-off: tyreL/tyreR[i] is the
   * depth (0..TYRE_DEPTH) of the tyre stack. The collision line stays where it is (it
   * becomes the tyres' front face); only the concrete behind is drawn further out, so
   * a barrier is only placed where the wall has not been squeezed by another section.
   * Runs start a little before the corner, carry on past the exit and taper at the ends.
   */
  computeTyreBarriers() {
    const N = this.N, ds = this.ds;
    const base = this.hw + KERB_WIDTH + this.runoff;
    const before = Math.round(15 / ds), after = Math.round(45 / ds), taper = Math.max(1, Math.round(6 / ds));
    for (const side of [1, -1]) {
      const wall = side > 0 ? this.wallL : this.wallR;
      const open = side > 0 ? this.openL : this.openR;
      const pitSide = this.pit && this.pit.side === side;
      const want = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const k = this.curvature[i];
        if (k * side >= 0 || Math.abs(k) < 1 / TYRE_RADIUS) continue; // only the outside of a bend
        for (let d = -before; d <= after; d++) want[this.wrap(i + d)] = 1;
      }
      for (let i = 0; i < N; i++) {
        const roomy = wall[i] >= base - 1 && !open[i] && !(pitSide && this.pitWall[i]);
        if (!roomy) want[i] = 0;
      }
      // erode then blur: the stack tapers to nothing inside the allowed stretch
      const depth = boxFilter(minFilter(want, taper), taper);
      for (let i = 0; i < N; i++) depth[i] = depth[i] < 0.02 ? 0 : depth[i] * TYRE_DEPTH;
      if (side > 0) this.tyreL = depth;
      else this.tyreR = depth;
    }
  }

  /**
   * Banked corners from def.land.banking: [at, from, to, degrees, ramp]. The road leans into
   * the turn across the stretch `from`..`to` metres from `at`, reaching `degrees` after
   * `ramp` metres (default 40) from each end. this.bank[i] = rise per metre to the left.
   */
  computeBanking() {
    const N = this.N, ds = this.ds;
    this.bank = new Float64Array(N);
    this.bankEdge = this.hw + KERB_WIDTH;
    for (const [at, from, to, degrees, ramp = 40] of this.def.land?.banking ?? []) {
      const i0 = this.anchorIndex(at);
      if (i0 < 0) continue;
      const a = Math.round(from / ds), b = Math.round(to / ds), r = Math.max(1, Math.round(ramp / ds));
      let k = 0;
      for (let d = a; d <= b; d++) k += this.curvature[this.wrap(i0 + d)];
      const slope = -Math.sign(k) * Math.tan((degrees * Math.PI) / 180); // a left turn: left side low
      for (let d = a; d <= b; d++) {
        const t = Math.min(1, (d - a) / r, (b - d) / r);
        this.bank[this.wrap(i0 + d)] = slope * t * t * (3 - 2 * t);
      }
    }
  }

  /** Run-off spec: def.surfaces (src/tracks/land/<id>.js), else src/tracks/runoff.js. */
  surfaceSpec() {
    return this.def.surfaces ?? RUNOFF[this.def.id] ?? {};
  }

  /**
   * Centreline sample of an entry's `at`: a corner name (its control point), a fraction of
   * the lap (0..1), or metres along the lap (> 1), measured along the control polyline as
   * on the reference aerial images. -1 if a corner name is unknown.
   */
  anchorIndex(at) {
    // nearest sample, optionally only within 10% of the lap of an expected sample (so an
    // anchor at a crossover picks the right road)
    const nearest = (x, y, near = -1) => {
      let best = 0, bd = Infinity;
      const span = near < 0 ? this.N : Math.round(this.N * 0.1);
      for (let k = -span; k < span; k++) {
        const i = near < 0 ? k + span : this.wrap(near + k);
        const d = (this.px[i] - x) ** 2 + (this.pz[i] + y) ** 2;
        if (d < bd) [bd, best] = [d, i];
      }
      return best;
    };
    if (typeof at === 'number' && at <= 1) return this.wrap(Math.round(at * this.N));
    const pts = this.def.points;
    if (typeof at === 'number') {
      if (!this.polyCum) {
        this.polyCum = [0];
        for (let k = 1; k <= pts.length; k++) {
          const a = pts[k - 1], b = pts[k % pts.length];
          this.polyCum.push(this.polyCum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
      }
      const cum = this.polyCum, L = cum[pts.length], d = ((at % L) + L) % L;
      let k = 0;
      while (cum[k + 1] < d) k++;
      const a = pts[k], b = pts[(k + 1) % pts.length], t = (d - cum[k]) / (cum[k + 1] - cum[k] || 1);
      return nearest(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, this.wrap(Math.round((d / L) * this.N)));
    }
    const c = (this.def.corners ?? []).find((c) => c.name === at);
    return c ? nearest(...pts[c.at]) : -1;
  }

  /**
   * Resolve lap-relative entries [at, side, from, to, ...]: each(i0, sgn, a, b, entry) with
   * a/b in samples relative to i0 and sgn +1 (left) / -1 (right), or 0 for 'apexes'.
   */
  resolveEntries(list, each) {
    const ds = this.ds;
    // which way a corner turns: net curvature over 40 m either side (+ = left)
    const turnOf = (i0) => {
      let k = 0;
      for (let d = -Math.round(40 / ds); d <= Math.round(40 / ds); d++) k += this.curvature[this.wrap(i0 + d)];
      return Math.sign(k);
    };
    const sidesOf = (side, i0) => {
      if (side === 'apexes') return [0]; // per sample: the inside of the turn there
      if (side === 'L') return [1];
      if (side === 'R') return [-1];
      if (side === 'both') return [1, -1];
      const t = turnOf(i0);
      return t === 0 ? [] : side === 'out' ? [-t] : [t];
    };
    for (const e of list ?? []) {
      const [at, side, from, to] = e;
      const i0 = this.anchorIndex(at);
      if (i0 < 0) {
        (this.runoffWarnings ??= []).push(`no corner named "${at}"`);
        continue;
      }
      for (const sgn of sidesOf(side, i0)) each(i0, sgn, Math.round(from / ds), Math.round(to / ds), e);
    }
  }

  /**
   * Gravel traps and sausage kerbs from src/tracks/runoff.js (or def.surfaces).
   * gravelInL/R, gravelOutL/R[i]: lateral band of the gravel on that side (0 = none);
   * sausageL/R[i]: 1 where a sausage kerb sits just behind the painted kerb.
   * Gravel starts a strip of grass past the kerb and stops short of the barrier; it is
   * left out where the run-off is too narrow for it (squeezed walls, pit lane, bridges),
   * and its inner edge sweeps out to the barrier at each end of a trap.
   */
  computeRunoff() {
    const N = this.N, ds = this.ds, hw = this.hw;
    const spec = this.surfaceSpec();
    // hand-placed entries, plus ones placed from the corners by the circuit's style
    const auto = autoSurfaces(this, this.turns, spec.auto);
    const traps = [...(spec.traps ?? []), ...auto.traps];
    const sausages = [...(spec.sausages ?? []), ...auto.sausages];
    this.gravelColor = spec.gravel ?? 0xab9f88;
    this.gravelInL = new Float32Array(N);
    this.gravelOutL = new Float32Array(N);
    this.gravelInR = new Float32Array(N);
    this.gravelOutR = new Float32Array(N);
    this.sausageL = new Uint8Array(N);
    this.sausageR = new Uint8Array(N);
    this.sausageLat = hw + KERB_WIDTH + SAUSAGE.gap; // inner edge, from the centreline
    const resolve = (list, each) => this.resolveEntries(list, each);
    this.runoffWarnings ??= [];

    // paved run-off (1 = plain asphalt, 2 = painted), later entries winning
    // kind: 'asphalt' | 'paint' | { paint: [a, b], strip: m, beyond: 'asphalt' | 'grass' }
    // paintOutL/R: lateral offset where a painted strip (`strip` m past the kerb) ends
    // (Infinity = painted all the way out); grassOutL/R: 1 where grass follows the strip;
    // paintIdxL/R: which colour pair (this.paints) the paint uses.
    this.pavedL = new Uint8Array(N);
    this.pavedR = new Uint8Array(N);
    this.paintOutL = new Float32Array(N).fill(Infinity);
    this.paintOutR = new Float32Array(N).fill(Infinity);
    this.grassOutL = new Uint8Array(N);
    this.grassOutR = new Uint8Array(N);
    this.paintIdxL = new Uint8Array(N);
    this.paintIdxR = new Uint8Array(N);
    this.paint = spec.paint ?? null;
    // paints: [colourA, colourB, pattern] ('diagonal' | 'along' | 'solid')
    this.paints = [[...(spec.paint ?? [0x2f6db5, 0xc8202a]), spec.paintPattern ?? 'diagonal']];
    const paintIndex = (c, pattern = 'diagonal') => {
      const pair = Array.isArray(c) ? [c[0], c[1] ?? c[0], pattern] : [c, c, pattern];
      const same = (a, b) => (Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : a === b);
      let k = this.paints.findIndex((p) => p[0] === pair[0] && p[1] === pair[1] && same(p[2], pair[2]));
      if (k < 0) k = this.paints.push(pair) - 1;
      return k;
    };
    resolve(spec.paved, (i0, sgn, a, b, e) => {
      const k = e[4], obj = k && typeof k === 'object' ? k : null;
      const kind = obj || k === 'paint' ? 2 : 1;
      const strip = obj ? obj.strip : e[5];
      const w = kind === 2 && strip > 0 ? hw + KERB_WIDTH + strip : Infinity;
      const grass = obj?.beyond === 'grass' || (!obj && e[6] === 'grass') ? 1 : 0;
      const pi = obj?.bands ? paintIndex(obj.bands[0][1], obj.bands)
        : obj?.paint !== undefined || obj?.pattern ? paintIndex(obj.paint ?? this.paints[0], obj.pattern) : 0;
      const L = sgn > 0;
      for (let d = a; d <= b; d++) {
        const i = this.wrap(i0 + d);
        (L ? this.pavedL : this.pavedR)[i] = kind;
        (L ? this.paintOutL : this.paintOutR)[i] = w;
        (L ? this.grassOutL : this.grassOutR)[i] = w < Infinity ? grass : 0;
        (L ? this.paintIdxL : this.paintIdxR)[i] = pi;
      }
    });

    const taper = Math.max(1, Math.round(10 / ds));
    resolve(traps, (i0, sgn, a, b, e) => {
      // a strip of grass (or paved run-off) between the kerb and the stones
      const gravelIn = hw + KERB_WIDTH + (e[4] ?? 1.2);
      const wall = sgn > 0 ? this.wallL : this.wallR, tyre = sgn > 0 ? this.tyreL : this.tyreR;
      const open = sgn > 0 ? this.openL : this.openR;
      const pitSide = this.pit && this.pit.side === sgn;
      const inA = sgn > 0 ? this.gravelInL : this.gravelInR, outA = sgn > 0 ? this.gravelOutL : this.gravelOutR;
      // longest stretches with room for gravel, each with its own swept ends
      const room = [];
      for (let d = a; d <= b; d++) {
        const i = this.wrap(i0 + d);
        const outer = wall[i] - (tyre[i] > 0 ? 0.6 : WALL_THICKNESS / 2 + 0.6);
        room.push(!open[i] && !(pitSide && this.pitWall[i]) && !this.bridge?.[i] && outer - gravelIn >= 3 ? outer : 0);
      }
      for (let d0 = 0; d0 < room.length; ) {
        if (!room[d0]) {
          d0++;
          continue;
        }
        let d1 = d0;
        while (d1 + 1 < room.length && room[d1 + 1]) d1++;
        const len = d1 - d0;
        if (len * ds >= 12) {
          for (let d = d0; d <= d1; d++) {
            const i = this.wrap(i0 + a + d), outer = room[d];
            const t = Math.min(1, Math.min(d - d0, d1 - d) / taper);
            const inner = outer - (outer - gravelIn) * (t * t * (3 - 2 * t)) - 0.01;
            // overlapping entries: keep the widest band
            if (!outA[i] || inner < inA[i]) inA[i] = inner;
            outA[i] = Math.max(outA[i], outer);
          }
        }
        d0 = d1 + 1;
      }
    });
    resolve(sausages, (i0, side, a, b) => {
      for (let d = a; d <= b; d++) {
        const i = this.wrap(i0 + d), k = this.curvature[i];
        const sgn = side || (Math.abs(k) > 1 / 150 ? Math.sign(k) : 0);
        if (!sgn) continue;
        const wall = sgn > 0 ? this.wallL : this.wallR;
        if (wall[i] > this.sausageLat + SAUSAGE.width + 1) (sgn > 0 ? this.sausageL : this.sausageR)[i] = 1;
      }
    });
  }

  /** Surface under a point `lat` metres left of the centreline at sample i. */
  surfaceAt(i, lat) {
    const off = Math.abs(lat), left = lat > 0;
    if (off <= this.hw) return 'asphalt';
    if (off <= this.hw + KERB_WIDTH && (left ? this.kerbL : this.kerbR)[i]) return 'kerb';
    if ((left ? this.sausageL : this.sausageR)[i] && off >= this.sausageLat && off <= this.sausageLat + SAUSAGE.width) return 'sausage';
    const gIn = (left ? this.gravelInL : this.gravelInR)[i], gOut = (left ? this.gravelOutL : this.gravelOutR)[i];
    if (gOut && off >= gIn && off <= gOut) return 'gravel';
    if ((left ? this.pavedL : this.pavedR)[i] && !((left ? this.grassOutL : this.grassOutR)[i] && off > (left ? this.paintOutL : this.paintOutR)[i])) return 'runoff';
    return this.def.scenery?.paved ? 'runoff' : 'grass';
  }

  /**
   * Barrier polylines: { pts: [[x, z, y], ...], closed, render, kind } (y = foot height).
   * Main walls also carry idx (the centreline sample of each point) and side (+1 left).
   * kind: 'main' (track walls incl. the pit wall), 'pit' (lane's outer wall),
   * 'close' (short walls closing the run-off at the pit entry and exit).
   */
  buildWallLines() {
    const lines = [];
    const N = this.N;
    const ends = []; // open main-wall ends that need closing to the pit lane's outer wall
    for (const side of [1, -1]) {
      const open = side > 0 ? this.openL : this.openR;
      const wall = side > 0 ? this.wallL : this.wallR;
      const pt = (i) => [this.px[i] + this.leftX(i) * side * wall[i], this.pz[i] + this.leftZ(i) * side * wall[i], this.roadY(i, side * wall[i])];
      const keep = Array.from(open, (o) => !o);
      if (keep.every(Boolean)) {
        lines.push({ pts: Array.from({ length: N }, (_, i) => pt(i)), idx: Array.from({ length: N }, (_, i) => i), closed: true, render: true, kind: 'main', side });
        continue;
      }
      for (const [i0, count] of flagRuns(keep)) {
        const pts = [], idx = [];
        for (let k = 0; k < count; k++) {
          idx.push(this.wrap(i0 + k));
          pts.push(pt(idx[k]));
        }
        lines.push({ pts, idx, closed: false, render: true, kind: 'main', side });
        for (const i of [i0, this.wrap(i0 + count - 1)]) ends.push(pt(i));
      }
    }
    const pit = this.pit;
    if (pit) {
      // outer wall: along the lane's garage side, except where it would stand on the track
      const off = (j) => pit.outerHw(j) + PIT.wallClear + WALL_THICKNESS / 2;
      const wpt = (j) => [pit.px[j] + pit.leftX(j) * pit.outer * off(j), pit.pz[j] + pit.leftZ(j) * pit.outer * off(j), pit.py[j]];
      const keep = [];
      for (let j = 0; j < pit.N; j++) {
        const [x, z] = wpt(j);
        keep.push(Math.abs(this.query(x, z).lateral) >= this.hw + KERB_WIDTH + 0.3);
      }
      const outerEnds = [];
      for (const [j0, count] of flagRuns(keep, false)) {
        // split at the garage block: its facade is drawn by the building instead
        let pts = [], render = null;
        const flush = () => {
          if (pts.length > 1) lines.push({ pts, closed: false, render, kind: 'pit' });
        };
        for (let k = 0; k < count; k++) {
          const j = j0 + k;
          const r = !pit.inGarage(j);
          if (render !== null && r !== render) {
            flush();
            pts = [pts[pts.length - 1]];
          }
          render = r;
          pts.push(wpt(j));
        }
        flush();
        outerEnds.push(wpt(j0), wpt(j0 + count - 1));
      }
      // close the run-off between each opened main wall end and the nearest outer-wall end.
      // A wall end between the track and the lane (a pit wall's nose) stays open: closing
      // it would cut across the lane.
      const crossesLane = (a, c) => {
        for (let j = 0; j + 1 < pit.N; j++) {
          if (segmentsCross(a[0], a[1], c[0], c[1], pit.px[j], pit.pz[j], pit.px[j + 1], pit.pz[j + 1])) return true;
        }
        return false;
      };
      for (const m of ends) {
        let best = null, bd = 150; // long merges (a lane that runs alongside before it joins) need long closing walls
        for (const e of outerEnds) {
          const d = Math.hypot(e[0] - m[0], e[1] - m[1]);
          if (d >= bd || crossesLane(m, e)) continue;
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (best) lines.push({ pts: [m, best], closed: false, render: true, kind: 'close' });
      }
    }
    this.walls = lines;
  }

  /** Spatial hash of every wall segment, for collision queries. */
  buildWallIndex() {
    const ax = [], az = [], bx = [], bz = [], ay = [];
    for (const l of this.walls) {
      const n = l.pts.length;
      for (let k = 0; k < (l.closed ? n : n - 1); k++) {
        const a = l.pts[k], b = l.pts[(k + 1) % n];
        ax.push(a[0]); az.push(a[1]); bx.push(b[0]); bz.push(b[1]); ay.push((a[2] + b[2]) / 2);
      }
    }
    const S = ax.length;
    this.seg = { ax: Float64Array.from(ax), az: Float64Array.from(az), bx: Float64Array.from(bx), bz: Float64Array.from(bz), ay: Float64Array.from(ay), n: S };
    this.segCell = 10;
    this.segGrid = new Map();
    for (let s = 0; s < S; s++) {
      const c = this.segCell;
      const x0 = Math.floor(Math.min(ax[s], bx[s]) / c), x1 = Math.floor(Math.max(ax[s], bx[s]) / c);
      const z0 = Math.floor(Math.min(az[s], bz[s]) / c), z1 = Math.floor(Math.max(az[s], bz[s]) / c);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const k = cellKey(gx, gz);
          if (!this.segGrid.has(k)) this.segGrid.set(k, []);
          this.segGrid.get(k).push(s);
        }
      }
    }
    this.segStamp = new Uint32Array(S);
    this.segTick = 0;
  }

  /**
   * Deepest wall contact for a circle of radius r that moved from (px, pz) to (x, z).
   * Returns { nx, nz, pen } (unit normal from the wall towards the side the circle
   * came from, and how far to push it out) or null. Moving through a wall counts.
   * y (optional): the road height under the circle; walls of a section on another level
   * (a bridge overhead or the road below it) are ignored.
   */
  wallContact(x, z, px, pz, r, y = null) {
    const c = this.segCell, S = this.seg;
    const tick = ++this.segTick;
    const x0 = Math.floor((Math.min(x, px) - r) / c), x1 = Math.floor((Math.max(x, px) + r) / c);
    const z0 = Math.floor((Math.min(z, pz) - r) / c), z1 = Math.floor((Math.max(z, pz) + r) / c);
    let best = null;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const list = this.segGrid.get(cellKey(gx, gz));
        if (!list) continue;
        for (const s of list) {
          if (this.segStamp[s] === tick) continue;
          this.segStamp[s] = tick;
          if (y !== null && Math.abs(S.ay[s] - y) > GRADE_SEP) continue;
          const ax = S.ax[s], az = S.az[s];
          const ex = S.bx[s] - ax, ez = S.bz[s] - az;
          const len2 = ex * ex + ez * ez;
          if (len2 < 1e-9) continue;
          const len = Math.sqrt(len2);
          const d1 = ex * (pz - az) - ez * (px - ax); // signed distances × len, + = left of a→b
          const d2 = ex * (z - az) - ez * (x - ax);
          const side = d1 >= 0 ? 1 : -1;
          let nx, nz, pen = -1;
          if (d1 * d2 < 0) {
            const t = d1 / (d1 - d2);
            const ix = px + (x - px) * t, iz = pz + (z - pz) * t;
            const u = ((ix - ax) * ex + (iz - az) * ez) / len2;
            if (u >= 0 && u <= 1) {
              nx = (-ez / len) * side;
              nz = (ex / len) * side;
              pen = Math.abs(d2) / len + r;
            }
          }
          if (pen < 0) {
            const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2));
            const qx = x - (ax + ex * u), qz = z - (az + ez * u);
            const d = Math.hypot(qx, qz);
            if (d >= r) continue;
            if (d > 1e-6) {
              nx = qx / d;
              nz = qz / d;
            } else {
              nx = (-ez / len) * side;
              nz = (ex / len) * side;
            }
            pen = r - d;
          }
          if (!best || pen > best.pen) best = { nx, nz, pen };
        }
      }
    }
    return best;
  }

  /**
   * Nearest point on the centreline. hint = last known sample index (or -1 for
   * a full search). Returns { i, s, lateral } where lateral > 0 is left of centre.
   */
  query(x, z, hint = -1) {
    let best = -1, bestD = Infinity;
    const scan = (i) => {
      const dx = x - this.px[i], dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    };
    if (hint < 0) for (let i = 0; i < this.N; i++) scan(i);
    else for (let k = -40; k <= 40; k++) scan(this.wrap(hint + k));
    const i = best;
    const along = (k) => (x - this.px[k]) * this.tx[k] + (z - this.pz[k]) * this.tz[k];
    const left = (k) => (x - this.px[k]) * this.leftX(k) + (z - this.pz[k]) * this.leftZ(k);
    // between the two samples either side of the point, blending their projections: one
    // sample's tangent alone jumps when the nearest sample changes on the outside of a bend
    const a = along(i) >= 0 ? i : this.wrap(i - 1), b = this.wrap(a + 1);
    const ua = along(a), ub = along(b);
    const t = ua > 0 && ub < 0 ? ua / (ua - ub) : ua <= 0 ? 0 : 1;
    const lateral = left(a) * (1 - t) + left(b) * t;
    let s = (a + t) * this.ds;
    s = ((s % this.length) + this.length) % this.length;
    return { i, s, lateral };
  }

  /** World pose at arc length s (wrapped) and lateral offset (left +). */
  poseAt(s, lateral = 0) {
    const f = (((s % this.length) + this.length) % this.length) / this.ds;
    const i = Math.floor(f) % this.N;
    const j = this.wrap(i + 1);
    const t = f - Math.floor(f);
    const x = this.px[i] + (this.px[j] - this.px[i]) * t + this.leftX(i) * lateral;
    const z = this.pz[i] + (this.pz[j] - this.pz[i]) * t + this.leftZ(i) * lateral;
    const y = this.py[i] + (this.py[j] - this.py[i]) * t;
    return { x, z, y, yaw: this.heading[i], grade: this.grade[i], i };
  }

  /** Starting grid slot i (0 = pole), staggered left/right behind the line. */
  gridPose(slot) {
    const dist = 11 + slot * 8;
    const lateral = slot % 2 === 0 ? this.hw * 0.45 : -this.hw * 0.45;
    return this.poseAt(-dist, lateral);
  }

  bounds() {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.N; i++) {
      minX = Math.min(minX, this.px[i]);
      maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]);
      maxZ = Math.max(maxZ, this.pz[i]);
    }
    return { minX, minZ, maxX, maxZ };
  }

  /** Minimum radius of curvature and where it occurs. */
  tightest() {
    let k = 0, at = 0;
    for (let i = 0; i < this.N; i++) {
      if (Math.abs(this.curvature[i]) > k) {
        k = Math.abs(this.curvature[i]);
        at = i;
      }
    }
    return { radius: 1 / k, s: at * this.ds };
  }

  /** SVG path string of the centreline (for menus / minimap). */
  svgPath(step = 4) {
    let d = '';
    for (let i = 0; i < this.N; i += step) d += `${i ? 'L' : 'M'}${this.px[i].toFixed(1)} ${this.pz[i].toFixed(1)}`;
    return d + 'Z';
  }
}

/**
 * The pit lane: an open centreline sampled every ~1 m, mapped onto the lap distance
 * of the main track, with the garage block and the speed-limit zone along it.
 */
export class PitPath {
  constructor(main, def) {
    this.main = main;
    const hw = main.hw;
    let pts = def.points.map(([x, y]) => [x, -y]);
    // The game's asphalt can be wider than the real track, so a lane taken from real
    // data may sit closer to it than a pit wall needs. Where that happens, slide the
    // whole separated part of the lane out by the shortfall (the merges stay put).
    const need = hw + PIT.wallGap + PIT.hw;
    const q0 = pts.map(([x, z]) => main.query(x, z));
    let nudge = 0;
    const sep = (k) => Math.abs(q0[k].lateral) >= hw + 2;
    for (let k = 1; k + 1 < q0.length; k++) {
      // only sustained stretches beside the track, not points on the way in or out of a merge
      if (!sep(k - 1) || !sep(k) || !sep(k + 1)) continue;
      nudge = Math.max(nudge, need - Math.abs(q0[k].lateral));
    }
    this.nudge = nudge;
    if (nudge > 0) {
      pts = pts.map(([x, z], k) => {
        const q = q0[k];
        const w = smoothstep(hw - 3, hw + 2, Math.abs(q.lateral)) * nudge * Math.sign(q.lateral);
        return [x + main.leftX(q.i) * w, z + main.leftZ(q.i) * w];
      });
    }

    const curve = new CatmullRomCurve3(pts.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');
    this.length = curve.getLength();
    const N = Math.max(2, Math.round(this.length) + 1);
    const sp = curve.getSpacedPoints(N - 1);
    this.N = N;
    this.ds = this.length / (N - 1);
    this.px = new Float64Array(N);
    this.pz = new Float64Array(N);
    this.tx = new Float64Array(N);
    this.tz = new Float64Array(N);
    this.heading = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      this.px[j] = sp[j].x;
      this.pz[j] = sp[j].z;
    }
    for (let j = 0; j < N; j++) {
      const a = Math.max(0, j - 1), b = Math.min(N - 1, j + 1);
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[j] = dx / l;
      this.tz[j] = dz / l;
      this.heading[j] = Math.atan2(this.tx[j], this.tz[j]);
    }

    // lap distance of each lane sample (never runs backwards, so lap timing works in the lane)
    const L = main.length;
    this.mainI = new Int32Array(N);
    this.mainS = new Float64Array(N); // unwrapped: mainS[0] in [0, L), increasing
    this.mainLat = new Float64Array(N);
    let prev = null, sideSum = 0;
    for (let j = 0; j < N; j++) {
      const q = main.query(this.px[j], this.pz[j]);
      this.mainLat[j] = q.lateral;
      if (Math.abs(q.lateral) > hw) sideSum += Math.sign(q.lateral);
      let s = q.s;
      if (prev !== null) {
        const d = ((((s - prev) % L) + L * 1.5) % L) - L / 2;
        s = prev + Math.max(0, d);
      }
      this.mainS[j] = s;
      this.mainI[j] = main.wrap(Math.round((s % L) / main.ds));
      prev = s;
    }
    // the lane is level with the bit of track beside it
    this.py = new Float64Array(N);
    for (let j = 0; j < N; j++) this.py[j] = main.heightAt(this.mainS[j]);
    this.grade = new Float64Array(N);
    for (let j = 0; j < N; j++) this.grade[j] = (this.py[Math.min(N - 1, j + 1)] - this.py[Math.max(0, j - 1)]) / (this.ds * (j > 0 && j < N - 1 ? 2 : 1));
    this.side = sideSum >= 0 ? 1 : -1; // +1: the lane is on the driver's left of the track
    this.outer = this.side; // the garages are on the side of the lane away from the track
    this.entryS = this.mainS[0] % L;
    this.exitS = this.mainS[N - 1] % L;

    // speed limit: from where the lane is clear of the track to where it meets it again
    const clear = (j) => Math.abs(this.mainLat[j]) >= hw + PIT.hw + 0.5;
    let a = 0, b = N - 1;
    while (a < N - 1 && !clear(a)) a++;
    while (b > a && !clear(b)) b--;
    this.limitStart = a * this.ds;
    this.limitEnd = b * this.ds;

    // garages: on the longest straight part of the lane beside the track,
    // centred on the start line when it is alongside
    const k = new Float64Array(N);
    for (let j = 2; j < N - 2; j++) k[j] = Math.abs(angleDiff(this.heading[j + 2], this.heading[j - 2])) / (4 * this.ds);
    const straight = Array.from({ length: N }, (_, j) => j >= 2 && j < N - 2 && k[j] < 1 / 250 && clear(j));
    let run = null;
    for (const [j0, count] of flagRuns(straight, false)) if (!run || count > run[1]) run = [j0, count];
    if (!run || run[1] * this.ds <= 80) {
      // a lane that curves all the way (e.g. inside an oval): use the longest stretch clear of the track
      const clearFlags = Array.from({ length: N }, (_, j) => clear(j));
      for (const [j0, count] of flagRuns(clearFlags, false)) if (!run || count > run[1]) run = [j0, count];
    }
    this.garageStart = this.garageEnd = -1;
    if (run && run[1] * this.ds > 80) {
      const margin = 15;
      const lo = (run[0] + margin / this.ds) * this.ds, hi = (run[0] + run[1] - 1 - margin / this.ds) * this.ds;
      const want = Math.min(PIT.garages * PIT.garagePitch, hi - lo);
      let jLine = -1;
      for (let j = run[0]; j < run[0] + run[1]; j++) {
        const s = this.mainS[j] % L;
        if (s < 30 || s > L - 30) jLine = j;
      }
      let mid = jLine >= 0 ? jLine * this.ds : (lo + hi) / 2;
      mid = Math.min(Math.max(mid, lo + want / 2), hi - want / 2);
      this.garageStart = mid - want / 2;
      this.garageEnd = mid + want / 2;
    }
    this.garageCount = this.garageStart >= 0 ? PIT.garages : 0;
    this.garagePitch = this.garageCount ? (this.garageEnd - this.garageStart) / this.garageCount : 0;
    this.apron = new Float64Array(N);
    // the apron tapers in over 12 m before the first garage, and out over a longer run
    // after the last one so a car leaving the last box has room to pull back across
    const rampIn = 12, rampOut = 30;
    for (let j = 0; j < N; j++) {
      const s = j * this.ds;
      if (this.garageStart < 0) break;
      const t = Math.min(smoothstep(this.garageStart - rampIn, this.garageStart, s), 1 - smoothstep(this.garageEnd, this.garageEnd + rampOut, s));
      this.apron[j] = PIT.apron * Math.max(0, t);
    }
  }

  leftX(j) {
    return this.tz[j];
  }
  leftZ(j) {
    return -this.tx[j];
  }

  /** Half width of the lane on its garage side (fast lane + working lane). */
  outerHw(j) {
    return PIT.hw + this.apron[j];
  }

  /**
   * Pit box k (0 = the garage nearest the pit entry): centred on the working lane in
   * front of garage k. Returns { k, s, lat, x, y, z, yaw, grade, j } or null.
   * `lat` is the lateral offset from the lane centre (left +).
   */
  box(k) {
    if (!(k >= 0 && k < this.garageCount)) return null;
    const s = this.garageStart + (k + 0.5) * this.garagePitch;
    const lat = this.outer * (PIT.hw + PIT.apron / 2);
    return { k, s, lat, ...this.poseAt(s, lat) };
  }

  inGarage(j) {
    const s = j * this.ds;
    return this.garageStart >= 0 && s >= this.garageStart && s <= this.garageEnd;
  }

  /** Is the point at lateral offset `lat` (left +) from sample j on the lane's asphalt? */
  onLane(j, lat) {
    return lat * this.outer >= 0 ? Math.abs(lat) <= this.outerHw(j) : Math.abs(lat) <= PIT.hw;
  }

  /** Nearest lane sample. Returns { j, s, lateral } (lateral > 0 is left of the lane centre). */
  query(x, z, hint = -1) {
    const lo = hint < 0 ? 0 : Math.max(0, hint - 30), hi = hint < 0 ? this.N - 1 : Math.min(this.N - 1, hint + 30);
    let best = lo, bestD = Infinity;
    for (let j = lo; j <= hi; j++) {
      const dx = x - this.px[j], dz = z - this.pz[j];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    const j = best;
    const dx = x - this.px[j], dz = z - this.pz[j];
    const s = Math.min(Math.max(j * this.ds + dx * this.tx[j] + dz * this.tz[j], 0), this.length);
    return { j, s, lateral: dx * this.leftX(j) + dz * this.leftZ(j) };
  }

  /** Lap distance (wrapped) for a lane distance s. */
  lapS(s) {
    const f = Math.min(Math.max(s / this.ds, 0), this.N - 1);
    const j = Math.min(Math.floor(f), this.N - 2);
    const v = this.mainS[j] + (this.mainS[j + 1] - this.mainS[j]) * (f - j);
    return v % this.main.length;
  }

  poseAt(s, lateral = 0) {
    const f = Math.min(Math.max(s / this.ds, 0), this.N - 1);
    const j = Math.min(Math.floor(f), this.N - 2);
    const t = f - j;
    const x = this.px[j] + (this.px[j + 1] - this.px[j]) * t + this.leftX(j) * lateral;
    const z = this.pz[j] + (this.pz[j + 1] - this.pz[j]) * t + this.leftZ(j) * lateral;
    const y = this.py[j] + (this.py[j + 1] - this.py[j]) * t;
    return { x, z, y, yaw: this.heading[j], grade: this.grade[j], j };
  }

  svgPath(step = 3) {
    let d = '';
    for (let j = 0; j < this.N; j += step) d += `${j ? 'L' : 'M'}${this.px[j].toFixed(1)} ${this.pz[j].toFixed(1)}`;
    return d + `L${this.px[this.N - 1].toFixed(1)} ${this.pz[this.N - 1].toFixed(1)}`;
  }
}

/** Runs of set flags: [[start, count], ...]. wrap = treat the array as a loop. */
export function flagRuns(flags, wrap = true) {
  const N = flags.length;
  const out = [];
  if (!wrap) {
    let start = -1;
    for (let i = 0; i <= N; i++) {
      if (i < N && flags[i]) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        out.push([start, i - start]);
        start = -1;
      }
    }
    return out;
  }
  if (flags.every(Boolean)) return [[0, N]];
  const gap = Array.prototype.findIndex.call(flags, (f) => !f);
  let start = -1;
  for (let k = 1; k <= N; k++) {
    const i = (gap + k) % N;
    if (flags[i] && start < 0) start = i;
    if ((!flags[i] || k === N) && start >= 0) {
      out.push([start, (((i - start) % N) + N) % N + (flags[i] ? 1 : 0)]);
      start = -1;
    }
  }
  return out;
}

function segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = o(ax, az, bx, bz, cx, cz), d2 = o(ax, az, bx, bz, dx, dz);
  const d3 = o(cx, cz, dx, dz, ax, az), d4 = o(cx, cz, dx, dz, bx, bz);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Fraction t along p→e where segment p-e crosses segment a-b, or null. */
function segmentHit(px, pz, ex, ez, ax, az, bx, bz) {
  const rx = ex - px, rz = ez - pz, sx = bx - ax, sz = bz - az;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((ax - px) * sz - (az - pz) * sx) / den;
  const u = ((ax - px) * rz - (az - pz) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function cellKey(x, z) {
  return (x + 32768) * 65536 + (z + 32768);
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

export function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function boxFilter(arr, r) {
  const N = arr.length, out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += arr[(i + k + N) % N];
    out[i] = s / (2 * r + 1);
  }
  return out;
}

export function minFilter(arr, r) {
  const N = arr.length, out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let m = Infinity;
    for (let k = -r; k <= r; k++) m = Math.min(m, arr[(i + k + N) % N]);
    out[i] = m;
  }
  return out;
}
