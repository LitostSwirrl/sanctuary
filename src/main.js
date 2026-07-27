// Phase 9 harness: a playable slice with live monsters, melee combat both
// ways, and loot. Projectiles are stubbed as hitscan until the next task.
// Replaced by the real state machine in a later task.

import { startLoop } from './core/loop.js';
import { Camera } from './core/iso.js';
import { Input } from './core/input.js';
import { Rng } from './core/rng.js';
import { bakeTiles } from './art/tiles.js';
import { bakeAllFigures } from './art/figures.js';
import { Particles, FX } from './art/fx.js';
import { AREAS } from './world/levels.js';
import { generate } from './world/gen.js';
import { Renderer } from './render/renderer.js';
import { drawMinimap } from './render/minimap.js';
import { Player } from './game/player.js';
import { applyDamage, rollHit, rollDamage, tickBurn, xpPenalty } from './game/combat.js';
import { populate, spawnBoss, spawnPack, Monster } from './game/monster.js';
import { updateAI } from './game/ai.js';
import { dropLoot, pickUp } from './game/loot.js';

const canvas = document.getElementById('game');
const ctx2d = canvas.getContext('2d');
const cam = new Camera();
const renderer = new Renderer(canvas);
Input.attach(canvas);

function resize() {
  const dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  cam.resize(canvas.width, canvas.height);
  cam.zoom = dpr;
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
const rng = new Rng(20260728);
const stubbedShots = [];
let log = [];

function build() {
  const def = AREAS[areaIdx];
  level = generate(def, 20260728 + areaIdx * 7919);
  player = new Player({ x: level.start.x, y: level.start.y, sheet: assets.figures.sorceress });
  player.stats.vit = 40; player.stats.str = 30; player.recalc(true);
  populate(level, def, rng, assets.figures);
  if (def.boss) spawnBoss(level, def.boss, rng, assets.figures);
  cam.x = player.x; cam.y = player.y;
  level.markExplored(player.x, player.y, 14);
  fx.clear();
  log = [];
}

// ------------------------------------------------------------- AI context

const aiCtx = {
  get level() { return level; },
  get player() { return player; },
  fx, rng, dt: 1 / 60,
  get time() { return clock; },

  // Stubbed until the projectile system lands: resolve as an instant hit so
  // ranged behaviour is still exercised end to end.
  spawnProjectile(o) {
    stubbedShots.push({ t: clock, owner: o.owner && o.owner.defId, element: o.element });
    const dmg = {};
    dmg[o.element === 'phys' ? 'phys' : o.element] = o.min + Math.random() * (o.max - o.min);
    hurtPlayer(dmg, o.owner);
    fx.arc(o.x, o.y, player.x, player.y, { z: 14, r: 255, g: 150, b: 60, life: 0.12 });
  },

  meleeHit(m) {
    const d = m.distTo(player);
    if (d > m.attackRange + 0.6) return;
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
    const d = m.distTo(player);
    if (d > o.radius) return;
    const dmg = {};
    dmg[o.element] = o.min + Math.random() * (o.max - o.min);
    hurtPlayer(dmg, m);
  },

  resurrect(shaman, corpse) {
    corpse.resurrected = true;
    const m = new Monster(corpse.defId, corpse.mlvl, {
      x: corpse.x, y: corpse.y, rank: 'normal', rng, sheet: corpse.sheet,
    });
    m.state = 'chase';
    level.addEntity(m);
    corpse.remove = true;
    fx.burst('ember', corpse.x, corpse.y, 18, { z: 8, spread: 2.4, r: 255, g: 180, b: 60 });
    log.push(`shaman resurrected ${corpse.defId} at ${clock.toFixed(1)}s`);
    return m;
  },

  summon(defId, x, y, mlvl) {
    const m = new Monster(defId, mlvl, { x, y, rank: 'normal', rng, sheet: assets.figures[Monster.prototype ? defId : defId] });
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
    FX.hitBlood(fx, player.x, player.y);
    cam.addShake(2.5);
  }
}

function killMonster(m) {
  const pen = xpPenalty(player.level, m.mlvl);
  player.gainXp(Math.round(m.xpValue * pen), (lvl) => {
    FX.levelUp(fx, player.x, player.y);
    fx.float(player.x, player.y, `Level ${lvl}`, 'rgba(255,230,140,1)', { life: 1.6 });
  });
  FX.death(fx, m.x, m.y);
  dropLoot(level, m, player, rng);
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
      const before = target.hp;
      applyDamage(target, { phys: raw }, { source: player });
      fx.float(target.x, target.y, String(Math.round(before - target.hp)), 'rgba(255,240,200,1)');
      FX.hitBlood(fx, target.x, target.y);
      if (!target.alive) killMonster(target);
    },
    onEnd: () => { player.setAnim('idle'); },
  });
}

