// The people standing in the Rogue Encampment.
//
// An NPC is an entity so that it sorts into the scene, animates and can be
// hovered like anything else, but it carries `isNpc` and never takes a turn:
// the AI, the damage paths and the projectile hit tests all skip it. What it
// can do for the player is one of four services, and the panel layer reads
// `services` rather than knowing any NPC by name.

import { Entity } from './entity.js';

// Which base types each merchant keeps. An empty list means everything.
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
    services: [],
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

// Stand everyone around the town centre. The generator owns where the centre
// is; this only knows the offsets each NPC keeps from it.
export function populateTown(level, cx, cy, figures, cls) {
  level.npcs = [];
  for (const def of NPCS) {
    const spot = level.nearestOpen(cx + def.at.dx, cy + def.at.dy, 8);
    const npc = new Npc(def, spot.x, spot.y, figures[def.figure]);
    if (def.greetingByClass && def.greetingByClass[cls]) npc.greeting = def.greetingByClass[cls];
    level.addEntity(npc);
    level.npcs.push(npc);
  }
  return level.npcs;
}
