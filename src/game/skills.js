// The Sorceress skill trees.
//
// Fourteen skills across three trees with real synergies: points in Fire Bolt
// raise Fire Ball's damage, exactly as in the original. Synergies read hard
// allocated points only, while damage scaling reads the effective level
// including bonuses from equipment — that split is what stops a +3 skills
// amulet from silently multiplying every synergy as well.
//
// The casting context is:
//   { level, player, fx, rng, projectiles, time, sfx,
//     damageMonster(monster, dmgObject, opts) }

import { rollHit, rollDamage, monsterDefense } from './combat.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ helpers

export function allocatedPoints(player, id) {
  return player.skills[id] || 0;
}

// Effective level: allocated points plus anything the gear grants.
export function skillLevel(player, id) {
  const base = allocatedPoints(player, id);
  if (base <= 0) return 0;
  const sk = SKILL_BY_ID[id];
  return base + player.skillBonus(sk ? sk.tree : null);
}

function synergyPct(player, skill) {
  let pct = 0;
  for (const s of skill.synergies || []) pct += allocatedPoints(player, s.id) * s.pct;
  return pct;
}

// Masteries lower the target's resistance rather than raising raw damage, which
// is why a mastery can take a resistant monster below zero and multiply damage.
export function pierceFor(player, element) {
  const id = element === 'fire' ? 'firemastery' : element === 'cold' ? 'coldmastery' : element === 'light' ? 'lightmastery' : null;
  if (!id) return 0;
  const lvl = skillLevel(player, id);
  if (lvl <= 0) return 0;
  const base = element === 'fire' ? 15 : 20;
  const step = element === 'fire' ? 6 : 7;
  return Math.min(130, base + step * (lvl - 1));
}

export function pierceTable(player) {
  return { fire: pierceFor(player, 'fire'), cold: pierceFor(player, 'cold'), light: pierceFor(player, 'light'), pois: 0 };
}

function damageMult(player, skill) {
  let m = 1 + synergyPct(player, skill) / 100;
  if (skill.tree === 'fire') {
    const fm = skillLevel(player, 'firemastery');
    if (fm > 0) m *= 1 + (10 + 3 * (fm - 1)) / 100;
  }
  return m;
}

export function skillDamage(player, id) {
  const sk = SKILL_BY_ID[id];
  if (!sk || !sk.damage) return null;
  const lvl = Math.max(1, skillLevel(player, id));
  const d = sk.damage(lvl);
  const m = damageMult(player, sk);
  return { min: Math.round(d.min * m), max: Math.round(d.max * m), element: sk.element };
}

function rollFor(ctx, player, sk, lvl) {
  const d = sk.damage(lvl);
  const m = damageMult(player, sk);
  return () => (d.min + ctx.rng.f() * (d.max - d.min)) * m;
}

function damageArea(ctx, x, y, radius, roll, element, opts = {}) {
  let hits = 0;
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > radius + e.radius) continue;
    ctx.damageMonster(e, { [element]: roll() }, opts);
    hits++;
  }
  return hits;
}

function aimVector(caster, tx, ty, speed) {
  const dx = tx - caster.x, dy = ty - caster.y;
  const d = Math.hypot(dx, dy) || 1;
  return { vx: (dx / d) * speed, vy: (dy / d) * speed, dx: dx / d, dy: dy / d };
}

// ------------------------------------------------------------------- melee

// One weapon blow with a skill's bonuses folded in. Mastery ED/AR are already
// inside minDamage/maxDamage/attackRating via recalc; skill ED stacks on top.
function weaponHit(caster, m, ctx, { ed = 0, ar = 0, mul = 1 } = {}) {
  if (!rollHit(ctx.rng, caster.attackRating + ar, monsterDefense(m), caster.level, m.mlvl)) {
    ctx.fx.float(m.x, m.y, 'miss', 'rgba(190,190,190,1)');
    return 0;
  }
  const raw = rollDamage(ctx.rng, caster.minDamage, caster.maxDamage,
    caster.totals.ed + ed, caster.effective.str) * mul;
  return ctx.damageMonster(m, { phys: raw }, { source: caster });
}

function knockback(level, m, fromX, fromY, dist) {
  const dx = m.x - fromX, dy = m.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  m.moveBy((dx / d) * dist, (dy / d) * dist, level);
}

// Bosses are immune to fear and stun, as monsters are to neither chill nor
// Static Field today.
function applyStun(m, seconds) {
  if (!m.alive || m.def.boss) return;
  m.stunned = Math.max(m.stunned || 0, seconds);
}

// The two-handed axe reaches a little past the bare-hand attack's 1.6/1.7.
const MELEE_REACH = 1.9;

