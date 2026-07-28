// Item icons, drawn by code from the item's base kind.
//
// Generated lazily and cached by base and rarity rather than pre-baked: there
// are a couple of hundred possible combinations and a run only ever sees a
// fraction of them, so paying for one on first sight is cheaper than baking all
// of them at load.

import { Buf, capsule, ellipse, ellipseF, rectF, polyF, lineP, outline, bufToCanvas } from './pixel.js';
import { ramp, packHex, packRGB, COLORS } from './palette.js';
import { BASES, POTIONS } from '../items/bases.js';

export const ICON_CELL = 26;
const OUTLINE = packHex('#0c0a10');

const TIER_METAL = ['#8f7a52', '#8f97a8', '#b8c0d0'];
const TIER_CLOTH = ['#6b4a2f', '#5a5a62', '#6a6f80'];

const cache = new Map();

const GLOW = {
  magic: 'rgba(96,110,255,0.40)',
  rare: 'rgba(255,232,80,0.34)',
  unique: 'rgba(200,150,50,0.42)',
};

function drawBlade(buf, w, h, metal, hilt, long) {
  const cx = w / 2;
  const tip = h * (long ? 0.08 : 0.14);
  const guard = h * (long ? 0.68 : 0.62);
  polyF(buf, [cx, tip, cx + w * 0.16, guard, cx - w * 0.16, guard], metal.base);
  polyF(buf, [cx, tip, cx + w * 0.16, guard, cx, guard], metal.light);
  capsule(buf, cx - w * 0.26, guard, 1.6, cx + w * 0.26, guard, 1.6, hilt);
  capsule(buf, cx, guard, 2.0, cx, h * 0.94, 2.0, hilt);
  ellipse(buf, cx, h * 0.95, 2.6, 2.2, hilt);
}

function drawWand(buf, w, h, wood, gem) {
  const cx = w / 2;
  capsule(buf, cx, h * 0.92, 2.4, cx, h * 0.26, 1.8, wood);
  ellipse(buf, cx, h * 0.17, w * 0.24, w * 0.24, gem);
}

function drawStaff(buf, w, h, wood, gem) {
  const cx = w / 2;
  capsule(buf, cx, h * 0.97, 2.8, cx, h * 0.16, 2.2, wood);
  ellipse(buf, cx, h * 0.11, w * 0.17, w * 0.17, gem);
  capsule(buf, cx - w * 0.12, h * 0.2, 1.2, cx + w * 0.12, h * 0.2, 1.2, wood);
}

// A haft up the middle with a crescent head hung off one side, mirrored for a
// double-headed axe.
function drawAxe(buf, w, h, metal, wood, double) {
  const cx = w / 2;
  capsule(buf, cx, h * 0.96, 2.2, cx, h * 0.1, 1.9, wood);
  const top = h * 0.14, bot = h * 0.46;
  polyF(buf, [cx, top, cx + w * 0.42, h * 0.2, cx + w * 0.36, h * 0.42, cx, bot], metal.base);
  polyF(buf, [cx, top, cx + w * 0.42, h * 0.2, cx + w * 0.2, h * 0.24], metal.light);
  if (double) {
    polyF(buf, [cx, top, cx - w * 0.42, h * 0.2, cx - w * 0.36, h * 0.42, cx, bot], metal.base);
    polyF(buf, [cx, top, cx - w * 0.42, h * 0.2, cx - w * 0.2, h * 0.24], metal.light);
  }
  capsule(buf, cx - w * 0.1, h * 0.86, 1.6, cx + w * 0.1, h * 0.86, 1.6, metal.dark);
}

// A weighted head on a short haft. Flanges read as a mace rather than a club.
function drawMace(buf, w, h, metal, wood, flanged) {
  const cx = w / 2;
  capsule(buf, cx, h * 0.96, 2.4, cx, h * 0.34, 2.0, wood);
  ellipse(buf, cx, h * 0.22, w * 0.24, h * 0.16, metal);
  if (flanged) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      capsule(buf, cx, h * 0.22, 1.8,
        cx + Math.cos(a) * w * 0.34, h * 0.22 + Math.sin(a) * h * 0.13, 0.9, metal.light);
    }
  }
  ellipse(buf, cx, h * 0.1, w * 0.09, h * 0.05, metal.light);
  capsule(buf, cx - w * 0.1, h * 0.88, 1.6, cx + w * 0.1, h * 0.88, 1.6, metal.dark);
}

function drawOrb(buf, w, h, gem, metal) {
  const cx = w / 2, cy = h / 2;
  ellipse(buf, cx, cy, w * 0.34, h * 0.34, gem);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    capsule(buf, cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * h * 0.3,
      1.6, cx + Math.cos(a) * w * 0.42, cy + Math.sin(a) * h * 0.42, 1.0, metal);
  }
}

