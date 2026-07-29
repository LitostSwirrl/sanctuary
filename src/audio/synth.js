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

// How loud the score sits against the effects. Every level in the mood table
// below was set by ear against its neighbours in the same mood, and those
// balances are worth keeping; what they were not set against is the rest of
// the game, because when they were written a drone was still carrying the
// atmosphere. It is gone, and the music carries it alone now, which wants
// about five decibels more than the moods were drawn at. One number here
// rather than sixty in the table: the mixes stay as composed, and the whole
// score moves together. Measured after: the loudest mood peaks near 0.2,
// still under the loudest single effect.
const MUSIC_LEVEL = 1.8;

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

// A written value only counts if it is a finite number; anything else takes
// the default instead. Math.min and Math.max pass NaN straight through, so a
// bare clamp launders nonsense rather than rejecting it.
const finiteOr = (x, d) => (Number.isFinite(x) ? x : d);

// Loop gain has to stay under one or the string grows instead of ringing, and
// over zero or there is no string and the logarithm below has nowhere to go. A
// hand-written mood gets held inside that rather than trusted — and a sustain
// that is not a number at all takes the default, because the clamp alone
// would launder NaN through to the feedback gain.
const loopGain = (o) => Math.min(0.9995, Math.max(0.001, finiteOr(o.sustain, 0.985)));

// The loop filter's cutoff, which is also a divisor in the lag below and a
// frequency the filter would complain about if it went negative. Unwritten,
// zero and non-finite all take the default; a negative is floored.
const cutoff = (o) => Math.max(20, finiteOr(o.brightness || 2600, 2600));

