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
import { bakeTiles, getProp } from './art/tiles.js';
import { bakeAllFigures } from './art/figures.js';
import { Particles, FX } from './art/fx.js';
import { iconFor, bakeIcons } from './art/icons.js';
import { AREAS, AREA_BY_ID, WAYPOINT_AREAS } from './world/levels.js';
import { generate } from './world/gen.js';
import { Renderer } from './render/renderer.js';
import { drawMinimap } from './render/minimap.js';
import { Player } from './game/player.js';
import { applyDamage, applyChill, rollHit, rollDamage, tickBurn, xpPenalty, xpForLevel } from './game/combat.js';
import { populate, spawnBoss, Monster } from './game/monster.js';
import { updateAI } from './game/ai.js';
import { dropLoot, dropFromContainer, pickUp, addToInventory, groundItem } from './game/loot.js';
import { Projectiles } from './game/projectile.js';
import { castSkill, allocate, refreshPassives } from './game/skills.js';
import { makeGold } from './items/item.js';
import { UI } from './ui/panels.js';
import { drawHUD, drawGroundLabels, drawMonsterBanner, HUD_H } from './ui/hud.js';
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
const TOTAL_BAKE_STEPS = 7 + 7 + 12 + 11 + 43;
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

function newGame() {
  seed = (Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  rng = new Rng(seed);
  levels.clear();
  corpse = null;
  player = new Player({ x: 0, y: 0, sheet: assets.figures.sorceress });
  allocate(player, 'firebolt');
  player.rightSkill = 'firebolt';
  player.leftSkill = 'attack';
  player.gold = 80;
  refreshPassives(player);
  player.recalc(true);
  enterArea('town', null, true);
  state = 'playing';
  save(game);
}

function continueGame() {
  const d = load();
  if (!d) { newGame(); return; }
  seed = d.seed;
  rng = new Rng(seed);
  levels.clear();
  player = new Player({ x: 0, y: 0, sheet: assets.figures.sorceress });
  let uid = 100000;
  applyTo(player, d, () => uid++);
  refreshPassives(player);
  corpse = d.corpse || null;
  enterArea(d.area || 'town', null, true);
  if (d.at) { player.x = d.at.x; player.y = d.at.y; }
  cam.x = player.x; cam.y = player.y;
  state = 'playing';
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
  player.target = null;
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

// ------------------------------------------------------------------ combat

function grantQuest(name, message, reward) {
  if (player.quests[name]) return;
  player.quests[name] = true;
  reward();
  ui.say(message, 4);
  audio.sfx('quest');
  save(game);
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
    } else if (m.defId === 'andariel') {
      grantQuest('andariel', 'Andariel is dead. The way beneath the monastery is clear.',
        () => { player.statPoints += 5; player.skillPoints += 2; });
      state = 'won';
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
    if (!rollHit(rng, m.attackRating, player.defense, m.mlvl, player.level)) {
      fx.float(player.x, player.y, 'miss', 'rgba(190,190,190,1)');
      return;
    }
    const raw = m.rollDamage(rng);
    const dmg = { phys: raw };
    if (m.enchant) dmg[m.enchant] = raw * 0.5;
    hurtPlayer(dmg, m);
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
      if (!rollHit(rng, player.attackRating, target.defense, player.level, target.mlvl)) {
        fx.float(target.x, target.y, 'miss', 'rgba(190,190,190,1)');
        return;
      }
      const raw = rollDamage(rng, player.minDamage, player.maxDamage, player.totals.ed, player.effective.str);
      gctx.damageMonster(target, { phys: raw }, { source: player });
    },
    onEnd: () => player.setAnim('idle'),
  });
}

