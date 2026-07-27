// Phase 7 harness: click-to-move over real pathfinding, plus numeric checks of
// the combat formulas. Replaced by the real state machine in a later task.

import { startLoop } from './core/loop.js';
import { Camera } from './core/iso.js';
import { Input } from './core/input.js';
import { bakeTiles } from './art/tiles.js';
import { bakeAllFigures } from './art/figures.js';
import { Particles } from './art/fx.js';
import { AREAS } from './world/levels.js';
import { generate } from './world/gen.js';
import { Renderer } from './render/renderer.js';
import { drawMinimap } from './render/minimap.js';
import { Player } from './game/player.js';
import {
  chanceToHit, maxLifeFor, maxManaFor, xpForLevel, xpPenalty,
  applyDamage, attackRatingFrom, RES_CAP,
} from './game/combat.js';
import { Rng } from './core/rng.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
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

let level = null, player = null, clock = 0;
const fx = new Particles();

function build() {
  level = generate(AREAS[1], 20260728 + 7919);
  player = new Player({ x: level.start.x, y: level.start.y, sheet: assets.figures.sorceress });
  cam.x = player.x; cam.y = player.y;
  level.markExplored(player.x, player.y, 14);
}

function step(dt) {
  if (!ready) return;
  clock += dt;
  if (Input.consumeL()) {
    const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
    player.moveTo(level, w.x, w.y);
  } else if (Input.mouse.downL) {
    const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
    if (!player.moveGoal || Math.hypot(w.x - player.moveGoal.x, w.y - player.moveGoal.y) > 1.2) {
      player.moveTo(level, w.x, w.y);
    }
  }
  player.update(dt, level);
  fx.update(dt);
  cam.follow(player, dt);
  level.markExplored(player.x, player.y, 12);
  Input.endFrame();
}

