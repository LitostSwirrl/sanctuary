// The permanent bar: life and mana globes, the belt, the two bound skills, and
// the experience strip. Also the labels that float over items on the ground.

import { Buf, capsule, ellipse, ellipseF, polyF, lineP, outline, bufToCanvas, rectF } from '../art/pixel.js';
import { ramp, packHex } from '../art/palette.js';
import { SKILL_BY_ID, skillLevel, manaCost } from '../game/skills.js';
import { RARITY_COLOUR, itemName } from '../items/item.js';
import { xpForLevel } from '../game/combat.js';

export const HUD_H = 92;          // logical pixels
const GLOBE_R = 42;

const TREE_COLOUR = {
  fire: '#ff7a30', cold: '#7ad0ff', light: '#b0c8ff',
  combat: '#d04a30', cries: '#e8a030', mastery: '#9aa8b8',
};
const skillIcons = new Map();

// Marks for the spell trees. Ten skills to a tree is too many for one element
// shape and a count of pips, so the shape says which spell and the colour says
// which tree: a mark is never used twice inside one tree, and no two trees
// share a palette.
const MARKS = [
  // 0 bolt
  (b, rm, hi) => {
    polyF(b, [15, 3, 21, 14, 15, 21, 9, 14], rm.base);
    polyF(b, [15, 3, 21, 14, 15, 14], rm.light);
    capsule(b, 15, 20, 2.2, 15, 27, 1.1, rm);
  },
  // 1 ring
  (b, rm, hi) => {
    ellipse(b, 15, 15, 11, 11, rm);
    ellipseF(b, 15, 15, 7, 7, 0);
    ellipseF(b, 15, 15, 2.4, 2.4, hi);
  },
  // 2 cone
  (b, rm) => {
    for (let i = -1; i <= 1; i++) capsule(b, 5, 15, 2, 26, 15 + i * 9, 1.1, rm);
  },
  // 3 trail
  (b, rm, hi) => {
    ellipse(b, 8, 22, 4.4, 4.4, rm);
    ellipse(b, 16, 15, 3.4, 3.4, rm);
    ellipse(b, 23, 8, 2.4, 2.4, rm);
    ellipseF(b, 8, 22, 1.6, 1.6, hi);
  },
  // 4 orb
  (b, rm, hi) => {
    ellipse(b, 15, 15, 9.5, 9.5, rm);
    ellipseF(b, 11.5, 11.5, 2.6, 2.6, hi);
  },
  // 5 bars
  (b, rm) => {
    for (let i = 0; i < 3; i++) capsule(b, 7 + i * 8, 4, 2, 7 + i * 8, 26, 2, rm);
  },
  // 6 comet
  (b, rm, hi) => {
    capsule(b, 17, 13, 3, 4, 26, 0.8, rm);
    ellipse(b, 20, 10, 5.5, 5.5, rm);
    ellipseF(b, 18.5, 8.5, 1.8, 1.8, hi);
  },
  // 7 star
  (b, rm, hi) => {
    polyF(b, [15, 2, 18, 12, 28, 15, 18, 18, 15, 28, 12, 18, 2, 15, 12, 12], rm.base);
    ellipseF(b, 15, 15, 2.4, 2.4, hi);
  },
  // 8 chevrons
  (b, rm) => {
    for (let i = 0; i < 2; i++) {
      const y = 13 + i * 9;
      capsule(b, 5, y + 6, 2, 15, y - 2, 2, rm);
      capsule(b, 15, y - 2, 2, 25, y + 6, 2, rm);
    }
  },
  // 9 zigzag
  (b, rm, hi) => {
    polyF(b, [18, 2, 8, 16, 14, 16, 11, 28, 23, 13, 16, 13], rm.base);
    lineP(b, 17, 4, 10, 15, hi);
  },
  // 10 shield
  (b, rm, hi) => {
    polyF(b, [5, 5, 25, 5, 25, 15, 15, 27, 5, 15], rm.base);
    polyF(b, [5, 5, 15, 5, 15, 27, 5, 15], rm.light);
    ellipseF(b, 15, 13, 2.6, 2.6, hi);
  },
  // 11 block
  (b, rm, hi) => {
    polyF(b, [10, 4, 20, 4, 26, 15, 20, 26, 10, 26, 4, 15], rm.base);
    polyF(b, [10, 4, 15, 4, 15, 26, 10, 26, 4, 15], rm.light);
    lineP(b, 15, 4, 15, 26, hi);
  },
];

const MARK_HI = { fire: '#ffd060', cold: '#e8f8ff', light: '#eef2ff' };

