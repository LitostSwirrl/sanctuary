// The player character.
//
// Everything the equipment does flows through one aggregation step: walk every
// equipped item, sum its `mods` object, and derive the character sheet from the
// totals. Nothing else in the codebase reads an item's affixes directly, so
// adding an affix never means touching the character sheet.

import { Entity } from './entity.js';
import {
  CLASS_STATS, maxLifeFor, maxManaFor, attackRatingFrom, defenseFrom,
  xpForLevel, xpToNext, LEVEL_CAP, RES_CAP,
} from './combat.js';
import { findPath, smooth } from '../world/path.js';

export const EQUIP_SLOTS = [
  'head', 'body', 'weapon', 'shield', 'gloves', 'boots', 'belt', 'ring1', 'ring2', 'amulet',
];

const MOD_KEYS = [
  'ed', 'minDmg', 'maxDmg', 'ar', 'def', 'defPct',
  'life', 'mana', 'lifePct', 'manaPct',
  'str', 'dex', 'vit', 'ene',
  'resFire', 'resCold', 'resLight', 'resPois', 'resAll',
  'fcr', 'frw', 'ias', 'block',
  'skills', 'skillFire', 'skillCold', 'skillLight',
  'lifeSteal', 'manaSteal', 'mf', 'gf', 'dr',
  'fireMin', 'fireMax', 'coldMin', 'coldMax', 'lightMin', 'lightMax', 'poisMin', 'poisMax',
];

export function emptyMods() {
  const t = {};
  for (const k of MOD_KEYS) t[k] = 0;
  return t;
}

// Sum every equipped item's mods into one totals object.
export function aggregateMods(equipment) {
  const t = emptyMods();
  for (const slot of EQUIP_SLOTS) {
    const it = equipment[slot];
    if (!it || !it.mods) continue;
    for (const k in it.mods) {
      if (t[k] === undefined) continue;
      t[k] += it.mods[k];
    }
  }
  return t;
}

export class Player extends Entity {
  constructor(o = {}) {
    super({ ...o, radius: 0.32, speed: 4.6, hp: 40 });
    this.isPlayer = true;
    this.cls = o.cls || 'sorceress';
    const c = CLASS_STATS[this.cls];
    this.name = o.name || c.name;

    this.level = 1;
    this.xp = 0;
    this.statPoints = 0;
    this.skillPoints = 0;
    this.gold = 0;

    this.stats = { str: c.str, dex: c.dex, vit: c.vit, ene: c.ene };
    this.skills = {};              // skill id -> allocated points
    this.equipment = {};
    for (const s of EQUIP_SLOTS) this.equipment[s] = null;
    this.inventory = [];           // { item, gx, gy }
    this.belt = [null, null, null, null];

    this.totals = emptyMods();
    this.resists = { fire: 0, cold: 0, light: 0, pois: 0, phys: 0 };
    this.maxMana = 35;
    this.mana = 35;

    this.path = null;
    this.pathIndex = 0;
    this.target = null;            // entity being attacked
    this.moveGoal = null;
    this.busy = 0;                 // seconds locked in an attack or cast
    this.casting = null;
    this.action = null;            // (dt) => boolean; a skill that owns the body for a moment
    this.zOff = 0;                 // vertical draw offset in sprite pixels, while airborne
    this.leftSkill = 'attack';
    this.rightSkill = 'firebolt';
    this.hotkeys = {};

    this.quests = {};
    this.waypoints = { town: true };
    // The furthest act reached, which travel raises and nothing lowers. Walking
    // back to the encampment does not un-cross the desert.
    this.actReached = 1;
    // id -> { t, mag }, ticked in update. A buff may also carry, and the engine
    // will honour: `plusSkills` (levels added to every skill while it lasts),
    // `esplit` (the share of a blow paid from mana before life), `onStruckChill`
    // and `onStruckDamage` (what a melee blow on you gets back), `proc:
    // { every, fn }` (something it does on its own timer), `defPct` (defence
    // granted, which is the cold armours), and `stacks: { max, decay }` with
    // `ias`, which is Frenzy: swing speed per live stack.
    this.buffs = {};
    // All written by refreshPassives, all read below in recalc.
    this.masteryPoints = { axe: 0, mace: 0, sword: 0, polearm: 0, spear: 0 };
    this.ironSkinLevel = 0;
    this.lifeBonusPct = 0;        // Increased Stamina
    this.runSpeedBonusPct = 0;    // Increased Speed
    this.resistBonus = 0;         // Natural Resistance
    this.recalc(true);
  }

