// Tooltips and the shared panel chrome everything else in the UI is built on.

let panelPattern = null;

// A small noise tile, repeated, so panels read as stone rather than flat fill.
export function bakePanelTexture(ctx) {
  if (panelPattern) return panelPattern;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  const img = c.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const n = 18 + Math.random() * 14;
    img.data[i * 4] = n + 4;
    img.data[i * 4 + 1] = n + 2;
    img.data[i * 4 + 2] = n;
    img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  panelPattern = ctx.createPattern(cv, 'repeat');
  return panelPattern;
}

export function panel(ctx, x, y, w, h, opts = {}) {
  const alpha = opts.alpha ?? 0.96;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = bakePanelTexture(ctx) || '#1a1820';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = '#0b0a10';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = opts.border || '#6d5f3a';
  ctx.lineWidth = opts.lw || 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  ctx.restore();
}

export function panelTitle(ctx, text, x, y, w, s) {
  ctx.fillStyle = '#c8b070';
  ctx.font = `${Math.round(17 * s)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + 24 * s);
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(140,120,70,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 14 * s, y + 32 * s);
  ctx.lineTo(x + w - 14 * s, y + 32 * s);
  ctx.stroke();
}

// Wrap a long line to a pixel width, returning the pieces.
export function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const out = [];
  let line = '';
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; }
    else line = t;
  }
  if (line) out.push(line);
  return out;
}

// `lines` is [{ text, colour, header, italic, wrap }]. Positions itself to stay
// on screen.
export function drawTooltip(ctx, lines, mx, my, canvasW, canvasH, s = 1) {
  if (!lines || !lines.length) return;
  const padX = 12 * s, padY = 10 * s;
  const lh = 16 * s;
  const maxWrap = 250 * s;

  const laid = [];
  let w = 0;
  for (const l of lines) {
    ctx.font = `${l.italic ? 'italic ' : ''}${Math.round((l.header ? 15 : 13) * s)}px Georgia, serif`;
    if (l.wrap) {
      for (const piece of wrapText(ctx, l.text, maxWrap)) {
        laid.push({ ...l, text: piece });
        w = Math.max(w, ctx.measureText(piece).width);
      }
    } else {
      laid.push(l);
      w = Math.max(w, ctx.measureText(l.text).width);
    }
  }
  const boxW = w + padX * 2;
  const boxH = laid.length * lh + padY * 2;

  let x = mx + 18 * s, y = my - boxH - 12 * s;
  if (x + boxW > canvasW - 8) x = mx - boxW - 18 * s;
  if (x < 8) x = 8;
  if (y < 8) y = my + 24 * s;
  if (y + boxH > canvasH - 8) y = canvasH - boxH - 8;

  panel(ctx, x, y, boxW, boxH, { border: '#6d5f3a' });

  ctx.textAlign = 'center';
  let ty = y + padY + 12 * s;
  for (const l of laid) {
    ctx.font = `${l.italic ? 'italic ' : ''}${Math.round((l.header ? 15 : 13) * s)}px Georgia, serif`;
    ctx.fillStyle = l.colour || '#d6cdb4';
    ctx.fillText(l.text, x + boxW / 2, ty);
    ty += lh;
  }
  ctx.textAlign = 'left';
}