// A small glyph per skill: element-shaped, varied by index so two fire skills
// are still distinguishable at a glance.
function bakeSkillIcon(id) {
  const sk = SKILL_BY_ID[id];
  const S = 30;
  const buf = new Buf(S, S);
  const base = sk.tree ? TREE_COLOUR[sk.tree] : '#c8a03a';
  const rm = ramp(base);
  const idx = SKILL_BY_ID[id].iconSeed ?? Object.keys(SKILL_BY_ID).indexOf(id);

  if (MARK_HI[sk.tree]) {
    MARKS[idx % MARKS.length](buf, rm, packHex(MARK_HI[sk.tree]));
  } else if (sk.tree === 'combat') {
    // Axe wedge on a haft.
    capsule(buf, 13, 27, 1.6, 13, 5, 1.4, ramp('#5a4028'));
    polyF(buf, [13, 6, 24, 9, 22, 18, 13, 16], packHex(base));
    polyF(buf, [13, 6, 24, 9, 17, 10], ramp('#ffb090').light);
  } else if (sk.tree === 'cries') {
    // Nested shout arcs opening to the right.
    for (let i = 0; i < 3; i++) {
      const r = 5 + i * 4;
      capsule(buf, 9 + r * 0.5, 15 - r * 0.8, 1.5, 9 + r, 15, 1.5, rm);
      capsule(buf, 9 + r, 15, 1.5, 9 + r * 0.5, 15 + r * 0.8, 1.5, rm);
    }
    ellipseF(buf, 7, 15, 2, 2, packHex('#f0e0a0'));
  } else if (sk.tree === 'mastery') {
    // Anvil block.
    polyF(buf, [4, 10, 26, 10, 22, 15, 18, 15, 18, 21, 12, 21, 12, 15, 7, 15], packHex(base));
    rectF(buf, 9, 21, 12, 3, rm.dark);
    lineP(buf, 5, 10, 25, 10, rm.light);
  } else {
    polyF(buf, [17, 2, 10, 14, 15, 14, 12, 28, 21, 12, 15, 12], packHex(base));
  }

  // Rank pips so skills within a tree read apart.
  const pips = (idx % 4) + 1;
  for (let i = 0; i < pips; i++) {
    ellipseF(buf, 4 + i * 5, 27, 1.6, 1.6, packHex('#f0e0a0'));
  }
  if (sk.passive) lineP(buf, 2, 2, 27, 2, packHex('#f0e0a0'));

  outline(buf, packHex('#0c0a10'));
  return bufToCanvas(buf);
}

export function skillIcon(id) {
  let ic = skillIcons.get(id);
  if (!ic) { ic = bakeSkillIcon(id); skillIcons.set(id, ic); }
  return ic;
}

// ------------------------------------------------------------------- globes