function meleeTarget(ctx, caster, tx, ty) {
  let best = null, bd = 1.3;                    // nearest to the click...
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = Math.hypot(e.x - tx, e.y - ty);
    if (d < bd) { bd = d; best = e; }
  }
  if (best && caster.distTo(best) <= MELEE_REACH) return best;
  best = null; bd = MELEE_REACH;                // ...else nearest in reach.
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = caster.distTo(e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Swing at whatever the click meant. Returns false — veto, mana refunded —
// when nothing is in reach. The effect runs in the hit-frame callback on
// frame 3, exactly like the plain attack.
function meleeStrike(caster, tx, ty, ctx, onHit) {
  const target = meleeTarget(ctx, caster, tx, ty);
  if (!target) return false;
  caster.stop();
  caster.busy = 0.42 / caster.attackSpeed;
  caster.face(target.x, target.y);
  if (ctx.sfx) ctx.sfx('swing');
  caster.setAnim('attack', {
    loop: false, force: true, hitFrame: 3,
    onHitFrame: () => { if (target.alive && caster.distTo(target) <= MELEE_REACH + 0.2) onHit(target); },
    onEnd: () => caster.setAnim('idle'),
  });
  return true;
}

// ------------------------------------------------------------------- skills

export const SKILLS = [
  // ------------------------------------------------------------------- FIRE
  {
    id: 'firebolt', name: 'Fire Bolt', tree: 'fire', req: 1, prereq: [], element: 'fire',
    mana: (l) => 2 + l * 0.3,
    damage: (l) => ({ min: 3 + 2 * (l - 1), max: 6 + 3 * (l - 1) }),
    blurb: 'A bolt of fire. Cheap, and it never stops being useful.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 15);
      const roll = rollFor(ctx, caster, sk, lvl);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 18, vx: a.vx, vy: a.vy, speed: 15,
        element: 'fire', colour: '#ff8a30', drawR: 5, light: 5, ttl: 2,
        trail: (p) => { if (ctx.rng.chance(0.6)) ctx.fx.spawn('ember', p.x, p.y, { z: p.z, spread: 0.3, spreadZ: 3, r: 255, g: 140, b: 50, size: 2, life: 0.3 }); },
        onHit: (p, e) => ctx.damageMonster(e, { fire: roll() }, { source: caster }),
        onExpire: (p) => ctx.fx.burst('ember', p.x, p.y, 8, { z: p.z, spread: 1.6, r: 255, g: 150, b: 60, life: 0.35 }),
      });
    },
  },
  {
    id: 'warmth', name: 'Warmth', tree: 'fire', req: 1, prereq: [], passive: true,
    blurb: 'Mana returns faster.',
    effect: (l) => `+${30 + 12 * (l - 1)}% Mana Regeneration`,
    manaRegen: (l) => (30 + 12 * (l - 1)) / 100,
  },
  {
    id: 'fireball', name: 'Fire Ball', tree: 'fire', req: 6, prereq: ['firebolt'], element: 'fire',
    mana: (l) => 5 + l * 0.5,
    damage: (l) => ({ min: 8 + 4 * (l - 1), max: 16 + 5 * (l - 1) }),
    synergies: [{ id: 'firebolt', pct: 14 }],
    radius: 2.6,
    blurb: 'Explodes on impact. Fire Bolt makes it hit harder.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 12);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 18, vx: a.vx, vy: a.vy, speed: 12,
        element: 'fire', colour: '#ff7020', drawR: 7, light: 6.5, ttl: 2.4, radius: 0.35,
        trail: (p) => { if (ctx.rng.chance(0.9)) ctx.fx.spawn('ember', p.x, p.y, { z: p.z, spread: 0.5, spreadZ: 4, r: 255, g: 130, b: 40, size: 2.4, life: 0.35 }); },
        onExpire: (p) => {
          ctx.fx.burst('ember', p.x, p.y, 26, { z: 8, spread: sk.radius * 2.4, spreadZ: 40, r: 255, g: 150, b: 50, life: 0.7 });
          ctx.fx.ring(p.x, p.y, { maxR: sk.radius, cr: 255, cg: 150, cb: 60, life: 0.32, w: 4, lit: 2 });
          damageArea(ctx, p.x, p.y, sk.radius, roll, 'fire', { source: caster, pierce });
          if (ctx.sfx) ctx.sfx('explode');
        },
      });
    },
  },
  {
    id: 'meteor', name: 'Meteor', tree: 'fire', req: 18, prereq: ['fireball'], element: 'fire',
    mana: (l) => 12 + l * 0.6,
    damage: (l) => ({ min: 40 + 12 * (l - 1), max: 62 + 16 * (l - 1) }),
    synergies: [{ id: 'firebolt', pct: 8 }, { id: 'fireball', pct: 8 }],
    radius: 2.8,
    blurb: 'Calls a rock from the sky, then leaves the ground burning.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      // Falls from high up, so it arrives about a second after the cast.
      ctx.projectiles.spawn({
        x: tx, y: ty, z: 190, vx: 0, vy: 0, vz: -170, speed: 170,
        element: 'fire', colour: '#ff5a10', drawR: 12, light: 8, ttl: 1.25, radius: 0.1,
        trail: (p) => ctx.fx.spawn('ember', p.x, p.y, { z: p.z, spread: 0.8, spreadZ: 6, r: 255, g: 120, b: 30, size: 3.2, life: 0.4 }),
        onExpire: (p) => {
          ctx.fx.burst('ember', p.x, p.y, 46, { z: 6, spread: sk.radius * 3, spreadZ: 70, r: 255, g: 140, b: 40, life: 1.0 });
          ctx.fx.burst('smoke', p.x, p.y, 16, { z: 14, spread: sk.radius * 2, r: 70, g: 55, b: 45, life: 1.6 });
          ctx.fx.ring(p.x, p.y, { maxR: sk.radius * 1.2, cr: 255, cg: 130, cb: 50, life: 0.5, w: 6, lit: 3 });
          damageArea(ctx, p.x, p.y, sk.radius, roll, 'fire', { source: caster, pierce });
          const dps = 10 + 4 * lvl;
          for (const e of ctx.level.entities) {
            if (!e.alive || e.isPlayer || e.isNpc) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) <= sk.radius + e.radius) {
              e.burning = Math.max(e.burning, 3.5);
              e.burnDps = Math.max(e.burnDps, dps);
              e.burnSource = caster;
            }
          }
          if (ctx.sfx) ctx.sfx('explode', { big: true });
        },
      });
      // A warning shadow so the impact is readable before it lands.
      ctx.fx.ring(tx, ty, { maxR: sk.radius, cr: 255, cg: 90, cb: 30, life: 1.15, w: 2, lit: 0 });
    },
  },
  {
    id: 'firemastery', name: 'Fire Mastery', tree: 'fire', req: 24, prereq: ['fireball'], passive: true,
    blurb: 'Fire skills do more damage, and enemy fire resistance counts for less.',
    effect: (l) => `-${Math.min(130, 15 + 6 * (l - 1))}% Enemy Fire Resist, +${10 + 3 * (l - 1)}% Fire Damage`,
  },

  // ------------------------------------------------------------------- COLD
  {
    id: 'icebolt', name: 'Ice Bolt', tree: 'cold', req: 1, prereq: [], element: 'cold',
    mana: (l) => 2 + l * 0.3,
    damage: (l) => ({ min: 3 + 2 * (l - 1), max: 5 + 3 * (l - 1) }),
    blurb: 'Slows whatever it hits.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 13);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 18, vx: a.vx, vy: a.vy, speed: 13,
        element: 'cold', colour: '#7ad0ff', drawR: 5, light: 4.5, ttl: 2,
        trail: (p) => { if (ctx.rng.chance(0.5)) ctx.fx.spawn('ice', p.x, p.y, { z: p.z, spread: 0.3, spreadZ: 2, r: 150, g: 220, b: 255, size: 1.8, life: 0.3 }); },
        onHit: (p, e) => {
          ctx.damageMonster(e, { cold: roll() }, { source: caster, pierce, chill: { seconds: 2.5 + lvl * 0.15, amount: 0.35 } });
        },
        onExpire: (p) => ctx.fx.burst('ice', p.x, p.y, 7, { z: p.z, spread: 1.4, r: 160, g: 225, b: 255, life: 0.3 }),
      });
    },
  },
  {
    id: 'frostnova', name: 'Frost Nova', tree: 'cold', req: 6, prereq: ['icebolt'], element: 'cold',
    mana: (l) => 7 + l * 0.4,
    damage: (l) => ({ min: 4 + 2 * (l - 1), max: 8 + 3 * (l - 1) }),
    synergies: [{ id: 'icebolt', pct: 15 }],
    radius: (l) => 4.4 + l * 0.12,
    blurb: 'A ring of ice that leaves everything it touches crawling.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const r = sk.radius(lvl);
      const roll = rollFor(ctx, caster, sk, lvl);
      ctx.fx.ring(caster.x, caster.y, { maxR: r, cr: 150, cg: 220, cb: 255, life: 0.45, w: 4, lit: 1.6 });
      ctx.fx.burst('ice', caster.x, caster.y, 30, { z: 8, spread: r * 2, spreadZ: 26, r: 150, g: 225, b: 255, life: 0.55 });
      damageArea(ctx, caster.x, caster.y, r, roll, 'cold', {
        source: caster, pierce: pierceTable(caster),
        chill: { seconds: 3.5 + lvl * 0.2, amount: 0.5 },
      });
      if (ctx.sfx) ctx.sfx('ice');
    },
  },
  {
    id: 'frozenorb', name: 'Frozen Orb', tree: 'cold', req: 24, prereq: ['frostnova'], element: 'cold',
    mana: (l) => 16 + l * 0.6,
    damage: (l) => ({ min: 5 + 2 * (l - 1), max: 9 + 3 * (l - 1) }),
    synergies: [{ id: 'icebolt', pct: 2 }, { id: 'frostnova', pct: 2 }],
    blurb: 'Drifts forward shedding ice in every direction.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this, a = aimVector(caster, tx, ty, 5.5);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      let shed = 0;
      ctx.projectiles.spawn({
        x: caster.x, y: caster.y, z: 20, vx: a.vx, vy: a.vy, speed: 5.5,
        element: 'cold', colour: '#8ad8ff', drawR: 10, light: 7, ttl: 2.6, radius: 0.2,
        // The orb itself does no damage and must drift through whatever it
        // meets; the shards it sheds are what actually hit.
        pierce: 9999,
        trail: (p, dt) => {
          shed += dt;
          ctx.fx.spawn('ice', p.x, p.y, { z: p.z, spread: 1.2, spreadZ: 6, r: 160, g: 230, b: 255, size: 2.4, life: 0.4 });
          while (shed > 0.07) {
            shed -= 0.07;
            const ang = ctx.rng.f() * TAU;
            ctx.projectiles.spawn({
              x: p.x, y: p.y, z: p.z, vx: Math.cos(ang) * 9, vy: Math.sin(ang) * 9, speed: 9,
              element: 'cold', colour: '#a8e4ff', drawR: 3, light: 2.2, ttl: 0.55, radius: 0.25,
              onHit: (q, e) => ctx.damageMonster(e, { cold: roll() }, {
                source: caster, pierce, chill: { seconds: 2.5, amount: 0.4 },
              }),
            });
          }
        },
        onExpire: (p) => ctx.fx.burst('ice', p.x, p.y, 20, { z: p.z, spread: 3, r: 170, g: 235, b: 255, life: 0.5 }),
      });
    },
  },
  {
    id: 'coldmastery', name: 'Cold Mastery', tree: 'cold', req: 24, prereq: ['frostnova'], passive: true,
    blurb: 'Enemy cold resistance counts for much less.',
    effect: (l) => `-${Math.min(130, 20 + 7 * (l - 1))}% Enemy Cold Resist`,
  },

  // -------------------------------------------------------------- LIGHTNING
  {
    id: 'chargedbolt', name: 'Charged Bolt', tree: 'light', req: 1, prereq: [], element: 'light',
    mana: (l) => 3 + l * 0.3,
    damage: (l) => ({ min: 2 + 1.5 * (l - 1), max: 4 + 2 * (l - 1) }),
    bolts: (l) => Math.min(12, 3 + Math.floor(l / 2)),
    blurb: 'A fan of bolts that wander toward whatever is nearest.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const n = sk.bolts(lvl);
      const roll = rollFor(ctx, caster, sk, lvl);
      const pierce = pierceTable(caster);
      const base = Math.atan2(ty - caster.y, tx - caster.x);
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.17 + ctx.rng.range(-0.05, 0.05);
        const ang = base + spread;
        const speed = 10 + ctx.rng.range(-1.5, 1.5);
        ctx.projectiles.spawn({
          x: caster.x, y: caster.y, z: 14,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed,
          element: 'light', colour: '#b0c8ff', drawR: 3.4, light: 2.6, ttl: 1.5,
          radius: 0.28, homing: 0.35,
          onHit: (p, e) => ctx.damageMonster(e, { light: roll() }, { source: caster, pierce }),
        });
      }
      if (ctx.sfx) ctx.sfx('lightning');
    },
  },
  {
    id: 'staticfield', name: 'Static Field', tree: 'light', req: 6, prereq: ['chargedbolt'], element: 'light',
    mana: () => 9,
    radius: (l) => 4.2 + l * 0.28,
    blurb: 'Strips a quarter of the current life from everything nearby. Brutal on things with a lot of it.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const r = sk.radius(lvl);
      ctx.fx.ring(caster.x, caster.y, { maxR: r, cr: 170, cg: 200, cb: 255, life: 0.32, w: 4, lit: 2 });
      let hit = 0;
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > r + e.radius) continue;
        ctx.fx.arc(caster.x, caster.y, e.x, e.y, { z: 16, w: 2 });
        // A percentage of current life, so it never finishes anything off.
        ctx.damageMonster(e, { light: 0 }, { source: caster, absolute: e.hp * 0.25 });
        hit++;
      }
      if (ctx.sfx && hit) ctx.sfx('lightning');
    },
  },
  {
    id: 'teleport', name: 'Teleport', tree: 'light', req: 6, prereq: ['staticfield'],
    mana: (l) => Math.max(8, 24 - l),
    range: 14,
    blurb: 'Step across the room. Walls do not care, but they do stop you landing in them.',
    cast(caster, lvl, tx, ty, ctx) {
      const d = Math.hypot(tx - caster.x, ty - caster.y);
      const range = this.range;
      let gx = tx, gy = ty;
      if (d > range) { gx = caster.x + (tx - caster.x) / d * range; gy = caster.y + (ty - caster.y) / d * range; }
      const spot = ctx.level.nearestOpen(gx, gy, 6);
      if (ctx.level.blockedCircle(spot.x, spot.y, caster.radius)) return false;
      ctx.fx.burst('glow', caster.x, caster.y, 14, { z: 16, spread: 2.4, r: 170, g: 110, b: 255, life: 0.4 });
      ctx.fx.ring(caster.x, caster.y, { maxR: 1.6, cr: 180, cg: 120, cb: 255, life: 0.3, w: 3, lit: 1.4 });
      caster.x = spot.x; caster.y = spot.y;
      caster.stop();
      ctx.fx.burst('glow', caster.x, caster.y, 16, { z: 16, spread: 2.4, r: 170, g: 110, b: 255, life: 0.4 });
      ctx.fx.ring(caster.x, caster.y, { maxR: 1.8, cr: 180, cg: 120, cb: 255, life: 0.3, w: 3, lit: 1.4 });
      if (ctx.sfx) ctx.sfx('teleport');
      return true;
    },
  },
  {
    id: 'nova', name: 'Nova', tree: 'light', req: 18, prereq: ['staticfield'], element: 'light',
    mana: (l) => 14 + l * 0.6,
    damage: (l) => ({ min: 4 + 3 * (l - 1), max: 11 + 4 * (l - 1) }),
    synergies: [{ id: 'chargedbolt', pct: 6 }],
    radius: 5.2,
    blurb: 'A ring of lightning in every direction at once.',
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      ctx.fx.ring(caster.x, caster.y, { maxR: sk.radius, cr: 180, cg: 210, cb: 255, life: 0.36, w: 5, lit: 2.4 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        ctx.fx.arc(caster.x, caster.y, caster.x + Math.cos(a) * sk.radius, caster.y + Math.sin(a) * sk.radius, { z: 12, w: 2 });
      }
      damageArea(ctx, caster.x, caster.y, sk.radius, roll, 'light', { source: caster, pierce: pierceTable(caster) });
      if (ctx.sfx) ctx.sfx('lightning', { big: true });
    },
  },
  {
    id: 'lightmastery', name: 'Lightning Mastery', tree: 'light', req: 24, prereq: ['nova'], passive: true,
    blurb: 'Enemy lightning resistance counts for much less.',
    effect: (l) => `-${Math.min(130, 20 + 7 * (l - 1))}% Enemy Lightning Resist`,
  },

  // -------------------------------------------------------- BARBARIAN COMBAT
  {
    id: 'bash', name: 'Bash', tree: 'combat', req: 1, prereq: [], melee: true, iconSeed: 0,
    mana: () => 2,
    blurb: 'A crushing blow that sends the target staggering back.',
    effect: (l) => `+${50 + 8 * (l - 1)}% Damage, +${20 + 5 * (l - 1)} Attack Rating, knocks back`,
    cast(caster, lvl, tx, ty, ctx) {
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        const dealt = weaponHit(caster, target, ctx, { ed: 50 + 8 * (lvl - 1), ar: 20 + 5 * (lvl - 1) });
        if (dealt > 0 && target.alive) knockback(ctx.level, target, caster.x, caster.y, 0.7);
      });
    },
  },
  {
    id: 'doubleswing', name: 'Double Swing', tree: 'combat', req: 6, prereq: ['bash'], melee: true, iconSeed: 1,
    mana: () => 1,
    blurb: 'One swing for the target, one for whoever stands beside it.',
    effect: (l) => `Two hits, +${15 + 5 * (l - 1)} Attack Rating each`,
    cast(caster, lvl, tx, ty, ctx) {
      const ar = 15 + 5 * (lvl - 1);
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        weaponHit(caster, target, ctx, { ar });
        let other = null, od = MELEE_REACH + 0.2;
        for (const e of ctx.level.entities) {
          if (!e.alive || e.isPlayer || e.isNpc || e === target) continue;
          const d = caster.distTo(e);
          if (d < od) { od = d; other = e; }
        }
        if (other) weaponHit(caster, other, ctx, { ar });
      });
    },
  },
  {
    id: 'concentrate', name: 'Concentrate', tree: 'combat', req: 18, prereq: ['bash'], melee: true, iconSeed: 3,
    mana: () => 2,
    synergies: [{ id: 'bash', pct: 5 }],
    blurb: 'A deliberate, heavy blow. Bash practice makes it heavier.',
    effect: (l) => `+${60 + 10 * (l - 1)}% Damage, +${30 + 5 * (l - 1)} Attack Rating`,
    cast(caster, lvl, tx, ty, ctx) {
      // Synergy reads hard points, matching every other synergy in the file.
      const ed = 60 + 10 * (lvl - 1) + 5 * allocatedPoints(caster, 'bash');
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        weaponHit(caster, target, ctx, { ed, ar: 30 + 5 * (lvl - 1) });
      });
    },
  },
  {
    id: 'leap', name: 'Leap', tree: 'combat', req: 6, prereq: [], melee: true, iconSeed: 2,
    mana: () => 3,
    blurb: 'Jump to a point. The landing throws everything nearby off its feet.',
    effect: (l) => `Range ${(5 + 0.25 * (l - 1)).toFixed(2)} tiles, stuns ${(0.4 + 0.05 * (l - 1)).toFixed(2)}s on landing`,
    cast(caster, lvl, tx, ty, ctx) {
      const range = 5 + 0.25 * (lvl - 1);
      const d = Math.hypot(tx - caster.x, ty - caster.y);
      let gx = tx, gy = ty;
      if (d > range) { gx = caster.x + (tx - caster.x) / d * range; gy = caster.y + (ty - caster.y) / d * range; }
      const spot = ctx.level.nearestOpen(gx, gy, 4);
      if (ctx.level.blockedCircle(spot.x, spot.y, caster.radius)) return false;
      const from = { x: caster.x, y: caster.y };
      const dur = 0.45;
      let t = 0;
      caster.stop();
      caster.busy = dur + 0.1;
      caster.face(spot.x, spot.y);
      caster.setAnim('walk', { fps: 15 });
      if (ctx.sfx) ctx.sfx('swing');
      caster.action = (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        // Position ignores walls: a leap crosses what walking cannot. Only
        // the landing point was validated.
        caster.x = from.x + (spot.x - from.x) * k;
        caster.y = from.y + (spot.y - from.y) * k;
        caster.zOff = Math.sin(k * Math.PI) * 26;
        if (k < 1) return false;
        caster.zOff = 0;
        caster.setAnim('idle', { force: true });
        const stun = 0.4 + 0.05 * (lvl - 1);
        for (const e of ctx.level.entities) {
          if (!e.alive || e.isPlayer || e.isNpc) continue;
          if (Math.hypot(e.x - caster.x, e.y - caster.y) > 1.5 + e.radius) continue;
          knockback(ctx.level, e, caster.x, caster.y, 1.0);
          applyStun(e, stun);
        }
        ctx.fx.ring(caster.x, caster.y, { maxR: 1.6, cr: 200, cg: 180, cb: 140, life: 0.3, w: 3, lit: 1 });
        ctx.fx.burst('dust', caster.x, caster.y, 14, { z: 4, spread: 2.2, r: 150, g: 130, b: 100, life: 0.5 });
        if (ctx.sfx) ctx.sfx('hit');
        return true;
      };
      return true;
    },
  },
  {
    id: 'whirlwind', name: 'Whirlwind', tree: 'combat', req: 24, prereq: ['concentrate'], melee: true, iconSeed: 4,
    mana: () => 12,
    blurb: 'Become the storm. Travel, and everything on the way is hit.',
    effect: (l) => `${-50 + 10 * (l - 1)}% Damage per hit, a hit every 0.15s en route`,
    cast(caster, lvl, tx, ty, ctx) {
      const dx = tx - caster.x, dy = ty - caster.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) return false;
      const ux = dx / d, uy = dy / d;
      const dist = Math.min(7, d);
      const speed = 7.5;
      const dur = dist / speed;
      const ed = -50 + 10 * (lvl - 1);
      let t = 0, hitT = 0, spinT = 0;
      caster.stop();
      caster.busy = dur + 0.05;
      caster.setAnim('attack', { fps: 20 });        // looping spin
      if (ctx.sfx) ctx.sfx('swing');
      const finish = () => { caster.setAnim('idle', { force: true }); caster.busy = 0.1; return true; };
      caster.action = (dt) => {
        t += dt; hitT += dt; spinT += dt;
        if (spinT > 0.07) { spinT = 0; caster.dir = (caster.dir + 1) % 8; }
        const moved = caster.moveBy(ux * speed * dt, uy * speed * dt, ctx.level);
        while (hitT >= 0.15) {
          hitT -= 0.15;
          for (const e of ctx.level.entities) {
            if (!e.alive || e.isPlayer || e.isNpc) continue;
            if (Math.hypot(e.x - caster.x, e.y - caster.y) > 1.5 + e.radius) continue;
            weaponHit(caster, e, ctx, { ed });
          }
        }
        // Stopping early at the first blocked tile is the D2 behaviour.
        if (!moved || t >= dur) return finish();
        return false;
      };
      return true;
    },
  },

  // ------------------------------------------------------- BARBARIAN WARCRIES
  {
    id: 'howl', name: 'Howl', tree: 'cries', req: 1, prereq: [], iconSeed: 0,
    mana: () => 4,
    blurb: 'A shout that sends lesser enemies running.',
    effect: (l) => `Monsters within 4 tiles flee for ${(3 + 0.4 * (l - 1)).toFixed(1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      const dur = 3 + 0.4 * (lvl - 1);
      ctx.fx.ring(caster.x, caster.y, { maxR: 4, cr: 232, cg: 160, cb: 48, life: 0.4, w: 4, lit: 1.4 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc || e.def.boss) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 4 + e.radius) continue;
        e.state = 'flee';
        e.fleeTimer = Math.max(e.fleeTimer || 0, dur);
      }
    },
  },
  {
    id: 'shout', name: 'Shout', tree: 'cries', req: 6, prereq: ['howl'], iconSeed: 1,
    mana: () => 6,
    blurb: 'A rallying cry that hardens the skin like armour.',
    effect: (l) => `+${100 + 10 * (l - 1)}% Defence for ${20 + 5 * (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      caster.buffs.shout = { t: 20 + 5 * (lvl - 1), mag: 100 + 10 * (lvl - 1) };
      caster.recalc();
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.2, cr: 200, cg: 190, cb: 150, life: 0.35, w: 3, lit: 1.2 });
    },
  },
  {
    id: 'battlecry', name: 'Battle Cry', tree: 'cries', req: 18, prereq: ['howl'], iconSeed: 2,
    mana: () => 5,
    blurb: 'A curse of a shout. What hears it fights worse.',
    effect: (l) => `Enemies within 3.5 tiles: -50% Defence, -25% Damage for ${12 + (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      const dur = 12 + (lvl - 1);
      ctx.fx.ring(caster.x, caster.y, { maxR: 3.5, cr: 220, cg: 120, cb: 60, life: 0.4, w: 4, lit: 1.4 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 3.5 + e.radius) continue;
        e.battlecry = { def: 0.5, dmg: 0.75, t: dur };
      }
    },
  },
  {
    id: 'battleorders', name: 'Battle Orders', tree: 'cries', req: 24, prereq: ['shout'], iconSeed: 3,
    mana: () => 7,
    blurb: 'The order to stand. Life and mana swell to meet it.',
    effect: (l) => `+${30 + 3 * (l - 1)}% Maximum Life and Mana for ${30 + 6 * (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      // Orbs and sheet max life/mana rise, but current values keep their
      // absolute numbers — recalc's non-fill grant branch would otherwise
      // hand over the max-delta as a free heal/mana top-up on every cast.
      const prevHp = caster.hp, prevMana = caster.mana;
      caster.buffs.battleorders = { t: 30 + 6 * (lvl - 1), mag: 30 + 3 * (lvl - 1) };
      caster.recalc();
      caster.hp = Math.min(prevHp, caster.maxHp);
      caster.mana = Math.min(prevMana, caster.maxMana);
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.6, cr: 240, cg: 200, cb: 120, life: 0.4, w: 3, lit: 1.4 });
    },
  },
  {
    id: 'warcry', name: 'War Cry', tree: 'cries', req: 24, prereq: ['battlecry'], iconSeed: 4,
    mana: () => 10, element: 'phys',
    damage: (l) => ({ min: 18 + 6 * (l - 1), max: 28 + 8 * (l - 1) }),
    synergies: [{ id: 'howl', pct: 6 }, { id: 'battlecry', pct: 6 }],
    blurb: 'A shout that lands like a blow, and leaves the survivors reeling.',
    effect: (l) => `Stuns for ${Math.min(3, 1 + 0.1 * (l - 1)).toFixed(1)}s within 3 tiles`,
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      const stun = Math.min(3, 1 + 0.1 * (lvl - 1));
      ctx.fx.ring(caster.x, caster.y, { maxR: 3, cr: 255, cg: 180, cb: 80, life: 0.4, w: 5, lit: 2 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 3 + e.radius) continue;
        ctx.damageMonster(e, { phys: roll() }, { source: caster });
        applyStun(e, stun);
      }
      if (ctx.sfx) ctx.sfx('explode');
    },
  },

  // ------------------------------------------------------ BARBARIAN MASTERIES
  {
    id: 'axemastery', name: 'Axe Mastery', tree: 'mastery', req: 1, prereq: [], passive: true, iconSeed: 0,
    blurb: 'Axes hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with axes`,
  },
  {
    id: 'macemastery', name: 'Mace Mastery', tree: 'mastery', req: 1, prereq: [], passive: true, iconSeed: 1,
    blurb: 'Clubs, maces and hammers hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with maces`,
  },
  {
    id: 'swordmastery', name: 'Sword Mastery', tree: 'mastery', req: 6, prereq: [], passive: true, iconSeed: 2,
    blurb: 'Blades of every length hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with swords`,
  },
  {
    id: 'ironskin', name: 'Iron Skin', tree: 'mastery', req: 12, prereq: [], passive: true, iconSeed: 3,
    blurb: 'Skin like worked metal.',
    effect: (l) => `+${30 + 10 * (l - 1)}% Defence`,
  },
];