function doCast(id, tx, ty) {
  if (!id || id === 'attack') return false;
  const r = castSkill(player, id, tx, ty, gctx);
  if (r === 'mana') { ui.say('Not enough mana'); audio.sfx('error'); return false; }
  if (r !== 'ok') return false;
  player.busy = 0.4 / (1 + player.castRate / 100);
  player.face(tx, ty);
  audio.sfx('cast');
  player.setAnim('cast', { loop: false, force: true, onEnd: () => player.setAnim('idle') });
  return true;
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
    if (!e.alive || e.isPlayer) continue;
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
    for (const e of level.entities) if (!e.isPlayer) updateAI(e, dt, gctx);
    fx.update(dt);
    if (Input.consume('Enter') || Input.consume('Space') || (deathScreenT > 1.2 && Input.consumeL())) resurrect();
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

  if (Input.consumeL()) {
    if (!ui.mouseDown(mx, my, player, gctx, 0) && !overHud) {
      const gi = groundItemUnderCursor();
      const prop = propUnderCursor();
      const m = entityUnderCursor();
      const w = cam.toWorld(mx, my);
      // Talking to the vendor and using the waypoint are both walk-up actions.
      const vendorNear = level.vendor && Math.hypot(level.vendor.x - w.x, level.vendor.y - w.y) < 1.6;
      const wpNear = level.waypoint && Math.hypot(level.waypoint.x - w.x, level.waypoint.y - w.y) < 1.6;

      if (vendorNear && Math.hypot(level.vendor.x - player.x, level.vendor.y - player.y) < 3.5) {
        ui.toggle('vendor'); if (ui.open === 'vendor') ui.ensureStock(rng, level.areaLevel);
      } else if (wpNear && player.waypoints[areaId]
                 && Math.hypot(level.waypoint.x - player.x, level.waypoint.y - player.y) < 3.5) {
        ui.toggle('waypoint');
      } else if (gi) {
        if (Math.hypot(gi.x - player.x, gi.y - player.y) < 1.7) {
          const got = pickUp(player, gi);
          if (!got) { ui.say('No room for that'); audio.sfx('error'); }
          else audio.sfx(gi.item.gold ? 'gold' : 'pickup');
        } else player.moveTo(level, gi.x, gi.y);
      } else if (prop) {
        if (Math.hypot(prop.x - player.x, prop.y - player.y) < 2) openContainer(prop);
        else player.moveTo(level, prop.x, prop.y);
      } else if (m) {
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
    if (!player.moveGoal || Math.hypot(w.x - player.moveGoal.x, w.y - player.moveGoal.y) > 0.8) {
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
  tickBurn(player, dt);
  if (player.hp <= 0 && state === 'playing') die();

  for (const e of level.entities) {
    if (e.isPlayer) continue;
    if (e.alive && e.burning > 0) {
      const before = e.hp;
      tickBurn(e, dt);
      if (!e.alive && before > 0) killMonster(e);
    }
    updateAI(e, dt, gctx);
    if (!e.alive && e.corpseTimer > 45) e.remove = true;
  }
  level.removeDead();
  projectiles.update(dt, gctx);

  for (const gi of level.items) {
    if (gi.taken || !gi.item.gold) continue;
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
let titleAreas = [];

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

function drawWon() {
  const s = uiScale;
  const cx = canvas.width / 2;
  ctx2d.fillStyle = 'rgba(10,8,14,0.55)';
  ctx2d.fillRect(0, 60 * s, canvas.width, 90 * s);
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#c8a03a';
  ctx2d.font = `${Math.round(30 * s)}px Georgia, serif`;
  ctx2d.fillText('Andariel is dead', cx, 105 * s);
  ctx2d.fillStyle = '#9a8f70';
  ctx2d.font = `${Math.round(14 * s)}px Georgia, serif`;
  ctx2d.fillText('The slice is finished. Keep playing if you like.', cx, 132 * s);
  ctx2d.textAlign = 'left';
}

function render() {
  renderer.draw(level, cam, { player, fx, projectiles, time: clock, playerLightRadius: 12 });
}

function draw(fps) {
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

  drawMinimap(ctx2d, level, player, ui.mapMode ? 'overlay' : 'corner', canvas.width, canvas.height, uiScale);
  drawHUD(ctx2d, player, { scale: uiScale, iconFor });
  ui.onTravel = travelTo;
  ui.draw(ctx2d, player, {
    scale: uiScale, mouse: Input.mouse,
    waypointAreas: WAYPOINT_AREAS.map((id) => AREA_BY_ID[id]),
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
      if (a.id === 'new') newGame(); else continueGame();
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
window.__newGame = () => { newGame(); return areaId; };
window.__continue = () => { continueGame(); return areaId; };
window.__render = render;
window.__step = step;
window.__sheetFor = (figure) => assets.figures[figure];
window.__save = () => save(game);
window.__clearSave = clearSave;
window.__enter = (id) => { enterArea(id, null, true); return areaId; };
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
