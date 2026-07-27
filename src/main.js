// Phase 6 harness: renders a generated level with lighting and moving figures.
// Replaced by the real state machine in a later task.

import { startLoop } from './core/loop.js';
import { Camera, dirFromVector } from './core/iso.js';
import { Input } from './core/input.js';
import { bakeTiles } from './art/tiles.js';
import { bakeAllFigures } from './art/figures.js';
import { Particles, FX } from './art/fx.js';
import { AREAS, AREA_BY_ID } from './world/levels.js';
import { generate } from './world/gen.js';
import { Renderer } from './render/renderer.js';
import { drawMinimap } from './render/minimap.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cam = new Camera();
const renderer = new Renderer(canvas);
Input.attach(canvas);

function resize() {
  const dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  cam.resize(canvas.width, canvas.height);
  cam.zoom = dpr;
  renderer.resize(canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const assets = { figures: {} };
let ready = false, loadMs = 0;
const t0 = performance.now();
function* allBakers() { yield* bakeTiles(); yield* bakeAllFigures(assets.figures); }
const baker = allBakers();

window.__forceLoad = () => {
  while (!ready) { if (baker.next().done) { ready = true; loadMs = Math.round(performance.now() - t0); build(); } }
  return loadMs;
};

// --------------------------------------------------------------------- world

let level = null, mover = null, clock = 0;
const fx = new Particles();
const walkers = [];
let areaIdx = 2;   // Den of Evil: the darkest area, best test of the light pass

function build() {
  const def = AREAS[areaIdx];
  level = generate(def, 20260728 + areaIdx * 7919);
  mover = {
    x: level.start.x, y: level.start.y, dir: 2, animName: 'walk', frame: 0,
    sheet: assets.figures.sorceress, radius: 0.32, alive: true, hitFlash: 0,
    tx: level.start.x, ty: level.start.y,
  };
  cam.x = mover.x; cam.y = mover.y;

  walkers.length = 0;
  const kinds = ['fallen', 'shaman', 'zombie', 'skeleton', 'ghoul', 'devilkin'];
  level.spawnPoints.forEach((sp, i) => {
    for (let k = 0; k < 3; k++) {
      walkers.push({
        x: sp.x + (Math.random() - 0.5) * 2, y: sp.y + (Math.random() - 0.5) * 2,
        dir: 0, animName: 'walk', frame: 0, animT: Math.random(),
        sheet: assets.figures[kinds[(i + k) % kinds.length]],
        radius: 0.3, alive: true, hitFlash: 0,
        home: { x: sp.x, y: sp.y }, phase: Math.random() * 6.28,
        unique: k === 0 && i % 3 === 0,
        uniqueAura: k === 0 && i % 3 === 0 ? '#ff6020' : null,
      });
    }
  });
  for (const w of walkers) level.addEntity(w);
  level.markExplored(mover.x, mover.y, 14);
}

function moveTowards(e, tx, ty, speed, dt) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return false;
  const nx = (dx / d) * speed * dt, ny = (dy / d) * speed * dt;
  if (!level.blockedCircle(e.x + nx, e.y, e.radius)) e.x += nx;
  if (!level.blockedCircle(e.x, e.y + ny, e.radius)) e.y += ny;
  e.dir = dirFromVector(dx, dy);
  return true;
}

function step(dt) {
  if (!ready) return;
  clock += dt;

  if (Input.consume('BracketRight')) { areaIdx = (areaIdx + 1) % AREAS.length; build(); }
  if (Input.mouse.downL) {
    const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
    mover.tx = w.x; mover.ty = w.y;
  }
  const moving = moveTowards(mover, mover.tx, mover.ty, 4.2, dt);
  mover.animName = moving ? 'walk' : 'idle';
  mover.frame = Math.floor(clock * (moving ? 12 : 6)) % (moving ? 8 : 4);

  for (const w of walkers) {
    const a = clock * 0.55 + w.phase;
    moveTowards(w, w.home.x + Math.cos(a) * 2.2, w.home.y + Math.sin(a) * 2.2, 1.7, dt);
    w.animT += dt;
    w.frame = Math.floor(w.animT * 9) % 8;
  }

  if (Math.random() < dt * 3) {
    FX.fireTrail(fx, mover.x + (Math.random() - 0.5), mover.y + (Math.random() - 0.5), 10);
  }
  fx.update(dt);
  cam.follow(mover, dt);
  cam.updateShake(dt);
  level.markExplored(mover.x, mover.y, 12);
  Input.endFrame();
}

function render() {
  renderer.draw(level, cam, { player: mover, fx, time: clock, playerLightRadius: 11 });
}

function draw(fps) {
  if (!ready) {
    ctx.fillStyle = '#0b0a0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c8b070';
    ctx.font = '20px Georgia, serif';
    ctx.fillText('baking...', 40, 60);
    if (baker.next().done) { ready = true; loadMs = Math.round(performance.now() - t0); build(); }
    return;
  }
  render();
  drawMinimap(ctx, level, mover, 'corner', canvas.width, canvas.height, cam.zoom);

  ctx.fillStyle = '#c8b070';
  ctx.font = `${13 * cam.zoom}px Georgia, serif`;
  const st = renderer.stats;
  ctx.fillText(`${level.name}   fps ${fps}   tiles ${st.tiles}  sorted ${st.drawn}  lights ${st.lights}  entities ${level.entities.length}   [ ] = next area, click to walk`,
    12 * cam.zoom, 20 * cam.zoom);
}

// Synchronous frame-time benchmark: a backgrounded tab throttles rAF, so
// timing the real loop under automation measures the throttle, not the code.
window.__bench = (n = 60) => {
  const t = [];
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    step(1 / 60);
    render();
    t.push(performance.now() - a);
  }
  t.sort((p, q) => p - q);
  return {
    area: level.name, entities: level.entities.length,
    median: +t[t.length >> 1].toFixed(2), p95: +t[Math.floor(t.length * 0.95)].toFixed(2),
    worst: +t[t.length - 1].toFixed(2),
    canvas: [canvas.width, canvas.height], stats: { ...renderer.stats },
  };
};
window.__setArea = (i) => { areaIdx = i; build(); return level.name; };
window.__place = (x, y) => { mover.x = mover.tx = x; mover.y = mover.ty = y; cam.x = x; cam.y = y; render(); return { x, y }; };
Object.defineProperty(window, '__lvl', { get: () => level });
window.__loop = startLoop({ step, draw });
