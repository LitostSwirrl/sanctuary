// Item generation and presentation.
//
// One roll produces everything: base type, rarity, affixes and the derived
// `mods` object that the character sheet consumes. Nothing downstream inspects
// affixes directly.

import { BASES, BASE_BY_ID, POTIONS, POTION_BY_ID, tierForAreaLevel } from './bases.js';
import { PREFIXES, SUFFIXES, ELEMENT_MODS, eligible } from './affixes.js';
import { UNIQUES, UNIQUES_BY_BASE } from './uniques.js';

export const RARITY_COLOUR = {
  normal: '#d6cdb4',
  magic: '#7a86ff',
  rare: '#ffef62',
  unique: '#c8a03a',
  potion: '#d6cdb4',
  gold: '#ffd24a',
};

export const RARITY_ORDER = { normal: 0, magic: 1, rare: 2, unique: 3 };

// Rare names are assembled from two word lists, as in the original.
const RARE_FIRST = ['Bitter', 'Grim', 'Storm', 'Doom', 'Hail', 'Rune', 'Blood', 'Death', 'Corpse', 'Viper', 'Gale', 'Dread', 'Eagle', 'Ghoul', 'Skull', 'Havoc', 'Brimstone', 'Bone', 'Cold', 'Ember'];
const RARE_SECOND = ['bite', 'song', 'wound', 'grasp', 'call', 'shot', 'gaze', 'spell', 'brand', 'weaver', 'shard', 'braid', 'guard', 'watch', 'bane', 'shroud', 'edge', 'wrath', 'sorrow', 'hold'];

const MOD_LABEL = {
  ed: (v) => `+${v}% Enhanced Damage`,
  minDmg: (v) => `+${v} to Minimum Damage`,
  maxDmg: (v) => `+${v} to Maximum Damage`,
  ar: (v) => `+${v} to Attack Rating`,
  def: (v) => `+${v} Defence`,
  defPct: (v) => `+${v}% Enhanced Defence`,
  life: (v) => `+${v} to Life`,
  mana: (v) => `+${v} to Mana`,
  lifePct: (v) => `+${v}% to Life`,
  manaPct: (v) => `+${v}% to Mana`,
  str: (v) => `+${v} to Strength`,
  dex: (v) => `+${v} to Dexterity`,
  vit: (v) => `+${v} to Vitality`,
  ene: (v) => `+${v} to Energy`,
  resFire: (v) => `Fire Resist +${v}%`,
  resCold: (v) => `Cold Resist +${v}%`,
  resLight: (v) => `Lightning Resist +${v}%`,
  resPois: (v) => `Poison Resist +${v}%`,
  resAll: (v) => `All Resistances +${v}%`,
  fcr: (v) => `+${v}% Faster Cast Rate`,
  frw: (v) => `+${v}% Faster Run/Walk`,
  ias: (v) => `+${v}% Increased Attack Speed`,
  block: (v) => `+${v}% Increased Chance of Blocking`,
  skills: (v) => `+${v} to All Skills`,
  skillFire: (v) => `+${v} to Fire Skills`,
  skillCold: (v) => `+${v} to Cold Skills`,
  skillLight: (v) => `+${v} to Lightning Skills`,
  lifeSteal: (v) => `${v}% Life Stolen per Hit`,
  manaSteal: (v) => `${v}% Mana Stolen per Hit`,
  mf: (v) => `+${v}% Better Chance of Magic Items`,
  gf: (v) => `+${v}% Extra Gold from Monsters`,
  dr: (v) => `Damage Reduced by ${v}`,
};

const ELEM_LABEL = { fire: 'Fire', cold: 'Cold', light: 'Lightning', pois: 'Poison' };

// ------------------------------------------------------------------ rolling

