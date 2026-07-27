// Seeded pseudo-random numbers. Everything procedural in the game pulls from here,
// so a world can be regenerated bit-for-bit from a single integer seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix a string or number into a 32-bit seed.
export function hashSeed(v) {
  const s = String(v);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this.next = mulberry32(this.seed);
  }
  f() { return this.next(); }
  // integer in [0, n)
  i(n) { return Math.floor(this.next() * n); }
  // float in [a, b)
  range(a, b) { return a + this.next() * (b - a); }
  // integer in [a, b] inclusive
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  // A derived generator: same parent seed plus a salt always yields the same child.
  fork(salt) { return new Rng(hashSeed(this.seed + ':' + salt)); }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.i(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // Weighted pick. entries is [[value, weight], ...]
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }
}

// Smooth value noise on an integer lattice. Returns a sampler in 0..1.
export function valueNoise2(rng, size = 256) {
  const mask = size - 1;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.f();

  const at = (x, y) => grid[((y & mask) * size) + (x & mask)];
  const smooth = (t) => t * t * (3 - 2 * t);

  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi);
    const c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    const top = a + (b - a) * xf;
    const bot = c + (d - c) * xf;
    return top + (bot - top) * yf;
  };
}

// Several noise octaves summed, normalised to 0..1.
export function fbm2(rng, octaves = 4) {
  const layers = [];
  for (let i = 0; i < octaves; i++) layers.push(valueNoise2(rng.fork('oct' + i)));
  return function (x, y) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < layers.length; i++) {
      sum += layers[i](x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}
