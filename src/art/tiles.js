// Ground tiles, wall blocks and scenery props, all generated.
//
// Ground is the classic 64x32 isometric diamond whose row widths interlock
// exactly, so neighbouring tiles leave no seam and no gap. The texture inside
// the diamonds is cut from one seamless noise field per terrain, anchored to
// the screen lattice: a tile shows whichever window of the field its world
// position lands on, so the dirt flows across tile edges and the grid
// disappears. The field wraps every eight tiles along each lattice axis,
// far enough apart that the repeat never reads.

import { Buf, px, rectF, ellipse, ellipseF, capsule, polyF, outline, lineP, bufToCanvas, blitBuf } from './pixel.js';
import { ramp, packHex, packRGB, shift, COLORS } from './palette.js';
import { Rng, fbm2 } from '../core/rng.js';

export const TW = 64, TH = 32;
const OUTLINE = packHex('#0c0a10');

// The seamless field covers an 8x8 patch of the same-parity diamond lattice.
const FIELD_W = 256, FIELD_H = 128;

// Row spans of the isometric diamond. Rows 15 and 16 are both full width.
function rowSpan(y) {
  const k = y < 16 ? y : 31 - y;
  const w = 4 * (k + 1);
  return { x0: 32 - w / 2, w };
}

// `rough` is how hard the noise modulates lightness. Kept low for built
// floors, whose variation comes from slab-to-slab tone instead of dirt.
// Everything a shade darker and greyer than a daylight game would pick:
// the ground is what the light pass has to sell as oppressive.
export const TERRAIN = {
  grass:  { base: '#3e4829', alt: '#333d24', speck: '#4e5c30', rough: 0.30 },
  dirt:   { base: '#4f4130', alt: '#433626', speck: '#5e4f38', rough: 0.32 },
  cobble: { base: '#4c4941', alt: '#403e37', speck: '#5a564c', rough: 0.16 },
  cave:   { base: '#322e27', alt: '#282520', speck: '#3e3930', rough: 0.36 },
  crypt:  { base: '#3e3e48', alt: '#33333c', speck: '#4c4c58', rough: 0.15 },
  blood:  { base: '#402220', alt: '#331b19', speck: '#522823', rough: 0.34 },
  snow:   { base: '#6f7482', alt: '#5f6472', speck: '#848a98', rough: 0.22 },
  // The desert is not yellow. The sun has cooked the colour out of it: bleached
  // bone laid over grey, with the warmth only just surviving in the speckle.
  // Sandstone is the same rock quarried and laid, so it sits a shade cooler and
  // takes slab joints instead of grit.
  sand:      { base: '#6b6353', alt: '#5c5546', speck: '#7a7260', rough: 0.26 },
  sandstone: { base: '#635c4d', alt: '#555044', speck: '#6f6857', rough: 0.14 },
  // The jungle is not green either. A canopy this deep leaves the floor nearly
  // black, and what green does reach it belongs to the rot, not the leaves.
  jungle:    { base: '#2b3425', alt: '#232b1e', speck: '#3c4726', rough: 0.30 },
  temple:    { base: '#3c413a', alt: '#333831', speck: '#4a5142', rough: 0.15 },
  // Hell is not orange. The fortress and the sanctuary are laid obsidian: black
  // glass with a bruise of warmth in it, and what warmth there is lives in the
  // cooled cracks rather than on the surface.
  obsidian:  { base: '#2c252a', alt: '#241e23', speck: '#3a2e2e', rough: 0.16 },
  // Ice reads by its fractures, not its colour. Kept barely lighter than the
  // snow it lies under, or a frozen cavern turns into a white room.
  ice:       { base: '#4e5a66', alt: '#43505c', speck: '#63707c', rough: 0.18 },
};

// Floors that read as laid masonry: two-tile slabs with a tone step and a
// joint, rather than dirt. Their walls take courses for the same reason. `cave`
// is built but not on this list -- its walls are hewn rock and want cracks.
const BUILT_FLOORS = new Set(['cobble', 'crypt', 'sandstone', 'temple', 'obsidian']);

// ------------------------------------------------------------------- ground

// Smooth value noise that wraps at exactly (pw, ph) pixels, so anything cut
// on that period tiles with itself. `cell` is the lattice spacing and must
// divide both periods.
function wrapNoise(rng, pw, ph, cell) {
  const gw = (pw / cell) | 0, gh = (ph / cell) | 0;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.f();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    let fx = (x / cell) % gw; if (fx < 0) fx += gw;
    let fy = (y / cell) % gh; if (fy < 0) fy += gh;
    const x0 = fx | 0, y0 = fy | 0;
    const x1 = (x0 + 1) % gw, y1 = (y0 + 1) % gh;
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = grid[y0 * gw + x0], b = grid[y0 * gw + x1];
    const c = grid[y1 * gw + x0], d = grid[y1 * gw + x1];
    const top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  };
}

const clampB = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
// Hardcodes alpha 255, so only ever feed it a texel that is already opaque.
const mulC = (c, k) => packRGB(clampB((c & 255) * k), clampB(((c >>> 8) & 255) * k), clampB(((c >>> 16) & 255) * k), 255);

// How hard the per-pixel grain bites, as the peak fraction of a texel's value
// the jitter moves it. This is the tuning knob. The smooth fields above are
// what kills the tile grid, but at pixel scale they are pure gradient --
// adjacent texels a luminance unit or two apart -- and the eye reads acres of
// gradient as out of focus, while every figure shows hard pixel steps. The
// grain puts the pixel back in the floor without touching the large shapes.
// Tried: 0.10 (film grain, still soft), 0.20 (packed dirt), 0.30 (gravel).
// Shipped 0.24, medium leaning coarse: LoD ground is gritty before it is soft.
const GRAIN = 0.24;

// Overlay deterministic grain on a baked buffer: every opaque texel takes a
// value jitter hashed from its own coordinates, so the same texel always
// jitters the same way. On the wrapping fields the coordinate domain IS the
// torus, so the grain tiles exactly as the field does and aligns with nothing
// on the tile lattice. Jitter is symmetric about zero and multiplies the
// colour, so the ramp keeps its hue and its mean value -- this darkens
// nothing and saturates nothing. One texel in eight takes a double kick,
// which is the difference between grit and monitor noise.
function grainOverlay(buf, salt) {
  const { w, h, data } = buf;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = data[i];
      if ((c >>> 24) !== 255) continue;
      let hh = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ salt) >>> 0;
      hh = Math.imul(hh ^ (hh >>> 13), 2246822519) >>> 0;
      hh ^= hh >>> 16;
      let j = ((hh & 1023) / 511.5 - 1) * GRAIN;
      if (!(hh & 0xe000)) j *= 2;
      data[i] = mulC(c, 1 + j);
    }
  }
}

// Plot into the field with wrap, so a detail stroke that runs off one edge comes
// back in on the other and the field still tiles with itself. The scattered
// speckles get away without this because they are a pixel or two wide; a ripple
// forty pixels long would leave a visible cut.
function wrapPx(buf, x, y, c) {
  let xx = (x | 0) % FIELD_W; if (xx < 0) xx += FIELD_W;
  let yy = (y | 0) % FIELD_H; if (yy < 0) yy += FIELD_H;
  px(buf, xx, yy, c);
}

