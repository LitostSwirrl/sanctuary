// Hand-written rasterizers writing into a raw pixel buffer.
//
// Nothing here uses the Canvas 2D path API on purpose: canvas antialiases every
// edge, and antialiased pixel art reads as mush once it is scaled up. Every
// shape below produces hard pixel edges, and a single outline pass at the end
// gives the whole sprite one clean silhouette.

import { packRGB, unpack } from './palette.js';

// Default light direction, up and to the left, shared by everything so the
// entire game agrees where the sun is.
export const LIGHT_X = -0.55;
export const LIGHT_Y = -0.83;

export class Buf {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.img = new ImageData(w, h);
    this.data = new Uint32Array(this.img.data.buffer);
  }
  clear() { this.data.fill(0); }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }
}

// Write one pixel, blending if the source is not fully opaque.
export function px(buf, x, y, c) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const a = (c >>> 24) & 255;
  if (a === 0) return;
  const i = y * buf.w + x;
  if (a === 255) { buf.data[i] = c; return; }
  const dst = buf.data[i];
  const da = (dst >>> 24) & 255;
  if (da === 0) { buf.data[i] = c; return; }
  const sa = a / 255, ia = 1 - sa;
  const r = ((c & 255) * sa + (dst & 255) * ia) | 0;
  const g = (((c >>> 8) & 255) * sa + ((dst >>> 8) & 255) * ia) | 0;
  const b = (((c >>> 16) & 255) * sa + ((dst >>> 16) & 255) * ia) | 0;
  buf.data[i] = packRGB(r, g, b, Math.max(da, a));
}

// Additive write, for glows and magical effects.
export function pxAdd(buf, x, y, c, strength = 1) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = y * buf.w + x;
  const dst = buf.data[i];
  const r = Math.min(255, (dst & 255) + (c & 255) * strength) | 0;
  const g = Math.min(255, ((dst >>> 8) & 255) + ((c >>> 8) & 255) * strength) | 0;
  const b = Math.min(255, ((dst >>> 16) & 255) + ((c >>> 16) & 255) * strength) | 0;
  const a = Math.max((dst >>> 24) & 255, (c >>> 24) & 255);
  buf.data[i] = packRGB(r, g, b, a);
}

// Pick a ramp entry from a surface normal. Three bands is deliberately few:
// more bands start to look like a gradient rather than pixel art.
function shadeOf(rm, nx, ny, bias = 0) {
  const s = nx * LIGHT_X + ny * LIGHT_Y + bias;
  if (s > 0.34) return rm.light;
  if (s < -0.28) return rm.dark;
  return rm.base;
}

export function rectF(buf, x, y, w, h, c) {
  const x0 = Math.max(0, x | 0), x1 = Math.min(buf.w, (x + w) | 0);
  const y0 = Math.max(0, y | 0), y1 = Math.min(buf.h, (y + h) | 0);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) px(buf, xx, yy, c);
}

// A tapered round-ended limb. The workhorse of every creature in the game.
export function capsule(buf, x0, y0, r0, x1, y1, r1, rm, opts = {}) {
  const bias = opts.bias || 0;
  const minX = Math.max(0, Math.floor(Math.min(x0 - r0, x1 - r1)) - 1);
  const maxX = Math.min(buf.w - 1, Math.ceil(Math.max(x0 + r0, x1 + r1)) + 1);
  const minY = Math.max(0, Math.floor(Math.min(y0 - r0, y1 - r1)) - 1);
  const maxY = Math.min(buf.h - 1, Math.ceil(Math.max(y0 + r0, y1 + r1)) + 1);
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1e-6;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cxp = x + 0.5 - x0, cyp = y + 0.5 - y0;
      let t = (cxp * dx + cyp * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px_ = x0 + t * dx, py_ = y0 + t * dy;
      const r = r0 + t * (r1 - r0);
      if (r <= 0) continue;
      const ox = x + 0.5 - px_, oy = y + 0.5 - py_;
      const d2 = ox * ox + oy * oy;
      if (d2 > r * r) continue;
      px(buf, x, y, shadeOf(rm, ox / r, oy / r, bias));
    }
  }
}

export function ellipse(buf, cx, cy, rx, ry, rm, opts = {}) {
  const bias = opts.bias || 0;
  const minX = Math.max(0, Math.floor(cx - rx) - 1), maxX = Math.min(buf.w - 1, Math.ceil(cx + rx) + 1);
  const minY = Math.max(0, Math.floor(cy - ry) - 1), maxY = Math.min(buf.h - 1, Math.ceil(cy + ry) + 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      px(buf, x, y, shadeOf(rm, nx, ny, bias));
    }
  }
}

