// Level generators. Everything derives from one integer seed, so a level can
// be thrown away and rebuilt identically when the player walks back into it.

import { Level, VOID, FLOOR, WALL, PATH, floodRegion } from './level.js';
import { findPath } from './path.js';
import { Rng } from '../core/rng.js';

// -------------------------------------------------------------------- shared

function borderWalls(lv) {
  for (let x = 0; x < lv.w; x++) { lv.set(x, 0, WALL); lv.set(x, lv.h - 1, WALL); }
  for (let y = 0; y < lv.h; y++) { lv.set(0, y, WALL); lv.set(lv.w - 1, y, WALL); }
}

// Turn every region except the biggest into wall, which is what guarantees the
// player can reach everything without a connectivity pass later.
function keepLargestRegion(lv) {
  const seen = new Uint8Array(lv.w * lv.h);
  let best = null;
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      const i = y * lv.w + x;
      if (seen[i]) continue;
      const t = lv.tiles[i];
      if (t !== FLOOR && t !== PATH) continue;
      const region = floodRegion(lv, x, y);
      for (const j of region) seen[j] = 1;
      if (!best || region.length > best.length) best = region;
    }
  }
  if (!best) return [];
  const keep = new Uint8Array(lv.w * lv.h);
  for (const i of best) keep[i] = 1;
  for (let i = 0; i < lv.tiles.length; i++) {
    if ((lv.tiles[i] === FLOOR || lv.tiles[i] === PATH) && !keep[i]) lv.tiles[i] = WALL;
  }
  return best;
}

// The open tile nearest a target point, searched over the whole region.
function nearestInRegion(lv, region, tx, ty) {
  let best = null, bestD = Infinity;
  for (const i of region) {
    const x = i % lv.w, y = (i / lv.w) | 0;
    const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

function sideTarget(lv, side) {
  const m = 3;
  if (side === 'n') return { x: lv.w / 2, y: m };
  if (side === 's') return { x: lv.w / 2, y: lv.h - m };
  if (side === 'w') return { x: m, y: lv.h / 2 };
  if (side === 'e') return { x: lv.w - m, y: lv.h / 2 };
  if (side === 'nw') return { x: m, y: m };
  if (side === 'ne') return { x: lv.w - m, y: m };
  if (side === 'sw') return { x: m, y: lv.h - m };
  return { x: lv.w - m, y: lv.h - m };
}

// Widen a route into a walkable track and mark it as path terrain.
function carveTrack(lv, pts, width) {
  for (const p of pts) {
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (let dy = -width; dy <= width; dy++) {
      for (let dx = -width; dx <= width; dx++) {
        if (dx * dx + dy * dy > width * width + 0.5) continue;
        const x = cx + dx, y = cy + dy;
        if (x <= 0 || y <= 0 || x >= lv.w - 1 || y >= lv.h - 1) continue;
        lv.set(x, y, PATH);
      }
    }
  }
}

function scatterSpawns(lv, region, rng, count, minFromStart = 10) {
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 60) {
    const i = rng.pick(region);
    const x = (i % lv.w) + 0.5, y = ((i / lv.w) | 0) + 0.5;
    const dx = x - lv.start.x, dy = y - lv.start.y;
    if (dx * dx + dy * dy < minFromStart * minFromStart) continue;
    if (!lv.walkableTile(x | 0, y | 0)) continue;
    pts.push({ x, y });
  }
  return pts;
}

// Props may only stand where they cannot pinch a corridor shut.
function propSafe(lv, x, y) {
  if (lv.tileAt(x, y) !== FLOOR) return false;
  if (lv.solid[y * lv.w + x]) return false;
  let open = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const t = lv.tileAt(x + dx, y + dy);
      if (t === FLOOR || t === PATH) open++;
    }
  }
  return open >= 7;
}

const LIGHT_COLORS = {
  brazier: { r: 5.5, cr: 255, cg: 150, cb: 70 },
  torch: { r: 4.5, cr: 255, cg: 155, cb: 80 },
  waypoint: { r: 6, cr: 180, cg: 110, cb: 255, flicker: false },
  portal: { r: 7, cr: 180, cg: 110, cb: 255, flicker: false },
};

function placeProp(lv, name, x, y, rng, solid = true) {
  return lv.addProp(name, x + 0.5, y + 0.5, rng.i(1000), {
    solid,
    light: LIGHT_COLORS[name] || null,
  });
}