// One seamless texture per terrain. Three octaves: broad patches, a mid
// grain, and a fine speckle. The broad cell is two tiles wide on purpose --
// at exactly one tile it drops its blobs in step with the lattice and the
// grid ghosts right back. y samples doubled so the features stretch 2:1 like
// the projection.
function bakeGroundField(terrain, rng) {
  const t = TERRAIN[terrain];
  const patch = wrapNoise(rng.fork('patch'), FIELD_W, FIELD_H * 2, 128);
  const mid = wrapNoise(rng.fork('mid'), FIELD_W, FIELD_H * 2, 16);
  const grain = wrapNoise(rng.fork('grain'), FIELD_W, FIELD_H * 2, 8);
  const buf = new Buf(FIELD_W, FIELD_H);
  const base = packHex(t.base), alt = packHex(t.alt);

  for (let y = 0; y < FIELD_H; y++) {
    for (let x = 0; x < FIELD_W; x++) {
      const p = patch(x, y * 2), m = mid(x, y * 2), g = grain(x, y * 2);
      const c = p * 0.6 + m * 0.4 > 0.5 ? base : alt;
      const v = ((p - 0.5) * 0.8 + (m - 0.5) * 0.7 + (g - 0.5) * 0.9) * t.rough;
      buf.data[y * FIELD_W + x] = packRGB(
        clampB((c & 255) * (1 + v)),
        clampB(((c >>> 8) & 255) * (1 + v)),
        clampB(((c >>> 16) & 255) * (1 + v)), 255);
    }
  }

  // Detail is scattered over the whole field, so tufts and pebbles straddle
  // tile edges like anything else.
  const rd = rng.fork('detail');
  if (terrain === 'grass') {
    const tuft = packHex(t.speck);
    const dim = shift(t.speck, -0.06);
    for (let i = 0; i < 170; i++) {
      const x = rd.i(FIELD_W), y = rd.int(1, FIELD_H - 2);
      px(buf, x, y, tuft);
      px(buf, x, y - 1, tuft);
      if (rd.chance(0.5)) px(buf, x + 1, y, dim);
    }
  }
  if (terrain === 'dirt' || terrain === 'cave' || terrain === 'snow' || terrain === 'sand') {
    for (let i = 0; i < 70; i++) {
      const sp = rd.chance(0.5) ? packHex(t.speck) : shift(t.alt, -0.05);
      ellipseF(buf, rd.i(FIELD_W), rd.i(FIELD_H), rd.range(0.8, 2.2), rd.range(0.6, 1.3), sp);
    }
  }

  // Wind ripples. Without them sand is grey mud: the ripple is the only thing
  // that says a desert floor is loose and blown, and it has to cross tiles or
  // it just draws the grid again. A lit crest with its own shadow under it.
  if (terrain === 'sand') {
    const crest = shift(t.speck, 0.03), trough = shift(t.alt, -0.06);
    for (let i = 0; i < 26; i++) {
      const x0 = rd.i(FIELD_W), y0 = rd.i(FIELD_H);
      const len = rd.int(22, 52), amp = rd.range(1.5, 4), ph = rd.range(0, Math.PI * 2);
      for (let k = 0; k < len; k++) {
        const y = y0 + Math.sin(ph + k * 0.16) * amp;
        wrapPx(buf, x0 + k, y, crest);
        wrapPx(buf, x0 + k, y + 1, trough);
      }
    }
  }

  // Jungle floor: standing rot in dark pools, then pale litter over the top of
  // it. Twice the tufts grass gets, because nothing here has been walked on.
  if (terrain === 'jungle') {
    const frond = packHex(t.speck), damp = shift(t.alt, -0.07);
    for (let i = 0; i < 34; i++) {
      ellipseF(buf, rd.i(FIELD_W), rd.i(FIELD_H), rd.range(2.5, 6.5), rd.range(1.4, 3.2), damp);
    }
    for (let i = 0; i < 210; i++) {
      const x = rd.i(FIELD_W), y = rd.int(1, FIELD_H - 2);
      px(buf, x, y, frond);
      px(buf, x, y - 1, frond);
      if (rd.chance(0.4)) px(buf, x + 1, y, damp);
    }
  }

  // Temple stone is older than the jungle around it: the moss goes down before
  // the slab joints, so the joints read as growing out of it.
  if (terrain === 'temple') {
    const moss = packHex('#2f3a26');
    for (let i = 0; i < 44; i++) {
      ellipseF(buf, rd.i(FIELD_W), rd.i(FIELD_H), rd.range(1.5, 4.5), rd.range(1, 2.4), moss);
    }
  }
  // Obsidian is glass that cracked as it cooled. The veins are darker and warmer
  // than the floor, never brighter: a lit crack would make the ground its own
  // light source, and the light pass is what is supposed to sell hell. Wrapped,
  // because a vein cut at the field edge draws the tile grid back on.
  if (terrain === 'obsidian') {
    const vein = packHex('#3d241d'), deep = packHex('#1b1418');
    for (let i = 0; i < 20; i++) {
      let x = rd.i(FIELD_W), y = rd.i(FIELD_H);
      let a = rd.range(0, Math.PI * 2);
      const len = rd.int(18, 44);
      for (let k = 0; k < len; k++) {
        wrapPx(buf, x, y, k % 5 ? vein : deep);
        wrapPx(buf, x, y + 1, deep);
        a += rd.range(-0.35, 0.35);
        x += Math.cos(a) * 1.4; y += Math.sin(a) * 0.7;
      }
    }
  }

  // Ice: fractures pale, air trapped under them paler still. The fracture is the
  // only thing that says a floor is frozen rather than merely grey, so it is the
  // one detail here allowed to be lighter than the base.
  if (terrain === 'ice') {
    const crack = shift(t.speck, 0.10), bubble = shift(t.speck, 0.04);
    for (let i = 0; i < 16; i++) {
      const x0 = rd.i(FIELD_W), y0 = rd.i(FIELD_H);
      const a = rd.range(0, Math.PI * 2), len = rd.int(24, 60);
      for (let k = 0; k < len; k++) {
        // Stepped a pixel at a time, or the crack comes out as a dashed line and
        // reads as scratches on the screen rather than a split in the floor.
        wrapPx(buf, x0 + Math.cos(a) * k, y0 + Math.sin(a) * k * 0.5, crack);
      }
    }
    for (let i = 0; i < 40; i++) {
      ellipseF(buf, rd.i(FIELD_W), rd.i(FIELD_H), rd.range(0.8, 2.0), rd.range(0.6, 1.2), bubble);
    }
  }

  if (terrain === 'blood') {
    const sp = packRGB(84, 22, 18, 255);
    for (let i = 0; i < 22; i++) {
      ellipseF(buf, rd.i(FIELD_W), rd.i(FIELD_H), rd.range(1.5, 4.5), rd.range(1, 2.4), sp);
    }
  }

  // Built floors read as masonry, but on two-tile slabs: joints on the
  // doubled lattice with a per-slab tone step. Slabs big enough that the
  // masonry does not trace the gameplay grid back onto the screen.
  if (BUILT_FLOORS.has(terrain)) {
    const joint = shift(t.alt, -0.06);
    for (let a = -2; a <= 4; a++) {
      for (let b = -2; b <= 4; b++) {
        if ((a + b) & 1) continue;
        const cx = a * 64, cy = b * 32;
        let h = (Math.imul(a & 3, 73856093) ^ Math.imul(b & 3, 19349663)) >>> 0;
        h = (h ^ (h >>> 13)) & 1023;
        const k = 1 + (h / 1023 - 0.5) * 0.11;
        for (let dy = -32; dy < 32; dy++) {
          const yy = cy + dy;
          if (yy < 0 || yy >= FIELD_H) continue;
          const half = 64 - 2 * Math.abs(dy);
          for (let dx = -half; dx < half; dx++) {
            const xx = cx + dx;
            if (xx < 0 || xx >= FIELD_W) continue;
            const i = yy * FIELD_W + xx;
            buf.data[i] = mulC(buf.data[i], k);
          }
        }
        lineP(buf, cx - 64, cy, cx, cy - 32, joint);
        lineP(buf, cx, cy - 32, cx + 64, cy, joint);
      }
    }
  }

  // Last, over everything: detail and slab joints are part of the floor and
  // grain like the rest of it.
  grainOverlay(buf, rng.seed);
  return buf;
}