function drawBody(buf, w, h, cloth, metal) {
  const cx = w / 2;
  polyF(buf, [w * 0.18, h * 0.16, w * 0.82, h * 0.16, w * 0.9, h * 0.42, w * 0.78, h * 0.92, w * 0.22, h * 0.92, w * 0.1, h * 0.42], cloth.base);
  polyF(buf, [w * 0.18, h * 0.16, cx, h * 0.16, cx, h * 0.92, w * 0.22, h * 0.92, w * 0.1, h * 0.42], cloth.light);
  ellipse(buf, cx, h * 0.2, w * 0.16, h * 0.07, metal);
  for (let i = 1; i < 4; i++) lineP(buf, w * 0.16, h * (0.28 + i * 0.16), w * 0.84, h * (0.28 + i * 0.16), metal.dark);
}

function drawHelm(buf, w, h, metal, cloth) {
  const cx = w / 2;
  ellipse(buf, cx, h * 0.46, w * 0.33, h * 0.31, metal);
  rectF(buf, w * 0.17, h * 0.44, w * 0.66, h * 0.16, metal.dark);
  capsule(buf, w * 0.2, h * 0.6, 2.2, w * 0.8, h * 0.6, 2.2, cloth);
  lineP(buf, cx, h * 0.16, cx, h * 0.44, metal.light);
}

function drawShield(buf, w, h, metal, boss) {
  const cx = w / 2;
  polyF(buf, [w * 0.14, h * 0.14, w * 0.86, h * 0.14, w * 0.86, h * 0.55, cx, h * 0.93, w * 0.14, h * 0.55], metal.base);
  polyF(buf, [w * 0.14, h * 0.14, cx, h * 0.14, cx, h * 0.93, w * 0.14, h * 0.55], metal.light);
  ellipse(buf, cx, h * 0.42, w * 0.14, h * 0.12, boss);
}

function drawGlove(buf, w, h, cloth, metal) {
  const cx = w / 2;
  capsule(buf, cx, h * 0.85, w * 0.22, cx, h * 0.42, w * 0.24, cloth);
  for (let i = 0; i < 4; i++) {
    const x = w * (0.32 + i * 0.12);
    capsule(buf, x, h * 0.42, 1.8, x, h * 0.18, 1.5, cloth);
  }
  capsule(buf, cx - w * 0.26, h * 0.5, 2.0, cx - w * 0.3, h * 0.3, 1.6, cloth);
  capsule(buf, w * 0.24, h * 0.82, 1.8, w * 0.76, h * 0.82, 1.8, metal);
}

function drawBoot(buf, w, h, cloth, metal) {
  polyF(buf, [w * 0.3, h * 0.14, w * 0.68, h * 0.14, w * 0.72, h * 0.6, w * 0.9, h * 0.72, w * 0.9, h * 0.88, w * 0.22, h * 0.88, w * 0.26, h * 0.5], cloth.base);
  polyF(buf, [w * 0.3, h * 0.14, w * 0.49, h * 0.14, w * 0.49, h * 0.88, w * 0.22, h * 0.88, w * 0.26, h * 0.5], cloth.light);
  capsule(buf, w * 0.24, h * 0.86, 1.6, w * 0.9, h * 0.86, 1.6, metal);
}

function drawBelt(buf, w, h, cloth, metal) {
  capsule(buf, w * 0.06, h * 0.5, h * 0.26, w * 0.94, h * 0.5, h * 0.26, cloth);
  rectF(buf, w * 0.42, h * 0.2, w * 0.16, h * 0.6, metal.base);
  rectF(buf, w * 0.46, h * 0.34, w * 0.08, h * 0.32, packRGB(20, 18, 22, 255));
}

function drawRing(buf, w, h, metal, gem) {
  const cx = w / 2, cy = h * 0.56;
  ellipse(buf, cx, cy, w * 0.3, h * 0.3, metal);
  ellipseF(buf, cx, cy, w * 0.17, h * 0.17, 0);
  ellipse(buf, cx, h * 0.22, w * 0.15, h * 0.15, gem);
}

function drawAmulet(buf, w, h, metal, gem) {
  const cx = w / 2;
  for (let i = -1; i <= 1; i += 2) {
    capsule(buf, cx, h * 0.14, 1.2, cx + i * w * 0.26, h * 0.5, 1.2, metal);
  }
  ellipse(buf, cx, h * 0.68, w * 0.22, h * 0.22, gem);
  ellipse(buf, cx, h * 0.68, w * 0.1, h * 0.1, metal);
}

