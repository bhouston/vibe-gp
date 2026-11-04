// Pure track-path maths: sampling a closed centreline, curvature, kerb placement,
// wall clearance and nearest-point queries. No rendering, so Node scripts can use it.
//
// Track definition format (see src/tracks/*.js):
//   points: [[x, y], ...] closed loop of centreline control points in metres,
//           map coordinates with +x = east and +y = north. points[0] is the
//           start/finish line and the order of points is the racing direction.
//   width:  asphalt width in metres (default 14)
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

export const KERB_WIDTH = 1.6;
export const WALL_THICKNESS = 0.6;
export const DEFAULT_RUNOFF = 14;
const KERB_RADIUS = 320; // corners tighter than this get kerbs (m)

export const PIT = {
  hw: 3.5, // half width of the pit lane's fast lane (m)
  apron: 5, // working lane in front of the garages (m)
  speedLimit: 80 / 3.6, // m/s
  wallGap: 1.6, // gap between track edge and pit lane edge needed for a pit wall (m)
  wallClear: 0.3, // outer wall face distance outside the lane edge (m)
  garages: 10,
  garagePitch: 24, // m of frontage per garage
};

export class TrackPath {
  constructor(def) {
    this.def = def;
    this.width = def.width ?? 14;
    this.hw = this.width / 2;
    this.runoff = def.runoff ?? DEFAULT_RUNOFF;
    this.sample();
    this.computeKerbs();
    this.pit = def.pitlane ? new PitPath(this, def.pitlane) : null;
    this.computeWalls();
    this.applyPitWalls();
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
  computeWalls() {
    const N = this.N;
    const base = this.hw + KERB_WIDTH + this.runoff;
    const minWall = this.hw + KERB_WIDTH + 1.5;
    const wl = new Float64Array(N).fill(base);
    const wr = new Float64Array(N).fill(base);
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
            const lim = d / 2 - 0.5;
            const side = dx * this.leftX(i) + dz * this.leftZ(i);
            if (side > 0) wl[i] = Math.min(wl[i], lim);
            else wr[i] = Math.min(wr[i], lim);
            if (lim < minWall && i < j) this.overlaps.push({ i, j, d });
          }
        }
      }
    }
    // smooth: erode (min over a window) then blur, so walls never jump inwards abruptly
    const win = Math.round(16 / this.ds);
    this.wallL = boxFilter(minFilter(wl, win), win);
    this.wallR = boxFilter(minFilter(wr, win), win);
    for (let i = 0; i < N; i++) {
      this.wallL[i] = Math.max(this.wallL[i], minWall);
      this.wallR[i] = Math.max(this.wallR[i], minWall);
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
        for (let i = 0; i < N; i++) {
          if (sm[i] < wall[i] - 0.25) {
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
   * Barrier polylines: { pts: [[x, z], ...], closed, render, kind }.
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
      const pt = (i) => [this.px[i] + this.leftX(i) * side * wall[i], this.pz[i] + this.leftZ(i) * side * wall[i]];
      const keep = Array.from(open, (o) => !o);
      if (keep.every(Boolean)) {
        lines.push({ pts: Array.from({ length: N }, (_, i) => pt(i)), closed: true, render: true, kind: 'main', side });
        continue;
      }
      for (const [i0, count] of flagRuns(keep)) {
        const pts = [];
        for (let k = 0; k < count; k++) pts.push(pt(this.wrap(i0 + k)));
        lines.push({ pts, closed: false, render: true, kind: 'main', side });
        for (const i of [i0, this.wrap(i0 + count - 1)]) ends.push(pt(i));
      }
    }
    const pit = this.pit;
    if (pit) {
      // outer wall: along the lane's garage side, except where it would stand on the track
      const off = (j) => pit.outerHw(j) + PIT.wallClear + WALL_THICKNESS / 2;
      const wpt = (j) => [pit.px[j] + pit.leftX(j) * pit.outer * off(j), pit.pz[j] + pit.leftZ(j) * pit.outer * off(j)];
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
        let best = null, bd = 80;
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
    const ax = [], az = [], bx = [], bz = [];
    for (const l of this.walls) {
      const n = l.pts.length;
      for (let k = 0; k < (l.closed ? n : n - 1); k++) {
        const a = l.pts[k], b = l.pts[(k + 1) % n];
        ax.push(a[0]); az.push(a[1]); bx.push(b[0]); bz.push(b[1]);
      }
    }
    const S = ax.length;
    this.seg = { ax: Float64Array.from(ax), az: Float64Array.from(az), bx: Float64Array.from(bx), bz: Float64Array.from(bz), n: S };
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
   */
  wallContact(x, z, px, pz, r) {
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
    const dx = x - this.px[i], dz = z - this.pz[i];
    const along = dx * this.tx[i] + dz * this.tz[i];
    const lateral = dx * this.leftX(i) + dz * this.leftZ(i);
    let s = i * this.ds + along;
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
    return { x, z, yaw: this.heading[i], i };
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
    this.apron = new Float64Array(N);
    const ramp = 12;
    for (let j = 0; j < N; j++) {
      const s = j * this.ds;
      if (this.garageStart < 0) break;
      const t = Math.min(smoothstep(this.garageStart - ramp, this.garageStart, s), 1 - smoothstep(this.garageEnd, this.garageEnd + ramp, s));
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
    return { x, z, yaw: this.heading[j], j };
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

function boxFilter(arr, r) {
  const N = arr.length, out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += arr[(i + k + N) % N];
    out[i] = s / (2 * r + 1);
  }
  return out;
}

function minFilter(arr, r) {
  const N = arr.length, out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let m = Infinity;
    for (let k = -r; k <= r; k++) m = Math.min(m, arr[(i + k + N) % N]);
    out[i] = m;
  }
  return out;
}
