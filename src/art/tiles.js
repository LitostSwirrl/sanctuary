// Ground tiles, wall blocks and scenery props, all generated.
//
// Ground is the classic 64x32 isometric diamond whose row widths interlock
// exactly, so neighbouring tiles leave no seam and no gap. Several variants per
// terrain are baked and chosen by a hash of the tile coordinate, which breaks
// up repetition without storing a map of which variant went where.

import { Buf, px, rectF, ellipse, ellipseF, capsule, polyF, outline, lineP, bufToCanvas } from './pixel.js';
import { ramp, packHex, packRGB, shift, COLORS } from './palette.js';
import { Rng, fbm2 } from '../core/rng.js';

export const TW = 64, TH = 32;
const VARIANTS = 8;
const OUTLINE = packHex('#0c0a10');

// Row spans of the isometric diamond. Rows 15 and 16 are both full width.
function rowSpan(y) {
  const k = y < 16 ? y : 31 - y;
  const w = 4 * (k + 1);
  return { x0: 32 - w / 2, w };
}

// `rough` is how hard the noise modulates lightness and `grain` how fine the
// features are. Built floors want low rough and high grain or the same blob
// shows up on every slab and the repeat becomes obvious.
export const TERRAIN = {
  grass:  { base: '#46552f', alt: '#3a4a28', speck: '#5f7038', rough: 0.34, grain: 0.20 },
  dirt:   { base: '#5b4a33', alt: '#4c3d2a', speck: '#6d5a3f', rough: 0.34, grain: 0.22 },
  cobble: { base: '#57544c', alt: '#494640', speck: '#68645a', rough: 0.14, grain: 0.30 },
  cave:   { base: '#3b372f', alt: '#302d27', speck: '#4a4539', rough: 0.42, grain: 0.20 },
  crypt:  { base: '#464650', alt: '#3a3a44', speck: '#565663', rough: 0.13, grain: 0.32 },
  blood:  { base: '#4a2622', alt: '#3a1c1a', speck: '#5e302a', rough: 0.38, grain: 0.22 },
  snow:   { base: '#7d8290', alt: '#6b7080', speck: '#949aa8', rough: 0.20, grain: 0.26 },
};

// ------------------------------------------------------------------- ground

function bakeGroundVariant(terrain, rng) {
  const t = TERRAIN[terrain];
  const buf = new Buf(TW, TH);
  const noise = fbm2(rng, 3);
  const base = packHex(t.base);
  const alt = packHex(t.alt);
  const nx = rng.range(0, 100), ny = rng.range(0, 100);

  for (let y = 0; y < TH; y++) {
    const { x0, w } = rowSpan(y);
    for (let x = x0; x < x0 + w; x++) {
      const n = noise(nx + x * t.grain, ny + y * t.grain * 2);
      const v = (n - 0.5) * t.rough;
      const c = n > 0.52 ? base : alt;
      const r = Math.max(0, Math.min(255, (c & 255) * (1 + v)));
      const g = Math.max(0, Math.min(255, ((c >>> 8) & 255) * (1 + v)));
      const b = Math.max(0, Math.min(255, ((c >>> 16) & 255) * (1 + v)));
      px(buf, x, y, packRGB(r, g, b, 255));
    }
  }

  // Terrain-specific detail passes.
  if (terrain === 'cobble' || terrain === 'crypt') {
    // Joint lines along all four diamond edges, so slabs read as slabs.
    const jc = shift(t.alt, -0.09);
    lineP(buf, 0, 16, 32, 0, jc);
    lineP(buf, 32, 0, 64, 16, jc);
    lineP(buf, 0, 16, 32, 31, jc);
    lineP(buf, 32, 31, 64, 16, jc);
  }
  if (terrain === 'grass') {
    const tuft = packHex(t.speck);
    for (let i = 0; i < 14; i++) {
      const y = rng.int(2, TH - 3);
      const { x0, w } = rowSpan(y);
      if (w < 8) continue;
      const x = rng.int(x0 + 2, x0 + w - 3);
      px(buf, x, y, tuft);
      px(buf, x, y - 1, tuft);
      if (rng.chance(0.4)) px(buf, x + 1, y, tuft);
    }
  }
  if (terrain === 'cave' || terrain === 'dirt' || terrain === 'snow') {
    const sp = packHex(t.speck);
    for (let i = 0; i < 10; i++) {
      const y = rng.int(2, TH - 3);
      const { x0, w } = rowSpan(y);
      if (w < 8) continue;
      const x = rng.int(x0 + 2, x0 + w - 3);
      ellipseF(buf, x, y, rng.range(0.8, 2.0), rng.range(0.6, 1.2), sp);
    }
  }
  if (terrain === 'blood') {
    const sp = packRGB(90, 20, 18, 255);
    for (let i = 0; i < 6; i++) {
      const y = rng.int(4, TH - 5);
      const { x0, w } = rowSpan(y);
      if (w < 12) continue;
      const x = rng.int(x0 + 3, x0 + w - 4);
      ellipseF(buf, x, y, rng.range(1.5, 4), rng.range(1, 2), sp);
    }
  }

  return bufToCanvas(buf);
}

// ------------------------------------------------------------------- walls