function monsterUnderCursor() {
  const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
  let best = null, bd = 1.1;
  for (const e of level.entities) {
    if (!e.alive || e.isPlayer) continue;
    const d = Math.hypot(e.x - w.x, e.y - w.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ------------------------------------------------------------------- update

function step(dt) {
  if (!ready) return;
  clock += dt;

  if (Input.consume('BracketRight')) { areaIdx = (areaIdx + 1) % AREAS.length; build(); return; }

  if (Input.mouse.downL && player.alive && player.busy <= 0) {
    const m = monsterUnderCursor();
    if (m) {
      player.target = m;
      if (player.distTo(m) <= 1.5) { player.stop(); playerAttack(m); }
      else player.moveTo(level, m.x, m.y);
    } else {
      const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
      player.target = null;
      if (!player.moveGoal || Math.hypot(w.x - player.moveGoal.x, w.y - player.moveGoal.y) > 0.8) {
        player.moveTo(level, w.x, w.y);
      }
    }
  }
  if (player.target && player.alive && player.busy <= 0 && player.target.alive
      && player.distTo(player.target) <= 1.5) {
    player.stop();
    playerAttack(player.target);
  }

  player.update(dt, level);
  tickBurn(player, dt);

  for (const e of level.entities) {
    if (e.isPlayer) continue;
    if (e.alive) tickBurn(e, dt);
    updateAI(e, dt, aiCtx);
    if (!e.alive && e.corpseTimer > 40) e.remove = true;
  }
  level.removeDead();

  // Walk-over pickup for gold, click for the rest.
  for (const gi of level.items) {
    if (gi.taken) continue;
    const d = Math.hypot(gi.x - player.x, gi.y - player.y);
    if (gi.item.gold && d < 1.1) pickUp(player, gi);
    else if (d < 0.6) pickUp(player, gi);
  }

  fx.update(dt);
  cam.follow(player, dt);
  cam.updateShake(dt);
  level.markExplored(player.x, player.y, 12);
  Input.endFrame();
}

function render() {
  renderer.draw(level, cam, { player, fx, time: clock, playerLightRadius: 12 });
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
  drawMinimap(ctx2d, level, player, 'corner', canvas.width, canvas.height, cam.zoom);

  const z = cam.zoom;
  ctx2d.fillStyle = '#c8b070';
  ctx2d.font = `${13 * z}px Georgia, serif`;
  const alive = level.entities.filter((e) => e.alive && !e.isPlayer).length;
  ctx2d.fillText(
    `${level.name}  fps ${fps}  lvl ${player.level} xp ${player.xp}  life ${Math.round(player.hp)}/${player.maxHp}  ` +
    `gold ${player.gold}  bag ${player.inventory.length}  monsters ${alive}  items ${level.items.filter((i) => !i.taken).length}  [ ] next area`,
    12 * z, 20 * z);

  // Health bars above hurt monsters and any unique.
  for (const e of level.entities) {
    if (!e.alive || e.isPlayer) continue;
    if (e.hp >= e.maxHp && !e.uniqueAura) continue;
    const s = cam.toScreen(e.x, e.y);
    const w = 34 * z, h = 4 * z, y = s.y - 62 * z;
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(s.x - w / 2, y, w, h);
    ctx2d.fillStyle = e.uniqueAura || '#b03030';
    ctx2d.fillRect(s.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), h);
  }
}

// ------------------------------------------------------------------- checks

window.__aiChecks = () => {
  const out = {};
  const R = new Rng(5);

  // Wake radius: a monster placed beyond its wake distance stays idle.
  {
    const m = new Monster('fallen', 3, { x: player.x + 30, y: player.y, rng: R, sheet: assets.figures.fallen });
    level.addEntity(m);
    updateAI(m, 1 / 60, aiCtx);
    const farIdle = m.state === 'idle';
    m.x = player.x + m.wake - 1; m.y = player.y;
    updateAI(m, 1 / 60, aiCtx);
    const nearAwake = m.state !== 'idle';
    m.remove = true; level.removeDead();
    out.wake = { farStaysIdle: farIdle, nearWakes: nearAwake, radius: m.wake };
  }

  // Melee lands exactly once per swing, on the animation's hit frame.
  {
    let hits = 0, frames = [];
    const m = new Monster('fallen', 3, { x: player.x + 0.8, y: player.y, rng: R, sheet: assets.figures.fallen });
    level.addEntity(m);
    m.state = 'chase'; m.cool = 0;
    const realHit = aiCtx.meleeHit;
    aiCtx.meleeHit = (mm) => { hits++; frames.push(mm.frame); };
    for (let i = 0; i < 40; i++) updateAI(m, 1 / 60, aiCtx);
    aiCtx.meleeHit = realHit;
    m.remove = true; level.removeDead();
    out.melee = { swings: hits, hitFrames: frames, oncePerSwing: frames.every((f) => f === 3) };
  }

  // A pack spreads out instead of stacking on one tile.
  {
    const at = level.nearestOpen(player.x + 6, player.y + 6, 8);
    const pack = spawnPack(level, 'devilkin', R, { at, count: 6, sheets: assets.figures, rank: 'normal', mlvl: 5 });
    for (const m of pack) m.state = 'chase';
    for (let i = 0; i < 240; i++) for (const m of pack) updateAI(m, 1 / 60, aiCtx);
    let minD = Infinity;
    for (let i = 0; i < pack.length; i++) {
      for (let j = i + 1; j < pack.length; j++) minD = Math.min(minD, pack[i].distTo(pack[j]));
    }
    for (const m of pack) m.remove = true;
    level.removeDead();
    out.separation = { minPairDistance: +minD.toFixed(3), sumRadii: +(0.30 * 2).toFixed(2), ok: minD > 0.30 * 2 * 0.85 };
  }

  // Minions of a slain unique leader break and run.
  {
    const at = level.nearestOpen(player.x + 5, player.y, 8);
    const pack = spawnPack(level, 'fallen', R, { at, count: 5, sheets: assets.figures, rank: 'unique', mlvl: 3 });
    const leader = pack[0], minions = pack.slice(1);
    for (const m of pack) m.state = 'chase';
    leader.die();
    for (let i = 0; i < 8; i++) for (const m of minions) updateAI(m, 1 / 60, aiCtx);
    out.flee = { leaderRank: leader.rank, minions: minions.length, fleeing: minions.filter((m) => m.state === 'flee').length };
    for (const m of pack) m.remove = true;
    level.removeDead();
  }

  // A Shaman brings a Fallen corpse back.
  {
    const at = level.nearestOpen(player.x + 4, player.y + 4, 8);
    const sh = new Monster('shaman', 4, { x: at.x, y: at.y, rng: R, sheet: assets.figures.shaman });
    const corpse = new Monster('fallen', 3, { x: at.x + 1, y: at.y, rng: R, sheet: assets.figures.fallen });
    level.addEntity(sh); level.addEntity(corpse);
    corpse.die();
    sh.state = 'chase'; sh.specialCool = 0;
    const before = level.entities.filter((e) => e.alive && e.defId === 'fallen').length;
    for (let i = 0; i < 120; i++) updateAI(sh, 1 / 60, aiCtx);
    const after = level.entities.filter((e) => e.alive && e.defId === 'fallen').length;
    out.resurrect = { before, after, worked: after > before, logTail: log.slice(-1) };
    sh.remove = true; level.removeDead();
  }

  // A kill drops loot, and loot can be picked up.
  {
    const at = level.nearestOpen(player.x + 2, player.y, 6);
    const m = new Monster('devilkin', 6, { x: at.x, y: at.y, rng: R, sheet: assets.figures.devilkin });
    level.addEntity(m);
    const itemsBefore = level.items.length;
    m.die();
    let drops = 0;
    for (let i = 0; i < 60; i++) drops += dropLoot(level, m, player, R).length;
    const goldBefore = player.gold, bagBefore = player.inventory.length;
    let picked = 0;
    for (const gi of level.items) if (!gi.taken && pickUp(player, gi)) picked++;
    out.loot = {
      dropsFrom60Kills: drops, itemsOnGround: level.items.length - itemsBefore,
      pickedUp: picked, goldGained: player.gold - goldBefore,
      bagGrewBy: player.inventory.length - bagBefore,
    };
    m.remove = true; level.removeDead();
  }

  return out;
};

Object.defineProperty(window, '__dbg', { get: () => ({ player, level, fx, aiCtx, log, stubbedShots }) });
window.__loop = startLoop({ step, draw });
