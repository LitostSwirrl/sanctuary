// Particles, lightning arcs, expanding rings and ground decals.
//
// Positions live in tile space with a separate height in pixels, so a spark
// thrown from a chest-high impact arcs correctly over the isometric ground and
// lands where it should. Bright particles also feed the light buffer, which is
// what makes a fireball actually illuminate the room it flies through.

const MAX_PARTICLES = 1400;
const MAX_DECALS = 220;

const TYPES = {
  spark:  { add: true,  grav: 26,  drag: 2.2, size: 2.2, life: 0.45 },
  ember:  { add: true,  grav: -8,  drag: 1.4, size: 1.8, life: 0.9 },
  ice:    { add: true,  grav: 34,  drag: 1.0, size: 2.4, life: 0.6 },
  blood:  { add: false, grav: 62,  drag: 0.6, size: 2.2, life: 1.1 },
  smoke:  { add: false, grav: -6,  drag: 1.8, size: 3.4, life: 1.3 },
  dust:   { add: false, grav: -2,  drag: 2.6, size: 2.6, life: 0.7 },
  shard:  { add: true,  grav: 20,  drag: 0.8, size: 1.6, life: 0.5 },
  glow:   { add: true,  grav: 0,   drag: 3.0, size: 4.0, life: 0.35 },
};

export class Particles {
  constructor() {
    this.p = [];
    this.arcs = [];
    this.rings = [];
    this.decals = [];
    this.floats = [];   // floating combat text
  }

  clear() {
    this.p.length = 0; this.arcs.length = 0; this.rings.length = 0;
    this.decals.length = 0; this.floats.length = 0;
  }

  spawn(type, x, y, o = {}) {
    if (this.p.length >= MAX_PARTICLES) return;
    const d = TYPES[type] || TYPES.spark;
    const spread = o.spread ?? 2.2;
    const life = (o.life ?? d.life) * (0.7 + Math.random() * 0.6);
    this.p.push({
      type, x, y,
      z: o.z ?? 10,
      vx: (o.vx ?? 0) + (Math.random() - 0.5) * spread,
      vy: (o.vy ?? 0) + (Math.random() - 0.5) * spread,
      vz: (o.vz ?? 0) + (Math.random() - 0.5) * (o.spreadZ ?? 20),
      life, max: life,
      size: (o.size ?? d.size) * (0.75 + Math.random() * 0.5),
      r: o.r ?? 255, g: o.g ?? 180, b: o.b ?? 60,
      grav: o.grav ?? d.grav,
      drag: o.drag ?? d.drag,
      add: d.add,
      lit: o.lit ?? 0,
    });
  }

  burst(type, x, y, n, o = {}) {
    for (let i = 0; i < n; i++) this.spawn(type, x, y, o);
  }

