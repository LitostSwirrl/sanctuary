// Monsters and pack spawning.
//
// A pack is one definition, one rank and a handful of bodies. Unique packs get
// a name, two modifiers, an aura and minions that share their modifiers, which
// is what makes a unique pack feel different rather than just tougher.

import { Entity } from './entity.js';
import { MONSTERS, UNIQUE_MODS, ENCHANT_COLOUR, statsFor } from './monsterdefs.js';

const UNIQUE_NAMES = [
  'Bloodgrin', 'Ashclaw', 'Rotfang', 'Gravewalker', 'Blackscar', 'Ironhide',
  'Duskbane', 'Vilebrand', 'Hollowmaw', 'Cinderthrall', 'Palegrasp', 'Thornhusk',
];

export class Monster extends Entity {
  constructor(defId, mlvl, opts = {}) {
    const def = MONSTERS[defId];
    const s = statsFor(def, mlvl);
    super({
      x: opts.x || 0, y: opts.y || 0,
      radius: def.radius, speed: def.speed, sheet: opts.sheet, hp: s.hp,
      name: def.name,
    });
    this.def = def;
    this.defId = defId;
    this.mlvl = mlvl;
    this.rank = opts.rank || 'normal';   // normal | champion | unique | minion | boss

    this.dmgMin = s.dmgMin;
    this.dmgMax = s.dmgMax;
    this.attackRating = s.ar;
    this.defense = s.defense;
    this.xpValue = s.xp;
    this.resists = { fire: 0, cold: 0, light: 0, pois: 0, phys: 0, ...def.resists };
    this.damageReduction = 0;
    this.attackCooldown = def.attackCooldown;
    this.attackRange = def.attackRange;
    this.wake = def.wake;
    this.freezeImmune = !!def.freezeImmune;

    this.state = 'idle';
    this.stunned = 0;
    this.battlecry = null;      // { def, dmg, t } while Battle Cry holds
    this.cool = Math.random() * 0.6;
    this.blockedFor = 0;
    this.path = null;
    this.pathIndex = 0;
    this.repathCool = 0;
    this.leader = null;
    this.mods = [];
    // A definition can carry its enchant natively -- the scarab's jolt, the
    // spider's bite -- and applyRank paints the matching glow either way.
    this.enchant = def.enchant || null;
    this.special = def.special || null;
    this.specialCool = 2 + Math.random() * 3;
    this.phase = 0;

    if (def.boss) this.rank = 'boss';
    this.applyRank(opts.rng, opts.forcedMods);
    this.maxHp = Math.round(this.maxHp);
    this.hp = this.maxHp;
    this.setAnim('idle');
  }

  applyRank(rng, forced) {
    const pick = (n) => {
      const pool = UNIQUE_MODS.slice();
      const out = [];
      for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(rng ? rng.i(pool.length) : 0, 1)[0]);
      return out;
    };

    if (this.rank === 'champion') {
      this.maxHp *= 2.4;
      this.dmgMin *= 1.35; this.dmgMax *= 1.35;
      this.defense *= 1.5;
      this.xpValue *= 3;
      this.title = 'Champion';
      this.uniqueAura = '#7ab0ff';
    } else if (this.rank === 'unique' || this.rank === 'boss') {
      const isBoss = this.rank === 'boss';
      this.maxHp *= isBoss ? 1 : 4.5;
      this.dmgMin *= isBoss ? 1 : 1.5;
      this.dmgMax *= isBoss ? 1 : 1.5;
      this.xpValue *= isBoss ? 1 : 6;
      this.title = isBoss ? '' : 'Unique';
      this.uniqueAura = this.def.aura || '#ffb020';
      this.displayName = isBoss ? this.def.name : (rng ? rng.pick(UNIQUE_NAMES) : UNIQUE_NAMES[0]);
      const names = forced || this.def.mods || null;
      const chosen = names ? UNIQUE_MODS.filter((m) => names.includes(m.name)) : pick(2);
      for (const m of chosen) { m.apply(this); this.mods.push(m.name); }
    } else if (this.rank === 'minion') {
      this.maxHp *= 1.6;
      this.xpValue *= 1.5;
      const chosen = forced ? UNIQUE_MODS.filter((m) => forced.includes(m.name)) : [];
      for (const m of chosen) { m.apply(this); this.mods.push(m.name); }
      this.uniqueAura = null;
    }
    if (this.enchant) this.auraGlow = ENCHANT_COLOUR[this.enchant];
  }

  get label() {
    if (this.displayName) return this.displayName;
    if (this.rank === 'champion') return `${this.def.name} Champion`;
    return this.def.name;
  }

  rollDamage(rng) {
    const mul = this.battlecry ? this.battlecry.dmg : 1;
    return (this.dmgMin + rng.f() * (this.dmgMax - this.dmgMin)) * mul;
  }
}

