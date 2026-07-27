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

const rand = (a, b) => a + Math.random() * (b - a);

// A burst of noise through a filter: impacts, whooshes, most physical sounds.
function noise(o = {}) {
  if (!actx || muted) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource();
  src.buffer = noiseBuffer;
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

// A slow drone under an area, so a dungeon feels different from a field.
let ambientNodes = null;
export function ambient(level) {
  if (!actx) return;
  stopAmbient();
  if (!level || muted) return;
  const dark = (level.ambient[0] + level.ambient[1] + level.ambient[2]) / 3 < 60;
  const base = dark ? 48 : 72;
  const nodes = [];
  for (let i = 0; i < 2; i++) {
    const osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * (i ? 1.5 : 1) * (1 + i * 0.008);
    const g = actx.createGain();
    g.gain.value = dark ? 0.05 : 0.03;
    const lfo = actx.createOscillator();
    lfo.frequency.value = 0.07 + i * 0.03;
    const lg = actx.createGain();
    lg.gain.value = dark ? 0.03 : 0.015;
    lfo.connect(lg); lg.connect(g.gain);
    osc.connect(g); g.connect(master);
    osc.start(); lfo.start();
    nodes.push(osc, lfo);
  }
  ambientNodes = nodes;
}

export function stopAmbient() {
  if (!ambientNodes) return;
  for (const n of ambientNodes) { try { n.stop(); } catch { /* already stopped */ } }
  ambientNodes = null;
}

export const EFFECT_NAMES = Object.keys(EFFECTS);
