// Game audio. Everything is synthesised with the Web Audio API: there are no sample files.
//
//   master -> limiter -> speakers
//     music   the looping track from music.js (on / off in Settings)
//     sfx     (on / off in Settings; silent behind the menu)
//       car   engine, tyres, impacts: quieter and duller the further the camera is
//       wind  on-board only: there is no rushing air at a trackside camera
//
// Engine: built from the measured spectrum of a real hybrid V6 (engineProfile.js). One
// signal (the four-stroke cycle frequency, from physics.rpm) drives every voice, so the
// harmonics stay locked together and the pitch follows the wheels, wheelspin and gear
// changes included.
//   banks  oscillators with the measured harmonic levels, one wave for on throttle and one
//          for off, slightly apart in stereo
//   noise  the broadband floor between the harmonics, pulsing with the engine's main note
//   turbo  the turbo whine
// The harmonics and the noise then pass through FIR filters with the measured fixed
// resonances: the harmonics sweep through those as the revs change. No two combustion
// cycles are the same, so a little random pitch and level wander runs through it all,
// most at idle, where it gives the engine its lope.
//
// Tyres: a layer per kind of ground, mixed by how many wheels are on it and panned to the
// side those wheels are on, so a pair of wheels dropping onto the grass is heard on that
// side. Kerb ridges buzz at speed / ridge spacing, from the surface's own bumpWavelength.
// A car really sliding on a paved surface (body sideways, wheelspin, lock-up) scrubs with a
// high hiss; normal cornering is silent, since the steering assist holds the front tyres
// past their grip peak in every turn. On loose ground sliding tyres just dig in louder.
//
// Browsers only start audio after a user gesture, so nothing is created until the first
// key press or click; until then update() just throws away the collisions it is given.

import { renderMusic } from './music.js';
import { BANDS_HZ, ENGINE } from './engineProfile.js';

const REDLINE = 13000; // rpm at physics.rpm = 1 (its idle, 0.45, is then a realistic ~5800)
// set by comparing the game's output with the recording, through the same analysis
const HARMONIC_LEVEL = 9;
const NOISE_LEVEL = 85;
const TIMING_JITTER = 0.05; // of the cycle frequency, per unit of the noise source
const SOUND_SPEED = 343; // m/s, for the Doppler shift at the TV cameras

// what you hear from each camera; tone = lowpass cutoff on everything from the car
const VIEWS = {
  chase: { car: 0.9, wind: 0.7, tone: 16000 },
  far: { car: 0.72, wind: 0.5, tone: 9000 },
  cockpit: { car: 1, wind: 0.95, tone: 20000 },
  driver: { car: 0.85, wind: 1.1, tone: 7000 }, // in the helmet
};

// which tyre layer each surface uses; sandy circuits swap grass for sand (see setTrack)
const LAYER_OF = { asphalt: 'road', runoff: 'road', kerb: 'kerb', sausage: 'kerb', grass: 'grass', gravel: 'sand' };
const LAYERS = ['road', 'kerb', 'grass', 'sand'];

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const clampPan = (x) => clamp(x, -1, 1);

/** Small seeded generator: the engine's harmonics are the same on every run. */
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Looping stereo noise. shape: 'white', 'pink' or 'brown'. The ends are cross-faded so the loop has no click. */
function noiseBuffer(ctx, seconds, shape) {
  const fade = Math.floor(ctx.sampleRate * 0.05);
  const n = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const raw = new Float32Array(n + fade);
    let b0 = 0, b1 = 0, b2 = 0, brown = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      if (shape === 'white') raw[i] = w * 0.5;
      else if (shape === 'pink') {
        // Paul Kellet's three-pole approximation of a -3 dB/octave slope
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        raw[i] = (b0 + b1 + b2 + w * 0.1848) * 0.15;
      } else {
        brown = (brown + w * 0.02) / 1.02;
        raw[i] = brown * 3.2;
      }
    }
    const d = buffer.getChannelData(c);
    d.set(raw.subarray(0, n));
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = raw[i] * k + raw[n + i] * (1 - k);
    }
  }
  return buffer;
}