export const SKILL_BY_ID = {};
for (const s of SKILLS) SKILL_BY_ID[s.id] = s;

export const TREES = ['fire', 'cold', 'light'];
export const CLASS_TREES = {
  sorceress: ['fire', 'cold', 'light'],
  barbarian: ['cries', 'combat', 'mastery'],
};
export const TREE_NAME = {
  fire: 'Fire', cold: 'Cold', light: 'Lightning',
  cries: 'Warcries', combat: 'Combat', mastery: 'Masteries',
};

// ------------------------------------------------------------- allocation

export function canAllocate(player, id) {
  const sk = SKILL_BY_ID[id];
  if (!sk) return { ok: false, why: 'unknown skill' };
  if (!CLASS_TREES[player.cls].includes(sk.tree)) return { ok: false, why: 'not of your class' };
  if (player.skillPoints <= 0) return { ok: false, why: 'no skill points' };
  if (player.level < sk.req) return { ok: false, why: `requires level ${sk.req}` };
  for (const p of sk.prereq || []) {
    if (allocatedPoints(player, p) <= 0) return { ok: false, why: `requires ${SKILL_BY_ID[p].name}` };
  }
  if (allocatedPoints(player, id) >= 20) return { ok: false, why: 'at maximum' };
  return { ok: true };
}