  // A jagged bolt between two points, redrawn once and then fading.
  arc(x0, y0, x1, y1, o = {}) {
    const segs = o.segs ?? 7;
    const pts = [];
    const jitter = o.jitter ?? 0.35;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const jx = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * jitter;
      const jy = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * jitter;
      pts.push({ x: x0 + (x1 - x0) * t + jx, y: y0 + (y1 - y0) * t + jy, z: (o.z ?? 12) + (Math.random() - 0.5) * 6 });
    }
    this.arcs.push({ pts, life: o.life ?? 0.18, max: o.life ?? 0.18, r: o.r ?? 150, g: o.g ?? 190, b: o.b ?? 255, w: o.w ?? 2 });
  }

  ring(x, y, o = {}) {
    this.rings.push({
      x, y, z: o.z ?? 6,
      r: 0.2, maxR: o.maxR ?? 4,
      life: o.life ?? 0.4, max: o.life ?? 0.4,
      cr: o.cr ?? 120, cg: o.cg ?? 190, cb: o.cb ?? 255,
      w: o.w ?? 3, lit: o.lit ?? 1,
    });
  }

  decal(x, y, o = {}) {
    this.decals.push({ x, y, r: o.r ?? 0.5, cr: o.cr ?? 110, cg: o.cg ?? 20, cb: o.cb ?? 18, a: o.a ?? 0.55, seed: Math.random() * 6.28 });
    if (this.decals.length > MAX_DECALS) this.decals.shift();
  }

  float(x, y, text, color, o = {}) {
    this.floats.push({ x, y, z: o.z ?? 34, text, color, life: o.life ?? 1.0, max: o.life ?? 1.0, vz: o.vz ?? 26, dx: o.dx ?? (Math.random() - 0.5) * 0.6 });
  }

  update(dt) {
    const p = this.p;
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      q.life -= dt;
      if (q.life <= 0) { p[i] = p[p.length - 1]; p.pop(); continue; }
      const k = 1 - q.drag * dt;
      q.vx *= k; q.vy *= k;
      q.vz -= q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.z < 0) {
        if (q.type === 'blood') { this.decal(q.x, q.y, { r: 0.28 + Math.random() * 0.22 }); q.life = 0; }
        q.z = 0; q.vz *= -0.32; q.vx *= 0.5; q.vy *= 0.5;
      }
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.r = r.maxR * (1 - r.life / r.max);
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.z += f.vz * dt;
      f.vz *= 1 - 1.6 * dt;
      f.x += f.dx * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
  }

  // Ground decals paint under everything else.
  drawDecals(ctx, cam) {
    const z = cam.zoom;
    for (const d of this.decals) {
      const s = cam.toScreen(d.x, d.y);
      ctx.fillStyle = `rgba(${d.cr},${d.cg},${d.cb},${d.a})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, d.r * 32 * z, d.r * 16 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw(ctx, cam) {
    const z = cam.zoom;

    // Normal-blended particles first.
    for (const q of this.p) {
      if (q.add) continue;
      const s = cam.toScreen(q.x, q.y);
      const a = Math.min(1, q.life / q.max);
      const sz = Math.max(1, q.size * z * (q.type === 'smoke' ? (2 - a) : a * 0.6 + 0.6));
      ctx.fillStyle = `rgba(${q.r | 0},${q.g | 0},${q.b | 0},${a * (q.type === 'smoke' ? 0.4 : 0.9)})`;
      ctx.fillRect(s.x - sz / 2, s.y - q.z * z - sz / 2, sz, sz);
    }

    ctx.globalCompositeOperation = 'lighter';

    for (const q of this.p) {
      if (!q.add) continue;
      const s = cam.toScreen(q.x, q.y);
      const a = Math.min(1, q.life / q.max);
      const sz = Math.max(1, q.size * z * (a * 0.7 + 0.4));
      ctx.fillStyle = `rgba(${q.r | 0},${q.g | 0},${q.b | 0},${a})`;
      ctx.fillRect(s.x - sz / 2, s.y - q.z * z - sz / 2, sz, sz);
    }

    for (const arc of this.arcs) {
      const a = arc.life / arc.max;
      ctx.strokeStyle = `rgba(${arc.r},${arc.g},${arc.b},${a})`;
      ctx.lineWidth = arc.w * z;
      ctx.beginPath();
      for (let i = 0; i < arc.pts.length; i++) {
        const p = arc.pts[i];
        const s = cam.toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y - p.z * z);
        else ctx.lineTo(s.x, s.y - p.z * z);
      }
      ctx.stroke();
    }

    for (const r of this.rings) {
      const a = r.life / r.max;
      ctx.strokeStyle = `rgba(${r.cr},${r.cg},${r.cb},${a * 0.9})`;
      ctx.lineWidth = r.w * z;
      ctx.beginPath();
      const s = cam.toScreen(r.x, r.y);
      ctx.ellipse(s.x, s.y - r.z * z, r.r * 32 * z, r.r * 16 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  drawFloats(ctx, cam, uiScale) {
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const s = cam.toScreen(f.x, f.y);
      const a = Math.min(1, f.life / f.max * 1.6);
      ctx.font = `${Math.round(15 * uiScale)}px Georgia, serif`;
      ctx.fillStyle = `rgba(0,0,0,${a * 0.7})`;
      ctx.fillText(f.text, s.x + 1, s.y - f.z * cam.zoom + 1);
      ctx.fillStyle = f.color.replace(/[\d.]+\)$/, a + ')');
      ctx.fillText(f.text, s.x, s.y - f.z * cam.zoom);
    }
    ctx.textAlign = 'left';
  }

  // Light sources contributed by effects, consumed by the renderer.
  lights(out) {
    for (const q of this.p) {
      if (!q.lit) continue;
      const a = q.life / q.max;
      out.push({ x: q.x, y: q.y, r: q.lit * a, cr: q.r, cg: q.g, cb: q.b, i: a });
    }
    for (const r of this.rings) {
      if (!r.lit) continue;
      const a = r.life / r.max;
      out.push({ x: r.x, y: r.y, r: (r.r + 1.5) * r.lit, cr: r.cr, cg: r.cg, cb: r.cb, i: a * 0.9 });
    }
    for (const arc of this.arcs) {
      const mid = arc.pts[arc.pts.length >> 1];
      out.push({ x: mid.x, y: mid.y, r: 5, cr: arc.r, cg: arc.g, cb: arc.b, i: arc.life / arc.max });
    }
    return out;
  }
}

// Named effect recipes, so callers ask for "a fireball exploded here" rather
// than assembling particle parameters at every call site.
export const FX = {
  hitBlood(fx, x, y) {
    fx.burst('blood', x, y, 7, { z: 16, spread: 3.4, spreadZ: 34, r: 130, g: 24, b: 20 });
  },
  hitSpark(fx, x, y) {
    fx.burst('spark', x, y, 5, { z: 16, spread: 3, spreadZ: 30, r: 255, g: 220, b: 140 });
  },
  fireTrail(fx, x, y, z) {
    fx.spawn('ember', x, y, { z, spread: 0.7, spreadZ: 6, r: 255, g: 140, b: 40, size: 2.4, lit: 0 });
  },
  fireBurst(fx, x, y, radius) {
    fx.burst('ember', x, y, 26, { z: 8, spread: radius * 2.4, spreadZ: 44, r: 255, g: 150, b: 50, life: 0.7 });
    fx.burst('smoke', x, y, 10, { z: 14, spread: radius * 1.4, spreadZ: 16, r: 60, g: 50, b: 44, life: 1.2 });
    fx.ring(x, y, { maxR: radius, cr: 255, cg: 150, cb: 60, life: 0.34, w: 4, lit: 1.6 });
  },
  iceBurst(fx, x, y, radius) {
    fx.burst('ice', x, y, 22, { z: 8, spread: radius * 2.2, spreadZ: 38, r: 150, g: 220, b: 255, life: 0.6 });
    fx.ring(x, y, { maxR: radius, cr: 150, cg: 220, cb: 255, life: 0.4, w: 3, lit: 1.3 });
  },
  lightBurst(fx, x, y, radius) {
    fx.ring(x, y, { maxR: radius, cr: 170, cg: 200, cb: 255, life: 0.3, w: 3, lit: 1.6 });
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      fx.arc(x, y, x + Math.cos(a) * radius, y + Math.sin(a) * radius, { z: 10, w: 2 });
    }
  },
  death(fx, x, y) {
    fx.burst('blood', x, y, 10, { z: 18, spread: 3.6, spreadZ: 30, r: 120, g: 22, b: 18 });
    fx.burst('dust', x, y, 8, { z: 6, spread: 2.4, spreadZ: 10, r: 90, g: 82, b: 70 });
  },
  levelUp(fx, x, y) {
    fx.ring(x, y, { maxR: 3.2, cr: 255, cg: 230, cb: 150, life: 0.9, w: 4, lit: 2.2 });
    for (let i = 0; i < 40; i++) {
      fx.spawn('ember', x, y, { z: 2, spread: 1.6, vz: 30 + Math.random() * 40, r: 255, g: 225, b: 140, life: 1.2 });
    }
  },
  teleport(fx, x, y) {
    fx.burst('glow', x, y, 16, { z: 16, spread: 2.6, spreadZ: 26, r: 170, g: 110, b: 255, life: 0.4 });
    fx.ring(x, y, { maxR: 1.8, cr: 180, cg: 120, cb: 255, life: 0.3, w: 3, lit: 1.4 });
  },
};
