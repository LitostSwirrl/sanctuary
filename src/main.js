// Phase 5 harness: generates all six areas, verifies connectivity by flood
// fill, and draws a debug map of each. Replaced by the real state machine in a
// later task.

import { AREAS } from './world/levels.js';
import { generate } from './world/gen.js';
import { floodRegion, FLOOR, PATH, WALL } from './world/level.js';
import { findPath, smooth } from './world/path.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
ctx.imageSmoothingEnabled = false;

const SEED = 20260728;
const report = [];
const levels = [];

for (let i = 0; i < AREAS.length; i++) {
  const def = AREAS[i];
  const t0 = performance.now();
  const lv = generate(def, SEED + i * 7919);
  const ms = Math.round(performance.now() - t0);
  levels.push(lv);

  const region = floodRegion(lv, Math.floor(lv.start.x), Math.floor(lv.start.y));
  const reach = new Uint8Array(lv.w * lv.h);
  for (const j of region) reach[j] = 1;

  let floorTotal = 0;
  for (let k = 0; k < lv.tiles.length; k++) if (lv.tiles[k] === FLOOR || lv.tiles[k] === PATH) floorTotal++;

  const idx = (p) => Math.floor(p.y) * lv.w + Math.floor(p.x);
  const exitsOk = lv.exits.every((e) => reach[idx(e)]);
  const spawnsOk = lv.spawnPoints.every((s) => reach[idx(s)]);
  const bossOk = lv.bossPoint ? !!reach[idx(lv.bossPoint)] : null;
  const wpOk = lv.waypoint ? !!reach[idx(lv.waypoint)] : null;
  const orphan = floorTotal - region.length;

  report.push({
    id: def.id, ms, size: `${lv.w}x${lv.h}`, floor: floorTotal,
    orphanTiles: orphan, exits: lv.exits.length, exitsOk,
    spawns: lv.spawnPoints.length, spawnsOk, bossOk, wpOk, props: lv.props.length,
  });
}

// Path smoothing check: a route across the largest area should end up with far
// fewer waypoints than tiles travelled.
const moor = levels[1];
const far = moor.spawnPoints[moor.spawnPoints.length - 1] || moor.exits[1];
const raw = findPath(moor, moor.start.x, moor.start.y, far.x, far.y);
const sm = raw ? smooth(moor, raw, moor.start) : null;
console.table(report);
console.log('[path] raw waypoints', raw ? raw.length : 'NO PATH', '-> smoothed', sm ? sm.length : '-');
window.__report = { report, path: { raw: raw && raw.length, smooth: sm && sm.length } };

// ------------------------------------------------------------------ drawing

const COLS = 3;
const cellW = Math.floor(canvas.width / COLS);
const cellH = Math.floor((canvas.height - 20) / 2);

ctx.fillStyle = '#0a090d';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.font = '12px Georgia, serif';

levels.forEach((lv, i) => {
  const ox = (i % COLS) * cellW + 8;
  const oy = Math.floor(i / COLS) * cellH + 22;
  const s = Math.max(1, Math.floor(Math.min((cellW - 16) / lv.w, (cellH - 34) / lv.h)));

  const region = floodRegion(lv, Math.floor(lv.start.x), Math.floor(lv.start.y));
  const reach = new Uint8Array(lv.w * lv.h);
  for (const j of region) reach[j] = 1;

  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      const t = lv.tiles[y * lv.w + x];
      let c = '#111016';
      if (t === WALL) c = '#2e2b33';
      else if (t === PATH) c = '#7a6440';
      else if (t === FLOOR) c = reach[y * lv.w + x] ? '#3f5a3a' : '#8a2a2a';
      if (t !== WALL && lv.solid[y * lv.w + x]) c = '#4a4030';
      ctx.fillStyle = c;
      ctx.fillRect(ox + x * s, oy + y * s, s, s);
    }
  }

  const dot = (p, col, r = 2) => {
    ctx.fillStyle = col;
    ctx.fillRect(ox + p.x * s - r, oy + p.y * s - r, r * 2, r * 2);
  };
  for (const sp of lv.spawnPoints) dot(sp, 'rgba(200,120,220,0.8)', 1);
  for (const e of lv.exits) dot(e, '#ffd24a', 3);
  if (lv.waypoint) dot(lv.waypoint, '#b070ff', 3);
  if (lv.bossPoint) dot(lv.bossPoint, '#ff3a2a', 4);
  dot(lv.start, '#7ad0ff', 3);

  const r = report[i];
  ctx.fillStyle = r.exitsOk && r.spawnsOk && r.bossOk !== false ? '#a89868' : '#ff5a4a';
  ctx.fillText(`${lv.name}  ${r.size}  ${r.ms}ms  floor ${r.floor}  orphans ${r.orphanTiles}  props ${r.props}`, ox, oy - 6);
});

ctx.fillStyle = '#6a6050';
ctx.fillText('blue = start, yellow = exit, purple ring = waypoint, red = boss, small purple = spawn, red floor = unreachable', 8, canvas.height - 6);