// Solid ellipse with no shading, used for ground shadows and flat masks.
export function ellipseF(buf, cx, cy, rx, ry, c) {
  const minX = Math.max(0, Math.floor(cx - rx)), maxX = Math.min(buf.w - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(cy - ry)), maxY = Math.min(buf.h - 1, Math.ceil(cy + ry));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      px(buf, x, y, c);
    }
  }
}

export function lineP(buf, x0, y0, x1, y1, c, thick = 1) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const half = (thick - 1) / 2;
  for (;;) {
    if (thick <= 1) px(buf, x0, y0, c);
    else for (let oy = -half; oy <= half; oy++) for (let ox = -half; ox <= half; ox++) px(buf, x0 + ox, y0 + oy, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Scanline polygon fill. pts is a flat [x0,y0,x1,y1,...] list.
export function polyF(buf, pts, c, shader = null) {
  let minY = Infinity, maxY = -Infinity;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const y = pts[i * 2 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(buf.h - 1, Math.ceil(maxY));
  const xs = [];
  for (let y = minY; y <= maxY; y++) {
    xs.length = 0;
    const scan = y + 0.5;
    for (let i = 0; i < n; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1];
      const j = (i + 1) % n;
      const bx = pts[j * 2], by = pts[j * 2 + 1];
      if ((ay <= scan && by > scan) || (by <= scan && ay > scan)) {
        xs.push(ax + (scan - ay) / (by - ay) * (bx - ax));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(buf.w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) px(buf, x, y, shader ? shader(x, y) : c);
    }
  }
}

// Grow a one-pixel border outward from every opaque pixel. Run last. This is
// what welds a pile of overlapping limbs into a single readable silhouette.
export function outline(buf, c) {
  const { w, h, data } = buf;
  const marks = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((data[i] >>> 24) !== 0) continue;
      const up = y > 0 && (data[i - w] >>> 24) !== 0;
      const dn = y < h - 1 && (data[i + w] >>> 24) !== 0;
      const lf = x > 0 && (data[i - 1] >>> 24) !== 0;
      const rt = x < w - 1 && (data[i + 1] >>> 24) !== 0;
      if (up || dn || lf || rt) marks.push(i);
    }
  }
  for (let k = 0; k < marks.length; k++) data[marks[k]] = c;
}

// Darken the lower portion of a sprite so it reads as grounded.
export function groundFade(buf, fromY, strength = 0.45) {
  const { w, h, data } = buf;
  for (let y = Math.max(0, fromY | 0); y < h; y++) {
    const t = (y - fromY) / Math.max(1, h - fromY);
    const k = 1 - t * strength;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = data[i];
      if ((c >>> 24) === 0) continue;
      data[i] = packRGB((c & 255) * k, ((c >>> 8) & 255) * k, ((c >>> 16) & 255) * k, (c >>> 24) & 255);
    }
  }
}

// Multiply every opaque pixel toward a tint. Used for monster variants and for
// the frozen and burning states.
export function tint(buf, hexPacked, amount) {
  const t = unpack(hexPacked);
  const { data } = buf;
  const ia = 1 - amount;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if ((c >>> 24) === 0) continue;
    data[i] = packRGB(
      (c & 255) * ia + t.r * amount,
      ((c >>> 8) & 255) * ia + t.g * amount,
      ((c >>> 16) & 255) * ia + t.b * amount,
      (c >>> 24) & 255
    );
  }
}

export function bufToCanvas(buf) {
  const cv = document.createElement('canvas');
  cv.width = buf.w; cv.height = buf.h;
  const c = cv.getContext('2d');
  c.putImageData(buf.img, 0, 0);
  return cv;
}

// Copy a buffer into another, skipping fully transparent source pixels.
export function blitBuf(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const c = src.data[y * src.w + x];
      if ((c >>> 24) === 0) continue;
      const tx = dx + x;
      if (tx < 0 || tx >= dst.w) continue;
      dst.data[ty * dst.w + tx] = c;
    }
  }
}

// Mirror horizontally into a new buffer, for the four sprite directions that
// are not generated.
export function mirrorBuf(src) {
  const out = new Buf(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      out.data[y * src.w + (src.w - 1 - x)] = src.data[y * src.w + x];
    }
  }
  return out;
}

// Trim to the tightest box containing opaque pixels. Returns null if empty.
export function boundsOf(buf) {
  let minX = buf.w, minY = buf.h, maxX = -1, maxY = -1;
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if ((buf.data[y * buf.w + x] >>> 24) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
