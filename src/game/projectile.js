// Projectiles.
//
// Everything in flight lives here: player bolts, monster shots, the shards a
// Frozen Orb sheds. Each one carries its own hit and expiry callbacks, so a
// Fire Ball is a projectile that happens to explode rather than a special case
// in the update loop.

export class Projectiles {
  constructor() { this.list = []; }

  clear() { this.list.length = 0; }

  spawn(o) {
    const p = {
      x: o.x, y: o.y, z: o.z ?? 14,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      speed: o.speed || Math.hypot(o.vx || 0, o.vy || 0) || 8,
      ttl: o.ttl ?? 2.2,
      radius: o.radius ?? 0.3,
      element: o.element || 'fire',
      min: o.min || 1, max: o.max || 2,
      colour: o.colour || '#ffb040',
      core: o.core || '#ffffff',
      drawR: o.drawR ?? 5,
      light: o.light ?? 4.5,
      hostile: !!o.hostile,
      owner: o.owner || null,
      pierce: o.pierce || 0,
      homing: o.homing || 0,
      gravity: o.gravity || 0,
      trail: o.trail || null,
      onHit: o.onHit || null,
      onExpire: o.onExpire || null,
      hitList: new Set(),
      dead: false,
      age: 0,
    };
    this.list.push(p);
    return p;
  }

  update(dt, ctx) {
    const level = ctx.level, player = ctx.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      p.ttl -= dt;

      if (p.homing > 0) {
        const t = p.hostile ? player : nearestTarget(ctx, p);
        if (t) {
          const dx = t.x - p.x, dy = t.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const k = Math.min(1, p.homing * dt * 4);
          p.vx += ((dx / d) * p.speed - p.vx) * k;
          p.vy += ((dy / d) * p.speed - p.vy) * k;
          const s = Math.hypot(p.vx, p.vy) || 1;
          p.vx = (p.vx / s) * p.speed;
          p.vy = (p.vy / s) * p.speed;
        }
      }

      p.vz -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (p.trail) p.trail(p, dt);

      // Walls stop everything.
      if (level.blocked(p.x, p.y)) {
        this.finish(p, i, ctx, null);
        continue;
      }

      // Targets.
      if (p.hostile) {
        if (player.alive !== false && !p.hitList.has(player)) {
          const d = Math.hypot(player.x - p.x, player.y - p.y);
          if (d < p.radius + player.radius) {
            p.hitList.add(player);
            if (p.onHit) p.onHit(p, player);
            if (p.pierce-- <= 0) { this.finish(p, i, ctx, player); continue; }
          }
        }
      } else {
        let consumed = false;
        for (const e of level.entities) {
          if (!e.alive || e.isPlayer || e.isNpc || p.hitList.has(e)) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d >= p.radius + e.radius) continue;
          p.hitList.add(e);
          if (p.onHit) p.onHit(p, e);
          if (p.pierce-- <= 0) { this.finish(p, i, ctx, e); consumed = true; break; }
        }
        if (consumed) continue;
      }

      if (p.ttl <= 0) { this.finish(p, i, ctx, null); continue; }
    }
  }

  finish(p, i, ctx, target) {
    if (p.dead) return;
    p.dead = true;
    if (p.onExpire) p.onExpire(p, target, ctx);
    this.list.splice(i, 1);
  }

  lights(out) {
    for (const p of this.list) {
      if (!p.light) continue;
      const c = hexToTriple(p.colour);
      out.push({ x: p.x, y: p.y, r: p.light, cr: c[0], cg: c[1], cb: c[2], i: 1, flicker: false });
    }
    return out;
  }
}

function nearestTarget(ctx, p) {
  let best = null, bd = 9;
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc || p.hitList.has(e)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const triples = new Map();
function hexToTriple(hex) {
  let t = triples.get(hex);
  if (!t) {
    const h = hex.replace('#', '');
    t = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    triples.set(hex, t);
  }
  return t;
}
