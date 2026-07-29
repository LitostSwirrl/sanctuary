// Fixed-roll chase items.
//
// The names are the originals, as homage. The numbers are tuned for the range
// this slice actually covers — a level cap of 30 across six areas — rather than
// copied from the source game, where they are balanced against a hundred hours
// and five acts.
//
// `base` must roll first: a unique only appears when its base type would have
// dropped anyway, which is what keeps a Full Helm unique out of the Blood Moor.

export const UNIQUES = [
  {
    name: 'Nagelring', base: 'ring', ilvl: 4,
    mods: { mf: 25, ar: 60, dr: 1 },
    flavour: 'A ring of tarnished silver.',
  },
  {
    name: 'Manald Heal', base: 'ring', ilvl: 8,
    mods: { manaSteal: 6, mana: 20, life: 12 },
    flavour: 'Warm to the touch.',
  },
  {
    name: 'The Eye of Etlich', base: 'amulet', ilvl: 6,
    mods: { lifeSteal: 5, skills: 1, resAll: 8 },
    flavour: 'It watches back.',
  },
  {
    name: 'Nokozan Relic', base: 'amulet', ilvl: 5,
    mods: { resFire: 45, life: 18, fcr: 10 },
    flavour: 'Scorched but unbroken.',
  },
  {
    name: 'Tarnhelm', base: 'skullcap', ilvl: 7,
    mods: { skills: 1, mf: 40, gf: 60 },
    flavour: 'Whoever wears it is barely there at all.',
  },
  {
    name: "Biggin's Bonnet", base: 'cap', ilvl: 3,
    mods: { ed: 35, ar: 50, life: 15, mana: 15 },
    flavour: 'It fit someone, once.',
  },
  {
    name: 'Greyform', base: 'quilted', ilvl: 4,
    mods: { resCold: 25, lifeSteal: 4, def: 20, dex: 5 },
    flavour: 'Grey as a winter morning.',
  },
  {
    name: 'Twitchthroe', base: 'studded', ilvl: 9,
    mods: { str: 10, dex: 10, block: 25, ias: 20, defPct: 25 },
    flavour: 'The wearer never quite stands still.',
  },
  {
    name: 'Hotspur', base: 'boots', ilvl: 5,
    mods: { resFire: 45, life: 15, fireMin: 3, fireMax: 6 },
    flavour: 'The ground smokes underfoot.',
  },
  {
    name: 'Goldwrap', base: 'belt', ilvl: 10,
    mods: { gf: 80, ias: 10, def: 25 },
    flavour: 'Heavier than it looks.',
  },
  {
    name: 'Bloodfist', base: 'heavygloves', ilvl: 8,
    mods: { life: 40, ias: 10, def: 10 },
    flavour: 'Stained through and through.',
  },
  {
    name: 'Bane Ash', base: 'shortstaff', ilvl: 6,
    mods: { skillFire: 2, fireMin: 6, fireMax: 12, mana: 25, resFire: 20 },
    flavour: 'Cut from something that burned a long time.',
  },
  {
    name: 'The Salamander', base: 'longstaff', ilvl: 12,
    mods: { skillFire: 3, fireMin: 12, fireMax: 24, resFire: 30, fcr: 10 },
    flavour: 'It has never once been cold.',
  },
  {
    name: 'Pelta Lunata', base: 'buckler', ilvl: 6,
    mods: { block: 30, defPct: 40, vit: 10, dr: 2 },
    flavour: 'A crescent of beaten steel.',
  },
  {
    name: 'Wall of the Eyeless', base: 'boneshield', ilvl: 14,
    mods: { manaSteal: 8, mana: 30, defPct: 45, resPois: 20 },
    flavour: 'Built from those who stopped looking.',
  },
  {
    name: 'Frostburn', base: 'chaingloves', ilvl: 16,
    mods: { manaPct: 40, skillCold: 1, coldMin: 4, coldMax: 10, fcr: 10 },
    flavour: 'The fingers ache in any weather.',
  },

  // ---------------------------------------------------------- the chase tier
  // The endgame names, kept to their signature mod shapes (per the Arreat
  // Summit listings) with numbers cut down to this slice's level 30 world.
  // Bases are the nearest this slice carries, same licence as Frostburn
  // above. The try-out loadout in main.js equips these; the deepest floors
  // can also drop the lower-gated ones.
  {
    name: 'The Oculus', base: 'smokedsphere', ilvl: 15,
    mods: { skills: 3, fcr: 30, resAll: 20, mf: 50 },
    flavour: 'It has seen every way this ends.',
  },
  {
    name: 'Lidless Wall', base: 'kiteshield', ilvl: 14,
    mods: { skills: 1, fcr: 20, ene: 10, manaPct: 10, mana: 30 },
    flavour: 'It does not blink.',
  },
  {
    name: 'Harlequin Crest', base: 'fullhelm', ilvl: 18,
    mods: { skills: 2, life: 45, mana: 45, dr: 10, mf: 50 },
    flavour: 'The jester wore it better.',
  },
  {
    name: 'Skin of the Vipermagi', base: 'breastplate', ilvl: 12,
    mods: { skills: 1, fcr: 30, resAll: 30, defPct: 120 },
    flavour: 'Still shedding.',
  },
  {
    name: 'Magefist', base: 'chaingloves', ilvl: 10,
    mods: { skillFire: 1, fcr: 20, manaPct: 20, fireMin: 1, fireMax: 6 },
    flavour: 'Warm palms, quick words.',
  },
  {
    name: 'War Traveler', base: 'chainboots', ilvl: 14,
    mods: { frw: 25, mf: 50, str: 10, vit: 10 },
    flavour: 'They have walked farther than their owners.',
  },
  {
    name: 'Arachnid Mesh', base: 'heavybelt', ilvl: 18,
    mods: { skills: 1, fcr: 20, manaPct: 5, defPct: 100 },
    flavour: 'Spun, not woven.',
  },
  {
    name: 'Stone of Jordan', base: 'ring', ilvl: 15,
    mods: { skills: 1, manaPct: 25, mana: 20, lightMin: 1, lightMax: 12 },
    flavour: 'Worth more than the kingdom that minted it.',
  },
  {
    name: "Mara's Kaleidoscope", base: 'amulet', ilvl: 16,
    mods: { skills: 2, resAll: 25, str: 5, dex: 5, vit: 5, ene: 5 },
    flavour: 'Every turn shows a kinder world.',
  },
  {
    name: "Schaefer's Hammer", base: 'warhammer', ilvl: 18,
    mods: { ed: 130, maxDmg: 55, lightMin: 40, lightMax: 110, ias: 20, resLight: 40 },
    flavour: 'The storm broke against it.',
  },
  {
    name: 'Stormshield', base: 'kiteshield', ilvl: 18,
    mods: { dr: 12, str: 20, block: 25, resCold: 40, resLight: 25 },
    flavour: 'Unmoved since the day it was hung.',
  },
  {
    name: 'Shaftstop', base: 'breastplate', ilvl: 14,
    mods: { defPct: 200, dr: 15, life: 60 },
    flavour: 'The arrows gave up first.',
  },
  {
    name: 'Steelrend', base: 'chaingloves', ilvl: 18,
    mods: { ed: 45, str: 18, def: 60 },
    flavour: 'Plate parts like cloth.',
  },
  {
    name: 'String of Ears', base: 'heavybelt', ilvl: 14,
    mods: { lifeSteal: 8, dr: 12, defPct: 160 },
    flavour: 'Each one heard its last.',
  },
  {
    name: "Bul-Kathos' Wedding Band", base: 'ring', ilvl: 15,
    mods: { skills: 1, life: 40, lifeSteal: 5 },
    flavour: 'The ancestors keep their vows.',
  },
  {
    name: "Highlord's Wrath", base: 'amulet', ilvl: 16,
    mods: { skills: 1, ias: 20, resLight: 35, lightMin: 1, lightMax: 30 },
    flavour: 'It remembers the war in the clouds.',
  },
];

export const UNIQUE_BY_NAME = {};
for (const u of UNIQUES) UNIQUE_BY_NAME[u.name] = u;

export const UNIQUES_BY_BASE = {};
for (const u of UNIQUES) {
  (UNIQUES_BY_BASE[u.base] = UNIQUES_BY_BASE[u.base] || []).push(u);
}