function struck(ctx, bus, when, freq, o = {}) {
  const dur = o.dur || 1.2;
  const brightness = cutoff(o);
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
    strungDecay(ctx, freq, brightness, loopGain(o), dur, attack, gain),
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
  // A note with no pitch, no length or no level is not a note — every number
  // below is about to be divided by one of these. scheduleBar checks what a
  // mood wrote before any voice is called, so this is the backstop for calls
  // that arrive some other way; it refuses the note and says so, because a
  // note dropped in silence is the hardest kind of quiet to debug.
  if (![freq, o.gain ?? 0.16, o.dur || 1.2].every((x) => Number.isFinite(x) && x > 0)) {
    once(`synth: pluck refused a note it cannot play (freq ${freq}, gain ${o.gain}, dur ${o.dur})`);
    return;
  }
  const brightness = cutoff(o);
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
  const sustain = loopGain(o);                 // loop gain < 1 or it rings forever
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

// Mood tables are written by hand, and everything that reads one is inside a
// timer callback: a throw there takes the pump down and the music stops for
// good. So the scheduler complains rather than throws — but a tick runs several
// times a second, so it may only complain once.
const said = new Set();
function once(message) {
  if (said.has(message)) return;
  said.add(message);
  console.warn(message);
}

function voice(table, kind) {
  const fn = table[kind];
  if (fn) return fn;
  once(`synth: a mood asks for a voice named "${kind}", which does not exist`);
  return null;
}

// A positive, finite number or null — what the dispatch layer in scheduleBar
// means by a usable pitch, level or length.
const usable = (x) => (Number.isFinite(x) && x > 0 ? x : null);

// What each pitched voice plays at when a mood leaves its gain unwritten. The
// voices carry these same numbers as `??` fallbacks of their own, but the
// humanizing arithmetic in scheduleBar needs the default resolved into a real
// number first: undefined times anything is NaN, and NaN is not nullish, so
// it would sail through every downstream default and land in an AudioParam.
// A new entry in PITCHED needs a line here too.
const DEFAULT_GAIN = { pluck: 0.16, pad: 0.04, bell: 0.06, sine: 0.08, saw: 0.08 };

// Every numeric field the voices consume, and what the dispatch layer
// requires of a mood that writes one. gain and dur must be positive: zero is
// a composer muting the part, and a note of no length is no note. attack may
// be zero — a hard onset — but not negative, which would ask a ramp to end
// before it starts. The frequencies must be positive: a negative filter
// cutoff would be platform-clamped to nothing and silence the note with no
// explanation. The rest only need to be finite numbers — sign belongs to the
// voices' own clamps. Anything outside its rule — NaN, Infinity, a string,
// an array where a number belongs — would reach an AudioParam as non-finite
// and throw inside the scheduler's timer.
const PART_FIELDS = {
  gain: 'positive', dur: 'positive', attack: 'zero-or-more',
  filter: 'positive', f0: 'positive', f1: 'positive',
  detune: 'finite', q: 'finite', sustain: 'finite', brightness: 'finite',
};

// What a mood writes for a part is checked here before any voice sees it.
// Unwritten fields are fine — every voice has its own fallback — and a dur
// range is drawn and checked per note in scheduleBar instead. A written value
// that breaks its field's rule silences the part and says so once, because
// the alternative is a throw inside the scheduler's timer, which kills the
// pump and stops the music for good.
function partCheck(key, part, o) {
  for (const [field, need] of Object.entries(PART_FIELDS)) {
    const x = o[field];
    if (x == null || (field === 'dur' && Array.isArray(x))) continue;
    if (Number.isFinite(x) &&
        (need === 'finite' || (need === 'positive' ? x > 0 : x >= 0))) continue;
    once(`synth: mood "${key}" writes ${part} ${field}: ${x}, so the ${part} is silent`);
    return false;
  }
  return true;
}

// --------------------------------------------------------- mini-notation
//
// A bar of music, written as a string. The shape is Tidal's and Strudel's;
// the parser is ours — eighty lines, no dependency, nothing fetched, nothing
// installed. Four things and no more:
//
//   "0 3 5 ~"      whitespace splits the bar into even slots; `~` is a rest
//   "x ~ [x x] ~"  brackets subdivide one slot into as many events as they hold
//   "0 x*3 ~ 5"    `*n` repeats an event inside its own slot
//   "0 <5 7> ~ ~"  angles alternate across repetitions: bar N takes element N
//
// A token is an integer — a scale degree, negative allowed — or `x`, one
// percussion hit. Nesting is unlimited; the tables below stay two deep, which
// is as far as a bar of this music ever needs to go.
//
// Anything else is a mistake, and a mistake costs the pattern rather than the
// music: an empty bar and one line of console, the same bargain every other
// mood-table error strikes.

const patternTokens = (s) => String(s).match(/[<>[\]*]|[^\s<>[\]*]+/g) || [];

// seq := node* ; node := (atom | "[" seq "]" | "<" seq ">") ("*" n)?
// Recursive descent over the token list, returning null the moment it reads
// something the grammar has no room for — an unclosed bracket, a bare `*`, a
// token that is neither a degree nor a hit nor a rest.
function parseSeq(tk, i, close) {
  const kids = [];
  while (i < tk.length && tk[i] !== close) {
    const t = tk[i++];
    let node;
    if (t === '[' || t === '<') {
      const inner = parseSeq(tk, i, t === '[' ? ']' : '>');
      if (!inner || !inner.kids.length) return null;
      i = inner.i;
      node = { alt: t === '<', kids: inner.kids };
    } else if (t === ']' || t === '>' || t === '*') {
      return null;
    } else if (t === '~' || t === 'x' || /^-?\d+$/.test(t)) {
      node = { atom: t };
    } else {
      return null;
    }
    if (tk[i] === '*') {
      const n = Number(tk[i + 1]);
      if (!Number.isInteger(n) || n < 1 || n > 64) return null;
      node = { rep: n, kids: [node] };
      i += 2;
    }
    kids.push(node);
  }
  if (close !== undefined && tk[i] !== close) return null;
  return { kids, i: close === undefined ? i : i + 1 };
}

// One node laid out across the span of bar it owns, for one repetition.
function emitPattern(node, t0, span, bar, out) {
  if (node.atom !== undefined) {
    if (node.atom !== '~') out.push({ t: t0, dur: span, value: node.atom === 'x' ? 'x' : +node.atom });
    return;
  }
  if (node.rep) {
    for (let i = 0; i < node.rep; i++) {
      emitPattern(node.kids[0], t0 + (span * i) / node.rep, span / node.rep, bar, out);
    }
    return;
  }
  if (node.alt) { emitPattern(node.kids[bar % node.kids.length], t0, span, bar, out); return; }
  const n = node.kids.length;
  for (let i = 0; i < n; i++) emitPattern(node.kids[i], t0 + (span * i) / n, span / n, bar, out);
}

// How many repetitions a pattern takes to come back to where it started: the
// lowest common multiple of every alternation in it, capped so that a line of
// coprime angles cannot ask for thousands of bars of expansion.
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function cycleOf(node) {
  if (node.atom !== undefined) return 1;
  let l = node.alt ? node.kids.length : 1;
  for (const k of node.kids) { const c = cycleOf(k); l = (l * c) / gcd(l, c); }
  return Math.min(16, l);
}

// One line of notation, compiled to events over one bar: `t` and `dur` are
// fractions of the bar, `value` is a degree, `x`, or — when the line
// alternates — the list a repetition indexes into, a null standing for the
// bars where that slot has nothing to say.
function compilePattern(str) {
  let root = null;
  try { root = parseSeq(patternTokens(str), 0, undefined); } catch { root = null; }
  if (!root || !root.kids.length) {
    once(`synth: pattern "${str}" is not notation this reads, so it plays nothing`);
    return [];
  }
  const bars = Math.max(1, cycleOf(root));
  const slots = new Map();
  for (let b = 0; b < bars; b++) {
    const events = [];
    emitPattern(root, 0, 1, b, events);
    for (const e of events) {
      const at = `${e.t.toFixed(6)}:${e.dur.toFixed(6)}`;
      let slot = slots.get(at);
      if (!slot) { slot = { t: e.t, dur: e.dur, value: new Array(bars).fill(null) }; slots.set(at, slot); }
      slot.value[b] = e.value;
    }
  }
  return [...slots.values()]
    .map((s) => ({ t: s.t, dur: s.dur, value: bars === 1 ? s.value[0] : s.value }))
    .sort((a, b) => a.t - b.t || a.dur - b.dur);
}

// Parsing is a per-string cost, paid once. The scheduler runs inside a timer
// several times a second and must never do this work; every line a shipped
// mood holds is compiled at load, below the table, so by the time a bar is
// asked for this is a map lookup.
const compiled = new Map();
export function parsePattern(str) {
  let events = compiled.get(str);
  if (!events) { events = compilePattern(str); compiled.set(str, events); }
  return events;
}

// What an event plays on this repetition: a plain value, or the element the
// alternation has walked round to.
const valueAt = (v, bar) => (Array.isArray(v) ? v[((bar % v.length) + v.length) % v.length] : v);

// The camp. Eight bars of finger-picked arpeggios — Am F C G, Am F Dm E —
// one line of notation each, eight even slots to the bar, every degree a
// semitone offset from A2, slightly humanized in time and touch, with a soft
// bass root swelling under each bar.
const TOWN_FIGURE = [
  '0 7 12 15 19 15 12 7',       // Am
  '-4 3 8 12 15 12 8 3',        // F
  '3 10 15 19 22 19 15 10',     // C, an added sixth on top
  '-2 5 10 14 17 14 10 5',      // G
  '0 7 12 15 19 15 12 7',       // Am
  '-4 3 8 12 15 12 8 3',        // F
  '5 8 12 17 20 17 12 8',       // Dm
  '-5 2 7 11 14 11 7 2',        // E, the pull home
];

// Act 1's dark places, the same four fragments as before. Each one drags
// against the beat rather than sitting on it, so the beats are bracketed into
// sixteenths and the notes placed inside them: beat 0.5, 1.25, 2, 2.75.
const DARK_MOTIFS = [
  '[~ ~ 0 ~] [~ 1 ~ ~] [0 ~ ~ -2] ~',
  '[~ ~ 3 ~] [~ 1 ~ ~] [0 ~ ~ 6] ~',
  '[~ ~ 0 ~] [~ 6 ~ ~] [5 ~ ~ 1] ~',
  '[~ ~ 12 ~] [~ 11 ~ ~] [6 ~ ~ 0] ~',
];

// Lut Gholein, in D phrygian dominant — D Eb F# G A Bb C, the flat second and
// the augmented step above it being the whole reason the mode is here. The
// oud figure keeps that Eb away from its neighbours: it is always left by a
// third or across a rest, never leant on — and it appears only in bar 3,
// where the bass is holding D underneath it and the flat second is the
// cadence the mode is named for. Bar 4's bass holds A, against which the
// same Eb would be a tritone, so bar 4 rises to the octave instead.
const OUD_FIGURE = [
  '0 ~ [4 5] 7 ~ 5 4 ~',
  '5 ~ [7 8] 10 ~ 8 7 ~',
  '[0 4] 5 7 [8 7] 5 4 1 ~',
  '4 12 ~ 0 ~ [7 5] 4 ~',
];

// Kurast, bright and quick an octave above the other towns — high enough that
// the plucks come out struck, which is the marimba-ish voice the spec wants.
// The three-element alternation in the last bar is deliberate: the figure is
// four bars long, so a two-element one would land on the same side every time.
const KURAST_FIGURE = [
  '0 [4 7] 9 [7 4]',
  '2 [7 9] 12 [9 7]',
  '0 [4 7] 9 <12 14 16>',
  '[9 7] 4 2 ~',
];

// Pandemonium's camp: one bell, then nothing, then one bell. There is no
// figure here so much as an absence with two notes in it.
const PANDEMONIUM_FIGURE = ['0 ~ ~ ~', '~ ~ ~ ~', '~ ~ 7 ~', '~ ~ ~ ~'];

// Harrogath, bare fifths in the pad: root and fifth and the octave, nothing
// in between to say whether it is major or minor.
const HARROGATH_FIGURE = ['0 ~ 7 ~', '~ 12 ~ 7', '0 ~ 7 ~', '~ 5 ~ <0 7 12>'];

// The dungeon motif tables, and the only material in the fifteen that leans
// on a minor second or a tritone on purpose. Tombs toll slowly; the temple
// answers itself across the bar; chaos stabs; the Worldstone keeps.
const TOMB_MOTIFS = [
  '0 ~ ~ ~ ~ ~ 1 ~',
  '0 ~ ~ 6 ~ ~ ~ ~',
  '-2 ~ ~ ~ 1 ~ ~ ~',
  '6 ~ ~ ~ ~ 5 ~ ~',
];
const TEMPLE_MOTIFS = [
  '0 ~ ~ ~ 6 ~ ~ ~',
  '0 ~ 1 ~ ~ ~ ~ ~',
  '~ ~ 6 ~ ~ ~ 7 ~',
  '0 ~ ~ ~ ~ ~ 11 ~',
];
const CHAOS_MOTIFS = [
  '0 6 ~ 0 6 ~ 12 ~',
  '0 ~ 6 6 ~ 1 ~ ~',
  '6 ~ 0 ~ 6 ~ [11 12] ~',
  '0 1 6 ~ 0 1 6 ~',
];
const WORLDSTONE_MOTIFS = [
  '0 ~ ~ ~ 6 ~ ~ ~',
  '0 ~ ~ 11 ~ ~ ~ ~',
  '-1 ~ ~ ~ ~ 6 ~ ~',
  '0 ~ 6 ~ ~ ~ 12 ~',
];

// A mood is data. The engine below reads these fields and nothing else, so an
// act's music is a table entry rather than a function of its own.
//
//   tempo, beats  a bar is `beats` beats at `tempo` to the minute
//   root          Hz of semitone 0 for the melodic voice
//   bars          bass root per bar, semitones from the bass voice's own root
//   figure        one line of notation per bar, or one for every bar; skips
//                 the improviser
//   motifs        lines a dark mood leans on instead of improvising, one drawn
//                 at random every other bar
//   scale, density, rest   the improviser: which notes, how many a bar (+-1),
//                 and how often a bar falls silent
//   voices        which primitive plays each part and how loud — lead, bass,
//                 perc (hit lines, each a pattern or a single beat offset),
//                 colour (a rare event), wind (one gust per bar)
export const MOODS = {
  // ------------------------------------------------------------------ Act 1
  // The camp, note for note as it was, now written as notation and played on
  // a plucked string rather than a triangle blip. The bass roots are the first
  // note of each figure.
  'a1.town': {
    tempo: 84, beats: 4, root: 110,
    bars: [0, -4, 3, -2, 0, -4, 5, -5],
    figure: TOWN_FIGURE,
    voices: {
      lead: { kind: 'pluck', gain: 0.09, dur: 0.55, brightness: 1900 },
      bass: { kind: 'sine', root: 55, gain: 0.05, attack: 0.4 },
    },
  },
  // The wilds, re-cut to the spec: D dorian, sparse plucks over a pad that
  // swells every other bar, whole bars of rest, wind where the drone used to
  // sit. The lead runs D3 to D4, which is inside the string's range, so the
  // notes are strings rather than struck stand-ins for them.
  'a1.field': {
    tempo: 66, beats: 4, root: 146.83,
    bars: [0, 5, 3, -2],
    scale: [0, 2, 3, 5, 7, 9, 10, 12], density: 3, rest: 0.22,
    voices: {
      lead: { kind: 'pluck', gain: 0.11, dur: [0.8, 1.6], brightness: 2400 },
      bass: { kind: 'pad', root: 73.42, gain: 0.04, attack: 0.6, filter: 700, every: 2, hold: 2 },
      wind: { gain: 0.04 },
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
        { kind: 'drum', pattern: 'x ~ ~ ~', gain: 0.5 },
        { kind: 'drum', pattern: '~ ~ [~ x] ~', gain: 0.28, f0: 110, chance: 0.5 },
      ],
      colour: { chance: 0.12, kind: 'sine', freq: 1100, gain: 0.02, dur: 2.6, attack: 0.8, voices: 3, detune: 0.025 },
    },
  },

  // ------------------------------------------------------------------ Act 2
  // Lut Gholein. A bright oud figure in D phrygian dominant over a hand-drum
  // cycle that falls 3-3-2 across the eight quavers, with a shaker filling the
  // off-beats. The bass keeps to D, G and A — the flat second is the melody's
  // to carry, never the harmony's.
  'a2.town': {
    tempo: 88, beats: 4, root: 146.83,
    bars: [0, 5, 0, 7],
    figure: OUD_FIGURE,
    voices: {
      lead: { kind: 'pluck', gain: 0.11, dur: 0.5, brightness: 2600 },
      bass: { kind: 'sine', root: 73.42, gain: 0.045, attack: 0.35 },
      perc: [
        { kind: 'drum', pattern: 'x ~ ~ x ~ ~ x ~', gain: 0.3, f0: 180, f1: 70, dur: 0.35 },
        { kind: 'shaker', pattern: '~ x ~ x ~ x ~ x', gain: 0.05, f0: 5200 },
      ],
    },
  },
  // The desert beyond the walls. Long pads, a phrase of plucks now and then,
  // and wind carrying most of the bar. The draw is fourths and fifths only —
  // no third to place it, which is what makes it read as distance.
  'a2.field': {
    tempo: 60, beats: 4, root: 146.83,
    bars: [0, 5, 7, 0],
    scale: [0, 5, 7, 10, 12], density: 2, rest: 0.4,
    voices: {
      lead: { kind: 'pluck', gain: 0.11, dur: [1, 1.9], brightness: 2000 },
      bass: { kind: 'pad', root: 73.42, gain: 0.045, attack: 1.1, filter: 620, every: 2, hold: 2 },
      wind: { gain: 0.045 },
    },
  },
  // The tombs. Bell tolls four seconds apart over a pad too low and too slow
  // to be a chord, one drum a bar when it comes at all, and the motifs are
  // where the minor second lives.
  'a2.dungeon': {
    tempo: 52, beats: 4, root: 110,
    bars: [0, -2],
    motifs: TOMB_MOTIFS, motifChance: 0.85,
    voices: {
      lead: { kind: 'bell', gain: 0.09, dur: 3.4 },
      bass: { kind: 'pad', root: 55, gain: 0.04, attack: 1.4, filter: 420, every: 2, hold: 2 },
      perc: [{ kind: 'drum', pattern: 'x ~ ~ ~', gain: 0.36, f0: 120, f1: 40, dur: 0.7, chance: 0.75 }],
      colour: { chance: 0.15, kind: 'sine', freq: 880, gain: 0.018, dur: 3.2, attack: 1.2, voices: 3, detune: 0.02 },
    },
  },

  // ------------------------------------------------------------------ Act 3
  // Kurast. The fastest of the fifteen and the highest: short bright plucks an
  // octave above the other towns, which puts them over the string's ceiling and
  // into the struck voice — the marimba the jungle wants. Shaker throughout,
  // one drum on the bar with a kick-up before the next.
  'a3.town': {
    tempo: 92, beats: 4, root: 261.63,
    bars: [0, 5, -3, 7],
    figure: KURAST_FIGURE,
    voices: {
      lead: { kind: 'pluck', gain: 0.14, dur: 0.34, brightness: 3400 },
      bass: { kind: 'sine', root: 65.41, gain: 0.06, attack: 0.3 },
      perc: [
        { kind: 'shaker', pattern: 'x [x x] x [x x]', gain: 0.06, f0: 6400 },
        { kind: 'drum', pattern: 'x ~ ~ [~ x]', gain: 0.34, f0: 160, f1: 55, dur: 0.4 },
      ],
    },
  },
  // Upriver. Three drum lines on three different grids — eight, six, and a bar
  // split unevenly — so nothing lines up twice in a row, and a high sine
  // shimmer picking notes out of C dorian above them.
  'a3.field': {
    tempo: 80, beats: 4, root: 523.25,
    bars: [0, 3, 5, 10],
    scale: [0, 2, 3, 5, 7, 10, 12], density: 2, rest: 0.38,
    voices: {
      lead: { kind: 'sine', gain: 0.055, dur: [0.5, 1.1], filter: 3200, attack: 0.05 },
      bass: { kind: 'pad', root: 65.41, gain: 0.05, attack: 0.9, filter: 560, every: 2, hold: 2 },
      perc: [
        { kind: 'drum', pattern: 'x ~ ~ x ~ ~ x ~', gain: 0.34, f0: 150, f1: 50, dur: 0.45 },
        { kind: 'drum', pattern: '~ x ~ x ~ x', gain: 0.2, f0: 260, f1: 110, dur: 0.22 },
        { kind: 'shaker', pattern: '[x x] x [x x x] x', gain: 0.045, f0: 5800 },
      ],
    },
  },
  // The temple. Gongs rather than bells — the same voice struck low, where its
  // inharmonic partial reads as metal the size of a room — over a pad chanting
  // a fifth below and a drum every six quavers.
  'a3.dungeon': {
    tempo: 54, beats: 4, root: 98,
    bars: [0, -5],
    motifs: TEMPLE_MOTIFS, motifChance: 0.85,
    voices: {
      lead: { kind: 'bell', gain: 0.095, dur: 3.6 },
      bass: { kind: 'pad', root: 98, gain: 0.042, attack: 1.6, filter: 380, every: 2, hold: 2 },
      perc: [{ kind: 'drum', pattern: 'x ~ ~ ~ ~ ~ x ~', gain: 0.4, f0: 130, f1: 42, dur: 0.85, chance: 0.85 }],
      colour: { chance: 0.18, kind: 'sine', freq: 1320, gain: 0.016, dur: 3.4, attack: 1.4, voices: 3, detune: 0.03 },
    },
  },

  // ------------------------------------------------------------------ Act 4
  // Pandemonium. Nobody built this camp and nobody is glad to be in it: no
  // drum, no colour, no warmth. A pad thin and high enough to be air rather
  // than a chord, one bell, then two bars of nothing. Quietest of the five
  // camps on the meter as well as the emptiest: a distant bell that measured
  // louder than Lut Gholein's whole market was telling the wrong story.
  'a4.town': {
    tempo: 56, beats: 4, root: 220,
    bars: [0, 7],
    figure: PANDEMONIUM_FIGURE,
    voices: {
      lead: { kind: 'bell', gain: 0.075, dur: 3.2 },
      bass: { kind: 'pad', root: 220, gain: 0.022, attack: 1.8, filter: 1500, detune: 0.004, every: 2, hold: 2 },
      wind: { gain: 0.018 },
    },
  },
  // The plains of despair. Five beats to the bar, and two drum strokes across
  // eight slots of it — five slots apart, then three — so the stride never
  // resolves and never repeats evenly. One note a bar and three bars in five
  // empty: the sparsest thing in the score, and it has to stay strictly the
  // sparsest, which is why the drum lost a stroke. The pad's detune is wide
  // enough to beat against itself, which is where the sourness comes from;
  // nothing here is written as a clash.
  'a4.field': {
    tempo: 54, beats: 5, root: 130.81,
    bars: [0, 8, 3],
    scale: [0, 3, 7, 10, 12], density: 1, rest: 0.6,
    voices: {
      lead: { kind: 'pluck', gain: 0.12, dur: [1.2, 2.2], brightness: 1500 },
      bass: { kind: 'pad', root: 65.41, gain: 0.042, attack: 2, filter: 460, detune: 0.02, every: 2, hold: 2 },
      perc: [{ kind: 'drum', pattern: 'x ~ ~ ~ ~ x ~ ~', gain: 0.42, f0: 110, f1: 38, dur: 0.9, chance: 0.8 }],
      wind: { gain: 0.03 },
    },
  },
  // Chaos. The fastest tempo in the score and the only mood with no sustaining
  // voice at all — no pad, no bell, nothing held. Two drum lines interlocking
  // through the bar and, every other bar, a fistful of tritone stabs.
  'a4.dungeon': {
    tempo: 92, beats: 4, root: 87.31,
    motifs: CHAOS_MOTIFS, motifChance: 0.9,
    voices: {
      lead: { kind: 'saw', gain: 0.09, dur: 0.28, filter: 800, attack: 0.006 },
      perc: [
        { kind: 'drum', pattern: 'x ~ x x ~ x x ~', gain: 0.42, f0: 150, f1: 48, dur: 0.3 },
        { kind: 'drum', pattern: '~ x ~ ~ x ~ ~ x', gain: 0.24, f0: 240, f1: 100, dur: 0.16 },
      ],
    },
  },

  // ------------------------------------------------------------------ Act 5
  // Harrogath. The pad is the melody here: root, fifth, octave and nothing in
  // between, so the mode never declares itself. Under it a slow drum on the
  // bar, and over it a saw swell with a slow attack, which is as close to a
  // horn as three detuned oscillators get.
  'a5.town': {
    tempo: 62, beats: 4, root: 146.83,
    bars: [0, 0, 5, 7],
    figure: HARROGATH_FIGURE,
    voices: {
      lead: { kind: 'pad', gain: 0.05, dur: 2.2, attack: 0.5, filter: 900, detune: 0.005 },
      bass: { kind: 'pad', root: 73.42, gain: 0.05, attack: 1, filter: 520, every: 2, hold: 2 },
      perc: [{ kind: 'drum', pattern: 'x ~ ~ ~', gain: 0.36, f0: 125, f1: 42, dur: 0.8 }],
      colour: { chance: 0.5, kind: 'saw', freq: 196, gain: 0.05, dur: 2.4, attack: 0.9, filter: 800, voices: 3, detune: 0.008 },
    },
  },
  // The frozen tundra. Wind, and fifths falling out of it — the draw holds no
  // interval smaller than a fourth, so there is nothing warm for the ear to
  // settle on. Colder than Act 2's desert, warmer than Act 4's plains, which
  // is the order the acts want.
  'a5.field': {
    tempo: 58, beats: 4, root: 146.83,
    bars: [0, 7, 0, 5],
    scale: [-5, 0, 5, 7, 12], density: 2, rest: 0.4,
    voices: {
      lead: { kind: 'pluck', gain: 0.11, dur: [1, 2], brightness: 1800 },
      bass: { kind: 'pad', root: 73.42, gain: 0.042, attack: 1.3, filter: 500, every: 2, hold: 2 },
      wind: { gain: 0.045 },
    },
  },
  // The Worldstone Keep. The biggest drum in the score, a pad low enough to be
  // a choir humming rather than singing, and bells over the top of both.
  'a5.dungeon': {
    tempo: 58, beats: 4, root: 110,
    bars: [0, -5],
    motifs: WORLDSTONE_MOTIFS, motifChance: 0.85,
    voices: {
      lead: { kind: 'bell', gain: 0.1, dur: 3.6 },
      bass: { kind: 'pad', root: 55, gain: 0.05, attack: 1.5, filter: 400, every: 2, hold: 2 },
      perc: [
        { kind: 'drum', pattern: 'x ~ ~ ~ ~ ~ x ~', gain: 0.5, f0: 150, f1: 40, dur: 1 },
        { kind: 'drum', pattern: '~ ~ ~ x ~ ~ ~ ~', gain: 0.28, f0: 190, f1: 70, dur: 0.5, chance: 0.6 },
      ],
      colour: { chance: 0.2, kind: 'bell', freq: 660, gain: 0.03, dur: 3, voices: 2, detune: 0.01 },
    },
  },
};