  // ------------------------------------------------------------ derived stats

  recalc(fill = false) {
    const t = aggregateMods(this.equipment);
    this.totals = t;

    const str = this.stats.str + t.str;
    const dex = this.stats.dex + t.dex;
    const vit = this.stats.vit + t.vit;
    const ene = this.stats.ene + t.ene;
    this.effective = { str, dex, vit, ene };

    const prevMaxHp = this.maxHp, prevMaxMana = this.maxMana;
    const bo = this.buffs.battleorders;
    const boPct = bo ? bo.mag : 0;
    this.maxHp = maxLifeFor(this.cls, this.level, vit, t.life, t.lifePct + boPct + (this.lifeBonusPct || 0));
    this.maxMana = maxManaFor(this.cls, this.level, ene, t.mana, t.manaPct + boPct);

    const armour = t.def * (1 + t.defPct / 100);
    let def = defenseFrom(dex, armour);
    if (this.ironSkinLevel > 0) def *= 1 + (30 + 10 * (this.ironSkinLevel - 1)) / 100;
    if (this.buffs.shout) def *= 1 + this.buffs.shout.mag / 100;
    // A buff carrying `defPct` is armour worn as a spell: the cold armours.
    for (const id in this.buffs) {
      const pct = this.buffs[id].defPct;
      if (pct) def *= 1 + pct / 100;
    }
    this.defense = Math.floor(def);

    for (const el of ['fire', 'cold', 'light', 'pois']) {
      const key = 'res' + el[0].toUpperCase() + el.slice(1);
      this.resists[el] = Math.min(RES_CAP, t[key] + t.resAll + (this.resistBonus || 0));
    }
    this.damageReduction = t.dr;
    this.magicFind = t.mf;
    this.goldFind = t.gf;
    this.castRate = t.fcr;
    this.runSpeed = 4.6 * (1 + t.frw / 200) * (1 + (this.runSpeedBonusPct || 0) / 100);
    this.speed = this.runSpeed;

    // Weapon damage. Bare-handed is deliberately feeble: this is a caster —
    // or it was; a mastery folds in for the matching weapon kind so the
    // sheet stays honest.
    const MASTERY_KIND = {
      axe: 'axe', mace: 'mace', sword: 'sword', blade: 'sword',
      polearm: 'polearm', spear: 'spear',
    };
    const wpn = this.equipment.weapon;
    const mk = wpn ? MASTERY_KIND[wpn.kind] : null;
    const mp = mk ? (this.masteryPoints[mk] || 0) : 0;
    const mBonus = mp > 0 ? 28 + 8 * (mp - 1) : 0;
    this.minDamage = Math.floor(((wpn ? wpn.minDmg : 1) + t.minDmg) * (1 + mBonus / 100));
    this.maxDamage = Math.floor(((wpn ? wpn.maxDmg : 2) + t.maxDmg) * (1 + mBonus / 100));
    // A buff can hurry the swing, and a stacking one does it once per live
    // stack — which is the whole of Frenzy.
    let ias = t.ias;
    for (const id in this.buffs) {
      const b = this.buffs[id];
      if (!b.ias) continue;
      ias += b.ias * (b.stacks ? (b.stackAt ? b.stackAt.length : 0) : 1);
    }
    this.attackSpeed = 1 + ias / 100;
    this.attackRating = Math.floor(attackRatingFrom(dex, t.ar, this.level) + mBonus);

    // Raising vitality grants the new life immediately rather than only the
    // headroom, which is what the original does and what players expect.
    if (fill) { this.hp = this.maxHp; this.mana = this.maxMana; }
    else {
      this.hp = Math.min(this.hp + Math.max(0, this.maxHp - prevMaxHp), this.maxHp);
      this.mana = Math.min(this.mana + Math.max(0, this.maxMana - prevMaxMana), this.maxMana);
    }
  }

