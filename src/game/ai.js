// Monster behaviour.
//
// Steering is direct: head at the target and push away from neighbours so a
// pack spreads instead of collapsing into one body. A* is the fallback, entered
// only after a monster has been genuinely blocked for a moment, because forty
// monsters each running a grid search every frame is the obvious way to lose
// the frame budget here.
//
// The `ctx` object is the only way behaviour reaches the rest of the game:
//   { level, player, fx, rng, time, sfx,
//     spawnProjectile(opts), meleeHit(monster), novaHit(monster, opts),
//     resurrect(monster, corpse), summon(defId, x, y, mlvl, forcedMods) }
// Nothing in here imports the projectile system or the world directly, so the
// pieces stay independently testable.

import { findPath, smooth, hasLineOfSight } from '../world/path.js';
import { MONSTERS } from './monsterdefs.js';

const REPATH_INTERVAL = 0.55;
const BLOCKED_BEFORE_PATHING = 0.35;

function moveToward(m, tx, ty, dt, ctx, speedMul = 1) {
  const level = ctx.level;
  const dx = tx - m.x, dy = ty - m.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-4) return false;
  const step = m.speed * m.slowFactor * speedMul * dt;
  m.face(tx, ty);
  const moved = m.moveBy((dx / d) * step, (dy / d) * step, level);
  if (moved) { m.blockedFor = 0; return true; }
  m.blockedFor += dt;
  return false;
}

// Follow a stored A* route. Returns false when it runs out or cannot progress.
function followRoute(m, dt, ctx) {
  if (!m.path || m.pathIndex >= m.path.length) { m.path = null; return false; }
  const node = m.path[m.pathIndex];
  const d = Math.hypot(node.x - m.x, node.y - m.y);
  if (d < 0.25) { m.pathIndex++; return m.pathIndex < m.path.length; }
  return moveToward(m, node.x, node.y, dt, ctx);
}

function navigate(m, tx, ty, dt, ctx, speedMul = 1) {
  m.repathCool -= dt;
  if (m.path) {
    if (followRoute(m, dt, ctx)) return;
    m.path = null;
  }
  if (m.blockedFor < BLOCKED_BEFORE_PATHING) {
    moveToward(m, tx, ty, dt, ctx, speedMul);
    return;
  }
  // Genuinely stuck: pay for a search, but not more than a couple a second.
  if (m.repathCool <= 0) {
    m.repathCool = REPATH_INTERVAL;
    const raw = findPath(ctx.level, m.x, m.y, tx, ty, 1200);
    m.path = raw ? smooth(ctx.level, raw, { x: m.x, y: m.y }, m.radius) : null;
    m.pathIndex = 0;
    m.blockedFor = 0;
  }
  if (!m.path) moveToward(m, tx, ty, dt, ctx, speedMul);
}

function separate(m, ctx) {
  const list = ctx.level.entities;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o === m || !o.alive || o.isPlayer || o.isPet) continue;
    const dx = o.x - m.x, dy = o.y - m.y;
    if (Math.abs(dx) > 1.2 || Math.abs(dy) > 1.2) continue;
    m.separate(o, ctx.dt);
  }
}

function startAttack(m, ctx) {
  m.state = 'attack';
  m.cool = m.attackCooldown;
  m.face(ctx.player.x, ctx.player.y);
  m.setAnim('attack', {
    loop: false, force: true,
    hitFrame: 3,
    onHitFrame: () => { if (m.alive) ctx.meleeHit(m); },
    onEnd: () => { if (m.alive) m.state = 'chase'; },
  });
}

function startCast(m, ctx, onRelease) {
  m.state = 'cast';
  m.cool = m.attackCooldown;
  m.face(ctx.player.x, ctx.player.y);
  const anim = m.sheet && m.sheet.has('cast') ? 'cast' : 'attack';
  m.setAnim(anim, {
    loop: false, force: true,
    hitFrame: 3,
    onHitFrame: () => { if (m.alive) onRelease(); },
    onEnd: () => { if (m.alive) m.state = 'chase'; },
  });
}

