// Minimap, in a small corner box or as a large translucent overlay.
// Only tiles the player has already walked near are drawn.

import { FLOOR, PATH, WALL } from '../world/level.js';

export function drawMinimap(ctx, level, player, mode, canvasW, canvasH, uiScale = 1) {
  const overlay = mode === 'overlay';
  const box = overlay
    ? { w: Math.min(canvasW - 80 * uiScale, level.w * 6 * uiScale), h: Math.min(canvasH - 120 * uiScale, level.h * 6 * uiScale) }
    : { w: 176 * uiScale, h: 176 * uiScale };
  const x = overlay ? (canvasW - box.w) / 2 : canvasW - box.w - 12 * uiScale;
  const y = overlay ? (canvasH - box.h) / 2 - 20 * uiScale : 12 * uiScale;
  const s = Math.max(1, Math.min(box.w / level.w, box.h / level.h));
  const ox = x + (box.w - level.w * s) / 2;
  const oy = y + (box.h - level.h * s) / 2;

  ctx.save();
  ctx.fillStyle = overlay ? 'rgba(8,7,11,0.82)' : 'rgba(8,7,11,0.55)';
  ctx.fillRect(x, y, box.w, box.h);
  ctx.strokeStyle = 'rgba(150,130,80,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, box.w, box.h);

  for (let ty = 0; ty < level.h; ty++) {
    for (let tx = 0; tx < level.w; tx++) {
      const i = ty * level.w + tx;
      if (!level.explored[i]) continue;
      const t = level.tiles[i];
      let c = null;
      if (t === WALL) c = 'rgba(120,112,96,0.5)';
      else if (t === PATH) c = 'rgba(190,160,100,0.75)';
      else if (t === FLOOR) c = 'rgba(120,140,120,0.5)';
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + tx * s, oy + ty * s, s, s);
    }
  }

  const dot = (p, col, r) => {
    ctx.fillStyle = col;
    ctx.fillRect(ox + p.x * s - r, oy + p.y * s - r, r * 2, r * 2);
  };

  for (const e of level.exits) {
    if (!level.explored[Math.floor(e.y) * level.w + Math.floor(e.x)]) continue;
    dot(e, '#ffd24a', Math.max(2, s));
  }
  if (level.waypoint && level.explored[Math.floor(level.waypoint.y) * level.w + Math.floor(level.waypoint.x)]) {
    dot(level.waypoint, '#c090ff', Math.max(2, s));
  }
  if (overlay) {
    for (const e of level.entities) {
      if (!e.alive || e.isPlayer) continue;
      if (!level.explored[Math.floor(e.y) * level.w + Math.floor(e.x)]) continue;
      dot(e, e.unique ? '#ff8a2a' : '#c04040', Math.max(1, s * 0.7));
    }
  }
  if (player) dot(player, '#8ad8ff', Math.max(2, s));

  if (overlay) {
    ctx.fillStyle = '#c8b070';
    ctx.font = `${Math.round(16 * uiScale)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(level.name, canvasW / 2, y - 10 * uiScale);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}