// Every line the fifteen hold, compiled now rather than on the bar that first
// reaches it. Two things come of doing it here: the scheduler's timer only
// ever does a map lookup, and a malformed line in a shipped table says so at
// load, where it is a table bug, instead of halfway through an act.
for (const m of Object.values(MOODS)) {
  const lines = [];
  if (typeof m.figure === 'string') lines.push(m.figure);
  if (Array.isArray(m.figure)) lines.push(...m.figure);
  if (Array.isArray(m.motifs)) lines.push(...m.motifs);
  for (const hit of Array.isArray(m.voices?.perc) ? m.voices.perc : []) {
    if (typeof hit.pattern === 'string') lines.push(hit.pattern);
  }
  for (const line of lines) if (typeof line === 'string') parsePattern(line);
}

// One written line, as degrees placed in beats from the start of the bar.
// Notation is the only thing a figure or a motif may be; anything else is a
// table bug, and it costs the bar rather than the music.
function lineCells(m, key, line, barIndex) {
  if (typeof line !== 'string') {
    once(`synth: mood "${key}" writes a melodic line that is not notation, so the bar is empty`);
    return [];
  }
  const cells = [];
  for (const e of parsePattern(line)) {
    const s = valueAt(e.value, barIndex);
    if (s === null) continue;
    if (typeof s !== 'number') {
      once(`synth: mood "${key}" writes a percussion hit into a melodic line, which has no pitch`);
      continue;
    }
    cells.push({ s, at: e.t * m.beats });
  }
  return cells;
}