function applyAffix(mods, affix, rng, list) {
  if (ELEMENT_MODS[affix.mod]) {
    const [kMin, kMax] = ELEMENT_MODS[affix.mod];
    const lo = rng.int(affix.min, affix.max);
    const hi = Math.max(lo + 1, rng.int(affix.spread[0], affix.spread[1]));
    mods[kMin] = (mods[kMin] || 0) + lo;
    mods[kMax] = (mods[kMax] || 0) + hi;
    list.push({ name: affix.name, elem: affix.mod, lo, hi });
    return;
  }
  const v = rng.int(affix.min, affix.max);
  mods[affix.mod] = (mods[affix.mod] || 0) + v;
  list.push({ name: affix.name, mod: affix.mod, value: v });
}

function pickAffixes(rng, slot, ilvl, count, mods, list, usedMods) {
  const pools = [eligible(PREFIXES, slot, ilvl), eligible(SUFFIXES, slot, ilvl)];
  let placed = 0, guard = 0;
  while (placed < count && guard++ < 60) {
    const pool = pools[placed % 2] && pools[placed % 2].length ? pools[placed % 2] : pools[(placed + 1) % 2];
    if (!pool || !pool.length) break;
    const a = pool[rng.i(pool.length)];
    // One affix per stat, so a rare cannot stack four copies of the same line.
    const key = a.mod;
    if (usedMods.has(key)) continue;
    usedMods.add(key);
    applyAffix(mods, a, rng, list);
    placed++;
  }
  return placed;
}

export function rollRarity(rng, opts = {}) {
  const mf = opts.mf || 0;
  // Magic find has diminishing returns on the rarest tier, as in the original.
  const uniqueMul = 1 + (mf * 2.5) / (mf + 250);
  const rareMul = 1 + (mf * 1.4) / (mf + 120);
  const lvlBias = 1 + Math.min(0.5, (opts.mlvl || 1) * 0.02);
  if (rng.f() < 0.006 * uniqueMul * lvlBias) return 'unique';
  if (rng.f() < 0.06 * rareMul * lvlBias) return 'rare';
  if (rng.f() < 0.27 * lvlBias) return 'magic';
  return 'normal';
}

let nextItemId = 1;

export function rollItem(rng, ilvl, opts = {}) {
  const tier = opts.tier || tierForAreaLevel(ilvl);
  const pool = opts.baseId ? [BASE_BY_ID[opts.baseId]].filter(Boolean)
    : BASES.filter((b) => b.tier <= tier && (opts.slot ? b.slot === opts.slot : true));
  if (!pool.length) return null;
  // Weight toward the best tier the area can offer, but keep the low ones in.
  const weights = pool.map((b) => [b, b.tier === tier ? 3 : b.tier === tier - 1 ? 2 : 1]);
  let base = rng.weighted(weights);

  let rarity = opts.rarity || rollRarity(rng, { mf: opts.mf, mlvl: ilvl });

  // A unique only exists where one is defined for the base and the item level
  // reaches it. Rather than throw the roll away — most bases have no unique, so
  // that silently costs most of the intended unique rate — re-pick the base a
  // few times looking for one that does. Only downgrade if none turns up.
  let unique = null;
  if (rarity === 'unique') {
    for (let attempt = 0; attempt < 8 && !unique; attempt++) {
      const cands = (UNIQUES_BY_BASE[base.id] || []).filter((u) => u.ilvl <= ilvl);
      if (cands.length) { unique = rng.pick(cands); break; }
      base = rng.weighted(weights);
    }
    if (!unique) rarity = 'rare';
  }

  const item = {
    uid: nextItemId++,
    baseId: base.id,
    base,
    slot: base.slot,
    kind: base.kind,
    w: base.w, h: base.h,
    ilvl,
    rarity,
    name: base.name,
    affixes: [],
    mods: {},
    req: { str: base.req.str, dex: base.req.dex },
    twoHand: !!base.twoHand,
    caster: !!base.caster,
    // Rares and uniques come out of the ground nameless, as in the original.
    // Everything else is plain enough to read at a glance.
    identified: opts.identified ?? !(rarity === 'rare' || rarity === 'unique'),
  };

  if (base.dmg) {
    item.minDmg = base.dmg[0];
    item.maxDmg = base.dmg[1];
  }
  if (base.def) item.defense = rng.int(base.def[0], base.def[1]);
  if (base.block) item.block = base.block;

  if (unique) {
    item.name = unique.name;
    item.flavour = unique.flavour;
    item.mods = { ...unique.mods };
    for (const k in unique.mods) {
      if (ELEMENT_MODS[k]) continue;
      item.affixes.push({ mod: k, value: unique.mods[k], fixed: true });
    }
    if (item.defense) item.defense = Math.floor(item.defense * 1.3);
  } else if (rarity === 'magic') {
    const used = new Set();
    pickAffixes(rng, base.slot, ilvl, rng.int(1, 2), item.mods, item.affixes, used);
    const first = item.affixes[0];
    if (first) {
      const isPrefix = PREFIXES.some((p) => p.name === first.name);
      item.name = isPrefix ? `${first.name} ${base.name}` : `${base.name} ${first.name}`;
    }
  } else if (rarity === 'rare') {
    const used = new Set();
    pickAffixes(rng, base.slot, ilvl, rng.int(3, 6), item.mods, item.affixes, used);
    item.name = `${rng.pick(RARE_FIRST)}${rng.pick(RARE_SECOND)}`;
  }

  // Enhanced damage is stored as a mod but shown on the damage line.
  if (item.minDmg !== undefined) {
    const ed = item.mods.ed || 0;
    item.minDmg = Math.max(1, Math.floor(item.minDmg * (1 + ed / 100)) + (item.mods.minDmg || 0));
    item.maxDmg = Math.max(item.minDmg + 1, Math.floor(item.maxDmg * (1 + ed / 100)) + (item.mods.maxDmg || 0));
  }
  if (item.defense !== undefined) {
    const dp = item.mods.defPct || 0;
    item.defense = Math.floor(item.defense * (1 + dp / 100)) + (item.mods.def || 0);
    item.mods.def = item.defense;   // the character sheet reads one number
    item.mods.defPct = 0;
  }
  if (item.block) item.mods.block = (item.mods.block || 0) + 0;

  item.price = priceOf(item);
  return item;
}