// Cut one 64x32 diamond out of the field at the given offset, wrapping.
function cutDiamond(field, ox, oy) {
  const buf = new Buf(TW, TH);
  for (let y = 0; y < TH; y++) {
    const { x0, w } = rowSpan(y);
    let sy = (oy + y) % FIELD_H; if (sy < 0) sy += FIELD_H;
    for (let x = x0; x < x0 + w; x++) {
      let sx = (ox + x) % FIELD_W; if (sx < 0) sx += FIELD_W;
      buf.data[y * TW + x] = field.data[sy * FIELD_W + sx];
    }
  }
  return buf;
}

// All 64 windows onto the field. Half the slots can never be asked for (the
// two lattice axes always share parity) but baking them all keeps the
// indexing trivial and the cuts are cheap.
function bakeGroundSet(field) {
  const set = new Array(64);
  for (let ai = 0; ai < 8; ai++) {
    for (let bi = 0; bi < 8; bi++) {
      set[(ai << 3) | bi] = bufToCanvas(cutDiamond(field, ai * 32 - 32, bi * 16 - 16));
    }
  }
  return set;
}

// ------------------------------------------------------------------- walls

// Indoors these are built walls: tall, with the same material top and face.
// Outdoors they are raised banks, so the face is exposed rock and the top
// continues the terrain, cut from the same seamless field as the ground so a
// plateau reads as one landform. No outline around wall blocks: a per-block
// silhouette is exactly what used to draw a grid over every rock mass.
const WALL_STYLE = {
  cave:   { face: '#3f3a30', top: '#4a453a', h: 46, built: true },
  crypt:  { face: '#46444e', top: '#55525e', h: 46, built: true },
  cobble: { face: '#4c463c', top: '#575043', h: 42, built: true },
  grass:  { face: '#4c4335', h: 26 },
  dirt:   { face: '#4c4335', h: 24 },
  blood:  { face: '#3e3128', h: 26 },
  snow:   { face: '#5c6170', h: 26 },
  // Sand banks are low and soft -- a dune is a shape you walk around, not a
  // cliff. Sandstone is a built wall, tomb height. Jungle walls are a mass of
  // foliage: tall enough to close the view down, and unbuilt so the canopy on
  // top is cut from the same ground field as the floor.
  sand:      { face: '#5a5344', h: 22 },
  sandstone: { face: '#5d5646', top: '#6a6252', h: 44, built: true },
  jungle:    { face: '#2a3122', h: 34 },
  temple:    { face: '#3a3f38', top: '#454b41', h: 46, built: true },
  // The fortress is masonry cut from the same glass as its floor, so obsidian
  // takes courses. Ice walls are not laid by anybody: unbuilt, so the cavern
  // roof is cut from the floor field and the whole passage reads as one mass.
  obsidian:  { face: '#2e262b', top: '#382e34', h: 46, built: true },
  ice:       { face: '#48545f', h: 42 },
};

// The two visible faces of one block, top left empty. Face texture does not
// need to be seamless across blocks: the dark joint down each side sells the
// seam as a deliberate break, masonry on built walls and a crevice on rock.
function bakeWallFace(terrain, rng) {
  const s = WALL_STYLE[terrain] || WALL_STYLE.cave;
  const H = s.h;
  const buf = new Buf(TW, TH + H);
  const noise = fbm2(rng, 3);
  const nx = rng.range(0, 100), ny = rng.range(0, 100);

  const faceL = shift(s.face, -0.07);
  const faceR = shift(s.face, 0.03);
  // Foliage is not stone: it wants a second, finer octave on top of the broad
  // one, so the face breaks into leaf-sized clumps instead of reading as a
  // painted green plank. Mottling inside the fill is spill-proof, which
  // scattering clumps over the face afterwards would not be.
  const leafy = terrain === 'jungle';
  const shade = (c, x, y, amt) => {
    let n = (noise(nx + x * 0.12, ny + y * 0.12) - 0.5) * amt;
    if (leafy) n += (noise(nx + 40 + x * 0.5, ny + 40 + y * 0.5) - 0.5) * 0.5;
    return mulC(c, 1 + n);
  };

  polyF(buf, [0, 16, 32, 31, 32, 31 + H, 0, 16 + H], 0, (x, y) => shade(faceL, x, y, 0.34));
  polyF(buf, [32, 31, 64, 16, 64, 16 + H, 32, 31 + H], 0, (x, y) => shade(faceR, x, y, 0.34));

  // Masonry courses on built walls, cracks on natural rock.
  if (s.built && BUILT_FLOORS.has(terrain)) {
    const dark = packRGB(0, 0, 0, 70);
    for (let k = 1; k * 12 < H; k++) {
      const yy = 31 + k * 12;
      lineP(buf, 0, 16 + k * 12, 32, yy, dark);
      lineP(buf, 32, yy, 64, 16 + k * 12, dark);
    }
  } else {
    const dark = packRGB(0, 0, 0, 60);
    for (let i = 0; i < 5; i++) {
      const x = rng.int(4, 60), y = rng.int(34, TH + H - 6);
      lineP(buf, x, y, x + rng.int(-4, 4), y + rng.int(3, 9), dark);
    }
  }

  const joint = packRGB(0, 0, 0, 60);
  lineP(buf, 0, 16, 0, 16 + H, joint);
  lineP(buf, 63, 16, 63, 16 + H, joint);
  lineP(buf, 32, 31, 32, 31 + H, packRGB(0, 0, 0, 45));
  // Faces grain too, or a sharp floor stops dead at a soft wall and the
  // mismatch just moves house. Faces need no wrap; the joints own the seams.
  grainOverlay(buf, rng.seed);
  return buf;
}

// Built walls cap with their own stone texture; small field, same wrap.
function bakeTopField(s, rng) {
  const n1 = wrapNoise(rng.fork('a'), FIELD_W, FIELD_H * 2, 32);
  const n2 = wrapNoise(rng.fork('b'), FIELD_W, FIELD_H * 2, 8);
  const buf = new Buf(FIELD_W, FIELD_H);
  const c0 = packHex(s.top);
  for (let y = 0; y < FIELD_H; y++) {
    for (let x = 0; x < FIELD_W; x++) {
      const v = ((n1(x, y * 2) - 0.5) * 0.7 + (n2(x, y * 2) - 0.5) * 0.5) * 0.22;
      buf.data[y * FIELD_W + x] = mulC(c0, 1 + v);
    }
  }
  grainOverlay(buf, rng.seed);
  return buf;
}

