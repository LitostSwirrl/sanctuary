// Phase 4 harness: chunked loading screen, then a tile and prop field with
// live particle effects. Replaced by the real state machine in a later task.

import { startLoop } from './core/loop.js';
import { Camera } from './core/iso.js';
import { Input } from './core/input.js';
import { bakeTiles, getGround, getWall, getProp, TERRAIN } from './art/tiles.js';
import { bakeAllFigures } from './art/figures.js';
import { Particles, FX } from './art/fx.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cam = new Camera();
Input.attach(canvas);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  cam.resize(canvas.width, canvas.height);
  cam.zoom = 1;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------ loading screen

const assets = { figures: {} };
let loadDone = false, loadLabel = '', loadPct = 0, loadStart = performance.now(), loadMs = 0;

function* allBakers() {
  yield* bakeTiles();
  yield* bakeAllFigures(assets.figures);
}
const baker = allBakers();
let steps = 0;
const TOTAL_STEPS = 7 + 7 + 12 + 11; // ground, walls, props, figures

function pumpLoading() {
  const budget = performance.now() + 10;
  while (performance.now() < budget) {
    const r = baker.next();
    if (r.done) { loadDone = true; loadMs = Math.round(performance.now() - loadStart); return; }
    steps++;
    loadLabel = r.value.label || '';
    loadPct = Math.min(1, steps / TOTAL_STEPS);
  }
}

// Verification hook: a backgrounded tab throttles requestAnimationFrame to
// roughly one frame a second, which makes the chunked loader take a minute to
// finish under automation. This drains it in one go.
window.__forceLoad = () => {
  while (!loadDone) {
    const r = baker.next();
    if (r.done) { loadDone = true; loadMs = Math.round(performance.now() - loadStart); break; }
    steps++;
    loadPct = Math.min(1, steps / TOTAL_STEPS);
  }
  return loadMs;
};

function drawLoading() {
  ctx.fillStyle = '#0b0a0e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const w = Math.min(420, canvas.width - 80);
  const x = (canvas.width - w) / 2, y = canvas.height / 2;
  ctx.fillStyle = '#c8b070';
  ctx.font = '22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Sanctuary', canvas.width / 2, y - 40);
  ctx.font = '12px Georgia, serif';
  ctx.fillStyle = '#6a6050';
  ctx.fillText(loadLabel, canvas.width / 2, y - 14);
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#4a4235';
  ctx.strokeRect(x + 0.5, y + 0.5, w, 12);
  ctx.fillStyle = '#8a6a2a';
  ctx.fillRect(x + 2, y + 2, (w - 4) * loadPct, 9);
}

// -------------------------------------------------------------- demo content

const fx = new Particles();
const GRID = 30;
const terrains = Object.keys(TERRAIN);
let scene = null;

function buildScene() {
  const props = [];
  const names = ['tree', 'rock', 'column', 'brazier', 'torch', 'barrel', 'chest', 'gravestone', 'bones', 'waypoint', 'portal', 'stairs'];
  names.forEach((n, i) => {
    props.push({ name: n, seed: i, x: 4 + (i % 6) * 4, y: 4 + Math.floor(i / 6) * 5 });
  });
  const walls = [];
  for (let i = 0; i < GRID; i++) {
    walls.push({ x: i, y: 0 });
    walls.push({ x: 0, y: i });
  }
  for (let i = 10; i < 18; i++) walls.push({ x: i, y: 14 });
  scene = { props, walls };
  cam.x = 12; cam.y = 12;
}

function terrainAt(x, y) {
  const qx = Math.floor(x / 10), qy = Math.floor(y / 10);
  return terrains[Math.abs(qx * 3 + qy) % terrains.length];
}

let emitT = 0;

function step(dt) {
  if (!loadDone) return;
  if (!scene) buildScene();

  const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
  emitT -= dt;
  if (emitT <= 0) {
    emitT = 0.55;
    const pick = Math.floor(Math.random() * 5);
    if (pick === 0) FX.fireBurst(fx, w.x, w.y, 2.4);
    else if (pick === 1) FX.iceBurst(fx, w.x, w.y, 2.2);
    else if (pick === 2) FX.lightBurst(fx, w.x, w.y, 2.6);
    else if (pick === 3) FX.hitBlood(fx, w.x, w.y);
    else FX.levelUp(fx, w.x, w.y);
  }
  fx.update(dt);

  const sp = 7 * dt;
  if (Input.down('KeyW')) { cam.x -= sp; cam.y -= sp; }
  if (Input.down('KeyS')) { cam.x += sp; cam.y += sp; }
  if (Input.down('KeyA')) { cam.x -= sp; cam.y += sp; }
  if (Input.down('KeyD')) { cam.x += sp; cam.y -= sp; }
  Input.endFrame();
}

function draw(fps) {
  if (!loadDone) { pumpLoading(); drawLoading(); return; }
  if (!scene) return;

  ctx.fillStyle = '#08070b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const b = cam.visibleTileBounds();
  for (let y = Math.max(0, b.y0); y <= Math.min(GRID - 1, b.y1); y++) {
    for (let x = Math.max(0, b.x0); x <= Math.min(GRID - 1, b.x1); x++) {
      const s = cam.toScreen(x, y);
      ctx.drawImage(getGround(terrainAt(x, y), x, y), s.x - 32, s.y - 16);
    }
  }

  fx.drawDecals(ctx, cam);

  // Depth-sorted overlay of walls and props.
  const draws = [];
  for (const w of scene.walls) draws.push({ d: w.x + w.y, kind: 'wall', o: w });
  for (const p of scene.props) draws.push({ d: p.x + p.y, kind: 'prop', o: p });
  draws.sort((p, q) => p.d - q.d);
  for (const it of draws) {
    const s = cam.toScreen(it.o.x, it.o.y);
    if (it.kind === 'wall') {
      const wl = getWall(terrainAt(it.o.x, it.o.y), it.o.x, it.o.y);
      ctx.drawImage(wl.canvas, s.x - wl.ox, s.y - wl.oy);
    } else {
      const pr = getProp(it.o.name, it.o.seed);
      if (pr) ctx.drawImage(pr.canvas, s.x - pr.ox, s.y - pr.oy);
    }
  }

  fx.draw(ctx, cam);

  ctx.fillStyle = '#a89868';
  ctx.font = '13px Georgia, serif';
  ctx.fillText(`fps ${fps}   bake ${loadMs}ms   particles ${fx.p.length}   WASD to pan, mouse aims effects`, 12, 20);
  scene.props.forEach((p) => {
    const s = cam.toScreen(p.x, p.y);
    ctx.fillStyle = 'rgba(255,220,120,0.75)';
    ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
  });
}

window.__loop = startLoop({ step, draw });
window.__fx = fx;
window.__cam = cam;
