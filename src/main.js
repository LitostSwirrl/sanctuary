// Sanctuary — a small Diablo 2 in the browser.
//
// This file is the state machine and the wiring: it owns the loading screen,
// the title, the six areas and the transitions between them, the quest flags,
// death and resurrection, and save. Everything it wires together lives in its
// own module and does not know about this one.

import { startLoop } from './core/loop.js';
import { Camera } from './core/iso.js';
import { Input } from './core/input.js';
import { Rng, hashSeed } from './core/rng.js';
import { bakeTiles, getProp, TILE_BAKE_STEPS } from './art/tiles.js';
import { bakeAllFigures, FIGURE_BAKE_STEPS } from './art/figures.js';
import { Particles, FX } from './art/fx.js';
import { iconFor, bakeIcons, ICON_BAKE_STEPS } from './art/icons.js';
import { AREAS, AREA_BY_ID, WAYPOINT_AREAS, ACTS } from './world/levels.js';
import { generate } from './world/gen.js';
import { Renderer } from './render/renderer.js';
import { drawMinimap } from './render/minimap.js';
import { Player } from './game/player.js';
import { applyDamage, applyChill, onStruck, rollHit, rollDamage, monsterDefense, tickBurn, xpPenalty, xpForLevel, xpToNext, LEVEL_CAP } from './game/combat.js';
import { populate, spawnBoss, Monster } from './game/monster.js';
import { populateTown } from './game/npc.js';
import { updateAI, taunt } from './game/ai.js';
import { dropLoot, dropFromContainer, pickUp, addToInventory, groundItem, scatterWorldItems } from './game/loot.js';
import { Projectiles } from './game/projectile.js';
import {
  castSkill, allocate, refreshPassives, SKILL_BY_ID, SKILLS, CLASS_TREES,
  tickHazards, tickPets, tickBuffs, nearestCorpse,
  addHazard, addPet, beam, addStack, stackCount, consumeCorpse, enchantFire,
} from './game/skills.js';
import { makeGold, rollItem, forgeItem, makePotion } from './items/item.js';
import { UNIQUE_BY_NAME } from './items/uniques.js';
import { UI } from './ui/panels.js';
import { drawHUD, drawGroundLabels, drawMonsterBanner, drawCursor, HUD_H } from './ui/hud.js';
import { panel, panelTitle } from './ui/tooltip.js';
import * as audio from './audio/synth.js';
import { save, load, hasSave, clear as clearSave, applyTo } from './save.js';

const canvas = document.getElementById('game');
const ctx2d = canvas.getContext('2d');
const cam = new Camera();
const renderer = new Renderer(canvas);
const ui = new UI();
Input.attach(canvas);
document.getElementById('hint').style.display = 'none';

