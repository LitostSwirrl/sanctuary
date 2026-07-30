// Combat arithmetic.
//
// The hit chance, resistance handling and stat derivation follow Diablo 2's
// shape rather than being invented: attack rating is weighed against defence
// with a level term, resistances cap at 75, and elemental damage is reduced
// after masteries have already pushed the target's resistance down, which is
// why a mastery can drive a resistance negative and multiply damage.

export const RES_CAP = 75;
export const LEVEL_CAP = 50;

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

// Never a guaranteed hit and never a guaranteed miss.
export function chanceToHit(ar, def, alvl, dlvl) {
  const a = Math.max(1, ar), d = Math.max(0, def);
  const raw = 100 * (a / (a + d)) * (2 * alvl / (alvl + dlvl));
  return clamp(raw, 5, 95);
}

export function rollHit(rng, ar, def, alvl, dlvl) {
  return rng.f() * 100 < chanceToHit(ar, def, alvl, dlvl);
}

export function rollDamage(rng, min, max, enhancedPct = 0, str = 0) {
  const base = min + rng.f() * Math.max(0, max - min);
  return base * (1 + enhancedPct / 100) * (1 + str / 100);
}

// Attack rating from dexterity, matching D2's five-per-point slope.
export function attackRatingFrom(dex, bonus = 0, level = 1) {
  return Math.max(0, dex * 5 - 35) + bonus + level * 2;
}

export function defenseFrom(dex, armour = 0) {
  return Math.floor(dex / 4) + armour;
}

// Defence as the to-hit roll should see it: Battle Cry (task 6) halves it.
export function monsterDefense(m) {
  return Math.floor(m.defense * (m.battlecry ? m.battlecry.def : 1));
}

// Per-class derivation of life and mana. Sorceress values are the originals:
// two life per vitality, two mana per energy, one life and two mana per level.
export const CLASS_STATS = {
  sorceress: {
    name: 'Sorceress',
    str: 10, dex: 25, vit: 10, ene: 35,
    life: 40, mana: 35, stamina: 74,
    lifePerVit: 2, manaPerEne: 2,
    lifePerLevel: 1, manaPerLevel: 2,
    lifePerVitLevel: 0, blockBase: 20,
  },
  barbarian: {
    name: 'Barbarian',
    str: 30, dex: 20, vit: 25, ene: 10,
    life: 55, mana: 10, stamina: 92,
    lifePerVit: 4, manaPerEne: 1,
    lifePerLevel: 2, manaPerLevel: 1,
    lifePerVitLevel: 0, blockBase: 20,
  },
};

export function maxLifeFor(cls, level, vit, bonusFlat = 0, bonusPct = 0) {
  const c = CLASS_STATS[cls];
  const base = c.life + (vit - c.vit) * c.lifePerVit + (level - 1) * c.lifePerLevel;
  return Math.floor((base + bonusFlat) * (1 + bonusPct / 100));
}

export function maxManaFor(cls, level, ene, bonusFlat = 0, bonusPct = 0) {
  const c = CLASS_STATS[cls];
  const base = c.mana + (ene - c.ene) * c.manaPerEne + (level - 1) * c.manaPerLevel;
  return Math.floor((base + bonusFlat) * (1 + bonusPct / 100));
}

// ---------------------------------------------------------------- experience

// Shaped like the original's curve rather than copied from its table: a smooth
// power law. Which is why the cap moving from 30 to 50 asked nothing of it -- a
// law is not a table, so it already had a value at 49, and the same shape
// carries the whole five-act climb. 296,857 to stand at 30; 941,247 to stand at
// 50, a little over three times as far for twenty more levels, with each level
// costing about a thousand more than the one before it. The two constants are
// the pacing lever and belong to the pacing pass, which tunes them against
// real kill paths rather than against arithmetic.
export function xpForLevel(n) {
  if (n <= 1) return 0;
  return Math.floor(180 * Math.pow(n - 1, 2.2));
}

export function xpToNext(level) {
  return xpForLevel(level + 1) - xpForLevel(level);
}