/** Sparse little noise bursts: stones and sand grains hitting the floor. */
function grainBuffer(ctx, seconds, perSecond) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buffer.getChannelData(c);
    for (let g = 0; g < seconds * perSecond; g++) {
      const at = Math.floor(Math.random() * n);
      const len = Math.floor(ctx.sampleRate * (0.001 + Math.random() * 0.007));
      const amp = 0.25 + Math.random() ** 3 * 0.75;
      for (let i = 0; i < len; i++) d[(at + i) % n] += (Math.random() * 2 - 1) * amp * (1 - i / len) ** 2;
    }
  }
  return buffer;
}

/** A slowly wandering level between 0 and 1, for grass swish and gusts: `rate` new values per second. */
function wanderBuffer(ctx, seconds, rate) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buffer.getChannelData(0);
  const count = Math.round(seconds * rate);
  const points = Array.from({ length: count }, () => Math.random());
  for (let i = 0; i < n; i++) {
    const x = (i / n) * count, k = Math.floor(x), f = x - k;
    const s = f * f * (3 - 2 * f);
    d[i] = points[k] * (1 - s) + points[(k + 1) % count] * s;
  }
  return buffer;
}

/** A wave with the measured harmonic levels (dB per order); `seed` sets the random phases. */
function engineWave(ctx, orders, seed) {
  const random = rng(seed);
  const real = new Float32Array(orders.length + 1), imag = new Float32Array(orders.length + 1);
  orders.forEach((db, i) => {
    const a = 10 ** (db / 20), phase = random() * Math.PI * 2;
    real[i + 1] = a * Math.cos(phase);
    imag[i + 1] = a * Math.sin(phase);
  });
  return ctx.createPeriodicWave(real, imag);
}