let uiScale = 1;
function resize() {
  const dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  cam.resize(canvas.width, canvas.height);
  cam.zoom = dpr;
  uiScale = dpr;
  renderer.resize(canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ loading

const assets = { figures: {} };
let state = 'loading';
let loadPct = 0, loadLabel = '';
const TOTAL_BAKE_STEPS = TILE_BAKE_STEPS + FIGURE_BAKE_STEPS + ICON_BAKE_STEPS;
let bakeSteps = 0;
function* allBakers() { yield* bakeTiles(); yield* bakeAllFigures(assets.figures); yield* bakeIcons(); }
const baker = allBakers();

function pumpLoading() {
  const until = performance.now() + 12;
  while (performance.now() < until) {
    const r = baker.next();
    if (r.done) { state = 'title'; return; }
    bakeSteps++;
    loadLabel = r.value.label || '';
    loadPct = Math.min(1, bakeSteps / TOTAL_BAKE_STEPS);
  }
}

// --------------------------------------------------------------------- game

const fx = new Particles();
const projectiles = new Projectiles();
let rng = new Rng(1);
let player = null;
let level = null;
let clock = 0;
let seed = 1;
let areaId = 'town';
const levels = new Map();
let corpse = null;
let transitionCool = 0;
// You arrive standing on the door you came through. Until you step off it, that
// door is inert — otherwise the moment the arrival grace period lapses you are
// sent straight back where you came from.
let suppressedExit = null;
let deathScreenT = 0;

const game = {
  get player() { return player; },
  get seed() { return seed; },
  get areaId() { return areaId; },
  get corpse() { return corpse; },
  get now() { return Date.now(); },
};

// Part of the try-out boost below: the classic endgame loadout, every slot a
// unique from the chase tier in items/uniques.js. Two characters never
// coexist, so the classes sharing a Harlequin Crest or War Traveler is fine.
const BEST_GEAR = {
  sorceress: {
    weapon: 'The Oculus', shield: 'Lidless Wall', head: 'Harlequin Crest',
    body: 'Skin of the Vipermagi', gloves: 'Magefist', boots: 'War Traveler',
    belt: 'Arachnid Mesh', ring1: 'Stone of Jordan', ring2: 'Stone of Jordan',
    amulet: "Mara's Kaleidoscope",
  },
  barbarian: {
    weapon: "Schaefer's Hammer", shield: 'Stormshield', head: 'Harlequin Crest',
    body: 'Shaftstop', gloves: 'Steelrend', boots: 'War Traveler',
    belt: 'String of Ears', ring1: "Bul-Kathos' Wedding Band", ring2: "Bul-Kathos' Wedding Band",
    amulet: "Mara's Kaleidoscope",
  },
};

// Two ways in. Classic is the game as written: level 1, the starter kit, the
// Rogue Encampment, and no road east until Warriv has a reason to sell you one.
// Yolo is the try-out door -- the cap, every skill, every waypoint and the chase
// gear -- and it is a start condition only: nothing about it is written to the
// save, because a character who began at the cap and one who climbed to it are
// the same character by the time the file is read back.
function newGame(cls = 'sorceress', mode = 'classic') {
  seed = (Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  rng = new Rng(seed);
  levels.clear();
  corpse = null;
  player = new Player({ x: 0, y: 0, cls, sheet: assets.figures[cls] });
  // The point that pays for the skill bound to the right button at the start.
  // Without it `allocate` refuses and the new character's right click is dead.
  player.skillPoints = 1;
  if (cls === 'barbarian') {
    // The starting point goes to Bash; the axe is equipped either way.
    player.equipment.weapon = rollItem(rng, 1, { baseId: 'handaxe', rarity: 'normal', identified: true });
    allocate(player, 'bash');
    player.rightSkill = 'bash';
    player.leftSkill = 'attack';
  } else {
    allocate(player, 'firebolt');
    player.rightSkill = 'firebolt';
    player.leftSkill = 'attack';
  }
  player.gold = 80;

  if (mode === 'yolo') applyYoloBoost(cls);

  refreshPassives(player);
  player.recalc(true);
  enterArea('town', null, true);
  state = 'playing';
  titleStep = 'menu';
  save(game);
}

// Try-out boost: a Yolo character starts fully maxed. Level cap through
// the normal xp path (so stat and skill points are granted as usual), every
// class skill hard-set to its 20-point cap, stat points spent evenly, and a
// purse deep enough to buy out any vendor.
//
// The start level is LEVEL_CAP and is meant to be: the design pins this
// try-out character at the cap, so when the cap moved to 50 the boost moved
// with it. What that buys is 245 stat points to spread over the four stats
// where 30 bought 145. The skill points the climb grants are thrown away a few
// lines down, because every skill is set to its own cap by hand rather than
// paid for.
function applyYoloBoost(cls) {
  player.gainXp(xpForLevel(LEVEL_CAP));
  for (const sk of SKILLS) {
    if (CLASS_TREES[cls].includes(sk.tree)) player.skills[sk.id] = 20;
  }
  player.skillPoints = 0;
  const statOrder = ['str', 'dex', 'vit', 'ene'];
  for (let i = 0; player.statPoints > 0; i++) player.spendStat(statOrder[i % statOrder.length]);
  // Money is no object, and every waypoint in every act already knows this hero:
  // the point of the Yolo door is to stand anywhere in Sanctuary within a click,
  // so the caravan's job is one this start is deliberately taking off him.
  player.gold = 9999999;
  for (const wp of WAYPOINT_AREAS) player.waypoints[wp] = true;
  for (const slot in BEST_GEAR[cls]) {
    const u = UNIQUE_BY_NAME[BEST_GEAR[cls][slot]];
    player.equipment[slot] = forgeItem(u.base, u.name, u.mods, 30, { rarity: 'unique', flavour: u.flavour });
  }
  player.belt = [makePotion('hp3'), makePotion('hp3'), makePotion('mp3'), makePotion('mp3')];
  // Fold the new gear into totals before refreshPassives reads them, so the
  // masteries see the amulet's +skills exactly as they do on a loaded save.
  player.recalc();
}

function continueGame() {
  const d = load();
  if (!d) { newGame(); return; }
  seed = d.seed;
  rng = new Rng(seed);
  levels.clear();
  player = new Player({ x: 0, y: 0, cls: d.cls || 'sorceress', sheet: assets.figures[d.cls || 'sorceress'] });
  let uid = 100000;
  applyTo(player, d, () => uid++);
  refreshPassives(player);
  corpse = d.corpse || null;
  enterArea(d.area || 'town', null, true);
  if (d.at) { player.x = d.at.x; player.y = d.at.y; }
  // Leap interpolates position across walls by design, so a save written
  // mid-flight (die()'s save, or a tab close) can persist a spot inside
  // blocked terrain that no movement mechanism can escape. Snap clear of it.
  if (level.blockedCircle(player.x, player.y, player.radius)) {
    const spot = level.nearestOpen(player.x, player.y);
    player.x = spot.x; player.y = spot.y;
  }
  cam.x = player.x; cam.y = player.y;
  state = 'playing';
  titleStep = 'menu';
}

// Levels are kept for the session so walking back does not reshuffle the map or
// revive what you already killed. A reload regenerates them from the seed.
function getLevel(id) {
  if (levels.has(id)) return levels.get(id);
  const def = AREA_BY_ID[id];
  const lvRng = new Rng(hashSeed(`${seed}:${id}`));
  const lv = generate(def, hashSeed(`${seed}:${id}`));
  if (def.monsters && def.monsters.length) populate(lv, def, lvRng, assets.figures);
  if (def.boss && !player.quests[def.quest]) spawnBoss(lv, def.boss, lvRng, assets.figures);
  // Any town with a cast gets it; populateTown filters the roster by the
  // town's own id, so each of the five towns stands up its own people.
  if (lv.townCentre) populateTown(lv, lv.townCentre.x, lv.townCentre.y, assets.figures, player.cls, id);
  if (def.kind !== 'town') scatterWorldItems(lv, lvRng, 6 + Math.round(def.areaLevel * 0.8));
  levels.set(id, lv);
  return lv;
}

function enterArea(id, fromId, snapCamera) {
  areaId = id;
  level = getLevel(id);
  projectiles.clear();
  fx.clear();

  // Arrive at the door you came through, not at the area's default entrance.
  let at = level.start;
  suppressedExit = null;
  if (fromId) {
    const back = level.exits.find((e) => e.to === fromId);
    if (back) { at = level.nearestOpen(back.x, back.y, 6); suppressedExit = back; }
  } else {
    // An area's default start sits on its own entry exit, so suppress whichever
    // door we happen to be standing on.
    suppressedExit = level.exits.find((e) => Math.hypot(e.x - at.x, e.y - at.y) < 2) || null;
  }
  player.x = at.x; player.y = at.y;
  player.stop();
  player.action = null; player.busy = 0; player.zOff = 0;
  player.target = null;
  pending = null;
  level.markExplored(player.x, player.y, 12);
  if (snapCamera) { cam.x = player.x; cam.y = player.y; }
  transitionCool = 0.6;
  audio.ambient(level);
  ui.say(level.name, 2.4);
  save(game);
}

function travelTo(id) {
  if (!player.waypoints[id]) return;
  ui.closeAll();
  enterArea(id, null, true);
  audio.sfx('portal');
}

// The passage onward, and the shape every later act reuses: Warriv's caravan,
// Meshif's ship twice over and Tyrael's portal all do exactly this much. Land in
// the destination act's town, light its waypoint so the stone is a way back
// forever after, and raise the high-water mark the save carries.
function travelToAct(num) {
  const act = ACTS.find((a) => a.num === num);
  if (!act || !AREA_BY_ID[act.town]) return false;
  ui.closeAll();
  enterArea(act.town, null, true);
  player.waypoints[act.town] = true;
  player.actReached = Math.max(player.actReached, num);
  audio.sfx('portal');
  save(game);
  return true;
}

// Asking a townsman for that passage. Which act's road he is selling and which
// quest opens it comes from ACTS by way of the area underfoot, so no townsman is
// named here: whoever stands in an act's town and offers `travel` is that act's
// caravan master. Returns the line he refuses with, or null once the journey has
// happened -- and he refuses for all three reasons the same way: there is no
// road out of this act, the road is shut, or the far end of it is not built yet.
function askPassage(npc) {
  const act = ACTS.find((a) => a.num === AREA_BY_ID[areaId].act);
  const gate = act.travel && act.travel.gateQuest;
  if (!gate || !player.quests[gate] || !travelToAct(act.num + 1)) return npc.def.passage.refuse;
  ui.say(npc.def.passage.arrive, 4.5);
  return null;
}

// ------------------------------------------------------------------ combat

// A flag, a line, and whatever the deed earns. Some deeds earn only the flag --
// what the Smith owes you is lying on his floor -- so the reward is optional.
function grantQuest(name, message, reward) {
  if (player.quests[name]) return;
  player.quests[name] = true;
  if (reward) reward();
  ui.say(message, 4);
  audio.sfx('quest');
  save(game);
}

// Experience granted by a deed rather than a kill -- the Ancients' bounty. The
// level-up handling is the same one killing something gets, because arriving at
// a level from a quest should look exactly like arriving at it from a corpse.
function grantXp(amount) {
  player.gainXp(Math.round(amount), (lvl) => {
    FX.levelUp(fx, player.x, player.y);
    audio.sfx('levelUp');
    ui.say(`Welcome to level ${lvl}`);
  });
}

function killMonster(m) {
  const pen = xpPenalty(player.level, m.mlvl);
  player.gainXp(Math.round(m.xpValue * pen), (lvl) => {
    FX.levelUp(fx, player.x, player.y);
    audio.sfx('levelUp');
    ui.say(`Welcome to level ${lvl}`);
    save(game);
  });
  FX.death(fx, m.x, m.y);
  dropLoot(level, m, player, rng);

  if (m.rank === 'boss') {
    cam.addShake(9);
    if (m.defId === 'corpsefire') {
      grantQuest('den', 'The Den of Evil is cleared. The Rogues grant you a skill point.',
        () => { player.skillPoints += 1; });
    } else if (m.defId === 'bloodraven') {
      grantQuest('raven', 'Blood Raven is put to rest. You feel steadier.',
        () => { player.statPoints += 5; });
    } else if (m.defId === 'smith') {
      grantQuest('smith', 'The Smith is broken. The forge is quiet, and what he carried is on the floor.');
    } else if (m.defId === 'andariel') {
      // The gate of act one, not the end of the game: her flag is what opens
      // Warriv's road east. Baal is what sets `won`, in Task 12.
      grantQuest('andariel', 'Andariel is dead. Warriv will take the caravan east now.',
        () => { player.statPoints += 5; player.skillPoints += 2; });
    } else if (m.defId === 'radament') {
      // The same shape as the Den's reward: a flag and a skill point.
      grantQuest('radament', 'Radament is destroyed. What he studied sharpens you: a skill point.',
        () => { player.skillPoints += 1; });
    } else if (m.defId === 'duriel') {
      // The gate of act two: his flag is what unties Meshif's ship.
      grantQuest('duriel', 'Duriel is dead. Meshif will sail you east to Kurast now.',
        () => { player.statPoints += 5; player.skillPoints += 2; });
    } else if (m.defId === 'council') {
      grantQuest('council', 'The High Council is broken. Travincal stands silent.',
        () => { player.statPoints += 5; });
    } else if (m.defId === 'mephisto') {
      // The gate of act three, and the road out of the world of the living:
      // Meshif's second sailing lands at the Pandemonium Fortress.
      grantQuest('mephisto', 'Mephisto is destroyed. Meshif will carry you on from these shores.',
        () => { player.statPoints += 5; player.skillPoints += 2; });
    } else if (m.defId === 'izual') {
      // Hell's optional bounty, and the largest single skill grant in the game:
      // what an angel knew is worth two points, not one.
      grantQuest('izual', 'Izual is freed. What he knew of hell settles on you: two skill points.',
        () => { player.skillPoints += 2; });
    } else if (m.defId === 'hephasto') {
      grantQuest('hephasto', 'Hephasto is broken. The river runs over his forge now.',
        () => { player.statPoints += 5; });
    } else if (m.defId === 'diablo') {
      // The gate of act four: his flag is what lets Tyrael open the portal north.
      grantQuest('diablo', 'Diablo is destroyed. Tyrael will open the way to Harrogath now.',
        () => { player.statPoints += 5; player.skillPoints += 2; });
    } else if (m.defId === 'shenk') {
      grantQuest('shenk', 'Shenk the Overseer is dead. The siege has lost its whip.',
        () => { player.statPoints += 5; });
    } else if (m.defId === 'ancient') {
      // The Ancients pay in experience rather than points, which is the one
      // reward shape the game has not used yet: two levels' worth at the level
      // the climb is fought at, so it scales with whoever gets there.
      grantQuest('ancients', 'The Ancients grant you passage. The climb itself has taught you something.',
        () => { grantXp(xpToNext(player.level) * 2); });
    } else if (m.defId === 'baal') {
      // The end. `won` has been waiting for this since act one, and all it does
      // is put words on the screen: the world stays open, the save stays valid,
      // and anything still unkilled is still there to kill.
      grantQuest('baal', 'The Worldstone falls quiet.', () => {
        player.statPoints += 5; player.skillPoints += 2;
        state = 'won';
      });
    }
  }
}

const gctx = {
  get level() { return level; },
  get player() { return player; },
  fx, rng, projectiles, dt: 1 / 60,
  get time() { return clock; },
  sfx: (name, opts) => audio.sfx(name, opts),
  get canvasSize() { return { w: canvas.width, h: canvas.height }; },
  get scale() { return uiScale; },

  damageMonster(m, dmg, opts = {}) {
    if (!m.alive) return 0;
    const before = m.hp;
    applyDamage(m, dmg, opts);
    if (opts.chill) applyChill(m, opts.chill.seconds, opts.chill.amount);
    const dealt = before - m.hp;
    if (dealt > 0) {
      fx.float(m.x, m.y, String(Math.round(dealt)), 'rgba(255,240,200,1)');
      if (opts.absolute === undefined) { FX.hitSpark(fx, m.x, m.y); audio.sfx('hit'); }
      // Life and mana steal, which is why those affixes matter on a caster.
      if (opts.source === player) {
        if (player.totals.lifeSteal) player.heal(dealt * player.totals.lifeSteal / 100);
        if (player.totals.manaSteal) player.restoreMana(dealt * player.totals.manaSteal / 100);
      }
    }
    if (!m.alive) { audio.sfx('death'); killMonster(m); }
    return dealt;
  },

  spawnProjectile(o) {
    projectiles.spawn({
      ...o,
      onHit: () => {
        const dmg = {};
        dmg[o.element === 'phys' ? 'phys' : o.element] = o.min + rng.f() * (o.max - o.min);
        hurtPlayer(dmg, o.owner);
      },
    });
  },

  meleeHit(m) {
    if (m.distTo(player) > m.attackRange + 0.6) return;
    // A taunted monster swings wilder and weaker than its sheet says.
    const tn = m.taunt;
    if (!rollHit(rng, m.attackRating * (tn ? 1 - tn.arDebuff : 1), player.defense, m.mlvl, player.level)) {
      fx.float(player.x, player.y, 'miss', 'rgba(190,190,190,1)');
      return;
    }
    const raw = m.rollDamage(rng) * (tn ? 1 - tn.dmgDebuff : 1);
    const dmg = { phys: raw };
    if (m.enchant) dmg[m.enchant] = raw * 0.5;
    hurtPlayer(dmg, m);
    // The armour buffs answer the blow that landed.
    if (player.alive) onStruck(player, m, gctx);
  },

  novaHit(m, o) {
    if (m.distTo(player) > o.radius) return;
    const dmg = {};
    dmg[o.element] = o.min + rng.f() * (o.max - o.min);
    hurtPlayer(dmg, m);
  },

  resurrect(shaman, body) {
    body.resurrected = true;
    const m = new Monster(body.defId, body.mlvl, { x: body.x, y: body.y, rng, sheet: body.sheet });
    m.state = 'chase';
    level.addEntity(m);
    body.remove = true;
    fx.burst('ember', body.x, body.y, 18, { z: 8, spread: 2.4, r: 255, g: 180, b: 60 });
    return m;
  },

  summon(defId, x, y, mlvl) {
    const m = new Monster(defId, mlvl, { x, y, rng, sheet: null });
    m.sheet = assets.figures[m.def.figure];
    m.state = 'chase';
    level.addEntity(m);
    fx.burst('smoke', x, y, 12, { z: 8, spread: 2, r: 90, g: 60, b: 90 });
    return m;
  },
};

function hurtPlayer(dmg, source) {
  if (!player.alive) return;
  const before = player.hp;
  applyDamage(player, dmg, { source });
  const dealt = before - player.hp;
  if (dealt > 0) {
    fx.float(player.x, player.y, `-${Math.round(dealt)}`, 'rgba(255,90,80,1)');
    cam.addShake(2.2);
    audio.sfx('hurt');
  }
  if (player.hp <= 0 && state === 'playing') die();
}

function die() {
  player.hp = 0;
  player.alive = false;
  player.action = null; player.zOff = 0;
  player.setAnim('death', { loop: false, force: true });
  state = 'dead';
  deathScreenT = 0;
  audio.sfx('bossRoar');
  // The gold you were carrying stays where you fell, as a corpse to go and get.
  if (player.gold > 0) {
    corpse = { area: areaId, x: player.x, y: player.y, gold: player.gold };
    player.gold = 0;
  }
  // Experience earned toward the current level is lost, never a whole level.
  const floor = xpForLevel(player.level);
  player.xp = Math.max(floor, Math.round(floor + (player.xp - floor) * 0.75));
  save(game);
}

function resurrect() {
  player.alive = true;
  player.remove = false;
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.setAnim('idle', { force: true });
  state = 'playing';
  enterArea('town', null, true);
  ui.say('You wake in the encampment. Your gold lies where you fell.', 4);
}

// ------------------------------------------------------------------- action

function playerAttack(target) {
  player.busy = 0.42 / player.attackSpeed;
  player.face(target.x, target.y);
  audio.sfx('swing');
  player.setAnim('attack', {
    loop: false, force: true, hitFrame: 3,
    onHitFrame: () => {
      if (!target.alive || player.distTo(target) > 1.7) return;
      if (!rollHit(rng, player.attackRating, monsterDefense(target), player.level, target.mlvl)) {
        fx.float(target.x, target.y, 'miss', 'rgba(190,190,190,1)');
        return;
      }
      const raw = rollDamage(rng, player.minDamage, player.maxDamage, player.totals.ed, player.effective.str);
      // Enchant is fire laid on the weapon, so it rides the plain swing too.
      const dmg = { phys: raw };
      const fire = enchantFire(player, rng);
      if (fire > 0) dmg.fire = fire;
      gctx.damageMonster(target, dmg, { source: player });
    },
    onEnd: () => player.setAnim('idle'),
  });
}

function castsOnLeft() {
  return player.leftSkill && player.leftSkill !== 'attack';
}

// Clicking something out of reach walks to it and does the thing on arrival,
// rather than making you click a second time once you get there.
let pending = null;
const REACH = { npc: 3.4, item: 1.7, prop: 2, waypoint: 3.2 };

// Do the interaction if the target is close enough. Returns whether it fired.
function reach(kind, target) {
  if (!target || Math.hypot(target.x - player.x, target.y - player.y) > REACH[kind]) return false;
  pending = null;
  if (kind === 'npc') {
    player.stop();
    player.face(target.x, target.y);
    target.face(player.x, player.y);
    ui.talkTo(target);
    audio.sfx('quest');
  } else if (kind === 'waypoint') {
    player.stop();
    ui.toggle('waypoint');
  } else if (kind === 'item') {
    if (target.taken) return true;
    const got = pickUp(player, target);
    if (!got) { ui.say('No room for that'); audio.sfx('error'); }
    else audio.sfx(target.item.gold ? 'gold' : 'pickup');
  } else if (kind === 'prop') {
    if (!target.opened) openContainer(target);
  }
  return true;
}

// Interact now if you can, otherwise set off and remember what for.
function walkTo(kind, target) {
  if (reach(kind, target)) return;
  player.target = null;
  player.moveTo(level, target.x, target.y);
  pending = { kind, target };
}

// Called every step while walking toward something that was clicked at range.
function servePending() {
  if (!pending) return;
  const t = pending.target;
  const gone = (pending.kind === 'item' && t.taken)
    || (pending.kind === 'prop' && t.opened)
    || (pending.kind === 'npc' && !t.alive);
  if (gone) { pending = null; return; }
  if (reach(pending.kind, t)) return;
  // Walked as far as the path went and still short: give up rather than hover.
  if (!player.path) pending = null;
}

// Returns castSkill's own result code ('ok' | 'locked' | 'mana' | 'failed') so
// callers can tell a melee veto (nothing in reach) apart from a mana refusal —
// the two need different fallbacks at the click site.
function doCast(id, tx, ty) {
  if (!id || id === 'attack') return 'locked';
  // A skill that eats corpses means the body near the click, not the ground it
  // is lying on, so the aim snaps to it before the cast reads the point.
  const sk0 = SKILL_BY_ID[id];
  if (sk0 && sk0.targetsCorpse) {
    const body = nearestCorpse(level, tx, ty, 1.6);
    if (body) { tx = body.x; ty = body.y; }
  }
  const r = castSkill(player, id, tx, ty, gctx);
  if (r === 'mana') { ui.say('Not enough mana'); audio.sfx('error'); return r; }
  if (r !== 'ok') return r;
  const sk = SKILL_BY_ID[id];
  if (!sk.melee) {
    // Casts take the cast animation and the FCR lockout. A melee skill has
    // already set its own attack animation and weapon-speed busy inside cast().
    player.busy = 0.4 / (1 + player.castRate / 100);
    player.face(tx, ty);
    audio.sfx('cast');
    player.setAnim('cast', { loop: false, force: true, onEnd: () => player.setAnim('idle') });
  }
  return r;
}

// The bar's clickable rectangles, kept from the last frame it was drawn. The
// layout only depends on the canvas size, so a frame of lag cannot matter.
let hudRegions = null;

function inRect(r, x, y) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }

// A click on the bar itself: a belt slot drinks, a skill button opens the picker.
function hudClick(mx, my) {
  if (!hudRegions) return false;
  for (const b of hudRegions.belt) {
    if (!inRect(b, mx, my)) continue;
    if (!drinkBelt(b.index)) { ui.say('That belt slot is empty'); audio.sfx('error'); }
    return true;
  }
  for (const sb of hudRegions.skills) {
    if (!inRect(sb, mx, my)) continue;
    ui.openPicker(sb.side);
    return true;
  }
  return false;
}

function drinkBelt(i) {
  const p = player.belt[i];
  if (!p) return false;
  if (p.potion === 'life') { player.heal(p.amount); fx.float(player.x, player.y, `+${p.amount}`, 'rgba(255,120,110,1)'); }
  else { player.restoreMana(p.amount); fx.float(player.x, player.y, `+${p.amount}`, 'rgba(120,140,255,1)'); }
  player.belt[i] = null;
  audio.sfx('potion');
  return true;
}

function entityUnderCursor() {
  const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
  let best = null, bd = 1.15;
  for (const e of level.entities) {
    // A summoned turret is scenery: nothing hovers it, nothing clicks it.
    if (!e.alive || e.isPlayer || e.isPet) continue;
    const d = Math.hypot(e.x - w.x, e.y - w.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function groundItemUnderCursor() {
  const mx = Input.mouse.x, my = Input.mouse.y;
  for (let i = level.items.length - 1; i >= 0; i--) {
    const gi = level.items[i];
    if (gi.taken || !gi.labelRect) continue;
    const r = gi.labelRect;
    if (mx >= r.x && my >= r.y && mx < r.x + r.w && my < r.y + r.h) return gi;
  }
  const w = cam.toWorld(mx, my);
  for (const gi of level.items) {
    if (gi.taken) continue;
    if (Math.hypot(gi.x - w.x, gi.y - w.y) < 0.6) return gi;
  }
  return null;
}

function propUnderCursor() {
  const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
  for (const p of level.props) {
    if (p.opened) continue;
    if (p.name !== 'chest' && p.name !== 'barrel') continue;
    if (Math.hypot(p.x - w.x, p.y - w.y) < 0.85) return p;
  }
  return null;
}

function openContainer(p) {
  p.opened = true;
  audio.sfx('chest');
  fx.burst('dust', p.x, p.y, 12, { z: 8, spread: 1.6, r: 120, g: 105, b: 80 });
  dropFromContainer(level, p.x, p.y, level.areaLevel + 1, player, rng);
}

// ------------------------------------------------------------------- update

function checkTransitions(dt) {
  // The killing blow lands in the middle of the step, so this pass runs once
  // more on the frame you died: a corpse must not walk through the door it fell
  // against, light a waypoint, or pick its own gold back up off the floor.
  if (state === 'dead') return;
  transitionCool -= dt;
  if (transitionCool > 0) return;

  if (suppressedExit && Math.hypot(suppressedExit.x - player.x, suppressedExit.y - player.y) > 2.4) {
    suppressedExit = null;
  }
  for (const e of level.exits) {
    if (e === suppressedExit) continue;
    if (Math.hypot(e.x - player.x, e.y - player.y) < 1.15) {
      audio.sfx('portal');
      enterArea(e.to, areaId, false);
      return;
    }
  }
  if (level.waypoint) {
    const d = Math.hypot(level.waypoint.x - player.x, level.waypoint.y - player.y);
    if (d < 2.2 && !player.waypoints[areaId]) {
      player.waypoints[areaId] = true;
      ui.say(`${level.name} waypoint found`, 3);
      audio.sfx('waypoint');
      save(game);
    }
  }
  if (corpse && corpse.area === areaId && Math.hypot(corpse.x - player.x, corpse.y - player.y) < 1.4) {
    player.gold += corpse.gold;
    ui.say(`Recovered ${corpse.gold} gold`, 2.5);
    audio.sfx('gold');
    corpse = null;
    save(game);
  }
}

function step(dt) {
  clock += dt;
  gctx.dt = dt;
  ui.update(dt);

  if (state === 'dead') {
    deathScreenT += dt;
    player.updateAnim(dt);
    for (const e of level.entities) if (!e.isPlayer && !e.isNpc) updateAI(e, dt, gctx);
    fx.update(dt);
    if (Input.consume('Enter') || Input.consume('Space') || (deathScreenT > 1.2 && Input.consumeL())) resurrect();
    Input.endFrame();
    return;
  }

  if (state === 'title') {
    if (titleStep === 'class' && Input.consume('Escape')) titleStep = 'menu';
    Input.endFrame();
    return;
  }

  if (state !== 'playing' && state !== 'won') { Input.endFrame(); return; }

  if (Input.consume('KeyI')) ui.toggle('inventory');
  if (Input.consume('KeyC')) ui.toggle('character');
  if (Input.consume('KeyT')) ui.toggle('skills');
  if (Input.consume('Space')) ui.closeAll();
  if (Input.consume('Escape')) ui.closeAll();
  if (Input.consume('Tab')) ui.mapMode = !ui.mapMode;
  if (Input.consume('KeyM')) { audio.setMuted(!audio.isMuted()); ui.say(audio.isMuted() ? 'Sound off' : 'Sound on'); }
  for (let i = 0; i < 4; i++) if (Input.consume('Digit' + (i + 1))) drinkBelt(i);

  const mx = Input.mouse.x, my = Input.mouse.y;
  const overHud = my > canvas.height - HUD_H * uiScale;
  const overPanel = ui.pointerOverPanel(mx, my, gctx);

  // The wheel's only job is a list that outran its panel: the shop's stock, or
  // the skill picker's rows once thirty skills are unlocked. Both clamp while
  // drawing, so an over-scroll here is harmless.
  if (Input.mouse.wheel) {
    if (ui.open === 'vendor') ui.vendorScroll += Input.mouse.wheel;
    else if (ui.open === 'skillpicker') ui.pickerScroll += Input.mouse.wheel;
  }

  if (Input.consumeL()) {
    if (ui.mouseDown(mx, my, player, gctx, 0)) {
      // a panel took it
    } else if (overHud) {
      hudClick(mx, my);
    } else {
      const gi = groundItemUnderCursor();
      const prop = propUnderCursor();
      const m = entityUnderCursor();
      const w = cam.toWorld(mx, my);
      // Talking to someone and using the waypoint are both walk-up actions.
      const wpNear = level.waypoint && Math.hypot(level.waypoint.x - w.x, level.waypoint.y - w.y) < 1.6;

      pending = null;
      if (m && m.isNpc) {
        walkTo('npc', m);
      } else if (wpNear && player.waypoints[areaId]) {
        walkTo('waypoint', level.waypoint);
      } else if (gi) {
        walkTo('item', gi);
      } else if (prop) {
        walkTo('prop', prop);
      } else if (castsOnLeft()) {
        // A skill bound to the left button casts where you click, as in the
        // original — which is why Attack is what sits there by default.
        if (player.busy <= 0) {
          player.target = null; player.stop();
          const r = doCast(player.leftSkill, w.x, w.y);
          // Mouse clicks are the game's only movement: a melee skill's veto
          // (nothing in reach) must still send the player toward the click
          // rather than doing nothing. Mana refusal keeps its own toast and
          // does not walk — that path is unchanged.
          if (r === 'failed' && SKILL_BY_ID[player.leftSkill].melee) player.moveTo(level, w.x, w.y);
        }
      } else if (m && !m.isNpc) {
        player.target = m;
        if (player.distTo(m) <= 1.6) { player.stop(); playerAttack(m); }
        else player.moveTo(level, m.x, m.y);
      } else {
        player.target = null;
        player.moveTo(level, w.x, w.y);
      }
    }
  } else if (Input.mouse.downL && !overHud && !overPanel && player.busy <= 0 && !ui.drag && !player.target) {
    const w = cam.toWorld(mx, my);
    if (castsOnLeft()) {
      const r = doCast(player.leftSkill, w.x, w.y);
      // Same fallback as the click variant, guarded the same way the plain
      // walk below is: do not recompute the path every held frame.
      if (r === 'failed' && SKILL_BY_ID[player.leftSkill].melee
        && (!player.moveGoal || Math.hypot(w.x - player.moveGoal.x, w.y - player.moveGoal.y) > 0.8)) {
        player.moveTo(level, w.x, w.y);
      }
    } else if (!player.moveGoal || Math.hypot(w.x - player.moveGoal.x, w.y - player.moveGoal.y) > 0.8) {
      player.moveTo(level, w.x, w.y);
    }
  }

  if (Input.consumeR()) {
    if (!ui.mouseDown(mx, my, player, gctx, 2) && !overHud && player.busy <= 0) {
      const w = cam.toWorld(mx, my);
      doCast(player.rightSkill, w.x, w.y);
    }
  } else if (Input.mouse.downR && !overPanel && !overHud && player.busy <= 0) {
    const w = cam.toWorld(mx, my);
    doCast(player.rightSkill, w.x, w.y);
  }

  if (Input.mouse.releasedL) ui.mouseUp(mx, my, player, gctx);

  if (player.target && player.busy <= 0 && player.target.alive && player.distTo(player.target) <= 1.6) {
    player.stop(); playerAttack(player.target);
  }
  if (player.target && !player.target.alive) player.target = null;

  player.update(dt, level);
  servePending();
  tickBurn(player, dt);
  if (player.hp <= 0 && state === 'playing') die();

  for (const e of level.entities) {
    if (e.isPlayer || e.isNpc) continue;
    if (e.alive && e.burning > 0) {
      const before = e.hp;
      tickBurn(e, dt);
      if (!e.alive && before > 0) killMonster(e);
    }
    updateAI(e, dt, gctx);
    if (!e.alive && e.corpseTimer > 45) e.remove = true;
  }
  tickBuffs(gctx, dt);
  tickHazards(gctx, dt);
  tickPets(gctx, dt);
  level.removeDead();
  projectiles.update(dt, gctx);

  // Gold is picked up by walking over it. Anything already taken is dropped from
  // the list here rather than at pick-up time, so nothing iterates it twice.
  for (let i = level.items.length - 1; i >= 0; i--) {
    const gi = level.items[i];
    if (gi.taken) { level.items.splice(i, 1); continue; }
    if (!gi.item.gold) continue;
    if (Math.hypot(gi.x - player.x, gi.y - player.y) < 1.2 && pickUp(player, gi)) audio.sfx('gold');
  }

  checkTransitions(dt);
  fx.update(dt);
  cam.follow(player, dt);
  cam.updateShake(dt);
  level.markExplored(player.x, player.y, 12);
  Input.endFrame();
}

// --------------------------------------------------------------------- draw

function drawTitle() {
  ctx2d.fillStyle = '#08070b';
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  const s = uiScale;
  const cx = canvas.width / 2, cy = canvas.height / 2;

  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#c8a03a';
  ctx2d.font = `${Math.round(56 * s)}px Georgia, serif`;
  ctx2d.fillText('SANCTUARY', cx, cy - 90 * s);
  ctx2d.fillStyle = '#6a6050';
  ctx2d.font = `${Math.round(15 * s)}px Georgia, serif`;
  ctx2d.fillText('every pixel and every sound generated at load', cx, cy - 56 * s);

  if (titleStep === 'class') { drawClassSelect(cx, cy, s); return; }

  const options = [{ id: 'new', label: 'New Game' }];
  if (hasSave()) options.unshift({ id: 'continue', label: 'Continue' });
  titleAreas = [];
  options.forEach((o, i) => {
    const w = 260 * s, h = 44 * s;
    const x = cx - w / 2, y = cy - 10 * s + i * 56 * s;
    const hov = Input.mouse.x >= x && Input.mouse.x < x + w && Input.mouse.y >= y && Input.mouse.y < y + h;
    panel(ctx2d, x, y, w, h, { border: hov ? '#c8a03a' : '#5a4f36' });
    ctx2d.fillStyle = hov ? '#ffe08a' : '#c8b070';
    ctx2d.font = `${Math.round(19 * s)}px Georgia, serif`;
    ctx2d.fillText(o.label, cx, y + 29 * s);
    titleAreas.push({ x, y, w, h, id: o.id });
  });

  ctx2d.fillStyle = '#4a4235';
  ctx2d.font = `${Math.round(12 * s)}px Georgia, serif`;
  ctx2d.fillText('left click move and attack   right click cast   I inventory   C character   T skills   Tab map   1-4 potions   M mute',
    cx, canvas.height - 40 * s);
  ctx2d.textAlign = 'left';
}

const CLASS_CARDS = [
  { id: 'sorceress', name: 'Sorceress', line: 'Fire, ice and lightning, from a safe distance.' },
  { id: 'barbarian', name: 'Barbarian', line: 'Thirty pounds of steel, from no distance at all.' },
];

// The two doors in, in the order they should be considered: the game as written
// first, the try-out second. Picking one arms the class cards below -- the class
// is still the click that starts the game.
const MODE_CARDS = [
  { id: 'classic', name: 'Classic', line: 'Level one, a starter kit, the road east shut.' },
  { id: 'yolo', name: 'Yolo', line: 'Level fifty, every skill, every waypoint, best gear.' },
];
let startMode = 'classic';

function drawClassSelect(cx, cy, s) {
  titleAreas = [];
  const w = 240 * s, h = 250 * s, gap = 40 * s;
  CLASS_CARDS.forEach((c, i) => {
    const x = cx - w - gap / 2 + i * (w + gap), y = cy - h / 2 + 30 * s;
    const hov = Input.mouse.x >= x && Input.mouse.x < x + w && Input.mouse.y >= y && Input.mouse.y < y + h;
    panel(ctx2d, x, y, w, h, { border: hov ? '#c8a03a' : '#5a4f36' });
    // Portrait: the baked idle sprite, scaled with hard pixels.
    const sheet = assets.figures[c.id];
    const ix = sheet.index('idle', 2, 0);
    const ps = 140 * s;
    ctx2d.save();
    ctx2d.imageSmoothingEnabled = false;
    ctx2d.drawImage(sheet.canvas, ix.sx, ix.sy, 80, 80, x + (w - ps) / 2, y + 18 * s, ps, ps);
    ctx2d.restore();
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = hov ? '#ffe08a' : '#c8b070';
    ctx2d.font = `${Math.round(20 * s)}px Georgia, serif`;
    ctx2d.fillText(c.name, x + w / 2, y + h - 54 * s);
    ctx2d.fillStyle = '#8a7f6a';
    ctx2d.font = `${Math.round(12 * s)}px Georgia, serif`;
    ctx2d.fillText(c.line, x + w / 2, y + h - 32 * s);
    titleAreas.push({ x, y, w, h, id: c.id });
  });
  // The mode row, in the cards' own columns so the two choices read as one
  // screen: pick a start, then pick a class. The chosen mode is lit gold whether
  // or not the pointer is on it, because it stays chosen after the pointer moves.
  const mw = w, mh = 52 * s, my = cy + h / 2 + 44 * s;
  MODE_CARDS.forEach((m, i) => {
    const x = cx - mw - gap / 2 + i * (mw + gap);
    const hov = Input.mouse.x >= x && Input.mouse.x < x + mw && Input.mouse.y >= my && Input.mouse.y < my + mh;
    const on = startMode === m.id;
    panel(ctx2d, x, my, mw, mh, { border: on ? '#c8a03a' : (hov ? '#8a7a4a' : '#5a4f36') });
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = on ? '#ffe08a' : (hov ? '#c8b070' : '#8a7f6a');
    ctx2d.font = `${Math.round(17 * s)}px Georgia, serif`;
    ctx2d.fillText(m.name, x + mw / 2, my + 22 * s);
    ctx2d.fillStyle = on ? '#9a8f70' : '#6a6050';
    ctx2d.font = `${Math.round(10 * s)}px Georgia, serif`;
    ctx2d.fillText(m.line, x + mw / 2, my + 40 * s);
    titleAreas.push({ x, y: my, w: mw, h: mh, id: `mode:${m.id}` });
  });

  ctx2d.fillStyle = '#6a6050';
  ctx2d.font = `${Math.round(12 * s)}px Georgia, serif`;
  ctx2d.textAlign = 'center';
  ctx2d.fillText('Esc to go back', cx, my + mh + 26 * s);
  ctx2d.textAlign = 'left';
}
let titleAreas = [];
let titleStep = 'menu';

function drawDeath() {
  const s = uiScale;
  ctx2d.fillStyle = `rgba(40,0,0,${Math.min(0.6, deathScreenT * 0.5)})`;
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  if (deathScreenT < 0.5) return;
  const cx = canvas.width / 2, cy = canvas.height / 2;
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#c02a2a';
  ctx2d.font = `${Math.round(44 * s)}px Georgia, serif`;
  ctx2d.fillText('You have died', cx, cy - 20 * s);
  ctx2d.fillStyle = '#9a8f70';
  ctx2d.font = `${Math.round(15 * s)}px Georgia, serif`;
  ctx2d.fillText(corpse ? `${corpse.gold} gold lies where you fell in ${AREA_BY_ID[corpse.area].name}` : 'You carried nothing',
    cx, cy + 16 * s);
  if (deathScreenT > 1.2) {
    ctx2d.fillStyle = '#c8b070';
    ctx2d.fillText('Click, or press Enter, to wake in the encampment', cx, cy + 52 * s);
  }
  ctx2d.textAlign = 'left';
}

// Baal sets `won`, and nothing else does: the four earlier bosses are gates.
// The banner sits over a world that is still running -- the state permits play,
// so this is a caption on the game rather than a curtain across it.
function drawWon() {
  const s = uiScale;
  const cx = canvas.width / 2;
  ctx2d.fillStyle = 'rgba(10,8,14,0.55)';
  ctx2d.fillRect(0, 60 * s, canvas.width, 90 * s);
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#c8a03a';
  ctx2d.font = `${Math.round(30 * s)}px Georgia, serif`;
  ctx2d.fillText('The Worldstone falls quiet', cx, 105 * s);
  ctx2d.fillStyle = '#9a8f70';
  ctx2d.font = `${Math.round(14 * s)}px Georgia, serif`;
  ctx2d.fillText('Baal is destroyed and all five acts are behind you. Keep playing if you like.', cx, 132 * s);
  ctx2d.textAlign = 'left';
}

function render() {
  renderer.draw(level, cam, { player, fx, projectiles, time: clock, playerLightRadius: 8.5 });
}

// The scene, then the cursor on top of everything. `drawFrame` reports what the
// pointer is over so the cursor can say whether a click will hit, take or talk.
let cursorMode = 'pointer';

function draw(fps) {
  cursorMode = 'pointer';
  drawFrame(fps);
  drawCursor(ctx2d, Input.mouse.x, Input.mouse.y, cursorMode, uiScale);
}

function drawFrame(fps) {
  if (state === 'loading') {
    pumpLoading();
    ctx2d.fillStyle = '#0b0a0e';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    const s = uiScale;
    const w = Math.min(420 * s, canvas.width - 80 * s);
    const x = (canvas.width - w) / 2, y = canvas.height / 2;
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = '#c8a03a';
    ctx2d.font = `${Math.round(30 * s)}px Georgia, serif`;
    ctx2d.fillText('SANCTUARY', canvas.width / 2, y - 46 * s);
    ctx2d.fillStyle = '#5f5646';
    ctx2d.font = `${Math.round(12 * s)}px Georgia, serif`;
    ctx2d.fillText(`generating ${loadLabel}`, canvas.width / 2, y - 18 * s);
    ctx2d.textAlign = 'left';
    ctx2d.strokeStyle = '#4a4235';
    ctx2d.lineWidth = 1;
    ctx2d.strokeRect(x + 0.5, y + 0.5, w, 12 * s);
    ctx2d.fillStyle = '#8a6a2a';
    ctx2d.fillRect(x + 2, y + 2, (w - 4) * loadPct, 9 * s);
    return;
  }

  if (state === 'title') { drawTitle(); return; }

  render();

  const hovered = groundItemUnderCursor();
  drawGroundLabels(ctx2d, level, cam, { scale: uiScale, showAll: Input.alt, player, hovered });
  const m = entityUnderCursor();
  if (m) drawMonsterBanner(ctx2d, m, cam, uiScale);

  if (m) cursorMode = m.isNpc ? 'talk' : 'hostile';
  else if (hovered || propUnderCursor()) cursorMode = 'take';

  // Corpse marker, so the gold you lost is findable.
  if (corpse && corpse.area === areaId) {
    const p = cam.toScreen(corpse.x, corpse.y);
    const pr = getProp('bones', 0);
    if (pr) ctx2d.drawImage(pr.canvas, p.x - pr.ox * cam.zoom, p.y - pr.oy * cam.zoom,
      pr.canvas.width * cam.zoom, pr.canvas.height * cam.zoom);
    ctx2d.fillStyle = '#ffd24a';
    ctx2d.font = `${Math.round(12 * uiScale)}px Georgia, serif`;
    ctx2d.textAlign = 'center';
    ctx2d.fillText(`${corpse.gold} gold`, p.x, p.y - 22 * uiScale);
    ctx2d.textAlign = 'left';
  }

  // Over the bar or an open panel the pointer is a pointer, whatever lies in
  // the world behind them.
  if (Input.mouse.y > canvas.height - HUD_H * uiScale || ui.pointerOverPanel(Input.mouse.x, Input.mouse.y, gctx)) {
    cursorMode = 'pointer';
  }

  drawMinimap(ctx2d, level, player, ui.mapMode ? 'overlay' : 'corner', canvas.width, canvas.height, uiScale);
  hudRegions = drawHUD(ctx2d, player, { scale: uiScale, iconFor, mouse: Input.mouse });
  ui.onTravel = travelTo;
  ui.onAskPassage = askPassage;
  ui.draw(ctx2d, player, {
    scale: uiScale, mouse: Input.mouse,
    currentArea: areaId,
  });

  if (state === 'dead') drawDeath();
  if (state === 'won') drawWon();

  ctx2d.fillStyle = '#6a6050';
  ctx2d.font = `${Math.round(12 * uiScale)}px Georgia, serif`;
  ctx2d.fillText(`${level.name}   ${fps} fps`, 12 * uiScale, 18 * uiScale);
}

// Title screen clicks and the first-gesture audio unlock.
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (state !== 'title') return;
  const r = canvas.getBoundingClientRect();
  const dpr = canvas.width / r.width;
  const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
  for (const a of titleAreas) {
    if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) {
      if (a.id === 'new') { titleStep = 'class'; startMode = 'classic'; return; }
      if (a.id === 'continue') { continueGame(); audio.ambient(level); return; }
      if (a.id.startsWith('mode:')) { startMode = a.id.slice(5); return; }
      newGame(a.id, startMode);             // 'sorceress' | 'barbarian'
      audio.ambient(level);
      return;
    }
  }
});
window.addEventListener('keydown', () => audio.unlock(), { once: true });
window.addEventListener('beforeunload', () => { if (state === 'playing') save(game); });

// Verification hooks. A backgrounded tab throttles requestAnimationFrame to
// about one frame a second, which makes the chunked loader take a minute under
// automation and any rAF-based timing meaningless.
window.__forceLoad = () => { while (state === 'loading') pumpLoading(); return true; };
window.__newGame = (cls, mode) => { newGame(cls, mode); return areaId; };
window.__continue = () => { continueGame(); return areaId; };
window.__render = render;
window.__step = step;
window.__sheetFor = (figure) => assets.figures[figure];
window.__audio = audio;
window.__save = () => save(game);
window.__clearSave = clearSave;
window.__enter = (id) => { enterArea(id, null, true); return areaId; };
// The mechanics the new skills are built from. Nothing casts them until the
// skill definitions land, and the formula-check harness exercises them one at a
// time, so this is how they are reached from outside.
window.__mech = {
  addHazard, tickHazards, addPet, tickPets, beam, tickBuffs, addStack, stackCount,
  nearestCorpse, consumeCorpse, taunt, SKILL_BY_ID,
};
window.__killBoss = () => {
  const b = level.entities.find((e) => e.rank === 'boss' && e.alive);
  if (!b) return null;
  b.hp = 0; b.die();
  killMonster(b);
  return b.def.name;
};
Object.defineProperty(window, '__g', {
  get: () => ({ player, level, fx, gctx, projectiles, ui, cam, state, areaId, levels, corpse, seed,
    setState: (s) => { state = s; }, get: (k) => ({ player, level, state, areaId, corpse })[k] }),
});

startLoop({ step, draw });
