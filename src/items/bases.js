// Item base types.
//
// `tier` gates which bases an area can drop: a level 1 area rolls tier 1, the
// Catacombs roll tier 3. `w` and `h` are the inventory footprint in grid cells,
// and `kind` selects which icon generator draws it.

export const GRID_W = 10;
export const GRID_H = 4;

export const BASES = [
  // ------------------------------------------------------------- one-handed
  { id: 'dagger', name: 'Dagger', slot: 'weapon', kind: 'blade', w: 1, h: 2, tier: 1, dmg: [1, 4], req: { str: 0, dex: 0 } },
  { id: 'dirk', name: 'Dirk', slot: 'weapon', kind: 'blade', w: 1, h: 2, tier: 2, dmg: [3, 9], req: { str: 25, dex: 0 } },
  { id: 'kris', name: 'Kris', slot: 'weapon', kind: 'blade', w: 1, h: 3, tier: 3, dmg: [2, 11], req: { str: 45, dex: 0 } },
  { id: 'shortsword', name: 'Short Sword', slot: 'weapon', kind: 'sword', w: 1, h: 3, tier: 1, dmg: [2, 7], req: { str: 24, dex: 0 } },
  { id: 'sabre', name: 'Sabre', slot: 'weapon', kind: 'sword', w: 1, h: 3, tier: 2, dmg: [3, 8], req: { str: 25, dex: 25 } },
  { id: 'broadsword', name: 'Broad Sword', slot: 'weapon', kind: 'sword', w: 2, h: 3, tier: 3, dmg: [5, 12], req: { str: 48, dex: 0 } },

  // Axes trade attack speed for the top end of the damage range; maces sit in
  // between and hit hardest of the one-handers at the same requirement.
  { id: 'handaxe', name: 'Hand Axe', slot: 'weapon', kind: 'axe', w: 1, h: 3, tier: 1, dmg: [3, 6], req: { str: 20, dex: 0 } },
  { id: 'axe', name: 'Axe', slot: 'weapon', kind: 'axe', w: 2, h: 3, tier: 2, dmg: [4, 11], req: { str: 32, dex: 0 } },
  { id: 'doubleaxe', name: 'Double Axe', slot: 'weapon', kind: 'axe', w: 2, h: 3, tier: 3, dmg: [5, 13], req: { str: 43, dex: 0 } },
  { id: 'largeaxe', name: 'Large Axe', slot: 'weapon', kind: 'axe', w: 2, h: 4, tier: 2, dmg: [6, 13], req: { str: 35, dex: 0 }, twoHand: true },
  { id: 'battleaxe', name: 'Battle Axe', slot: 'weapon', kind: 'axe', w: 2, h: 4, tier: 3, dmg: [12, 32], req: { str: 54, dex: 0 }, twoHand: true },
  { id: 'club', name: 'Club', slot: 'weapon', kind: 'mace', w: 1, h: 3, tier: 1, dmg: [1, 6], req: { str: 0, dex: 0 } },
  { id: 'spikedclub', name: 'Spiked Club', slot: 'weapon', kind: 'mace', w: 1, h: 3, tier: 2, dmg: [5, 8], req: { str: 25, dex: 0 } },
  { id: 'mace', name: 'Mace', slot: 'weapon', kind: 'mace', w: 1, h: 3, tier: 2, dmg: [3, 10], req: { str: 27, dex: 0 }, flanged: true },
  { id: 'morningstar', name: 'Morning Star', slot: 'weapon', kind: 'mace', w: 1, h: 3, tier: 3, dmg: [7, 16], req: { str: 36, dex: 0 }, flanged: true },
  { id: 'warhammer', name: 'War Hammer', slot: 'weapon', kind: 'mace', w: 2, h: 3, tier: 3, dmg: [19, 29], req: { str: 53, dex: 0 }, flanged: true },

  // Sorceress-flavoured casting weapons: low damage, high modifier potential.
  { id: 'wand', name: 'Wand', slot: 'weapon', kind: 'wand', w: 1, h: 2, tier: 1, dmg: [2, 4], req: { str: 0, dex: 0 }, caster: true },
  { id: 'yewwand', name: 'Yew Wand', slot: 'weapon', kind: 'wand', w: 1, h: 2, tier: 2, dmg: [2, 8], req: { str: 0, dex: 0 }, caster: true },
  { id: 'bonewand', name: 'Bone Wand', slot: 'weapon', kind: 'wand', w: 1, h: 2, tier: 3, dmg: [3, 7], req: { str: 0, dex: 0 }, caster: true },
  { id: 'shortstaff', name: 'Short Staff', slot: 'weapon', kind: 'staff', w: 2, h: 3, tier: 1, dmg: [1, 5], req: { str: 0, dex: 0 }, twoHand: true, caster: true },
  { id: 'longstaff', name: 'Long Staff', slot: 'weapon', kind: 'staff', w: 2, h: 3, tier: 2, dmg: [2, 8], req: { str: 0, dex: 0 }, twoHand: true, caster: true },
  { id: 'warstaff', name: 'War Staff', slot: 'weapon', kind: 'staff', w: 2, h: 4, tier: 3, dmg: [8, 16], req: { str: 34, dex: 0 }, twoHand: true, caster: true },
  { id: 'eagleorb', name: 'Eagle Orb', slot: 'weapon', kind: 'orb', w: 2, h: 2, tier: 1, dmg: [2, 5], req: { str: 0, dex: 0 }, caster: true },
  { id: 'sacredglobe', name: 'Sacred Globe', slot: 'weapon', kind: 'orb', w: 2, h: 2, tier: 2, dmg: [3, 8], req: { str: 0, dex: 0 }, caster: true },
  { id: 'smokedsphere', name: 'Smoked Sphere', slot: 'weapon', kind: 'orb', w: 2, h: 2, tier: 3, dmg: [4, 10], req: { str: 0, dex: 0 }, caster: true },

  // ----------------------------------------------------------- body armour
  { id: 'quilted', name: 'Quilted Armour', slot: 'body', kind: 'body', w: 2, h: 3, tier: 1, def: [8, 11], req: { str: 12, dex: 0 } },
  { id: 'leatherarmor', name: 'Leather Armour', slot: 'body', kind: 'body', w: 2, h: 3, tier: 1, def: [14, 17], req: { str: 15, dex: 0 } },
  { id: 'studded', name: 'Studded Leather', slot: 'body', kind: 'body', w: 2, h: 3, tier: 2, def: [22, 27], req: { str: 20, dex: 0 } },
  { id: 'ringmail', name: 'Ring Mail', slot: 'body', kind: 'body', w: 2, h: 3, tier: 2, def: [26, 31], req: { str: 25, dex: 0 } },
  { id: 'chainmail', name: 'Chain Mail', slot: 'body', kind: 'body', w: 2, h: 3, tier: 3, def: [36, 43], req: { str: 32, dex: 0 } },
  { id: 'breastplate', name: 'Breast Plate', slot: 'body', kind: 'body', w: 2, h: 3, tier: 3, def: [48, 58], req: { str: 42, dex: 0 } },

  // ------------------------------------------------------------------ helms
  { id: 'cap', name: 'Cap', slot: 'head', kind: 'helm', w: 2, h: 2, tier: 1, def: [3, 5], req: { str: 0, dex: 0 } },
  { id: 'skullcap', name: 'Skull Cap', slot: 'head', kind: 'helm', w: 2, h: 2, tier: 1, def: [8, 11], req: { str: 15, dex: 0 } },
  { id: 'helm', name: 'Helm', slot: 'head', kind: 'helm', w: 2, h: 2, tier: 2, def: [15, 18], req: { str: 26, dex: 0 } },
  { id: 'fullhelm', name: 'Full Helm', slot: 'head', kind: 'helm', w: 2, h: 2, tier: 3, def: [23, 26], req: { str: 41, dex: 0 } },
  { id: 'mask', name: 'Mask', slot: 'head', kind: 'helm', w: 2, h: 2, tier: 3, def: [9, 27], req: { str: 23, dex: 0 } },

  // ---------------------------------------------------------------- shields
  { id: 'buckler', name: 'Buckler', slot: 'shield', kind: 'shield', w: 2, h: 2, tier: 1, def: [4, 6], block: 20, req: { str: 12, dex: 0 } },
  { id: 'smallshield', name: 'Small Shield', slot: 'shield', kind: 'shield', w: 2, h: 2, tier: 1, def: [8, 12], block: 22, req: { str: 22, dex: 0 } },
  { id: 'largeshield', name: 'Large Shield', slot: 'shield', kind: 'shield', w: 2, h: 3, tier: 2, def: [12, 16], block: 24, req: { str: 34, dex: 0 } },
  { id: 'kiteshield', name: 'Kite Shield', slot: 'shield', kind: 'shield', w: 2, h: 3, tier: 3, def: [16, 20], block: 26, req: { str: 47, dex: 0 } },
  { id: 'boneshield', name: 'Bone Shield', slot: 'shield', kind: 'shield', w: 2, h: 3, tier: 3, def: [10, 30], block: 24, req: { str: 25, dex: 0 } },

  // ----------------------------------------------------------------- gloves
  { id: 'leathergloves', name: 'Leather Gloves', slot: 'gloves', kind: 'glove', w: 2, h: 2, tier: 1, def: [2, 3], req: { str: 0, dex: 0 } },
  { id: 'heavygloves', name: 'Heavy Gloves', slot: 'gloves', kind: 'glove', w: 2, h: 2, tier: 2, def: [5, 8], req: { str: 0, dex: 0 } },
  { id: 'chaingloves', name: 'Chain Gloves', slot: 'gloves', kind: 'glove', w: 2, h: 2, tier: 3, def: [10, 12], req: { str: 25, dex: 0 } },

  // ------------------------------------------------------------------ boots
  { id: 'boots', name: 'Boots', slot: 'boots', kind: 'boot', w: 2, h: 2, tier: 1, def: [2, 3], req: { str: 0, dex: 0 } },
  { id: 'heavyboots', name: 'Heavy Boots', slot: 'boots', kind: 'boot', w: 2, h: 2, tier: 2, def: [5, 8], req: { str: 18, dex: 0 } },
  { id: 'chainboots', name: 'Chain Boots', slot: 'boots', kind: 'boot', w: 2, h: 2, tier: 3, def: [10, 12], req: { str: 30, dex: 0 } },

  // ------------------------------------------------------------------ belts
  { id: 'sash', name: 'Sash', slot: 'belt', kind: 'belt', w: 2, h: 1, tier: 1, def: [2, 2], req: { str: 0, dex: 0 } },
  { id: 'lightbelt', name: 'Light Belt', slot: 'belt', kind: 'belt', w: 2, h: 1, tier: 1, def: [3, 3], req: { str: 0, dex: 0 } },
  { id: 'belt', name: 'Belt', slot: 'belt', kind: 'belt', w: 2, h: 1, tier: 2, def: [5, 6], req: { str: 25, dex: 0 } },
  { id: 'heavybelt', name: 'Heavy Belt', slot: 'belt', kind: 'belt', w: 2, h: 1, tier: 3, def: [6, 9], req: { str: 45, dex: 0 } },

  // -------------------------------------------------------- rings, amulets
  { id: 'ring', name: 'Ring', slot: 'ring', kind: 'ring', w: 1, h: 1, tier: 1, req: { str: 0, dex: 0 }, jewel: true },
  { id: 'amulet', name: 'Amulet', slot: 'amulet', kind: 'amulet', w: 1, h: 1, tier: 1, req: { str: 0, dex: 0 }, jewel: true },
];