// What the lead plays this bar: a written figure, a motif fragment, or a walk
// over the scale. Positions come back in beats from the start of the bar.
// Material is trusted no further than the values were: an empty or mistyped
// figure, motif or scale hands back an empty bar and one line of console,
// never a throw — this runs inside the scheduler's timer.
function cellsFor(m, key, barIndex) {
  if (m.figure) {
    const line = Array.isArray(m.figure) ? m.figure[barIndex % m.figure.length] : m.figure;
    return lineCells(m, key, line, barIndex);
  }
  if (Array.isArray(m.motifs) && m.motifs.length) {
    if (barIndex % 2 || rand(0, 1) > (m.motifChance ?? 0.75)) return [];
    return lineCells(m, key, m.motifs[Math.floor(rand(0, m.motifs.length))], barIndex);
  }
  if (rand(0, 1) < (m.rest || 0)) return [];
  if (!Array.isArray(m.scale) || !m.scale.length) {
    once(`synth: mood "${key}" gives its lead no figure, motifs or scale, so there is nothing to play`);
    return [];
  }
  const cells = [];
  const n = (m.density || 2) + Math.floor(rand(0, 3)) - 1;
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
//
// This is also the dispatch layer, and validation lives here rather than in
// the voices: every pitch, level and length a mood wrote is resolved into a
// sane number before any voice is called, because the whole function runs
// inside the lookahead timer, where a single throw stops the music for good.
// A part with nothing playable sits the bar out and says so once; the clock
// advances regardless. The voices' own guards are backstops, not the front
// line.
export function scheduleBar(ctx, bus, key, barIndex, t) {
  const m = MOODS[key];
  if (!m) return 1;
  const beat = 60 / m.tempo;
  const barLen = beat * m.beats;
  // Everything that asks for a bar then adds the answer to a clock and asks for
  // the next one. A bar of no length, from a missing or mistyped tempo, would
  // leave that clock where it was and the caller would sit asking for the same
  // bar until the tab froze — worse than a thrown error, because nothing says
  // what happened. A tempo of zero is the other way round: an infinitely long
  // bar, and every note in it scheduled at infinity. And a negative tempo and
  // negative beats would cancel into a bar of positive length whose notes all
  // land before it starts. Hand back a second of silence for all of them.
  if (!Number.isFinite(beat) || beat <= 0 || !Number.isFinite(barLen) || barLen <= 0) {
    once(`synth: mood "${key}" has no usable tempo, so it has no bars to play`);
    return 1;
  }
  const v = m.voices;
  if (!v) {
    once(`synth: mood "${key}" has no voices, so its bars are silent`);
    return barLen;
  }

  if (v.wind && partCheck(key, 'wind', v.wind)) wind(ctx, bus, t, barLen, v.wind);

  if (v.bass && partCheck(key, 'bass', v.bass)) {
    const every = v.bass.every || 1;
    const play = voice(PITCHED, v.bass.kind);
    if (play && barIndex % every === 0) {
      // The chord walk needs somewhere to walk: an empty or missing bars
      // table indexes into nothing and turns the bass frequency into NaN.
      if (!Array.isArray(m.bars) || !m.bars.length) {
        once(`synth: mood "${key}" has no bars for the bass to walk, so the bass is silent`);
      } else {
        const chord = m.bars[Math.floor(barIndex / every) % m.bars.length];
        const freq = usable(semiF(v.bass.root, chord));
        const dur = usable(barLen * (v.bass.hold || 1));
        if (!freq || !dur) {
          once(`synth: mood "${key}" gives its bass nothing playable (root ${v.bass.root}, degree ${chord}, hold ${v.bass.hold})`);
        } else {
          play(ctx, bus, t, freq, { ...v.bass, dur });
        }
      }
    }
  }

  for (const hit of Array.isArray(v.perc) ? v.perc : []) {
    if (hit.chance !== undefined && rand(0, 1) > hit.chance) continue;
    const strike = voice(PERC, hit.kind);
    if (!strike || !partCheck(key, 'perc', hit)) continue;
    if (typeof hit.pattern === 'string') {
      for (const e of parsePattern(hit.pattern)) {
        const val = valueAt(e.value, barIndex);
        if (val === null) continue;
        if (val !== 'x') {
          once(`synth: mood "${key}" writes a degree into a percussion line, which has no pitches`);
          continue;
        }
        strike(ctx, bus, t + barLen * e.t, hit);
      }
      continue;
    }
    // A hit with no written offset lands on the downbeat, not at NaN.
    const at = Number.isFinite(hit.at) && hit.at > 0 ? hit.at : 0;
    strike(ctx, bus, t + beat * at, hit);
  }

  const play = v.lead && voice(PITCHED, v.lead.kind);
  if (play && partCheck(key, 'lead', v.lead)) {
    // The humanized touch below is a multiply, and a multiply needs a real
    // number on both sides: a mood that merely omits the lead's gain would
    // send undefined * rand() = NaN into the voice, straight past every
    // `?? default` downstream — NaN is not nullish. So the mood-level default
    // is applied here, before the arithmetic ever runs.
    let gain = v.lead.gain;
    if (gain == null) {
      once(`synth: mood "${key}" leaves its lead gain unwritten, so it plays at the ${v.lead.kind} default`);
      gain = DEFAULT_GAIN[v.lead.kind] ?? 0.08;
    }
    const root = usable(m.root);
    if (!root) {
      once(`synth: mood "${key}" has no usable root, so the lead is silent`);
    } else {
      for (const c of cellsFor(m, key, barIndex)) {
        const freq = usable(semiF(root, c.s));
        if (!freq) {
          once(`synth: mood "${key}" asks its lead for degree ${c.s}, which is not a pitch`);
          continue;
        }
        const dur = pick(v.lead.dur);
        if (dur != null && !usable(dur)) {
          once(`synth: mood "${key}" draws an unplayable lead duration, so the note is dropped`);
          continue;
        }
        // A player pushes and drags against the beat, so each note lands a few
        // milliseconds off it. Dragging the first note of the first bar
        // backwards would ask for a negative time, which the API refuses —
        // live playback starts a fifth of a second ahead and never sees it, an
        // offline render starting at zero does.
        const when = Math.max(0, t + beat * c.at + rand(-0.006, 0.01));
        play(ctx, bus, when, freq, { ...v.lead, gain: gain * rand(0.8, 1.15), dur });
      }
    }
  }

  const col = v.colour;
  if (col && rand(0, 1) < col.chance && partCheck(key, 'colour', col)) {
    const shimmer = voice(PITCHED, col.kind);
    // The voice count is capped: a written Infinity would loop the scheduler
    // forever, which freezes the tab harder than any throw.
    const n = Math.min(16, col.voices || 1);
    for (let i = 0; shimmer && i < n; i++) {
      const freq = usable(col.freq * (1 + (i - (n - 1) / 2) * (col.detune || 0)));
      if (!freq) {
        once(`synth: mood "${key}" colours at freq ${col.freq}, which is not a pitch`);
        break;
      }
      shimmer(ctx, bus, t + rand(0, beat), freq, col);
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
  bus.gain.value = MUSIC_LEVEL;
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
//
// `scheduleUntil` stops the scheduling short of the render, which is how the
// drone regression is asked now. The first version of that test averaged the
// signal over a long window and called a high mean a hum, but a hum oscillates
// and averages to nothing: the review rebuilt the drone this task killed and it
// passed by a factor of a hundred. What actually separates a drone from music
// is not a spectrum but a behaviour — every voice here is started and stopped
// at written times, and a drone is a node nobody ever stops. So schedule bars
// into the first part of the render only and measure the end: whatever is still
// sounding there was never given a stop time.
export function renderMood(key, seconds = 8, o = {}) {
  if (!MOODS[key]) return Promise.reject(new Error(`unknown mood: ${key}`));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const octx = new OAC(1, Math.ceil(22050 * seconds), 22050);
  const obus = octx.createGain();
  obus.gain.value = MASTER * MUSIC_LEVEL;    // what the live bus and master would apply
  obus.connect(octx.destination);
  const until = Number.isFinite(o.scheduleUntil) && o.scheduleUntil > 0
    ? Math.min(o.scheduleUntil, seconds) : seconds;
  let t = 0;
  for (let bar = 0; t < until; bar++) t += scheduleBar(octx, obus, key, bar, t);
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
