// Sound, synthesized on demand.
//
// No audio files. Every effect is a short graph of oscillators and filtered
// noise built when it fires and torn down when it finishes. Because each one is
// a function of a few numbers, pitch and length vary per call, so a Fallen pack
// dying does not sound like the same click twelve times.

// Chosen against measured output: the loudest single effect peaks near 0.2 at
// this level, leaving room for several to overlap without clipping.
const MASTER = 0.5;

let actx = null;
let master = null;
let unlocked = false;
let muted = false;
let noiseBuffer = null;

// Accepts an existing context so a host that already owns one can pass it in,
// and so effects can be rendered into an OfflineAudioContext and measured.
export function init(existing) {
  if (actx && !existing) return actx;
  if (existing) actx = existing;
  else {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }
  master = actx.createGain();
  master.gain.value = MASTER;
  master.connect(actx.destination);
  noiseBuffer = makeNoise(actx, 1.6);
  lastPlayed.clear();
  return actx;
}

// Browsers refuse to start audio until the user has interacted, so the first
// gesture resumes the context. Without this the whole system silently no-ops.
export function unlock() {
  if (unlocked) return;
  const ctx = init();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  unlocked = true;
}

export function setMuted(v) { muted = v; if (master) master.gain.value = v ? 0 : MASTER; }
export function isMuted() { return muted; }
export function ready() { return !!actx && actx.state === 'running'; }

function makeNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// A buffer belongs to the context that made it, so the offline context used for
// measurement cannot borrow the live one's noise. The live buffer is built once
// by init(); anything else gets its own, cached so a render does not rebuild it
// per note.
const noiseBuffers = new WeakMap();
function noiseBufferFor(ctx) {
  if (ctx === actx) return noiseBuffer;
  let buf = noiseBuffers.get(ctx);
  if (!buf) { buf = makeNoise(ctx, 1.6); noiseBuffers.set(ctx, buf); }
  return buf;
}

const rand = (a, b) => a + Math.random() * (b - a);

// A burst of noise through a filter: impacts, whooshes, most physical sounds.
function noise(o = {}) {
  if (!actx || muted) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource();
  src.buffer = noiseBufferFor(actx);
  src.playbackRate.value = o.rate || 1;

  const filt = actx.createBiquadFilter();
  filt.type = o.type || 'bandpass';
  filt.frequency.setValueAtTime(o.f0 ?? 900, t);
  if (o.f1 !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + (o.dur || 0.2));
  filt.Q.value = o.q ?? 1.2;

  const g = actx.createGain();
  const dur = o.dur || 0.2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.5, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t, rand(0, 0.6));
  src.stop(t + dur + 0.02);
}

