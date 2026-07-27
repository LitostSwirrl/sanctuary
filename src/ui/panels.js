// Inventory, character sheet, skill tree and vendor.
//
// One UI object owns which panel is open, what is being dragged, and where
// every clickable rectangle is. Layout is recomputed each frame from the canvas
// size, so nothing here caches positions that could go stale on a resize.

import { panel, panelTitle, drawTooltip } from './tooltip.js';
import { skillIcon } from './hud.js';
import { GRID_W, GRID_H, POTIONS } from '../items/bases.js';
import { describe, RARITY_COLOUR, canEquip, rollItem, makePotion } from '../items/item.js';
import { iconFor, ICON_CELL } from '../art/icons.js';
import { fits, addToInventory, removeFromInventory, sellValue, groundItem } from '../game/loot.js';
import {
  SKILLS, SKILL_BY_ID, TREES, TREE_NAME, allocate, canAllocate,
  allocatedPoints, skillLevel, describeSkill, manaCost,
} from '../game/skills.js';
import { EQUIP_SLOTS } from '../game/player.js';

const CELL = 32;

// Paperdoll layout in cell units: [col, row, w, h].
const DOLL = {
  head: [4, 0, 2, 2],
  amulet: [6.5, 0.5, 1, 1],
  weapon: [0.5, 1, 2, 4],
  body: [4, 2, 2, 3],
  shield: [7.5, 1, 2, 4],
  gloves: [0.5, 5.5, 2, 2],
  ring1: [3, 6, 1, 1],
  belt: [4, 5.5, 2, 1],
  ring2: [6, 6, 1, 1],
  boots: [7.5, 5.5, 2, 2],
};
const SLOT_LABEL = {
  head: 'Helm', amulet: 'Amulet', weapon: 'Weapon', body: 'Armour', shield: 'Shield',
  gloves: 'Gloves', ring1: 'Ring', ring2: 'Ring', belt: 'Belt', boots: 'Boots',
};

const STAT_ROWS = [
  ['str', 'Strength'], ['dex', 'Dexterity'], ['vit', 'Vitality'], ['ene', 'Energy'],
];

export class UI {
  constructor() {
    this.open = null;          // 'inventory' | 'character' | 'skills' | 'vendor' | null
    this.mapMode = false;
    this.drag = null;          // { item, from }
    this.hitAreas = [];
    this.tooltip = null;
    this.vendorStock = null;
    this.message = null;
    this.messageT = 0;
  }

  toggle(which) {
    this.open = this.open === which ? null : which;
    if (this.open !== 'vendor') this.vendorStock = null;
  }
  closeAll() { this.open = null; }

  say(text, seconds = 2.2) { this.message = text; this.messageT = seconds; }

  // ------------------------------------------------------------------ layout

  layout(canvasW, canvasH, s) {
    const w = (GRID_W * CELL + 30) * s;
    const h = 520 * s;
    const x = canvasW - w - 18 * s;
    const y = 54 * s;
    const left = 18 * s;
    return {
      s, cell: CELL * s,
      right: { x, y, w, h },
      leftPanel: { x: left, y, w, h },
      wide: { x: canvasW / 2 - (w * 1.15) / 2, y, w: w * 1.15, h: h * 1.05 },
    };
  }

  // ------------------------------------------------------------------- draw

