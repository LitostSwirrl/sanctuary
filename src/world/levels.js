// Every area in the world, in the order the player walks them. Act 1's eight
// are all that exist so far, plus the town the caravan arrives at; the rest of
// the desert and the three acts after it arrive area by area.
//
// `act` places an area in the five-act world and is the authority on that:
// `AREA_BY_ID[id].act` answers it everywhere, the generated level carries the
// same number, and the music picks its mood from it. `ambient` is the colour the
// light buffer is filled with before any light source is added, so it sets how
// dark an area feels before the player's torch does anything. Outdoors is dim
// dusk; the Catacombs are nearly black.

export const AREAS = [
  {
    id: 'town',
    act: 1,
    name: 'Rogue Encampment',
    kind: 'town',
    terrain: 'cobble',
    wallTerrain: 'cobble',
    areaLevel: 0,
    ambient: [96, 86, 82],
    size: 44,
    waypoint: true,
    monsters: [],
    exits: [{ to: 'moor', side: 's' }],
  },
  {
    id: 'moor',
    act: 1,
    name: 'Blood Moor',
    kind: 'outdoor',
    terrain: 'grass',
    pathTerrain: 'dirt',
    wallTerrain: 'grass',
    areaLevel: 1,
    ambient: [62, 60, 76],
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
    act: 1,
    name: 'Den of Evil',
    kind: 'dungeon',
    terrain: 'cave',
    wallTerrain: 'cave',
    areaLevel: 3,
    ambient: [22, 20, 26],
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
    act: 1,
    name: 'Cold Plains',
    kind: 'outdoor',
    terrain: 'grass',
    pathTerrain: 'dirt',
    wallTerrain: 'grass',
    areaLevel: 5,
    ambient: [68, 70, 86],
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
      { to: 'darkwood', side: 's' },
    ],
  },
  {
    id: 'burial',
    act: 1,
    name: 'Burial Grounds',
    kind: 'outdoor',
    terrain: 'dirt',
    pathTerrain: 'cobble',
    wallTerrain: 'dirt',
    areaLevel: 7,
    ambient: [46, 44, 60],
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
    // A side branch and nothing more: Blood Raven is the whole reason to come
    // here, and the road to the monastery runs through the Dark Wood now.
    exits: [{ to: 'coldplains', side: 'w' }],
  },
  {
    id: 'darkwood',
    act: 1,
    name: 'Dark Wood',
    kind: 'outdoor',
    terrain: 'grass',
    pathTerrain: 'dirt',
    wallTerrain: 'grass',
    areaLevel: 8,
    // Dim enough to feel closed in, still light enough to be a field rather
    // than a dungeon: the music picks its mood from this average.
    ambient: [56, 62, 70],
    size: 74,
    waypoint: true,
    // Three trees to every rock is what makes a wood read as dense; the track
    // the generator carves is what keeps it walkable anyway.
    props: ['tree', 'tree', 'tree', 'rock', 'bones'],
    propDensity: 0.09,
    packs: 12,
    monsters: [
      { id: 'devilkin', weight: 3, packMin: 4, packMax: 7 },
      { id: 'quillrat', weight: 2, packMin: 3, packMax: 5 },
      { id: 'ghoul', weight: 2, packMin: 2, packMax: 4 },
      { id: 'shaman', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [
      { to: 'coldplains', side: 'n' },
      { to: 'barracks', side: 's', kind: 'stairs' },
    ],
  },
  {
    id: 'barracks',
    act: 1,
    name: 'Barracks',
    kind: 'dungeon',
    terrain: 'crypt',
    wallTerrain: 'crypt',
    areaLevel: 9,
    ambient: [24, 22, 28],
    size: 58,
    depth: 3,
    props: ['column', 'crate', 'barrel', 'bones'],
    packs: 13,
    quest: 'smith',
    boss: 'smith',
    monsters: [
      { id: 'skeleton', weight: 3, packMin: 4, packMax: 6 },
      { id: 'devilkin', weight: 2, packMin: 3, packMax: 5 },
      { id: 'ghoul', weight: 2, packMin: 2, packMax: 3 },
    ],
    exits: [
      { to: 'darkwood', kind: 'stairs' },
      { to: 'catacombs', kind: 'stairs' },
    ],
  },
  {
    id: 'catacombs',
    act: 1,
    name: 'Catacombs',
    kind: 'dungeon',
    terrain: 'crypt',
    wallTerrain: 'crypt',
    areaLevel: 11,
    ambient: [18, 16, 24],
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
    exits: [{ to: 'barracks', kind: 'stairs' }],
  },

  // PHASE 5 REPLACES THIS. A placeholder so Warriv's caravan has somewhere to
  // arrive: town ground, safe, a waypoint to light, and nothing else. The real
  // Lut Gholein brings the desert terrain, its five townsfolk, the sewer stairs
  // and the road to the Rocky Waste with it.
  {
    id: 'lutgholein',
    act: 2,
    name: 'Lut Gholein',
    kind: 'town',
    terrain: 'cobble',
    wallTerrain: 'cobble',
    areaLevel: 0,
    ambient: [104, 94, 78],
    size: 40,
    waypoint: true,
    monsters: [],
    exits: [],
  },
];

export const AREA_BY_ID = {};
for (const a of AREAS) AREA_BY_ID[a.id] = a;

// The five acts. `key` is the music's prefix, so an act's three moods are
// `${key}.town`, `${key}.field` and `${key}.dungeon`. `town` names the area a
// caravan, a ship or a portal arrives at -- act 1's is the encampment, act 2's
// is the placeholder above, and the last three are waiting for their areas.
//
// `travel` is the passage onward: which townsman sells it, and which quest flag
// has to be set before he will. Warriv takes the caravan east, Meshif sails
// twice, Tyrael opens the portal. Act 5 has no `travel` because there is nowhere
// further to go -- Baal is the end of the road, not a gate to the next act.
export const ACTS = [
  { num: 1, key: 'a1', name: 'Rogue Encampment', town: 'town', travel: { npc: 'warriv', gateQuest: 'andariel' } },
  { num: 2, key: 'a2', name: 'Lut Gholein', town: 'lutgholein', travel: { npc: 'meshif', gateQuest: 'duriel' } },
  { num: 3, key: 'a3', name: 'Kurast Docks', town: 'kurast', travel: { npc: 'meshif', gateQuest: 'mephisto' } },
  { num: 4, key: 'a4', name: 'Pandemonium Fortress', town: 'fortress', travel: { npc: 'tyrael', gateQuest: 'diablo' } },
  { num: 5, key: 'a5', name: 'Harrogath', town: 'harrogath' },
];

// Where a waypoint, once touched, can take the player. A flat list on purpose:
// the panel is what groups it by act, reading `AREA_BY_ID[id].act`. A town's
// waypoint is lit by arriving there, which is why Lut Gholein's sits in the
// list before any of its own areas do.
export const WAYPOINT_AREAS = ['town', 'coldplains', 'darkwood', 'catacombs', 'lutgholein'];