function fireBolt(m, ctx, over = {}) {
  const b = m.def.bolt;
  if (!b) return;
  const dx = ctx.player.x - m.x, dy = ctx.player.y - m.y;
  const d = Math.hypot(dx, dy) || 1;
  ctx.spawnProjectile({
    x: m.x, y: m.y, z: 16,
    vx: (dx / d) * b.speed, vy: (dy / d) * b.speed,
    speed: b.speed, element: b.element,
    min: b.min * (1 + (m.mlvl - 1) * 0.3) * (m.battlecry ? m.battlecry.dmg : 1),
    max: b.max * (1 + (m.mlvl - 1) * 0.3) * (m.battlecry ? m.battlecry.dmg : 1),
    colour: b.colour, homing: b.homing || 0,
    hostile: true, owner: m, ttl: 3, drawR: 4,
    ...over,
  });
}

// ------------------------------------------------------------------ specials

function shamanResurrect(m, ctx) {
  // Revive a nearby Fallen corpse. This is the behaviour that makes a Shaman
  // pack worth killing in the right order.
  const list = ctx.level.entities;
  for (const c of list) {
    // A corpse the Barbarian has searched is spent: there is nothing left to
    // raise, which is half the point of Find Item.
    if (c.alive || c.resurrected || c.consumed || c.rank === 'unique' || c.rank === 'boss') continue;
    if (!c.defId || (c.defId !== 'fallen' && c.defId !== 'devilkin')) continue;
    if (Math.hypot(c.x - m.x, c.y - m.y) > 7) continue;
    ctx.resurrect(m, c);
    return true;
  }
  return false;
}

function ravenRaise(m, ctx) {
  const n = 2;
  for (let i = 0; i < n; i++) {
    const a = ctx.rng.f() * Math.PI * 2;
    const p = ctx.level.nearestOpen(m.x + Math.cos(a) * 3.5, m.y + Math.sin(a) * 3.5, 5);
    ctx.summon('skeleton', p.x, p.y, m.mlvl);
  }
  ctx.fx.burst('smoke', m.x, m.y, 14, { z: 12, spread: 3, r: 70, g: 40, b: 60 });
}

function andarielTurn(m, ctx) {
  const d = m.distTo(ctx.player);
  m.phase = (m.phase + 1) % 3;
  if (m.phase === 0 && d < 6.5) {
    // Poison nova
    startCast(m, ctx, () => {
      ctx.novaHit(m, { element: 'pois', radius: 5.5, min: 14 + m.mlvl * 2, max: 26 + m.mlvl * 3 });
      ctx.fx.ring(m.x, m.y, { maxR: 5.5, cr: 120, cg: 220, cb: 60, life: 0.55, w: 5, lit: 1.8 });
      ctx.fx.burst('ember', m.x, m.y, 30, { z: 10, spread: 9, r: 130, g: 220, b: 70, life: 0.9 });
    });
    return true;
  }
  if (m.phase === 1) {
    startCast(m, ctx, () => {
      for (let i = 0; i < 2; i++) {
        const a = ctx.rng.f() * Math.PI * 2;
        const p = ctx.level.nearestOpen(m.x + Math.cos(a) * 3, m.y + Math.sin(a) * 3, 5);
        ctx.summon('ghoul', p.x, p.y, m.mlvl);
      }
    });
    return true;
  }
  return false;
}

// Taunt: the target must come and swing, whatever it would rather be doing.
// It overrides flee and a ranged monster's habit of keeping its distance, and
// the blow it finally lands is clumsier and lighter — `arDebuff` and
// `dmgDebuff` are the fractions taken off, read where melee is resolved.
export function taunt(monster, player, o = {}) {
  if (!monster || !monster.alive || monster.def.boss) return false;
  monster.taunt = { t: o.seconds ?? 6, arDebuff: o.arDebuff || 0, dmgDebuff: o.dmgDebuff || 0 };
  monster.state = 'chase';
  monster.fleeTimer = undefined;
  monster.path = null;
  monster.face(player.x, player.y);
  return true;
}

// -------------------------------------------------------------------- update