function render() {
  renderer.draw(level, cam, { player, fx, time: clock, playerLightRadius: 12 });
  // Show the smoothed path so corner-cutting and stair-stepping are visible.
  if (player.path) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,110,0.75)';
    ctx.lineWidth = 2 * cam.zoom;
    ctx.beginPath();
    let p = cam.toScreen(player.x, player.y);
    ctx.moveTo(p.x, p.y);
    for (let i = player.pathIndex; i < player.path.length; i++) {
      p = cam.toScreen(player.path[i].x, player.path[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    for (let i = player.pathIndex; i < player.path.length; i++) {
      p = cam.toScreen(player.path[i].x, player.path[i].y);
      ctx.fillStyle = '#ffd66e';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.restore();
  }
}

function draw(fps) {
  if (!ready) {
    ctx.fillStyle = '#0b0a0e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c8b070'; ctx.font = '20px Georgia, serif';
    ctx.fillText('baking...', 40, 60);
    if (baker.next().done) { ready = true; build(); }
    return;
  }
  render();
  drawMinimap(ctx, level, player, 'corner', canvas.width, canvas.height, cam.zoom);
  ctx.fillStyle = '#c8b070';
  ctx.font = `${13 * cam.zoom}px Georgia, serif`;
  ctx.fillText(
    `fps ${fps}  lvl ${player.level}  life ${Math.round(player.hp)}/${player.maxHp}  mana ${Math.round(player.mana)}/${player.maxMana}  ` +
    `AR ${player.attackRating}  def ${player.defense}  dmg ${player.minDamage}-${player.maxDamage}  dir ${player.dir}  ${player.animName}   click to walk`,
    12 * cam.zoom, 20 * cam.zoom);
}

// ------------------------------------------------------------------- checks

window.__formulaChecks = () => {
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, pass: !!cond, detail });

  // Chance to hit is clamped and monotone in attack rating.
  const h1 = chanceToHit(1000, 100, 10, 10);
  const h2 = chanceToHit(100, 100, 10, 10);
  const h3 = chanceToHit(1, 100000, 10, 10);
  const h4 = chanceToHit(100000, 1, 10, 10);
  ok('hit monotone in AR', h1 > h2, `${h1.toFixed(1)} > ${h2.toFixed(1)}`);
  ok('hit floor 5', Math.abs(h3 - 5) < 1e-9, h3.toFixed(2));
  ok('hit cap 95', Math.abs(h4 - 95) < 1e-9, h4.toFixed(2));
  ok('equal AR and DEF at equal level is 50', Math.abs(h2 - 50) < 1e-9, h2.toFixed(2));
  ok('higher defender level lowers hit', chanceToHit(500, 200, 10, 30) < chanceToHit(500, 200, 10, 10));

  // Sorceress life and mana match the class table.
  const l1 = maxLifeFor('sorceress', 1, 10);
  const l2 = maxLifeFor('sorceress', 1, 11);
  const lLv = maxLifeFor('sorceress', 2, 10);
  const m1 = maxManaFor('sorceress', 1, 35);
  const m2 = maxManaFor('sorceress', 1, 36);
  ok('base life 40', l1 === 40, String(l1));
  ok('+2 life per vitality', l2 - l1 === 2, String(l2 - l1));
  ok('+1 life per level', lLv - l1 === 1, String(lLv - l1));
  ok('base mana 35', m1 === 35, String(m1));
  ok('+2 mana per energy', m2 - m1 === 2, String(m2 - m1));

  // Attack rating slope is five per point of dexterity.
  ok('+5 AR per dexterity', attackRatingFrom(26, 0, 1) - attackRatingFrom(25, 0, 1) === 5);

  // Experience curve rises and the penalty bites only above five levels.
  ok('xp curve increasing', xpForLevel(3) > xpForLevel(2) && xpForLevel(30) > xpForLevel(29));
  ok('no penalty within 5 levels', xpPenalty(10, 6) === 1, String(xpPenalty(10, 6)));
  ok('penalty beyond 5 levels', xpPenalty(20, 5) < 0.2, xpPenalty(20, 5).toFixed(3));

  // Resistance reduces elemental damage; player resistance caps at 75.
  const dummy = () => ({ alive: true, hp: 1000, resists: { fire: 0 }, die() { this.alive = false; }, isPlayer: false });
  const a = dummy(); applyDamage(a, { fire: 100 });
  const b = dummy(); b.resists.fire = 50; applyDamage(b, { fire: 100 });
  const c = dummy(); c.resists.fire = 50; applyDamage(c, { fire: 100 }, { pierce: { fire: 100 } });
  ok('0 resist takes full', Math.abs(1000 - a.hp - 100) < 1e-6, (1000 - a.hp).toFixed(1));
  ok('50 resist halves', Math.abs(1000 - b.hp - 50) < 1e-6, (1000 - b.hp).toFixed(1));
  ok('pierce drives resist negative', 1000 - c.hp > 100, (1000 - c.hp).toFixed(1));

  const p = new Player({ x: 0, y: 0 });
  p.stats.fire = 0;
  p.equipment.body = { mods: { resAll: 200 } };
  p.recalc();
  ok('player resist caps at 75', p.resists.fire === RES_CAP, String(p.resists.fire));

  // Levelling grants points and refills.
  const q = new Player({ x: 0, y: 0 });
  q.hp = 1;
  const before = q.maxHp;
  q.gainXp(xpForLevel(5));
  ok('levels from xp', q.level === 5, `level ${q.level}`);
  ok('5 stat points per level', q.statPoints === 20, String(q.statPoints));
  ok('1 skill point per level', q.skillPoints === 4, String(q.skillPoints));
  ok('level up refills life', q.hp === q.maxHp && q.maxHp > before, `${q.hp}/${q.maxHp}`);

  // Equipment feeds through one aggregation step.
  const r = new Player({ x: 0, y: 0 });
  const baseLife = r.maxHp, baseAR = r.attackRating;
  r.equipment.body = { mods: { life: 50, vit: 10, ar: 100 } };
  r.recalc();
  ok('item life and vitality both apply', r.maxHp === baseLife + 50 + 20, `${baseLife} -> ${r.maxHp}`);
  ok('item attack rating applies', r.attackRating === baseAR + 100, `${baseAR} -> ${r.attackRating}`);

  return { passed: out.filter((o) => o.pass).length, total: out.length, failures: out.filter((o) => !o.pass) };
};

