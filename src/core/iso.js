// Isometric projection. The simulation lives in tile space; only drawing ever
// touches screen space.

export const TILE_W = 64;
export const TILE_H = 32;
export const HW = TILE_W / 2; // 32
export const HH = TILE_H / 2; // 16

export function worldToScreen(wx, wy) {
  return { x: (wx - wy) * HW, y: (wx + wy) * HH };
}

export function screenToWorld(sx, sy) {
  const a = sx / HW;
  const b = sy / HH;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

// Depth key. Larger paints later, so it draws in front.
export function depthOf(wx, wy) { return wx + wy; }

// Eight compass directions, index 0 pointing south-east on screen and rotating
// clockwise. Sprite sheets store 0..4 and mirror 5..7.
const DIR_COUNT = 8;
export function dirFromVector(dx, dy) {
  if (dx === 0 && dy === 0) return 0;
  // Rotate into screen space first so "up" on screen means up for the sprite.
  const sx = (dx - dy);
  const sy = (dx + dy) * 0.5;
  let a = Math.atan2(sy, sx);           // -PI..PI, 0 = screen right
  a = (a + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / (Math.PI * 2) * DIR_COUNT) % DIR_COUNT;
}

export class Camera {
  constructor(w = 1280, h = 720) {
    this.x = 0; this.y = 0;   // centre, in tile space
    this.w = w; this.h = h;   // viewport in device pixels
    this.zoom = 1;
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
  }

  resize(w, h) { this.w = w; this.h = h; }

  follow(target, dt, snap = false) {
    if (snap) { this.x = target.x; this.y = target.y; return; }
    // Critically damped-ish easing: fast enough to keep up, soft enough to breathe.
    const k = 1 - Math.pow(0.0001, dt);
    this.x += (target.x - this.x) * k;
    this.y += (target.y - this.y) * k;
  }

  addShake(amount) { this.shake = Math.min(14, this.shake + amount); }

  updateShake(dt, rnd = Math.random) {
    if (this.shake <= 0) { this.shakeX = 0; this.shakeY = 0; this.shake = 0; return; }
    this.shakeX = (rnd() * 2 - 1) * this.shake;
    this.shakeY = (rnd() * 2 - 1) * this.shake * 0.6;
    this.shake = Math.max(0, this.shake - dt * 40);
  }

  // Tile space to device pixels.
  toScreen(wx, wy) {
    const p = worldToScreen(wx, wy);
    const c = worldToScreen(this.x, this.y);
    return {
      x: (p.x - c.x) * this.zoom + this.w / 2 + this.shakeX,
      y: (p.y - c.y) * this.zoom + this.h / 2 + this.shakeY,
    };
  }

  // Device pixels back to tile space.
  toWorld(px, py) {
    const c = worldToScreen(this.x, this.y);
    const sx = (px - this.w / 2 - this.shakeX) / this.zoom + c.x;
    const sy = (py - this.h / 2 - this.shakeY) / this.zoom + c.y;
    return screenToWorld(sx, sy);
  }

  // Tile range that can possibly touch the viewport, with slack for tall sprites.
  visibleTileBounds(pad = 4) {
    const corners = [
      this.toWorld(0, 0),
      this.toWorld(this.w, 0),
      this.toWorld(0, this.h),
      this.toWorld(this.w, this.h),
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    return {
      x0: Math.floor(minX) - pad, x1: Math.ceil(maxX) + pad,
      y0: Math.floor(minY) - pad, y1: Math.ceil(maxY) + pad,
    };
  }
}
