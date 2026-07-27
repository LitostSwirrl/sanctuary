// Phase 11 harness: the slice with its full interface. Area transitions,
// quests, death and save/load arrive in the next task.

import { startLoop } from './core/loop.js';
import { Camera } from './core/iso.js';
import { Input } from './core/input.js';
import { Rng } from './core/rng.js';
import { bakeTiles } from './art/tiles.js';
import { bakeAllFigures } from './art/figures.js';
import { Particles, FX } from './art/fx.js';
import { iconFor } from './art/icons.js';
import { AREAS } from './world/levels.js';
import { generate } from './world/gen.js';
import { Renderer } from './render/renderer.js';
import { drawMinimap } from './render/minimap.js';
import { Player } from './game/player.js';
import { applyDamage, applyChill, rollHit, rollDamage, tickBurn, xpPenalty } from './game/combat.js';
import { populate, spawnBoss, Monster } from './game/monster.js';
import { updateAI } from './game/ai.js';
import { dropLoot, pickUp, addToInventory, removeFromInventory, sellValue } from './game/loot.js';
import { Projectiles } from './game/projectile.js';
import { SKILLS, SKILL_BY_ID, castSkill, allocate, refreshPassives, skillLevel } from './game/skills.js';
import { UI } from './ui/panels.js';
import { drawHUD, drawGroundLabels, drawMonsterBanner, HUD_H } from './ui/hud.js';

const canvas = document.getElementById('game');
const ctx2d = canvas.getContext('2d');
const cam = new Camera();
const renderer = new Renderer(canvas);
const ui = new UI();
Input.attach(canvas);

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

const assets = { figures: {} };
let ready = false;
function* allBakers() { yield* bakeTiles(); yield* bakeAllFigures(assets.figures); }
const baker = allBakers();
window.__forceLoad = () => { while (!ready) if (baker.next().done) { ready = true; build(); } return true; };

let level = null, player = null, clock = 0, areaIdx = 2;
const fx = new Particles();
const projectiles = new Projectiles();
const rng = new Rng(20260728);

function build() {
  const def = AREAS[areaIdx];
  level = generate(def, 20260728 + areaIdx * 7919);
  player = new Player({ x: level.start.x, y: level.start.y, sheet: assets.figures.sorceress });
  player.level = 12;
  player.statPoints = 20;
  player.skillPoints = 14;
  allocate(player, 'firebolt'); allocate(player, 'warmth'); allocate(player, 'fireball');
  allocate(player, 'icebolt'); allocate(player, 'chargedbolt'); allocate(player, 'staticfield');
  allocate(player, 'teleport');
  player.rightSkill = 'fireball';
  refreshPassives(player);
  player.gold = 2500;
  player.recalc(true);
  for (let i = 0; i < 4; i++) player.belt[i] = null;
  populate(level, def, rng, assets.figures);
  if (def.boss) spawnBoss(level, def.boss, rng, assets.figures);
  cam.x = player.x; cam.y = player.y;
  level.markExplored(player.x, player.y, 14);
  fx.clear(); projectiles.clear();
  ui.vendorStock = null;
}

// ---------------------------------------------------------------- game ctx

function killMonster(m) {
  const pen = xpPenalty(player.level, m.mlvl);
  player.gainXp(Math.round(m.xpValue * pen), (lvl) => {
    FX.levelUp(fx, player.x, player.y);
    ui.say(`Welcome to level ${lvl}`);
  });
  FX.death(fx, m.x, m.y);
  dropLoot(level, m, player, rng);
}

const gctx = {
  get level() { return level; },
  get player() { return player; },
  fx, rng, projectiles, dt: 1 / 60,
  get time() { return clock; },
  sfx: null,
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
      if (opts.absolute === undefined) FX.hitSpark(fx, m.x, m.y);
    }
    if (!m.alive) killMonster(m);
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

  resurrect(shaman, corpse) {
    corpse.resurrected = true;
    const m = new Monster(corpse.defId, corpse.mlvl, { x: corpse.x, y: corpse.y, rng, sheet: corpse.sheet });
    m.state = 'chase';
    level.addEntity(m);
    corpse.remove = true;
    fx.burst('ember', corpse.x, corpse.y, 18, { z: 8, spread: 2.4, r: 255, g: 180, b: 60 });
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
  const before = player.hp;
  applyDamage(player, dmg, { source });
  const dealt = before - player.hp;
  if (dealt > 0) {
    fx.float(player.x, player.y, `-${Math.round(dealt)}`, 'rgba(255,90,80,1)');
    cam.addShake(2.2);
  }
}

