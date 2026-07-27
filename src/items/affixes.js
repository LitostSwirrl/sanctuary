// Magic and rare affix pools.
//
// `ilvl` is the item level an affix needs before it can appear, so a level 1
// drop can never roll the top tier of anything. `slots` restricts an affix to
// where it makes sense: enhanced damage does not belong on boots and faster
// cast rate does not belong on a sword.
//
// `mod` keys must match the MOD_KEYS list in game/player.js — that is the whole
// contract between an item and the character sheet.

const WEAPON = ['weapon'];
const ARMOUR = ['body', 'head', 'shield', 'gloves', 'boots', 'belt'];
const JEWEL = ['ring', 'amulet'];
const ALL = ['weapon', 'body', 'head', 'shield', 'gloves', 'boots', 'belt', 'ring', 'amulet'];

export const PREFIXES = [
  // Enhanced damage
  { name: 'Sharp', ilvl: 1, slots: WEAPON, mod: 'ed', min: 10, max: 20 },
  { name: 'Fine', ilvl: 5, slots: WEAPON, mod: 'ed', min: 21, max: 40 },
  { name: 'Cruel', ilvl: 12, slots: WEAPON, mod: 'ed', min: 41, max: 70 },
  { name: 'Merciless', ilvl: 20, slots: WEAPON, mod: 'ed', min: 71, max: 110 },

  // Defence
  { name: 'Sturdy', ilvl: 1, slots: ARMOUR, mod: 'def', min: 5, max: 12 },
  { name: 'Strong', ilvl: 5, slots: ARMOUR, mod: 'def', min: 13, max: 25 },
  { name: 'Glorious', ilvl: 12, slots: ARMOUR, mod: 'defPct', min: 20, max: 40 },
  { name: 'Blessed', ilvl: 20, slots: ARMOUR, mod: 'defPct', min: 41, max: 70 },

  // Attack rating
  { name: 'Bronze', ilvl: 1, slots: WEAPON, mod: 'ar', min: 10, max: 30 },
  { name: 'Iron', ilvl: 4, slots: WEAPON, mod: 'ar', min: 31, max: 60 },
  { name: 'Steel', ilvl: 10, slots: WEAPON, mod: 'ar', min: 61, max: 110 },

  // Added elemental damage
  { name: 'Smoldering', ilvl: 2, slots: WEAPON, mod: 'fire', min: 1, max: 4, spread: [2, 7] },
  { name: 'Flaming', ilvl: 8, slots: WEAPON, mod: 'fire', min: 4, max: 9, spread: [8, 18] },
  { name: 'Fiery', ilvl: 15, slots: WEAPON, mod: 'fire', min: 9, max: 18, spread: [20, 38] },
  { name: 'Frigid', ilvl: 3, slots: WEAPON, mod: 'cold', min: 1, max: 4, spread: [2, 6] },
  { name: 'Icy', ilvl: 10, slots: WEAPON, mod: 'cold', min: 5, max: 10, spread: [9, 18] },
  { name: 'Static', ilvl: 4, slots: WEAPON, mod: 'light', min: 1, max: 1, spread: [4, 14] },
  { name: 'Shocking', ilvl: 11, slots: WEAPON, mod: 'light', min: 1, max: 2, spread: [15, 36] },

  // Attributes
  { name: "Lizard's", ilvl: 1, slots: ALL, mod: 'mana', min: 5, max: 10 },
  { name: "Snake's", ilvl: 6, slots: ALL, mod: 'mana', min: 11, max: 20 },
  { name: "Serpent's", ilvl: 14, slots: ALL, mod: 'mana', min: 21, max: 40 },
  { name: "Bear's", ilvl: 2, slots: ARMOUR.concat(JEWEL), mod: 'life', min: 5, max: 12 },
  { name: "Wolf's", ilvl: 9, slots: ARMOUR.concat(JEWEL), mod: 'life', min: 13, max: 26 },
  { name: "Tiger's", ilvl: 17, slots: ARMOUR.concat(JEWEL), mod: 'life', min: 27, max: 45 },

  // Resistances
  { name: 'Shimmering', ilvl: 8, slots: ALL, mod: 'resAll', min: 5, max: 12 },
  { name: 'Prismatic', ilvl: 18, slots: ALL, mod: 'resAll', min: 13, max: 22 },
  { name: 'Crimson', ilvl: 3, slots: ALL, mod: 'resFire', min: 10, max: 25 },
  { name: 'Azure', ilvl: 3, slots: ALL, mod: 'resCold', min: 10, max: 25 },
  { name: 'Tangerine', ilvl: 3, slots: ALL, mod: 'resLight', min: 10, max: 25 },
  { name: 'Fungal', ilvl: 3, slots: ALL, mod: 'resPois', min: 10, max: 25 },

  // Caster modifiers
  { name: 'Hexing', ilvl: 14, slots: ['weapon', 'amulet'], mod: 'skills', min: 1, max: 1 },
  { name: 'Chromatic', ilvl: 20, slots: ['weapon', 'amulet'], mod: 'skills', min: 1, max: 2 },
  { name: 'Blazing', ilvl: 10, slots: ['weapon', 'amulet'], mod: 'skillFire', min: 1, max: 2 },
  { name: 'Rimed', ilvl: 10, slots: ['weapon', 'amulet'], mod: 'skillCold', min: 1, max: 2 },
  { name: 'Sparking', ilvl: 10, slots: ['weapon', 'amulet'], mod: 'skillLight', min: 1, max: 2 },
  { name: 'Vulpine', ilvl: 7, slots: ['weapon', 'ring', 'amulet', 'gloves'], mod: 'fcr', min: 10, max: 20 },
  { name: 'Arcane', ilvl: 16, slots: ['weapon', 'ring', 'amulet', 'gloves'], mod: 'fcr', min: 21, max: 30 },

  // Magic find
  { name: 'Felicitous', ilvl: 9, slots: ALL, mod: 'mf', min: 8, max: 18 },
  { name: 'Fortuitous', ilvl: 18, slots: ALL, mod: 'mf', min: 19, max: 35 },
];

