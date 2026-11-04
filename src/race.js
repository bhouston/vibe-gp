// Lap timing based on distance along the track centreline.
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
    this.prevF = null;
    this.flash = null; // { text, until }
  }

  /** s = distance along the lap (m), length = lap length (m). Line is at s = 0. */
  update(s, length, dt) {
    this.time += dt;
    const f = s / length;
    if (this.prevF !== null) {
      // halfway checkpoint stops lap cheating by reversing over the line
      if (f > 0.4 && f < 0.6) this.halfway = true;
      const crossedForward = this.prevF > 0.9 && f < 0.1;
      const crossedBackward = this.prevF < 0.1 && f > 0.9;
      if (crossedForward) this.crossLine();
      if (crossedBackward) this.halfway = false;
    }
    this.prevF = f;
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

const RED_STEP = 0.6; // s between each red coming on
const GREEN_AT = 3.6; // s after the reset: all five turn green and the car is let go
const GREEN_FOR = 3; // s the green stays on before the gantry goes dark
const RED = 0xff1a1a, GREEN = 0x00ff30;

/** The start sequence on the gantry lamps (materials from Track); holds the car until green. */
export class StartLights {
  reset(lamps) {
    this.lamps = lamps;
    this.time = 0;
    this.paint();
  }

  get holding() {
    return this.time < GREEN_AT;
  }

  /** How far the sequence has got: the number of reds lit, then 6 once it is green. */
  get step() {
    return this.holding ? Math.floor(this.time / RED_STEP) : 6;
  }

  update(dt) {
    const before = this.step;
    this.time += dt;
    this.paint();
    if (this.step !== before) this.onStep?.(!this.holding);
  }

  paint() {
    const reds = this.holding ? this.step : 0;
    const green = !this.holding && this.time < GREEN_AT + GREEN_FOR;
    this.lamps.forEach((lamp, i) => {
      // the lamps run right to left from the driver's seat: fill from the driver's left
      lamp.emissive.setHex(green ? GREEN : i >= 5 - reds ? RED : 0x000000);
      lamp.emissiveIntensity = green ? 0.7 : 0.5; // any brighter and the tone mapping bleaches them
    });
  }
}

export function formatTime(t) {
  if (t === null || t === undefined) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