/** Linear-phase FIR with the magnitude response `db` at BANDS_HZ, as a mono buffer for a ConvolverNode. */
function firBuffer(ctx, db, taps = 2048) {
  const sr = ctx.sampleRate, bins = taps / 2;
  const gains = new Float32Array(bins + 1);
  for (let m = 0, b = 0; m <= bins; m++) {
    const f = (m * sr) / taps;
    while (b < BANDS_HZ.length - 2 && BANDS_HZ[b + 1] < f) b++;
    const u = clamp(Math.log(Math.max(f, 1) / BANDS_HZ[b]) / Math.log(BANDS_HZ[b + 1] / BANDS_HZ[b]));
    gains[m] = 10 ** ((db[b] * (1 - u) + db[b + 1] * u) / 20);
  }
  const buffer = ctx.createBuffer(1, taps, sr);
  const h = buffer.getChannelData(0);
  const cos = Float32Array.from({ length: taps }, (_, i) => Math.cos((2 * Math.PI * i) / taps));
  for (let n = 0; n < taps; n++) {
    let sum = gains[0];
    for (let m = 1; m < bins; m++) sum += 2 * gains[m] * cos[(m * (n - bins) + taps * bins) % taps];
    h[n] = (sum / taps) * (0.5 - 0.5 * cos[n]); // Hann window
  }
  return buffer;
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.sandy = false; // the circuit's "grass" is really sand (desert and dune circuits)
    this.musicStarted = false;
    this.gear = 1;
    this.prevThrottle = 0;
    this.boost = 0; // turbo spool, follows throttle and revs with a lag
    this.lastHit = -1;
    this.lastHitStrength = 0;
    this.lastShift = -1;

    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, true);
    addEventListener('keydown', unlock, true);
    // no frames are drawn in a hidden tab, so the car's sound would hang on one note
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  /** First user gesture: build the audio graph. Later gestures just wake a stalled context. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.buildBuses();
    this.buffers = {
      white: noiseBuffer(ctx, 4, 'white'),
      pink: noiseBuffer(ctx, 5, 'pink'),
      brown: noiseBuffer(ctx, 6, 'brown'),
      grains: grainBuffer(ctx, 6, 260),
      wander: wanderBuffer(ctx, 8, 14),
    };
    this.buildEngine();
    this.buildTyres();
    this.buildWind();
    this.buildScrape();
    this.setMusic(this.musicOn);
    this.setSfx(this.sfxOn);
    ctx.resume();
  }

  gain(value = 0) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  filter(type, frequency, Q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = Q;
    return f;
  }

  /** A looping source of one of the noise buffers, started at a random point. */
  loop(name, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffers[name];
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(0, Math.random() * s.buffer.duration);
    return s;
  }

  /** Glide an AudioParam to `value`, reaching ~63% of the way in `tc` seconds. */
  glide(param, value, tc = 0.03) {
    param.setTargetAtTime(value, this.ctx.currentTime, tc);
  }

  buildBuses() {
    const { ctx } = this;
    const limiter = (this.limiter = ctx.createDynamicsCompressor());
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.14;
    this.master = this.gain(0.85);
    this.master.connect(limiter).connect(ctx.destination);
    this.musicBus = this.gain(0);
    this.musicBus.connect(this.master);
    this.sfx = this.gain(0);
    this.sfx.connect(this.master);
    // the camera's view: `carBus` level, `carTone` cutoff; wind has its own level
    this.carTone = this.filter('lowpass', 16000, 0.4);
    this.carBus = this.gain(0);
    this.carBus.connect(this.carTone).connect(this.sfx);
    this.windBus = this.gain(0);
    this.windBus.connect(this.sfx);
  }

  buildEngine() {
    const { ctx } = this;
    // the one signal behind every voice: crank cycles per second
    const cycle = (this.cycle = ctx.createConstantSource());
    cycle.offset.value = (0.45 * REDLINE) / 120;
    cycle.start();
    const voice = (wave, detune) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = 0;
      o.detune.value = detune;
      cycle.connect(o.frequency);
      o.start();
      return o;
    };

    const convolver = (db) => {
      const c = ctx.createConvolver();
      c.normalize = false;
      c.buffer = firBuffer(ctx, db);
      return c;
    };

    // combustion varies from cycle to cycle: the same wander shakes the pitch and the level
    const wander = this.loop('wander', 3.5);
    this.pitchJitter = this.gain(0);
    wander.connect(this.pitchJitter).connect(cycle.offset);
    this.rough = this.gain(1);
    this.roughDepth = this.gain(0);
    wander.connect(this.roughDepth).connect(this.rough.gain);
    // and each firing lands a little early or late: fast timing jitter, which smears the
    // high harmonics more than the low ones, as in the recordings
    this.timingJitter = this.gain(0);
    this.loop('pink').connect(this.filter('lowpass', 220, 0.5)).connect(this.timingJitter).connect(cycle.offset);

    // the harmonics: per bank, the on- and off-throttle waves
    this.banks = [[11, 23, -4, -0.25], [17, 31, 5, 0.25]].map(([offSeed, onSeed, detune, pan]) => {
      const off = this.gain(1), on = this.gain(0);
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      voice(engineWave(ctx, ENGINE.off.orders, offSeed), detune).connect(off).connect(panner);
      voice(engineWave(ctx, ENGINE.on.orders, onSeed), -detune).connect(on).connect(panner);
      panner.connect(this.rough);
      return { on, off };
    });
    this.engineTone = this.filter('lowpass', 16000, 0.5);
    this.engineGain = this.gain(0);
    this.shift = this.gain(1); // ducks through each gear change
    // the recordings carry a comb: notches at odd multiples of 472 Hz, peaks at multiples of
    // 944 Hz. That is one reflection arriving 1.06 ms late (about 36 cm of extra path).
    const reflection = ctx.createDelay(0.01);
    reflection.delayTime.value = 0.00106;
    const reflected = this.gain(0.5);
    this.shift.connect(reflection).connect(reflected).connect(this.carBus);
    this.rough.connect(convolver(ENGINE.on.resonance)).connect(this.engineTone).connect(this.engineGain).connect(this.shift);
    this.shift.connect(this.carBus);

    // the noise floor, pulsing with the main note (order 3)
    const note = ctx.createOscillator();
    note.frequency.value = 0;
    const three = this.gain(3);
    cycle.connect(three).connect(note.frequency);
    note.start();
    const pulse = this.gain(0.9);
    const pulseDepth = this.gain(0.1);
    note.connect(pulseDepth).connect(pulse.gain);
    this.noiseGain = this.gain(0);
    this.loop('white').connect(pulse).connect(convolver(ENGINE.on.noise)).connect(this.noiseGain).connect(this.shift);

    // turbo / MGU-H whine
    this.turbo = ctx.createOscillator();
    this.turbo.frequency.value = 2600;
    this.turboGain = this.gain(0);
    this.turbo.connect(this.turboGain).connect(this.carBus);
    this.turbo.start();
  }

  buildTyres() {
    const { ctx } = this;
    this.layers = {};
    const layer = (name) => {
      const gain = this.gain(0);
      const pan = ctx.createStereoPanner();
      gain.connect(pan).connect(this.carBus);
      return (this.layers[name] = { gain, pan });
    };

    // road: a low rumble and a hiss that both climb with speed
    const road = layer('road');
    road.low = this.filter('bandpass', 200, 0.8);
    road.high = this.filter('bandpass', 900, 0.6);
    const roadHiss = this.gain(0.28);
    this.loop('brown').connect(road.low).connect(road.gain);
    this.loop('pink').connect(road.high).connect(roadHiss).connect(road.gain);

    // kerb: the ridges, as a buzz at speed / spacing, chopping a burst of noise at the same rate
    const kerb = layer('kerb');
    kerb.ridge = ctx.createOscillator();
    kerb.ridge.type = 'sawtooth';
    kerb.ridge.frequency.value = 40;
    kerb.ridge.start();
    const ridgeTone = this.gain(0.8);
    kerb.ridge.connect(this.filter('lowpass', 420, 1.2)).connect(ridgeTone).connect(kerb.gain);
    const chop = this.gain(0.5);
    const chopDepth = this.gain(0.5);
    kerb.ridge.connect(chopDepth).connect(chop.gain);
    this.loop('pink').connect(this.filter('bandpass', 650, 0.7)).connect(chop).connect(kerb.gain);

    // grass: soft swishing blades that come and go, over the thud of uneven ground
    const grass = layer('grass');
    grass.swish = this.loop('wander');
    const blades = this.gain(0.25);
    const bladeDepth = this.gain(0.75);
    grass.swish.connect(bladeDepth).connect(blades.gain);
    this.loop('pink').connect(this.filter('bandpass', 1100, 0.5)).connect(blades).connect(grass.gain);
    const thud = this.gain(0.9);
    this.loop('brown').connect(this.filter('lowpass', 130, 0.7)).connect(thud).connect(grass.gain);

    // sand and gravel: a crunchy hail of grains over a dry hiss, with a deep drag underneath
    const sand = layer('sand');
    sand.grains = this.loop('grains');
    const crunch = this.gain(1.1);
    sand.grains.connect(this.filter('highpass', 1300, 0.7)).connect(crunch).connect(sand.gain);
    const hiss = this.gain(0.5);
    this.loop('white').connect(this.filter('bandpass', 4200, 0.5)).connect(hiss).connect(sand.gain);
    const drag = this.gain(0.7);
    this.loop('brown').connect(this.filter('lowpass', 240, 0.7)).connect(drag).connect(sand.gain);

    // tyre scrub: two high bands of noise, chattering. Noise on purpose: any oscillator
    // here sounds like a musical note rather than rubber.
    this.squeal = this.gain(0);
    this.squealPan = ctx.createStereoPanner();
    this.squeal.connect(this.squealPan).connect(this.carBus);
    const chatter = this.gain(0.55);
    const chatterDepth = this.gain(0.9);
    this.loop('wander', 30).connect(chatterDepth).connect(chatter.gain);
    this.squealBands = [this.filter('bandpass', 3400, 3), this.filter('bandpass', 5200, 3.5)];
    for (const band of this.squealBands) this.loop('white').connect(band).connect(chatter);
    chatter.connect(this.squeal);
  }

  buildWind() {
    // two bands of stereo noise, so the air sits all around the head; the wander source
    // gusts it a little
    this.windLow = this.filter('bandpass', 300, 0.6);
    this.windHigh = this.filter('highpass', 2500, 0.5);
    this.windLowGain = this.gain(0);
    this.windHighGain = this.gain(0);
    this.loop('pink').connect(this.windLow).connect(this.windLowGain);
    this.loop('white').connect(this.windHigh).connect(this.windHighGain);
    const gust = this.gain(0.8);
    const gustDepth = this.gain(0.4);
    this.loop('wander', 0.05).connect(gustDepth).connect(gust.gain);
    this.windLowGain.connect(gust);
    this.windHighGain.connect(gust);
    gust.connect(this.windBus);
  }

  buildScrape() {
    // sliding along a barrier: grinding noise whose pitch climbs with the sliding speed
    this.scrapeGain = this.gain(0);
    this.scrapeTone = this.filter('bandpass', 900, 1.6);
    this.scrapeGrains = this.loop('grains', 2);
    const noise = this.gain(0.5);
    this.scrapeGrains.connect(this.scrapeTone);
    this.loop('white').connect(noise).connect(this.scrapeTone);
    this.scrapeTone.connect(this.scrapeGain).connect(this.carBus);
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.glide(this.musicBus.gain, on ? 0.5 : 0, 0.25);
    if (on && !this.musicStarted) this.startMusic();
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.ctx) this.glide(this.sfx.gain, on ? 1 : 0, 0.08);
  }

  async startMusic() {
    this.musicStarted = true;
    try {
      const buffer = await renderMusic(this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.connect(this.musicBus);
      s.start();
    } catch (e) {
      console.warn('music render failed', e);
      this.musicStarted = false;
    }
  }

  /** A new circuit: desert and dune circuits' "grass" is sand, and should sound like it. */
  setTrack(def) {
    this.sandy = !!(def.scenery?.desert || def.scenery?.dunes);
  }

  /**
   * Once a frame. car: the CarPhysics; camera, mode: the view; racing: false behind the
   * menu, where the car falls silent and the music comes up.
   */
  update(car, { camera, mode, racing }) {
    // always take these, or a crash before the first key press would play on it
    const hit = car.impact, hitSide = car.impactSide, scrape = car.scrape;
    car.impact = car.scrape = 0;
    if (!this.ctx || this.ctx.state !== 'running') return;

    if (this.musicOn) this.glide(this.musicBus.gain, racing ? 0.3 : 0.55, 0.4);
    const air = Math.hypot(car.vel.x, car.vel.z);
    const doppler = this.updateView(car, air, camera, mode, racing);
    this.updateEngine(car, doppler, racing);
    this.updateTyres(car);
    this.updateWind(air);
    this.glide(this.scrapeGain.gain, clamp(scrape / 45) ** 0.6 * 0.9, scrape > 0 ? 0.015 : 0.07);
    this.glide(this.scrapeTone.frequency, 500 + scrape * 32, 0.05);
    this.scrapeGrains.playbackRate.value = 1 + scrape / 30;
    if (hit > 1 && racing) this.impact(hit, hitSide);
  }

  /** Levels for the camera in use. Returns the Doppler pitch factor (1 on board). */
  updateView(car, air, camera, mode, racing) {
    const on = racing ? 1 : 0;
    const view = VIEWS[mode];
    if (view) {
      this.glide(this.carBus.gain, view.car * on, 0.08);
      this.glide(this.windBus.gain, view.wind * on, 0.08);
      this.glide(this.carTone.frequency, view.tone, 0.08);
      return 1;
    }
    // TV camera: falls away with distance, the air soaks up the highs, and the pitch
    // drops as the car flies past
    const dx = car.position.x - camera.position.x;
    const dy = car.height - camera.position.y;
    const dz = car.position.z - camera.position.z;
    const d = Math.max(Math.hypot(dx, dy, dz), 1);
    this.glide(this.carBus.gain, Math.min(1, 22 / d) * on, 0.08);
    this.glide(this.windBus.gain, 0, 0.08);
    this.glide(this.carTone.frequency, clamp(260000 / d, 1800, 18000), 0.08);
    const away = (car.vel.x * dx + car.vel.z * dz) / d; // + = leaving the camera
    return SOUND_SPEED / (SOUND_SPEED + clamp(air ? away : 0, -120, 120));
  }

  updateEngine(car, doppler, racing) {
    // reversing: the gearbox model holds rpm at idle, so rev up with the speed instead
    const reverse = car.gear === 'R';
    let norm = clamp(reverse ? 0.45 + Math.abs(car.speed) * 0.03 : car.rpm, 0.18, 1);
    // the gearbox model drops further per shift than a real one: in the recordings each
    // upshift falls about 15%, so narrow the rev range once the car is under way
    if (car.gear >= 2) norm = 1 - (1 - norm) * 0.6;
    const throttle = car.throttle;
    const load = throttle ** 0.8;
    this.glide(this.cycle.offset, ((norm * REDLINE) / 120) * doppler, 0.018);

    const r = clamp((norm - 0.4) / 0.6); // 0 at idle, 1 at the redline
    for (const bank of this.banks) {
      this.glide(bank.on.gain, load, 0.03);
      this.glide(bank.off.gain, 1 - load, 0.03);
    }
    const level = (0.09 + load * 0.3) * (0.72 + 0.28 * r);
    this.glide(this.engineTone.frequency, 2400 + load * 14000, 0.03);
    this.glide(this.engineGain.gain, level * HARMONIC_LEVEL, 0.03);
    this.glide(this.noiseGain.gain, level * NOISE_LEVEL, 0.03);
    // the wander is 0..1, so these set its full swing: cycle Hz, and a fraction of the level
    this.glide(this.pitchJitter.gain, ((norm * REDLINE) / 120) * (0.018 - 0.012 * r), 0.05);
    this.glide(this.timingJitter.gain, ((norm * REDLINE) / 120) * TIMING_JITTER, 0.05);
    this.glide(this.roughDepth.gain, 0.34 - 0.24 * r, 0.05);
    this.glide(this.rough.gain, 0.83 + 0.12 * r, 0.05);

    this.boost += (load * r - this.boost) * 0.04;
    this.glide(this.turbo.frequency, 2600 + this.boost * 3800, 0.05);
    this.glide(this.turboGain.gain, 0.012 * this.boost, 0.05);

    const t = this.ctx.currentTime;
    if (typeof car.gear === 'number' && typeof this.gear === 'number' && car.gear !== this.gear && t - this.lastShift > 0.12) {
      this.lastShift = t;
      const g = this.shift.gain;
      g.cancelScheduledValues(t);
      if (car.gear > this.gear) {
        // upshift: the ignition cut
        if (throttle > 0.3) {
          g.setTargetAtTime(0.6, t, 0.01);
          g.setTargetAtTime(1, t + 0.07, 0.03);
        }
      } else {
        // downshift: a blip of throttle
        g.setTargetAtTime(1.3, t, 0.01);
        g.setTargetAtTime(1, t + 0.07, 0.04);
        if (racing && car.rpm > 0.6 && Math.random() < 0.45) this.pop(t + 0.03, 0.5);
      }
    }
    this.gear = car.gear;

    // lifting off from high revs: unburnt fuel popping in the exhaust
    if (racing && this.prevThrottle > 0.6 && throttle < 0.25 && norm > 0.72) {
      for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) this.pop(t + 0.03 + i * 0.05 + Math.random() * 0.04, 0.5 + Math.random() * 0.5);
      this.prevThrottle = 0;
    } else this.prevThrottle = throttle;
  }

  updateTyres(car) {
    const amount = { road: 0, kerb: 0, grass: 0, sand: 0 };
    const side = { road: 0, kerb: 0, grass: 0, sand: 0 };
    let ridgeSpacing = 1.1, squeal = 0, squealSide = 0, squealSlip = 0;
    const drift = clamp((Math.abs(car.slipAngle ?? 0) - 0.08) / 0.2); // the body sideways, from about 5 degrees
    for (const w of car.wheels) {
      const name = w.surface.name;
      const layer = name === 'grass' && this.sandy ? 'sand' : LAYER_OF[name];
      const roll = w.rollSpeed ?? 0;
      const left = w.y > 0 ? 1 : -1;
      amount[layer] += 0.25;
      side[layer] += 0.25 * left;
      if (layer === 'kerb') ridgeSpacing = w.surface.bumpWavelength;

      const slip = Math.abs(w.omega * w.r - roll); // m/s between tread and ground (wheelspin, lock-up)
      const fast = clamp(Math.max(roll, Math.abs(w.omega * w.r)) / 12);
      if (layer === 'road' || layer === 'kerb') {
        const over = Math.max(drift, clamp((Math.abs(w.kappa) - 0.2) / 0.4)) * fast; // sideways, wheelspin or lock-up
        squeal += over * 0.25;
        squealSide += over * 0.25 * left;
        squealSlip = Math.max(squealSlip, slip);
      } else amount[layer] += clamp((w.slide - 0.95) / 0.5) * fast * 0.2; // loose ground: sliding just digs in louder
    }

    const v = Math.abs(car.speed);
    const speed = clamp(v / 80);
    const moving = clamp(v / 4); // nothing rolling, nothing to hear
    const levels = {
      road: 0.5 * speed ** 0.8,
      kerb: 0.24 * clamp(v / 30) ** 0.7,
      grass: 0.6 * clamp(v / 45) ** 0.6,
      sand: 0.6 * clamp(v / 40) ** 0.6,
    };
    for (const name of LAYERS) {
      const L = this.layers[name];
      this.glide(L.gain.gain, amount[name] * levels[name] * moving, 0.035);
      // left wheels are heard on the left (pan -1)
      this.glide(L.pan.pan, amount[name] ? clampPan(-side[name] / amount[name]) * 0.6 : 0, 0.05);
    }
    const { road, kerb, grass, sand } = this.layers;
    this.glide(road.low.frequency, 110 + v * 3.4, 0.08);
    this.glide(road.high.frequency, 500 + v * 22, 0.08);
    this.glide(kerb.ridge.frequency, Math.max(v / ridgeSpacing, 4), 0.02);
    grass.swish.playbackRate.value = 0.35 + v / 18;
    sand.grains.playbackRate.value = 0.5 + v / 28;

    this.glide(this.squeal.gain, squeal ** 0.7 * 0.5, squeal > 0 ? 0.03 : 0.07);
    this.glide(this.squealPan.pan, squeal ? clampPan(-squealSide / squeal) * 0.5 : 0, 0.05);
    const scrub = clamp(squealSlip / 30);
    this.glide(this.squealBands[0].frequency, 3000 + scrub * 900, 0.06);
    this.glide(this.squealBands[1].frequency, 4600 + scrub * 1400, 0.06);
  }

  updateWind(air) {
    const s = clamp(air / 95); // 95 m/s is about the car's top speed
    this.glide(this.windLow.frequency, 180 + air * 11, 0.1);
    this.glide(this.windHigh.frequency, 2000 + air * 30, 0.1);
    this.glide(this.windLowGain.gain, s ** 1.7 * 0.75, 0.1);
    this.glide(this.windHighGain.gain, s ** 2.8 * 0.22, 0.1);
  }

  /** A burst of noise through a filter, for the one-shot sounds. */
  burst(name, { t, type, frequency, Q = 0.7, gain, decay, rate = 1, out = this.carBus }) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffers[name];
    s.playbackRate.value = rate;
    const g = this.gain(0);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    s.connect(this.filter(type, frequency, Q)).connect(g).connect(out);
    s.start(t, Math.random() * (s.buffer.duration - decay - 0.1));
    s.stop(t + decay + 0.02);
  }

  /** One exhaust pop: a short crack with a dull thump behind it. */
  pop(t, strength) {
    this.burst('white', { t, type: 'bandpass', frequency: 1200 + Math.random() * 900, Q: 1, gain: 0.55 * strength, decay: 0.035 });
    this.burst('brown', { t, type: 'lowpass', frequency: 320, gain: 1.1 * strength, decay: 0.05 });
  }

  /**
   * A hit on a barrier. speed: m/s into the wall; side: which side of the car it hit
   * (+ = left). Thump of the chassis, crunch of the bodywork, a ring from the barrier, and
   * from a real hit up, carbon fibre shattering.
   */
  impact(speed, side) {
    const { ctx } = this;
    const t = ctx.currentTime;
    // the wall contact repeats while the car is pressed into it: only a harder one counts
    if (t - this.lastHit < 0.09 && speed < this.lastHitStrength * 1.5) return;
    this.lastHit = t;
    this.lastHitStrength = speed;
    const s = clamp(speed / 28);
    const level = 0.06 + s ** 0.8 * 1.04;
    const out = ctx.createStereoPanner();
    out.pan.value = clampPan(-side) * 0.55;
    out.connect(this.carBus);

    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(130 + s * 40, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const tg = this.gain(0);
    tg.gain.setValueAtTime(level * 1.1, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.2 + s * 0.16);
    thump.connect(tg).connect(out);
    thump.start(t);
    thump.stop(t + 0.42);

    this.burst('white', { t, type: 'bandpass', frequency: 1800 - s * 900, Q: 0.6, gain: level * 1.2, decay: 0.09 + s * 0.28, out });
    this.burst('brown', { t, type: 'lowpass', frequency: 420, gain: level * 1.5, decay: 0.12 + s * 0.2, out });

    // barrier ring: inharmonic partials, as a struck steel rail has
    for (const [f, a] of [[410, 0.09], [1130, 0.06], [2290, 0.035]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * (0.96 + Math.random() * 0.08);
      const g = this.gain(0);
      g.gain.setValueAtTime(a * level, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3 + s * 0.3);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.65);
    }

    if (s > 0.22) {
      this.burst('grains', { t: t + 0.015, type: 'highpass', frequency: 1800, gain: 1.6 * s + 0.4, decay: 0.2 + s * 0.45, rate: 1.4, out });
    }
  }
}