// One oscillator with a pitch sweep: tones, zaps, chimes.
function tone(o = {}) {
  if (!actx || muted) return;
  const t = actx.currentTime + (o.delay || 0);
  const osc = actx.createOscillator();
  osc.type = o.type || 'sine';
  const dur = o.dur || 0.2;
  osc.frequency.setValueAtTime(o.f0 ?? 440, t);
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);

  const g = actx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.25, t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  let node = osc;
  if (o.filter) {
    const f = actx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Several detuned oscillators at once: anything that should feel like magic.
function stack(o = {}) {
  const n = o.voices || 3;
  for (let i = 0; i < n; i++) {
    tone({
      ...o,
      f0: (o.f0 || 300) * (1 + (i - (n - 1) / 2) * (o.detune ?? 0.012)),
      f1: o.f1 === undefined ? undefined : (o.f1) * (1 + (i - (n - 1) / 2) * (o.detune ?? 0.012)),
      gain: (o.gain ?? 0.2) / n,
      delay: (o.delay || 0) + i * (o.stagger || 0),
    });
  }
}

const EFFECTS = {
  swing: () => noise({ f0: 1800, f1: 400, dur: 0.16, q: 0.7, gain: 0.28, rate: rand(0.9, 1.15) }),
  hit: () => {
    noise({ f0: rand(220, 320), f1: 80, dur: 0.16, q: 1.6, gain: 0.5, type: 'lowpass' });
    tone({ type: 'triangle', f0: rand(150, 200), f1: 60, dur: 0.12, gain: 0.18 });
  },
  hitCrit: () => {
    noise({ f0: 400, f1: 90, dur: 0.24, q: 2, gain: 0.6, type: 'lowpass' });
    tone({ type: 'square', f0: 240, f1: 70, dur: 0.2, gain: 0.16, filter: 900 });
  },
  hurt: () => tone({ type: 'sawtooth', f0: rand(300, 380), f1: 120, dur: 0.22, gain: 0.16, filter: 1200 }),
  death: () => {
    noise({ f0: 700, f1: 120, dur: 0.42, q: 0.8, gain: 0.4 });
    tone({ type: 'sawtooth', f0: rand(180, 240), f1: 55, dur: 0.4, gain: 0.14, filter: 800 });
  },
  fire: () => {
    noise({ f0: 600, f1: 2400, dur: 0.3, q: 0.6, gain: 0.28, rate: rand(0.9, 1.1) });
    stack({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.28, gain: 0.12, filter: 1400 });
  },
  explode: (o = {}) => {
    noise({ f0: o.big ? 260 : 420, f1: 60, dur: o.big ? 0.75 : 0.45, q: 0.6, gain: 0.6, type: 'lowpass' });
    tone({ type: 'sine', f0: o.big ? 90 : 130, f1: 30, dur: o.big ? 0.7 : 0.4, gain: 0.3 });
  },
  ice: () => {
    stack({ type: 'triangle', f0: 1400, f1: 700, dur: 0.34, gain: 0.16, voices: 4, detune: 0.03, stagger: 0.015 });
    noise({ f0: 4200, f1: 1800, dur: 0.28, q: 3, gain: 0.16 });
  },
  lightning: (o = {}) => {
    noise({ f0: 3000, f1: 600, dur: o.big ? 0.4 : 0.24, q: 0.9, gain: o.big ? 0.5 : 0.34, rate: rand(1, 1.3) });
    tone({ type: 'square', f0: rand(900, 1300), f1: 200, dur: 0.14, gain: 0.1, filter: 2600 });
  },
  cast: () => stack({ type: 'sine', f0: 420, f1: 700, dur: 0.22, gain: 0.14, voices: 3, stagger: 0.02 }),
  teleport: () => {
    stack({ type: 'sine', f0: 240, f1: 1500, dur: 0.26, gain: 0.16, voices: 3, detune: 0.02 });
    noise({ f0: 800, f1: 4000, dur: 0.22, q: 1.4, gain: 0.14 });
  },
  potion: () => {
    tone({ type: 'sine', f0: 500, f1: 900, dur: 0.16, gain: 0.2 });
    noise({ f0: 2200, f1: 900, dur: 0.14, q: 3, gain: 0.12 });
  },
  pickup: () => tone({ type: 'triangle', f0: 700, f1: 1100, dur: 0.1, gain: 0.16 }),
  gold: () => {
    for (let i = 0; i < 4; i++) {
      tone({ type: 'triangle', f0: rand(1500, 2600), f1: rand(900, 1400), dur: 0.09, gain: 0.09, delay: i * 0.035 });
    }
  },
  levelUp: () => {
    const root = 330;
    [0, 4, 7, 12].forEach((semi, i) => {
      stack({ type: 'triangle', f0: root * Math.pow(2, semi / 12), dur: 0.5, gain: 0.16, voices: 2, delay: i * 0.09 });
    });
  },
  chest: () => {
    noise({ f0: 500, f1: 180, dur: 0.3, q: 1.2, gain: 0.34, type: 'lowpass' });
    tone({ type: 'triangle', f0: 220, f1: 320, dur: 0.24, gain: 0.12, delay: 0.08 });
  },
  portal: () => stack({ type: 'sine', f0: 180, f1: 520, dur: 0.7, gain: 0.16, voices: 4, detune: 0.02 }),
  waypoint: () => stack({ type: 'sine', f0: 600, f1: 900, dur: 0.5, gain: 0.14, voices: 3, stagger: 0.05 }),
  bossRoar: () => {
    noise({ f0: 260, f1: 70, dur: 1.3, q: 0.7, gain: 0.6, type: 'lowpass' });
    stack({ type: 'sawtooth', f0: 90, f1: 55, dur: 1.2, gain: 0.22, voices: 3, detune: 0.03, filter: 500 });
  },
  quest: () => {
    [0, 5, 9].forEach((semi, i) => tone({ type: 'sine', f0: 440 * Math.pow(2, semi / 12), dur: 0.6, gain: 0.13, delay: i * 0.14 }));
  },
  error: () => tone({ type: 'square', f0: 180, f1: 120, dur: 0.14, gain: 0.1, filter: 700 }),
};

// Throttle: a Nova hitting twenty monsters must not fire twenty identical
// sounds in the same millisecond. Declared before init() clears it.
const lastPlayed = new Map();
const MIN_GAP = { hit: 0.035, hitCrit: 0.05, hurt: 0.09, death: 0.06, pickup: 0.05, gold: 0.12 };

export function sfx(name, opts = {}) {
  if (!actx || muted) return false;
  const fn = EFFECTS[name];
  if (!fn) return false;
  const gap = MIN_GAP[name];
  if (gap) {
    const now = actx.currentTime;
    // Nullish, not falsy: a stored timestamp of exactly 0 is a real value.
    const prev = lastPlayed.get(name) ?? -1;
    if (now - prev < gap) return false;
    lastPlayed.set(name, now);
  }
  fn(opts);
  return true;
}

// ------------------------------------------------------------------- music
//
// Looping background music, composed at runtime from the same node vocabulary
// as the effects — no audio files, nothing stored. One scheduler engine reads a
// table of moods, three per act: the camp, the wilds, the dark places. A timer
// keeps ~1.5 s of notes scheduled ahead of the clock, so a stalled frame never
// tears the music.
//
// Every voice below is scheduled against a context handed in rather than the
// module's live one. That is what lets the same engine render a mood into an
// OfflineAudioContext and be measured, instead of only listened to.

let music = null;          // { key, bus, bar, nextTime, timer }
const LOOKAHEAD = 1.5;     // seconds of notes kept scheduled ahead
const MUSIC_TICK = 300;    // ms between scheduler passes

const semiF = (root, s) => root * Math.pow(2, s / 12);

// A number, or a [low, high] range to draw from. Moods use both.
const pick = (v) => (Array.isArray(v) ? rand(v[0], v[1]) : v);

// One scheduled voice at an absolute time, routed through the music bus so a
// mode change can fade everything it scheduled with one ramp.
function mnote(ctx, bus, when, freq, o = {}) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'triangle';
  osc.frequency.value = freq;
  const g = ctx.createGain();
  const dur = o.dur || 0.5;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.08, when + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  let node = osc;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(bus);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

// A deep drum hit: filtered noise falling into the floor.
function mthump(ctx, bus, when, o = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBufferFor(ctx);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(o.f0 || 140, when);
  filt.frequency.exponentialRampToValueAtTime(o.f1 || 45, when + (o.dur || 0.5));
  filt.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.5, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + (o.dur || 0.5));
  src.connect(filt); filt.connect(g); g.connect(bus);
  src.start(when, rand(0, 0.6));
  src.stop(when + (o.dur || 0.5) + 0.05);
}