// Compose the 64 lattice variants: shared faces, top cut from the field at
// the block's own offset (raised by the wall height, so neighbouring tops
// still line up with each other).
function bakeWallSet(terrain, groundField, rng) {
  const s = WALL_STYLE[terrain] || WALL_STYLE.cave;
  const H = s.h;
  const faces = [];
  for (let i = 0; i < 3; i++) faces.push(bakeWallFace(terrain, rng.fork('face' + i)));
  const topField = s.built ? bakeTopField(s, rng.fork('top')) : groundField;
  const topShade = s.built ? 1 : 0.88;

  const set = new Array(64);
  for (let ai = 0; ai < 8; ai++) {
    for (let bi = 0; bi < 8; bi++) {
      const buf = new Buf(TW, TH + H);
      blitBuf(buf, faces[(ai * 5 + bi * 3) % 3], 0, 0);
      const top = cutDiamond(topField, ai * 32 - 32, bi * 16 - 16 - H);
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          const c = top.data[y * TW + x];
          if (!(c >>> 24)) continue;
          buf.data[y * TW + x] = topShade === 1 ? c : mulC(c, topShade);
        }
      }
      set[(ai << 3) | bi] = { canvas: bufToCanvas(buf), ox: 32, oy: 16 + H };
    }
  }
  return set;
}

// -------------------------------------------------------------------- props

// Every prop returns the canvas plus the offset from its top-left to the tile
// centre it stands on, so drawing is always at (screenX - ox, screenY - oy).
function propTree(rng) {
  const buf = new Buf(88, 116);
  const bark = ramp('#453120');
  const leaf = ramp(rng.chance(0.5) ? '#2a3a1e' : '#233218');
  const lean = rng.range(-4, 4);
  capsule(buf, 44, 112, 7, 44 + lean, 58, 4.5, bark);
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    capsule(buf, 44 + lean * 0.7, 68, 3.2, 44 + lean + Math.cos(a) * 16, 56 + Math.sin(a) * 8, 1.2, bark);
  }
  // Many small clumps rather than a few fat ones: the ragged edge is what
  // separates a moor tree from a lollipop.
  for (let i = 0; i < 15; i++) {
    const cx = 44 + lean + rng.range(-24, 24), cy = 38 + rng.range(-22, 16);
    ellipse(buf, cx, cy, rng.range(8, 15), rng.range(6, 11), leaf);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 44, oy: 112 };
}

function propRock(rng) {
  const buf = new Buf(44, 40);
  const rm = ramp('#565149');
  for (let i = 0; i < 4; i++) {
    ellipse(buf, 22 + rng.range(-8, 8), 28 + rng.range(-8, 4), rng.range(6, 12), rng.range(5, 9), rm);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 22, oy: 34 };
}

function propColumn(rng) {
  const buf = new Buf(36, 78);
  const rm = ramp('#6d675c');
  capsule(buf, 18, 72, 8, 18, 16, 7, rm);
  ellipse(buf, 18, 12, 11, 5, ramp('#7c7568'));
  ellipse(buf, 18, 72, 11, 5, ramp('#7c7568'));
  if (rng.chance(0.4)) rectF(buf, 12, 34, 12, 2, packRGB(0, 0, 0, 60));
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 18, oy: 74 };
}

function propBrazier() {
  const buf = new Buf(32, 46);
  const metal = ramp(COLORS.darkSteel);
  capsule(buf, 16, 42, 2.5, 16, 24, 2, metal);
  for (const d of [-1, 1]) capsule(buf, 16, 40, 2, 16 + d * 7, 44, 1.5, metal);
  ellipse(buf, 16, 20, 9, 5, metal);
  ellipseF(buf, 16, 19, 7, 3, packHex('#3a2a1a'));
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 16, oy: 43, light: { r: 5.5, color: '#ff9040', dz: 24 } };
}

function propTorch() {
  const buf = new Buf(20, 34);
  const metal = ramp(COLORS.darkSteel);
  capsule(buf, 10, 30, 2, 10, 12, 1.6, ramp(COLORS.wood));
  ellipse(buf, 10, 10, 4, 3.5, metal);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 10, oy: 31, light: { r: 4.5, color: '#ff9a50', dz: 22 } };
}

function propBarrel() {
  const buf = new Buf(30, 40);
  const wood = ramp(COLORS.wood);
  const band = ramp(COLORS.darkSteel);
  capsule(buf, 15, 34, 9, 15, 14, 9, wood);
  ellipse(buf, 15, 12, 9, 4, ramp('#6d5033'));
  for (const y of [18, 28]) {
    capsule(buf, 6, y, 1.4, 24, y, 1.4, band);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 15, oy: 36 };
}

function propChest() {
  const buf = new Buf(40, 34);
  const wood = ramp('#6a4a2a');
  const metal = ramp(COLORS.gold);
  polyF(buf, [4, 20, 20, 12, 36, 20, 20, 28], packHex('#7a5630'));
  capsule(buf, 8, 20, 4, 32, 20, 4, wood);
  ellipse(buf, 20, 13, 15, 6, wood);
  ellipse(buf, 20, 20, 3, 3, metal);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 20, oy: 26 };
}

function propGrave(rng) {
  const buf = new Buf(28, 40);
  const rm = ramp('#6a6a72');
  const tilt = rng.range(-2.5, 2.5);
  capsule(buf, 14 + tilt, 36, 7, 14, 14, 7, rm);
  ellipse(buf, 14, 13, 7, 6, rm);
  const dark = packRGB(0, 0, 0, 70);
  lineP(buf, 10, 22, 18, 22, dark);
  lineP(buf, 10, 26, 16, 26, dark);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 14, oy: 37 };
}

function propBones(rng) {
  const buf = new Buf(34, 20);
  const rm = ramp(COLORS.boneWhite);
  for (let i = 0; i < 4; i++) {
    const x = rng.range(6, 28), y = rng.range(8, 16);
    const a = rng.range(0, Math.PI);
    capsule(buf, x, y, 1.6, x + Math.cos(a) * 6, y + Math.sin(a) * 3, 1.6, rm);
  }
  ellipse(buf, rng.range(8, 26), 13, 3.5, 3, rm);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 17, oy: 15 };
}

function propWaypoint() {
  const buf = new Buf(60, 62);
  const stone = ramp('#5e5a66');
  const glow = ramp(COLORS.arcane);
  ellipse(buf, 30, 54, 20, 9, stone);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.62;
    const bx = 30 + Math.cos(a) * 17, by = 52 + Math.sin(a) * 8;
    capsule(buf, bx, by, 3, bx + Math.cos(a) * 5, by - 16, 2, stone);
  }
  ellipse(buf, 30, 34, 9, 12, glow);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 30, oy: 56, light: { r: 6, color: '#b070ff', dz: 26 } };
}

function propPortal() {
  const buf = new Buf(48, 68);
  const glow = ramp(COLORS.arcane);
  ellipse(buf, 24, 34, 14, 30, glow);
  ellipseF(buf, 24, 34, 9, 25, packRGB(210, 170, 255, 220));
  return { canvas: bufToCanvas(buf), ox: 24, oy: 64, light: { r: 7, color: '#b070ff', dz: 30 } };
}

