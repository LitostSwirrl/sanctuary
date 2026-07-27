// Shared base for anything that stands on the ground and animates.
//
// Movement resolves one axis at a time against the tile grid, which makes
// sliding along a wall fall out for free instead of needing a separate
// collision response.

import { dirFromVector } from '../core/iso.js';
import { ANIMS } from '../art/figures.js';

const DEFAULT_FPS = { idle: 6, walk: 11, attack: 13, cast: 12, death: 10 };

export class Entity {
  constructor(o = {}) {
    this.x = o.x || 0;
    this.y = o.y || 0;
    this.dir = o.dir ?? 2;
    this.radius = o.radius ?? 0.32;
    this.speed = o.speed ?? 4.2;
    this.sheet = o.sheet || null;
    this.name = o.name || '';

    this.maxHp = o.hp || 10;
    this.hp = this.maxHp;
    this.alive = true;
    this.remove = false;

    this.animName = 'idle';
    this.animTime = 0;
    this.frame = 0;
    this.animLoop = true;
    this.animFps = DEFAULT_FPS.idle;
    this.animEnded = false;
    this.onAnimEnd = null;
    this.hitFrame = -1;
    this.onHitFrame = null;
    this.hitFired = false;

    this.hitFlash = 0;
    this.chilled = 0;      // seconds of cold slow remaining
    this.chillAmount = 0;
    this.frozen = 0;
    this.burning = 0;
    this.burnDps = 0;
    this.burnSource = null;
    this.corpseTimer = 0;
    this.alpha = 1;
  }

  get slowFactor() {
    if (this.frozen > 0) return 0;
    if (this.chilled > 0) return 1 - this.chillAmount;
    return 1;
  }

  setAnim(name, o = {}) {
    if (this.animName === name && !o.force) return;
    if (this.sheet && !this.sheet.has(name)) name = 'idle';
    this.animName = name;
    this.animTime = 0;
    this.frame = 0;
    this.animLoop = o.loop !== false;
    this.animFps = o.fps || DEFAULT_FPS[name] || 10;
    this.animEnded = false;
    this.onAnimEnd = o.onEnd || null;
    this.hitFrame = o.hitFrame ?? -1;
    this.onHitFrame = o.onHitFrame || null;
    this.hitFired = false;
  }

  updateAnim(dt) {
    const frames = ANIMS[this.animName] || 4;
    this.animTime += dt * this.animFps;
    let f = Math.floor(this.animTime);
    const reachedEnd = f >= frames;

    if (reachedEnd) {
      if (this.animLoop) { this.animTime -= frames; f = Math.floor(this.animTime); }
      else f = frames - 1;
    }
    // Publish the frame before firing callbacks. A hit callback that inspects
    // the entity — for a spawn position, a facing, an effect — must see the
    // frame the blow actually landed on, not the one before it.
    this.frame = f;

    if (this.hitFrame >= 0 && !this.hitFired && (f >= this.hitFrame || reachedEnd)) {
      this.hitFired = true;
      if (this.onHitFrame) this.onHitFrame();
    }
    if (reachedEnd && !this.animLoop && !this.animEnded) {
      this.animEnded = true;
      if (this.onAnimEnd) this.onAnimEnd();
    }
  }

  face(tx, ty) {
    const dx = tx - this.x, dy = ty - this.y;
    if (dx * dx + dy * dy > 1e-6) this.dir = dirFromVector(dx, dy);
  }

  // Axis-separated movement. Returns true if anything actually moved.
  moveBy(dx, dy, level) {
    let moved = false;
    if (dx !== 0 && !level.blockedCircle(this.x + dx, this.y, this.radius)) { this.x += dx; moved = true; }
    if (dy !== 0 && !level.blockedCircle(this.x, this.y + dy, this.radius)) { this.y += dy; moved = true; }
    return moved;
  }

  // Push apart from another entity so packs do not collapse to a single point.
  separate(other, dt) {
    const dx = this.x - other.x, dy = this.y - other.y;
    const d2 = dx * dx + dy * dy;
    const min = this.radius + other.radius;
    if (d2 > min * min || d2 < 1e-8) return;
    const d = Math.sqrt(d2);
    const push = (min - d) * 3.5 * dt;
    this.x += (dx / d) * push;
    this.y += (dy / d) * push;
  }

  distTo(o) { return Math.hypot(o.x - this.x, o.y - this.y); }

  updateStatus(dt) {
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 2.6);
    if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);
    if (this.chilled > 0) this.chilled = Math.max(0, this.chilled - dt);
    if (this.burning > 0) this.burning = Math.max(0, this.burning - dt);
  }

  die(cause) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.corpseTimer = 0;
    this.setAnim('death', { loop: false, force: true });
    this.deathCause = cause || null;
  }
}
