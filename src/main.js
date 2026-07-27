// Phase 3 harness: contact sheet of every animation frame, so the pose curves
// can be checked directly. Replaced by the real state machine in a later task.

import { bakeAllFigures, CELL, ANIMS } from './art/figures.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
ctx.imageSmoothingEnabled = false;

const sheets = {};
const t0 = performance.now();
for (const _ of bakeAllFigures(sheets)) { /* synchronous for the harness */ }
const bakeMs = Math.round(performance.now() - t0);

const SHOW = ['sorceress', 'fallen', 'skeleton', 'andariel'];
const DIR = 1; // south-east, the most legible three-quarter view

ctx.fillStyle = '#1b1820';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.font = '12px Georgia, serif';

let y = 16;
for (const name of SHOW) {
  const sheet = sheets[name];
  ctx.fillStyle = '#c8b070';
  ctx.fillText(name, 8, y + 12);
  y += 18;
  for (const anim of Object.keys(ANIMS)) {
    if (!sheet.has(anim)) continue;
    ctx.fillStyle = '#7a6f52';
    ctx.fillText(anim, 8, y + CELL / 2);
    for (let f = 0; f < ANIMS[anim]; f++) {
      const x = 64 + f * (CELL + 2);
      ctx.fillStyle = f % 2 ? '#232029' : '#26232d';
      ctx.fillRect(x, y, CELL, CELL);
      const ix = sheet.index(anim, DIR, f);
      ctx.save();
      if (ix.flip) { ctx.translate(x + CELL, y); ctx.scale(-1, 1); ctx.drawImage(sheet.canvas, ix.sx, ix.sy, CELL, CELL, 0, 0, CELL, CELL); }
      else ctx.drawImage(sheet.canvas, ix.sx, ix.sy, CELL, CELL, x, y, CELL, CELL);
      ctx.restore();
      // ground line, to check the feet stay planted
      ctx.strokeStyle = 'rgba(200,160,80,0.25)';
      ctx.beginPath(); ctx.moveTo(x, y + 70.5); ctx.lineTo(x + CELL, y + 70.5); ctx.stroke();
    }
    y += CELL + 2;
  }
  y += 10;
}

ctx.fillStyle = '#a89868';
ctx.fillText(`bake ${bakeMs}ms   dir=SE   ground line at y=70`, 8, canvas.height - 8);
console.log('[bake]', bakeMs + 'ms');