export function updateAI(m, dt, ctx) {
  ctx.dt = dt;
  m.updateStatus(dt);

  if (!m.alive) {
    m.corpseTimer += dt;
    m.updateAnim(dt);
    return;
  }
  if (m.frozen > 0) { m.updateAnim(dt); return; }
  if (m.stunned > 0) { m.stunned -= dt; m.setAnim('idle'); m.updateAnim(dt); return; }
  if (m.battlecry && (m.battlecry.t -= dt) <= 0) m.battlecry = null;
  if (m.taunt) {
    if ((m.taunt.t -= dt) <= 0) m.taunt = null;
    // Whatever sent it running — Howl, a dead leader, a Grim Ward — the taunt
    // outranks it until it lapses.
    else if (m.state === 'flee') { m.state = 'chase'; m.fleeTimer = undefined; }
  }

  m.cool -= dt;
  m.specialCool -= dt;
  const player = ctx.player;
  const dist = m.distTo(player);
  const playerAlive = player.alive !== false;

  // Wake on proximity. A sleeping monster costs almost nothing.
  if (m.state === 'idle') {
    if (playerAlive && dist < m.wake) m.state = 'chase';
    else { m.setAnim('idle'); m.updateAnim(dt); return; }
  }

  if (!playerAlive) {
    m.state = 'chase';
    m.setAnim('idle');
    m.updateAnim(dt);
    return;
  }

  // A pack whose unique leader has fallen loses its nerve.
  if (m.def.flees && m.leader && !m.leader.alive && !m.taunt && m.state !== 'flee' && m.fleeTimer === undefined) {
    m.fleeTimer = 4.5;
    m.state = 'flee';
  }

  separate(m, ctx);

  switch (m.state) {
    case 'flee': {
      m.fleeTimer -= dt;
      const away = Math.atan2(m.y - player.y, m.x - player.x);
      navigate(m, m.x + Math.cos(away) * 5, m.y + Math.sin(away) * 5, dt, ctx, 1.1);
      m.setAnim('walk');
      if (m.fleeTimer <= 0) { m.state = 'chase'; m.fleeTimer = undefined; }
      break;
    }

    case 'attack':
    case 'cast':
      // Animation callbacks drive the transition out of these states.
      break;

    case 'chase':
    default: {
      // Boss and caster specials take priority over ordinary attacks.
      if (m.special === 'andariel' && m.specialCool <= 0 && dist < 9) {
        m.specialCool = 5.5;
        if (andarielTurn(m, ctx)) break;
      }
      if (m.special === 'raise' && m.specialCool <= 0 && dist < 14) {
        m.specialCool = 9;
        startCast(m, ctx, () => ravenRaise(m, ctx));
        break;
      }
      if (m.special === 'resurrect' && m.specialCool <= 0) {
        m.specialCool = 6;
        if (shamanResurrect(m, ctx)) { startCast(m, ctx, () => {}); break; }
      }

      // A taunted archer stops being shy and comes into reach.
      const keep = m.taunt ? 0 : (m.def.keepDistance || 0);
      const inRange = dist <= m.attackRange;
      const hasShot = keep > 0 && dist <= m.attackRange && hasLineOfSight(ctx.level, m.x, m.y, player.x, player.y);

      if (keep > 0) {
        // Ranged monsters hold a firing line rather than closing.
        if (dist < keep * 0.75) {
          const away = Math.atan2(m.y - player.y, m.x - player.x);
          moveToward(m, m.x + Math.cos(away) * 3, m.y + Math.sin(away) * 3, dt, ctx);
          m.setAnim('walk');
        } else if (!hasShot) {
          navigate(m, player.x, player.y, dt, ctx);
          m.setAnim('walk');
        } else if (m.cool <= 0) {
          startCast(m, ctx, () => {
            if (m.special === 'volley') {
              for (let i = -1; i <= 1; i++) {
                const a = Math.atan2(player.y - m.y, player.x - m.x) + i * 0.16;
                const b = m.def.bolt;
                fireBolt(m, ctx, { vx: Math.cos(a) * b.speed, vy: Math.sin(a) * b.speed });
              }
            } else fireBolt(m, ctx);
          });
        } else {
          m.setAnim('idle');
        }
        break;
      }

      if (inRange) {
        if (m.cool <= 0) startAttack(m, ctx);
        else { m.setAnim('idle'); m.face(player.x, player.y); }
      } else {
        navigate(m, player.x, player.y, dt, ctx);
        m.setAnim('walk');
      }
      break;
    }
  }

  m.updateAnim(dt);
}

export { MONSTERS };