export const SUFFIXES = [
  { name: 'of the Jackal', ilvl: 1, slots: ALL, mod: 'life', min: 3, max: 8 },
  { name: 'of the Fox', ilvl: 6, slots: ALL, mod: 'life', min: 9, max: 18 },
  { name: 'of the Wolf', ilvl: 14, slots: ALL, mod: 'life', min: 19, max: 34 },

  { name: 'of the Mind', ilvl: 2, slots: ALL, mod: 'ene', min: 2, max: 5 },
  { name: 'of Brilliance', ilvl: 11, slots: ALL, mod: 'ene', min: 6, max: 12 },
  { name: 'of Might', ilvl: 4, slots: ALL, mod: 'str', min: 2, max: 5 },
  { name: 'of Strength', ilvl: 12, slots: ALL, mod: 'str', min: 6, max: 12 },
  { name: 'of Dexterity', ilvl: 4, slots: ALL, mod: 'dex', min: 2, max: 5 },
  { name: 'of Skill', ilvl: 12, slots: ALL, mod: 'dex', min: 6, max: 12 },
  { name: 'of Vita', ilvl: 6, slots: ALL, mod: 'vit', min: 3, max: 7 },
  { name: 'of Life', ilvl: 15, slots: ALL, mod: 'vit', min: 8, max: 15 },

  { name: 'of Warding', ilvl: 10, slots: ALL, mod: 'resAll', min: 4, max: 9 },
  { name: 'of Flame', ilvl: 2, slots: WEAPON, mod: 'fire', min: 1, max: 3, spread: [3, 8] },
  { name: 'of Frost', ilvl: 2, slots: WEAPON, mod: 'cold', min: 1, max: 3, spread: [3, 7] },
  { name: 'of Shock', ilvl: 5, slots: WEAPON, mod: 'light', min: 1, max: 1, spread: [6, 20] },

  { name: 'of the Leech', ilvl: 12, slots: WEAPON.concat(JEWEL), mod: 'lifeSteal', min: 3, max: 6 },
  { name: 'of Thirst', ilvl: 16, slots: WEAPON.concat(JEWEL), mod: 'manaSteal', min: 3, max: 6 },
  { name: 'of Alacrity', ilvl: 8, slots: ['weapon', 'ring', 'amulet', 'gloves'], mod: 'fcr', min: 10, max: 20 },
  { name: 'of Balance', ilvl: 7, slots: ['boots', 'belt'], mod: 'frw', min: 10, max: 20 },
  { name: 'of Speed', ilvl: 15, slots: ['boots', 'belt'], mod: 'frw', min: 21, max: 30 },
  { name: 'of Blocking', ilvl: 8, slots: ['shield'], mod: 'block', min: 8, max: 15 },
  { name: 'of Luck', ilvl: 10, slots: ALL, mod: 'mf', min: 6, max: 14 },
  { name: 'of Greed', ilvl: 5, slots: ALL, mod: 'gf', min: 15, max: 40 },
  { name: 'of Stability', ilvl: 16, slots: ARMOUR, mod: 'dr', min: 1, max: 3 },
  { name: 'of Sorcery', ilvl: 18, slots: ['weapon', 'amulet'], mod: 'skills', min: 1, max: 1 },
];

// Affixes whose `mod` is an element name expand into a min and max damage pair.
export const ELEMENT_MODS = { fire: ['fireMin', 'fireMax'], cold: ['coldMin', 'coldMax'], light: ['lightMin', 'lightMax'], pois: ['poisMin', 'poisMax'] };

export function eligible(pool, slot, ilvl) {
  return pool.filter((a) => a.ilvl <= ilvl && a.slots.includes(slot));
}