export function allocate(player, id) {
  const c = canAllocate(player, id);
  if (!c.ok) return false;
  player.skills[id] = allocatedPoints(player, id) + 1;
  player.skillPoints--;
  refreshPassives(player);
  return true;
}

// Warmth feeds player.manaRegenBonus directly; the masteries feed
// masteryPoints and ironSkinLevel the same way, which recalc folds into
// the sheet.
export function refreshPassives(player) {
  const w = skillLevel(player, 'warmth');
  player.manaRegenBonus = w > 0 ? SKILL_BY_ID.warmth.manaRegen(w) : 0;
  player.masteryPoints = {
    axe: skillLevel(player, 'axemastery'),
    mace: skillLevel(player, 'macemastery'),
    sword: skillLevel(player, 'swordmastery'),
  };
  player.ironSkinLevel = skillLevel(player, 'ironskin');
  player.recalc();
}

export function manaCost(player, id) {
  const sk = SKILL_BY_ID[id];
  if (!sk || !sk.mana) return 0;
  return Math.max(1, Math.round(sk.mana(Math.max(1, skillLevel(player, id))) * 10) / 10);
}

// Returns 'ok' | 'locked' | 'mana' | 'failed'
export function castSkill(player, id, tx, ty, ctx) {
  const sk = SKILL_BY_ID[id];
  if (!sk || sk.passive || !sk.cast) return 'locked';
  const lvl = skillLevel(player, id);
  if (lvl <= 0) return 'locked';
  const cost = manaCost(player, id);
  if (player.mana < cost) return 'mana';
  const r = sk.cast(player, lvl, tx, ty, ctx);
  if (r === false) return 'failed';
  player.mana -= cost;
  return 'ok';
}

