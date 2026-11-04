// Lap timing for the circular track. Start/finish line is at angle 0 (+X axis).
export class LapTimer {
  constructor() {
    this.reset();
  }

  reset() {
    this.lap = 0; // 0 = out-lap, not yet crossed the line
    this.lapStart = 0;
    this.time = 0;
    this.last = null;
    this.best = null;
    this.halfway = false;
    this.prevAngle = null;
    this.flash = null; // { text, until }
  }

  update(pos, dt) {
    this.time += dt;
    const a = Math.atan2(pos.z, pos.x); // -PI..PI, line at 0, racing direction = increasing angle
    if (this.prevAngle !== null) {
      // halfway checkpoint (opposite side of the circle) stops lap cheating by reversing
      if (Math.abs(a) > Math.PI * 0.75) this.halfway = true;
      const crossedForward = this.prevAngle < 0 && a >= 0 && Math.abs(a) < 1;
      const crossedBackward = this.prevAngle >= 0 && a < 0 && Math.abs(a) < 1;
      if (crossedForward) this.crossLine();
      if (crossedBackward) this.halfway = false; // reversing over the line voids progress
    }
    this.prevAngle = a;
  }

  crossLine() {
    if (this.lap === 0) {
      this.lap = 1;
      this.lapStart = this.time;
      this.halfway = false;
      this.flash = { text: 'GO!', until: this.time + 1.5 };
      return;
    }
    if (!this.halfway) return;
    const lapTime = this.time - this.lapStart;
    this.last = lapTime;
    const isBest = this.best === null || lapTime < this.best;
    if (isBest) this.best = lapTime;
    this.flash = { text: `${isBest ? 'BEST LAP ' : 'LAP '}${formatTime(lapTime)}`, until: this.time + 3, best: isBest };
    this.lap++;
    this.lapStart = this.time;
    this.halfway = false;
  }

  get current() {
    return this.lap === 0 ? null : this.time - this.lapStart;
  }
}

export function formatTime(t) {
  if (t === null || t === undefined) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
