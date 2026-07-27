// Phase 8 harness: rolls a large sample of items, audits the affix rules and
// rarity distribution, and draws every base's icon. Replaced by the real state
// machine in a later task.

import { Rng } from './core/rng.js';
import { BASES, POTIONS, tierForAreaLevel } from './items/bases.js';
import { PREFIXES, SUFFIXES } from './items/affixes.js';
import { UNIQUES } from './items/uniques.js';
import { rollItem, makePotion, makeGold, describe, RARITY_COLOUR } from './items/item.js';
import { iconFor, ICON_CELL } from './art/icons.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
ctx.imageSmoothingEnabled = false;

const AFFIX_BY_NAME = {};
for (const a of PREFIXES) AFFIX_BY_NAME[a.name] = { ...a, kind: 'prefix' };
for (const a of SUFFIXES) AFFIX_BY_NAME[a.name] = { ...a, kind: 'suffix' };

window.__itemAudit = (n = 8000) => {
  const rng = new Rng(4242);
  const counts = { normal: 0, magic: 0, rare: 0, unique: 0 };
  const problems = { wrongSlot: [], overGate: [], noName: [], badDmg: [], dupMod: [] };
  const affixCount = { magic: [], rare: [] };
  const uniquesSeen = new Set();

  for (let i = 0; i < n; i++) {
    const ilvl = 1 + (i % 14);
    const it = rollItem(rng, ilvl, { tier: tierForAreaLevel(ilvl) });
    if (!it) continue;
    counts[it.rarity]++;
    if (!it.name) problems.noName.push(it.baseId);
    if (it.rarity === 'unique') uniquesSeen.add(it.name);
    if (it.rarity === 'magic') affixCount.magic.push(it.affixes.length);
    if (it.rarity === 'rare') affixCount.rare.push(it.affixes.length);

    if (it.minDmg !== undefined && it.maxDmg <= it.minDmg) problems.badDmg.push(it.name);

    const seen = new Set();
    for (const af of it.affixes) {
      if (af.fixed) continue;
      const def = AFFIX_BY_NAME[af.name];
      if (!def) continue;
      if (!def.slots.includes(it.slot)) problems.wrongSlot.push(`${af.name} on ${it.slot}`);
      if (def.ilvl > it.ilvl) problems.overGate.push(`${af.name}(req ${def.ilvl}) on ilvl ${it.ilvl}`);
      const k = af.mod || af.elem;
      if (seen.has(k)) problems.dupMod.push(`${it.name}: ${k}`);
      seen.add(k);
    }
  }

  const pct = (k) => +(counts[k] / n * 100).toFixed(2);
  const avg = (a) => a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : 0;
  return {
    sample: n,
    distribution: { unique: pct('unique'), rare: pct('rare'), magic: pct('magic'), normal: pct('normal') },
    expected: { unique: '~0.6-0.9', rare: '~6-9', magic: '~27-40', normal: 'rest' },
    magicAffixes: { avg: avg(affixCount.magic), min: Math.min(...affixCount.magic), max: Math.max(...affixCount.magic) },
    rareAffixes: { avg: avg(affixCount.rare), min: Math.min(...affixCount.rare), max: Math.max(...affixCount.rare) },
    uniquesSeen: uniquesSeen.size, uniquesDefined: UNIQUES.length,
    problems: {
      wrongSlot: problems.wrongSlot.length, overGate: problems.overGate.length,
      noName: problems.noName.length, badDmg: problems.badDmg.length, dupMod: problems.dupMod.length,
      samples: {
        wrongSlot: problems.wrongSlot.slice(0, 4), overGate: problems.overGate.slice(0, 4),
        dupMod: problems.dupMod.slice(0, 4),
      },
    },
  };
};

// Magic find must actually raise the rare and unique rates.
window.__mfCheck = () => {
  const run = (mf) => {
    const rng = new Rng(777);
    let rare = 0, uniq = 0;
    for (let i = 0; i < 20000; i++) {
      const it = rollItem(rng, 12, { mf });
      if (it.rarity === 'rare') rare++;
      if (it.rarity === 'unique') uniq++;
    }
    return { rare: +(rare / 200).toFixed(2), unique: +(uniq / 200).toFixed(2) };
  };
  const a = run(0), b = run(200);
  return { mf0: a, mf200: b, rareImproved: b.rare > a.rare, uniqueImproved: b.unique > a.unique };
};

// ------------------------------------------------------------------ drawing

const rng = new Rng(9);
const showcase = [];
for (const b of BASES) {
  showcase.push(rollItem(rng, 14, { slot: b.slot, rarity: 'normal', tier: b.tier }) || null);
}
const fancy = [];
for (let i = 0; i < 10; i++) fancy.push(rollItem(rng, 14, { rarity: 'magic' }));
for (let i = 0; i < 10; i++) fancy.push(rollItem(rng, 14, { rarity: 'rare' }));
for (const u of UNIQUES) {
  const it = rollItem(rng, u.ilvl + 2, { rarity: 'unique', slot: null });
  if (it) fancy.push(it);
}

ctx.fillStyle = '#141219';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.font = '12px Georgia, serif';

let x = 12, y = 26;
ctx.fillStyle = '#c8b070';
ctx.fillText('every base kind', 12, 16);
const uniqueKinds = [];
for (const b of BASES) {
  if (uniqueKinds.some((k) => k.kind === b.kind)) continue;
  uniqueKinds.push(b);
}
for (const b of uniqueKinds) {
  const it = rollItem(rng, 14, { baseId: b.id, rarity: 'normal' });
  if (!it) continue;
  const ic = iconFor(it);
  if (x + ic.width > canvas.width - 20) { x = 12; y += 90; }
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(x, y, ic.width, ic.height);
  ctx.drawImage(ic, x, y);
  ctx.fillStyle = '#7f7663';
  ctx.fillText(b.name.slice(0, 12), x, y + ic.height + 11);
  x += ic.width + 14;
}
for (const p of POTIONS) {
  const it = makePotion(p.id);
  const ic = iconFor(it);
  if (x + ic.width > canvas.width - 20) { x = 12; y += 90; }
  ctx.drawImage(ic, x, y);
  x += ic.width + 14;
}
{
  const ic = iconFor(makeGold(500));
  ctx.drawImage(ic, x, y);
}

// Tooltips, so rarity colouring and requirement text can be checked.
y += 110;
ctx.fillStyle = '#c8b070';
ctx.fillText('rolled items', 12, y - 8);
let col = 0, rowY = y;
for (const it of fancy.slice(0, 24)) {
  if (!it) continue;
  const lines = describe(it);
  const bx = 12 + col * 250;
  let by = rowY;
  const ic = iconFor(it);
  ctx.drawImage(ic, bx, by, ic.width * 0.7, ic.height * 0.7);
  by += 4;
  for (const l of lines) {
    ctx.fillStyle = l.colour;
    ctx.font = `${l.header ? 13 : 11}px Georgia, serif`;
    ctx.fillText(l.text.slice(0, 34), bx + 42, by);
    by += 13;
  }
  col++;
  if (col === 6) { col = 0; rowY += 150; }
}

console.log('[items] audit', window.__itemAudit(4000));
void RARITY_COLOUR;
