// The world renderer.
//
// Three passes. Ground paints first at full brightness. Then everything that
// stands on the ground is depth-sorted by (wx + wy) and painted back to front,
// so a character walking behind a wall is occluded by it for free. Finally a
// quarter-scale light buffer is filled with the area's ambient colour, lights
// are added to it, and it is multiplied over the whole scene.
//
// That last pass is what sells the look: corners of rooms genuinely go dark and
// a fireball genuinely lights the room it flies through.

import { getGround, getWall, getProp } from '../art/tiles.js';
import { FLOOR, PATH, WALL } from '../world/level.js';
import { CELL } from '../art/figures.js';

const LIGHT_SCALE = 3;   // light buffer is 1/3 resolution

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.drawables = [];
    this.lightList = [];
    this.time = 0;
    this.stats = { tiles: 0, drawn: 0, lights: 0 };
  }

  resize(w, h) {
    this.light.width = Math.max(1, Math.ceil(w / LIGHT_SCALE));
    this.light.height = Math.max(1, Math.ceil(h / LIGHT_SCALE));
  }

  draw(level, cam, opts = {}) {
    const ctx = this.ctx;
    const { player, fx, projectiles } = opts;
    this.time = opts.time || 0;
    const z = cam.zoom;
    const tw = 64 * z, th = 32 * z;

    ctx.imageSmoothingEnabled = false;
    const amb = level.ambient;
    ctx.fillStyle = `rgb(${(amb[0] * 0.8) | 0},${(amb[1] * 0.8) | 0},${(amb[2] * 0.85) | 0})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const b = cam.visibleTileBounds(3);
    const x0 = Math.max(0, b.x0), x1 = Math.min(level.w - 1, b.x1);
    const y0 = Math.max(0, b.y0), y1 = Math.min(level.h - 1, b.y1);

    // ---------------------------------------------------------- ground pass
    // A wide viewport can see past the edge of the map. Rather than leave a
    // hole, the terrain continues outward as impassable raised ground.
    const OUTER = 22;
    const wl0 = getWall(level.wallTerrain, 0, 0);
    const wh = wl0.oy - 16;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (x >= 0 && y >= 0 && x < level.w && y < level.h) continue;
        if (x < -OUTER || y < -OUTER || x > level.w + OUTER || y > level.h + OUTER) continue;
        const s = cam.toScreen(x, y);
        if (s.x < -tw || s.x > this.canvas.width + tw || s.y < -th * 4 || s.y > this.canvas.height + th) continue;
        const wl = getWall(level.wallTerrain, x, y);
        ctx.drawImage(wl.canvas, 0, 0, 64, 32, s.x - tw / 2, s.y - (16 + wh) * z, tw, th);
      }
    }

    let tiles = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = level.tiles[y * level.w + x];
        if (t !== FLOOR && t !== PATH) continue;
        const s = cam.toScreen(x, y);
        if (s.x < -tw || s.x > this.canvas.width + tw || s.y < -th || s.y > this.canvas.height + th) continue;
        const terrain = t === PATH ? level.pathTerrain : level.terrain;
        ctx.drawImage(getGround(terrain, x, y), s.x - tw / 2, s.y - th / 2, tw, th);
        tiles++;
      }
    }
    this.stats.tiles = tiles;

    if (fx) fx.drawDecals(ctx, cam);

    // ------------------------------------------------------- collect sorted
    const D = this.drawables;
    D.length = 0;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (level.tiles[y * level.w + x] !== WALL) continue;
        // A wall surrounded by other walls never shows a side face, so only its
        // top is painted. Without this a large rock mass renders as a hole
        // straight through to the background.
        D.push({ d: x + y, kind: this.enclosed(level, x, y) ? 'walltop' : 'wall', x, y });
      }
    }

    for (const p of level.props) {
      if (p.x < x0 - 2 || p.x > x1 + 2 || p.y < y0 - 2 || p.y > y1 + 2) continue;
      D.push({ d: p.x + p.y, kind: 'prop', o: p });
    }
    for (const it of level.items) {
      if (it.taken) continue;
      D.push({ d: it.x + it.y - 0.01, kind: 'item', o: it });
    }
    for (const e of level.entities) {
      if (e.x < x0 - 3 || e.x > x1 + 3 || e.y < y0 - 3 || e.y > y1 + 3) continue;
      D.push({ d: e.x + e.y + (e.alive ? 0 : -0.5), kind: 'entity', o: e });
    }
    if (player && player.alive !== false) D.push({ d: player.x + player.y, kind: 'entity', o: player });
    if (projectiles) {
      for (const p of projectiles.list) D.push({ d: p.x + p.y + 0.02, kind: 'proj', o: p });
    }

    D.sort((a, c) => a.d - c.d);

    // ----------------------------------------------------------- paint pass
    for (const it of D) {
      if (it.kind === 'wall') {
        const s = cam.toScreen(it.x, it.y);
        const wl = getWall(level.wallTerrain, it.x, it.y);
        ctx.drawImage(wl.canvas, s.x - wl.ox * z, s.y - wl.oy * z, wl.canvas.width * z, wl.canvas.height * z);
      } else if (it.kind === 'walltop') {
        const s = cam.toScreen(it.x, it.y);
        const wl = getWall(level.wallTerrain, it.x, it.y);
        const h = wl.oy - 16;
        ctx.drawImage(wl.canvas, 0, 0, 64, 32, s.x - 32 * z, s.y - (16 + h) * z, 64 * z, 32 * z);
      } else if (it.kind === 'prop') {
        const pr = getProp(it.o.name, it.o.seed);
        if (!pr) continue;
        const s = cam.toScreen(it.o.x, it.o.y);
        ctx.drawImage(pr.canvas, s.x - pr.ox * z, s.y - pr.oy * z, pr.canvas.width * z, pr.canvas.height * z);
      } else if (it.kind === 'item') {
        this.drawItem(ctx, cam, it.o);
      } else if (it.kind === 'proj') {
        this.drawProjectile(ctx, cam, it.o);
      } else {
        this.drawEntity(ctx, cam, it.o);
      }
    }
    this.stats.drawn = D.length;

    if (fx) fx.draw(ctx, cam);

    // ----------------------------------------------------------- light pass
    this.paintLights(level, cam, opts);

    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.light, 0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;

    // Floating combat text sits above the lighting so it stays readable in
    // pitch-dark rooms.
    if (fx) fx.drawFloats(ctx, cam, z);
  }

  enclosed(level, x, y) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const t = level.tileAt(x + dx, y + dy);
        if (t === FLOOR || t === PATH) return false;
      }
    }
    return true;
  }

  drawShadow(ctx, cam, x, y, r, alpha = 0.34) {
    const s = cam.toScreen(x, y);
    const z = cam.zoom;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 32 * z, r * 16 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawEntity(ctx, cam, e) {
    if (!e.sheet) return;
    const z = cam.zoom;
    const s = cam.toScreen(e.x, e.y);
    const cw = CELL * z;

    if (e.alive !== false || e.animName === 'death') {
      // Tight and dark: a wide pale blob reads as a glow, a small hard pool
      // under the feet reads as weight.
      this.drawShadow(ctx, cam, e.x, e.y, (e.radius || 0.32) * 1.05, e.alive === false ? 0.22 : 0.46);
    }

    const ix = e.sheet.index(e.animName || 'idle', e.dir | 0, e.frame | 0);
    const dx = s.x - cw / 2;
    const dy = s.y - e.sheet.footY * z - (e.zOff || 0) * z;

    ctx.save();
    if (e.alpha !== undefined && e.alpha < 1) ctx.globalAlpha = Math.max(0, e.alpha);
    if (ix.flip) {
      ctx.translate(dx + cw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(e.sheet.canvas, ix.sx, ix.sy, CELL, CELL, 0, 0, cw, cw);
    } else {
      ctx.drawImage(e.sheet.canvas, ix.sx, ix.sy, CELL, CELL, dx, dy, cw, cw);
    }
    ctx.restore();

    // Damage flash and status tints are composited over the sprite rather than
    // baked, so any creature can be frozen or set alight without more sheets.
    const tint = e.hitFlash > 0 ? { c: '#ffffff', a: Math.min(0.8, e.hitFlash * 3) }
      : e.frozen > 0 ? { c: '#7ad0ff', a: 0.45 }
        : e.chilled > 0 ? { c: '#7ad0ff', a: 0.22 } : null;
    if (tint) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = tint.a;
      ctx.fillStyle = tint.c;
      ctx.fillRect(dx, dy, cw, cw);
      ctx.restore();
    }
    if (e.uniqueAura) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + Math.sin(this.time * 4 + e.x) * 0.1;
      ctx.fillStyle = e.uniqueAura;
      if (ix.flip) {
        ctx.translate(dx + cw, dy); ctx.scale(-1, 1);
        ctx.drawImage(e.sheet.canvas, ix.sx, ix.sy, CELL, CELL, 0, 0, cw, cw);
      } else {
        ctx.drawImage(e.sheet.canvas, ix.sx, ix.sy, CELL, CELL, dx, dy, cw, cw);
      }
      ctx.restore();
    }
  }

  drawItem(ctx, cam, it) {
    const z = cam.zoom;
    const s = cam.toScreen(it.x, it.y);
    const icon = it.icon;
    if (!icon) return;
    this.drawShadow(ctx, cam, it.x, it.y, 0.22, 0.28);
    const bob = Math.sin(this.time * 2.4 + it.x * 3) * 1.5;
    ctx.drawImage(icon, s.x - icon.width * z / 2, s.y - icon.height * z - 2 * z + bob * z,
      icon.width * z, icon.height * z);
  }

  drawProjectile(ctx, cam, p) {
    const z = cam.zoom;
    const s = cam.toScreen(p.x, p.y);
    const y = s.y - (p.z || 12) * z;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = (p.drawR || 5) * z;
    const g = ctx.createRadialGradient(s.x, y, 0, s.x, y, r * 2.4);
    g.addColorStop(0, p.colour || '#ffcc66');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.core || '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------- light pass
  paintLights(level, cam, opts) {
    const L = this.lctx;
    const w = this.light.width, h = this.light.height;
    const a = level.ambient;
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = `rgb(${a[0]},${a[1]},${a[2]})`;
    L.fillRect(0, 0, w, h);

    const list = this.lightList;
    list.length = 0;

    for (const s of level.lights) list.push(s);
    if (opts.player && opts.player.alive !== false) {
      list.push({ x: opts.player.x, y: opts.player.y, r: opts.playerLightRadius || 11, cr: 255, cg: 220, cb: 176, i: 1, flicker: false });
    }
    if (opts.fx) opts.fx.lights(list);
    if (opts.projectiles) opts.projectiles.lights(list);
    if (opts.extraLights) for (const s of opts.extraLights) list.push(s);

    L.globalCompositeOperation = 'lighter';
    const z = cam.zoom / LIGHT_SCALE;
    for (const s of list) {
      const p = cam.toScreen(s.x, s.y);
      const cx = p.x / LIGHT_SCALE, cy = p.y / LIGHT_SCALE - 12 * z;
      // Radius is in tiles; a tile is 64px wide, so this converts to buffer px.
      let rad = s.r * 32 * z * 1.7;
      if (rad < 1) continue;
      if (cx + rad < 0 || cx - rad > w || cy + rad < 0 || cy - rad > h) continue;
      let inten = s.i === undefined ? 1 : s.i;
      if (s.flicker !== false) {
        inten *= 0.86 + Math.sin(this.time * 9.3 + s.x * 5.1 + s.y * 3.3) * 0.09
          + Math.sin(this.time * 21.7 + s.x * 2.2) * 0.05;
      }
      const g = L.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const cr = s.cr ?? 255, cg = s.cg ?? 220, cb = s.cb ?? 170;
      // A hot core and a long dim tail: light pools read as torchlight
      // pressed into darkness rather than a soft floodlamp.
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.95 * inten})`);
      g.addColorStop(0.32, `rgba(${cr},${cg},${cb},${0.52 * inten})`);
      g.addColorStop(0.7, `rgba(${cr},${cg},${cb},${0.16 * inten})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g;
      L.beginPath();
      L.arc(cx, cy, rad, 0, Math.PI * 2);
      L.fill();
    }

    // Vignette, multiplied into the light buffer: whatever the lights do,
    // the frame sinks toward its corners. Slightly blue so the darkness
    // stays coloured instead of going to soot.
    L.globalCompositeOperation = 'multiply';
    const vg = L.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.5, w / 2, h * 0.46, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, 'rgb(255,255,255)');
    vg.addColorStop(1, 'rgb(92,88,106)');
    L.fillStyle = vg;
    L.fillRect(0, 0, w, h);

    L.globalCompositeOperation = 'source-over';
    this.stats.lights = list.length;
  }
}