function propStairs() {
  const buf = new Buf(64, 46);
  const rm = ramp('#5a564e');
  for (let i = 0; i < 4; i++) {
    const y = 34 - i * 6;
    const w = 26 - i * 4;
    polyF(buf, [32 - w, y, 32, y - w / 2, 32 + w, y, 32, y + w / 2], i % 2 ? rm.base : rm.dark);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 32, oy: 36 };
}

// --------------------------------------------------------- encampment props

// A canvas A-frame over a ridge pole, with a dark triangle for the open flap.
// The whole camp is these; two colours of canvas keeps a row from repeating.
function propTent(rng) {
  const buf = new Buf(96, 84);
  const canvas = ramp(rng.chance(0.5) ? '#8a7a5c' : '#7a6a4e');
  const pole = ramp(COLORS.wood);
  const W = 34, H = 44, base = 74;
  capsule(buf, 48, base - H - 4, 2, 48, base, 2, pole);
  // Two sloped faces, the left one lit.
  polyF(buf, [48, base - H, 48 + W, base, 48, base + 8], canvas.base);
  polyF(buf, [48, base - H, 48 - W, base, 48, base + 8], canvas.light);
  polyF(buf, [48, base - H, 48 - 11, base + 2, 48 + 11, base + 2], packRGB(0, 0, 0, 150));
  for (const d of [-1, 1]) {
    capsule(buf, 48 + d * W, base, 1.6, 48 + d * (W + 8), base + 6, 1.2, pole);
  }
  ellipse(buf, 48, base - H - 5, 2.5, 2.5, ramp(COLORS.blood));
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 48, oy: 76 };
}

// Warriv's wagon: a bed on two wheels under a hooped canvas tilt.
function propWagon() {
  const buf = new Buf(104, 72);
  const wood = ramp(COLORS.wood);
  const tilt = ramp('#9a8b6a');
  const iron = ramp(COLORS.darkSteel);
  rectF(buf, 18, 40, 68, 12, wood.base);
  capsule(buf, 18, 40, 2, 86, 40, 2, wood.light);
  polyF(buf, [22, 40, 30, 14, 74, 14, 82, 40], tilt.base);
  polyF(buf, [22, 40, 30, 14, 46, 14, 42, 40], tilt.light);
  // Hoops go on after the canvas, or the canvas simply paints over them.
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    lineP(buf, 22 + t * 60, 40, 30 + t * 44, 14, packRGB(0, 0, 0, 70));
  }
  for (const cx of [32, 74]) {
    ellipse(buf, cx, 56, 11, 11, iron);
    ellipseF(buf, cx, 56, 6, 6, packRGB(0, 0, 0, 120));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      capsule(buf, cx - Math.cos(a) * 9, 56 - Math.sin(a) * 9, 1,
        cx + Math.cos(a) * 9, 56 + Math.sin(a) * 9, 1, iron.light);
    }
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 52, oy: 64 };
}

// Charsi's forge: an anvil on a block, with the fire still in it.
function propAnvil() {
  const buf = new Buf(46, 44);
  const iron = ramp(COLORS.darkSteel);
  const wood = ramp(COLORS.wood);
  capsule(buf, 23, 38, 8, 23, 30, 8, wood);
  polyF(buf, [10, 22, 36, 22, 32, 27, 14, 27], iron.base);
  rectF(buf, 19, 27, 8, 5, iron.dark);
  polyF(buf, [4, 20, 14, 18, 14, 24, 6, 24], iron.light);
  ellipseF(buf, 23, 20, 5, 2, packHex('#ff8a30'));
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 23, oy: 40, light: { r: 4, color: '#ff7a30', dz: 14 } };
}

// Logs leaning into a cone over a low ring of stones. The stones stay small and
// dark: drawn any bigger they ring the fire like petals rather than sit round it.
function propCampfire(rng) {
  const buf = new Buf(48, 44);
  const stone = ramp('#4e4a44');
  const wood = ramp('#4a3520');
  const ground = 34;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    ellipse(buf, 24 + Math.cos(a) * 13, ground + Math.sin(a) * 6, 3.2, 2.2, stone);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng.range(0, 1.5);
    capsule(buf, 24 + Math.cos(a) * 9, ground + Math.sin(a) * 4, 2.4, 24, ground - 16, 1.4, wood);
  }
  // Flame: three stacked ellipses, coolest at the base.
  ellipseF(buf, 24, ground - 6, 7, 8, packHex('#a83a10'));
  ellipseF(buf, 24, ground - 11, 5, 7, packHex('#ff8020'));
  ellipseF(buf, 24, ground - 15, 2.6, 4.5, packHex('#ffd870'));
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 24, oy: ground + 3, light: { r: 8, color: '#ff8c3a', dz: 20 } };
}

// A box, not a lid: at this scale it has to be nearly as tall as it is wide or
// it reads as a plank lying on the ground.
function propCrate(rng) {
  const buf = new Buf(40, 44);
  const wood = ramp(rng.chance(0.5) ? '#6a5030' : COLORS.wood);
  const dark = packRGB(0, 0, 0, 80);
  const top = 12, bot = 38, half = 16;
  polyF(buf, [20 - half, top + 6, 20, top, 20 + half, top + 6, 20, top + 12], wood.light);
  polyF(buf, [20 - half, top + 6, 20, top + 12, 20, bot, 20 - half, bot - 6], wood.base);
  polyF(buf, [20 + half, top + 6, 20, top + 12, 20, bot, 20 + half, bot - 6], wood.dark);
  lineP(buf, 20 - half, top + 6, 20, bot - 8, dark);
  lineP(buf, 20 + half, top + 6, 20, bot - 8, dark);
  lineP(buf, 20 - half, (top + bot) / 2, 20, (top + bot) / 2 + 6, dark);
  lineP(buf, 20 + half, (top + bot) / 2, 20, (top + bot) / 2 + 6, dark);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 20, oy: 40 };
}

// A pointed stake, repeated along a line to fence the camp in.
function propPalisade(rng) {
  const buf = new Buf(24, 56);
  const wood = ramp(rng.chance(0.5) ? '#5a4028' : '#4e3722');
  capsule(buf, 12, 52, 5, 12, 12, 4.5, wood);
  polyF(buf, [7, 13, 12, 4, 17, 13], wood.light);
  capsule(buf, 4, 34, 1.6, 20, 32, 1.6, ramp(COLORS.darkSteel));
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 12, oy: 53 };
}

// ------------------------------------------------------------- desert props