function drawPotion(buf, w, h, colour) {
  const cx = w / 2;
  const glassR = ramp('#9aa8b8');
  capsule(buf, cx, h * 0.32, w * 0.11, cx, h * 0.16, w * 0.1, glassR);
  ellipse(buf, cx, h * 0.62, w * 0.3, h * 0.28, glassR);
  ellipseF(buf, cx, h * 0.64, w * 0.22, h * 0.2, packHex(colour));
  ellipseF(buf, cx - w * 0.09, h * 0.56, w * 0.06, h * 0.05, packRGB(255, 255, 255, 90));
  capsule(buf, cx, h * 0.14, w * 0.13, cx, h * 0.1, w * 0.13, ramp(COLORS.wood));
}

function drawGold(buf, w, h) {
  const g = ramp(COLORS.gold);
  for (let i = 0; i < 7; i++) {
    const x = w * (0.28 + (i % 3) * 0.22) + (i > 3 ? w * 0.06 : 0);
    const y = h * (0.72 - Math.floor(i / 3) * 0.18);
    ellipse(buf, x, y, w * 0.15, h * 0.09, g);
  }
}

function build(item) {
  const w = Math.max(ICON_CELL, item.w * ICON_CELL);
  const h = Math.max(ICON_CELL, item.h * ICON_CELL);
  const buf = new Buf(w, h);
  const tier = item.base ? Math.min(2, item.base.tier - 1) : 0;
  const metal = ramp(TIER_METAL[tier]);
  const cloth = ramp(TIER_CLOTH[tier]);
  const wood = ramp(COLORS.wood);
  const gemHue = item.rarity === 'unique' ? COLORS.gold : item.rarity === 'rare' ? '#d8c840' : item.caster ? COLORS.arcane : COLORS.ice;
  const gem = ramp(gemHue);

  switch (item.kind) {
    case 'blade': drawBlade(buf, w, h, metal, ramp(COLORS.leather), false); break;
    case 'sword': drawBlade(buf, w, h, metal, ramp(COLORS.leather), true); break;
    case 'wand': drawWand(buf, w, h, wood, gem); break;
    case 'staff': drawStaff(buf, w, h, wood, gem); break;
    case 'orb': drawOrb(buf, w, h, gem, metal); break;
    case 'axe': drawAxe(buf, w, h, metal, wood, !!item.base && item.base.twoHand); break;
    case 'mace': drawMace(buf, w, h, metal, wood, !!item.base && item.base.flanged); break;
    case 'body': drawBody(buf, w, h, cloth, metal); break;
    case 'helm': drawHelm(buf, w, h, metal, cloth); break;
    case 'shield': drawShield(buf, w, h, metal, gem); break;
    case 'glove': drawGlove(buf, w, h, cloth, metal); break;
    case 'boot': drawBoot(buf, w, h, cloth, metal); break;
    case 'belt': drawBelt(buf, w, h, cloth, metal); break;
    case 'ring': drawRing(buf, w, h, metal, gem); break;
    case 'amulet': drawAmulet(buf, w, h, metal, gem); break;
    case 'potion': drawPotion(buf, w, h, item.colour || '#c02a2a'); break;
    case 'gold': drawGold(buf, w, h); break;
    default: ellipse(buf, w / 2, h / 2, w * 0.3, h * 0.3, metal); break;
  }
  outline(buf, OUTLINE);

  const sprite = bufToCanvas(buf);
  const glow = GLOW[item.rarity];
  if (!glow) return sprite;

  // Rarity halo behind the sprite.
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.55);
  g.addColorStop(0, glow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.imageSmoothingEnabled = false;
  c.drawImage(sprite, 0, 0);
  return cv;
}

export function iconFor(item) {
  const key = item.gold ? 'gold' : item.potion ? `potion_${item.potionId}`
    : `${item.baseId}_${item.rarity}`;
  let ic = cache.get(key);
  if (!ic) { ic = build(item); cache.set(key, ic); }
  return ic;
}

// Build every icon up front.
//
// Generating on first sight seemed cheap, but the first sight of several item
// types happens in the single frame where a Fire Ball wipes a pack and all of
// it drops at once — measured at up to 44ms, a visible hitch in the exact
// moment the game is meant to feel good. There are only a couple of hundred
// combinations, so they belong on the loading screen.
export const ICON_BAKE_STEPS = BASES.length + 1;

export function* bakeIcons() {
  const RARITIES = ['normal', 'magic', 'rare', 'unique'];
  for (const base of BASES) {
    for (const rarity of RARITIES) {
      iconFor({ baseId: base.id, rarity, kind: base.kind, w: base.w, h: base.h, base, caster: base.caster });
    }
    yield { label: 'icon ' + base.id };
  }
  for (const p of POTIONS) {
    iconFor({ potionId: p.id, potion: p.potion, rarity: 'potion', kind: 'potion', w: 1, h: 1, colour: p.colour });
  }
  iconFor({ gold: 1, rarity: 'gold', kind: 'gold', w: 1, h: 1 });
  yield { label: 'icon potions' };
}

export function iconCacheSize() { return cache.size; }
