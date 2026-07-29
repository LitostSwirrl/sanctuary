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
};

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
const mulC = (c, k) => packRGB(clampB((c & 255) * k), clampB(((c >>> 8) & 255) * k), clampB(((c >>> 16) & 255) * k), 255);

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
  if (terrain === 'dirt' || terrain === 'cave' || terrain === 'snow') {
    for (let i = 0; i < 70; i++) {
      const sp = rd.chance(0.5) ? packHex(t.speck) : shift(t.alt, -0.05);
      ellipseF(buf, rd.i(FIELD_W), rd.i(FIELD_H), rd.range(0.8, 2.2), rd.range(0.6, 1.3), sp);
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
  if (terrain === 'cobble' || terrain === 'crypt') {
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
  const shade = (c, x, y, amt) => {
    const n = (noise(nx + x * 0.12, ny + y * 0.12) - 0.5) * amt;
    return mulC(c, 1 + n);
  };

  polyF(buf, [0, 16, 32, 31, 32, 31 + H, 0, 16 + H], 0, (x, y) => shade(faceL, x, y, 0.34));
  polyF(buf, [32, 31, 64, 16, 64, 16 + H, 32, 31 + H], 0, (x, y) => shade(faceR, x, y, 0.34));

  // Masonry courses on built walls, cracks on natural rock.
  if (s.built && (terrain === 'crypt' || terrain === 'cobble')) {
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

const PROP_BAKERS = {
  tree: propTree, rock: propRock, column: propColumn, brazier: propBrazier,
  torch: propTorch, barrel: propBarrel, chest: propChest, gravestone: propGrave,
  bones: propBones, waypoint: propWaypoint, portal: propPortal, stairs: propStairs,
  tent: propTent, wagon: propWagon, anvil: propAnvil, campfire: propCampfire,
  crate: propCrate, palisade: propPalisade,
};

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
    // A few variants of the scattered natural props, one of everything else.
    const n = ['tree', 'rock', 'gravestone', 'bones', 'tent', 'crate', 'palisade'].includes(name) ? 4 : 1;
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