// A lowpass reads its Q in decibels, and the default of 1 is +1 dB: at the
// cutoff the filter hands back 1.12 of what it was given. Around a feedback
// loop that beats a 0.985 loop gain, so every pass is louder than the last and
// the string screams instead of ringing — measured at a peak of 2.7e11 before
// this constant existed. -3.01 dB is the flat Butterworth response, the only
// setting that holds a loop under unity at every frequency.
const FLAT_Q = -3.0103;

// Audio is computed 128 frames at a time, and a feedback loop carries a whole
// block of that latency on top of whatever delay is written into it. A string's
// loop is one period long, so the block is also its pitch ceiling: once a
// period is barely longer than the loop's own latency there is no delay left to
// shorten. That lands near 325 Hz at 48 kHz and 152 Hz in a 22050 Hz render.
// Nothing complains past it — the note just plays flat, by an octave at 220 Hz
// and worse above — so pluck asks the context where its ceiling is and hands
// anything above it to a struck tone, leaving a mood table free to write
// whatever pitch the music wants.
const BLOCK = 128;

// What a pluck becomes above that ceiling: a triangle struck and left to decay
// under the same lowpass colour. No string behind it, nothing recirculating —
// but it starts hard, dies away on the decay the string would have had, and it
// is in tune.
//
// Borrowing the decay is the whole point. A string loses its brightness before
// it loses its note, because every harmonic goes round the loop at its own
// rate: `sustain` times whatever the damping filter passes at that harmonic, a
// trip being one period. The high ones sit where the filter bites and are gone
// in a few passes; the fundamental rings on underneath. Add up the harmonics
// the filter keeps and that is the shape a pluck actually loses its energy in —
// steep at first, then long. Without it a struck note would hold its level for
// the whole of dur and stand 20 dB above the string a semitone below it.
function strungDecay(ctx, freq, brightness, sustain, dur, attack, gain, steps = 96) {
  const keeps = Math.min(Math.round(brightness / freq), Math.floor(ctx.sampleRate / 2 / freq));
  const n = Math.max(2, keeps);
  const rate = [];
  for (let h = 1; h <= n; h++) {
    const pass = sustain / Math.sqrt(1 + Math.pow((h * freq) / brightness, 4));
    rate.push(2 * freq * Math.log(pass));      // energy lost per second
  }
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    // Curve time runs from the end of the attack, but both the loop and the
    // note's fade have been running since the note began.
    const t = attack + (dur - attack) * (i / (steps - 1));
    let e = 0;
    for (const r of rate) e += Math.exp(r * t);
    // The note's own fade rides on top: the same curve a string's output gain
    // carries, which is set by the gain the mood asked for, not by the trimmed
    // level this voice plays at.
    curve[i] = gain * STRUNG_LEVEL * Math.sqrt(e / n) * Math.pow(0.0001 / gain, t / dur);
  }
  return curve;
}

