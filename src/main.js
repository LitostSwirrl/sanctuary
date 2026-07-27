// Phase 1 harness: proves the isometric projection, camera and input wiring.
// Replaced by the real state machine in a later task.

import { startLoop } from './core/loop.js';
import { Camera, TILE_W, TILE_H } from './core/iso.js';
import { Input } from './core/input.js';
import { Rng, fbm2 } from './core/rng.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cam = new Camera();
Input.attach(canvas);

function resize() {
  // Integer scale only. Pixel art scaled by a fraction looks smeared.
  const dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  cam.resize(canvas.width, canvas.height);
  cam.zoom = dpr;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

const rng = new Rng(1337);
const noise = fbm2(rng, 3);
const GRID = 48;
const target = { x: GRID / 2, y: GRID / 2 };
cam.x = target.x; cam.y = target.y;

function step(dt) {
  if (Input.mouse.downL) {
    const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
    target.x = w.x; target.y = w.y;
  }
  cam.follow(target, dt);
  cam.updateShake(dt);
  Input.endFrame();
}

function drawDiamond(sx, sy, fill, stroke) {
  const hw = (TILE_W / 2) * cam.zoom, hh = (TILE_H / 2) * cam.zoom;
  ctx.beginPath();
  ctx.moveTo(sx, sy - hh);
  ctx.lineTo(sx + hw, sy);
  ctx.lineTo(sx, sy + hh);
  ctx.lineTo(sx - hw, sy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function draw(fps) {
  ctx.fillStyle = '#0b0a0e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const b = cam.visibleTileBounds();
  for (let y = Math.max(0, b.y0); y <= Math.min(GRID - 1, b.y1); y++) {
    for (let x = Math.max(0, b.x0); x <= Math.min(GRID - 1, b.x1); x++) {
      const p = cam.toScreen(x, y);
      const n = noise(x * 0.12, y * 0.12);
      const v = Math.floor(40 + n * 60);
      drawDiamond(p.x, p.y, `rgb(${v},${Math.floor(v * 0.95)},${Math.floor(v * 0.7)})`, 'rgba(0,0,0,0.18)');
    }
  }

  // Cursor tile
  const w = cam.toWorld(Input.mouse.x, Input.mouse.y);
  const cx = Math.floor(w.x), cy = Math.floor(w.y);
  const cp = cam.toScreen(cx, cy);
  drawDiamond(cp.x, cp.y, 'rgba(220,190,110,0.25)', 'rgba(240,220,140,0.9)');

  // Camera focus marker
  const tp = cam.toScreen(target.x, target.y);
  ctx.fillStyle = '#e8d9a0';
  ctx.beginPath(); ctx.arc(tp.x, tp.y, 5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#8f8158';
  ctx.font = '16px Georgia, serif';
  ctx.fillText(`fps ${fps}  tile ${cx},${cy}`, 16, 26);
}

startLoop({ step, draw });
