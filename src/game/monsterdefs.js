// Monster definitions and the modifiers carried by unique packs.
//
// Base numbers are written for monster level 1 and scaled up by area level, so
// the same Fallen is a nuisance in the Blood Moor and a genuine threat in the
// Catacombs without a second definition.

export const MONSTERS = {
  fallen: {
    id: 'fallen', name: 'Fallen', figure: 'fallen',
    hp: 15, dmg: [2, 5], ar: 28, def: 6, speed: 3.5, xp: 9,
    radius: 0.28, ai: 'melee', wake: 11, attackRange: 0.95, attackCooldown: 1.15,
    resists: {}, flees: true,
  },
  devilkin: {
    id: 'devilkin', name: 'Devilkin', figure: 'devilkin',
    hp: 26, dmg: [4, 8], ar: 42, def: 12, speed: 4.1, xp: 17,
    radius: 0.30, ai: 'melee', wake: 12, attackRange: 1.0, attackCooldown: 1.0,
    resists: {}, flees: true,
  },
  shaman: {
    id: 'shaman', name: 'Fallen Shaman', figure: 'shaman',
    hp: 20, dmg: [3, 7], ar: 30, def: 10, speed: 3.1, xp: 24,
    radius: 0.28, ai: 'caster', wake: 13, attackRange: 7.5, attackCooldown: 2.1,
    resists: { fire: 50 }, special: 'resurrect', keepDistance: 5,
    bolt: { element: 'fire', min: 3, max: 7, speed: 8, colour: '#ff8a30' },
  },
  zombie: {
    id: 'zombie', name: 'Zombie', figure: 'zombie',
    hp: 34, dmg: [4, 9], ar: 22, def: 8, speed: 1.7, xp: 15,
    radius: 0.32, ai: 'melee', wake: 9, attackRange: 1.0, attackCooldown: 1.6,
    resists: { pois: 100, cold: -20 },
  },
  ghoul: {
    id: 'ghoul', name: 'Ghoul', figure: 'ghoul',
    hp: 24, dmg: [5, 10], ar: 46, def: 14, speed: 5.4, xp: 21,
    radius: 0.28, ai: 'melee', wake: 14, attackRange: 0.95, attackCooldown: 0.85,
    resists: { pois: 50 },
  },
  quillrat: {
    id: 'quillrat', name: 'Quill Rat', figure: 'quillrat',
    hp: 17, dmg: [3, 6], ar: 30, def: 10, speed: 4.0, xp: 13,
    radius: 0.26, ai: 'ranged', wake: 12, attackRange: 8, attackCooldown: 2.4,
    resists: {}, keepDistance: 4.5, special: 'volley',
    bolt: { element: 'phys', min: 2, max: 5, speed: 11, colour: '#c8b070' },
  },
  skeleton: {
    id: 'skeleton', name: 'Skeleton', figure: 'skeleton',
    hp: 23, dmg: [4, 8], ar: 40, def: 17, speed: 3.4, xp: 16,
    radius: 0.28, ai: 'melee', wake: 11, attackRange: 1.05, attackCooldown: 1.2,
    resists: { pois: 100, phys: 15, cold: 25 },
  },

  // ------------------------------------------------------------------ bosses
  corpsefire: {
    id: 'corpsefire', name: 'Corpsefire', figure: 'corpsefire',
    hp: 210, dmg: [8, 16], ar: 75, def: 26, speed: 3.7, xp: 320,
    radius: 0.42, ai: 'melee', wake: 16, attackRange: 1.3, attackCooldown: 1.1,
    resists: { fire: 50 }, boss: true, aura: '#ff5a20',
    mods: ['Extra Strong', 'Fire Enchanted'],
  },
  bloodraven: {
    id: 'bloodraven', name: 'Blood Raven', figure: 'bloodraven',
    hp: 430, dmg: [9, 19], ar: 95, def: 36, speed: 4.4, xp: 850,
    radius: 0.34, ai: 'ranged', wake: 18, attackRange: 10, attackCooldown: 1.3,
    resists: { fire: 40, pois: 50 }, boss: true, aura: '#ff2a3a',
    keepDistance: 6, special: 'raise',
    bolt: { element: 'fire', min: 7, max: 15, speed: 13, colour: '#ff6a30', homing: 0.9 },
  },
  andariel: {
    id: 'andariel', name: 'Andariel', figure: 'andariel',
    hp: 1500, dmg: [16, 30], ar: 140, def: 58, speed: 3.5, xp: 3200,
    radius: 0.48, ai: 'boss', wake: 20, attackRange: 1.7, attackCooldown: 1.0,
    resists: { pois: 100, fire: 40, cold: 20, light: 20 }, boss: true, aura: '#8aff3a',
    special: 'andariel', freezeImmune: true,
  },
};

// Modifiers carried by unique packs, exactly as the originals read on screen.
export const UNIQUE_MODS = [
  { name: 'Extra Fast', apply: (m) => { m.speed *= 1.45; m.attackCooldown *= 0.75; } },
  { name: 'Extra Strong', apply: (m) => { m.dmgMin *= 1.6; m.dmgMax *= 1.6; } },
  { name: 'Stone Skin', apply: (m) => { m.defense *= 3; m.damageReduction += 4; } },
  { name: 'Magic Resistant', apply: (m) => { for (const e of ['fire', 'cold', 'light', 'pois']) m.resists[e] = (m.resists[e] || 0) + 40; } },
  { name: 'Cold Enchanted', apply: (m) => { m.resists.cold = 85; m.enchant = 'cold'; } },
  { name: 'Fire Enchanted', apply: (m) => { m.resists.fire = 85; m.enchant = 'fire'; } },
  { name: 'Lightning Enchanted', apply: (m) => { m.resists.light = 85; m.enchant = 'light'; } },
];

export const ENCHANT_COLOUR = { fire: '#ff7a30', cold: '#7ad0ff', light: '#b0c8ff' };

// Growth per monster level. Health climbs fastest so later areas stay dangerous
// even once the player's damage has scaled.
export function scaleStat(base, mlvl, rate) {
  return base * (1 + Math.max(0, mlvl - 1) * rate);
}

export function statsFor(def, mlvl) {
  return {
    hp: Math.round(scaleStat(def.hp, mlvl, 0.44)),
    dmgMin: scaleStat(def.dmg[0], mlvl, 0.30),
    dmgMax: scaleStat(def.dmg[1], mlvl, 0.30),
    ar: Math.round(scaleStat(def.ar, mlvl, 0.26)),
    defense: Math.round(scaleStat(def.def, mlvl, 0.24)),
    xp: Math.round(scaleStat(def.xp, mlvl, 0.55)),
  };
}
