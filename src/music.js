// Background music: an original synth track, composed here as note lists and rendered
// once by an OfflineAudioContext into a seamless looping buffer. A live note scheduler
// would stutter whenever the main thread is busy (track builds, shader compiles); a
// buffer keeps playing through all of that, and the render itself runs off the main thread.
//
// 32 bars at 124 BPM (about a minute) in A minor:
//   bars  1-8   verse, the groove on its own
//   bars  9-16  verse with the lead
//   bars 17-24  chorus: long rising lead notes over a new progression
//   bars 25-32  verse with the lead, an octave up

const BPM = 124;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 32;
const TAIL = 4; // s rendered past the end, then folded onto the start so echoes wrap around the loop

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// chords as [bass root, ...pad notes], one per bar
const AM = [33, 57, 60, 64], F = [29, 57, 60, 65], C = [36, 55, 60, 64], G = [31, 55, 59, 62];
const EM = [28, 55, 59, 64], E = [28, 56, 59, 64];
const VERSE = [AM, F, C, G, AM, F, C, G];
const CHORUS = [F, G, AM, EM, F, G, C, E];
const SONG = [...VERSE, ...VERSE, ...CHORUS, ...VERSE];

// lead lines: [bar, beat, length in beats, midi note]
const LEAD_VERSE = [
  [0, 0, 1.5, 76], [0, 1.5, 0.5, 74], [0, 2, 1, 72], [0, 3, 1, 69],
  [1, 0, 1.5, 72], [1, 1.5, 0.5, 69], [1, 2, 1, 65], [1, 3, 1, 69],
  [2, 0, 1, 67], [2, 1, 1, 72], [2, 2, 1.5, 76], [2, 3.5, 0.5, 79],
  [3, 0, 2.5, 74], [3, 2.5, 0.5, 71], [3, 3, 1, 67],
  [4, 0, 1.5, 81], [4, 1.5, 0.5, 79], [4, 2, 1, 76], [4, 3, 1, 72],
  [5, 0, 1, 77], [5, 1, 0.5, 76], [5, 1.5, 0.5, 72], [5, 2, 2, 69],
  [6, 0, 1, 67], [6, 1, 1, 72], [6, 2, 1, 76], [6, 3, 1, 79],
  [7, 0, 1, 74], [7, 1, 1, 76], [7, 2, 1, 74], [7, 3, 1, 71],
];
const LEAD_CHORUS = [
  [0, 0, 2, 81], [0, 2, 2, 84],
  [1, 0, 2, 83], [1, 2, 2, 79],
  [2, 0, 1.5, 81], [2, 1.5, 0.5, 76], [2, 2, 2, 72],
  [3, 0, 2, 71], [3, 2, 2, 76],
  [4, 0, 2, 77], [4, 2, 2, 81],
  [5, 0, 2, 79], [5, 2, 2, 83],
  [6, 0, 3, 84], [6, 3, 1, 79],
  [7, 0, 2, 80], [7, 2, 2, 83],
];

/** Small seeded generator, so every render of the track is the same. */
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.floor(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0), r = rng(7);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return b;
}

/** A decaying stereo noise tail for the reverb. */
function reverbImpulse(ctx, seconds) {
  const n = Math.floor(seconds * ctx.sampleRate);
  const b = ctx.createBuffer(2, n, ctx.sampleRate), r = rng(21);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * (1 - i / n) ** 3;
  }
  return b;
}