// A string never delivers the level its output gain asks for. The loop is
// seeded with one period of noise and then left alone, so what reaches the bus
// is a good deal less than a driven oscillator at the same gain would send.
// Measured across the pitches, brightnesses and note lengths these moods use,
// the gap is about 7.5 dB, and a struck tone is trimmed by it or it would stand
// out from the very strings it is standing in for.
const STRUNG_LEVEL = 0.42;

function struck(ctx, bus, when, freq, o = {}) {
  const dur = o.dur || 1.2;
  const brightness = o.brightness || 2600;
  const gain = o.gain ?? 0.16;
  const attack = 0.004;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = brightness;
  damp.Q.value = FLAT_Q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain * STRUNG_LEVEL, when + attack);
  g.gain.setValueCurveAtTime(
    strungDecay(ctx, freq, brightness, o.sustain ?? 0.985, dur, attack, gain),
    when + attack, dur - attack);
  osc.connect(damp); damp.connect(g); g.connect(bus);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

// A plucked string: a millisecond of noise into a feedback delay whose loop
// carries a lowpass, so each pass around the loop dulls — Karplus-Strong. One
// trip around the loop is one period of the note, which is what sets the pitch;
// brightness is the loop filter's cutoff.
function pluck(ctx, bus, when, freq, o = {}) {
  const brightness = o.brightness || 2600;
  // What the loop costs before any delay is written into it: one render block
  // for the cycle, plus the damping filter's own group delay. Both have to come
  // out of the delay or the string plays flat — measured an octave flat at
  // 220 Hz, and further the higher the note, until this was subtracted.
  const lag = BLOCK / ctx.sampleRate + Math.SQRT2 / (2 * Math.PI * brightness);
  const period = 1 / freq;
  // A string that owns less than a tenth of its own period is barely a string:
  // the loop is nearly all latency, a few samples of delay line get seeded with
  // a whole period of noise and overwrite themselves, and the level that comes
  // out wanders several dB between one note and the next. Hand those over too,
  // rather than defend a sound that is neither one thing nor the other.
  if (period - lag < period * 0.1) { struck(ctx, bus, when, freq, o); return; }
  const dur = o.dur || 1.2;
  const burst = ctx.createBufferSource();
  burst.buffer = noiseBufferFor(ctx);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(1, when);
  bg.gain.setValueAtTime(0, when + period);    // one period of noise seeds the loop
  const delay = ctx.createDelay(1);
  delay.delayTime.value = period - lag;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = brightness;
  damp.Q.value = FLAT_Q;
  const fb = ctx.createGain();
  const sustain = o.sustain ?? 0.985;          // loop gain < 1 or it rings forever
  fb.gain.setValueAtTime(sustain, when);
  const out = ctx.createGain();
  out.gain.setValueAtTime(o.gain ?? 0.16, when);
  out.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  burst.connect(bg); bg.connect(delay);
  delay.connect(damp); damp.connect(fb); fb.connect(delay);   // the loop
  delay.connect(out); out.connect(bus);
  // Every other voice reads the noise from a random point, so no two firings
  // are seeded identically; a string is no different.
  burst.start(when, rand(0, 0.6)); burst.stop(when + 0.05);
  // Feedback loops outlive their sources: the burst is long gone while the
  // delay keeps recirculating, so a live context would collect one running loop
  // per note until the bus is torn down. Open the loop as the note ends, then
  // cut it off the bus so it can be collected. An offline render just ends.
  fb.gain.setValueAtTime(sustain, when + dur * 0.8);
  fb.gain.linearRampToValueAtTime(0, when + dur);
  if (ctx === actx) {
    setTimeout(() => { try { out.disconnect(); } catch { /* already gone */ } },
      Math.max(0, when - ctx.currentTime + dur + 0.2) * 1000);
  }
}

