// What a corpse leaves behind, and getting it into the bag.

import { rollItem, makePotion, makeGold, priceOf } from '../items/item.js';
import { tierForAreaLevel, GRID_W, GRID_H } from '../items/bases.js';
import { iconFor } from '../art/icons.js';
import { POTIONS } from '../items/bases.js';

// Chance that a kill drops anything at all, by rank.
const DROP_CHANCE = { normal: 0.30, champion: 0.75, minion: 0.42, unique: 1, boss: 1 };
const DROP_COUNT = { normal: 1, champion: 2, minion: 1, unique: 4, boss: 7 };
const GOLD_CHANCE = { normal: 0.42, champion: 0.8, minion: 0.5, unique: 1, boss: 1 };

export function groundItem(item, x, y) {
  return { item, x, y, icon: iconFor(item), taken: false, t: 0 };
}

export function dropLoot(level, monster, player, rng) {
  const out = [];
  const rank = monster.rank || 'normal';
  const mlvl = monster.mlvl || level.areaLevel || 1;
  const mf = player ? player.magicFind : 0;
  const gf = player ? player.goldFind : 0;

  const scatter = (item) => {
    const a = rng.f() * Math.PI * 2;
    const d = 0.25 + rng.f() * (rank === 'boss' ? 1.9 : 0.9);
    const p = level.nearestOpen(monster.x + Math.cos(a) * d, monster.y + Math.sin(a) * d, 4);
    const gi = groundItem(item, p.x, p.y);
    level.items.push(gi);
    out.push(gi);
  };

  if (rng.chance(GOLD_CHANCE[rank] || 0.4)) {
    const base = 6 + mlvl * 7;
    const amount = Math.round(rng.range(base * 0.6, base * 1.8) * (1 + gf / 100)
      * (rank === 'boss' ? 8 : rank === 'unique' ? 3 : 1));
    scatter(makeGold(amount));
  }

  if (!rng.chance(DROP_CHANCE[rank] || 0.3)) return out;

  const n = DROP_COUNT[rank] || 1;
  for (let i = 0; i < n; i++) {
    // Roughly a third of drops are potions, which is what keeps the belt full
    // without a shop trip after every pack.
    if (rng.chance(0.34)) {
      const tier = tierForAreaLevel(mlvl);
      const pool = POTIONS.filter((p) => p.tier <= tier);
      scatter(makePotion(rng.pick(pool).id));
      continue;
    }
    const item = rollItem(rng, mlvl, { mf, tier: tierForAreaLevel(mlvl) });
    if (item) scatter(item);
  }
  return out;
}

// Chests and destructible props use the same roll at a slightly better rate.
export function dropFromContainer(level, x, y, alvl, player, rng) {
  const out = [];
  const mf = player ? player.magicFind : 0;
  const scatter = (item) => {
    const a = rng.f() * Math.PI * 2;
    const p = level.nearestOpen(x + Math.cos(a) * (0.4 + rng.f()), y + Math.sin(a) * (0.4 + rng.f()), 4);
    const gi = groundItem(item, p.x, p.y);
    level.items.push(gi);
    out.push(gi);
  };
  scatter(makeGold(Math.round((10 + alvl * 9) * rng.range(0.8, 2.0))));
  const n = rng.int(1, 2);
  for (let i = 0; i < n; i++) {
    if (rng.chance(0.4)) scatter(makePotion(rng.pick(POTIONS.filter((p) => p.tier <= tierForAreaLevel(alvl))).id));
    else {
      const item = rollItem(rng, alvl + 1, { mf, tier: tierForAreaLevel(alvl) });
      if (item) scatter(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------- inventory

// True when a w-by-h block starting at (gx, gy) is free.
export function fits(player, gx, gy, w, h, ignore) {
  if (gx < 0 || gy < 0 || gx + w > GRID_W || gy + h > GRID_H) return false;
  for (const slot of player.inventory) {
    if (slot === ignore) continue;
    const it = slot.item;
    if (gx + w <= slot.gx || slot.gx + it.w <= gx) continue;
    if (gy + h <= slot.gy || slot.gy + it.h <= gy) continue;
    return false;
  }
  return true;
}

export function findSpot(player, w, h) {
  for (let gy = 0; gy <= GRID_H - h; gy++) {
    for (let gx = 0; gx <= GRID_W - w; gx++) {
      if (fits(player, gx, gy, w, h)) return { gx, gy };
    }
  }
  return null;
}

export function addToInventory(player, item) {
  const spot = findSpot(player, item.w, item.h);
  if (!spot) return false;
  player.inventory.push({ item, gx: spot.gx, gy: spot.gy });
  return true;
}

// Potions go to a free belt slot first, then to the bag.
export function addPotion(player, item) {
  for (let i = 0; i < player.belt.length; i++) {
    if (!player.belt[i]) { player.belt[i] = item; return 'belt'; }
  }
  return addToInventory(player, item) ? 'bag' : false;
}

// Returns 'gold' | 'belt' | 'bag' | false
export function pickUp(player, gi) {
  if (gi.taken) return false;
  const item = gi.item;
  if (item.gold) { player.gold += item.gold; gi.taken = true; return 'gold'; }
  if (item.potion) {
    const where = addPotion(player, item);
    if (where) { gi.taken = true; return where; }
    return false;
  }
  if (addToInventory(player, item)) { gi.taken = true; return 'bag'; }
  return false;
}

export function removeFromInventory(player, item) {
  const i = player.inventory.findIndex((s) => s.item === item);
  if (i >= 0) { player.inventory.splice(i, 1); return true; }
  return false;
}

export function sellValue(item) {
  return Math.max(1, Math.floor(priceOf(item) * 0.25));
}
