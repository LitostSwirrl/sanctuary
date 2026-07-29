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

// ------------------------------------------------------------------- music
//
// Looping background music, composed at runtime from the same oscillator
// primitives as the effects — no audio files, nothing stored. Three moods:
// the camp gets quiet plucked arpeggios in A minor, the wilds an airy
// wandering line above the drone, the dungeons a slow war drum under
// dissonant fragments. A timer keeps ~1.5 s of notes scheduled ahead of the
// clock, so a stalled frame never tears the music.

let music = null;          // { mode, bus, bar, nextTime, timer }
const LOOKAHEAD = 1.5;     // seconds of notes kept scheduled ahead
const MUSIC_TICK = 300;    // ms between scheduler passes

const semiF = (root, s) => root * Math.pow(2, s / 12);

// One scheduled voice at an absolute time, routed through the music bus so a
// mode change can fade everything it scheduled with one ramp.
function mnote(bus, when, freq, o = {}) {
  const osc = actx.createOscillator();
  osc.type = o.type || 'triangle';
  osc.frequency.value = freq;
  const g = actx.createGain();
  const dur = o.dur || 0.5;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.08, when + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  let node = osc;
  if (o.filter) {
    const f = actx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(bus);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

// A deep drum hit: filtered noise falling into the floor.
function mthump(bus, when, o = {}) {
  const src = actx.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = actx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(o.f0 || 140, when);
  filt.frequency.exponentialRampToValueAtTime(o.f1 || 45, when + (o.dur || 0.5));
  filt.Q.value = 0.8;
  const g = actx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(o.gain ?? 0.5, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, when + (o.dur || 0.5));
  src.connect(filt); filt.connect(g); g.connect(bus);
  src.start(when, rand(0, 0.6));
  src.stop(when + (o.dur || 0.5) + 0.05);
}

// The camp. Eight bars of finger-picked arpeggios — Am F C G, Am F Dm E —
// each note a semitone offset from A2, slightly humanized in time and touch,
// with a soft bass root swelling under each bar.
const TOWN_BARS = [
  [0, 7, 12, 15, 19, 15, 12, 7],     // Am
  [-4, 3, 8, 12, 15, 12, 8, 3],      // F
  [3, 10, 15, 19, 22, 19, 15, 10],   // C, an added sixth on top
  [-2, 5, 10, 14, 17, 14, 10, 5],    // G
  [0, 7, 12, 15, 19, 15, 12, 7],     // Am
  [-4, 3, 8, 12, 15, 12, 8, 3],      // F
  [5, 8, 12, 17, 20, 17, 12, 8],     // Dm
  [-5, 2, 7, 11, 14, 11, 7, 2],      // E, the pull home
];

function scheduleTown(bus, t, bar) {
  const eighth = 60 / 84 / 2;
  const semis = TOWN_BARS[bar % TOWN_BARS.length];
  semis.forEach((s, i) => {
    mnote(bus, t + i * eighth + rand(-0.006, 0.01), semiF(110, s),
      { gain: 0.085 * rand(0.8, 1.15), dur: 0.55, filter: 1900 });
  });
  mnote(bus, t, semiF(55, semis[0]), { type: 'sine', gain: 0.05, dur: eighth * 8, attack: 0.4 });
  return eighth * 8;
}

// The wilds. Mostly space: a few soft sine tones wandering a minor
// pentatonic above the drone, a low pad every other bar, whole bars of rest.
const FIELD_SET = [0, 3, 5, 7, 10, 12, 15];

function scheduleField(bus, t, bar) {
  const beat = 60 / 66;
  if (bar % 2 === 0) {
    mnote(bus, t, semiF(55, [0, 3, -2][(bar / 2) % 3]), { type: 'sine', gain: 0.04, dur: beat * 8, attack: 0.6 });
  }
  if (rand(0, 1) < 0.22) return beat * 4;
  const n = 2 + Math.floor(rand(0, 3));
  for (let i = 0; i < n; i++) {
    mnote(bus, t + Math.floor(rand(0, 8)) * (beat / 2), semiF(220, FIELD_SET[Math.floor(rand(0, FIELD_SET.length))]),
      { type: 'sine', gain: 0.055 * rand(0.7, 1.2), dur: rand(0.8, 1.6), attack: 0.05, filter: 2400 });
  }
  return beat * 4;
}

// The dungeons. A war drum on the bar, its echo uncertain; every other bar a
// low sawtooth fragment leaning on minor seconds and the tritone; rarely, a
// high shimmer that takes seconds to fade.
const DARK_MOTIFS = [[0, 1, 0, -2], [3, 1, 0, 6], [0, 6, 5, 1], [12, 11, 6, 0]];

function scheduleDungeon(bus, t, bar) {
  const beat = 60 / 56;
  mthump(bus, t, { gain: 0.5 });
  if (rand(0, 1) < 0.5) mthump(bus, t + beat * 2.5, { gain: 0.28, f0: 110 });
  if (bar % 2 === 0 && rand(0, 1) < 0.75) {
    const motif = DARK_MOTIFS[Math.floor(rand(0, DARK_MOTIFS.length))];
    motif.forEach((s, i) => {
      mnote(bus, t + beat * (0.5 + i * 0.75), semiF(82.41, s),
        { type: 'sawtooth', gain: 0.05, dur: beat * 0.9, filter: 620, attack: 0.03 });
    });
  }
  if (rand(0, 1) < 0.12) {
    for (let v = 0; v < 3; v++) {
      mnote(bus, t + rand(0, beat), 1100 * (1 + (v - 1) * 0.025), { type: 'sine', gain: 0.02, dur: 2.6, attack: 0.8 });
    }
  }
  return beat * 4;
}

const MUSIC_MODES = { town: scheduleTown, field: scheduleField, dungeon: scheduleDungeon };

export function playMusic(mode) {
  if (!actx) return;
  if (music && music.mode === mode) return;
  stopMusic();
  if (!mode || muted || !MUSIC_MODES[mode]) return;
  const bus = actx.createGain();
  bus.gain.value = 1;
  bus.connect(master);
  const state = { mode, bus, bar: 0, nextTime: actx.currentTime + 0.15, timer: 0 };
  const scheduler = MUSIC_MODES[mode];
  const tick = () => {
    while (state.nextTime < actx.currentTime + LOOKAHEAD) {
      state.nextTime += scheduler(state.bus, state.nextTime, state.bar++);
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

export function musicMode() { return music ? { mode: music.mode, bar: music.bar } : null; }

// A slow drone under an area, so a dungeon feels different from a field.
let ambientNodes = null;
export function ambient(level) {
  if (!actx) return;
  stopAmbient();
  if (!level || muted) { stopMusic(); return; }
  const dark = (level.ambient[0] + level.ambient[1] + level.ambient[2]) / 3 < 60;
  playMusic(level.townCentre ? 'town' : dark ? 'dungeon' : 'field');
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