function playerAttack(target) {
  player.busy = 0.42 / player.attackSpeed;
  player.face(target.x, target.y);
  player.setAnim('attack', {
    loop: false, force: true, hitFrame: 3,
    onHitFrame: () => {
      if (!target.alive || player.distTo(target) > 1.6) return;
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
  if (r === 'mana') { ui.say('Not enough mana'); return false; }
  if (r !== 'ok') return false;
  player.busy = 0.4 / (1 + player.castRate / 100);
  player.face(tx, ty);
  player.setAnim('cast', { loop: false, force: true, onEnd: () => player.setAnim('idle') });
  return true;
}

function drinkBelt(i) {
  const p = player.belt[i];
  if (!p) return false;
  if (p.potion === 'life') { player.heal(p.amount); fx.float(player.x, player.y, `+${p.amount}`, 'rgba(255,120,110,1)'); }
  else { player.restoreMana(p.amount); fx.float(player.x, player.y, `+${p.amount}`, 'rgba(120,140,255,1)'); }
  player.belt[i] = null;
  return true;
}

function entityUnderCursor() {
  const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
  let best = null, bd = 1.1;
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
    if (Math.hypot(gi.x - w.x, gi.y - w.y) < 0.55) return gi;
  }
  return null;
}

// ------------------------------------------------------------------- update

function step(dt) {
  if (!ready) return;
  clock += dt;
  gctx.dt = dt;
  ui.update(dt);

  if (Input.consume('KeyI')) ui.toggle('inventory');
  if (Input.consume('KeyC')) ui.toggle('character');
  if (Input.consume('KeyT')) ui.toggle('skills');
  if (Input.consume('KeyV')) { ui.toggle('vendor'); if (ui.open === 'vendor') ui.ensureStock(rng, level.areaLevel); }
  if (Input.consume('Space')) ui.closeAll();
  if (Input.consume('Escape')) ui.closeAll();
  if (Input.consume('Tab')) ui.mapMode = !ui.mapMode;
  if (Input.consume('BracketRight')) { areaIdx = (areaIdx + 1) % AREAS.length; build(); return; }
  for (let i = 0; i < 4; i++) if (Input.consume('Digit' + (i + 1))) drinkBelt(i);

  const mx = Input.mouse.x, my = Input.mouse.y;
  const overHud = my > canvas.height - HUD_H * uiScale;
  const overPanel = ui.pointerOverPanel(mx, my, gctx);

  if (Input.consumeL()) {
    if (ui.mouseDown(mx, my, player, gctx, 0)) { /* consumed by a panel */ }
    else if (!overHud) {
      const gi = groundItemUnderCursor();
      const m = entityUnderCursor();
      if (gi) {
        if (Math.hypot(gi.x - player.x, gi.y - player.y) < 1.6) {
          if (!pickUp(player, gi)) ui.say('No room for that');
        } else player.moveTo(level, gi.x, gi.y);
      } else if (m) {
        player.target = m;
        if (player.distTo(m) <= 1.5) { player.stop(); playerAttack(m); }
        else player.moveTo(level, m.x, m.y);
      } else {
        const w = cam.toWorld(mx, my);
        player.target = null;
        player.moveTo(level, w.x, w.y);
      }
    }
  } else if (Input.mouse.downL && !overHud && !overPanel && player.alive && player.busy <= 0 && !ui.drag) {
    const w = cam.toWorld(mx, my);
    if (!player.target && (!player.moveGoal || Math.hypot(w.x - player.moveGoal.x, w.y - player.moveGoal.y) > 0.8)) {
      player.moveTo(level, w.x, w.y);
    }
  }

  if (Input.consumeR()) {
    if (!ui.mouseDown(mx, my, player, gctx, 2) && !overHud && player.alive && player.busy <= 0) {
      const w = cam.toWorld(mx, my);
      doCast(player.rightSkill, w.x, w.y);
    }
  } else if (Input.mouse.downR && !overPanel && !overHud && player.alive && player.busy <= 0) {
    const w = cam.toWorld(mx, my);
    doCast(player.rightSkill, w.x, w.y);
  }

  if (Input.mouse.releasedL) ui.mouseUp(mx, my, player, gctx);

  if (player.target && player.alive && player.busy <= 0 && player.target.alive && player.distTo(player.target) <= 1.5) {
    player.stop(); playerAttack(player.target);
  }

  player.update(dt, level);
  tickBurn(player, dt);

  for (const e of level.entities) {
    if (e.isPlayer) continue;
    if (e.alive && e.burning > 0) {
      const before = e.hp;
      tickBurn(e, dt);
      if (!e.alive && before > 0) killMonster(e);
    }
    updateAI(e, dt, gctx);
    if (!e.alive && e.corpseTimer > 40) e.remove = true;
  }
  level.removeDead();
  projectiles.update(dt, gctx);

  for (const gi of level.items) {
    if (gi.taken || !gi.item.gold) continue;
    if (Math.hypot(gi.x - player.x, gi.y - player.y) < 1.1) pickUp(player, gi);
  }

  fx.update(dt);
  cam.follow(player, dt);
  cam.updateShake(dt);
  level.markExplored(player.x, player.y, 12);
  Input.endFrame();
}

function render() {
  renderer.draw(level, cam, { player, fx, projectiles, time: clock, playerLightRadius: 12 });
}

function draw(fps) {
  if (!ready) {
    ctx2d.fillStyle = '#0b0a0e'; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = '#c8b070'; ctx2d.font = '20px Georgia, serif';
    ctx2d.fillText('baking...', 40, 60);
    if (baker.next().done) { ready = true; build(); }
    return;
  }
  render();

  const hovered = groundItemUnderCursor();
  drawGroundLabels(ctx2d, level, cam, { scale: uiScale, showAll: Input.alt, player, hovered });
  const m = entityUnderCursor();
  if (m) drawMonsterBanner(ctx2d, m, cam, uiScale);

  drawMinimap(ctx2d, level, player, ui.mapMode ? 'overlay' : 'corner', canvas.width, canvas.height, uiScale);
  drawHUD(ctx2d, player, { scale: uiScale, iconFor });
  ui.draw(ctx2d, player, { scale: uiScale, mouse: Input.mouse });

  ctx2d.fillStyle = '#8a7f6a';
  ctx2d.font = `${Math.round(12 * uiScale)}px Georgia, serif`;
  ctx2d.fillText(`${level.name}   fps ${fps}   I inventory  C character  T skills  V vendor  Tab map  1-4 potions  [ ] next area`,
    12 * uiScale, 18 * uiScale);
}

// ------------------------------------------------------------------- checks

window.__uiChecks = () => {
  const out = {};
  const R = new Rng(31);
  const { rollItem, describe } = window.__items;

  // Equipping must move the character sheet by exactly what the item says.
  {
    const before = { hp: player.maxHp, ar: player.attackRating, def: player.defense, fire: player.resists.fire };
    const item = rollItem(R, 12, { baseId: 'quilted', rarity: 'normal' });
    item.mods = { life: 40, ar: 75, def: 30, resFire: 20 };
    item.defense = 30;
    item.req = { str: 0, dex: 0 };   // the Sorceress starts under Quilted's 12 strength
    const slot = { item, gx: 0, gy: 0 };
    player.inventory.push(slot);
    ui.equipFromBag(player, slot);
    const after = { hp: player.maxHp, ar: player.attackRating, def: player.defense, fire: player.resists.fire };
    out.equip = {
      lifeDelta: after.hp - before.hp, expectLife: 40,
      arDelta: after.ar - before.ar, expectAr: 75,
      defDelta: after.def - before.def, expectDef: 30,
      fireDelta: after.fire - before.fire, expectFire: 20,
      equipped: player.equipment.body === item,
    };
    out.equip.ok = out.equip.lifeDelta === 40 && out.equip.arDelta === 75
      && out.equip.defDelta === 30 && out.equip.fireDelta === 20 && out.equip.equipped;
    player.equipment.body = null; player.recalc();
  }

  // The bag must never let two items overlap.
  {
    player.inventory.length = 0;
    let placed = 0;
    for (let i = 0; i < 60; i++) {
      const it = rollItem(R, 10, {});
      if (it && addToInventory(player, it)) placed++;
    }
    let overlaps = 0, outOfBounds = 0;
    const occupied = {};
    for (const sl of player.inventory) {
      if (sl.gx < 0 || sl.gy < 0 || sl.gx + sl.item.w > 10 || sl.gy + sl.item.h > 4) outOfBounds++;
      for (let dy = 0; dy < sl.item.h; dy++) {
        for (let dx = 0; dx < sl.item.w; dx++) {
          const k = `${sl.gx + dx},${sl.gy + dy}`;
          if (occupied[k]) overlaps++;
          occupied[k] = 1;
        }
      }
    }
    out.grid = { placed, cellsUsed: Object.keys(occupied).length, overlaps, outOfBounds, capacity: 40 };
    out.grid.ok = overlaps === 0 && outOfBounds === 0 && Object.keys(occupied).length <= 40;
  }

  // The tree must refuse anything ungated.
  {
    const p2 = new Player({ x: 0, y: 0 });
    p2.skillPoints = 50;
    p2.level = 1;
    const meteorAtLevel1 = allocate(p2, 'meteor');
    const fireballNoPrereq = allocate(p2, 'fireball');
    p2.level = 30;
    const fireballStillNoPrereq = allocate(p2, 'fireball');
    allocate(p2, 'firebolt');
    const fireballNowOk = allocate(p2, 'fireball');
    p2.skillPoints = 0;
    const noPointsLeft = allocate(p2, 'icebolt');
    out.skills = {
      meteorAtLevel1, fireballNoPrereq, fireballStillNoPrereq, fireballNowOk, noPointsLeft,
      ok: !meteorAtLevel1 && !fireballNoPrereq && !fireballStillNoPrereq && fireballNowOk && !noPointsLeft,
    };
  }

  // Vendor arithmetic in both directions.
  {
    player.inventory.length = 0;
    player.gold = 1000;
    ui.vendorStock = null;
    const stock = ui.ensureStock(R, 6);
    const buyItem = stock.find((it) => it.price <= 1000);
    const goldBefore = player.gold;
    ui.hitAreas = [{ x: 0, y: 0, w: 10, h: 10, kind: 'buy', data: buyItem }];
    ui.open = 'vendor';
    ui.mouseDown(1, 1, player, gctx, 0);
    const afterBuy = player.gold;
    const gotItem = player.inventory.some((sl) => sl.item === buyItem);

    const sellIt = player.inventory[0].item;
    const expectSell = sellValue(sellIt);
    const beforeSell = player.gold;
    player.gold += expectSell;
    removeFromInventory(player, sellIt);
    out.vendor = {
      price: buyItem.price, goldBefore, afterBuy, paid: goldBefore - afterBuy, gotItem,
      sellValue: expectSell, afterSell: player.gold, gained: player.gold - beforeSell,
      stillInBag: player.inventory.some((sl) => sl.item === sellIt),
      ok: goldBefore - afterBuy === buyItem.price && gotItem
        && player.gold - beforeSell === expectSell
        && !player.inventory.some((sl) => sl.item === sellIt),
    };
    ui.open = null;
  }

  void describe;
  return out;
};

window.__setArea = (i) => { areaIdx = i; build(); return level.name; };
window.__render = render;
window.__ui = ui;
window.__addInv = (it) => addToInventory(player, it);
// Draw the whole interface at a chosen cursor position, for screenshots taken
// while the loop is stopped.
window.__drawUI = (mx, my) => {
  Input.mouse.x = mx; Input.mouse.y = my;
  drawMinimap(ctx2d, level, player, ui.mapMode ? 'overlay' : 'corner', canvas.width, canvas.height, uiScale);
  drawHUD(ctx2d, player, { scale: uiScale, iconFor });
  ui.draw(ctx2d, player, { scale: uiScale, mouse: Input.mouse });
};
Object.defineProperty(window, '__dbg', { get: () => ({ player, level, fx, gctx, projectiles, ui, cam }) });
import('./items/item.js').then((m) => { window.__items = m; });
window.__loop = startLoop({ step, draw });
void SKILLS; void SKILL_BY_ID; void skillLevel;
