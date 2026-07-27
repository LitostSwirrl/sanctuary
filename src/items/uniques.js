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
];

export const UNIQUES_BY_BASE = {};
for (const u of UNIQUES) {
  (UNIQUES_BY_BASE[u.base] = UNIQUES_BY_BASE[u.base] || []).push(u);
}
