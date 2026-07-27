// The six areas of the slice, in the order the player walks them.
//
// `ambient` is the colour the light buffer is filled with before any light
// source is added, so it sets how dark an area feels before the player's torch
// does anything. Outdoors is dim dusk; the Catacombs are nearly black.

export const AREAS = [
  {
    id: 'town',
    name: 'Rogue Encampment',
    kind: 'town',
    terrain: 'cobble',
    wallTerrain: 'cobble',
    areaLevel: 0,
    ambient: [118, 108, 104],
    size: 44,
    waypoint: true,
    monsters: [],
    exits: [{ to: 'moor', side: 's' }],
  },
  {
    id: 'moor',
    name: 'Blood Moor',
    kind: 'outdoor',
    terrain: 'grass',
    pathTerrain: 'dirt',
    wallTerrain: 'grass',
    areaLevel: 1,
    ambient: [86, 84, 96],
    size: 72,
    props: ['tree', 'tree', 'rock', 'bones'],
    propDensity: 0.06,
    packs: 9,
    monsters: [
      { id: 'fallen', weight: 3, packMin: 3, packMax: 6 },
      { id: 'zombie', weight: 2, packMin: 2, packMax: 3 },
    ],
    exits: [
      { to: 'town', side: 'n' },
      { to: 'den', side: 'e', kind: 'stairs' },
      { to: 'coldplains', side: 's' },
    ],
  },
  {
    id: 'den',
    name: 'Den of Evil',
    kind: 'dungeon',
    terrain: 'cave',
    wallTerrain: 'cave',
    areaLevel: 3,
    ambient: [30, 27, 33],
    size: 54,
    depth: 3,
    props: ['rock', 'bones', 'barrel'],
    packs: 10,
    quest: 'den',
    boss: 'corpsefire',
    monsters: [
      { id: 'fallen', weight: 3, packMin: 4, packMax: 7 },
      { id: 'shaman', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [{ to: 'moor', kind: 'stairs' }],
  },
  {
    id: 'coldplains',
    name: 'Cold Plains',
    kind: 'outdoor',
    terrain: 'grass',
    pathTerrain: 'dirt',
    wallTerrain: 'grass',
    areaLevel: 5,
    ambient: [92, 94, 106],
    size: 76,
    waypoint: true,
    props: ['tree', 'rock', 'rock', 'bones'],
    propDensity: 0.05,
    packs: 12,
    monsters: [
      { id: 'devilkin', weight: 3, packMin: 4, packMax: 7 },
      { id: 'shaman', weight: 1, packMin: 1, packMax: 2 },
      { id: 'quillrat', weight: 2, packMin: 3, packMax: 5 },
    ],
    exits: [
      { to: 'moor', side: 'n' },
      { to: 'burial', side: 'e' },
    ],
  },
  {
    id: 'burial',
    name: 'Burial Grounds',
    kind: 'outdoor',
    terrain: 'dirt',
    pathTerrain: 'cobble',
    wallTerrain: 'dirt',
    areaLevel: 7,
    ambient: [62, 60, 76],
    size: 66,
    props: ['gravestone', 'gravestone', 'bones', 'rock', 'tree'],
    propDensity: 0.08,
    packs: 11,
    quest: 'raven',
    boss: 'bloodraven',
    monsters: [
      { id: 'skeleton', weight: 3, packMin: 3, packMax: 6 },
      { id: 'zombie', weight: 2, packMin: 2, packMax: 4 },
      { id: 'ghoul', weight: 1, packMin: 2, packMax: 3 },
    ],
    exits: [
      { to: 'coldplains', side: 'w' },
      { to: 'catacombs', side: 'e', kind: 'stairs' },
    ],
  },
  {
    id: 'catacombs',
    name: 'Catacombs',
    kind: 'dungeon',
    terrain: 'crypt',
    wallTerrain: 'crypt',
    areaLevel: 10,
    ambient: [24, 22, 32],
    size: 62,
    depth: 4,
    waypoint: true,
    props: ['column', 'bones', 'gravestone'],
    packs: 14,
    quest: 'andariel',
    boss: 'andariel',
    monsters: [
      { id: 'skeleton', weight: 3, packMin: 4, packMax: 6 },
      { id: 'devilkin', weight: 2, packMin: 3, packMax: 5 },
      { id: 'ghoul', weight: 2, packMin: 2, packMax: 4 },
    ],
    exits: [{ to: 'burial', kind: 'stairs' }],
  },
];

export const AREA_BY_ID = {};
for (const a of AREAS) AREA_BY_ID[a.id] = a;

// Where a waypoint, once touched, can take the player.
export const WAYPOINT_AREAS = ['town', 'coldplains', 'catacombs'];
