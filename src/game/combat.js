// Combat arithmetic.
//
// The hit chance, resistance handling and stat derivation follow Diablo 2's
// shape rather than being invented: attack rating is weighed against defence
// with a level term, resistances cap at 75, and elemental damage is reduced
// after masteries have already pushed the target's resistance down, which is
// why a mastery can drive a resistance negative and multiply damage.

export const RES_CAP = 75;
export const LEVEL_CAP = 30;

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
// power law tuned so a full run of this slice lands the player somewhere in the
// high teens to low twenties, with 30 as a hard cap.
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