// Guarantee every exit is still reachable once solid props are down. If one is
// not, drop the props rather than the exit.
// Flood from the spawn honouring props as well as tiles. `floodRegion` walks
// tiles only, which is right when it is used to pick the largest region — the
// props do not exist yet — but wrong here: a barrel standing in a one-tile
// corridor seals it, and a tile-only flood walks straight through and reports
// the level fine. About one dungeon in a hundred was generated with an exit
// nothing could reach.
function walkableFlood(lv, sx, sy) {
  const seen = new Uint8Array(lv.w * lv.h);
  if (!lv.walkableTile(sx, sy)) return seen;
  const stack = [sy * lv.w + sx];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % lv.w, y = (i / lv.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const j = ny * lv.w + nx;
      if (!lv.inBounds(nx, ny) || seen[j] || !lv.walkableTile(nx, ny)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

function verifyReachable(lv) {
  const s = { x: Math.floor(lv.start.x), y: Math.floor(lv.start.y) };
  const seen = walkableFlood(lv, s.x, s.y);
  const bad = lv.exits.some((e) => !seen[Math.floor(e.y) * lv.w + Math.floor(e.x)]);
  if (!bad) return;
  // The tiles were already verified connected when the region was chosen, so a
  // prop is what closed the way. Give up prop collision for this level: walking
  // through a crate is invisible next to an exit nobody can reach.
  lv.solid.fill(0);
  for (const p of lv.props) p.solid = false;
}

// ------------------------------------------------------------------ outdoor

export function genOutdoor(seed, def) {
  const rng = new Rng(seed);
  const size = def.size || 76;
  const lv = new Level(size, size, def);

  // Cellular automata: random noise smoothed into organic clearings.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x < 3 || y < 3 || x >= size - 3 || y >= size - 3;
      lv.tiles[y * size + x] = edge ? WALL : (rng.f() < 0.43 ? WALL : FLOOR);
    }
  }
  for (let pass = 0; pass < 5; pass++) {
    const next = lv.tiles.slice();
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (lv.tiles[(y + dy) * size + (x + dx)] === WALL) walls++;
          }
        }
        const i = y * size + x;
        next[i] = walls >= 5 ? WALL : walls <= 3 ? FLOOR : lv.tiles[i];
      }
    }
    lv.tiles.set(next);
  }
  borderWalls(lv);
  let region = keepLargestRegion(lv);

  // Entrance and exits sit at the requested map edges.
  const entryDef = def.exits[0];
  const et = sideTarget(lv, entryDef.side);
  const entry = nearestInRegion(lv, region, et.x, et.y);
  lv.start = { x: entry.x + 0.5, y: entry.y + 0.5 };

  const nodes = [entry];
  for (const ex of def.exits) {
    const t = sideTarget(lv, ex.side);
    const p = nearestInRegion(lv, region, t.x, t.y);
    lv.exits.push({ x: p.x + 0.5, y: p.y + 0.5, to: ex.to, kind: ex.kind || 'path', side: ex.side });
    nodes.push(p);
  }

  // A packed track links the entrance to every exit, which both guides the
  // player and gives the map a readable spine.
  for (let i = 1; i < nodes.length; i++) {
    const route = findPath(lv, nodes[0].x + 0.5, nodes[0].y + 0.5, nodes[i].x + 0.5, nodes[i].y + 0.5);
    if (route) carveTrack(lv, route, 1);
  }
  region = keepLargestRegion(lv);

  // Scenery, kept off the track.
  const density = def.propDensity ?? 0.055;
  const names = def.props || ['tree', 'rock'];
  for (const i of region) {
    const x = i % size, y = (i / size) | 0;
    if (!rng.chance(density)) continue;
    if (!propSafe(lv, x, y)) continue;
    let nearPath = false;
    for (let dy = -1; dy <= 1 && !nearPath; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (lv.tileAt(x + dx, y + dy) === PATH) { nearPath = true; break; }
    }
    if (nearPath) continue;
    placeProp(lv, rng.pick(names), x, y, rng);
  }

  for (const ex of lv.exits) {
    if (ex.to === entryDef.to) continue;
    placeProp(lv, ex.kind === 'stairs' ? 'stairs' : 'torch', Math.floor(ex.x), Math.floor(ex.y), rng, false);
  }
  if (def.waypoint) {
    const p = nearestInRegion(lv, region, lv.start.x + 6, lv.start.y + 6);
    lv.waypoint = { x: p.x + 0.5, y: p.y + 0.5 };
    placeProp(lv, 'waypoint', p.x, p.y, rng, false);
  }

  lv.spawnPoints = scatterSpawns(lv, region, rng, def.packs || 10, 12);
  verifyReachable(lv);
  return lv;
}

