// A generated area: the tile grid plus everything standing on it.
//
// Tile values are deliberately coarse. Anything finer (which prop, which
// variant) is derived from a hash of the coordinate at draw time rather than
// stored, which keeps a level cheap enough to regenerate from its seed.

export const VOID = 0;   // outside the playable region; blocked, not drawn
export const FLOOR = 1;
export const WALL = 2;
export const PATH = 3;   // walkable, drawn with the area's path terrain

export class Level {
  constructor(w, h, def) {
    this.w = w; this.h = h;
    this.def = def;
    this.id = def.id;
    // Stamped at generation so anything holding a level knows which act it is
    // standing in without a second lookup. The music asks this every time the
    // player walks through a door.
    this.act = def.act || 1;
    this.name = def.name;
    this.terrain = def.terrain;
    this.pathTerrain = def.pathTerrain || def.terrain;
    this.wallTerrain = def.wallTerrain || def.terrain;
    this.areaLevel = def.areaLevel || 1;
    this.ambient = def.ambient || [70, 68, 80];

    this.tiles = new Uint8Array(w * h);
    this.solid = new Uint8Array(w * h);   // blocked by a prop standing here

    this.props = [];      // { name, x, y, seed, light }
    this.entities = [];   // monsters and the player
    this.items = [];      // items lying on the ground
    this.exits = [];      // { x, y, to, kind }
    this.spawnPoints = [];
    this.start = { x: w / 2, y: h / 2 };
    this.lights = [];     // static light sources, filled from props
    this.explored = new Uint8Array(w * h);
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  tileAt(x, y) {
    if (!this.inBounds(x, y)) return VOID;
    return this.tiles[y * this.w + x];
  }

  set(x, y, v) {
    if (this.inBounds(x, y)) this.tiles[y * this.w + x] = v;
  }

  walkableTile(x, y) {
    const t = this.tileAt(x, y);
    return (t === FLOOR || t === PATH) && !this.solid[y * this.w + x];
  }

  // Tile-level block test, taking integer tile coordinates.
  blocked(x, y) { return !this.walkableTile(x | 0, y | 0); }

  // Circle-versus-grid test used by entity movement. Checking the four corners
  // of the circle's bounding box is enough at the radii entities actually use.
  blockedCircle(fx, fy, r) {
    const x0 = Math.floor(fx - r), x1 = Math.floor(fx + r);
    const y0 = Math.floor(fy - r), y1 = Math.floor(fy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.walkableTile(x, y)) continue;
        // Closest point on the tile square to the circle centre.
        const cx = Math.max(x, Math.min(fx, x + 1));
        const cy = Math.max(y, Math.min(fy, y + 1));
        const dx = fx - cx, dy = fy - cy;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  addProp(name, x, y, seed = 0, opts = {}) {
    const p = { name, x, y, seed, solid: opts.solid !== false, light: opts.light || null };
    this.props.push(p);
    if (p.solid && this.inBounds(x | 0, y | 0)) this.solid[(y | 0) * this.w + (x | 0)] = 1;
    if (p.light) this.lights.push({ x, y, r: p.light.r, cr: p.light.cr, cg: p.light.cg, cb: p.light.cb, i: 1, flicker: p.light.flicker !== false });
    return p;
  }

  addEntity(e) { this.entities.push(e); e.level = this; return e; }

  removeDead() {
    // Corpses stay: they are what a Shaman resurrects and what Corpse
    // Explosion consumes, so they are only dropped once faded out.
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.remove) this.entities.splice(i, 1);
    }
  }

  markExplored(cx, cy, r) {
    const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(this.w - 1, (cx + r) | 0);
    const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(this.h - 1, (cy + r) | 0);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.explored[y * this.w + x] = 1;
      }
    }
  }

  // Nearest walkable tile to a point, searched in rings. Used to keep spawns,
  // exits and teleport targets out of walls.
  nearestOpen(x, y, maxR = 12) {
    x = Math.round(x); y = Math.round(y);
    if (this.walkableTile(x, y)) return { x: x + 0.5, y: y + 0.5 };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.walkableTile(x + dx, y + dy)) return { x: x + dx + 0.5, y: y + dy + 0.5 };
        }
      }
    }
    return { x: x + 0.5, y: y + 0.5 };
  }
}

// Flood fill from a seed, returning the set of reachable tile indices.
export function floodRegion(level, sx, sy) {
  const seen = new Uint8Array(level.w * level.h);
  const stack = [sy * level.w + sx];
  const out = [];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    out.push(i);
    const x = i % level.w, y = (i / level.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue;
      const j = ny * level.w + nx;
      if (seen[j]) continue;
      const t = level.tiles[j];
      if (t !== FLOOR && t !== PATH) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return out;
}