// A palm has no canopy to hide behind: bare trunk, crown on top, and the whole
// read rests on the bend of the trunk and the droop of the fronds. Drawn in two
// tapering sections so the bend is a curve rather than a hinge.
function propPalm(rng) {
  const buf = new Buf(84, 120);
  const bark = ramp('#4a4030');
  const frond = ramp(rng.chance(0.5) ? '#39462b' : '#2f3c23');
  const lean = rng.range(-10, 10);
  const midX = 42 + lean * 0.35, topX = 42 + lean, topY = 36;
  capsule(buf, 42, 114, 6.5, midX, 76, 5, bark);
  capsule(buf, midX, 76, 5, topX, topY, 3.8, bark);
  // Frond scars up the trunk: the only detail a palm carries.
  for (let k = 1; k < 7; k++) {
    const t = k / 7;
    const x = 42 + (topX - 42) * t * 0.7, y = 114 - t * 62;
    lineP(buf, x - 4, y, x + 4, y - 1, packRGB(0, 0, 0, 60));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng.range(-0.12, 0.12);
    const mx = topX + Math.cos(a) * 17, my = topY + Math.sin(a) * 7 - 7;
    const ex = topX + Math.cos(a) * 26, ey = my + 13;
    capsule(buf, topX, topY, 3.2, mx, my, 2.2, frond);
    capsule(buf, mx, my, 2.2, ex, ey, 0.6, frond);
  }
  ellipse(buf, topX, topY + 1, 4.5, 3.5, bark);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 42, oy: 114 };
}

// Barrel trunk, one or two arms, vertical ribs and spines along the edges. The
// green is grey with a memory of green in it, which is what desert plants are.
function propCactus(rng) {
  const buf = new Buf(46, 78);
  const flesh = ramp('#3f4a37');
  const spine = packHex('#8a8266');
  const base = 70, H = rng.int(38, 50);
  capsule(buf, 23, base, 9.5, 23, base - H, 7.5, flesh);
  // Arms carry the whole silhouette, so they are thick and they climb: drawn
  // thin they read as twigs and the plant goes back to being a green pill.
  for (let i = 0; i < rng.int(1, 2); i++) {
    const s = i === 0 ? -1 : 1;
    const y = base - H * rng.range(0.38, 0.58);
    capsule(buf, 23, y, 5, 23 + s * 12, y - 2, 4.4, flesh);
    capsule(buf, 23 + s * 12, y - 2, 4.4, 23 + s * 12, y - rng.int(16, 24), 3.6, flesh);
  }
  for (let k = 0; k < 4; k++) {
    const x = 19 + k * 3;
    lineP(buf, x, base - 2, x, base - H + 2, packRGB(0, 0, 0, 55));
  }
  // Spines ride the silhouette, so they follow the taper rather than a fixed
  // column -- off the edge they would just be dots with an outline round them.
  for (let i = 0; i < 20; i++) {
    const y = rng.int(base - H + 2, base - 2);
    const r = 9.5 - ((base - y) / H) * 2;
    px(buf, 23 + (rng.chance(0.5) ? -1 : 1) * (r - 1), y, spine);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 23, oy: 71 };
}

// A tapered shaft with a pyramid cap: two faces meeting on a vertical edge at
// the projection's own angle, so it stands as a solid instead of a painted
// plank. Carved bands follow the same slope the wall courses use.
function propObelisk(rng) {
  const buf = new Buf(46, 108);
  const stone = ramp('#5f5747');
  const cx = 23, bot = 90, top = 24;
  const wb = 13, wt = 8.5;
  polyF(buf, [cx - wb, bot, cx, bot + wb / 2, cx, top + wt / 2, cx - wt, top], stone.base);
  polyF(buf, [cx + wb, bot, cx, bot + wb / 2, cx, top + wt / 2, cx + wt, top], stone.dark);
  polyF(buf, [cx - wt, top, cx, top + wt / 2, cx, top - 18], stone.light);
  polyF(buf, [cx + wt, top, cx, top + wt / 2, cx, top - 18], stone.base);
  const carve = packRGB(0, 0, 0, 70);
  for (let k = 1; k < 5; k++) {
    const y = top + ((bot - top) * k) / 5;
    const w = wt + ((wb - wt) * k) / 5;
    lineP(buf, cx - w, y, cx, y + w / 2, carve);
    lineP(buf, cx, y + w / 2, cx + w, y, carve);
  }
  for (let i = 0; i < 7; i++) {
    const y = rng.int(top + 8, bot - 8);
    lineP(buf, cx - 4, y, cx - 1, y, carve);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: cx, oy: bot + 6 };
}

// A stone coffin, lid slightly proud of the box so the overhang catches the
// light. The carved figure on the lid is two strokes; anything more is mud at
// this size.
function propSarcophagus(rng) {
  const buf = new Buf(56, 52);
  const stone = ramp('#5a5445');
  const cx = 28, top = 14, hw = 24, hh = 12, H = 17;
  polyF(buf, [cx - hw, top + hh, cx, top + hh + hh, cx, top + hh + hh + H, cx - hw, top + hh + H], stone.dark);
  polyF(buf, [cx + hw, top + hh, cx, top + hh + hh, cx, top + hh + hh + H, cx + hw, top + hh + H], stone.deep);
  polyF(buf, [cx - hw, top + hh, cx, top, cx + hw, top + hh, cx, top + hh * 2], stone.base);
  // The lid sits proud of the box. Kept a band lighter than the sides and no
  // more: painted at full highlight the whole coffin reads as a dust sheet.
  const lid = 3;
  polyF(buf, [cx - hw + 4, top + hh - lid, cx, top - lid, cx + hw - 4, top + hh - lid, cx, top + hh * 2 - lid - 2], stone.light);
  const carve = packRGB(0, 0, 0, 90);
  lineP(buf, cx - hw + 4, top + hh, cx, top + hh * 2, carve);
  lineP(buf, cx + hw - 4, top + hh, cx, top + hh * 2, carve);
  lineP(buf, cx - 9, top + hh - lid, cx + 9, top + hh - lid + 4, carve);
  lineP(buf, cx - 4, top + hh - lid - 4, cx - 4, top + hh - lid + 6, carve);
  if (rng.chance(0.5)) lineP(buf, cx + 4, top + hh - lid - 2, cx + 4, top + hh - lid + 6, carve);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: cx, oy: top + hh * 2 + H - 2 };
}

// A clay jar. Fat belly, short neck, a lip wide enough to read, and one painted
// band -- the sort of thing left standing in a tomb for somebody to smash.
function propUrn(rng) {
  const buf = new Buf(30, 40);
  const clay = ramp(rng.chance(0.5) ? '#5e4634' : '#54402f');
  ellipse(buf, 15, 24, 9, 10, clay);
  capsule(buf, 15, 16, 4.5, 15, 11, 4, clay);
  ellipse(buf, 15, 10, 6.5, 3, ramp('#6a5038'));
  lineP(buf, 7, 22, 23, 22, packRGB(0, 0, 0, 60));
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 15, oy: 34 };
}

// ------------------------------------------------------------- jungle props

// A clump of arcing fronds from one root, with short pinnae off each spine --
// without those it is a handful of grass.
function propFern(rng) {
  const buf = new Buf(68, 62);
  const leaf = ramp(rng.chance(0.5) ? '#33422a' : '#2b3823');
  const cx = 34, root = 54;
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * (0.1 + (i / 7) * 0.8) + rng.range(-0.07, 0.07);
    const L = rng.range(22, 31);
    const mx = cx + Math.cos(a) * L * 0.6, my = root + Math.sin(a) * L * 0.6;
    const ex = cx + Math.cos(a) * L, ey = my + rng.range(3, 8);
    capsule(buf, cx, root, 3.2, mx, my, 2.2, leaf);
    capsule(buf, mx, my, 2.2, ex, ey, 0.6, leaf);
    // Pinnae off each spine. Without them the clump is a handful of grass.
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      const sx = cx + (ex - cx) * t, sy = root + (ey - root) * t;
      lineP(buf, sx, sy, sx + Math.cos(a + 1.3) * 5, sy + Math.sin(a + 1.3) * 4, leaf.dark);
      lineP(buf, sx, sy, sx + Math.cos(a - 1.3) * 5, sy + Math.sin(a - 1.3) * 4, leaf.deep);
    }
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: cx, oy: 56 };
}