const WALL_STYLE = {
  cave:   { face: '#4b4438', top: '#5a5244', h: 46 },
  crypt:  { face: '#52505a', top: '#63606c', h: 46 },
  cobble: { face: '#5a5348', top: '#6b6355', h: 42 },
  grass:  { face: '#3f4a2c', top: '#4e5c36', h: 38 },
  dirt:   { face: '#514231', top: '#63513c', h: 40 },
  blood:  { face: '#4a2622', top: '#5a302a', h: 42 },
  snow:   { face: '#6b7080', top: '#8b90a0', h: 40 },
};

function bakeWall(terrain, rng) {
  const s = WALL_STYLE[terrain] || WALL_STYLE.cave;
  const H = s.h;
  const buf = new Buf(TW, TH + H);
  const noise = fbm2(rng, 3);
  const nx = rng.range(0, 100), ny = rng.range(0, 100);

  const faceL = shift(s.face, -0.07);
  const faceR = shift(s.face, 0.03);
  const topC = packHex(s.top);
  const shade = (c, x, y, amt) => {
    const n = (noise(nx + x * 0.12, ny + y * 0.12) - 0.5) * amt;
    return packRGB(
      Math.max(0, Math.min(255, (c & 255) * (1 + n))),
      Math.max(0, Math.min(255, ((c >>> 8) & 255) * (1 + n))),
      Math.max(0, Math.min(255, ((c >>> 16) & 255) * (1 + n))),
      255);
  };

  // Left face, then right face, then the top so it overlays cleanly.
  polyF(buf, [0, 16, 32, 31, 32, 31 + H, 0, 16 + H], 0, (x, y) => shade(faceL, x, y, 0.34));
  polyF(buf, [32, 31, 64, 16, 64, 16 + H, 32, 31 + H], 0, (x, y) => shade(faceR, x, y, 0.34));

  for (let y = 0; y < TH; y++) {
    const { x0, w } = rowSpan(y);
    for (let x = x0; x < x0 + w; x++) px(buf, x, y, shade(topC, x, y, 0.24));
  }

  // Masonry courses on built walls, cracks on natural rock.
  if (terrain === 'crypt' || terrain === 'cobble') {
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

  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 32, oy: 16 + H };
}

// -------------------------------------------------------------------- props

// Every prop returns the canvas plus the offset from its top-left to the tile
// centre it stands on, so drawing is always at (screenX - ox, screenY - oy).
function propTree(rng) {
  const buf = new Buf(88, 116);
  const bark = ramp(COLORS.wood);
  const leaf = ramp(rng.chance(0.5) ? '#354a26' : '#2c3f21');
  const lean = rng.range(-4, 4);
  capsule(buf, 44, 112, 7, 44 + lean, 58, 4.5, bark);
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    capsule(buf, 44 + lean * 0.7, 68, 3.2, 44 + lean + Math.cos(a) * 16, 56 + Math.sin(a) * 8, 1.2, bark);
  }
  for (let i = 0; i < 10; i++) {
    const cx = 44 + lean + rng.range(-22, 22), cy = 38 + rng.range(-20, 16);
    ellipse(buf, cx, cy, rng.range(12, 21), rng.range(9, 15), leaf);
  }
  outline(buf, OUTLINE);
  return { canvas: bufToCanvas(buf), ox: 44, oy: 112 };
}

function propRock(rng) {
  const buf = new Buf(44, 40);
  const rm = ramp(COLORS.stone);
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

const PROP_BAKERS = {
  tree: propTree, rock: propRock, column: propColumn, brazier: propBrazier,
  torch: propTorch, barrel: propBarrel, chest: propChest, gravestone: propGrave,
  bones: propBones, waypoint: propWaypoint, portal: propPortal, stairs: propStairs,
};

// ------------------------------------------------------------------ exports

export const GROUND = {};
export const WALLS = {};
export const PROPS = {};

export function getGround(terrain, wx, wy) {
  const set = GROUND[terrain] || GROUND.dirt;
  // Cheap spatial hash so the variant is stable per tile without storing it.
  let h = (wx * 374761393 + wy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return set[(h >>> 0) % set.length];
}

export function getWall(terrain, wx, wy) {
  const set = WALLS[terrain] || WALLS.cave;
  let h = (wx * 2654435761 + wy * 40503) | 0;
  h = (h ^ (h >>> 15)) * 2246822519 | 0;
  return set[(h >>> 0) % set.length];
}

// Bake everything, yielding often enough that the loading screen keeps drawing.
export function* bakeTiles() {
  const rng = new Rng(20260728);
  const terrains = Object.keys(TERRAIN);
  for (const t of terrains) {
    GROUND[t] = [];
    for (let i = 0; i < VARIANTS; i++) GROUND[t].push(bakeGroundVariant(t, rng.fork(t + i)));
    yield { label: 'ground ' + t };
  }
  for (const t of terrains) {
    WALLS[t] = [];
    for (let i = 0; i < 3; i++) WALLS[t].push(bakeWall(t, rng.fork('wall' + t + i)));
    yield { label: 'walls ' + t };
  }
  for (const name of Object.keys(PROP_BAKERS)) {
    // A few variants of the scattered natural props, one of everything else.
    const n = ['tree', 'rock', 'gravestone', 'bones'].includes(name) ? 4 : 1;
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