// Killing things far below you is nearly worthless, which is what stops the
// first area from being a viable grind at level 20.
export function xpPenalty(plevel, mlevel) {
  const diff = plevel - mlevel;
  if (diff <= 5) return diff < -5 ? 1.15 : 1;
  return Math.max(0.04, 1 - (diff - 5) * 0.13);
}

// ------------------------------------------------------------------- damage

export const ELEMENTS = ['fire', 'cold', 'light', 'pois'];

// Energy Shield: a buff carrying `esplit` diverts that share of every blow to
// mana, and only as far as the mana actually stretches. The rest lands on life
// as usual, so an empty mana orb means no protection at all.
function payFromMana(target, total) {
  if (total <= 0 || !target.mana) return 0;
  let split = 0;
  for (const id in target.buffs) split = Math.max(split, target.buffs[id].esplit || 0);
  if (split <= 0) return 0;
  const paid = Math.min(target.mana, total * split);
  target.mana -= paid;
  return paid;
}

// The cold armours answer a melee blow: the striker is chilled, takes damage,
// or both. A buff carries `onStruckChill: { seconds, amount }` and
// `onStruckDamage: { element, min, max }`. The retaliation is routed through
// the caller's damageMonster so a kill still pays experience and loot.
export function onStruck(defender, striker, ctx) {
  if (!striker || !striker.alive || defender.alive === false) return 0;
  let dealt = 0;
  for (const id in defender.buffs) {
    const b = defender.buffs[id];
    if (b.onStruckChill) applyChill(striker, b.onStruckChill.seconds, b.onStruckChill.amount ?? 0.35);
    if (!b.onStruckDamage) continue;
    const d = b.onStruckDamage;
    const roll = d.min + ctx.rng.f() * (d.max - d.min);
    dealt += ctx.damageMonster(striker, { [d.element || 'cold']: roll }, { source: defender, pierce: d.pierce || null });
  }
  return dealt;
}

// dmg is { phys, fire, cold, light, pois }; every field optional.
// opts.pierce lowers the target's resistance before it is applied, which is how
// the masteries work.
export function applyDamage(target, dmg, opts = {}) {
  if (!target.alive) return 0;
  let total = 0;

  if (dmg.phys) {
    const dr = target.damageReduction || 0;
    const pres = target.resists ? (target.resists.phys || 0) : 0;
    total += Math.max(1, dmg.phys * (1 - pres / 100) - dr);
  }

  for (const el of ELEMENTS) {
    const raw = dmg[el];
    if (!raw) continue;
    const base = target.resists ? (target.resists[el] || 0) : 0;
    const pierce = opts.pierce ? (opts.pierce[el] || 0) : 0;
    // Pierce applies to the raw value before the cap, so a heavily resistant
    // monster can still be brought down to zero but not below the floor.
    const eff = clamp(base - pierce, -100, target.isPlayer ? RES_CAP : 95);
    total += raw * (1 - eff / 100);
  }

  if (opts.absolute) total = opts.absolute;
  total = Math.max(0, total);
  total -= payFromMana(target, total);

  target.hp -= total;
  target.hitFlash = 0.34;
  if (opts.onDamaged) opts.onDamaged(total);
  if (target.hp <= 0) target.die(opts.source || null);
  return total;
}

// Cold slows and can freeze outright. Duration and strength both scale with
// how much cold damage landed relative to the target's health.
export function applyChill(target, seconds, amount = 0.35) {
  if (!target.alive) return;
  if (seconds > target.chilled) {
    target.chilled = seconds;
    target.chillAmount = Math.max(target.chillAmount, amount);
  }
}

export function applyFreeze(target, seconds) {
  if (!target.alive || target.freezeImmune) return;
  target.frozen = Math.max(target.frozen, seconds);
}

export function applyBurn(target, dps, seconds, source) {
  if (!target.alive) return;
  target.burning = Math.max(target.burning, seconds);
  target.burnDps = Math.max(target.burnDps, dps);
  target.burnSource = source || target.burnSource;
}

// Called once per simulation step for anything that can be on fire.
export function tickBurn(target, dt) {
  if (!target.alive || target.burning <= 0 || !target.burnDps) return 0;
  return applyDamage(target, { fire: target.burnDps * dt }, { source: target.burnSource });
}