// Vines off a limb overhead. The limb itself is drawn -- three bare strands
// without it read as a ladder rather than as something hanging, which is the
// one thing this prop has to say. Strands swing out before they fall, and stop
// short of the ground so the canopy above stays implied.
function propVine(rng) {
  const buf = new Buf(52, 100);
  const stem = ramp('#2f3a24');
  const leaf = ramp('#35442a');
  const bark = ramp('#3a3226');
  capsule(buf, 3, 10, 3.4, 48, 6, 2.6, bark);
  for (let i = 0; i < 3; i++) {
    const anchor = 10 + i * 15 + rng.range(-3, 3);
    let x = anchor, y = 10;
    // Swing out, then fall: the lateral drift decays as the strand loses the
    // push it started with, which is what a hanging curve looks like.
    let drift = rng.range(-1.5, 1.5);
    const len = rng.int(54, 84);
    while (y < len) {
      const nx = Math.max(5, Math.min(47, x + drift * 7)), ny = y + 9;
      capsule(buf, x, y, 2.4, nx, ny, 2.1, stem);
      for (const s of rng.chance(0.4) ? [-1, 1] : [rng.chance(0.5) ? -1 : 1]) {
        ellipse(buf, nx + s * 4, ny - 2, 4, 2.6, leaf);
      }
      x = nx; y = ny;
      drift *= 0.62;
    }
    ellipse(buf, x, y + 1, 3, 3.6, leaf);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 26, oy: 96 };
}

// A carved figure on a plinth: broad shoulders, a head sunk between them, arms
// folded across the belly. The body has to out-mass the head or the whole thing
// reads as a snowman. Sockets stay dark -- nothing here lights itself but fire.
function propIdol(rng) {
  const buf = new Buf(48, 78);
  const stone = ramp('#4a4c42');
  const moss = ramp('#33402c');
  const cx = 24, base = 68, plinth = 10;
  polyF(buf, [cx - 16, base - plinth, cx, base - plinth + 8, cx + 16, base - plinth, cx, base - plinth - 8], stone.base);
  polyF(buf, [cx - 16, base - plinth, cx, base - plinth + 8, cx, base, cx - 16, base - plinth + 8], stone.dark);
  polyF(buf, [cx + 16, base - plinth, cx, base - plinth + 8, cx, base, cx + 16, base - plinth + 8], stone.deep);
  capsule(buf, cx, base - plinth - 4, 13, cx, base - plinth - 28, 12.5, stone);
  capsule(buf, cx - 12, base - plinth - 30, 5, cx + 12, base - plinth - 30, 5, stone);
  ellipse(buf, cx, base - plinth - 39, 9, 8.5, stone);
  const dark = packRGB(0, 0, 0, 130);
  ellipseF(buf, cx - 3.5, base - plinth - 41, 2.2, 1.8, dark);
  ellipseF(buf, cx + 3.5, base - plinth - 41, 2.2, 1.8, dark);
  rectF(buf, cx - 4, base - plinth - 35, 8, 2, dark);
  // Arms folded, and a carved band under them: two lines of relief is all the
  // carving that survives at this size.
  capsule(buf, cx - 11, base - plinth - 19, 4, cx + 11, base - plinth - 17, 4, stone);
  lineP(buf, cx - 11, base - plinth - 10, cx + 11, base - plinth - 10, dark);
  for (let i = 0; i < 7; i++) {
    ellipse(buf, cx + rng.range(-9, 9), base - plinth - rng.range(4, 34), rng.range(2, 4.5), rng.range(1.5, 3), moss);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: cx, oy: base };
}

// --------------------------------------------------------------- hell props

// A shard of the floor stood on end: one tall spike leaning off vertical, with
// smaller shards at its foot so it reads as something that broke upward rather
// than a post somebody planted. Facets rather than a round trunk -- glass has
// flat faces, and the two-tone split down the spike is what says so.
function propHellspike(rng) {
  const buf = new Buf(40, 92);
  const glass = ramp('#2c2529');
  const cx = 20, base = 84;
  const lean = rng.range(-6, 6), H = rng.int(46, 66);
  const tipX = cx + lean, tipY = base - H;
  const w = rng.range(7, 9);
  polyF(buf, [cx - w, base, cx, base + w / 2, tipX, tipY], glass.base);
  polyF(buf, [cx + w, base, cx, base + w / 2, tipX, tipY], glass.dark);
  polyF(buf, [cx - w, base, cx - w * 0.3, base - 2, tipX, tipY], glass.light);
  for (let i = 0; i < rng.int(2, 3); i++) {
    const s = i === 0 ? -1 : 1;
    const sx = cx + s * rng.range(9, 14), h = rng.range(14, 24);
    polyF(buf, [sx - 4.5, base, sx, base + 2, sx + rng.range(-2, 2), base - h], glass.base);
    polyF(buf, [sx + 4.5, base, sx, base + 2, sx, base - h], glass.dark);
  }
  // The seams run with the taper, so the facets keep their own edges. One of them
  // is a cooled crack rather than a shadow: the same warmth the floor veins carry,
  // which is what ties the spike to the ground it came out of.
  const seam = packRGB(0, 0, 0, 80);
  lineP(buf, cx, base, tipX, tipY, seam);
  lineP(buf, cx - w * 0.45, base - 4, tipX - 1, tipY + 6, packHex('#4a2a1e'));
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: cx, oy: base + 3 };
}

// A crack in the floor with the melt still in it. Brazier-class light pool: the
// same hookup the brazier uses, warmer and set lower, because the source is at
// floor level rather than up on a stand. The molten centre is drawn small --
// the light pass does the spilling, not the sprite.
function propLavavent(rng) {
  const buf = new Buf(48, 34);
  const rock = ramp('#2a2226');
  const cx = 24, cy = 22;
  ellipse(buf, cx, cy, 17, 8, rock);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
    ellipse(buf, cx + Math.cos(a) * 12, cy + Math.sin(a) * 5.5, rng.range(3, 5), rng.range(2, 3.2), rock);
  }
  ellipseF(buf, cx, cy, 9.5, 4.5, packHex('#5a2410'));
  ellipseF(buf, cx, cy, 6.5, 3, packHex('#b8400e'));
  ellipseF(buf, cx, cy - 0.5, 3.6, 1.8, packHex('#ff8a24'));
  ellipseF(buf, cx, cy - 1, 1.6, 0.9, packHex('#ffd070'));
  outline(buf, OUTLINE);
  // No light descriptor here: what a prop lights is the generator's business,
  // and it reads `LIGHT_COLORS` in gen.js. A baker that carried its own light
  // shape would be a second, differently-spelled definition nothing consults.
  return { canvas: bufToCanvas(buf), ox: cx, oy: cy + 6 };
}

// -------------------------------------------------------------- winter props

