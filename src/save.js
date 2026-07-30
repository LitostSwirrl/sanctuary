// Save and load.
//
// Only the character and the world seed are stored. Areas are regenerated from
// the seed on load, which keeps a save to a few kilobytes and means the map is
// identical every time. Monsters come back, exactly as they do in the original;
// quest flags are what persist, so a slain boss stays slain.

import { BASE_BY_ID, POTION_BY_ID } from './items/bases.js';
import { EQUIP_SLOTS } from './game/player.js';
import { AREA_BY_ID } from './world/levels.js';

// The slot name is frozen at v1 and stays frozen. Renaming it with each version
// would orphan exactly the saves a version number exists to protect; the record
// inside carries the version, and `migrate` brings an older one forward.
const KEY = 'sanctuary.save.v1';
const VERSION = 2;

// Which act a record belongs to. The area id is the authority on that -- the
// area defs carry the act -- so a v1 record is not missing the information, only
// leaving it unsaid. That is why the migration below is a default and never a
// guess.
function actFor(areaId) {
  const a = AREA_BY_ID[areaId];
  return a ? a.act : 1;
}

function packItem(it) {
  if (!it) return null;
  if (it.gold) return { g: it.gold };
  if (it.potion) return { p: it.potionId };
  return {
    b: it.baseId, r: it.rarity, n: it.name, l: it.ilvl,
    m: it.mods, a: it.affixes,
    dn: it.minDmg, dx: it.maxDmg, d: it.defense, bl: it.block,
    rq: it.req, pr: it.price, f: it.flavour,
    // 0 means still unidentified. An older save without the field reads as
    // identified, which is the harmless direction to be wrong in.
    id: it.identified === false ? 0 : 1,
  };
}

function unpackItem(o, nextUid) {
  if (!o) return null;
  if (o.g !== undefined) {
    return { uid: nextUid(), gold: o.g, name: `${o.g} Gold`, kind: 'gold', rarity: 'gold', w: 1, h: 1, mods: {}, affixes: [] };
  }
  if (o.p !== undefined) {
    const p = POTION_BY_ID[o.p];
    if (!p) return null;
    return {
      uid: nextUid(), potionId: o.p, name: p.name, kind: 'potion', rarity: 'potion',
      slot: 'potion', w: 1, h: 1, potion: p.potion, amount: p.amount,
      colour: p.colour, price: p.price, mods: {}, affixes: [],
    };
  }
  const base = BASE_BY_ID[o.b];
  if (!base) return null;
  return {
    uid: nextUid(), baseId: o.b, base, slot: base.slot, kind: base.kind,
    w: base.w, h: base.h, twoHand: !!base.twoHand, caster: !!base.caster,
    ilvl: o.l, rarity: o.r, name: o.n,
    mods: o.m || {}, affixes: o.a || [],
    minDmg: o.dn, maxDmg: o.dx, defense: o.d, block: o.bl,
    req: o.rq || { str: 0, dex: 0 }, price: o.pr, flavour: o.f,
    identified: o.id !== 0,
  };
}

export function save(game) {
  const p = game.player;
  const data = {
    v: VERSION,
    seed: game.seed,
    area: game.areaId,
    act: actFor(game.areaId),
    at: { x: +p.x.toFixed(2), y: +p.y.toFixed(2) },
    cls: p.cls,
    level: p.level, xp: Math.round(p.xp),
    statPoints: p.statPoints, skillPoints: p.skillPoints,
    stats: { ...p.stats },
    skills: { ...p.skills },
    gold: p.gold,
    hp: Math.round(p.hp), mana: Math.round(p.mana),
    left: p.leftSkill, right: p.rightSkill,
    waypoints: { ...p.waypoints },
    quests: { ...p.quests },
    equipment: EQUIP_SLOTS.reduce((acc, s) => { acc[s] = packItem(p.equipment[s]); return acc; }, {}),
    inventory: p.inventory.map((sl) => ({ i: packItem(sl.item), x: sl.gx, y: sl.gy })),
    belt: p.belt.map(packItem),
    corpse: game.corpse ? { area: game.corpse.area, x: game.corpse.x, y: game.corpse.y, gold: game.corpse.gold } : null,
    stamp: game.now || 0,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// The one place a record written by an older build is brought forward. Every
// reader -- load, hasSave, continueGame -- comes through here, so there is no
// second seam to keep in step. A v1 record needs nothing but its act bit: it
// stored a character, a seed and a set of flags, all of which this build reads
// unchanged, and the cap raise reaches it for free because the cap was never
// written down. A version this build has never heard of is refused rather than
// guessed at.
function migrate(d) {
  if (d.v === VERSION) return d;
  if (d.v === 1) {
    d.act = actFor(d.area);
    d.v = VERSION;
    return d;
  }
  return null;
}

export function load() {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d || typeof d.v !== 'number') return null;
    return migrate(d);
  } catch {
    return null;
  }
}

export function hasSave() { return !!load(); }

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

// Push a loaded record back into a fresh Player.
export function applyTo(player, d, nextUid) {
  player.level = d.level;
  player.xp = d.xp;
  player.statPoints = d.statPoints;
  player.skillPoints = d.skillPoints;
  Object.assign(player.stats, d.stats);
  player.skills = { ...d.skills };
  player.gold = d.gold;
  player.leftSkill = d.left || 'attack';
  player.rightSkill = d.right || 'firebolt';
  player.waypoints = { ...d.waypoints };
  player.quests = { ...d.quests };

  for (const s of EQUIP_SLOTS) player.equipment[s] = unpackItem(d.equipment[s], nextUid);
  player.inventory = [];
  for (const sl of d.inventory || []) {
    const it = unpackItem(sl.i, nextUid);
    if (it) player.inventory.push({ item: it, gx: sl.x, gy: sl.y });
  }
  player.belt = (d.belt || []).map((o) => unpackItem(o, nextUid));
  while (player.belt.length < 4) player.belt.push(null);

  player.recalc();
  player.hp = Math.min(player.maxHp, d.hp || player.maxHp);
  player.mana = Math.min(player.maxMana, d.mana || player.maxMana);
  return player;
}
