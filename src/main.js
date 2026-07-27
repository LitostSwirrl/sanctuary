// Phase 10 harness: the slice with the full skill trees wired up. Left click
// moves and melees, right click casts. Replaced by the real state machine in
// the next task.

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
import { applyDamage, applyChill, rollHit, rollDamage, tickBurn, xpPenalty } from './game/combat.js';
import { populate, spawnBoss, Monster } from './game/monster.js';
import { updateAI } from './game/ai.js';
import { dropLoot, pickUp } from './game/loot.js';
import { Projectiles } from './game/projectile.js';
import {
  SKILLS, SKILL_BY_ID, castSkill, allocate, manaCost, skillDamage,
  skillLevel, refreshPassives, pierceTable,
} from './game/skills.js';

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
const projectiles = new Projectiles();
const rng = new Rng(20260728);
const CASTABLE = SKILLS.filter((s) => !s.passive);
let skillIdx = 0;

function build() {
  const def = AREAS[areaIdx];
  level = generate(def, 20260728 + areaIdx * 7919);
  player = new Player({ x: level.start.x, y: level.start.y, sheet: assets.figures.sorceress });
  player.level = 30; player.statPoints = 0;
  player.stats.vit = 60; player.stats.ene = 90; player.stats.str = 40; player.stats.dex = 40;
  player.skillPoints = 200;
  for (const s of SKILLS) for (let i = 0; i < 8; i++) allocate(player, s.id);
  refreshPassives(player);
  player.recalc(true);
  populate(level, def, rng, assets.figures);
  if (def.boss) spawnBoss(level, def.boss, rng, assets.figures);
  cam.x = player.x; cam.y = player.y;
  level.markExplored(player.x, player.y, 14);
  fx.clear(); projectiles.clear();
}

// ---------------------------------------------------------------- game ctx

function killMonster(m) {
  const pen = xpPenalty(player.level, m.mlvl);
  player.gainXp(Math.round(m.xpValue * pen), () => FX.levelUp(fx, player.x, player.y));
  FX.death(fx, m.x, m.y);
  dropLoot(level, m, player, rng);
}