// A slab of sound with no attack to speak of: three detuned saws under a
// lowpass, swelling in and decaying out across whole bars.
function pad(ctx, bus, when, freq, o = {}) {
  const dur = o.dur || 4;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = o.filter || 800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.04, when + Math.max(0.4, o.attack ?? 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  filt.connect(g); g.connect(bus);
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq * (1 + (i - 1) * (o.detune ?? 0.006));
    osc.connect(filt);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }
}

// A struck bell: two sines at an inharmonic ratio, which is what stops it
// sounding like a flute. The upper partial fades first, as metal does.
function bell(ctx, bus, when, freq, o = {}) {
  const dur = Math.max(2, o.dur ?? 3.2);
  [1, 2.76].forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime((o.gain ?? 0.06) * (i ? 0.45 : 1), when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur * (i ? 0.6 : 1));
    osc.connect(g); g.connect(bus);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  });
}

// The tight end of the percussion: a hiss of bandpassed noise, gone in a
// twentieth of a second.
function shaker(ctx, bus, when, o = {}) {
  const dur = Math.min(o.dur ?? 0.06, 0.08);
  const src = ctx.createBufferSource();
  src.buffer = noiseBufferFor(ctx);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = o.f0 || 6200;
  filt.Q.value = o.q ?? 2.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.06, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(filt); filt.connect(g); g.connect(bus);
  src.start(when, rand(0, 0.6));
  src.stop(when + dur + 0.02);
}

