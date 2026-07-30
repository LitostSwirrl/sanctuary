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

  // ------------------------------------------------------------- act 2 desert
  // Written at level 1 like everything above; the desert meets them at area
  // level 13 and up, so the scaling does the act's work.
  sandraider: {
    id: 'sandraider', name: 'Sand Raider', figure: 'sandraider',
    hp: 30, dmg: [5, 10], ar: 48, def: 16, speed: 4.2, xp: 22,
    radius: 0.30, ai: 'melee', wake: 12, attackRange: 1.05, attackCooldown: 0.95,
    resists: { fire: 25 },
  },
  vulturedemon: {
    id: 'vulturedemon', name: 'Vulture Demon', figure: 'vulturedemon',
    hp: 25, dmg: [5, 11], ar: 52, def: 12, speed: 5.6, xp: 20,
    radius: 0.30, ai: 'melee', wake: 15, attackRange: 1.0, attackCooldown: 0.9,
    resists: {}, flees: true,
  },
  sandmaggot: {
    // A burrower that spits from range and is nearly helpless up close, which
    // is why it keeps its distance and why the poison lingers.
    id: 'sandmaggot', name: 'Sand Maggot', figure: 'sandmaggot',
    hp: 32, dmg: [4, 9], ar: 34, def: 10, speed: 2.2, xp: 19,
    radius: 0.34, ai: 'ranged', wake: 12, attackRange: 8, attackCooldown: 2.2,
    resists: { pois: 100 }, keepDistance: 5,
    bolt: { element: 'pois', min: 4, max: 9, speed: 8, colour: '#8ac040' },
  },
  scarab: {
    // Small, quick, and crackling: the spec's lightning-enchant flavour, so
    // every hit carries a jolt without waiting for a unique pack's modifier.
    id: 'scarab', name: 'Scarab', figure: 'scarab',
    hp: 18, dmg: [3, 7], ar: 44, def: 14, speed: 4.8, xp: 17,
    radius: 0.26, ai: 'melee', wake: 13, attackRange: 0.9, attackCooldown: 0.9,
    resists: { light: 75 }, enchant: 'light',
  },
  mummy: {
    id: 'mummy', name: 'Mummy', figure: 'mummy',
    hp: 42, dmg: [5, 11], ar: 30, def: 12, speed: 1.8, xp: 21,
    radius: 0.32, ai: 'melee', wake: 9, attackRange: 1.0, attackCooldown: 1.55,
    resists: { pois: 100, cold: 50, phys: 10 },
  },
  greatermummy: {
    // Radament's kind: a priest of the tombs that raises what you drop and
    // throws unholy bolts from behind the line.
    id: 'greatermummy', name: 'Greater Mummy', figure: 'greatermummy',
    hp: 36, dmg: [4, 9], ar: 36, def: 14, speed: 2.4, xp: 30,
    radius: 0.32, ai: 'caster', wake: 13, attackRange: 8, attackCooldown: 2.2,
    resists: { pois: 100, cold: 50 }, special: 'resurrect', keepDistance: 5,
    bolt: { element: 'pois', min: 5, max: 10, speed: 8, colour: '#a0d048' },
  },
  clawviper: {
    id: 'clawviper', name: 'Claw Viper', figure: 'clawviper',
    hp: 28, dmg: [6, 12], ar: 54, def: 18, speed: 5.8, xp: 26,
    radius: 0.30, ai: 'melee', wake: 14, attackRange: 1.0, attackCooldown: 0.85,
    resists: { cold: 50 },
  },

  // ------------------------------------------------------------- act 3 jungle
  flayer: {
    id: 'flayer', name: 'Flayer', figure: 'flayer',
    hp: 24, dmg: [5, 10], ar: 52, def: 14, speed: 5.2, xp: 20,
    radius: 0.26, ai: 'melee', wake: 13, attackRange: 0.9, attackCooldown: 0.85,
    resists: {}, flees: true,
  },
  flayershaman: {
    id: 'flayershaman', name: 'Flayer Shaman', figure: 'flayershaman',
    hp: 28, dmg: [4, 9], ar: 38, def: 12, speed: 3.4, xp: 32,
    radius: 0.26, ai: 'caster', wake: 14, attackRange: 7.5, attackCooldown: 2.0,
    resists: { fire: 50 }, special: 'resurrect', keepDistance: 5,
    bolt: { element: 'fire', min: 5, max: 10, speed: 9, colour: '#ff8a30' },
  },
  thornhulk: {
    id: 'thornhulk', name: 'Thorn Hulk', figure: 'thornhulk',
    hp: 60, dmg: [8, 16], ar: 44, def: 20, speed: 2.6, xp: 34,
    radius: 0.40, ai: 'melee', wake: 11, attackRange: 1.3, attackCooldown: 1.5,
    resists: { pois: 100, phys: 15, fire: -25 },
  },
  giantspider: {
    // The bite is the poison: the enchant lays it on every landed hit.
    id: 'giantspider', name: 'Giant Spider', figure: 'giantspider',
    hp: 30, dmg: [5, 11], ar: 50, def: 16, speed: 5.0, xp: 25,
    radius: 0.34, ai: 'melee', wake: 13, attackRange: 1.0, attackCooldown: 1.0,
    resists: { pois: 100 }, enchant: 'pois',
  },
  zealot: {
    id: 'zealot', name: 'Zealot', figure: 'zealot',
    hp: 34, dmg: [6, 13], ar: 58, def: 22, speed: 4.4, xp: 28,
    radius: 0.30, ai: 'melee', wake: 13, attackRange: 1.05, attackCooldown: 0.9,
    resists: { light: 25 },
  },
  councilmember: {
    id: 'councilmember', name: 'Council Member', figure: 'councilmember',
    hp: 44, dmg: [6, 12], ar: 48, def: 20, speed: 3.2, xp: 44,
    radius: 0.32, ai: 'caster', wake: 14, attackRange: 8, attackCooldown: 1.9,
    resists: { fire: 75, light: 25 }, keepDistance: 5,
    bolt: { element: 'fire', min: 7, max: 14, speed: 10, colour: '#ff7a30' },
  },

  // --------------------------------------------------------------- act 4 hell
  // Hell is met at area level 28 and up, so these are written at level 1 like
  // everything else and let the scaling do the act's work. What changes in hell
  // is not the numbers but the resistances: fire is nearly useless here.
  doomknight: {
    id: 'doomknight', name: 'Doom Knight', figure: 'doomknight',
    hp: 46, dmg: [7, 14], ar: 60, def: 26, speed: 4.0, xp: 32,
    radius: 0.32, ai: 'melee', wake: 13, attackRange: 1.1, attackCooldown: 1.0,
    resists: { fire: 50, phys: 15 },
  },
  oblivionknight: {
    // The same armour with a book instead of a shield: it keeps behind the line
    // and raises the knights that fall in front of it.
    id: 'oblivionknight', name: 'Oblivion Knight', figure: 'oblivionknight',
    hp: 40, dmg: [6, 12], ar: 48, def: 24, speed: 3.0, xp: 48,
    radius: 0.32, ai: 'caster', wake: 14, attackRange: 8.5, attackCooldown: 1.9,
    resists: { fire: 50, cold: 50, pois: 100 }, special: 'resurrect', keepDistance: 5,
    bolt: { element: 'cold', min: 8, max: 16, speed: 9, colour: '#9ad8ff' },
  },
  balrog: {
    id: 'balrog', name: 'Balrog', figure: 'balrog',
    hp: 66, dmg: [10, 19], ar: 62, def: 28, speed: 3.6, xp: 52,
    radius: 0.42, ai: 'melee', wake: 14, attackRange: 1.4, attackCooldown: 1.25,
    resists: { fire: 100, cold: -25 }, enchant: 'fire',
  },
  urdar: {
    // A mauler: slow, enormously heavy, and the one thing in the act that will
    // out-trade a barbarian toe to toe.
    id: 'urdar', name: 'Urdar', figure: 'urdar',
    hp: 80, dmg: [12, 22], ar: 56, def: 32, speed: 2.6, xp: 46,
    radius: 0.42, ai: 'melee', wake: 11, attackRange: 1.45, attackCooldown: 1.6,
    resists: { fire: 50, phys: 25, light: -25 },
  },

  // -------------------------------------------------------------- act 5 arreat
  enslaved: {
    id: 'enslaved', name: 'Enslaved', figure: 'enslaved',
    hp: 40, dmg: [7, 14], ar: 62, def: 22, speed: 5.0, xp: 36,
    radius: 0.28, ai: 'melee', wake: 14, attackRange: 0.95, attackCooldown: 0.85,
    resists: { fire: 50 }, flees: true,
  },
  deathminion: {
    id: 'deathminion', name: 'Death Minion', figure: 'deathminion',
    hp: 72, dmg: [11, 20], ar: 64, def: 30, speed: 3.4, xp: 48,
    radius: 0.38, ai: 'melee', wake: 12, attackRange: 1.3, attackCooldown: 1.35,
    resists: { cold: 50, phys: 15 },
  },
  succubus: {
    // She blights rather than burns: the bolt is cold, she never closes, and a
    // pack of them at range is what makes the highlands frightening.
    id: 'succubus', name: 'Succubus', figure: 'succubus',
    hp: 50, dmg: [8, 15], ar: 54, def: 26, speed: 4.2, xp: 56,
    radius: 0.30, ai: 'caster', wake: 15, attackRange: 9.5, attackCooldown: 1.8,
    resists: { cold: 50, light: 25 }, keepDistance: 6,
    bolt: { element: 'cold', min: 9, max: 18, speed: 10, colour: '#b0a0ff' },
  },
  frozenhorror: {
    id: 'frozenhorror', name: 'Frozen Horror', figure: 'frozenhorror',
    hp: 88, dmg: [12, 23], ar: 58, def: 34, speed: 2.8, xp: 58,
    radius: 0.44, ai: 'melee', wake: 12, attackRange: 1.5, attackCooldown: 1.5,
    resists: { cold: 100, fire: -25 }, enchant: 'cold',
  },
  moonlord: {
    id: 'moonlord', name: 'Moon Lord', figure: 'moonlord',
    hp: 78, dmg: [13, 24], ar: 70, def: 34, speed: 3.8, xp: 62,
    radius: 0.42, ai: 'melee', wake: 14, attackRange: 1.4, attackCooldown: 1.2,
    resists: { fire: 75, light: 25 },
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
  smith: {
    id: 'smith', name: 'The Smith', figure: 'smith',
    // Written so that Extra Strong lands him between Blood Raven and Andariel
    // rather than above her: 9 to 17 grows to 58-109 by the time he is met.
    hp: 620, dmg: [9, 17], ar: 105, def: 44, speed: 3.1, xp: 1200,
    radius: 0.44, ai: 'melee', wake: 15, attackRange: 1.5, attackCooldown: 1.35,
    // Forge-hardened: fire barely troubles him and the hammer answers steel with
    // steel. Slow, heavy swings are what make him survivable at all.
    resists: { fire: 60, phys: 20 }, boss: true, aura: '#ff8a3a',
    mods: ['Extra Strong', 'Stone Skin'],
  },
  radament: {
    // The Horadrim gone wrong in the dark under Lut Gholein. A caster boss on
    // the shaman pattern: he keeps behind what he raises and throws rot.
    id: 'radament', name: 'Radament', figure: 'greatermummy',
    hp: 700, dmg: [8, 16], ar: 110, def: 40, speed: 2.6, xp: 1500,
    radius: 0.36, ai: 'caster', wake: 16, attackRange: 9, attackCooldown: 1.8,
    resists: { pois: 100, cold: 50, fire: 25 }, boss: true, aura: '#8ad04a',
    special: 'resurrect', keepDistance: 5,
    bolt: { element: 'pois', min: 10, max: 20, speed: 9, colour: '#a0d048' },
  },
  duriel: {
    // The gate of act two. All melee and all pressure: fast for his bulk, cold
    // on every blow, and nothing about him to kite except the doorway.
    id: 'duriel', name: 'Duriel', figure: 'duriel',
    hp: 1900, dmg: [20, 36], ar: 160, def: 64, speed: 4.6, xp: 4200,
    radius: 0.52, ai: 'melee', wake: 20, attackRange: 1.8, attackCooldown: 0.9,
    resists: { cold: 75, fire: 30, light: 30 }, boss: true, aura: '#7ad0ff',
    enchant: 'cold', freezeImmune: true,
  },
  council: {
    // The named third of the Travincal trio; the other two ride in as his
    // guard pack. Hydra-flavoured fire from a council robe.
    id: 'council', name: 'Ismail Vilehand', figure: 'councilmember',
    hp: 800, dmg: [10, 20], ar: 130, def: 52, speed: 3.6, xp: 2600,
    radius: 0.34, ai: 'caster', wake: 18, attackRange: 9, attackCooldown: 1.5,
    resists: { fire: 85, light: 40 }, boss: true, aura: '#ff7a30',
    keepDistance: 5,
    bolt: { element: 'fire', min: 12, max: 24, speed: 11, colour: '#ff7a30' },
  },
  mephisto: {
    // The gate of act three, and the first boss fought at range on both sides:
    // his charged bolt homes, and his court of zealots holds the middle ground.
    id: 'mephisto', name: 'Mephisto', figure: 'mephisto',
    hp: 2100, dmg: [16, 30], ar: 170, def: 70, speed: 3.2, xp: 5200,
    radius: 0.46, ai: 'caster', wake: 22, attackRange: 11, attackCooldown: 1.2,
    resists: { light: 75, cold: 50, fire: 50, pois: 100 }, boss: true, aura: '#7a9aff',
    freezeImmune: true, keepDistance: 6,
    bolt: { element: 'light', min: 14, max: 28, speed: 12, colour: '#9ab0ff', homing: 0.7 },
  },
  andariel: {
    id: 'andariel', name: 'Andariel', figure: 'andariel',
    hp: 1500, dmg: [16, 30], ar: 140, def: 58, speed: 3.5, xp: 3200,
    radius: 0.48, ai: 'boss', wake: 20, attackRange: 1.7, attackCooldown: 1.0,
    resists: { pois: 100, fire: 40, cold: 20, light: 20 }, boss: true, aura: '#8aff3a',
    special: 'andariel', freezeImmune: true,
  },
  izual: {
    // A fallen angel, and the only cold thing in hell: the reskin is blue for a
    // reason. Not a gate -- killing him is the act's optional bounty -- so he is
    // written a shade under Hephasto.
    id: 'izual', name: 'Izual', figure: 'izual',
    hp: 1600, dmg: [17, 32], ar: 150, def: 62, speed: 4.0, xp: 4600,
    radius: 0.50, ai: 'melee', wake: 20, attackRange: 1.7, attackCooldown: 1.0,
    resists: { cold: 100, fire: 40, pois: 100 }, boss: true, aura: '#8ad8ff',
    enchant: 'cold', freezeImmune: true,
    mods: ['Cold Enchanted', 'Extra Fast'],
  },
  hephasto: {
    // The Smith's older brother in every sense: the same slow hammer, hell's
    // resistances, and a river of flame to fight him beside.
    id: 'hephasto', name: 'Hephasto the Armourer', figure: 'hephasto',
    hp: 1800, dmg: [20, 38], ar: 165, def: 74, speed: 2.8, xp: 5400,
    radius: 0.48, ai: 'melee', wake: 17, attackRange: 1.6, attackCooldown: 1.45,
    resists: { fire: 90, phys: 25, light: 40 }, boss: true, aura: '#ff8a3a',
    mods: ['Extra Strong', 'Stone Skin'],
  },
  diablo: {
    // The gate of act four. Fire on every blow and fast enough that the doorway
    // is no longer an answer -- the Chaos Sanctuary is meant to be survived by
    // resistances and potions rather than geometry.
    id: 'diablo', name: 'Diablo', figure: 'diablo',
    hp: 2600, dmg: [22, 40], ar: 190, def: 84, speed: 4.4, xp: 7200,
    radius: 0.56, ai: 'melee', wake: 22, attackRange: 1.9, attackCooldown: 0.95,
    resists: { fire: 85, cold: 50, light: 50, pois: 75 }, boss: true, aura: '#ff4a2a',
    enchant: 'fire', freezeImmune: true,
  },
  shenk: {
    // A siege overseer, so his numbers are the act's welcome rather than its
    // wall: a unique Death Minion with a whip and a hill to hold.
    id: 'shenk', name: 'Shenk the Overseer', figure: 'deathminion',
    hp: 1500, dmg: [16, 30], ar: 155, def: 66, speed: 3.6, xp: 5000,
    radius: 0.42, ai: 'melee', wake: 18, attackRange: 1.5, attackCooldown: 1.2,
    resists: { cold: 50, fire: 50, phys: 20 }, boss: true, aura: '#c86a2a',
    mods: ['Extra Strong', 'Extra Fast'],
  },
  ancient: {
    // One guardian on the way, not the canon three: bronze, patient, and immune
    // to nothing in particular, which makes him the fairest boss in the act.
    id: 'ancient', name: 'Talic the Defender', figure: 'ancient',
    hp: 2000, dmg: [22, 40], ar: 175, def: 90, speed: 3.8, xp: 6200,
    radius: 0.46, ai: 'melee', wake: 19, attackRange: 1.7, attackCooldown: 1.1,
    resists: { cold: 75, phys: 25, light: 25 }, boss: true, aura: '#c8a03a',
    mods: ['Stone Skin', 'Extra Strong'],
  },
  baal: {
    // The end of the road. A caster to close the game because every other act
    // boss was met in melee: he holds the middle of the throne room, throws
    // homing cold, and there is no pack of his own kind to hide behind.
    id: 'baal', name: 'Baal', figure: 'baal',
    hp: 3000, dmg: [26, 46], ar: 200, def: 92, speed: 3.4, xp: 9000,
    radius: 0.56, ai: 'caster', wake: 24, attackRange: 11, attackCooldown: 1.15,
    resists: { cold: 85, fire: 60, light: 60, pois: 100 }, boss: true, aura: '#7ae0ff',
    freezeImmune: true, keepDistance: 6,
    bolt: { element: 'cold', min: 18, max: 34, speed: 12, colour: '#a0e8ff', homing: 0.75 },
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

export const ENCHANT_COLOUR = { fire: '#ff7a30', cold: '#7ad0ff', light: '#b0c8ff', pois: '#8ac040' };

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
