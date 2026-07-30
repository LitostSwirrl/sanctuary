// The people standing in the towns.
//
// An NPC is an entity so that it sorts into the scene, animates and can be
// hovered like anything else, but it carries `isNpc` and never takes a turn:
// the AI, the damage paths and the projectile hit tests all skip it. What it
// can do for the player is one of four services, and the panel layer reads
// `services` rather than knowing any NPC by name.

import { Entity } from './entity.js';

// Which base types each merchant keeps. An empty list means everything.
//
// `town` is the area an NPC stands in; the encampment's cast carries no field
// and defaults there. Cain follows the hero from town to town, so each town
// holds its own def for him -- same name, same words' shape, different id,
// because NPC_BY_ID cannot hold two records under one key. Meshif likewise:
// he sails from Lut Gholein and again from Kurast, and each berth is its own
// def with its own passage lines. The five acts' figure budget reuses the six
// encampment bakes as-is -- accepted cheapness, per the design.
export const NPCS = [
  {
    id: 'akara', name: 'Akara', title: 'High Priestess of the Sightless Eye',
    figure: 'akara', at: { dx: -3.5, dy: -5.5 }, face: 3,
    services: ['heal', 'trade'],
    greeting: 'Welcome, sister. The Sightless Eye watches over you here.',
    greetingByClass: {
      barbarian: 'Welcome, warrior. The Sightless Eye watches over you here.',
    },
    stockSlots: ['weapon', 'body', 'head'],
    stockCaster: true,
    lines: [
      'Andariel has taken the monastery. Her corruption spreads through the whole valley.',
      'Our order guarded the passage east for generations. Now we cannot walk our own halls.',
      'Rest here as long as you need. Beyond the gate there is no rest at all.',
    ],
    quest: {
      den: {
        pending: 'A den of evil lies east of the moor. Clear it, and I will teach you what I can.',
        done: 'The den is quiet. You have earned what I taught you.',
      },
    },
  },
  {
    id: 'charsi', name: 'Charsi', title: 'Blacksmith',
    figure: 'charsi', at: { dx: 4.5, dy: -5.5 }, face: 5,
    services: ['trade'],
    greeting: 'Anything you need forged, I can forge. Anything you find, I will buy.',
    stockSlots: ['weapon', 'body', 'shield', 'head', 'gloves', 'boots', 'belt'],
    lines: [
      'I left my best hammer in the smithy when we fled. It is still there, I expect.',
      'Bring me anything you pull off a corpse. I pay fairly, which is more than most.',
      'A wand is a fine thing, but so is thirty pounds of steel.',
    ],
    quest: {
      smith: {
        pending: 'Something is working my forge in the barracks. Whatever it is, it swings my hammer.',
        done: 'You broke the thing at my forge. I will get my hammer back myself, now the way is quiet.',
      },
    },
  },
  {
    id: 'gheed', name: 'Gheed', title: 'Merchant of Curiosities',
    figure: 'gheed', at: { dx: 6.5, dy: 1.5 }, face: 5,
    services: ['gamble', 'trade'],
    greeting: 'Ah, a customer with coin! Take a chance, friend. The wheel favours the bold.',
    stockSlots: ['ring', 'amulet', 'belt', 'gloves', 'boots'],
    lines: [
      'Every item I sell is honestly come by. Mostly.',
      'You want certainty? Buy bread. You want a fortune? Gamble.',
      'The caravan brought me here and the caravan will take me out. Until then, business.',
    ],
  },
  {
    id: 'cain', name: 'Deckard Cain', title: 'Last of the Horadrim',
    figure: 'cain', at: { dx: -6.5, dy: 1.5 }, face: 1,
    services: ['identify'],
    greeting: 'Stay a while and listen. I will name what you carry, and gladly.',
    lines: [
      'I knew your predecessors. Few of them listened either.',
      'The Sisters call her Andariel. The Horadric texts give her an older name, and a worse one.',
      'An unnamed thing has no power over you. Bring me what you find.',
    ],
  },
  {
    id: 'kashya', name: 'Kashya', title: 'Rogue Captain',
    figure: 'kashya', at: { dx: -1.5, dy: 6.5 }, face: 7,
    services: [],
    greeting: 'Another sorceress. Try not to die where my scouts have to carry you back.',
    greetingByClass: {
      barbarian: 'A barbarian of the north. Try not to die where my scouts have to carry you back.',
    },
    lines: [
      'My rogues hold this camp. We do not hold anything past the gate.',
      'Blood Raven led this company once. What walks the burial grounds now is not her.',
      'Kill something worth the arrows we spend covering you, and we will talk again.',
    ],
    quest: {
      raven: {
        pending: 'Blood Raven raises our dead in the burial grounds. Put her down.',
        done: 'Blood Raven is at rest. The company thanks you, whatever my face says.',
      },
    },
  },
  {
    id: 'warriv', name: 'Warriv', title: 'Caravan Master',
    figure: 'warriv', at: { dx: 2.5, dy: 6.5 }, face: 7,
    services: ['travel'],
    // What he says when asked for the caravan, and what he says on arrival.
    // Which act his wagons reach, and which flag opens the road, is ACTS's
    // business rather than his -- Meshif sails twice and will want a line per
    // destination, so these stay the words and not the route.
    passage: {
      refuse: 'The road stays shut while she lives. I will not feed my oxen to her.',
      arrive: 'Lut Gholein. Two days of dust and not one ambush -- a good crossing.',
    },
    greeting: 'The road east is closed, friend. Until it opens, my wagons stay where they are.',
    lines: [
      'I have crossed the desert twice. I would rather do it again than walk that monastery.',
      'The waypoints still stand. Old magic, older than the order that guards them.',
      'When Andariel falls, I take the caravan through. Not one hour before.',
    ],
    quest: {
      andariel: {
        pending: 'Andariel sits in the catacombs beneath the monastery. Nothing moves east while she lives.',
        done: 'Andariel is dead. Come to me when you are ready and we ride east.',
      },
    },
  },

  // ------------------------------------------------------------- lut gholein
  {
    id: 'fara', name: 'Fara', title: 'Weaponsmith', town: 'lutgholein',
    figure: 'charsi', at: { dx: -3.5, dy: -5.5 }, face: 3,
    services: ['heal', 'trade'],
    greeting: 'You look as though the desert has had its share of you. Let me see to that.',
    stockSlots: ['weapon', 'body', 'shield', 'head'],
    lines: [
      'I served in the armies of the Light once. I keep the forge now, and the memory.',
      'Whatever the sand has half eaten, bring it here. Steel forgives more than skin does.',
      'Jerhyn keeps his fears to himself. That alone should worry you.',
    ],
  },
  {
    id: 'drognan', name: 'Drognan', title: 'Wizard', town: 'lutgholein',
    figure: 'akara', at: { dx: 4.5, dy: -5.5 }, face: 5,
    services: ['trade'],
    greeting: 'Hmm. A traveller with the dust of the tombs on them. Come in, come in.',
    stockSlots: ['weapon', 'ring', 'amulet', 'belt'],
    stockCaster: true,
    lines: [
      'Tal Rasha is buried in one of seven tombs, and the desert keeps all seven.',
      'The old city beyond the oasis fell long before Lut Gholein rose. The sand remembers why.',
      'Study what you fight. The dead here were priests once, and priests keep their habits.',
    ],
    quest: {
      radament: {
        pending: 'Something wears the sewers under this city like a robe. Atma weeps for her son; go and end it.',
        done: 'So the thing below was Radament the Fallen. A Horadrim, once. A mercy, then.',
      },
    },
  },
  {
    id: 'elzix', name: 'Elzix', title: 'Innkeeper', town: 'lutgholein',
    figure: 'gheed', at: { dx: 6.5, dy: 1.5 }, face: 5,
    services: ['gamble', 'trade'],
    greeting: 'The Desert Rain welcomes you! Rooms, goods, and the occasional miracle at a price.',
    stockSlots: ['ring', 'amulet', 'belt', 'gloves', 'boots'],
    lines: [
      'I was a bandit in my youth. Now I only rob politely, and with a smile.',
      'Every caravan leaves something behind at my inn. Some of it I even paid for.',
      'Luck is a currency, friend. I make change.',
    ],
  },
  {
    id: 'cain2', name: 'Deckard Cain', title: 'Last of the Horadrim', town: 'lutgholein',
    figure: 'cain', at: { dx: -6.5, dy: 1.5 }, face: 1,
    services: ['identify'],
    greeting: 'Stay a while and listen. The desert has stories older than the Horadrim.',
    lines: [
      'Tal Rasha bound Baal within himself, and the Horadrim bound Tal Rasha in a tomb. It did not hold.',
      'Radament was one of us once. What the sewers hold now is what remains of that.',
      'Bring me what you find. The tombs bury their meanings deep.',
    ],
  },
  {
    id: 'meshif', name: 'Meshif', title: 'Sea Captain', town: 'lutgholein',
    figure: 'warriv', at: { dx: 2.5, dy: 6.5 }, face: 7,
    services: ['travel'],
    passage: {
      refuse: 'My ship stays tied until the tomb is dealt with. I sail cargo, not curses.',
      arrive: 'Kurast, or what is left of it. Mind the jungle -- it minds you.',
    },
    greeting: 'The harbour is quiet and my hold is empty. Say the word when the east calls you.',
    lines: [
      'I have sailed to Kurast a dozen times. The last few, the jungle stood closer to the docks.',
      'Jerhyn pays me to wait. The sea pays nobody, and takes what it likes.',
      'Whatever sleeps in Tal Rasha\'s tomb, the sailors felt it turn over weeks ago.',
    ],
    quest: {
      duriel: {
        pending: 'They say something stirs in the true tomb beyond the viper temple. Until it is settled, I keep my anchor down.',
        done: 'The tomb is quiet and the harbour knows it. My ship is yours when you are ready.',
      },
    },
  },

  // ------------------------------------------------------------------ kurast
  {
    id: 'ormus', name: 'Ormus', title: 'Healer', town: 'kurast',
    figure: 'akara', at: { dx: -3.5, dy: -5.5 }, face: 3,
    services: ['heal', 'trade'],
    greeting: 'Ormus greets you. The rains fall upward here of late; you will want your strength.',
    stockSlots: ['weapon', 'ring', 'amulet'],
    stockCaster: true,
    lines: [
      'Ormus speaks of himself so that Ormus is never mistaken for the thing wearing his voice.',
      'The Council rules from Travincal, and Travincal no longer answers to anything human.',
      'This city was the jewel of Kehjistan. The jungle is what its sins grew into.',
    ],
    quest: {
      council: {
        pending: 'The High Council keeps the compelling orb in Travincal. Break them, and the city breathes.',
        done: 'The Council is broken. Ormus feels the river of the city run a little cleaner.',
      },
    },
  },
  {
    id: 'hratli', name: 'Hratli', title: 'Smith', town: 'kurast',
    figure: 'charsi', at: { dx: 4.5, dy: -5.5 }, face: 5,
    services: ['trade'],
    greeting: 'Careful on the planks. I enchanted the docks myself, and even so I sleep on the boat.',
    stockSlots: ['weapon', 'body', 'shield', 'head', 'gloves', 'boots', 'belt'],
    lines: [
      'My forge sits on the water because the land stopped being trustworthy.',
      'Steel takes an enchantment better than flesh does. Ask me how I know.',
      'The flayers take heads. I would keep yours attached, if you can manage it.',
    ],
  },
  {
    id: 'alkor', name: 'Alkor', title: 'Alchemist', town: 'kurast',
    figure: 'gheed', at: { dx: 6.5, dy: 1.5 }, face: 5,
    services: ['gamble', 'trade'],
    greeting: 'What? Oh, a customer. Buy something or wager something, but do be quick about it.',
    stockSlots: ['ring', 'amulet', 'belt', 'gloves', 'boots'],
    lines: [
      'I did not come to this swamp for the company, and the company obliges me.',
      'Half my potions are experiments. The other half are excellent. Guess which you hold.',
      'Gold in my jar buys you a mystery. Sometimes the mystery is even worth gold.',
    ],
  },
  {
    id: 'cain3', name: 'Deckard Cain', title: 'Last of the Horadrim', town: 'kurast',
    figure: 'cain', at: { dx: -6.5, dy: 1.5 }, face: 1,
    services: ['identify'],
    greeting: 'Stay a while and listen. Kurast was a holy city once, hard as that is to see.',
    lines: [
      'Mephisto is the eldest of the three. Hatred needs no army; it makes one of whoever stays.',
      'The Durance was dug as a prison. The prisoner has been the warden for a long time now.',
      'Bring me what you find. The temple city hid its treasures even from itself.',
    ],
  },
  {
    id: 'meshif3', name: 'Meshif', title: 'Sea Captain', town: 'kurast',
    figure: 'warriv', at: { dx: 2.5, dy: 6.5 }, face: 7,
    services: ['travel'],
    passage: {
      refuse: 'Sail on while that thing sits under Travincal? No. The sea is unkind enough already.',
      arrive: 'This is as far as ships go. Whatever stands here now, it is not a harbour.',
    },
    greeting: 'Same ship, worse water. When the city is quiet I will take you on.',
    lines: [
      'I preferred the desert. The sand only wanted to bury me.',
      'The crew will not row past Travincal at night. I have stopped asking them to.',
      'When the Lord of Hatred falls, the sea lane opens. Those are my terms and his.',
    ],
    quest: {
      mephisto: {
        pending: 'Mephisto holds the Durance beneath Travincal. Until he falls, no crew of mine touches an oar.',
        done: 'It is done, then. The water even smells different. We sail when you say.',
      },
    },
  },

  // -------------------------------------------------------- pandemonium fortress
  {
    id: 'jamella', name: 'Jamella', title: 'Angel', town: 'fortress',
    figure: 'akara', at: { dx: -3.5, dy: -5.5 }, face: 3,
    services: ['heal', 'trade'],
    greeting: 'Mortal flesh was not made for this air. Let me put you right before you walk out in it.',
    stockSlots: ['weapon', 'ring', 'amulet', 'body'],
    stockCaster: true,
    lines: [
      'We hold this rock and nothing beyond it. That is the whole of the Fortress.',
      'Do not look long at the steppes. They look back, and they remember faces.',
      'Izual was one of us. Whatever wears him now is not, and it should be ended.',
    ],
    quest: {
      izual: {
        pending: 'Izual walks the Plains of Despair in an angel\'s shape. Free what is left of him.',
        done: 'Izual is at rest. What he knew of this place is yours now.',
      },
    },
  },
  {
    id: 'halbu', name: 'Halbu', title: 'Armourer', town: 'fortress',
    figure: 'charsi', at: { dx: 4.5, dy: -5.5 }, face: 5,
    services: ['trade'],
    greeting: 'Steel from the mortal world, mended in this one. It holds better than you would think.',
    stockSlots: ['weapon', 'body', 'shield', 'head', 'gloves', 'boots', 'belt'],
    lines: [
      'I armour the host. There is little else to do here, and less to do it with.',
      'Hephasto forges for the other side, and he forges well. Ask his hammer.',
      'Bring me what hell drops. Half of it is better than what mortals make.',
    ],
  },
  {
    id: 'cain4', name: 'Deckard Cain', title: 'Last of the Horadrim', town: 'fortress',
    figure: 'cain', at: { dx: -6.5, dy: 1.5 }, face: 1,
    services: ['identify'],
    greeting: 'Stay a while and listen. No Horadrim has stood where we stand and gone home to write it down.',
    lines: [
      'The three brothers are two now. Diablo is the youngest and the worst of them.',
      'This fortress is a foothold, not a fortification. Angels do not build walls.',
      'Bring me what you find. Even hell labels its work, if you know the hand.',
    ],
  },
  {
    id: 'tyrael', name: 'Tyrael', title: 'Archangel', town: 'fortress',
    figure: 'warriv', at: { dx: 2.5, dy: 6.5 }, face: 7,
    services: ['travel'],
    // The passage onward is a portal rather than a road, but askPassage does not
    // care which -- it wants the refusal and the arrival, and it throws if a
    // travel NPC has neither.
    passage: {
      refuse: 'The way to Arreat is not mine to open while Diablo stands. Go down to the Sanctuary.',
      arrive: 'Harrogath, on the slope of Mount Arreat. Baal is already at the summit.',
    },
    greeting: 'I can open the way north when the Lord of Terror is finished. Not before.',
    lines: [
      'I broke the Soulstone at Tal Rasha\'s tomb and it changed nothing. That is my share of this.',
      'Baal marches on the Worldstone. If he touches it, there is no world left to defend.',
      'You are mortal and therefore permitted what we are not. Use that.',
    ],
    quest: {
      diablo: {
        pending: 'Diablo holds the Chaos Sanctuary past the River of Flame. End him, and I open the way north.',
        done: 'Diablo is destroyed. Speak the word and I will open the portal to Harrogath.',
      },
    },
  },

  // --------------------------------------------------------------- harrogath
  {
    id: 'malah', name: 'Malah', title: 'Healer', town: 'harrogath',
    figure: 'akara', at: { dx: -3.5, dy: -5.5 }, face: 3,
    services: ['heal', 'trade'],
    greeting: 'Sit by the fire and let me look at you. The cold hides more wounds than it closes.',
    stockSlots: ['weapon', 'ring', 'amulet', 'head'],
    stockCaster: true,
    lines: [
      'We were a city of five thousand. Count the roofs and tell me what we are now.',
      'Nihlathak bargained with the siege. Do not say his name near Qual-Kehk.',
      'Anya is worth more to this town than the wall is. Bring her home safe.',
    ],
  },
  {
    id: 'larzuk', name: 'Larzuk', title: 'Weaponsmith', town: 'harrogath',
    figure: 'charsi', at: { dx: 4.5, dy: -5.5 }, face: 5,
    services: ['trade'],
    greeting: 'You break it out there, I mend it in here. Bring it before it is scrap.',
    stockSlots: ['weapon', 'body', 'shield', 'head', 'gloves', 'boots', 'belt'],
    lines: [
      'My father armed the men on the wall. I arm whoever is left standing on it.',
      'Shenk drives them up the foothills with a whip. Kill the whip and the drive stops.',
      'Barbarian steel is heavy on purpose. So is Arreat.',
    ],
    quest: {
      shenk: {
        pending: 'Shenk the Overseer is herding them up the Bloody Foothills. Break him and the siege stalls.',
        done: 'Shenk is dead and the foothills have gone quiet. First good news in a season.',
      },
    },
  },
  {
    id: 'anya', name: 'Anya', title: 'Elder\'s Daughter', town: 'harrogath',
    figure: 'gheed', at: { dx: 6.5, dy: 1.5 }, face: 5,
    services: ['gamble', 'trade'],
    greeting: 'I keep what the dead no longer need. Wager on it if you like -- the mountain does.',
    stockSlots: ['ring', 'amulet', 'belt', 'gloves', 'boots'],
    lines: [
      'My father held the eastern gate until it stopped mattering which gate you held.',
      'Everything in this chest came off the wall. I would rather sell it than bury it.',
      'Take the wager. In Harrogath, certainty is the expensive thing.',
    ],
  },
  {
    id: 'qualkehk', name: 'Qual-Kehk', title: 'Barracks Captain', town: 'harrogath',
    figure: 'kashya', at: { dx: -1.5, dy: 6.5 }, face: 7,
    services: [],
    greeting: 'Another outlander. The last three are frozen into the Frigid Highlands. Do better.',
    greetingByClass: {
      barbarian: 'One of our own, at last. The last three outlanders are frozen into the highlands. Do better.',
    },
    lines: [
      'I have buried more of my men than I command. Ask me again about honour.',
      'The Ancients guard the way to the summit. They test whoever climbs, and they do not grade kindly.',
      'Baal is on Arreat. Everything else is a detail of the siege.',
    ],
    quest: {
      ancients: {
        pending: 'The Ancients bar the Ancients\' Way to anyone unproven. Face what stands there.',
        done: 'You passed the Ancients\' judgement. The summit is open, for whatever that is worth.',
      },
    },
  },
  {
    id: 'cain5', name: 'Deckard Cain', title: 'Last of the Horadrim', town: 'harrogath',
    figure: 'cain', at: { dx: -6.5, dy: 1.5 }, face: 1,
    services: ['identify'],
    greeting: 'Stay a while and listen. The Worldstone is above us, and Baal is climbing toward it.',
    lines: [
      'The Worldstone keeps this world separate from theirs. Corrupt it and the separation ends.',
      'Baal was bound in Tal Rasha. He has been walking free for longer than anyone admits.',
      'Bring me what you find. Even at the end of the world, a name is worth having.',
    ],
  },
];