// ------------------------------------------------------------------ dungeon

function bspSplit(rng, rect, depth, out) {
  const MIN = 9;
  if (depth <= 0 || (rect.w < MIN * 2 && rect.h < MIN * 2)) { out.push(rect); return; }
  const horizontal = rect.w === rect.h ? rng.chance(0.5) : rect.w > rect.h;
  const len = horizontal ? rect.w : rect.h;
  if (len < MIN * 2) { out.push(rect); return; }
  const cut = Math.floor(rng.range(len * 0.38, len * 0.62));
  if (horizontal) {
    bspSplit(rng, { x: rect.x, y: rect.y, w: cut, h: rect.h }, depth - 1, out);
    bspSplit(rng, { x: rect.x + cut, y: rect.y, w: rect.w - cut, h: rect.h }, depth - 1, out);
  } else {
    bspSplit(rng, { x: rect.x, y: rect.y, w: rect.w, h: cut }, depth - 1, out);
    bspSplit(rng, { x: rect.x, y: rect.y + cut, w: rect.w, h: rect.h - cut }, depth - 1, out);
  }
}

export function genDungeon(seed, def) {
  const rng = new Rng(seed);
  const size = def.size || 64;
  const lv = new Level(size, size, def);
  lv.tiles.fill(WALL);

  const leaves = [];
  bspSplit(rng, { x: 1, y: 1, w: size - 2, h: size - 2 }, def.depth || 4, leaves);

  const rooms = [];
  for (const leaf of leaves) {
    const pad = 1;
    const w = Math.max(4, leaf.w - pad * 2 - rng.i(3));
    const h = Math.max(4, leaf.h - pad * 2 - rng.i(3));
    const x = leaf.x + pad + rng.i(Math.max(1, leaf.w - w - pad * 2 + 1));
    const y = leaf.y + pad + rng.i(Math.max(1, leaf.h - h - pad * 2 + 1));
    const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    rooms.push(room);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) lv.set(xx, yy, FLOOR);
    }
  }

  // Chain the rooms in generation order, then add a couple of loops so the map
  // is not a pure tree and backtracking is less tedious.
  const link = (a, b) => {
    const mx = rng.chance(0.5);
    const carve = (x, y) => lv.set(x, y, FLOOR);
    if (mx) {
      for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) { carve(x, a.cy); carve(x, a.cy + 1); }
      for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) { carve(b.cx, y); carve(b.cx + 1, y); }
    } else {
      for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) { carve(a.cx, y); carve(a.cx + 1, y); }
      for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) { carve(x, b.cy); carve(x, b.cy + 1); }
    }
  };
  for (let i = 1; i < rooms.length; i++) link(rooms[i - 1], rooms[i]);
  for (let i = 0; i < Math.min(2, rooms.length - 2); i++) {
    link(rng.pick(rooms), rng.pick(rooms));
  }
  borderWalls(lv);

  const entryRoom = rooms[0];
  lv.start = { x: entryRoom.cx + 0.5, y: entryRoom.cy + 0.5 };

  // The boss waits in the room furthest from the entrance.
  let bossRoom = rooms[0], bossD = -1;
  for (const r of rooms) {
    const d = (r.cx - entryRoom.cx) ** 2 + (r.cy - entryRoom.cy) ** 2;
    if (d > bossD) { bossD = d; bossRoom = r; }
  }
  lv.bossRoom = bossRoom;
  lv.bossPoint = { x: bossRoom.cx + 0.5, y: bossRoom.cy + 0.5 };

  const region = keepLargestRegion(lv);

  def.exits.forEach((ex, i) => {
    const room = i === 0 ? entryRoom : (ex.atBoss ? bossRoom : rooms[Math.min(rooms.length - 1, 1 + i)]);
    const p = { x: room.cx, y: room.cy + (i === 0 ? 0 : 1) };
    lv.exits.push({ x: p.x + 0.5, y: p.y + 0.5, to: ex.to, kind: ex.kind || 'stairs' });
    if (i > 0) placeProp(lv, 'stairs', p.x, p.y, rng, false);
  });

  // Torches on walls, columns and rubble inside rooms.
  for (const r of rooms) {
    const n = 1 + rng.i(2);
    for (let k = 0; k < n; k++) {
      const x = r.x + rng.i(r.w), y = r.y + rng.i(r.h);
      if (propSafe(lv, x, y)) placeProp(lv, rng.chance(0.45) ? 'brazier' : rng.pick(def.props || ['column', 'bones', 'barrel']), x, y, rng, true);
    }
    if (rng.chance(0.5)) {
      const x = r.x + rng.i(r.w), y = r.y + rng.i(r.h);
      if (propSafe(lv, x, y)) placeProp(lv, 'torch', x, y, rng, false);
    }
  }
  if (def.waypoint) {
    lv.waypoint = { x: entryRoom.cx + 1.5, y: entryRoom.cy + 1.5 };
    placeProp(lv, 'waypoint', entryRoom.cx + 1, entryRoom.cy + 1, rng, false);
  }

  lv.spawnPoints = scatterSpawns(lv, region, rng, def.packs || 12, 9);
  verifyReachable(lv);
  return lv;
}