// A fixed-roll item for scripted grants: the same shape rollItem produces,
// with the mods handed in rather than rolled. Defence comes out at the base's
// top end; enhanced damage and defence percent fold in exactly as in rollItem.
export function forgeItem(baseId, name, mods, ilvl = 30, opts = {}) {
  const base = BASE_BY_ID[baseId];
  if (!base) return null;
  const item = {
    uid: nextItemId++,
    baseId: base.id, base, slot: base.slot, kind: base.kind,
    w: base.w, h: base.h, ilvl,
    rarity: opts.rarity || 'rare',
    flavour: opts.flavour,
    name,
    affixes: Object.keys(mods).map((k) => ({ mod: k, value: mods[k], fixed: true })),
    mods: { ...mods },
    req: { str: base.req.str, dex: base.req.dex },
    twoHand: !!base.twoHand,
    caster: !!base.caster,
    identified: true,
  };
  if (base.dmg) {
    const ed = item.mods.ed || 0;
    item.minDmg = Math.max(1, Math.floor(base.dmg[0] * (1 + ed / 100)) + (item.mods.minDmg || 0));
    item.maxDmg = Math.max(item.minDmg + 1, Math.floor(base.dmg[1] * (1 + ed / 100)) + (item.mods.maxDmg || 0));
  }
  if (base.def !== undefined) {
    item.defense = Math.floor(base.def[1] * (1 + (item.mods.defPct || 0) / 100)) + (item.mods.def || 0);
    item.mods.def = item.defense;
    item.mods.defPct = 0;
  }
  if (base.block) item.block = base.block;
  item.price = priceOf(item);
  return item;
}

export function makePotion(id) {
  const p = POTION_BY_ID[id];
  if (!p) return null;
  return {
    uid: nextItemId++, potionId: id, name: p.name, kind: 'potion', rarity: 'potion',
    slot: 'potion', w: 1, h: 1, potion: p.potion, amount: p.amount,
    colour: p.colour, price: p.price, mods: {}, affixes: [],
  };
}

export function makeGold(amount) {
  return { uid: nextItemId++, gold: amount, name: `${amount} Gold`, kind: 'gold', rarity: 'gold', w: 1, h: 1, mods: {}, affixes: [] };
}

