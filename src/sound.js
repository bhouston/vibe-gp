// Game audio. Everything is synthesised with the Web Audio API: there are no sample files.
//
//   master -> limiter -> speakers
//     music   the looping track from music.js (on / off in Settings)
//     sfx     (on / off in Settings; silent behind the menu)
//       car   engine, tyres, impacts: quieter and duller the further the camera is
//       wind  on-board only: there is no rushing air at a trackside camera
//
// Engine: one signal (the crank's four-stroke cycle frequency, from physics.rpm) drives
// every voice, so the harmonics stay locked together and the pitch follows the wheels,
// wheelspin and gear changes included. The voices are a PeriodicWave for the exhaust with
// its energy on the firing orders of a V6 (6 pulses per cycle), a brighter one faded in by
// the throttle, combustion rasp (noise gated at the firing frequency), and the turbo whine.
//
// Tyres: a layer per kind of ground, mixed by how many wheels are on it and panned to the
// side those wheels are on, so a pair of wheels dropping onto the grass is heard on that
// side. Kerb ridges buzz at speed / ridge spacing, from the surface's own bumpWavelength.
// Tyres sliding on a paved surface squeal; on loose ground they just dig in louder.
//
// Browsers only start audio after a user gesture, so nothing is created until the first
// key press or click; until then update() just throws away the collisions it is given.

import { renderMusic } from './music.js';

const REDLINE = 13000; // rpm at physics.rpm = 1 (its idle, 0.45, is then a realistic ~5800)
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

/**
 * A V6 exhaust as harmonics of the four-stroke cycle: a firing order every 6th harmonic,
 * the bank-to-bank order on every 3rd, and a little of everything else for the unevenness
 * between cylinders. `bright` is how slowly the harmonics fall away.
 */