export function describeSkill(player, id) {
  const sk = SKILL_BY_ID[id];
  const alloc = allocatedPoints(player, id);
  const lvl = Math.max(1, skillLevel(player, id));
  const lines = [];
  lines.push({ text: sk.name, colour: '#ffe08a', header: true });
  lines.push({ text: sk.passive ? 'Passive' : `${TREE_NAME[sk.tree]} Skill`, colour: '#9a9078' });
  if (alloc > 0) {
    lines.push({ text: `Level ${alloc}${lvl > alloc ? ` (+${lvl - alloc})` : ''}`, colour: '#d6cdb4' });
  } else {
    lines.push({ text: `Requires Level ${sk.req}`, colour: player.level >= sk.req ? '#9a9078' : '#ff5a4a' });
  }
  lines.push({ text: sk.blurb, colour: '#a89f88', wrap: true });
  if (sk.mana) lines.push({ text: `Mana Cost: ${manaCost(player, id)}`, colour: '#7a86ff' });
  const dmg = skillDamage(player, id);
  if (dmg) lines.push({ text: `Damage: ${dmg.min} to ${dmg.max}`, colour: '#7a86ff' });
  if (sk.effect) lines.push({ text: sk.effect(lvl), colour: '#7a86ff' });
  if (sk.synergies && sk.synergies.length) {
    const pct = synergyPct(player, sk);
    lines.push({ text: `Synergies: ${sk.synergies.map((s) => SKILL_BY_ID[s.id].name).join(', ')}`, colour: '#8a7f6a' });
    if (pct > 0) lines.push({ text: `+${pct}% from synergies`, colour: '#8fd88f' });
  }
  for (const p of sk.prereq || []) {
    if (allocatedPoints(player, p) <= 0) lines.push({ text: `Requires ${SKILL_BY_ID[p].name}`, colour: '#ff5a4a' });
  }
  return lines;
}