export function priceOf(item) {
  if (item.gold) return item.gold;
  if (item.potion) return item.price || 30;
  const tier = item.base ? item.base.tier : 1;
  let v = 40 * tier + item.ilvl * 6;
  const mult = { normal: 1, magic: 3.2, rare: 7, unique: 16 }[item.rarity] || 1;
  v *= mult;
  v += item.affixes.length * 55;
  return Math.max(10, Math.floor(v));
}

// ------------------------------------------------------------- presentation

// Until it is identified an item is known only by its base type.
export function itemName(item) {
  if (item.identified === false && item.base) return item.base.name;
  return item.name;
}

export function identify(item) {
  if (!item || item.identified !== false) return false;
  item.identified = true;
  return true;
}

// Tooltip lines. `player` is optional; when given, unmet requirements go red.
export function describe(item, player) {
  const lines = [];
  const colour = RARITY_COLOUR[item.rarity] || RARITY_COLOUR.normal;
  lines.push({ text: itemName(item), colour, header: true });

  if (item.gold) return lines;
  if (item.potion) {
    lines.push({ text: `Restores ${item.amount} ${item.potion === 'life' ? 'Life' : 'Mana'}`, colour: '#8fd88f' });
    return lines;
  }

  if (item.rarity !== 'normal' && item.base && item.name !== item.base.name) {
    lines.push({ text: item.base.name, colour: '#a89f88' });
  }

  if (item.minDmg !== undefined) {
    lines.push({ text: `${item.twoHand ? 'Two-Hand ' : ''}Damage: ${item.minDmg} to ${item.maxDmg}`, colour: '#d6cdb4' });
  }
  if (item.defense !== undefined) {
    lines.push({ text: `Defence: ${item.defense}`, colour: '#d6cdb4' });
  }
  if (item.block) {
    lines.push({ text: `Chance to Block: ${item.block}%`, colour: '#d6cdb4' });
  }

  const req = item.req || { str: 0, dex: 0 };
  if (req.str > 0) {
    const unmet = player && player.effective.str < req.str;
    lines.push({ text: `Required Strength: ${req.str}`, colour: unmet ? '#ff5a4a' : '#a89f88' });
  }
  if (req.dex > 0) {
    const unmet = player && player.effective.dex < req.dex;
    lines.push({ text: `Required Dexterity: ${req.dex}`, colour: unmet ? '#ff5a4a' : '#a89f88' });
  }

  if (item.identified === false) {
    lines.push({ text: 'Unidentified', colour: '#ff5a4a' });
    lines.push({ text: 'Deckard Cain will name it for you.', colour: '#8a7f6a', italic: true });
    return lines;
  }

  // Elemental damage first, then flat modifiers.
  for (const el of ['fire', 'cold', 'light', 'pois']) {
    const [kMin, kMax] = ELEMENT_MODS[el];
    const lo = item.mods[kMin] || 0, hi = item.mods[kMax] || 0;
    if (lo || hi) lines.push({ text: `Adds ${lo}-${hi} ${ELEM_LABEL[el]} Damage`, colour: '#7a86ff' });
  }
  for (const key in item.mods) {
    if (ELEMENT_MODS[key.replace(/Min$|Max$/, '')]) continue;
    const v = item.mods[key];
    if (!v) continue;
    if (key === 'def' && item.defense !== undefined) continue;
    const fmt = MOD_LABEL[key];
    if (fmt) lines.push({ text: fmt(v), colour: '#7a86ff' });
  }

  if (item.flavour) lines.push({ text: item.flavour, colour: '#8a7f6a', italic: true });
  return lines;
}

export function canEquip(player, item) {
  if (item.identified === false) return false;
  const req = item.req || { str: 0, dex: 0 };
  return player.effective.str >= req.str && player.effective.dex >= req.dex;
}

export function slotFor(item, preferSecondRing) {
  if (item.slot === 'ring') return preferSecondRing ? 'ring2' : 'ring1';
  return item.slot;
}

export { BASES, POTIONS, UNIQUES, BASE_BY_ID };