function exhaustWave(ctx, bright, seed) {
  const N = 110;
  const random = rng(seed);
  const real = new Float32Array(N), imag = new Float32Array(N);
  for (let k = 1; k < N; k++) {
    const order = k / 6;
    const a = (k % 6 === 0 ? 1 : k % 3 === 0 ? 0.42 : 0.1 + random() * 0.1) / order ** (1.7 - bright);
    const phase = random() * Math.PI * 2;
    real[k] = a * Math.cos(phase);
    imag[k] = a * Math.sin(phase);
  }
  return ctx.createPeriodicWave(real, imag);
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
    const limiter = ctx.createDynamicsCompressor();
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

    const body = this.gain(1); // into the saturation
    this.engineOff = this.gain(0.5); // closed throttle: the mellow exhaust
    this.engineOn = this.gain(0); // open throttle: the hard, bright one
    const calm = exhaustWave(ctx, 0.3, 11), hard = exhaustWave(ctx, 0.95, 23);
    voice(calm, -4).connect(this.engineOff);
    voice(calm, 5).connect(this.engineOff);
    voice(hard, -3).connect(this.engineOn);
    voice(hard, 4).connect(this.engineOn);
    this.engineOff.connect(body);
    this.engineOn.connect(body);

    // combustion rasp: noise opened and closed at the firing frequency
    const firing = ctx.createOscillator();
    firing.frequency.value = 0;
    const six = this.gain(6);
    cycle.connect(six).connect(firing.frequency);
    firing.start();
    this.rasp = this.gain(0);
    const gate = this.gain(0.5);
    const depth = this.gain(0.5);
    firing.connect(depth).connect(gate.gain);
    this.loop('white').connect(this.filter('bandpass', 2600, 0.8)).connect(gate).connect(this.rasp).connect(body);

    // saturation, then a lowpass that the throttle and the revs open up
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1023.5) - 1) * 2.4);
    shaper.curve = curve;
    shaper.oversample = '2x';
    this.engineTone = this.filter('lowpass', 1500, 0.6);
    const presence = this.filter('peaking', 1150, 0.9);
    presence.gain.value = 3;
    this.engineGain = this.gain(0);
    this.shift = this.gain(1); // ducks through each gear change
    body.connect(shaper).connect(this.engineTone).connect(presence).connect(this.engineGain).connect(this.shift).connect(this.carBus);

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

    // tyre squeal: two near-unison tones, wobbling, with a bit of scrub noise
    this.squeal = this.gain(0);
    this.squealPan = ctx.createStereoPanner();
    this.squeal.connect(this.squealPan).connect(this.carBus);
    this.squealPitch = ctx.createConstantSource();
    this.squealPitch.offset.value = 880;
    this.squealPitch.start();
    const wobble = this.gain(70);
    this.loop('wander', 1.6).connect(wobble);
    const body = this.filter('bandpass', 1500, 1.2);
    for (const ratio of [1, 1.37]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 0;
      const scale = this.gain(ratio);
      this.squealPitch.connect(scale).connect(o.frequency);
      wobble.connect(o.frequency);
      o.connect(body);
      o.start();
    }
    body.connect(this.squeal);
    const scrub = this.gain(0.35);
    this.loop('white').connect(this.filter('bandpass', 2600, 1)).connect(scrub).connect(this.squeal);
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
    const norm = clamp(reverse ? 0.45 + Math.abs(car.speed) * 0.03 : car.rpm, 0.18, 1);
    const throttle = car.throttle;
    const load = throttle ** 0.8;
    this.glide(this.cycle.offset, ((norm * REDLINE) / 120) * doppler, 0.018);

    const r = clamp((norm - 0.4) / 0.6); // 0 at idle, 1 at the redline
    this.glide(this.engineOn.gain, load * 0.95, 0.03);
    this.glide(this.engineOff.gain, 0.6 - load * 0.35, 0.03);
    this.glide(this.rasp.gain, 0.05 + load * 0.3 * (0.4 + 0.6 * r), 0.03);
    this.glide(this.engineTone.frequency, 900 + (1000 + load * 7500) * (0.35 + 0.65 * r), 0.03);
    this.glide(this.engineGain.gain, (0.13 + load * 0.3) * (0.72 + 0.28 * r), 0.03);

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
          g.setTargetAtTime(0.28, t, 0.006);
          g.setTargetAtTime(1, t + 0.05, 0.018);
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
      const over = clamp((w.slide - 0.95) / 0.5) * fast;
      if (layer === 'road' || layer === 'kerb') {
        squeal += over * 0.25;
        squealSide += over * 0.25 * left;
        squealSlip = Math.max(squealSlip, slip);
      } else amount[layer] += over * 0.2; // loose ground: sliding just digs in louder
    }

    const v = Math.abs(car.speed);
    const speed = clamp(v / 80);
    const moving = clamp(v / 4); // nothing rolling, nothing to hear
    const levels = {
      road: 0.2 * speed ** 0.8,
      kerb: 0.7 * clamp(v / 30) ** 0.7,
      grass: 0.6 * clamp(v / 45) ** 0.6,
      sand: 0.6 * clamp(v / 40) ** 0.6,
    };
    for (const name of LAYERS) {
      const L = this.layers[name];
      this.glide(L.gain.gain, amount[name] * levels[name] * moving, 0.035);
      // left wheels are heard on the left (pan -1)
      this.glide(L.pan.pan, amount[name] ? clamp(-side[name] / amount[name]) * 0.6 : 0, 0.05);
    }
    const { road, kerb, grass, sand } = this.layers;
    this.glide(road.low.frequency, 110 + v * 3.4, 0.08);
    this.glide(road.high.frequency, 500 + v * 22, 0.08);
    this.glide(kerb.ridge.frequency, Math.max(v / ridgeSpacing, 4), 0.02);
    grass.swish.playbackRate.value = 0.35 + v / 18;
    sand.grains.playbackRate.value = 0.5 + v / 28;

    this.glide(this.squeal.gain, squeal ** 0.7 * 0.3, squeal > 0 ? 0.03 : 0.07);
    this.glide(this.squealPan.pan, squeal ? clamp(-squealSide / squeal) * 0.5 : 0, 0.05);
    this.glide(this.squealPitch.offset, 760 + clamp(squealSlip / 30) * 420, 0.06);
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
    const level = 0.35 + s ** 0.6 * 0.75;
    const out = ctx.createStereoPanner();
    out.pan.value = clamp(-side) * 0.55;
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