// --------------------------------------------------------------------- town

export function genTown(seed, def) {
  const rng = new Rng(seed);
  const size = def.size || 44;
  const lv = new Level(size, size, def);
  lv.tiles.fill(WALL);

  // An open compound with a rounded palisade.
  const cx = size / 2, cy = size / 2, R = size / 2 - 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / R, dy = (y - cy) / R;
      const d = Math.sqrt(dx * dx + dy * dy);
      const wobble = 1 + Math.sin(Math.atan2(dy, dx) * 3 + seed) * 0.06;
      if (d < wobble) lv.set(x, y, FLOOR);
    }
  }
  borderWalls(lv);

  lv.start = { x: cx + 0.5, y: cy + 2.5 };
  lv.safe = true;

  const region = keepLargestRegion(lv);

  for (const ex of def.exits) {
    const t = sideTarget(lv, ex.side);
    const p = nearestInRegion(lv, region, t.x, t.y);
    lv.exits.push({ x: p.x + 0.5, y: p.y + 0.5, to: ex.to, kind: ex.kind || 'path' });
    placeProp(lv, 'stairs', p.x, p.y, rng, false);
  }

  lv.waypoint = { x: cx - 5.5, y: cy - 3.5 };
  placeProp(lv, 'waypoint', cx - 6, cy - 4, rng, false);

  // Where the townsfolk stand. `populateTown` places them relative to this,
  // and each town's area def says what furniture its people stand among -- the
  // encampment's tents, Lut Gholein's dock crates, Kurast's ferns. A stub town
  // with no list gets bare ground, which is all a stub is owed.
  lv.townCentre = { x: cx, y: cy };
  const station = def.furniture || [];
  for (const [name, dx, dy] of station) {
    const x = Math.round(cx + dx), y = Math.round(cy + dy);
    if (propSafe(lv, x, y)) placeProp(lv, name, x, y, rng, name !== 'campfire');
  }

  // A stake fence just inside the wall, with the gates left open.
  const gates = def.exits.map((ex) => sideTarget(lv, ex.side));
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * (R - 1.5));
    const y = Math.round(cy + Math.sin(a) * (R - 1.5));
    if (gates.some((g) => Math.hypot(g.x - x, g.y - y) < 5)) continue;
    if (propSafe(lv, x, y)) placeProp(lv, 'palisade', x, y, rng, true);
  }

  // Fires and clutter around the compound edge.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const x = Math.floor(cx + Math.cos(a) * (R - 4));
    const y = Math.floor(cy + Math.sin(a) * (R - 4));
    if (propSafe(lv, x, y)) placeProp(lv, i % 3 === 0 ? 'campfire' : i % 3 === 1 ? 'barrel' : 'crate', x, y, rng, i % 3 !== 0);
  }
  for (let i = 0; i < 10; i++) {
    const x = 2 + rng.i(size - 4), y = 2 + rng.i(size - 4);
    if (propSafe(lv, x, y)) placeProp(lv, 'torch', x, y, rng, false);
  }

  lv.spawnPoints = [];
  verifyReachable(lv);
  return lv;
}

export function generate(def, seed) {
  if (def.kind === 'town') return genTown(seed, def);
  if (def.kind === 'dungeon') return genDungeon(seed, def);
  return genOutdoor(seed, def);
}

export { VOID, FLOOR, WALL, PATH };
