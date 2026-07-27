// A* over the tile grid, plus the line-of-sight test that lets a found path be
// pulled straight afterwards.
//
// Raw grid paths stair-step along diagonals, which looks wrong on an isometric
// map. Smoothing removes every waypoint that the previous one can already see,
// which turns a staircase back into the straight line a person would walk.

const SQRT2 = Math.SQRT2;

// Binary min-heap keyed on f-score. Allocated once and reused across calls,
// because path requests happen every time anything is clicked or blocked.
class Heap {
  constructor() { this.a = []; this.f = null; }
  clear(f) { this.a.length = 0; this.f = f; }
  push(i) {
    const a = this.a;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[c]]) break;
      const t = a[p]; a[p] = a[c]; a[c] = t;
      c = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let s = p;
        if (l < a.length && this.f[a[l]] < this.f[a[s]]) s = l;
        if (r < a.length && this.f[a[r]] < this.f[a[s]]) s = r;
        if (s === p) break;
        const t = a[s]; a[s] = a[p]; a[p] = t;
        p = s;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

const heap = new Heap();
let gScore = null, fScore = null, cameFrom = null, state = null, stateSize = 0;

function ensure(n) {
  if (stateSize >= n) return;
  gScore = new Float32Array(n);
  fScore = new Float32Array(n);
  cameFrom = new Int32Array(n);
  state = new Uint8Array(n);
  stateSize = n;
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

// Diagonal moves are only legal when both orthogonal neighbours are open, so
// nothing slips through the corner where two walls meet.
function canStep(level, x, y, dx, dy) {
  if (!level.walkableTile(x + dx, y + dy)) return false;
  if (dx !== 0 && dy !== 0) {
    if (!level.walkableTile(x + dx, y)) return false;
    if (!level.walkableTile(x, y + dy)) return false;
  }
  return true;
}

export function findPath(level, sx, sy, tx, ty, maxNodes = 6000) {
  const w = level.w, h = level.h;
  const start = { x: Math.floor(sx), y: Math.floor(sy) };
  let goal = { x: Math.floor(tx), y: Math.floor(ty) };

  if (!level.walkableTile(goal.x, goal.y)) {
    const near = level.nearestOpen(goal.x, goal.y, 10);
    goal = { x: Math.floor(near.x), y: Math.floor(near.y) };
  }
  if (!level.walkableTile(start.x, start.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ x: tx, y: ty }];

  ensure(w * h);
  state.fill(0);
  heap.clear(fScore);

  const si = start.y * w + start.x;
  const gi = goal.y * w + goal.x;
  const heur = (x, y) => {
    const dx = Math.abs(x - goal.x), dy = Math.abs(y - goal.y);
    return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
  };

  gScore[si] = 0;
  fScore[si] = heur(start.x, start.y);
  cameFrom[si] = -1;
  state[si] = 1;
  heap.push(si);

  let expanded = 0;
  let found = false;
  while (heap.size) {
    const cur = heap.pop();
    if (cur === gi) { found = true; break; }
    if (state[cur] === 2) continue;
    state[cur] = 2;
    if (++expanded > maxNodes) break;

    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (state[ni] === 2) continue;
      if (!canStep(level, cx, cy, dx, dy)) continue;
      const tentative = gScore[cur] + cost;
      if (state[ni] === 1 && tentative >= gScore[ni]) continue;
      cameFrom[ni] = cur;
      gScore[ni] = tentative;
      fScore[ni] = tentative + heur(nx, ny);
      state[ni] = 1;
      heap.push(ni);
    }
  }

  if (!found) return null;

  const out = [];
  let i = gi;
  while (i !== -1) {
    out.push({ x: (i % w) + 0.5, y: ((i / w) | 0) + 0.5 });
    i = cameFrom[i];
  }
  out.reverse();
  out.shift();                       // drop the tile already stood on
  // Finish on the exact point asked for, but only when it is actually
  // standable. Clicking into a wall is routine, and substituting it blindly
  // leaves a final waypoint nobody can ever reach.
  if (out.length && level.walkableTile(Math.floor(tx), Math.floor(ty))) {
    out[out.length - 1] = { x: tx, y: ty };
  }
  return out;
}

// Supercover line test: walks every tile the segment touches, so a wall corner
// clipped by the line counts as blocking.
function losRay(level, ax, ay, bx, by) {
  let x = Math.floor(ax), y = Math.floor(ay);
  const ex = Math.floor(bx), ey = Math.floor(by);
  const dx = bx - ax, dy = by - ay;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (x + 1 - ax) : (ax - x)) * tDeltaX);
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (y + 1 - ay) : (ay - y)) * tDeltaY);

  if (!level.walkableTile(x, y)) return false;
  let guard = 0;
  while ((x !== ex || y !== ey) && guard++ < 512) {
    if (tMaxX < tMaxY) { tMaxX += tDeltaX; x += stepX; }
    else { tMaxY += tDeltaY; y += stepY; }
    if (tMaxX > 1 && tMaxY > 1 && (x !== ex || y !== ey)) break;
    if (!level.walkableTile(x, y)) return false;
  }
  return true;
}

// Line of sight for a body of a given width.
//
// A bare centre-line test is only correct for a point. The A* path itself is
// safe because it steps tile centre to tile centre and refuses to cut corners,
// but smoothing replaces it with a straight line, and a line that is clear at
// tile granularity can still graze a wall corner that a circle cannot fit past.
// Testing the centre plus both edges of the body is what keeps the shortcut
// walkable.
export function hasLineOfSight(level, ax, ay, bx, by, radius = 0) {
  if (!losRay(level, ax, ay, bx, by)) return false;
  if (radius <= 0) return true;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  const px = (-dy / len) * radius, py = (dx / len) * radius;
  return losRay(level, ax + px, ay + py, bx + px, by + py)
      && losRay(level, ax - px, ay - py, bx - px, by - py);
}

// Drop every waypoint that the one before it can already see.
export function smooth(level, path, from, radius = 0) {
  if (!path || path.length < 2) return path;
  const out = [];
  let anchor = from;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    // Furthest reachable point wins; walk back until one fits.
    while (j > i && !hasLineOfSight(level, anchor.x, anchor.y, path[j].x, path[j].y, radius)) j--;
    out.push(path[j]);
    anchor = path[j];
    if (j === path.length - 1) break;
    i = j + 1;
  }
  return out;
}