// A pack: one leader rank plus bodies, all of the same definition.
export function spawnPack(level, defId, rng, opts = {}) {
  const def = MONSTERS[defId];
  if (!def) return [];
  const mlvl = opts.mlvl || level.areaLevel || 1;
  const at = opts.at || { x: level.w / 2, y: level.h / 2 };
  const count = opts.count || 4;
  const sheets = opts.sheets || {};

  // One pack in six is led by a champion, one in ten by a unique with minions.
  let rank = 'normal';
  if (!opts.rank) {
    const r = rng.f();
    if (r < 0.10) rank = 'unique';
    else if (r < 0.26) rank = 'champion';
  } else rank = opts.rank;

  const out = [];
  const place = (i) => {
    const a = rng.f() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.7 + rng.f() * (1.1 + count * 0.22);
    const p = level.nearestOpen(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d, 6);
    return p;
  };

  let leader = null;
  for (let i = 0; i < count; i++) {
    const isLeader = i === 0 && (rank === 'unique' || rank === 'boss');
    const myRank = isLeader ? rank
      : rank === 'unique' ? 'minion'
        : rank === 'champion' ? 'champion' : 'normal';
    const p = place(i);
    const m = new Monster(defId, mlvl, {
      x: p.x, y: p.y, rank: myRank, rng,
      sheet: sheets[def.figure],
      forcedMods: isLeader ? null : (leader ? leader.mods : null),
    });
    if (isLeader) leader = m;
    else m.leader = leader;
    level.addEntity(m);
    out.push(m);
  }
  return out;
}

// Populate a whole level from its area definition.
export function populate(level, def, rng, sheets) {
  if (!def.monsters || !def.monsters.length) return [];
  const all = [];
  for (const sp of level.spawnPoints) {
    const choice = rng.weighted(def.monsters.map((m) => [m, m.weight || 1]));
    const count = rng.int(choice.packMin || 3, choice.packMax || 5);
    all.push(...spawnPack(level, choice.id, rng, { at: sp, count, sheets, mlvl: def.areaLevel }));
  }
  return all;
}

// The area's quest boss, placed in the reserved room or the furthest point.
export function spawnBoss(level, bossId, rng, sheets) {
  const at = level.bossPoint || level.spawnPoints[level.spawnPoints.length - 1] || level.start;
  const p = level.nearestOpen(at.x, at.y, 8);
  const def = MONSTERS[bossId];
  const boss = new Monster(bossId, (level.areaLevel || 1) + 2, {
    x: p.x, y: p.y, rank: 'boss', rng, sheet: sheets[def.figure],
  });
  level.addEntity(boss);
  level.boss = boss;

  // A boss keeps a guard of its own kind where that makes sense.
  const guardOf = {
    corpsefire: 'fallen', bloodraven: 'skeleton', andariel: 'ghoul',
    radament: 'mummy', duriel: 'clawviper',
    // The named unique is one third of the Travincal trio; his guard pack of
    // council robes is the other two and then some.
    council: 'councilmember', mephisto: 'councilmember',
    izual: 'balrog', hephasto: 'urdar', diablo: 'doomknight',
    shenk: 'enslaved',
    // The Ancient stands alone by design, and so does Baal: the throne room has
    // its own garrison spread through it and no summoned waves at the end.
  }[bossId];
  if (guardOf) {
    // The Travincal trio is a named unique and an elite guard, not a rabble,
    // so the council alone spawns its escort as champions.
    spawnPack(level, guardOf, rng, {
      at: p, count: 4, sheets, mlvl: (level.areaLevel || 1) + 1,
      rank: bossId === 'council' ? 'champion' : 'normal',
    });
  }
  return boss;
}