  draw(ctx, player, opts) {
    const s = opts.scale;
    const L = this.layout(ctx.canvas.width, ctx.canvas.height, s);
    this.hitAreas = [];
    this.tooltip = null;
    const mx = opts.mouse.x, my = opts.mouse.y;

    if (this.open === 'inventory' || this.open === 'vendor') this.drawInventory(ctx, player, L, mx, my, opts);
    if (this.open === 'character') this.drawCharacter(ctx, player, L, mx, my);
    if (this.open === 'skills') this.drawSkills(ctx, player, L, mx, my);
    if (this.open === 'vendor') this.drawVendor(ctx, player, L, mx, my, opts);
    if (this.open === 'waypoint') this.drawWaypoint(ctx, player, L, mx, my, opts);

    if (this.drag) {
      const ic = iconFor(this.drag.item);
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.drawImage(ic, mx - ic.width * s / 2, my - ic.height * s / 2, ic.width * s, ic.height * s);
      ctx.restore();
    } else if (this.tooltip) {
      drawTooltip(ctx, this.tooltip, mx, my, ctx.canvas.width, ctx.canvas.height, s);
    }

    if (this.messageT > 0) {
      ctx.save();
      ctx.font = `${Math.round(16 * s)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, this.messageT);
      ctx.fillStyle = '#0b0a10';
      ctx.fillText(this.message, ctx.canvas.width / 2 + 1, 120 * s + 1);
      ctx.fillStyle = '#e8d9a0';
      ctx.fillText(this.message, ctx.canvas.width / 2, 120 * s);
      ctx.restore();
    }
  }

  area(rect, kind, data) {
    this.hitAreas.push({ ...rect, kind, data });
  }

  hovering(rect, mx, my) {
    return mx >= rect.x && my >= rect.y && mx < rect.x + rect.w && my < rect.y + rect.h;
  }

  // -------------------------------------------------------------- inventory

  drawInventory(ctx, player, L, mx, my, opts) {
    const { x, y, w, h } = L.right;
    const s = L.s, cell = L.cell;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, 'Inventory', x, y, w, s);

    const dollX = x + 15 * s, dollY = y + 44 * s;
    for (const slot of EQUIP_SLOTS) {
      const [c, r, cw, ch] = DOLL[slot];
      const rect = { x: dollX + c * cell, y: dollY + r * cell, w: cw * cell, h: ch * cell };
      const hovered = this.hovering(rect, mx, my);
      ctx.fillStyle = hovered ? 'rgba(80,70,40,0.5)' : 'rgba(0,0,0,0.45)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = 'rgba(140,120,70,0.5)';
      ctx.lineWidth = 1 * s;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

      const it = player.equipment[slot];
      if (it) {
        const ic = iconFor(it);
        const sc = Math.min(rect.w / ic.width, rect.h / ic.height);
        ctx.drawImage(ic, rect.x + (rect.w - ic.width * sc) / 2, rect.y + (rect.h - ic.height * sc) / 2,
          ic.width * sc, ic.height * sc);
        if (hovered && !this.drag) this.tooltip = describe(it, player);
      } else {
        ctx.fillStyle = 'rgba(150,130,90,0.28)';
        ctx.font = `${Math.round(10 * s)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillText(SLOT_LABEL[slot], rect.x + rect.w / 2, rect.y + rect.h / 2 + 3 * s);
        ctx.textAlign = 'left';
      }
      this.area(rect, 'equip', slot);
    }

    // Bag grid
    const gx = x + 15 * s;
    const gy = y + h - GRID_H * cell - 16 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(gx, gy, GRID_W * cell, GRID_H * cell);
    ctx.strokeStyle = 'rgba(120,100,60,0.3)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= GRID_W; c++) {
      ctx.beginPath(); ctx.moveTo(gx + c * cell, gy); ctx.lineTo(gx + c * cell, gy + GRID_H * cell); ctx.stroke();
    }
    for (let r = 0; r <= GRID_H; r++) {
      ctx.beginPath(); ctx.moveTo(gx, gy + r * cell); ctx.lineTo(gx + GRID_W * cell, gy + r * cell); ctx.stroke();
    }
    this.area({ x: gx, y: gy, w: GRID_W * cell, h: GRID_H * cell }, 'bag', { gx, gy, cell });

    for (const slot of player.inventory) {
      const it = slot.item;
      const rect = { x: gx + slot.gx * cell, y: gy + slot.gy * cell, w: it.w * cell, h: it.h * cell };
      const hovered = this.hovering(rect, mx, my);
      ctx.fillStyle = hovered ? 'rgba(90,78,44,0.55)' : 'rgba(40,36,30,0.6)';
      ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
      const ic = iconFor(it);
      const sc = Math.min(rect.w / ic.width, rect.h / ic.height);
      ctx.drawImage(ic, rect.x + (rect.w - ic.width * sc) / 2, rect.y + (rect.h - ic.height * sc) / 2,
        ic.width * sc, ic.height * sc);
      if (hovered && !this.drag) {
        this.tooltip = describe(it, player);
        if (this.open === 'vendor') this.tooltip = this.tooltip.concat([{ text: `Sell for ${sellValue(it)} gold`, colour: '#ffd24a' }]);
      }
    }