export const NPC_BY_ID = {};
for (const n of NPCS) NPC_BY_ID[n.id] = n;

export class Npc extends Entity {
  constructor(def, x, y, sheet) {
    super({ x, y, sheet, radius: 0.34, speed: 0, hp: 1, dir: def.face ?? 2, name: def.name });
    this.isNpc = true;
    this.defId = def.id;
    this.def = def;
    this.title = def.title;
    this.label = def.name;
    this.lineIndex = 0;
    this.stock = null;         // rolled on the first visit, kept for the session
    this.gambleStock = null;
    this.setAnim('idle');
  }

  // Talking twice should not repeat the same sentence.
  nextLine() {
    const l = this.def.lines || [];
    if (!l.length) return null;
    const line = l[this.lineIndex % l.length];
    this.lineIndex++;
    return line;
  }

  // What this NPC says about the quests it cares about, given what is done.
  questLine(player) {
    const q = this.def.quest;
    if (!q) return null;
    for (const key in q) {
      if (!player.quests[key]) return q[key].pending;
    }
    const keys = Object.keys(q);
    return keys.length ? q[keys[keys.length - 1]].done : null;
  }

  has(service) { return (this.def.services || []).includes(service); }
}

// Stand a town's cast around its centre. The generator owns where the centre
// is; this only knows the offsets each NPC keeps from it, and `townId` picks
// which town's people these are.
export function populateTown(level, cx, cy, figures, cls, townId = 'town') {
  level.npcs = [];
  for (const def of NPCS) {
    if ((def.town || 'town') !== townId) continue;
    const spot = level.nearestOpen(cx + def.at.dx, cy + def.at.dy, 8);
    const npc = new Npc(def, spot.x, spot.y, figures[def.figure]);
    if (def.greetingByClass && def.greetingByClass[cls]) npc.greeting = def.greetingByClass[cls];
    level.addEntity(npc);
    level.npcs.push(npc);
  }
  return level.npcs;
}
