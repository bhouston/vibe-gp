// Pit stops in the player's own box. Each team has a designated garage (teamGarage in
// teams.js) with its box painted in front of it. Stop in your box and the crew holds
// the car on the jacks, fits a fresh set of tyres of the compound picked on the HUD
// (warm from the blankets, clean) and drops it; the stop takes longer the further the
// car is from the marks.
import { PIT, angleDiff } from './trackPath.js';
import { COMPOUNDS } from './tyres.js';

const SERVICE_BASE = 2.2; // s for a stop right on the marks
const SERVICE_PER_M = 0.5; // extra s per metre the car stopped off the marks
const STOPPED = 0.4; // m/s: slow enough for the crew to go

export class PitStop {
  constructor() {
    this.pit = null;
    this.box = null;
    this.nextCompound = COMPOUNDS.medium; // what the crew has ready for the next stop
    this.reset();
  }

  /** Point at box k of the lane (null pit or no such box: no pit stops). */
  setBox(pit, k) {
    this.pit = pit;
    this.box = pit ? pit.box(k) : null;
    this.reset();
  }

  reset() {
    // idle | approach (box ahead in the lane) | inBox (on the marks, still moving)
    // | service (car held, crew working) | done (serviced, not yet left the box)
    this.state = 'idle';
    this.distance = null; // m to the box along the lane, while approaching
    this.elapsed = 0;
    this.duration = 0;
    this.lastStop = null; // s, the most recent stop's length
    this.released = false; // true for the one step the car is let go
    this.fitting = null; // compound going on during the current stop
  }

  /** Where the car is relative to the box: metres along/across the lane and yaw error. */
  offset(car) {
    const b = this.box, pit = this.pit;
    const dx = car.position.x - b.x, dz = car.position.z - b.z;
    return {
      along: dx * pit.tx[b.j] + dz * pit.tz[b.j],
      across: dx * pit.leftX(b.j) + dz * pit.leftZ(b.j),
      yaw: angleDiff(car.yaw, b.yaw),
    };
  }

  /**
   * Advance one physics step. Returns the controls the car should get: while the crew
   * is working the car is held still whatever the driver does.
   */
  update(car, controls, dt) {
    this.released = false;
    if (!this.box) return controls;
    const tol = PIT.boxTol;
    const near = car.onPitLane && Math.abs(car.pitS - this.box.s) < PIT.box.length;
    const o = near ? this.offset(car) : null;
    const onMarks = o && Math.abs(o.along) < tol.along && Math.abs(o.across) < tol.across && Math.abs(o.yaw) < tol.yaw;

    if (this.state === 'service') {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        car.fitTyres(this.fitting);
        this.lastStop = this.duration;
        this.state = 'done';
        this.released = true;
      }
      return { ...controls, hold: true };
    }
    if (this.state === 'done') {
      if (onMarks) return controls; // serviced: no second stop until the car has left
      this.state = 'idle';
    }
    if (onMarks) {
      this.state = 'inBox';
      if (Math.abs(car.speed) < STOPPED) {
        this.state = 'service';
        this.elapsed = 0;
        const miss = Math.hypot(o.along, o.across);
        this.duration = SERVICE_BASE + SERVICE_PER_M * miss;
        this.fitting = this.nextCompound; // locked in once the car is on the jacks
        return { ...controls, hold: true };
      }
      return controls;
    }
    const ahead = this.box.s - car.pitS;
    if (car.onPitLane && ahead > -tol.along) {
      this.state = 'approach';
      this.distance = Math.max(0, ahead);
    } else {
      this.state = 'idle';
      this.distance = null;
    }
    return controls;
  }
}
