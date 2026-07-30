// Every area in the world, in the order the player walks them. All five acts
// stand complete: the encampment to the Throne of Destruction, thirty-five
// areas, with the Pandemonium Fortress and Harrogath as their acts' towns.
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
    // What the townsfolk stand among. `populateTown` places the people relative
    // to the town centre; these are their stations, in the same frame: a tent
    // to stand in front of, an anvil for the smith, a wagon for the caravan.
    furniture: [
      ['tent', -4, -8], ['crate', -6, -7], ['barrel', -2, -7],          // Akara
      ['anvil', 5, -7], ['tent', 3, -8], ['barrel', 6, -6],             // Charsi
      ['tent', 8, 0], ['crate', 8, 3], ['crate', 7, 4],                 // Gheed
      ['tent', -8, 0], ['barrel', -8, 3],                               // Cain
      ['campfire', -2, 8], ['crate', -3, 9],                            // Kashya
      ['wagon', 4, 8], ['barrel', 5, 10], ['crate', 3, 10],             // Warriv
      ['campfire', 0, 0],                                               // the middle of camp
    ],
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

  // ------------------------------------------------------------------ act 2
  {
    id: 'lutgholein',
    act: 2,
    name: 'Lut Gholein',
    kind: 'town',
    terrain: 'sandstone',
    wallTerrain: 'sandstone',
    areaLevel: 0,
    ambient: [104, 94, 78],
    size: 40,
    waypoint: true,
    monsters: [],
    // A harbour town, not a camp: crates and urns off the docks, an anvil for
    // Fara, palms in the market square, and the sewer grate under the east wall.
    furniture: [
      ['anvil', -4, -7], ['barrel', -6, -6], ['crate', -2, -7],         // Fara
      ['urn', 5, -7], ['crate', 4, -8], ['urn', 6, -5],                 // Drognan
      ['tent', 8, 0], ['crate', 8, 3], ['barrel', 7, 4],                // Elzix
      ['urn', -8, 0], ['crate', -8, 3],                                 // Cain
      ['wagon', 4, 8], ['crate', 5, 10], ['crate', 3, 10],              // Meshif
      ['palm', 0, -3], ['palm', -2, 10], ['obelisk', 0, 0],             // the square
    ],
    exits: [
      { to: 'rockywaste', side: 's' },
      { to: 'sewers', side: 'e', kind: 'stairs' },
    ],
  },
  {
    id: 'sewers',
    act: 2,
    name: 'Sewers',
    kind: 'dungeon',
    terrain: 'sandstone',
    wallTerrain: 'sandstone',
    areaLevel: 13,
    ambient: [24, 24, 26],
    size: 54,
    depth: 2,
    props: ['urn', 'barrel', 'bones'],
    packs: 11,
    quest: 'radament',
    boss: 'radament',
    monsters: [
      { id: 'mummy', weight: 3, packMin: 2, packMax: 4 },
      { id: 'skeleton', weight: 2, packMin: 3, packMax: 5 },
      { id: 'greatermummy', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [{ to: 'lutgholein', kind: 'stairs' }],
  },
  {
    id: 'rockywaste',
    act: 2,
    name: 'Rocky Waste',
    kind: 'outdoor',
    terrain: 'sand',
    pathTerrain: 'dirt',
    wallTerrain: 'sand',
    areaLevel: 13,
    ambient: [88, 78, 62],
    size: 74,
    props: ['rock', 'rock', 'cactus', 'bones'],
    propDensity: 0.05,
    packs: 11,
    monsters: [
      { id: 'sandraider', weight: 3, packMin: 3, packMax: 5 },
      { id: 'vulturedemon', weight: 2, packMin: 2, packMax: 4 },
      { id: 'skeleton', weight: 2, packMin: 3, packMax: 5 },
    ],
    exits: [
      { to: 'lutgholein', side: 'n' },
      { to: 'dryhills', side: 's' },
    ],
  },
  {
    id: 'dryhills',
    act: 2,
    name: 'Dry Hills',
    kind: 'outdoor',
    terrain: 'sand',
    pathTerrain: 'dirt',
    wallTerrain: 'sand',
    areaLevel: 15,
    ambient: [86, 76, 60],
    size: 76,
    waypoint: true,
    props: ['rock', 'cactus', 'cactus', 'bones', 'obelisk'],
    propDensity: 0.05,
    packs: 12,
    monsters: [
      { id: 'sandraider', weight: 3, packMin: 3, packMax: 5 },
      { id: 'vulturedemon', weight: 2, packMin: 2, packMax: 4 },
      { id: 'sandmaggot', weight: 2, packMin: 2, packMax: 4 },
    ],
    exits: [
      { to: 'rockywaste', side: 'n' },
      { to: 'faroasis', side: 's' },
    ],
  },
  {
    id: 'faroasis',
    act: 2,
    name: 'Far Oasis',
    kind: 'outdoor',
    terrain: 'sand',
    pathTerrain: 'grass',
    wallTerrain: 'sand',
    areaLevel: 16,
    ambient: [84, 80, 62],
    size: 76,
    // The one green place in the desert, which is why the maggots nest here.
    props: ['palm', 'palm', 'palm', 'rock', 'cactus'],
    propDensity: 0.07,
    packs: 12,
    monsters: [
      { id: 'sandmaggot', weight: 3, packMin: 2, packMax: 4 },
      { id: 'scarab', weight: 2, packMin: 3, packMax: 6 },
      { id: 'vulturedemon', weight: 2, packMin: 2, packMax: 4 },
    ],
    exits: [
      { to: 'dryhills', side: 'n' },
      { to: 'lostcity', side: 's' },
    ],
  },
  {
    id: 'lostcity',
    act: 2,
    name: 'Lost City',
    kind: 'outdoor',
    terrain: 'sand',
    pathTerrain: 'cobble',
    wallTerrain: 'sandstone',
    areaLevel: 17,
    ambient: [78, 70, 58],
    size: 74,
    waypoint: true,
    props: ['obelisk', 'column', 'urn', 'rock', 'bones'],
    propDensity: 0.07,
    packs: 13,
    monsters: [
      { id: 'sandraider', weight: 3, packMin: 3, packMax: 6 },
      { id: 'scarab', weight: 2, packMin: 3, packMax: 6 },
      { id: 'mummy', weight: 2, packMin: 2, packMax: 4 },
    ],
    exits: [
      { to: 'faroasis', side: 'n' },
      { to: 'vipertemple', side: 's', kind: 'stairs' },
    ],
  },
  {
    id: 'vipertemple',
    act: 2,
    name: 'Claw Viper Temple',
    kind: 'dungeon',
    terrain: 'sandstone',
    wallTerrain: 'sandstone',
    areaLevel: 18,
    ambient: [22, 20, 24],
    size: 56,
    depth: 2,
    props: ['column', 'urn', 'sarcophagus', 'bones'],
    packs: 13,
    monsters: [
      { id: 'clawviper', weight: 3, packMin: 3, packMax: 5 },
      { id: 'mummy', weight: 2, packMin: 2, packMax: 4 },
      { id: 'greatermummy', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [
      { to: 'lostcity', kind: 'stairs' },
      { to: 'talrasha', kind: 'stairs' },
    ],
  },
  {
    id: 'talrasha',
    act: 2,
    name: "Tal Rasha's Tomb",
    kind: 'dungeon',
    terrain: 'sandstone',
    wallTerrain: 'sandstone',
    areaLevel: 19,
    ambient: [20, 18, 22],
    size: 60,
    depth: 3,
    props: ['sarcophagus', 'urn', 'column', 'bones'],
    packs: 14,
    quest: 'duriel',
    boss: 'duriel',
    monsters: [
      { id: 'mummy', weight: 3, packMin: 2, packMax: 4 },
      { id: 'greatermummy', weight: 1, packMin: 1, packMax: 2 },
      { id: 'skeleton', weight: 2, packMin: 3, packMax: 6 },
      { id: 'clawviper', weight: 2, packMin: 2, packMax: 4 },
    ],
    exits: [{ to: 'vipertemple', kind: 'stairs' }],
  },

  // ------------------------------------------------------------------ act 3
  {
    id: 'kurast',
    act: 3,
    name: 'Kurast Docks',
    kind: 'town',
    terrain: 'temple',
    wallTerrain: 'temple',
    areaLevel: 0,
    ambient: [82, 88, 76],
    size: 40,
    waypoint: true,
    monsters: [],
    // Docks hacked out of the jungle: mossy stone underfoot, ferns pushing
    // through it, and Meshif's berth where Warriv's wagon would stand.
    furniture: [
      ['tent', -4, -8], ['urn', -6, -7], ['fern', -2, -7],              // Ormus
      ['anvil', 5, -7], ['crate', 3, -8], ['barrel', 6, -6],            // Hratli
      ['tent', 8, 0], ['barrel', 8, 3], ['crate', 7, 4],                // Alkor
      ['urn', -8, 0], ['fern', -8, 3],                                  // Cain
      ['wagon', 4, 8], ['crate', 5, 10], ['barrel', 3, 10],             // Meshif
      ['fern', 0, -3], ['idol', 0, 0], ['fern', -2, 10],                // the docks
    ],
    exits: [{ to: 'spiderforest', side: 's' }],
  },
  {
    id: 'spiderforest',
    act: 3,
    name: 'Spider Forest',
    kind: 'outdoor',
    terrain: 'jungle',
    pathTerrain: 'dirt',
    wallTerrain: 'jungle',
    areaLevel: 21,
    ambient: [58, 66, 56],
    size: 76,
    props: ['tree', 'tree', 'fern', 'fern', 'vine'],
    propDensity: 0.08,
    packs: 12,
    monsters: [
      { id: 'giantspider', weight: 3, packMin: 2, packMax: 4 },
      { id: 'flayer', weight: 2, packMin: 4, packMax: 7 },
      { id: 'thornhulk', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [
      { to: 'kurast', side: 'n' },
      { to: 'greatmarsh', side: 's' },
    ],
  },
  {
    id: 'greatmarsh',
    act: 3,
    name: 'Great Marsh',
    kind: 'outdoor',
    terrain: 'jungle',
    pathTerrain: 'dirt',
    wallTerrain: 'jungle',
    areaLevel: 22,
    ambient: [56, 64, 58],
    size: 78,
    waypoint: true,
    props: ['fern', 'fern', 'vine', 'tree', 'bones'],
    propDensity: 0.07,
    packs: 13,
    monsters: [
      { id: 'thornhulk', weight: 2, packMin: 1, packMax: 3 },
      { id: 'flayer', weight: 3, packMin: 4, packMax: 7 },
      { id: 'flayershaman', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [
      { to: 'spiderforest', side: 'n' },
      { to: 'flayerjungle', side: 's' },
    ],
  },
  {
    id: 'flayerjungle',
    act: 3,
    name: 'Flayer Jungle',
    kind: 'outdoor',
    terrain: 'jungle',
    pathTerrain: 'dirt',
    wallTerrain: 'jungle',
    areaLevel: 23,
    ambient: [54, 62, 54],
    size: 78,
    props: ['tree', 'fern', 'fern', 'vine', 'idol'],
    propDensity: 0.08,
    packs: 14,
    monsters: [
      { id: 'flayer', weight: 4, packMin: 5, packMax: 8 },
      { id: 'flayershaman', weight: 1, packMin: 1, packMax: 2 },
      { id: 'giantspider', weight: 2, packMin: 2, packMax: 4 },
    ],
    exits: [
      { to: 'greatmarsh', side: 'n' },
      { to: 'bazaar', side: 's' },
    ],
  },
  {
    id: 'bazaar',
    act: 3,
    name: 'Kurast Bazaar',
    kind: 'outdoor',
    terrain: 'temple',
    pathTerrain: 'cobble',
    wallTerrain: 'temple',
    areaLevel: 24,
    ambient: [60, 64, 56],
    size: 74,
    waypoint: true,
    props: ['column', 'urn', 'idol', 'fern', 'brazier'],
    propDensity: 0.07,
    packs: 13,
    monsters: [
      { id: 'zealot', weight: 3, packMin: 3, packMax: 5 },
      { id: 'flayershaman', weight: 1, packMin: 1, packMax: 2 },
      { id: 'giantspider', weight: 2, packMin: 2, packMax: 4 },
    ],
    exits: [
      { to: 'flayerjungle', side: 'n' },
      { to: 'travincal', side: 's' },
    ],
  },
  {
    id: 'travincal',
    act: 3,
    name: 'Travincal',
    kind: 'outdoor',
    terrain: 'temple',
    pathTerrain: 'cobble',
    wallTerrain: 'temple',
    areaLevel: 25,
    ambient: [56, 58, 52],
    size: 70,
    props: ['column', 'column', 'idol', 'brazier', 'urn'],
    propDensity: 0.07,
    packs: 13,
    quest: 'council',
    boss: 'council',
    monsters: [
      { id: 'zealot', weight: 3, packMin: 3, packMax: 6 },
      { id: 'councilmember', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [
      { to: 'bazaar', side: 'n' },
      { to: 'durance', side: 's', kind: 'stairs' },
    ],
  },
  {
    id: 'durance',
    act: 3,
    name: 'Durance of Hate',
    kind: 'dungeon',
    terrain: 'temple',
    wallTerrain: 'temple',
    areaLevel: 26,
    ambient: [18, 18, 22],
    size: 62,
    depth: 3,
    props: ['column', 'idol', 'urn', 'bones'],
    packs: 14,
    quest: 'mephisto',
    boss: 'mephisto',
    monsters: [
      { id: 'councilmember', weight: 1, packMin: 1, packMax: 2 },
      { id: 'zealot', weight: 3, packMin: 3, packMax: 6 },
      { id: 'giantspider', weight: 2, packMin: 2, packMax: 4 },
    ],
    exits: [{ to: 'travincal', kind: 'stairs' }],
  },

  // ------------------------------------------------------------------ act 4
  // Hell, and canon act four is short on purpose: five areas between the
  // portal and the Lord of Terror. Blood is the scorched ground, obsidian the
  // built stone -- the fortress is the only place in the act that is not on
  // fire, which is why its ambient is the only warm one that is not red.
  {
    id: 'fortress',
    act: 4,
    name: 'Pandemonium Fortress',
    kind: 'town',
    terrain: 'obsidian',
    wallTerrain: 'obsidian',
    areaLevel: 0,
    ambient: [86, 70, 74],
    size: 40,
    waypoint: true,
    monsters: [],
    // A garrison on a rock over hell: no tents, no wagons. Braziers where the
    // encampment keeps campfires, banners on the wall, and a hellspike or two
    // that came up through the floor and was left where it stood.
    furniture: [
      ['brazier', -4, -7], ['banner', -6, -7], ['crate', -2, -7],         // Jamella
      ['anvil', 5, -7], ['banner', 3, -8], ['barrel', 6, -6],            // Halbu
      ['banner', -8, 0], ['crate', -8, 3],                               // Cain
      ['brazier', 4, 8], ['hellspike', 6, 9], ['hellspike', 2, 10],      // Tyrael
      ['brazier', 0, 0], ['hellspike', 0, -3],                           // the courtyard
    ],
    exits: [{ to: 'steppes', side: 's' }],
  },
  {
    id: 'steppes',
    act: 4,
    name: 'Outer Steppes',
    kind: 'outdoor',
    terrain: 'blood',
    pathTerrain: 'obsidian',
    wallTerrain: 'obsidian',
    areaLevel: 28,
    ambient: [82, 56, 52],
    size: 74,
    props: ['hellspike', 'rock', 'bones', 'lavavent'],
    propDensity: 0.06,
    packs: 12,
    monsters: [
      { id: 'doomknight', weight: 3, packMin: 3, packMax: 5 },
      { id: 'urdar', weight: 2, packMin: 2, packMax: 3 },
      { id: 'balrog', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [
      { to: 'fortress', side: 'n' },
      { to: 'despair', side: 's' },
    ],
  },
  {
    id: 'despair',
    act: 4,
    name: 'Plains of Despair',
    kind: 'outdoor',
    terrain: 'blood',
    pathTerrain: 'obsidian',
    wallTerrain: 'obsidian',
    areaLevel: 29,
    ambient: [80, 54, 52],
    size: 76,
    props: ['hellspike', 'hellspike', 'bones', 'lavavent', 'rock'],
    propDensity: 0.06,
    packs: 13,
    quest: 'izual',
    boss: 'izual',
    monsters: [
      { id: 'doomknight', weight: 3, packMin: 3, packMax: 5 },
      { id: 'oblivionknight', weight: 1, packMin: 1, packMax: 2 },
      { id: 'balrog', weight: 2, packMin: 1, packMax: 3 },
    ],
    exits: [
      { to: 'steppes', side: 'n' },
      { to: 'damned', side: 's' },
    ],
  },
  {
    id: 'damned',
    act: 4,
    name: 'City of the Damned',
    kind: 'outdoor',
    terrain: 'obsidian',
    pathTerrain: 'obsidian',
    wallTerrain: 'obsidian',
    areaLevel: 30,
    // Just over the line the music's dark heuristic draws at an average of 60:
    // the City of the Damned is a ruin under an open sky and has to sound like
    // one. A shade darker and it would play the act's dungeon mood.
    ambient: [76, 56, 58],
    size: 74,
    waypoint: true,
    props: ['column', 'hellspike', 'brazier', 'bones', 'lavavent'],
    propDensity: 0.07,
    packs: 14,
    monsters: [
      { id: 'oblivionknight', weight: 2, packMin: 1, packMax: 2 },
      { id: 'doomknight', weight: 3, packMin: 3, packMax: 6 },
      { id: 'urdar', weight: 2, packMin: 2, packMax: 3 },
    ],
    exits: [
      { to: 'despair', side: 'n' },
      { to: 'flame', side: 's', kind: 'stairs' },
    ],
  },
  {
    id: 'flame',
    act: 4,
    name: 'River of Flame',
    kind: 'dungeon',
    terrain: 'blood',
    wallTerrain: 'obsidian',
    areaLevel: 31,
    ambient: [40, 22, 20],
    size: 58,
    depth: 1,
    waypoint: true,
    // The one area with `lava`: the generator lays impassable channels of it
    // across the floor and vents light along them. Everything still connects --
    // a strip that would cut a room off is not laid.
    lava: true,
    props: ['lavavent', 'hellspike', 'bones', 'rock'],
    packs: 13,
    quest: 'hephasto',
    boss: 'hephasto',
    monsters: [
      { id: 'urdar', weight: 3, packMin: 2, packMax: 4 },
      { id: 'balrog', weight: 2, packMin: 1, packMax: 3 },
      { id: 'doomknight', weight: 2, packMin: 3, packMax: 5 },
    ],
    exits: [
      { to: 'damned', kind: 'stairs' },
      { to: 'chaos', kind: 'stairs' },
    ],
  },
  {
    id: 'chaos',
    act: 4,
    name: 'Chaos Sanctuary',
    kind: 'dungeon',
    terrain: 'obsidian',
    wallTerrain: 'obsidian',
    areaLevel: 32,
    ambient: [30, 18, 22],
    size: 62,
    depth: 1,
    lava: true,
    props: ['column', 'hellspike', 'lavavent', 'bones'],
    packs: 15,
    quest: 'diablo',
    boss: 'diablo',
    monsters: [
      { id: 'oblivionknight', weight: 2, packMin: 1, packMax: 3 },
      { id: 'doomknight', weight: 3, packMin: 4, packMax: 6 },
      { id: 'balrog', weight: 2, packMin: 2, packMax: 3 },
      { id: 'urdar', weight: 2, packMin: 2, packMax: 3 },
    ],
    exits: [{ to: 'flame', kind: 'stairs' }],
  },

  // ------------------------------------------------------------------ act 5
  // Mount Arreat: snow above ground, ice below it. The barbarians hold one
  // town and are losing it, which is why Harrogath's furniture is siege gear.
  {
    id: 'harrogath',
    act: 5,
    name: 'Harrogath',
    kind: 'town',
    terrain: 'snow',
    wallTerrain: 'ice',
    areaLevel: 0,
    ambient: [92, 100, 118],
    size: 40,
    waypoint: true,
    monsters: [],
    furniture: [
      ['campfire', -4, -7], ['crate', -6, -7], ['barrel', -2, -7],       // Malah
      ['anvil', 5, -7], ['crate', 3, -8], ['barrel', 6, -6],             // Larzuk
      ['tent', 8, 0], ['crate', 8, 3], ['icicle', 7, 4],                 // Anya
      ['tent', -8, 0], ['banner', -8, 3],                                // Cain
      ['banner', -1, 8], ['frozencorpse', -3, 9],                        // Qual-Kehk
      ['brazier', 0, 0], ['icicle', 0, -3],                              // the square
    ],
    exits: [{ to: 'foothills', side: 's' }],
  },
  {
    id: 'foothills',
    act: 5,
    name: 'Bloody Foothills',
    kind: 'outdoor',
    terrain: 'snow',
    pathTerrain: 'dirt',
    wallTerrain: 'snow',
    areaLevel: 35,
    ambient: [80, 88, 104],
    size: 74,
    props: ['icicle', 'frozencorpse', 'rock', 'bones', 'tree'],
    propDensity: 0.06,
    packs: 13,
    quest: 'shenk',
    boss: 'shenk',
    monsters: [
      { id: 'enslaved', weight: 3, packMin: 4, packMax: 7 },
      { id: 'deathminion', weight: 2, packMin: 2, packMax: 4 },
      { id: 'succubus', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [
      { to: 'harrogath', side: 'n' },
      { to: 'highlands', side: 's' },
    ],
  },
  {
    id: 'highlands',
    act: 5,
    name: 'Frigid Highlands',
    kind: 'outdoor',
    terrain: 'snow',
    pathTerrain: 'dirt',
    wallTerrain: 'snow',
    areaLevel: 36,
    ambient: [78, 86, 104],
    size: 76,
    waypoint: true,
    props: ['icicle', 'rock', 'frozencorpse', 'tree', 'bones'],
    propDensity: 0.06,
    packs: 13,
    monsters: [
      { id: 'enslaved', weight: 3, packMin: 4, packMax: 7 },
      { id: 'frozenhorror', weight: 2, packMin: 1, packMax: 3 },
      { id: 'succubus', weight: 2, packMin: 1, packMax: 3 },
    ],
    exits: [
      { to: 'foothills', side: 'n' },
      { to: 'plateau', side: 's' },
    ],
  },
  {
    id: 'plateau',
    act: 5,
    name: 'Arreat Plateau',
    kind: 'outdoor',
    terrain: 'snow',
    pathTerrain: 'dirt',
    wallTerrain: 'ice',
    areaLevel: 37,
    ambient: [76, 86, 106],
    size: 76,
    props: ['icicle', 'icicle', 'rock', 'frozencorpse', 'banner'],
    propDensity: 0.07,
    packs: 14,
    monsters: [
      { id: 'moonlord', weight: 2, packMin: 1, packMax: 3 },
      { id: 'frozenhorror', weight: 2, packMin: 1, packMax: 3 },
      { id: 'deathminion', weight: 3, packMin: 3, packMax: 5 },
    ],
    exits: [
      { to: 'highlands', side: 'n' },
      { to: 'crystalline', side: 's', kind: 'stairs' },
    ],
  },
  {
    id: 'crystalline',
    act: 5,
    name: 'Crystalline Passage',
    kind: 'dungeon',
    terrain: 'ice',
    wallTerrain: 'ice',
    areaLevel: 38,
    ambient: [30, 36, 48],
    size: 56,
    depth: 2,
    waypoint: true,
    props: ['icicle', 'frozencorpse', 'rock', 'bones'],
    packs: 13,
    monsters: [
      { id: 'frozenhorror', weight: 3, packMin: 2, packMax: 3 },
      { id: 'succubus', weight: 2, packMin: 1, packMax: 3 },
      { id: 'moonlord', weight: 2, packMin: 1, packMax: 3 },
    ],
    exits: [
      { to: 'plateau', kind: 'stairs' },
      { to: 'ancientsway', kind: 'stairs' },
    ],
  },
  {
    id: 'ancientsway',
    act: 5,
    name: "The Ancients' Way",
    kind: 'outdoor',
    terrain: 'snow',
    pathTerrain: 'cobble',
    wallTerrain: 'ice',
    areaLevel: 39,
    ambient: [72, 82, 102],
    size: 72,
    props: ['icicle', 'column', 'banner', 'rock', 'frozencorpse'],
    propDensity: 0.07,
    packs: 13,
    quest: 'ancients',
    boss: 'ancient',
    monsters: [
      { id: 'moonlord', weight: 2, packMin: 2, packMax: 3 },
      { id: 'deathminion', weight: 3, packMin: 3, packMax: 5 },
      { id: 'frozenhorror', weight: 2, packMin: 1, packMax: 3 },
    ],
    exits: [
      { to: 'crystalline', side: 'n', kind: 'stairs' },
      { to: 'worldstone', side: 's', kind: 'stairs' },
    ],
  },
  {
    id: 'worldstone',
    act: 5,
    name: 'Worldstone Keep',
    kind: 'dungeon',
    terrain: 'ice',
    wallTerrain: 'obsidian',
    areaLevel: 40,
    ambient: [26, 30, 42],
    size: 62,
    depth: 3,
    waypoint: true,
    props: ['column', 'icicle', 'banner', 'bones'],
    packs: 15,
    monsters: [
      { id: 'moonlord', weight: 2, packMin: 2, packMax: 3 },
      { id: 'succubus', weight: 2, packMin: 2, packMax: 3 },
      { id: 'deathminion', weight: 3, packMin: 3, packMax: 5 },
      { id: 'frozenhorror', weight: 1, packMin: 1, packMax: 2 },
    ],
    exits: [
      { to: 'ancientsway', kind: 'stairs' },
      { to: 'throne', kind: 'stairs' },
    ],
  },
  {
    id: 'throne',
    act: 5,
    name: 'Throne of Destruction',
    kind: 'dungeon',
    terrain: 'obsidian',
    wallTerrain: 'obsidian',
    areaLevel: 41,
    ambient: [24, 26, 36],
    size: 54,
    depth: 1,
    // No Lister and no waves: the throne room holds its own garrison and then
    // Baal, and the last fight in the game is not a summoning minigame.
    props: ['column', 'brazier', 'banner', 'bones'],
    packs: 12,
    quest: 'baal',
    boss: 'baal',
    monsters: [
      { id: 'moonlord', weight: 2, packMin: 2, packMax: 3 },
      { id: 'succubus', weight: 2, packMin: 2, packMax: 3 },
      { id: 'deathminion', weight: 3, packMin: 3, packMax: 5 },
    ],
    exits: [{ to: 'worldstone', kind: 'stairs' }],
  },
];

export const AREA_BY_ID = {};
for (const a of AREAS) AREA_BY_ID[a.id] = a;

// The five acts. `key` is the music's prefix, so an act's three moods are
// `${key}.town`, `${key}.field` and `${key}.dungeon`. `town` names the area a
// caravan, a ship or a portal arrives at, and every one of the five is a real
// town with its own cast now.
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
export const WAYPOINT_AREAS = [
  'town', 'coldplains', 'darkwood', 'catacombs',
  'lutgholein', 'dryhills', 'lostcity',
  'kurast', 'greatmarsh', 'bazaar',
  'fortress', 'damned', 'flame',
  'harrogath', 'highlands', 'crystalline', 'worldstone',
];
