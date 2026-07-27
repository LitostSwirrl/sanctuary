// Phase 2 harness: verifies the pixel rasterizer produces crisp, consistently
// lit shapes. Replaced by the real state machine in a later task.

import { Buf, capsule, ellipse, polyF, lineP, outline, bufToCanvas, mirrorBuf, rectF } from './art/pixel.js';
import { ramp, packHex, COLORS } from './art/palette.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
ctx.imageSmoothingEnabled = false;

const LINE = packHex('#0d0a10');

function sample() {
  const b = new Buf(64, 64);
  const skin = ramp(COLORS.sorcSkin);
  const robe = ramp(COLORS.sorcRobe);
  const steel = ramp(COLORS.steel);

  // Tapered limb, diagonal
  capsule(b, 10, 54, 5, 24, 20, 3, robe);
  // Straight thick limb
  capsule(b, 32, 54, 6, 32, 22, 6, steel);
  // Round head
  ellipse(b, 46, 18, 8, 9, skin);
  // Horizontal thin limb
  capsule(b, 40, 40, 3, 60, 36, 2, robe);
  // Polygon (a shield-ish shape)
  polyF(b, [4, 8, 20, 4, 22, 20, 12, 30, 2, 18], packHex(COLORS.gold));
  // Hard line
  lineP(b, 2, 62, 62, 62, packHex(COLORS.blood), 1);

  outline(b, LINE);
  return bufToCanvas(b);
}

function rampStrip() {
  const names = ['sorcRobe', 'fallenSkin', 'zombieSkin', 'boneWhite', 'steel', 'leather', 'gold', 'ice'];
  const b = new Buf(names.length * 16, 16);
  names.forEach((n, i) => {
    const r = ramp(COLORS[n]);
    rectF(b, i * 16, 0, 16, 4, r.light);
    rectF(b, i * 16, 4, 16, 4, r.base);
    rectF(b, i * 16, 8, 16, 4, r.dark);
    rectF(b, i * 16, 12, 16, 4, r.line);
  });
  return bufToCanvas(b);
}

const spr = sample();
const mir = bufToCanvas(mirrorBuf((() => {
  const b = new Buf(64, 64);
  capsule(b, 10, 54, 5, 24, 20, 3, ramp(COLORS.sorcRobe));
  ellipse(b, 46, 18, 8, 9, ramp(COLORS.sorcSkin));
  outline(b, LINE);
  return b;
})()));
const strip = rampStrip();

function draw() {
  ctx.fillStyle = '#17151c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#8f8158';
  ctx.font = '14px Georgia, serif';
  ctx.fillText('1x', 40, 30);
  ctx.drawImage(spr, 40, 40);
  ctx.fillText('4x  (checking for antialias fringe and one-pixel outline)', 140, 30);
  ctx.drawImage(spr, 140, 40, 256, 256);
  ctx.fillText('mirrored', 440, 30);
  ctx.drawImage(mir, 440, 40, 256, 256);

  ctx.fillText('ramps: light / base / dark / line', 40, 340);
  ctx.drawImage(strip, 40, 350, strip.width * 4, strip.height * 4);
}
draw();