// A cluster of ice columns grown from the floor: one tall, two short, all
// tapering to a point, with a lit edge down the near face. Ice is nearly the
// colour of the wall behind it, so the highlight is the whole read.
function propIcicle(rng) {
  const buf = new Buf(40, 74);
  const ice = ramp('#5e6e7e');
  const base = 66, cx = 20;
  const cols = [[0, rng.int(34, 50), 6], [rng.range(-11, -7), rng.int(16, 26), 4], [rng.range(7, 11), rng.int(14, 24), 3.4]];
  for (const [dx, H, w] of cols) {
    const x = cx + dx;
    polyF(buf, [x - w, base, x, base + w / 2, x + rng.range(-1.5, 1.5), base - H], ice.base);
    polyF(buf, [x + w, base, x, base + w / 2, x, base - H], ice.dark);
    lineP(buf, x - w + 1, base - 2, x, base - H + 2, ice.light);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: cx, oy: base + 3 };
}

// Somebody who did not make it off the mountain, frosted over where they fell.
// Read as a body, not a rock: the shape has to keep a head and one arm clear of
// the mass, and the frost sits on top as a pale rime rather than a snowdrift.
function propFrozencorpse(rng) {
  const buf = new Buf(54, 38);
  const flesh = ramp('#4a4a4e');
  const rag = ramp('#3a3630');
  const rime = ramp('#8a99a6');
  const cx = 26, y = 24;
  // Torso along the ground, then a head clear of it and two limbs thrown out.
  // Without the head and the arm this is a boulder, which is exactly what the
  // first pass looked like at game zoom next to the rocks.
  ellipse(buf, cx, y, 12, 6, rag);
  ellipse(buf, cx + 13, y - 5, 5.0, 4.4, flesh);
  capsule(buf, cx + 9, y - 3, 2.2, cx + 12, y - 9, 1.8, flesh);
  const a = rng.range(-0.7, 0.3);
  capsule(buf, cx + 3, y - 3, 2.8, cx - 9 + Math.cos(a) * 4, y - 8 + Math.sin(a) * 4, 1.7, flesh);
  capsule(buf, cx - 7, y + 1, 3.0, cx - 19, y + rng.range(1, 4), 2.0, rag);
  capsule(buf, cx - 5, y + 4, 2.6, cx - 14, y + 6, 1.8, rag);
  for (let i = 0; i < 8; i++) {
    ellipse(buf, cx + rng.range(-14, 12), y - rng.range(1, 7), rng.range(1.6, 3.4), rng.range(1, 2), rime);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: cx, oy: y + 6 };
}

// A pole with a cloth hung off a crossbar: the tatter along the bottom edge is
// what tells a banner apart from a signboard at this size. Two cloths, so a row
// of them along a wall does not read as one stamp repeated.
function propBanner(rng) {
  const buf = new Buf(44, 96);
  const pole = ramp('#3a3026');
  const cloth = ramp(rng.chance(0.5) ? '#5a2226' : '#33384a');
  const iron = ramp(COLORS.darkSteel);
  const cx = 15, base = 88, top = 10;
  capsule(buf, cx, base, 2.6, cx, top, 2.0, pole);
  capsule(buf, cx - 1, top + 4, 1.4, cx + 21, top + 6, 1.2, pole);
  // The cloth hangs from the bar, tapering in and torn along the bottom. Drawn
  // narrower than this it is a signboard; the tatter is what makes it a banner,
  // so the teeth are deep enough to survive game zoom.
  const hang = rng.int(42, 56);
  polyF(buf, [cx + 1, top + 5, cx + 21, top + 7, cx + 18, top + 7 + hang, cx + 2, top + 5 + hang], cloth.base);
  polyF(buf, [cx + 1, top + 5, cx + 9, top + 6, cx + 8, top + 6 + hang, cx + 2, top + 5 + hang], cloth.light);
  for (let i = 0; i < 6; i++) {
    const x = cx + 3 + i * 2.8;
    const d = rng.int(4, 11);
    polyF(buf, [x - 1.4, top + 5 + hang, x + 1.4, top + 5 + hang, x, top + 5 + hang + d], cloth.dark);
  }
  ellipse(buf, cx, top - 2, 2.6, 3.2, iron);
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: cx, oy: base + 3 };
}

const PROP_BAKERS = {
  tree: propTree, rock: propRock, column: propColumn, brazier: propBrazier,
  torch: propTorch, barrel: propBarrel, chest: propChest, gravestone: propGrave,
  bones: propBones, waypoint: propWaypoint, portal: propPortal, stairs: propStairs,
  tent: propTent, wagon: propWagon, anvil: propAnvil, campfire: propCampfire,
  crate: propCrate, palisade: propPalisade,
  palm: propPalm, cactus: propCactus, obelisk: propObelisk,
  sarcophagus: propSarcophagus, urn: propUrn,
  fern: propFern, vine: propVine, idol: propIdol,
  hellspike: propHellspike, lavavent: propLavavent,
  icicle: propIcicle, frozencorpse: propFrozencorpse, banner: propBanner,
};

// Props scattered in numbers need variants or a stand of palms looks stamped.
// One bake of anything that stands alone.
const PROP_VARIANTS = new Set([
  'tree', 'rock', 'gravestone', 'bones', 'tent', 'crate', 'palisade',
  'palm', 'cactus', 'fern', 'vine', 'urn',
  'hellspike', 'lavavent', 'icicle', 'frozencorpse', 'banner',
]);

// ------------------------------------------------------------------ exports

export const GROUND = {};
export const WALLS = {};
export const PROPS = {};

// The variant is the tile's own window onto the seamless field, indexed by
// where the tile lands on the screen lattice. Two tiles that touch pick
// adjacent windows, so the texture continues across the join.
export function getGround(terrain, wx, wy) {
  const set = GROUND[terrain] || GROUND.dirt;
  return set[(((wx - wy) & 7) << 3) | ((wx + wy) & 7)];
}

export function getWall(terrain, wx, wy) {
  const set = WALLS[terrain] || WALLS.cave;
  return set[(((wx - wy) & 7) << 3) | ((wx + wy) & 7)];
}

// How many times the generator below yields, so the loading bar does not have
// to be told by hand every time a terrain or a prop is added.
export const TILE_BAKE_STEPS = Object.keys(TERRAIN).length * 2 + Object.keys(PROP_BAKERS).length;

// Bake everything, yielding often enough that the loading screen keeps drawing.
export function* bakeTiles() {
  const rng = new Rng(20260728);
  const terrains = Object.keys(TERRAIN);
  const fields = {};
  for (const t of terrains) {
    fields[t] = bakeGroundField(t, rng.fork('field' + t));
    GROUND[t] = bakeGroundSet(fields[t]);
    yield { label: 'ground ' + t };
  }
  for (const t of terrains) {
    WALLS[t] = bakeWallSet(t, fields[t], rng.fork('wall' + t));
    yield { label: 'walls ' + t };
  }
  for (const name of Object.keys(PROP_BAKERS)) {
    const n = PROP_VARIANTS.has(name) ? 4 : 1;
    PROPS[name] = [];
    for (let i = 0; i < n; i++) PROPS[name].push(PROP_BAKERS[name](rng.fork(name + i)));
    yield { label: 'prop ' + name };
  }
}

export function getProp(name, seed = 0) {
  const set = PROPS[name];
  if (!set) return null;
  return set[Math.abs(seed | 0) % set.length];
}