const gctx = {
  get level() { return level; },
  get player() { return player; },
  fx, rng, projectiles, dt: 1 / 60,
  get time() { return clock; },
  sfx: null,

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
      onHit: (p, target) => {
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
    const m = new Monster(defId, mlvl, { x, y, rng, sheet: assets.figures[defId] });
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
  const r = castSkill(player, id, tx, ty, gctx);
  if (r === 'mana') { fx.float(player.x, player.y, 'not enough mana', 'rgba(120,140,255,1)'); return; }
  if (r !== 'ok') return;
  player.busy = 0.4 / (1 + player.castRate / 100);
  player.face(tx, ty);
  player.setAnim('cast', { loop: false, force: true, onEnd: () => player.setAnim('idle') });
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
  gctx.dt = dt;

  if (Input.consume('BracketRight')) { areaIdx = (areaIdx + 1) % AREAS.length; build(); return; }
  if (Input.mouse.wheel) skillIdx = (skillIdx + CASTABLE.length + Math.sign(Input.mouse.wheel)) % CASTABLE.length;
  for (let i = 1; i <= 9; i++) {
    if (Input.consume('Digit' + i) && CASTABLE[i - 1]) skillIdx = i - 1;
  }

  const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
  if (Input.mouse.downR && player.alive && player.busy <= 0) doCast(CASTABLE[skillIdx].id, w.x, w.y);

  if (Input.mouse.downL && player.alive && player.busy <= 0) {
    const m = monsterUnderCursor();
    if (m) {
      player.target = m;
      if (player.distTo(m) <= 1.5) { player.stop(); playerAttack(m); }
      else player.moveTo(level, m.x, m.y);
    } else {
      player.target = null;
      if (!player.moveGoal || Math.hypot(w.x - player.moveGoal.x, w.y - player.moveGoal.y) > 0.8) player.moveTo(level, w.x, w.y);
    }
  }
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
  drawMinimap(ctx2d, level, player, 'corner', canvas.width, canvas.height, cam.zoom);

  const z = cam.zoom;
  const sk = CASTABLE[skillIdx];
  const dmg = skillDamage(player, sk.id);
  ctx2d.fillStyle = '#c8b070';
  ctx2d.font = `${13 * z}px Georgia, serif`;
  const alive = level.entities.filter((e) => e.alive && !e.isPlayer).length;
  ctx2d.fillText(
    `${level.name}  fps ${fps}  life ${Math.round(player.hp)}/${player.maxHp}  mana ${Math.round(player.mana)}/${player.maxMana}  ` +
    `monsters ${alive}  shots ${projectiles.list.length}  [ ] next area`, 12 * z, 20 * z);
  ctx2d.fillStyle = '#ffe08a';
  ctx2d.fillText(
    `right click: ${sk.name} (lvl ${skillLevel(player, sk.id)})  mana ${manaCost(player, sk.id)}` +
    (dmg ? `  dmg ${dmg.min}-${dmg.max}` : '') + '   digits 1-9 / wheel to switch',
    12 * z, 40 * z);

  for (const e of level.entities) {
    if (!e.alive || e.isPlayer) continue;
    if (e.hp >= e.maxHp && !e.uniqueAura) continue;
    const s = cam.toScreen(e.x, e.y);
    const w2 = 34 * z, h = 4 * z, y = s.y - 62 * z;
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(s.x - w2 / 2, y, w2, h);
    ctx2d.fillStyle = e.uniqueAura || '#b03030';
    ctx2d.fillRect(s.x - w2 / 2, y, w2 * Math.max(0, e.hp / e.maxHp), h);
  }
}

// ------------------------------------------------------------------- checks

window.__skillChecks = () => {
  const results = [];
  const dummySheet = assets.figures.zombie;

  const freshDummy = (opts = {}) => {
    const p = level.nearestOpen(player.x + 2.5, player.y, 6);
    const m = new Monster('zombie', 1, { x: p.x, y: p.y, rng, sheet: dummySheet });
    m.maxHp = 500000; m.hp = 500000;
    m.state = 'idle'; m.wake = 0;
    Object.assign(m.resists, opts.resists || {});
    level.addEntity(m);
    return m;
  };

  for (const sk of CASTABLE) {
    const m = freshDummy();
    player.mana = player.maxMana;
    const manaBefore = player.mana;
    const hpBefore = m.hp;
    const px = player.x, py = player.y;

    const r = castSkill(player, sk.id, m.x, m.y, gctx);
    // Let projectiles fly and delayed effects land.
    for (let i = 0; i < 200; i++) { projectiles.update(1 / 60, gctx); fx.update(1 / 60); }

    results.push({
      skill: sk.name,
      cast: r,
      manaSpent: +(manaBefore - player.mana).toFixed(1),
      expectedMana: manaCost(player, sk.id),
      damaged: +(hpBefore - m.hp).toFixed(1),
      moved: sk.id === 'teleport' ? +Math.hypot(player.x - px, player.y - py).toFixed(2) : undefined,
    });
    if (sk.id === 'teleport') { player.x = px; player.y = py; }
    m.remove = true;
    level.removeDead();
  }

  // Teleport must never land inside a wall.
  let intoWall = 0, attempts = 0;
  for (let i = 0; i < 200; i++) {
    const a = rng.f() * Math.PI * 2, d = 4 + rng.f() * 12;
    player.mana = player.maxMana;
    castSkill(player, 'teleport', player.x + Math.cos(a) * d, player.y + Math.sin(a) * d, gctx);
    attempts++;
    if (level.blockedCircle(player.x, player.y, player.radius)) intoWall++;
  }

  // A mastery must raise damage against a resistant target.
  const measure = (masteryPts, resist) => {
    const saved = player.skills.firemastery;
    player.skills.firemastery = masteryPts;
    const m = freshDummy({ resists: { fire: resist } });
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const before = m.hp;
      SKILL_BY_ID.firebolt.cast(player, skillLevel(player, 'firebolt'), m.x, m.y, gctx);
      for (let k = 0; k < 60; k++) projectiles.update(1 / 60, gctx);
      total += before - m.hp;
    }
    m.remove = true; level.removeDead();
    player.skills.firemastery = saved;
    return +(total / 40).toFixed(2);
  };
  const noMastery = measure(0, 75);
  const withMastery = measure(12, 75);

  return {
    perSkill: results,
    allCast: results.every((r) => r.cast === 'ok'),
    manaCorrect: results.every((r) => Math.abs(r.manaSpent - r.expectedMana) < 0.15),
    allDamaging: results.filter((r) => !['Teleport'].includes(r.skill)).every((r) => r.damaged > 0),
    teleport: { attempts, landedInWall: intoWall },
    mastery: { pierce: pierceTable(player), avgNoMastery: noMastery, avgWithMastery: withMastery, improved: withMastery > noMastery },
  };
};

window.__setArea = (i) => { areaIdx = i; build(); return level.name; };
window.__render = render;
Object.defineProperty(window, '__dbg', { get: () => ({ player, level, fx, gctx, projectiles }) });
window.__loop = startLoop({ step, draw });