  skillBonus(tree) {
    const t = this.totals;
    const byTree = tree === 'fire' ? t.skillFire : tree === 'cold' ? t.skillCold : tree === 'light' ? t.skillLight : 0;
    return t.skills + byTree;
  }

  // --------------------------------------------------------------- progression

  get xpToNext() { return xpToNext(this.level); }
  get xpIntoLevel() { return this.xp - xpForLevel(this.level); }

  gainXp(amount, onLevel) {
    if (this.level >= LEVEL_CAP) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.level < LEVEL_CAP && this.xp >= xpForLevel(this.level + 1)) {
      this.level++;
      this.statPoints += 5;
      this.skillPoints += 1;
      gained++;
      this.recalc();
      this.hp = this.maxHp;
      this.mana = this.maxMana;
      if (onLevel) onLevel(this.level);
    }
    return gained;
  }

  spendStat(which) {
    if (this.statPoints <= 0) return false;
    if (!(which in this.stats)) return false;
    this.stats[which]++;
    this.statPoints--;
    this.recalc();
    return true;
  }

  // ------------------------------------------------------------------ movement

  moveTo(level, wx, wy) {
    this.target = null;
    const raw = findPath(level, this.x, this.y, wx, wy);
    if (!raw || !raw.length) { this.path = null; this.moveGoal = null; return false; }
    this.path = smooth(level, raw, { x: this.x, y: this.y }, this.radius);
    this.pathIndex = 0;
    this.moveGoal = { x: wx, y: wy };
    return true;
  }

  stop() { this.path = null; this.moveGoal = null; }

  followPath(dt, level) {
    if (!this.path || this.pathIndex >= this.path.length) { this.path = null; return false; }
    const node = this.path[this.pathIndex];
    const dx = node.x - this.x, dy = node.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * this.slowFactor * dt;
    if (d <= step) {
      this.pathIndex++;
      // Snap onto the waypoint so accumulated error does not drift into walls.
      if (!level.blockedCircle(node.x, node.y, this.radius)) { this.x = node.x; this.y = node.y; }
      if (this.pathIndex >= this.path.length) { this.path = null; return false; }
      return true;
    }
    this.face(node.x, node.y);
    const moved = this.moveBy((dx / d) * step, (dy / d) * step, level);
    if (!moved) {
      // Blocked by something that appeared after the path was computed.
      const again = findPath(level, this.x, this.y, this.moveGoal ? this.moveGoal.x : node.x, this.moveGoal ? this.moveGoal.y : node.y);
      this.path = again ? smooth(level, again, { x: this.x, y: this.y }, this.radius) : null;
      this.pathIndex = 0;
      if (!this.path) return false;
    }
    return true;
  }

  update(dt, level) {
    this.updateStatus(dt);
    let buffExpired = false;
    for (const id in this.buffs) {
      this.buffs[id].t -= dt;
      if (this.buffs[id].t <= 0) { delete this.buffs[id]; buffExpired = true; }
    }
    if (buffExpired) this.recalc();   // clamps life and mana to the lowered max
    if (!this.alive) { this.updateAnim(dt); return; }

    // A skill that owns the body for a moment: Leap's flight, Whirlwind's
    // travel. Ticks even while busy; clears itself when done.
    if (this.action && this.action(dt)) this.action = null;

    if (this.busy > 0) {
      this.busy -= dt;
      this.updateAnim(dt);
      return;
    }

    const moving = this.followPath(dt, level);
    if (this.animName !== 'attack' && this.animName !== 'cast') {
      this.setAnim(moving ? 'walk' : 'idle');
    }

    // Mana and life trickle back. Warmth multiplies the mana rate.
    const warmth = this.manaRegenBonus || 0;
    this.mana = Math.min(this.maxMana, this.mana + (this.maxMana * 0.012 * (1 + warmth)) * dt);
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.002 * dt);

    this.updateAnim(dt);
  }

  spend(mana) {
    if (this.mana < mana) return false;
    this.mana -= mana;
    return true;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }
  restoreMana(amount) { this.mana = Math.min(this.maxMana, this.mana + amount); }
}