// Walk the player to many random reachable points and confirm it never ends up
// inside a wall. This is the tunnelling and corner-sticking check.
window.__walkStress = (trials = 60) => {
  const rng = new Rng(99);
  let stuck = 0, inWall = 0, failedPath = 0, arrived = 0;
  for (let t = 0; t < trials; t++) {
    const goal = rng.pick(level.spawnPoints.concat(level.exits));
    if (!player.moveTo(level, goal.x, goal.y)) { failedPath++; continue; }
    let steps = 0;
    let last = { x: player.x, y: player.y };
    let stallFrames = 0;
    while (player.path && steps++ < 4000) {
      player.update(1 / 60, level);
      if (level.blockedCircle(player.x, player.y, player.radius)) inWall++;
      const moved = Math.hypot(player.x - last.x, player.y - last.y);
      stallFrames = moved < 1e-4 ? stallFrames + 1 : 0;
      if (stallFrames > 45) { stuck++; break; }
      last = { x: player.x, y: player.y };
    }
    if (Math.hypot(player.x - goal.x, player.y - goal.y) < 1.5) arrived++;
  }
  return { trials, arrived, stuck, inWall, failedPath, speed: player.speed };
};

// Capture the exact state at the moment a walk stops making progress.
window.__stallDiag = (trials = 60) => {
  const rng = new Rng(99);
  const cases = [];
  for (let t = 0; t < trials && cases.length < 4; t++) {
    const goal = rng.pick(level.spawnPoints.concat(level.exits));
    if (!player.moveTo(level, goal.x, goal.y)) continue;
    let steps = 0, stall = 0;
    let last = { x: player.x, y: player.y };
    const hist = [];
    while (player.path && steps++ < 4000) {
      const node = player.path[player.pathIndex];
      const before = { x: player.x, y: player.y, idx: player.pathIndex, d: node ? Math.hypot(node.x - player.x, node.y - player.y) : -1 };
      player.update(1 / 60, level);
      const moved = Math.hypot(player.x - last.x, player.y - last.y);
      hist.push({ ...before, moved: +moved.toFixed(4) });
      if (hist.length > 8) hist.shift();
      stall = moved < 1e-4 ? stall + 1 : 0;
      if (stall > 45) {
        const node2 = player.path && player.path[player.pathIndex];
        const dx = node2 ? node2.x - player.x : 0, dy = node2 ? node2.y - player.y : 0;
        const d = Math.hypot(dx, dy) || 1;
        const st = player.speed * (1 / 60);
        cases.push({
          goal: { x: +goal.x.toFixed(2), y: +goal.y.toFixed(2) },
          at: { x: +player.x.toFixed(3), y: +player.y.toFixed(3) },
          node: node2 ? { x: +node2.x.toFixed(2), y: +node2.y.toFixed(2) } : null,
          pathIndex: player.pathIndex, pathLen: player.path ? player.path.length : 0,
          distToNode: +d.toFixed(3),
          blockedX: level.blockedCircle(player.x + (dx / d) * st, player.y, player.radius),
          blockedY: level.blockedCircle(player.x, player.y + (dy / d) * st, player.radius),
          blockedBoth: level.blockedCircle(player.x + (dx / d) * st, player.y + (dy / d) * st, player.radius),
          insideWall: level.blockedCircle(player.x, player.y, player.radius),
          recent: hist.slice(-6),
        });
        break;
      }
      last = { x: player.x, y: player.y };
    }
  }
  return cases;
};
Object.defineProperty(window, '__dbg', { get: () => ({ player, level }) });
window.__loop = startLoop({ step, draw });