export const BASE_BY_ID = {};
for (const b of BASES) BASE_BY_ID[b.id] = b;

// Potions live outside the affix system: they are consumed, never modified.
export const POTIONS = [
  { id: 'hp1', name: 'Minor Healing Potion', kind: 'potion', potion: 'life', amount: 45, tier: 1, colour: '#c02a2a', price: 30 },
  { id: 'hp2', name: 'Light Healing Potion', kind: 'potion', potion: 'life', amount: 90, tier: 2, colour: '#d03030', price: 65 },
  { id: 'hp3', name: 'Healing Potion', kind: 'potion', potion: 'life', amount: 160, tier: 3, colour: '#e03838', price: 125 },
  { id: 'mp1', name: 'Minor Mana Potion', kind: 'potion', potion: 'mana', amount: 30, tier: 1, colour: '#2a3ac0', price: 35 },
  { id: 'mp2', name: 'Light Mana Potion', kind: 'potion', potion: 'mana', amount: 60, tier: 2, colour: '#3048d0', price: 75 },
  { id: 'mp3', name: 'Mana Potion', kind: 'potion', potion: 'mana', amount: 110, tier: 3, colour: '#3858e0', price: 145 },
];

export const POTION_BY_ID = {};
for (const p of POTIONS) POTION_BY_ID[p.id] = p;

// Which base tier an area of a given level can roll.
export function tierForAreaLevel(alvl) {
  if (alvl >= 8) return 3;
  if (alvl >= 4) return 2;
  return 1;
}