/** Render the whole track and return it as an AudioBuffer ready to loop. */
export async function renderMusic(sampleRate) {
  const length = BARS * BAR;
  const ctx = new OfflineAudioContext(2, Math.ceil((length + TAIL) * sampleRate), sampleRate);
  const noise = noiseBuffer(ctx, 1);

  const master = ctx.createGain();
  master.connect(ctx.destination);
  const reverb = ctx.createConvolver();
  reverb.buffer = reverbImpulse(ctx, 2.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  reverb.connect(wet).connect(master);
  // dotted-eighth echo, on the arp and the lead
  const echo = ctx.createDelay(2);
  echo.delayTime.value = BEAT * 0.75;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  echo.connect(feedback).connect(echo);
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.3;
  echo.connect(echoOut).connect(master);
  // everything but the drums ducks on each beat, under the kick
  const pumped = ctx.createGain();
  pumped.connect(master);
  for (let i = 0; i < BARS * 4; i++) {
    pumped.gain.setValueAtTime(0.6, i * BEAT);
    pumped.gain.linearRampToValueAtTime(1, i * BEAT + BEAT * 0.6);
  }

  const send = (node, out, reverbAmount = 0, echoAmount = 0) => {
    node.connect(out);
    for (const [dest, amount] of [[reverb, reverbAmount], [echo, echoAmount]]) {
      if (!amount) continue;
      const g = ctx.createGain();
      g.gain.value = amount;
      node.connect(g).connect(dest);
    }
  };
  const padBus = ctx.createGain(), arpBus = ctx.createGain(), leadBus = ctx.createGain();
  send(padBus, pumped, 0.5);
  send(arpBus, pumped, 0.15, 0.6);
  send(leadBus, pumped, 0.35, 0.45);

  /** One oscillator note through a lowpass, with an attack / exponential-release envelope. */
  function tone(out, { t, dur, freq, type = 'sawtooth', detune = 0, gain, attack = 0.005, release = 0.08, cutoff = 20000, cutoffEnd = cutoff, q = 0.7 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(cutoffEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(dur, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack) + release);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + Math.max(dur, attack) + release + 0.02);
    return o;
  }

  function kick(t) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  }

  function noiseHit(t, { type, freq, gain, decay, q = 0.7 }) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    s.connect(f).connect(g);
    send(g, master, 0.1);
    s.start(t, (t * 0.37) % 0.7);
    s.stop(t + decay + 0.02);
  }

  function snare(t) {
    noiseHit(t, { type: 'bandpass', freq: 2100, gain: 0.5, decay: 0.2, q: 0.5 });
    tone(master, { t, dur: 0.03, freq: 190, type: 'triangle', gain: 0.3, release: 0.09 });
  }

  SONG.forEach(([root, ...pad], bar) => {
    const t0 = bar * BAR;
    const chorus = bar >= 16 && bar < 24;
    const intro = bar < 4; // the track starts on the pad, bass and arp, then the drums join

    // pad: two detuned saws per chord note, the filter opening in the chorus
    for (const n of pad) {
      for (const detune of [-7, 7]) {
        tone(padBus, {
          t: t0, dur: BAR - 0.04, freq: hz(n), detune, gain: 0.045, attack: 0.12, release: 0.2,
          cutoff: chorus ? 1500 : 800, cutoffEnd: chorus ? 2400 : 1300,
        });
      }
    }

    // bass: driving eighths, jumping up the octave on the offbeat before the next bar
    for (let i = 0; i < 8; i++) {
      const note = i === 7 ? root + 12 : root;
      tone(pumped, { t: t0 + i * BEAT / 2, dur: BEAT * 0.36, freq: hz(note + 12), gain: 0.34, release: 0.05, cutoff: 900, cutoffEnd: 320, q: 3 });
      tone(pumped, { t: t0 + i * BEAT / 2, dur: BEAT * 0.36, freq: hz(note), type: 'sine', gain: 0.3, release: 0.05 });
    }

    // arp: sixteenths up and down the chord, the top note an octave higher in the chorus
    const up = [...pad, pad[0] + 12, pad[1] + 12];
    const pattern = [0, 1, 2, 3, 4, 3, 2, 1];
    for (let i = 0; i < 16; i++) {
      const n = up[pattern[i % 8]] + 12;
      tone(arpBus, {
        t: t0 + (i * BEAT) / 4, dur: BEAT * 0.12, freq: hz(n), type: 'square', gain: i % 4 === 0 ? 0.075 : 0.05,
        release: 0.09, cutoff: chorus ? 5200 : 3400, cutoffEnd: 1100, q: 2,
      });
    }

    if (intro) return;
    for (let beat = 0; beat < 4; beat++) {
      const t = t0 + beat * BEAT;
      kick(t);
      if (beat % 2 === 1) snare(t);
      noiseHit(t + BEAT / 2, { type: 'highpass', freq: 8000, gain: 0.16, decay: 0.09 });
      noiseHit(t, { type: 'highpass', freq: 9500, gain: 0.06, decay: 0.03 });
    }
    // a drum fill into every eighth bar
    if (bar % 8 === 7) for (const k of [3.25, 3.5, 3.75]) snare(t0 + k * BEAT);
  });

  /** A lead note: two saws with a slow vibrato that fades in on the longer notes. */
  function lead(t, beats, midi) {
    const dur = beats * BEAT * 0.94;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(beats > 1 ? 14 : 0, t + dur);
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(t + dur + 0.3);
    for (const [type, detune, gain] of [['sawtooth', -5, 0.075], ['triangle', 5, 0.12]]) {
      const o = tone(leadBus, { t, dur, freq: hz(midi), type, detune, gain, attack: 0.012, release: 0.16, cutoff: 3600, cutoffEnd: 2100 });
      depth.connect(o.detune);
    }
  }
  const play = (line, firstBar, transpose = 0) => {
    for (const [bar, beat, beats, n] of line) lead((firstBar + bar) * BAR + beat * BEAT, beats, n + transpose);
  };
  play(LEAD_VERSE, 8);
  play(LEAD_CHORUS, 16);
  play(LEAD_VERSE, 24, 12);

  const rendered = await ctx.startRendering();

  // fold the tail back onto the start, so the echoes and reverb carry across the loop point
  const n = Math.round(length * sampleRate);
  const out = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate });
  let peak = 0;
  const channels = [0, 1].map((c) => {
    const src = rendered.getChannelData(c);
    const dst = src.slice(0, n);
    for (let i = n; i < src.length; i++) dst[i - n] += src[i];
    for (const v of dst) peak = Math.max(peak, Math.abs(v));
    return dst;
  });
  channels.forEach((dst, c) => {
    const k = 0.9 / (peak || 1);
    for (let i = 0; i < n; i++) dst[i] *= k;
    out.copyToChannel(dst, c);
  });
  return out;
}