function drawGlobe(ctx, cx, cy, r, frac, colours, label) {
  ctx.save();
  // Glass ball
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, colours.hi);
  g.addColorStop(0.55, colours.mid);
  g.addColorStop(1, colours.lo);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0910';
  ctx.fill();

  // Liquid, clipped to the ball, with a wavy surface.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.clip();
  const top = cy + r - (r * 2 - 4) * Math.max(0, Math.min(1, frac));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - r, top);
  for (let x = -r; x <= r; x += 4) {
    ctx.lineTo(cx + x, top + Math.sin((x + performance.now() * 0.003) * 0.25) * 1.6);
  }
  ctx.lineTo(cx + r, cy + r);
  ctx.lineTo(cx - r, cy + r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Rim and highlight
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#4a4030';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const hl = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 0.7);
  hl.addColorStop(0, 'rgba(255,255,255,0.28)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e8dcbc';
  ctx.font = `${Math.round(r * 0.3)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, cy + r * 0.12);
  ctx.textAlign = 'left';
  ctx.restore();
}

const LIFE_COLOURS = { hi: '#ff6a5a', mid: '#c02020', lo: '#6a0f10' };
const MANA_COLOURS = { hi: '#7a9aff', mid: '#2038c0', lo: '#101a5a' };

// --------------------------------------------------------------------- bar

// Returns the clickable regions so input can be tested against them.
export function drawHUD(ctx, player, opts) {
  const s = opts.scale;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const barH = HUD_H * s;
  const y = H - barH;
  const regions = { belt: [], skills: [], globes: {} };
  const mouse = opts.mouse || { x: -1, y: -1 };
  const over = (x, yy, w, h) => mouse.x >= x && mouse.y >= yy && mouse.x < x + w && mouse.y < yy + h;

  // Panel
  ctx.save();
  ctx.fillStyle = 'rgba(14,12,18,0.92)';
  ctx.fillRect(0, y, W, barH);
  ctx.strokeStyle = 'rgba(120,100,60,0.55)';
  ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.moveTo(0, y + 1); ctx.lineTo(W, y + 1); ctx.stroke();

  // Experience strip along the very bottom.
  const into = player.xp - xpForLevel(player.level);
  const need = Math.max(1, xpForLevel(player.level + 1) - xpForLevel(player.level));
  const frac = Math.max(0, Math.min(1, into / need));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H - 5 * s, W, 5 * s);
  ctx.fillStyle = '#b08a2a';
  ctx.fillRect(0, H - 5 * s, W * frac, 5 * s);

  const gr = GLOBE_R * s;
  const gy = y + barH / 2;
  drawGlobe(ctx, gr + 8 * s, gy, gr, player.hp / player.maxHp, LIFE_COLOURS,
    `${Math.round(player.hp)}/${player.maxHp}`);
  drawGlobe(ctx, W - gr - 8 * s, gy, gr, player.mana / player.maxMana, MANA_COLOURS,
    `${Math.round(player.mana)}/${player.maxMana}`);
  regions.globes.life = { x: 8 * s, y: gy - gr, w: gr * 2, h: gr * 2 };
  regions.globes.mana = { x: W - gr * 2 - 8 * s, y: gy - gr, w: gr * 2, h: gr * 2 };

  // Belt: four potion slots on keys 1 to 4.
  const slot = 40 * s;
  const beltW = slot * 4 + 6 * s * 3;
  const bx = W / 2 - beltW / 2;
  const by = y + barH / 2 - slot / 2;
  for (let i = 0; i < 4; i++) {
    const x = bx + i * (slot + 6 * s);
    const hov = over(x, by, slot, slot);
    ctx.fillStyle = hov ? 'rgba(70,60,34,0.75)' : 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, by, slot, slot);
    ctx.strokeStyle = hov ? '#ffe08a' : 'rgba(140,120,70,0.6)';
    ctx.lineWidth = 1.5 * s;
    ctx.strokeRect(x + 0.5, by + 0.5, slot - 1, slot - 1);
    const p = player.belt[i];
    if (p && opts.iconFor) {
      const ic = opts.iconFor(p);
      ctx.drawImage(ic, x + (slot - ic.width * s) / 2, by + (slot - ic.height * s) / 2, ic.width * s, ic.height * s);
    }
    ctx.fillStyle = '#9a8f70';
    ctx.font = `${Math.round(11 * s)}px Georgia, serif`;
    ctx.fillText(String(i + 1), x + 3 * s, by + 12 * s);
    regions.belt.push({ x, y: by, w: slot, h: slot, index: i });
  }

  // The two bound skills, left of the belt and right of it.
  const drawSkillButton = (id, x, isLeft) => {
    const sz = 46 * s;
    const yy = y + barH / 2 - sz / 2;
    const hov = over(x, yy, sz, sz);
    ctx.fillStyle = hov ? 'rgba(70,60,34,0.75)' : 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, yy, sz, sz);
    ctx.strokeStyle = hov ? '#ffe08a' : 'rgba(150,130,80,0.7)';
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(x + 0.5, yy + 0.5, sz - 1, sz - 1);
    if (id && id !== 'attack') {
      const ic = skillIcon(id);
      ctx.drawImage(ic, x + (sz - ic.width * s) / 2, yy + (sz - ic.height * s) / 2, ic.width * s, ic.height * s);
      const cost = manaCost(player, id);
      if (cost) {
        ctx.fillStyle = player.mana >= cost ? '#8fa8ff' : '#ff5a4a';
        ctx.font = `${Math.round(10 * s)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(cost), x + sz / 2, yy + sz - 3 * s);
        ctx.textAlign = 'left';
      }
    } else {
      ctx.fillStyle = '#8a7f6a';
      ctx.font = `${Math.round(11 * s)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Attack', x + sz / 2, yy + sz / 2 + 4 * s);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#7f7663';
    ctx.font = `${Math.round(10 * s)}px Georgia, serif`;
    ctx.fillText(isLeft ? 'L' : 'R', x + 3 * s, yy + 11 * s);
    regions.skills.push({ x, y: yy, w: sz, h: sz, side: isLeft ? 'left' : 'right' });
  };
  drawSkillButton(player.leftSkill, bx - 56 * s, true);
  drawSkillButton(player.rightSkill, bx + beltW + 10 * s, false);

  ctx.restore();
  return regions;
}

// ------------------------------------------------------------------ cursor

// The page hides the system cursor so it cannot sit on top of the scene at the
// wrong scale, which means the game has to draw its own. `mode` says what is
// under it: 'hostile' brackets a target, 'talk' and 'take' mark something you
// can walk up to, anything else is the plain pointer.
export function drawCursor(ctx, x, y, mode, s) {
  ctx.save();
  ctx.lineJoin = 'round';

  if (mode === 'hostile') {
    const r = 13 * s;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 4 * s;
    for (let i = 0; i < 2; i++) {
      // Four corner brackets, drawn once in black and once in red over it.
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(x + sx * r, y + sy * r - sy * r * 0.55);
        ctx.lineTo(x + sx * r, y + sy * r);
        ctx.lineTo(x + sx * r - sx * r * 0.55, y + sy * r);
        ctx.stroke();
      }
      ctx.strokeStyle = '#e03a2a';
      ctx.lineWidth = 2 * s;
    }
    ctx.fillStyle = '#e03a2a';
    ctx.fillRect(x - 1 * s, y - 1 * s, 2 * s, 2 * s);
    ctx.restore();
    return;
  }

  // A stubby angular arrow, black-edged so it reads on any terrain.
  const p = [[0, 0], [0, 15], [4.2, 11.4], [7, 17], [10, 15.4], [7.2, 10], [12, 9.4]];
  ctx.beginPath();
  ctx.moveTo(x + p[0][0] * s, y + p[0][1] * s);
  for (let i = 1; i < p.length; i++) ctx.lineTo(x + p[i][0] * s, y + p[i][1] * s);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 3 * s;
  ctx.stroke();
  ctx.fillStyle = mode === 'talk' ? '#ffd24a' : mode === 'take' ? '#8fd88f' : '#e8dcbc';
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------- world-space labels

// Item names on the ground. Alt shows every one; otherwise only what is close
// or under the cursor.
export function drawGroundLabels(ctx, level, cam, opts) {
  const s = opts.scale;
  const showAll = opts.showAll;
  const player = opts.player;
  ctx.save();
  ctx.font = `${Math.round(12 * s)}px Georgia, serif`;
  ctx.textAlign = 'center';
  const placed = [];
  for (const gi of level.items) {
    if (gi.taken) continue;
    const d = Math.hypot(gi.x - player.x, gi.y - player.y);
    const near = d < 5.5;
    const hovered = opts.hovered === gi;
    if (!showAll && !hovered && !near) continue;

    const p = cam.toScreen(gi.x, gi.y);
    let ly = p.y - 26 * s;
    // Nudge overlapping labels apart so a pile stays readable.
    for (const q of placed) {
      if (Math.abs(q.x - p.x) < 70 * s && Math.abs(q.y - ly) < 14 * s) ly = q.y - 15 * s;
    }
    placed.push({ x: p.x, y: ly });

    const name = gi.item.gold ? `${gi.item.gold} Gold` : itemName(gi.item);
    const w = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(p.x - w / 2 - 5 * s, ly - 11 * s, w + 10 * s, 15 * s);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - w / 2 - 5 * s, ly - 11 * s, w + 10 * s, 15 * s);
    ctx.fillStyle = RARITY_COLOUR[gi.item.rarity] || '#d6cdb4';
    ctx.fillText(name, p.x, ly);
    gi.labelRect = { x: p.x - w / 2 - 5 * s, y: ly - 11 * s, w: w + 10 * s, h: 15 * s };
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

// Name and health above whatever the cursor is over.
export function drawMonsterBanner(ctx, m, cam, s) {
  if (!m) return;
  const p = cam.toScreen(m.x, m.y);
  const label = m.label || m.name;

  // Townsfolk get a name and a title, and no health bar.
  if (m.isNpc) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(15 * s)}px Georgia, serif`;
    const w = Math.max(110 * s, ctx.measureText(m.title || '').width + 24 * s);
    const y = p.y - 78 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(p.x - w / 2, y - 15 * s, w, 38 * s);
    ctx.fillStyle = '#e8d9a0';
    ctx.fillText(label, p.x, y);
    ctx.font = `${Math.round(11 * s)}px Georgia, serif`;
    ctx.fillStyle = '#9a8f70';
    ctx.fillText(m.title || '', p.x, y + 16 * s);
    ctx.textAlign = 'left';
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.font = `${Math.round(14 * s)}px Georgia, serif`;
  ctx.textAlign = 'center';
  const w = Math.max(90 * s, ctx.measureText(label).width + 20 * s);
  const y = p.y - 74 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(p.x - w / 2, y - 14 * s, w, 26 * s);
  ctx.fillStyle = m.rank === 'boss' || m.rank === 'unique' ? '#ffb020' : m.rank === 'champion' ? '#7ab0ff' : '#d0c8b0';
  ctx.fillText(label, p.x, y - 2 * s);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(p.x - w / 2 + 6 * s, y + 4 * s, w - 12 * s, 5 * s);
  ctx.fillStyle = '#b03030';
  ctx.fillRect(p.x - w / 2 + 6 * s, y + 4 * s, (w - 12 * s) * Math.max(0, m.hp / m.maxHp), 5 * s);
  if (m.mods && m.mods.length) {
    ctx.font = `${Math.round(11 * s)}px Georgia, serif`;
    ctx.fillStyle = '#9a8fd0';
    ctx.fillText(m.mods.join(', '), p.x, y + 22 * s);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

export { skillLevel };