    // Ghost of the drop target while dragging.
    if (this.drag) {
      const cellX = Math.floor((mx - gx) / cell), cellY = Math.floor((my - gy) / cell);
      if (cellX >= 0 && cellY >= 0 && cellX < GRID_W && cellY < GRID_H) {
        const ok = fits(player, cellX, cellY, this.drag.item.w, this.drag.item.h);
        ctx.fillStyle = ok ? 'rgba(120,200,120,0.28)' : 'rgba(220,90,80,0.28)';
        ctx.fillRect(gx + cellX * cell, gy + cellY * cell, this.drag.item.w * cell, this.drag.item.h * cell);
      }
    }

    ctx.fillStyle = '#ffd24a';
    ctx.font = `${Math.round(13 * s)}px Georgia, serif`;
    ctx.fillText(`${player.gold} gold`, gx, gy - 6 * s);
    void opts;
  }

  // ---------------------------------------------------------- character sheet

  drawCharacter(ctx, player, L, mx, my) {
    const { x, y, w, h } = L.leftPanel;
    const s = L.s;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, player.name, x, y, w, s);

    let ty = y + 56 * s;
    const line = (label, value, colour = '#d6cdb4') => {
      ctx.font = `${Math.round(13 * s)}px Georgia, serif`;
      ctx.fillStyle = '#9a9078';
      ctx.fillText(label, x + 18 * s, ty);
      ctx.fillStyle = colour;
      ctx.textAlign = 'right';
      ctx.fillText(String(value), x + w - 18 * s, ty);
      ctx.textAlign = 'left';
      ty += 19 * s;
    };

    line('Level', player.level, '#ffe08a');
    line('Experience', Math.round(player.xp));
    line('Next Level', Math.max(0, Math.round(player.xpToNext - player.xpIntoLevel)));
    ty += 8 * s;

    // Attributes, each with a plus button while points remain.
    for (const [key, label] of STAT_ROWS) {
      ctx.font = `${Math.round(13 * s)}px Georgia, serif`;
      ctx.fillStyle = '#9a9078';
      ctx.fillText(label, x + 18 * s, ty);
      const bonus = player.effective[key] - player.stats[key];
      ctx.textAlign = 'right';
      ctx.fillStyle = bonus > 0 ? '#7a86ff' : '#d6cdb4';
      ctx.fillText(bonus > 0 ? `${player.stats[key]} + ${bonus}` : String(player.stats[key]), x + w - 46 * s, ty);
      ctx.textAlign = 'left';
      if (player.statPoints > 0) {
        const rect = { x: x + w - 36 * s, y: ty - 12 * s, w: 18 * s, h: 16 * s };
        const hov = this.hovering(rect, mx, my);
        ctx.fillStyle = hov ? '#8a7430' : '#4a4028';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = '#ffe08a';
        ctx.textAlign = 'center';
        ctx.fillText('+', rect.x + rect.w / 2, rect.y + 12 * s);
        ctx.textAlign = 'left';
        this.area(rect, 'stat', key);
      }
      ty += 19 * s;
    }
    if (player.statPoints > 0) {
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(`${player.statPoints} stat points to spend`, x + 18 * s, ty);
    }
    ty += 22 * s;

    line('Life', `${Math.round(player.hp)} / ${player.maxHp}`, '#ff7a6a');
    line('Mana', `${Math.round(player.mana)} / ${player.maxMana}`, '#7a9aff');
    ty += 8 * s;
    line('Damage', `${player.minDamage} - ${player.maxDamage}`);
    line('Attack Rating', player.attackRating);
    line('Defence', player.defense);
    ty += 8 * s;
    line('Fire Resist', `${player.resists.fire}%`, '#ff8a4a');
    line('Cold Resist', `${player.resists.cold}%`, '#7ad0ff');
    line('Lightning Resist', `${player.resists.light}%`, '#c0c8ff');
    line('Poison Resist', `${player.resists.pois}%`, '#8fd88f');
    ty += 8 * s;
    line('Faster Cast Rate', `${player.castRate}%`);
    line('Faster Run/Walk', `${player.totals.frw}%`);
    line('Magic Find', `${player.magicFind}%`);
    line('Gold Find', `${player.goldFind}%`);
    line('Gold', player.gold, '#ffd24a');
  }

  // ------------------------------------------------------------- skill tree

  drawSkills(ctx, player, L, mx, my) {
    const { x, y, w, h } = L.wide;
    const s = L.s;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, 'Skills', x, y, w, s);

    const colW = w / 3;
    const iconSz = 38 * s;
    const positions = {};

    // Rows are ordered by the level a skill unlocks at.
    const rowsFor = (tree) => {
      const list = SKILLS.filter((sk) => sk.tree === tree);
      const byReq = {};
      for (const sk of list) (byReq[sk.req] = byReq[sk.req] || []).push(sk);
      return Object.keys(byReq).sort((a, b) => a - b).map((k) => byReq[k]);
    };

    TREES.forEach((tree, ti) => {
      const cx = x + colW * ti + colW / 2;
      ctx.fillStyle = '#c8b070';
      ctx.font = `${Math.round(14 * s)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.fillText(TREE_NAME[tree], cx, y + 56 * s);
      ctx.textAlign = 'left';

      const rows = rowsFor(tree);
      rows.forEach((row, ri) => {
        const ry = y + 78 * s + ri * 62 * s;
        row.forEach((sk, si) => {
          const spread = (si - (row.length - 1) / 2) * 62 * s;
          positions[sk.id] = { x: cx + spread - iconSz / 2, y: ry, w: iconSz, h: iconSz };
        });
      });
    });

    // Prerequisite lines, drawn under the icons.
    ctx.strokeStyle = 'rgba(150,130,80,0.45)';
    ctx.lineWidth = 2 * s;
    for (const sk of SKILLS) {
      for (const p of sk.prereq || []) {
        const a = positions[p], b = positions[sk.id];
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x + a.w / 2, a.y + a.h);
        ctx.lineTo(b.x + b.w / 2, b.y);
        ctx.stroke();
      }
    }

    for (const sk of SKILLS) {
      const r = positions[sk.id];
      if (!r) continue;
      const pts = allocatedPoints(player, sk.id);
      const can = canAllocate(player, sk.id);
      const hovered = this.hovering(r, mx, my);

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const ic = skillIcon(sk.id);
      ctx.save();
      ctx.globalAlpha = pts > 0 ? 1 : 0.4;
      ctx.drawImage(ic, r.x + (r.w - ic.width * s) / 2, r.y + (r.h - ic.height * s) / 2, ic.width * s, ic.height * s);
      ctx.restore();

      ctx.strokeStyle = hovered ? '#ffe08a' : can.ok ? '#8fd88f' : pts > 0 ? '#9a8f70' : 'rgba(120,100,60,0.5)';
      ctx.lineWidth = 2 * s;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      if (pts > 0) {
        const lvl = skillLevel(player, sk.id);
        ctx.fillStyle = lvl > pts ? '#7a86ff' : '#ffe08a';
        ctx.font = `${Math.round(12 * s)}px Georgia, serif`;
        ctx.textAlign = 'right';
        ctx.fillText(String(lvl), r.x + r.w - 3 * s, r.y + r.h - 3 * s);
        ctx.textAlign = 'left';
      }
      if (player.rightSkill === sk.id) {
        ctx.strokeStyle = '#ff9a30';
        ctx.lineWidth = 2 * s;
        ctx.strokeRect(r.x - 3 * s, r.y - 3 * s, r.w + 6 * s, r.h + 6 * s);
      }
      if (player.leftSkill === sk.id) {
        ctx.strokeStyle = '#7ad0ff';
        ctx.lineWidth = 2 * s;
        ctx.strokeRect(r.x - 5 * s, r.y - 5 * s, r.w + 10 * s, r.h + 10 * s);
      }

      if (hovered && !this.drag) {
        this.tooltip = describeSkill(player, sk.id).concat(
          can.ok ? [{ text: 'Click to spend a point', colour: '#8fd88f' }]
            : pts > 0 ? [] : [{ text: can.why, colour: '#ff5a4a' }],
          [{ text: 'Right-click to bind to right mouse', colour: '#8a7f6a' }]
        );
      }
      this.area(r, 'skill', sk.id);
    }

    ctx.fillStyle = player.skillPoints > 0 ? '#ffe08a' : '#8a7f6a';
    ctx.font = `${Math.round(14 * s)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${player.skillPoints} skill point${player.skillPoints === 1 ? '' : 's'} to spend`,
      x + w / 2, y + h - 16 * s);
    ctx.textAlign = 'left';
  }

  // ------------------------------------------------------------------ vendor

  ensureStock(rng, areaLevel) {
    if (this.vendorStock) return this.vendorStock;
    const stock = [];
    for (const p of POTIONS.filter((q) => q.tier <= 2)) stock.push(makePotion(p.id));
    for (let i = 0; i < 8; i++) {
      const it = rollItem(rng, Math.max(3, areaLevel + 2), { rarity: rng.chance(0.35) ? 'magic' : 'normal' });
      if (it) stock.push(it);
    }
    this.vendorStock = stock;
    return stock;
  }

  drawVendor(ctx, player, L, mx, my) {
    const { x, y, w, h } = L.leftPanel;
    const s = L.s;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, 'Trade', x, y, w, s);
    const stock = this.vendorStock || [];

    ctx.font = `${Math.round(12 * s)}px Georgia, serif`;
    ctx.fillStyle = '#9a9078';
    ctx.fillText('Click to buy. Click an item in your bag to sell it.', x + 16 * s, y + 50 * s);

    let ty = y + 66 * s;
    for (const it of stock) {
      const rect = { x: x + 14 * s, y: ty, w: w - 28 * s, h: 30 * s };
      const hovered = this.hovering(rect, mx, my);
      ctx.fillStyle = hovered ? 'rgba(90,78,44,0.5)' : 'rgba(0,0,0,0.35)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      const ic = iconFor(it);
      const sc = Math.min(26 * s / ic.width, 26 * s / ic.height);
      ctx.drawImage(ic, rect.x + 3 * s, rect.y + (rect.h - ic.height * sc) / 2, ic.width * sc, ic.height * sc);
      ctx.fillStyle = RARITY_COLOUR[it.rarity] || '#d6cdb4';
      ctx.font = `${Math.round(12 * s)}px Georgia, serif`;
      ctx.fillText(it.name.slice(0, 28), rect.x + 34 * s, rect.y + 19 * s);
      ctx.fillStyle = player.gold >= it.price ? '#ffd24a' : '#a05a4a';
      ctx.textAlign = 'right';
      ctx.fillText(String(it.price), rect.x + rect.w - 6 * s, rect.y + 19 * s);
      ctx.textAlign = 'left';
      if (hovered && !this.drag) this.tooltip = describe(it, player);
      this.area(rect, 'buy', it);
      ty += 33 * s;
    }
  }

  // --------------------------------------------------------------- waypoint

  drawWaypoint(ctx, player, L, mx, my, opts) {
    const s = L.s;
    const w = 300 * s, h = 260 * s;
    const x = ctx.canvas.width / 2 - w / 2, y = ctx.canvas.height / 2 - h / 2;
    panel(ctx, x, y, w, h);
    panelTitle(ctx, 'Waypoints', x, y, w, s);

    const list = opts.waypointAreas || [];
    let ty = y + 52 * s;
    for (const a of list) {
      const known = player.waypoints[a.id];
      const here = a.id === opts.currentArea;
      const rect = { x: x + 16 * s, y: ty, w: w - 32 * s, h: 30 * s };
      const hovered = known && !here && this.hovering(rect, mx, my);
      ctx.fillStyle = hovered ? 'rgba(90,78,44,0.6)' : 'rgba(0,0,0,0.35)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = 'rgba(140,120,70,0.4)';
      ctx.lineWidth = 1 * s;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
      ctx.font = `${Math.round(13 * s)}px Georgia, serif`;
      ctx.fillStyle = here ? '#8fd88f' : known ? '#d6cdb4' : '#5f5646';
      ctx.fillText(known ? a.name : '- not yet found -', rect.x + 10 * s, rect.y + 20 * s);
      if (here) {
        ctx.textAlign = 'right';
        ctx.fillText('here', rect.x + rect.w - 10 * s, rect.y + 20 * s);
        ctx.textAlign = 'left';
      }
      if (known && !here) this.area(rect, 'travel', a.id);
      ty += 34 * s;
    }
    ctx.fillStyle = '#8a7f6a';
    ctx.font = `${Math.round(11 * s)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Esc to close', x + w / 2, y + h - 14 * s);
    ctx.textAlign = 'left';
  }

  // ------------------------------------------------------------------- input

  // Returns true when the click belonged to the UI.
  mouseDown(mx, my, player, ctx, button) {
    if (!this.open) return false;
    // Topmost first.
    for (let i = this.hitAreas.length - 1; i >= 0; i--) {
      const a = this.hitAreas[i];
      if (!this.hovering(a, mx, my)) continue;

      if (a.kind === 'stat' && button === 0) { player.spendStat(a.data); return true; }

      if (a.kind === 'travel' && button === 0) {
        if (this.onTravel) this.onTravel(a.data);
        return true;
      }

      if (a.kind === 'skill') {
        if (button === 2) {
          if (allocatedPoints(player, a.data) > 0 && !SKILL_BY_ID[a.data].passive) {
            player.rightSkill = a.data;
            this.say(`${SKILL_BY_ID[a.data].name} bound to right mouse`);
          }
        } else {
          const c = canAllocate(player, a.data);
          if (c.ok) allocate(player, a.data);
          else this.say(c.why);
        }
        return true;
      }

      if (a.kind === 'buy' && button === 0) {
        const it = a.data;
        if (player.gold < it.price) { this.say('Not enough gold'); return true; }
        if (!addToInventory(player, it)) { this.say('No room'); return true; }
        player.gold -= it.price;
        this.vendorStock = this.vendorStock.filter((q) => q !== it);
        return true;
      }

      if (a.kind === 'equip' && button === 0) {
        const cur = player.equipment[a.data];
        if (this.drag) return this.dropOn(a, mx, my, player, ctx);
        if (cur) {
          if (this.open === 'vendor') {
            player.gold += sellValue(cur);
            player.equipment[a.data] = null;
            player.recalc();
            this.say(`Sold for ${sellValue(cur)} gold`);
            return true;
          }
          player.equipment[a.data] = null;
          player.recalc();
          this.drag = { item: cur, from: { kind: 'equip', slot: a.data } };
        }
        return true;
      }

      if (a.kind === 'bag') {
        const { gx, gy, cell } = a.data;
        if (this.drag) return this.dropOn(a, mx, my, player, ctx);
        const cx = Math.floor((mx - gx) / cell), cy = Math.floor((my - gy) / cell);
        const slot = player.inventory.find((sl) =>
          cx >= sl.gx && cx < sl.gx + sl.item.w && cy >= sl.gy && cy < sl.gy + sl.item.h);
        if (!slot) return true;
        if (this.open === 'vendor' && button === 0) {
          player.gold += sellValue(slot.item);
          this.say(`Sold for ${sellValue(slot.item)} gold`);
          removeFromInventory(player, slot.item);
          return true;
        }
        if (button === 2) { this.equipFromBag(player, slot); return true; }
        removeFromInventory(player, slot.item);
        this.drag = { item: slot.item, from: { kind: 'bag', gx: slot.gx, gy: slot.gy } };
        return true;
      }
    }
    // A click inside an open panel that hit nothing still belongs to the UI.
    return this.pointerOverPanel(mx, my, ctx);
  }

  dropOn(a, mx, my, player, ctx) {
    const item = this.drag.item;
    if (a.kind === 'equip') {
      const slot = a.data;
      const wanted = item.slot === 'ring' ? ['ring1', 'ring2'] : [item.slot];
      if (!wanted.includes(slot)) { this.say('That does not go there'); return true; }
      if (!canEquip(player, item)) { this.say('You do not meet the requirements'); return true; }
      const prev = player.equipment[slot];
      player.equipment[slot] = item;
      // A two-handed weapon and a shield cannot both be worn.
      if (slot === 'weapon' && item.twoHand && player.equipment.shield) {
        const sh = player.equipment.shield;
        player.equipment.shield = null;
        if (!addToInventory(player, sh)) this.dropToGround(sh, player, ctx);
      }
      if (slot === 'shield' && player.equipment.weapon && player.equipment.weapon.twoHand) {
        const wp = player.equipment.weapon;
        player.equipment.weapon = null;
        if (!addToInventory(player, wp)) this.dropToGround(wp, player, ctx);
      }
      this.drag = null;
      player.recalc();
      if (prev && !addToInventory(player, prev)) this.dropToGround(prev, player, ctx);
      return true;
    }
    if (a.kind === 'bag') {
      const { gx, gy, cell } = a.data;
      const cx = Math.floor((mx - gx) / cell), cy = Math.floor((my - gy) / cell);
      if (fits(player, cx, cy, item.w, item.h)) {
        player.inventory.push({ item, gx: cx, gy: cy });
        this.drag = null;
      } else this.say('No room there');
      return true;
    }
    return true;
  }

  equipFromBag(player, slot) {
    const item = slot.item;
    if (item.potion) {
      for (let i = 0; i < player.belt.length; i++) {
        if (!player.belt[i]) { player.belt[i] = item; removeFromInventory(player, item); return; }
      }
      this.say('Belt is full');
      return;
    }
    if (!item.slot || item.slot === 'potion') return;
    if (!canEquip(player, item)) { this.say('You do not meet the requirements'); return; }
    const target = item.slot === 'ring' ? (player.equipment.ring1 ? 'ring2' : 'ring1') : item.slot;
    const prev = player.equipment[target];
    removeFromInventory(player, item);
    player.equipment[target] = item;
    if (target === 'weapon' && item.twoHand && player.equipment.shield) {
      const sh = player.equipment.shield;
      player.equipment.shield = null;
      addToInventory(player, sh);
    }
    player.recalc();
    if (prev) addToInventory(player, prev);
  }

  // Released outside every panel: put it on the floor.
  mouseUp(mx, my, player, ctx) {
    if (!this.drag) return false;
    if (this.pointerOverPanel(mx, my, ctx)) return true;
    this.dropToGround(this.drag.item, player, ctx);
    this.drag = null;
    return true;
  }

  dropToGround(item, player, ctx) {
    if (!ctx || !ctx.level) return;
    const p = ctx.level.nearestOpen(player.x + (Math.random() - 0.5), player.y + (Math.random() - 0.5), 4);
    ctx.level.items.push(groundItem(item, p.x, p.y));
  }

  pointerOverPanel(mx, my, ctx) {
    if (!this.open || !ctx || !ctx.canvasSize) return false;
    const L = this.layout(ctx.canvasSize.w, ctx.canvasSize.h, ctx.scale);
    const rects = [];
    if (this.open === 'inventory' || this.open === 'vendor') rects.push(L.right);
    if (this.open === 'character' || this.open === 'vendor') rects.push(L.leftPanel);
    if (this.open === 'skills') rects.push(L.wide);
    if (this.open === 'waypoint') {
      const w = 300 * ctx.scale, h = 260 * ctx.scale;
      rects.push({ x: ctx.canvasSize.w / 2 - w / 2, y: ctx.canvasSize.h / 2 - h / 2, w, h });
    }
    return rects.some((r) => mx >= r.x && my >= r.y && mx < r.x + r.w && my < r.y + r.h);
  }

  update(dt) { if (this.messageT > 0) this.messageT -= dt; }
}

export { ICON_CELL, manaCost };