// Air moving: noise under a lowpass an LFO walks between roughly 200 and 900
// Hz. It does the atmospheric work the old drone did, without a fixed pitch to
// hum, and it is scheduled one gust per bar — never free-running, so nothing it
// starts can survive a change of area.
function wind(ctx, bus, when, dur, o = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBufferFor(ctx);
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = rand(500, 600);
  filt.Q.value = 0.9;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rand(0.06, 0.16);
  const lg = ctx.createGain();
  lg.gain.value = 300;                    // centre +- this, so 200 Hz to 900 Hz
  lfo.connect(lg); lg.connect(filt.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(Math.min(o.gain ?? 0.035, 0.05), when + dur * 0.4);
  g.gain.linearRampToValueAtTime(0, when + dur);
  src.connect(filt); filt.connect(g); g.connect(bus);
  src.start(when, rand(0, 0.6)); src.stop(when + dur);
  lfo.start(when); lfo.stop(when + dur);
}

// What a mood may name as a voice. Pitched voices all take the same arguments,
// so a mood picks one by name and the engine does not care which.
const PITCHED = {
  pluck,
  pad,
  bell,
  sine: (ctx, bus, when, freq, o) => mnote(ctx, bus, when, freq, { ...o, type: 'sine' }),
  saw: (ctx, bus, when, freq, o) => mnote(ctx, bus, when, freq, { ...o, type: 'sawtooth' }),
};
const PERC = { drum: mthump, shaker };

// A mood names its voices as strings, so one typo in a mood table would throw
// inside the scheduler tick — and that tick is a timer callback, so the throw
// would take the pump down with it and the music would stop for good. Say what
// is missing once, then carry on without that voice.
const unnamed = new Set();
function voice(table, kind) {
  const fn = table[kind];
  if (fn) return fn;
  if (!unnamed.has(kind)) {
    unnamed.add(kind);
    console.warn(`synth: a mood asks for a voice named "${kind}", which does not exist`);
  }
  return null;
}

// The camp. Eight bars of finger-picked arpeggios — Am F C G, Am F Dm E —
// each note a semitone offset from A2, slightly humanized in time and touch,
// with a soft bass root swelling under each bar.
const TOWN_FIGURE = [
  [0, 7, 12, 15, 19, 15, 12, 7],     // Am
  [-4, 3, 8, 12, 15, 12, 8, 3],      // F
  [3, 10, 15, 19, 22, 19, 15, 10],   // C, an added sixth on top
  [-2, 5, 10, 14, 17, 14, 10, 5],    // G
  [0, 7, 12, 15, 19, 15, 12, 7],     // Am
  [-4, 3, 8, 12, 15, 12, 8, 3],      // F
  [5, 8, 12, 17, 20, 17, 12, 8],     // Dm
  [-5, 2, 7, 11, 14, 11, 7, 2],      // E, the pull home
];

// The wilds wander a minor pentatonic with two notes over the octave; the dark
// places lean on minor seconds and the tritone and go nowhere.
const FIELD_SET = [0, 3, 5, 7, 10, 12, 15];
const DARK_MOTIFS = [[0, 1, 0, -2], [3, 1, 0, 6], [0, 6, 5, 1], [12, 11, 6, 0]];

// A mood is data. The engine below reads these fields and nothing else, so an
// act's music is a table entry rather than a function of its own.
//
//   tempo, beats  a bar is `beats` beats at `tempo` to the minute
//   root          Hz of semitone 0 for the melodic voice
//   bars          bass root per bar, semitones from the bass voice's own root
//   figure        exact melodic cells per bar, semitones; skips the improviser
//   motifs        fragments a dark mood leans on instead of improvising
//   scale, density, rest   the improviser: which notes, how many a bar (+-1),
//                 and how often a bar falls silent
//   voices        which primitive plays each part and how loud — lead, bass,
//                 perc (a list of hits at beat offsets), colour (a rare event),
//                 wind (one gust per bar)
export const MOODS = {
  // The camp, note for note as it was, now on a plucked string rather than a
  // triangle blip. The bass roots are the first note of each figure.
  'a1.town': {
    tempo: 84, beats: 4, root: 110,
    bars: [0, -4, 3, -2, 0, -4, 5, -5],
    figure: TOWN_FIGURE,
    voices: {
      lead: { kind: 'pluck', gain: 0.09, dur: 0.55, brightness: 1900 },
      bass: { kind: 'sine', root: 55, gain: 0.05, attack: 0.4 },
    },
  },
  // The wilds. Mostly space: a few plucks wandering above a low pad every other
  // bar, whole bars of rest, and wind where the drone used to sit.
  'a1.field': {
    tempo: 66, beats: 4, root: 220,
    bars: [0, 3, -2],
    scale: FIELD_SET, density: 3, rest: 0.22,
    voices: {
      lead: { kind: 'pluck', gain: 0.06, dur: [0.8, 1.6], brightness: 2400 },
      bass: { kind: 'pad', root: 55, gain: 0.03, attack: 0.6, filter: 700, every: 2, hold: 2 },
      wind: { gain: 0.035 },
    },
  },
  // The dark places. A war drum on the bar, its echo uncertain; every other bar
  // a low sawtooth fragment; rarely, a high shimmer that takes seconds to fade.
  // The pad underneath does what the drone did, except that it moves.
  'a1.dungeon': {
    tempo: 56, beats: 4, root: 82.41,
    bars: [0, -2],
    motifs: DARK_MOTIFS, motifChance: 0.75,
    voices: {
      lead: { kind: 'saw', gain: 0.05, dur: 0.96, filter: 620, attack: 0.03 },
      bass: { kind: 'pad', root: 82.41, gain: 0.035, attack: 0.9, filter: 520, every: 2, hold: 2 },
      perc: [
        { kind: 'drum', at: 0, gain: 0.5 },
        { kind: 'drum', at: 2.5, gain: 0.28, f0: 110, chance: 0.5 },
      ],
      colour: { chance: 0.12, kind: 'sine', freq: 1100, gain: 0.02, dur: 2.6, attack: 0.8, voices: 3, detune: 0.025 },
    },
  },
};

// Acts 2 to 5 have no music of their own yet. Every key has to render, so each
// one points at the matching Act 1 mood in the meantime.
for (const act of ['a2', 'a3', 'a4', 'a5']) {
  MOODS[`${act}.town`] = MOODS['a1.town'];          // placeholder, Task 2 replaces
  MOODS[`${act}.field`] = MOODS['a1.field'];        // placeholder, Task 2 replaces
  MOODS[`${act}.dungeon`] = MOODS['a1.dungeon'];    // placeholder, Task 2 replaces
}

// What the lead plays this bar: a written figure, a motif fragment, or a walk
// over the scale. Positions come back in beats from the start of the bar.
function cellsFor(m, barIndex) {
  if (m.figure) {
    const f = m.figure[barIndex % m.figure.length];
    return f.map((s, i) => ({ s, at: i * (m.beats / f.length) }));
  }
  if (m.motifs) {
    if (barIndex % 2 || rand(0, 1) > (m.motifChance ?? 0.75)) return [];
    const motif = m.motifs[Math.floor(rand(0, m.motifs.length))];
    return motif.map((s, i) => ({ s, at: 0.5 + i * 0.75 }));
  }
  if (rand(0, 1) < (m.rest || 0)) return [];
  const cells = [];
  const n = m.density + Math.floor(rand(0, 3)) - 1;
  for (let i = 0; i < n; i++) {
    cells.push({
      s: m.scale[Math.floor(rand(0, m.scale.length))],
      at: Math.floor(rand(0, m.beats * 2)) * 0.5,
    });
  }
  return cells;
}

// One bar of one mood, scheduled against whichever context is passed in — the
// live one for playback, an offline one for measurement — and returning the
// seconds it occupies, so the caller only has to keep adding.
export function scheduleBar(ctx, bus, key, barIndex, t) {
  const m = MOODS[key];
  if (!m) return 1;
  const beat = 60 / m.tempo;
  const barLen = beat * m.beats;
  const v = m.voices;

  if (v.wind) wind(ctx, bus, t, barLen, v.wind);

  if (v.bass) {
    const every = v.bass.every || 1;
    const play = voice(PITCHED, v.bass.kind);
    if (play && barIndex % every === 0) {
      const chord = m.bars[Math.floor(barIndex / every) % m.bars.length];
      play(ctx, bus, t, semiF(v.bass.root, chord),
        { ...v.bass, dur: barLen * (v.bass.hold || 1) });
    }
  }

  for (const hit of v.perc || []) {
    if (hit.chance !== undefined && rand(0, 1) > hit.chance) continue;
    const strike = voice(PERC, hit.kind);
    if (strike) strike(ctx, bus, t + beat * hit.at, hit);
  }

  const play = v.lead && voice(PITCHED, v.lead.kind);
  if (play) {
    for (const c of cellsFor(m, barIndex)) {
      // A player pushes and drags against the beat, so each note lands a few
      // milliseconds off it. Dragging the first note of the first bar backwards
      // would ask for a negative time, which the API refuses — live playback
      // starts a fifth of a second ahead and never sees it, an offline render
      // starting at zero does.
      const when = Math.max(0, t + beat * c.at + rand(-0.006, 0.01));
      play(ctx, bus, when, semiF(m.root, c.s),
        { ...v.lead, gain: v.lead.gain * rand(0.8, 1.15), dur: pick(v.lead.dur) });
    }
  }

  const col = v.colour;
  if (col && rand(0, 1) < col.chance) {
    const shimmer = voice(PITCHED, col.kind);
    const n = col.voices || 1;
    for (let i = 0; shimmer && i < n; i++) {
      shimmer(ctx, bus, t + rand(0, beat),
        col.freq * (1 + (i - (n - 1) / 2) * (col.detune || 0)), col);
    }
  }

  return barLen;
}

export function playMusic(key) {
  if (!actx) return;
  if (music && music.key === key) return;
  stopMusic();
  if (!key || muted || !MOODS[key]) return;
  const bus = actx.createGain();
  bus.gain.value = 1;
  bus.connect(master);
  const state = { key, bus, bar: 0, nextTime: actx.currentTime + 0.15, timer: 0 };
  const tick = () => {
    while (state.nextTime < actx.currentTime + LOOKAHEAD) {
      state.nextTime += scheduleBar(actx, state.bus, key, state.bar++, state.nextTime);
    }
  };
  state.timer = setInterval(tick, MUSIC_TICK);
  music = state;
  tick();
}

export function stopMusic() {
  if (!music) return;
  clearInterval(music.timer);
  const bus = music.bus;
  const t = actx.currentTime;
  bus.gain.setValueAtTime(bus.gain.value, t);
  bus.gain.linearRampToValueAtTime(0, t + 0.5);
  setTimeout(() => { try { bus.disconnect(); } catch { /* already gone */ } }, 700);
  music = null;
}

// Which mood is playing. Verification reads this, because the alternative is
// judging music by ear through a headless browser.
export function mode() { return music ? music.key : null; }

// The seam the verification hangs off: a mood rendered into a buffer instead of
// into the speakers. No running context, no user gesture, no wall clock — the
// same scheduleBar the live pump calls, against an offline context that renders
// as fast as it can. 22050 Hz mono is plenty to measure level and balance.
export function renderMood(key, seconds = 8) {
  if (!MOODS[key]) return Promise.reject(new Error(`unknown mood: ${key}`));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const octx = new OAC(1, Math.ceil(22050 * seconds), 22050);
  const obus = octx.createGain();
  obus.gain.value = MASTER;                  // what the live master would apply
  obus.connect(octx.destination);
  let t = 0;
  for (let bar = 0; t < seconds; bar++) t += scheduleBar(octx, obus, key, bar, t);
  return octx.startRendering();
}

// Which of an act's three moods an area calls for. The drone that used to run
// under this — two sine oscillators that never stopped — is gone; the music is
// the whole atmosphere now.
export function ambient(level) {
  if (!actx) return;
  if (!level || muted) { stopMusic(); return; }
  const dark = (level.ambient[0] + level.ambient[1] + level.ambient[2]) / 3 < 60;
  const place = level.townCentre ? 'town' : dark ? 'dungeon' : 'field';
  playMusic(`a${level.act || 1}.${place}`);
}

// Nothing left to stop. The export survives so that anything written against
// the old shape — the console hooks, a caller yet to be cleaned up — still
// finds a function where it expects one.
export function stopAmbient() {}

export const EFFECT_NAMES = Object.keys(EFFECTS);
