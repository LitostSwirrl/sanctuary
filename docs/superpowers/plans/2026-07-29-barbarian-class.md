# The Barbarian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second playable class — the Barbarian, melee, fourteen skills across Warcries/Combat/Masteries — selectable at New Game, with the Sorceress untouched.

**Architecture:** Everything class-shaped already exists (`CLASS_STATS`, `SKILLS`, the poser, the save carries `cls` since v1). This plan adds one figure spec, one stats row, fourteen skill entries, three new mechanics (melee skill path, timed player buffs, monster stun/fear/debuff), a passive-mastery fold in `recalc`, and a class-select step on the title. Spec: `docs/superpowers/specs/2026-07-29-barbarian-class-design.md`.

**Tech Stack:** Plain ES modules, Canvas 2D. No dependencies, no bundler, no framework.

## Global Constraints

- No image, audio or font files; no npm dependencies. ES modules with explicit `.js` extensions.
- No emoji anywhere in code, comments, UI text or commit messages.
- Run with `node serve.js` from the project root → `http://localhost:8231/index.html`. Never python http.server (no cache headers; a cached module once faked a failure).
- Verification is browser-driven with claude-in-chrome (Chrome DevTools MCP is blocked by a stale profile lock in this environment). A backgrounded tab throttles rAF to ~1 fps: always call `window.__forceLoad()` first, drive sim with `window.__step(1/60)` + `window.__render()`.
- New `SKILLS` entries are **appended after the Sorceress block, never inserted** — `bakeSkillIcon` falls back to array position for pips. Every new skill also sets an explicit `iconSeed`.
- Save format stays `v: 1`. No migration: `cls` has been stored since v1.
- Items stay classless. No left-hand slot, dual wield, weapon swap, Find Item/Potion, Leap Attack, Berserk, Natural Resistance, Grim Ward. No new audio (reuse swing/hit/cast); a synthesized shout is polish, only if trivially green.
- Commit after every task, Conventional Commits, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Skill formulas use the codebase convention: printed value at skill level 1, `+step*(l-1)` growth. `l` is effective level (hard points + gear) except synergies, which read hard points only via `allocatedPoints`.

---

### Task 1: The Barbarian figure

**Files:**
- Modify: `src/art/palette.js` (COLORS block, after the Sorceress entries)
- Modify: `src/art/figures.js` (`poseAngles`, `segments`, `FIGURE_SPECS`)

**Interfaces:**
- Consumes: existing `humanoid()`, `DEFAULT_BUILD`, `ramp`, `COLORS`.
- Produces: `FIGURE_SPECS.barbarian` → baked as `assets.figures.barbarian` with all five anims (idle 4, walk 8, attack 6, cast 6, death 8). `FIGURE_BAKE_STEPS` and the loading bar update automatically (both derive from `Object.keys(FIGURE_SPECS)`).

**Notes:** The `humanoid()` merge trap: `...over` spreads AFTER `build:`, so a spec's `build` replaces the merged one wholesale. Every existing spec therefore writes `{ ...DEFAULT_BUILD, ... }` itself — do the same. The axe is welded to the right forearm (`at()` rig like the sword; the staff's upright `shaft()` would kill the sweep), so mirrored facings read left-handed — accepted, the skeleton's sword already does this.

**Steps:**

- [ ] **Add palette ramps** to `COLORS` in `src/art/palette.js`, after the Sorceress block:

```js
  // Barbarian
  barbSkin:    '#d99a66',
  barbHide:    '#7a4f2e',
  barbFur:     '#8a6a48',
  barbTrim:    '#a8843a',
  barbHair:    '#4a2f1a',
```

- [ ] **Add the two-handed attack pose.** In `poseAngles` (`src/art/figures.js`), the `attack` branch becomes conditional on `spec.attackStyle`. Insert BEFORE the existing `else if (anim === 'attack')`:

```js
  } else if (anim === 'attack' && spec.attackStyle === 'twoHand') {
    // Both arms drive the swing; the peak still lands on frame 3 of 6.
    let sw;
    if (t < 0.33) sw = lerp(0, -1.35, ease(t / 0.33));
    else if (t < 0.5) sw = lerp(-1.35, 1.55, ease((t - 0.33) / 0.17));
    else sw = lerp(1.55, 0, ease((t - 0.5) / 0.5));
    p.shoulderR = sw;
    p.shoulderL = sw * 0.85;
    p.armUpR = sw < 0 ? -sw * 0.9 : 0;
    p.armUpL = sw < 0 ? -sw * 0.7 : 0;
    p.elbowR = 0.25 + Math.max(0, -sw) * 0.6;
    p.elbowL = 0.45 + Math.max(0, -sw) * 0.5;
    p.armOutL = 0.3; p.armOutR = -0.1;
    p.twist = -sw * 0.42;
    p.lean += Math.max(0, sw) * 0.18 - Math.max(0, -sw) * 0.1;
    p.hipL = 0.24; p.hipR = -0.2;
    p.kneeL = 0.22; p.kneeR = 0.3;
    p.bob = -Math.abs(sw) * 0.8;
  } else if (anim === 'attack') {
```

- [ ] **Add the greataxe rig and left-hand snap** in `segments`. At the TOP of `segments` (before the leg loop), snap the left hand onto the haft so both arms read as gripping:

```js
  // A two-handed weapon is held in both hands: pull the left hand onto the
  // haft below the right. Mutating the joint here means the left forearm
  // capsule drawn later already points at the grip.
  if (spec.weapon === 'greataxe') {
    const A = j.armR;
    const dxw = A.hand[0] - A.elbow[0], dyw = A.hand[1] - A.elbow[1], dzw = A.hand[2] - A.elbow[2];
    const lw = Math.hypot(dxw, dyw, dzw) || 1;
    j.armL.hand = [
      A.hand[0] - (dxw / lw) * 4 * S,
      A.hand[1] - (dyw / lw) * 4 * S + 1.5 * S,
      A.hand[2] - (dzw / lw) * 4 * S,
    ];
  }
```

Then in the weapon block (`if (W && W !== 'none')`), add a branch alongside `sword`:

```js
    } else if (W === 'greataxe') {
      // Long haft carried on the forearm line, wedge head near the top.
      const a1 = at(-4), a2 = at(17);
      add('capsule', [a1, a2, 1.7 * S, 1.4 * S], R.wood || R.cloth2, dep(a1, a2) + 0.6);
      const hp = at(13);
      // Blade: a fat-to-thin capsule swept out to the side reads as a wedge.
      const tip = [hp[0], hp[1] + 5.5 * S, hp[2] + 1 * S];
      add('capsule', [hp, tip, 3.4 * S, 0.8 * S], R.metal, dep(hp, tip) + 0.65);
      // Back spike for silhouette.
      const spk = [hp[0], hp[1] - 2.6 * S, hp[2] + 0.5 * S];
      add('capsule', [hp, spk, 1.6 * S, 0.5 * S], R.metal, dep(hp, spk) + 0.64);
    }
```

- [ ] **Add the figure spec** to `FIGURE_SPECS`, after `sorceress`:

```js
  barbarian: humanoid({
    palette: {
      skin: COLORS.barbSkin, cloth: COLORS.barbHide, cloth2: COLORS.barbFur,
      trim: COLORS.barbTrim, hair: COLORS.barbHair, metal: COLORS.steel,
      wood: COLORS.wood, boot: COLORS.leather,
    },
    scale: 1.04,
    parts: { hair: true, bareArms: true, belt: true },
    weapon: 'greataxe',
    attackStyle: 'twoHand',
    build: {
      ...DEFAULT_BUILD,
      shoulder: 13, torsoR: 7.8, armR: 3.8, foreR: 3.2,
      upperArm: 11, foreArm: 10.5,
      chestU: 44, neckU: 47, headU: 52, headR: 6.8,
      thighR: 4.6, shinR: 3.6, hipSide: 5.5,
      hunch: -0.08, stance: 1.1,
    },
  }),
```

- [ ] **Browser check** (claude-in-chrome against serve.js). Load, then in console:
  - `(() => { const t0 = performance.now(); window.__forceLoad(); return Math.round(performance.now() - t0); })()` on a freshly reloaded page — full cold bake stays **under 450 ms**.
  - `window.__sheetFor('barbarian').has('cast')` → `true`; `window.__sheetFor('barbarian').canvas.width` → `640`.
  - Paste a sheet viewer to eyeball the sprite:

```js
(() => { const sh = window.__sheetFor('barbarian'); const c = document.createElement('canvas');
  c.width = sh.canvas.width; c.height = sh.canvas.height;
  c.style.cssText = 'position:fixed;top:0;left:0;z-index:99;background:#222;image-rendering:pixelated;width:1280px';
  c.getContext('2d').drawImage(sh.canvas, 0, 0); c.id = 'peek'; document.body.appendChild(c); return 'ok'; })()
```

  Screenshot it. Judge: broader than the Sorceress, chest-out, both hands on the axe during the attack rows, swing sweeps across the body, death topples. Remove with `document.getElementById('peek').remove()`. Console clean.
- [ ] Commit: `feat: the barbarian figure, posed and baked`

---

### Task 2: Class data and plumbing

**Files:**
- Modify: `src/game/combat.js` (CLASS_STATS)
- Modify: `src/game/skills.js` (CLASS_TREES, TREE_NAME, canAllocate)
- Modify: `src/ui/hud.js` (TREE_COLOUR, bakeSkillIcon glyphs)
- Modify: `src/ui/panels.js` (drawSkills per-class trees, drawCharacter conditional row)
- Modify: `src/game/npc.js` (class-aware greetings)
- Modify: `src/game/player.js` (buffs/mastery field init — inert until later tasks)
- Modify: `src/main.js` (newGame(cls), continueGame, populateTown call, __newGame(cls))

**Interfaces:**
- Consumes: `assets.figures.barbarian` (Task 1), `rollItem(rng, ilvl, { baseId, rarity, identified })` from `src/items/item.js`, `BASE_BY_ID.handaxe`.
- Produces: `CLASS_TREES = { sorceress: ['fire','cold','light'], barbarian: ['cries','combat','mastery'] }` (exported from skills.js); `TREE_NAME` entries `combat: 'Combat', cries: 'Warcries', mastery: 'Masteries'`; `newGame(cls)` and `window.__newGame(cls)`; `player.buffs = {}`, `player.masteryPoints = { axe: 0, mace: 0, sword: 0 }`, `player.ironSkinLevel = 0` initialised in the Player constructor before `recalc(true)`.

**Notes:** After this task a Barbarian is fully playable through `__newGame('barbarian')` with the plain left-click attack and his Hand Axe — no skills yet, so his right button is temporarily `'attack'` (Task 4 flips it to Bash). The tree panel shows his three named, empty columns.

**Steps:**

- [ ] **CLASS_STATS.barbarian** in `src/game/combat.js` (D2 Normal values; `stamina`/`blockBase` are the existing dead-field convention):

```js
  barbarian: {
    name: 'Barbarian',
    str: 30, dex: 20, vit: 25, ene: 10,
    life: 55, mana: 10, stamina: 92,
    lifePerVit: 4, manaPerEne: 1,
    lifePerLevel: 2, manaPerLevel: 1,
    lifePerVitLevel: 0, blockBase: 20,
  },
```

- [ ] **CLASS_TREES and the class gate** in `src/game/skills.js`. Next to the existing `TREES` export:

```js
export const CLASS_TREES = {
  sorceress: ['fire', 'cold', 'light'],
  barbarian: ['cries', 'combat', 'mastery'],
};
export const TREE_NAME = {
  fire: 'Fire', cold: 'Cold', light: 'Lightning',
  cries: 'Warcries', combat: 'Combat', mastery: 'Masteries',
};
```

In `canAllocate`, after the `if (!sk) ...` check (defence in depth — the panel never shows the other class's skills, this makes the rule hold even for console calls):

```js
  if (!CLASS_TREES[player.cls].includes(sk.tree)) return { ok: false, why: 'not of your class' };
```

- [ ] **Tree panel iterates the player's trees.** In `src/ui/panels.js` `drawSkills`: import `CLASS_TREES` (add to the existing skills.js import list), then replace `const colW = w / 3;` and `TREES.forEach((tree, ti) => {` with:

```js
    const trees = CLASS_TREES[player.cls];
    const colW = w / trees.length;
```
```js
    trees.forEach((tree, ti) => {
```

Remove `TREES` from the import if now unused. Everything below already guards with `if (!r) continue;` / `if (!a || !b) continue;`, so off-class skills simply do not render.

- [ ] **Icon glyphs for the three new trees.** In `src/ui/hud.js`:

```js
const TREE_COLOUR = {
  fire: '#ff7a30', cold: '#7ad0ff', light: '#b0c8ff',
  combat: '#d04a30', cries: '#e8a030', mastery: '#9aa8b8',
};
```

In `bakeSkillIcon`, the glyph chain currently ends in an `else` that draws the lightning bolt. Make lightning explicit and add three branches (same `rm`/`base` locals):

```js
  if (sk.tree === 'fire') {
    polyF(buf, [15, 3, 22, 14, 19, 26, 11, 26, 8, 14], packHex(base));
    ellipse(buf, 15, 19, 5, 6, ramp('#ffd060'));
  } else if (sk.tree === 'cold') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      capsule(buf, 15 - Math.cos(a) * 11, 15 - Math.sin(a) * 11, 1.6,
        15 + Math.cos(a) * 11, 15 + Math.sin(a) * 11, 1.6, rm);
    }
    ellipse(buf, 15, 15, 4, 4, ramp('#e8f8ff'));
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
```

(`rectF` is already imported in hud.js's pixel import; if not, add it.)

- [ ] **Character sheet row.** In `src/ui/panels.js` `drawCharacter`, replace `line('Faster Cast Rate', `${player.castRate}%`);` with:

```js
    if (player.cls === 'barbarian') line('Attack Speed', `${player.totals.ias}%`);
    else line('Faster Cast Rate', `${player.castRate}%`);
```

- [ ] **Class-aware greetings.** In `src/game/npc.js`, add to the `kashya` def:

```js
    greetingByClass: {
      barbarian: 'A barbarian of the north. Try not to die where my scouts have to carry you back.',
    },
```

and to the `akara` def (same mechanism; "Welcome, sister" is as class-blind as Kashya's line):

```js
    greetingByClass: {
      barbarian: 'Welcome, warrior. The Sightless Eye watches over you here.',
    },
```

`populateTown` gains a `cls` parameter and resolves the override onto the instance (talkTo already prefers `npc.greeting`):

```js
export function populateTown(level, cx, cy, figures, cls) {
  level.npcs = [];
  for (const def of NPCS) {
    const spot = level.nearestOpen(cx + def.at.dx, cy + def.at.dy, 8);
    const npc = new Npc(def, spot.x, spot.y, figures[def.figure]);
    if (def.greetingByClass && def.greetingByClass[cls]) npc.greeting = def.greetingByClass[cls];
    level.addEntity(npc);
    level.npcs.push(npc);
  }
  return level.npcs;
}
```

In `src/main.js` `getLevel`, pass it: `populateTown(lv, lv.townCentre.x, lv.townCentre.y, assets.figures, player.cls);`

- [ ] **Player field init.** In the `Player` constructor (`src/game/player.js`), just before `this.recalc(true);`:

```js
    this.buffs = {};                                   // id -> { t, mag }, ticked in update
    this.masteryPoints = { axe: 0, mace: 0, sword: 0 }; // written by refreshPassives
    this.ironSkinLevel = 0;
```

(Inert until Tasks 6–7; initialised now so `recalc` can read them unguarded later.)

- [ ] **newGame(cls) and continueGame.** In `src/main.js`, add `rollItem` to the imports from `./items/item.js` (next to `makeGold`) and `CLASS_TREES` is not needed here. Replace `newGame` and the Player line of `continueGame`:

```js
function newGame(cls = 'sorceress') {
  seed = (Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  rng = new Rng(seed);
  levels.clear();
  corpse = null;
  player = new Player({ x: 0, y: 0, cls, sheet: assets.figures[cls] });
  // The point that pays for the skill bound to the right button at the start.
  // Without it `allocate` refuses and the new character's right click is dead.
  player.skillPoints = 1;
  if (cls === 'barbarian') {
    // His firebolt-point is an axe in the hand rather than a skill point spent.
    player.equipment.weapon = rollItem(rng, 1, { baseId: 'handaxe', rarity: 'normal', identified: true });
    player.rightSkill = 'attack';
    player.leftSkill = 'attack';
  } else {
    allocate(player, 'firebolt');
    player.rightSkill = 'firebolt';
    player.leftSkill = 'attack';
  }
  player.gold = 80;
  refreshPassives(player);
  player.recalc(true);
  enterArea('town', null, true);
  state = 'playing';
  save(game);
}
```

(Task 4 replaces the barbarian branch's binding with `allocate(player, 'bash'); player.rightSkill = 'bash';` once Bash exists. The skill point is granted either way.)

```js
  player = new Player({ x: 0, y: 0, cls: d.cls || 'sorceress', sheet: assets.figures[d.cls || 'sorceress'] });
```

- [ ] **Test hook.** `window.__newGame = (cls) => { newGame(cls); return areaId; };`
- [ ] **Browser check:**
  - `__forceLoad(); __newGame('barbarian')` → `'town'`. Then `(() => { const p = window.__g.player; return { cls: p.cls, hp: p.maxHp, mana: p.maxMana, wpn: p.equipment.weapon.name, gold: p.gold, pts: p.skillPoints }; })()` → `{ cls: 'barbarian', hp: 55, mana: 10, wpn: 'Hand Axe', gold: 80, pts: 1 }`.
  - Screenshot: the Barbarian stands in the encampment holding the greataxe; orbs read 55/10.
  - Open the skill tree (T): three columns titled Warcries / Combat / Masteries, empty. Character sheet (C): `Attack Speed 0%`, Damage reflects the Hand Axe (3-6).
  - Walk to Kashya and Akara: barbarian greetings, not "Another sorceress." / "Welcome, sister."
  - Left-click a monster in the moor: he swings, damage floats or `miss` appears, monsters die.
  - `__newGame('sorceress')` → sheet says Faster Cast Rate, Fire Bolt bound right, three sorc columns. `window.__g.player.skills` → `{ firebolt: 1 }`.
  - Console clean throughout. (The `canAllocate` class gate gets its real exercise in Task 4, once the Barbarian has skills of his own to allocate.)
- [ ] Commit: `feat: class data, plumbing and a playable classless-skill barbarian`

---

### Task 3: Class select on the title

**Files:**
- Modify: `src/main.js` (drawTitle, the pointerdown handler, the title branch in step)

**Interfaces:**
- Consumes: `newGame(cls)` (Task 2), `assets.figures[cls]` sheets (Task 1).
- Produces: `titleStep` module-level state (`'menu' | 'class'`); title click ids `'sorceress'` / `'barbarian'` in `titleAreas`.

**Steps:**

- [ ] **State and drawing.** Add `let titleStep = 'menu';` next to `titleAreas`. In `drawTitle`, after the header text, branch:

```js
  if (titleStep === 'class') { drawClassSelect(cx, cy, s); return; }
```

and add:

```js
const CLASS_CARDS = [
  { id: 'sorceress', name: 'Sorceress', line: 'Fire, ice and lightning, from a safe distance.' },
  { id: 'barbarian', name: 'Barbarian', line: 'Thirty pounds of steel, from no distance at all.' },
];

function drawClassSelect(cx, cy, s) {
  titleAreas = [];
  const w = 240 * s, h = 250 * s, gap = 40 * s;
  CLASS_CARDS.forEach((c, i) => {
    const x = cx - w - gap / 2 + i * (w + gap), y = cy - h / 2 + 30 * s;
    const hov = Input.mouse.x >= x && Input.mouse.x < x + w && Input.mouse.y >= y && Input.mouse.y < y + h;
    panel(ctx2d, x, y, w, h, { border: hov ? '#c8a03a' : '#5a4f36' });
    // Portrait: the baked idle sprite, scaled with hard pixels.
    const sheet = assets.figures[c.id];
    const ix = sheet.index('idle', 2, 0);
    const ps = 140 * s;
    ctx2d.save();
    ctx2d.imageSmoothingEnabled = false;
    ctx2d.drawImage(sheet.canvas, ix.sx, ix.sy, 80, 80, x + (w - ps) / 2, y + 18 * s, ps, ps);
    ctx2d.restore();
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = hov ? '#ffe08a' : '#c8b070';
    ctx2d.font = `${Math.round(20 * s)}px Georgia, serif`;
    ctx2d.fillText(c.name, x + w / 2, y + h - 54 * s);
    ctx2d.fillStyle = '#8a7f6a';
    ctx2d.font = `${Math.round(12 * s)}px Georgia, serif`;
    ctx2d.fillText(c.line, x + w / 2, y + h - 32 * s);
    titleAreas.push({ x, y, w, h, id: c.id });
  });
  ctx2d.fillStyle = '#6a6050';
  ctx2d.font = `${Math.round(12 * s)}px Georgia, serif`;
  ctx2d.textAlign = 'center';
  ctx2d.fillText('Esc to go back', cx, cy + h / 2 + 52 * s);
  ctx2d.textAlign = 'left';
}
```

- [ ] **Input routing.** In the pointerdown handler, replace `if (a.id === 'new') newGame(); else continueGame(); audio.ambient(level);` with:

```js
      if (a.id === 'new') { titleStep = 'class'; return; }
      if (a.id === 'continue') { continueGame(); audio.ambient(level); return; }
      newGame(a.id);                       // 'sorceress' | 'barbarian'
      audio.ambient(level);
      return;
```

In `step`, before the `if (state !== 'playing' && state !== 'won')` early return:

```js
  if (state === 'title') {
    if (titleStep === 'class' && Input.consume('Escape')) titleStep = 'menu';
    Input.endFrame();
    return;
  }
```

Also reset `titleStep = 'menu'` inside `newGame` and `continueGame` (so dying back to title later starts at the menu).

- [ ] **Browser check:** reload, `__forceLoad()`. Title shows Continue (a save exists) + New Game. Click New Game → two cards, hard-pixel portraits, flavour lines. Esc → back to menu. New Game → click Barbarian → spawns in town as the Barbarian; the save is now his. Reload → Continue → still the Barbarian (Continue never asks — the save knows). Screenshot the card screen. Console clean.
- [ ] Commit: `feat: the title asks a question it never asked before`

---

### Task 4: The melee skill path, and the Combat strikes

**Files:**
- Modify: `src/game/combat.js` (monsterDefense helper)
- Modify: `src/game/skills.js` (melee helpers + Bash, Double Swing, Concentrate appended to SKILLS)
- Modify: `src/main.js` (doCast melee branch, newGame binds Bash, playerAttack uses monsterDefense)

**Interfaces:**
- Consumes: `rollHit`, `rollDamage` from combat.js (new import into skills.js — no cycle, combat imports nothing).
- Produces: in combat.js — `monsterDefense(m)` (defence after Battle Cry's debuff; the debuff itself arrives in Task 6, the helper is total-safe now). In skills.js (module-local, used by Tasks 5–6 skills too): `weaponHit(caster, m, ctx, { ed, ar, mul })` → damage dealt or 0 on miss; `meleeStrike(caster, tx, ty, ctx, onHit)` → boolean (false = veto, castSkill refunds); `knockback(level, m, fromX, fromY, dist)`. Skill entries `bash`, `doubleswing`, `concentrate` with `melee: true`.

**Notes:** Mana is validated and paid up front through `castSkill` exactly as today — a melee `cast()` returning `false` (no target in reach) hits the existing veto-and-refund path. The strike sets its own animation and `busy = 0.42 / attackSpeed` (the `playerAttack` timing); `doCast` merely skips the caster lockout and cast animation for `melee: true` skills.

**Steps:**

- [ ] **monsterDefense** in `src/game/combat.js`, next to `defenseFrom`:

```js
// Defence as the to-hit roll should see it: Battle Cry (task 6) halves it.
export function monsterDefense(m) {
  return Math.floor(m.defense * (m.battlecry ? m.battlecry.def : 1));
}
```

- [ ] **Melee helpers** in `src/game/skills.js`. Imports at top:

```js
import { rollHit, rollDamage, monsterDefense } from './combat.js';
```

Helpers in the helpers section:

```js
// ------------------------------------------------------------------- melee

// One weapon blow with a skill's bonuses folded in. Mastery ED/AR are already
// inside minDamage/maxDamage/attackRating via recalc; skill ED stacks on top.
function weaponHit(caster, m, ctx, { ed = 0, ar = 0, mul = 1 } = {}) {
  if (!rollHit(ctx.rng, caster.attackRating + ar, monsterDefense(m), caster.level, m.mlvl)) {
    ctx.fx.float(m.x, m.y, 'miss', 'rgba(190,190,190,1)');
    return 0;
  }
  const raw = rollDamage(ctx.rng, caster.minDamage, caster.maxDamage,
    caster.totals.ed + ed, caster.effective.str) * mul;
  return ctx.damageMonster(m, { phys: raw }, { source: caster });
}

function knockback(level, m, fromX, fromY, dist) {
  const dx = m.x - fromX, dy = m.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  m.moveBy((dx / d) * dist, (dy / d) * dist, level);
}

// The two-handed axe reaches a little past the bare-hand attack's 1.6/1.7.
const MELEE_REACH = 1.9;

function meleeTarget(ctx, caster, tx, ty) {
  let best = null, bd = 1.3;                    // nearest to the click...
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = Math.hypot(e.x - tx, e.y - ty);
    if (d < bd) { bd = d; best = e; }
  }
  if (best && caster.distTo(best) <= MELEE_REACH) return best;
  best = null; bd = MELEE_REACH;                // ...else nearest in reach.
  for (const e of ctx.level.entities) {
    if (!e.alive || e.isPlayer || e.isNpc) continue;
    const d = caster.distTo(e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Swing at whatever the click meant. Returns false — veto, mana refunded —
// when nothing is in reach. The effect runs in the hit-frame callback on
// frame 3, exactly like the plain attack.
function meleeStrike(caster, tx, ty, ctx, onHit) {
  const target = meleeTarget(ctx, caster, tx, ty);
  if (!target) return false;
  caster.stop();
  caster.busy = 0.42 / caster.attackSpeed;
  caster.face(target.x, target.y);
  if (ctx.sfx) ctx.sfx('swing');
  caster.setAnim('attack', {
    loop: false, force: true, hitFrame: 3,
    onHitFrame: () => { if (target.alive && caster.distTo(target) <= MELEE_REACH + 0.2) onHit(target); },
    onEnd: () => caster.setAnim('idle'),
  });
  return true;
}
```

- [ ] **Three Combat entries**, appended to `SKILLS` after `lightmastery` (a new `// BARBARIAN` section comment; Task 5–7 entries join this block):

```js
  // -------------------------------------------------------- BARBARIAN COMBAT
  {
    id: 'bash', name: 'Bash', tree: 'combat', req: 1, prereq: [], melee: true, iconSeed: 0,
    mana: () => 2,
    blurb: 'A crushing blow that sends the target staggering back.',
    effect: (l) => `+${50 + 8 * (l - 1)}% Damage, +${20 + 5 * (l - 1)} Attack Rating, knocks back`,
    cast(caster, lvl, tx, ty, ctx) {
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        const dealt = weaponHit(caster, target, ctx, { ed: 50 + 8 * (lvl - 1), ar: 20 + 5 * (lvl - 1) });
        if (dealt > 0 && target.alive) knockback(ctx.level, target, caster.x, caster.y, 0.7);
      });
    },
  },
  {
    id: 'doubleswing', name: 'Double Swing', tree: 'combat', req: 6, prereq: ['bash'], melee: true, iconSeed: 1,
    mana: () => 1,
    blurb: 'One swing for the target, one for whoever stands beside it.',
    effect: (l) => `Two hits, +${15 + 5 * (l - 1)} Attack Rating each`,
    cast(caster, lvl, tx, ty, ctx) {
      const ar = 15 + 5 * (lvl - 1);
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        weaponHit(caster, target, ctx, { ar });
        let other = null, od = MELEE_REACH + 0.2;
        for (const e of ctx.level.entities) {
          if (!e.alive || e.isPlayer || e.isNpc || e === target) continue;
          const d = caster.distTo(e);
          if (d < od) { od = d; other = e; }
        }
        if (other) weaponHit(caster, other, ctx, { ar });
      });
    },
  },
  {
    id: 'concentrate', name: 'Concentrate', tree: 'combat', req: 18, prereq: ['bash'], melee: true, iconSeed: 3,
    mana: () => 2,
    synergies: [{ id: 'bash', pct: 5 }],
    blurb: 'A deliberate, heavy blow. Bash practice makes it heavier.',
    effect: (l) => `+${60 + 10 * (l - 1)}% Damage, +${30 + 5 * (l - 1)} Attack Rating`,
    cast(caster, lvl, tx, ty, ctx) {
      // Synergy reads hard points, matching every other synergy in the file.
      const ed = 60 + 10 * (lvl - 1) + 5 * allocatedPoints(caster, 'bash');
      return meleeStrike(caster, tx, ty, ctx, (target) => {
        weaponHit(caster, target, ctx, { ed, ar: 30 + 5 * (lvl - 1) });
      });
    },
  },
```

(Note: `synergies` on Concentrate makes `describeSkill` list the synergy line; the % is applied through the explicit `ed` computation, not `damageMult` — melee skills have no `damage()` for `damageMult` to multiply.)

- [ ] **doCast melee branch** in `src/main.js`. Import `SKILL_BY_ID` alongside `castSkill`:

```js
function doCast(id, tx, ty) {
  if (!id || id === 'attack') return false;
  const r = castSkill(player, id, tx, ty, gctx);
  if (r === 'mana') { ui.say('Not enough mana'); audio.sfx('error'); return false; }
  if (r !== 'ok') return false;
  const sk = SKILL_BY_ID[id];
  if (!sk.melee) {
    // Casts take the cast animation and the FCR lockout. A melee skill has
    // already set its own attack animation and weapon-speed busy inside cast().
    player.busy = 0.4 / (1 + player.castRate / 100);
    player.face(tx, ty);
    audio.sfx('cast');
    player.setAnim('cast', { loop: false, force: true, onEnd: () => player.setAnim('idle') });
  }
  return true;
}
```

- [ ] **playerAttack honesty**: in `playerAttack`'s `onHitFrame`, replace `target.defense` with `monsterDefense(target)` (import it with the other combat.js imports). Same formula until Battle Cry exists; needed so plain attacks respect the debuff from Task 6.
- [ ] **newGame binds Bash**: in the barbarian branch of `newGame`, replace `player.rightSkill = 'attack';` with:

```js
    allocate(player, 'bash');
    player.rightSkill = 'bash';
```

- [ ] **Browser check:**
  - `__forceLoad(); __newGame('barbarian')`. HUD right button shows the Bash icon with mana cost 2. `window.__g.player.skills` → `{ bash: 1 }`.
  - Walk into the moor. Right-click on a monster: swing animation, damage float bigger than plain attacks, the monster shifts back on hit. Right-click empty ground far from anything: nothing happens and `window.__g.player.mana` unchanged (veto-and-refund).
  - Mana check: `window.__g.player.mana = 1` then right-click a monster → "Not enough mana".
  - Tree: allocate points into Bash via the panel; tooltip shows growing ED/AR. Double Swing gated until level 6 + Bash; `(() => { const { player } = window.__g; player.level = 6; player.skillPoints = 2; return 'ok'; })()` then allocate Double Swing, bind it (right-click its icon), swing at a pack — two damage floats on one swing when two monsters stand together.
  - Class gate: on the Barbarian, from the console the panel never offers Fire Bolt; open the skill tree and confirm only his three trees render. On a fresh `__newGame('sorceress')` the reverse.
  - Console clean.
- [ ] Commit: `feat: the melee skill path, with bash, double swing and concentrate`

---

### Task 5: Leap and Whirlwind

**Files:**
- Modify: `src/game/player.js` (the action hook in update)
- Modify: `src/render/renderer.js` (zOff draw offset, one line)
- Modify: `src/game/skills.js` (leap, whirlwind appended; applyStun helper stub used fully in Task 6)
- Modify: `src/main.js` (clear action on enterArea and death)

**Interfaces:**
- Consumes: melee helpers from Task 4 (`weaponHit`), `nearestOpen`/`blockedCircle` on the level.
- Produces: `player.action` — `null` or `(dt) => boolean` ticked at the top of `Player.update` (returns true when finished); `e.zOff` — optional vertical draw offset in sprite pixels, honoured by `drawEntity`; skills.js-local `applyStun(m, seconds)` (respects `m.def.boss`); skill entries `leap`, `whirlwind` (both `melee: true` so doCast leaves their animation alone).

**Steps:**

- [ ] **The action hook.** In `Player.update` (`src/game/player.js`), after the `if (!this.alive)` early return and before the `busy` block:

```js
    // A skill that owns the body for a moment: Leap's flight, Whirlwind's
    // travel. Ticks even while busy; clears itself when done.
    if (this.action && this.action(dt)) this.action = null;
```

- [ ] **zOff in the renderer.** In `drawEntity` (`src/render/renderer.js`):

```js
    const dy = s.y - e.sheet.footY * z - (e.zOff || 0) * z;
```

(The shadow keeps drawing at ground position — correct for a jump.)

- [ ] **applyStun** helper in skills.js (full consumer wiring lands in Task 6; the field write is safe now):

```js
// Bosses are immune to fear and stun, as monsters are to neither chill nor
// Static Field today.
function applyStun(m, seconds) {
  if (!m.alive || m.def.boss) return;
  m.stunned = Math.max(m.stunned || 0, seconds);
}
```

- [ ] **Leap and Whirlwind entries**, appended after `concentrate`:

```js
  {
    id: 'leap', name: 'Leap', tree: 'combat', req: 6, prereq: [], melee: true, iconSeed: 2,
    mana: () => 3,
    blurb: 'Jump to a point. The landing throws everything nearby off its feet.',
    effect: (l) => `Range ${(5 + 0.25 * (l - 1)).toFixed(2)} tiles, stuns ${(0.4 + 0.05 * (l - 1)).toFixed(2)}s on landing`,
    cast(caster, lvl, tx, ty, ctx) {
      const range = 5 + 0.25 * (lvl - 1);
      const d = Math.hypot(tx - caster.x, ty - caster.y);
      let gx = tx, gy = ty;
      if (d > range) { gx = caster.x + (tx - caster.x) / d * range; gy = caster.y + (ty - caster.y) / d * range; }
      const spot = ctx.level.nearestOpen(gx, gy, 4);
      if (ctx.level.blockedCircle(spot.x, spot.y, caster.radius)) return false;
      const from = { x: caster.x, y: caster.y };
      const dur = 0.45;
      let t = 0;
      caster.stop();
      caster.busy = dur + 0.1;
      caster.face(spot.x, spot.y);
      caster.setAnim('walk', { fps: 15 });
      if (ctx.sfx) ctx.sfx('swing');
      caster.action = (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        // Position ignores walls: a leap crosses what walking cannot. Only
        // the landing point was validated.
        caster.x = from.x + (spot.x - from.x) * k;
        caster.y = from.y + (spot.y - from.y) * k;
        caster.zOff = Math.sin(k * Math.PI) * 26;
        if (k < 1) return false;
        caster.zOff = 0;
        caster.setAnim('idle', { force: true });
        const stun = 0.4 + 0.05 * (lvl - 1);
        for (const e of ctx.level.entities) {
          if (!e.alive || e.isPlayer || e.isNpc) continue;
          if (Math.hypot(e.x - caster.x, e.y - caster.y) > 1.5 + e.radius) continue;
          knockback(ctx.level, e, caster.x, caster.y, 1.0);
          applyStun(e, stun);
        }
        ctx.fx.ring(caster.x, caster.y, { maxR: 1.6, cr: 200, cg: 180, cb: 140, life: 0.3, w: 3, lit: 1 });
        ctx.fx.burst('dust', caster.x, caster.y, 14, { z: 4, spread: 2.2, r: 150, g: 130, b: 100, life: 0.5 });
        if (ctx.sfx) ctx.sfx('hit');
        return true;
      };
      return true;
    },
  },
  {
    id: 'whirlwind', name: 'Whirlwind', tree: 'combat', req: 24, prereq: ['concentrate'], melee: true, iconSeed: 4,
    mana: () => 12,
    blurb: 'Become the storm. Travel, and everything on the way is hit.',
    effect: (l) => `${-50 + 10 * (l - 1)}% Damage per hit, a hit every 0.15s en route`,
    cast(caster, lvl, tx, ty, ctx) {
      const dx = tx - caster.x, dy = ty - caster.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.5) return false;
      const ux = dx / d, uy = dy / d;
      const dist = Math.min(7, d);
      const speed = 7.5;
      const dur = dist / speed;
      const ed = -50 + 10 * (lvl - 1);
      let t = 0, hitT = 0, spinT = 0;
      caster.stop();
      caster.busy = dur + 0.05;
      caster.setAnim('attack', { fps: 20 });        // looping spin
      if (ctx.sfx) ctx.sfx('swing');
      const finish = () => { caster.setAnim('idle', { force: true }); caster.busy = 0.1; return true; };
      caster.action = (dt) => {
        t += dt; hitT += dt; spinT += dt;
        if (spinT > 0.07) { spinT = 0; caster.dir = (caster.dir + 1) % 8; }
        const moved = caster.moveBy(ux * speed * dt, uy * speed * dt, ctx.level);
        while (hitT >= 0.15) {
          hitT -= 0.15;
          for (const e of ctx.level.entities) {
            if (!e.alive || e.isPlayer || e.isNpc) continue;
            if (Math.hypot(e.x - caster.x, e.y - caster.y) > 1.5 + e.radius) continue;
            weaponHit(caster, e, ctx, { ed });
          }
        }
        // Stopping early at the first blocked tile is the D2 behaviour.
        if (!moved || t >= dur) return finish();
        return false;
      };
      return true;
    },
  },
```

- [ ] **Interruption hygiene** in `src/main.js`: in `enterArea`, next to `player.stop()`, add `player.action = null; player.busy = 0; player.zOff = 0;`. In `die()`, add `player.action = null; player.zOff = 0;`.
- [ ] **Browser check:**
  - `__forceLoad(); __newGame('barbarian')`, then `(() => { const p = window.__g.player; p.level = 24; p.skillPoints = 6; return 'ok'; })()`; allocate Leap (and Bash→Concentrate→Whirlwind chain).
  - Bind Leap right. Right-click across a low bank: he arcs (visibly lifts off the ground), lands where aimed, dust ring, monsters at the landing shoved and briefly frozen mid-AI (they stand still — full stun gate lands in Task 6; here confirm the knockback and the `stunned` field: click a leap onto a pack, then `window.__g.level.entities.filter(e => e.stunned > 0).length` > 0). Right-click INTO a wall mass: he refuses (no mana spent).
  - Bind Whirlwind. Right-click through a pack: he travels in a line, spins through facings, damage floats tick along the route, stops at walls. `window.__g.player.mana` dropped by 12.
  - Walk between areas mid-whirlwind is impossible (busy), but die mid-leap → resurrect cleanly (no stuck zOff): force with `window.__g.player.hp = 0` mid-flight if reproducible, else skip.
  - Console clean.
- [ ] Commit: `feat: leap and whirlwind move the barbarian the way teleport moves her`

---

### Task 6: Monster stun, fear, Battle Cry — and the five Warcries

**Files:**
- Modify: `src/game/monster.js` (field init)
- Modify: `src/game/ai.js` (stun gate, battlecry tick, bolt damage debuff)
- Modify: `src/game/player.js` (buff tick in update, buff folds in recalc)
- Modify: `src/game/skills.js` (five Warcries appended)
- Modify: `src/main.js` (Monster.rollDamage debuff — no: it lives in monster.js; see step)

**Interfaces:**
- Consumes: `applyStun` (Task 5), the existing flee machinery (`state = 'flee'`, `fleeTimer` — what champions already use when their leader dies), `monsterDefense` (Task 4, already read by every player to-hit roll).
- Produces: `m.stunned` (seconds; AI takes no action, movement stops), `m.battlecry = { def: 0.5, dmg: 0.75, t }`; `player.buffs = { id: { t, mag } }` ticked in `Player.update`, folded in `recalc` (`shout` → defence multiplier, `battleorders` → max life/mana percentage); skill entries `howl`, `shout`, `battlecry`, `battleorders`, `warcry`.

**Notes:** All warcries are instant, centred on the Barbarian, and take the ordinary cast path and animation (the symmetric two-arm gesture reads as a shout) — no `melee` flag. Warcries do not roll to-hit (D2 behaviour). Bosses (`def.boss`) are immune to fear and stun, but not to Battle Cry.

**Steps:**

- [ ] **Monster fields**: in the `Monster` constructor (`src/game/monster.js`), next to `this.state = 'idle';`:

```js
    this.stunned = 0;
    this.battlecry = null;      // { def, dmg, t } while Battle Cry holds
```

And in `rollDamage`:

```js
  rollDamage(rng) {
    const mul = this.battlecry ? this.battlecry.dmg : 1;
    return (this.dmgMin + rng.f() * (this.dmgMax - this.dmgMin)) * mul;
  }
```

- [ ] **AI gates** in `src/game/ai.js` `updateAI`, directly after the `if (m.frozen > 0)` line:

```js
  if (m.stunned > 0) { m.stunned -= dt; m.setAnim('idle'); m.updateAnim(dt); return; }
  if (m.battlecry && (m.battlecry.t -= dt) <= 0) m.battlecry = null;
```

And in `fireBolt`, scale the ranged damage by the debuff — the `min`/`max` lines become:

```js
    min: b.min * (1 + (m.mlvl - 1) * 0.3) * (m.battlecry ? m.battlecry.dmg : 1),
    max: b.max * (1 + (m.mlvl - 1) * 0.3) * (m.battlecry ? m.battlecry.dmg : 1),
```

- [ ] **Buff tick** in `Player.update` (`src/game/player.js`), right after `this.updateStatus(dt);`:

```js
    let buffExpired = false;
    for (const id in this.buffs) {
      this.buffs[id].t -= dt;
      if (this.buffs[id].t <= 0) { delete this.buffs[id]; buffExpired = true; }
    }
    if (buffExpired) this.recalc();   // clamps life and mana to the lowered max
```

- [ ] **Buff folds in recalc.** In `recalc`, the max life/mana lines gain Battle Orders and the defence line gains Shout (Iron Skin's slot goes in too, reading the Task 2-initialised field — it stays 0 until Task 7):

```js
    const bo = this.buffs.battleorders;
    const boPct = bo ? bo.mag : 0;
    this.maxHp = maxLifeFor(this.cls, this.level, vit, t.life, t.lifePct + boPct);
    this.maxMana = maxManaFor(this.cls, this.level, ene, t.mana, t.manaPct + boPct);
```

```js
    const armour = t.def * (1 + t.defPct / 100);
    let def = defenseFrom(dex, armour);
    if (this.ironSkinLevel > 0) def *= 1 + (30 + 10 * (this.ironSkinLevel - 1)) / 100;
    if (this.buffs.shout) def *= 1 + this.buffs.shout.mag / 100;
    this.defense = Math.floor(def);
```

(Existing clamp logic already handles expiry: when max drops, `Math.min(hp + 0, maxHp)` pulls current down.)

- [ ] **Five Warcries** appended to `SKILLS` after `whirlwind`:

```js
  // ------------------------------------------------------- BARBARIAN WARCRIES
  {
    id: 'howl', name: 'Howl', tree: 'cries', req: 1, prereq: [], iconSeed: 0,
    mana: () => 4,
    blurb: 'A shout that sends lesser enemies running.',
    effect: (l) => `Monsters within 4 tiles flee for ${(3 + 0.4 * (l - 1)).toFixed(1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      const dur = 3 + 0.4 * (lvl - 1);
      ctx.fx.ring(caster.x, caster.y, { maxR: 4, cr: 232, cg: 160, cb: 48, life: 0.4, w: 4, lit: 1.4 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc || e.def.boss) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 4 + e.radius) continue;
        e.state = 'flee';
        e.fleeTimer = Math.max(e.fleeTimer || 0, dur);
      }
    },
  },
  {
    id: 'shout', name: 'Shout', tree: 'cries', req: 6, prereq: ['howl'], iconSeed: 1,
    mana: () => 6,
    blurb: 'A rallying cry that hardens the skin like armour.',
    effect: (l) => `+${100 + 10 * (l - 1)}% Defence for ${20 + 5 * (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      caster.buffs.shout = { t: 20 + 5 * (lvl - 1), mag: 100 + 10 * (lvl - 1) };
      caster.recalc();
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.2, cr: 200, cg: 190, cb: 150, life: 0.35, w: 3, lit: 1.2 });
    },
  },
  {
    id: 'battlecry', name: 'Battle Cry', tree: 'cries', req: 18, prereq: ['howl'], iconSeed: 2,
    mana: () => 5,
    blurb: 'A curse of a shout. What hears it fights worse.',
    effect: (l) => `Enemies within 3.5 tiles: -50% Defence, -25% Damage for ${12 + (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      const dur = 12 + (lvl - 1);
      ctx.fx.ring(caster.x, caster.y, { maxR: 3.5, cr: 220, cg: 120, cb: 60, life: 0.4, w: 4, lit: 1.4 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 3.5 + e.radius) continue;
        e.battlecry = { def: 0.5, dmg: 0.75, t: dur };
      }
    },
  },
  {
    id: 'battleorders', name: 'Battle Orders', tree: 'cries', req: 24, prereq: ['shout'], iconSeed: 3,
    mana: () => 7,
    blurb: 'The order to stand. Life and mana swell to meet it.',
    effect: (l) => `+${30 + 3 * (l - 1)}% Maximum Life and Mana for ${30 + 6 * (l - 1)}s`,
    cast(caster, lvl, tx, ty, ctx) {
      caster.buffs.battleorders = { t: 30 + 6 * (lvl - 1), mag: 30 + 3 * (lvl - 1) };
      caster.recalc();
      ctx.fx.ring(caster.x, caster.y, { maxR: 2.6, cr: 240, cg: 200, cb: 120, life: 0.4, w: 3, lit: 1.4 });
    },
  },
  {
    id: 'warcry', name: 'War Cry', tree: 'cries', req: 24, prereq: ['battlecry'], iconSeed: 4,
    mana: () => 10, element: 'phys',
    damage: (l) => ({ min: 18 + 6 * (l - 1), max: 28 + 8 * (l - 1) }),
    synergies: [{ id: 'howl', pct: 6 }, { id: 'battlecry', pct: 6 }],
    blurb: 'A shout that lands like a blow, and leaves the survivors reeling.',
    effect: (l) => `Stuns for ${Math.min(3, 1 + 0.1 * (l - 1)).toFixed(1)}s within 3 tiles`,
    cast(caster, lvl, tx, ty, ctx) {
      const sk = this;
      const roll = rollFor(ctx, caster, sk, lvl);
      const stun = Math.min(3, 1 + 0.1 * (lvl - 1));
      ctx.fx.ring(caster.x, caster.y, { maxR: 3, cr: 255, cg: 180, cb: 80, life: 0.4, w: 5, lit: 2 });
      for (const e of ctx.level.entities) {
        if (!e.alive || e.isPlayer || e.isNpc) continue;
        if (Math.hypot(e.x - caster.x, e.y - caster.y) > 3 + e.radius) continue;
        ctx.damageMonster(e, { phys: roll() }, { source: caster });
        applyStun(e, stun);
      }
      if (ctx.sfx) ctx.sfx('explode');
    },
  },
```

- [ ] **Browser check:**
  - Barbarian via `__newGame('barbarian')`; `(() => { const p = window.__g.player; p.level = 24; p.skillPoints = 8; return 'ok'; })()`. Allocate Howl, Shout, Battle Cry, Battle Orders, War Cry.
  - Howl at a Fallen pack: the ring flashes and the pack observably routs (runs away for ~3s, then turns back). Cast at Corpsefire (Den boss): he does not flee.
  - Shout: character sheet Defence jumps to roughly double, stays for ~20s, then drops back (watch with C open; time with two checks of `window.__g.player.defense`).
  - Battle Orders: orbs and sheet max life/mana rise ~30%, current values keep their absolute numbers; on expiry max drops and current clamps.
  - Battle Cry on a pack, then attack: hits land visibly more often; monster hits on you float smaller numbers.
  - War Cry in a pack: damage floats on everything in the ring; survivors stand frozen mid-animation for ~1s (`window.__g.level.entities.filter(e => e.stunned > 0).length` > 0 right after).
  - Buffs do not persist: with Shout up, `__save()`, reload, Continue → `Object.keys(window.__g.player.buffs).length` → `0`, defence back to base.
  - Sorceress quick regression: `__newGame('sorceress')`, Fire Bolt still casts, monsters still die. Console clean.
- [ ] Commit: `feat: warcries, timed buffs and monsters that fear, stagger and falter`

---

### Task 7: Masteries

**Files:**
- Modify: `src/game/skills.js` (four passive entries, refreshPassives)
- Modify: `src/game/player.js` (recalc weapon-kind fold)

**Interfaces:**
- Consumes: `player.masteryPoints` / `player.ironSkinLevel` fields (Task 2), the Iron Skin defence fold already written into recalc (Task 6).
- Produces: `refreshPassives` writing `player.masteryPoints = { axe, mace, sword }` (effective levels) and `player.ironSkinLevel` — the Warmth precedent, no skills import in player.js; `recalc` folding the matching weapon `kind` bonus into displayed damage and attack rating, so the character sheet is honest.

**Steps:**

- [ ] **Four passives** appended to `SKILLS` after `warcry` (staggered reqs because the tree panel fits two icons per tier row):

```js
  // ------------------------------------------------------ BARBARIAN MASTERIES
  {
    id: 'axemastery', name: 'Axe Mastery', tree: 'mastery', req: 1, prereq: [], passive: true, iconSeed: 0,
    blurb: 'Axes hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with axes`,
  },
  {
    id: 'macemastery', name: 'Mace Mastery', tree: 'mastery', req: 1, prereq: [], passive: true, iconSeed: 1,
    blurb: 'Clubs, maces and hammers hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with maces`,
  },
  {
    id: 'swordmastery', name: 'Sword Mastery', tree: 'mastery', req: 6, prereq: [], passive: true, iconSeed: 2,
    blurb: 'Blades of every length hit harder and truer in your hands.',
    effect: (l) => `+${28 + 8 * (l - 1)}% Damage, +${28 + 8 * (l - 1)} Attack Rating with swords`,
  },
  {
    id: 'ironskin', name: 'Iron Skin', tree: 'mastery', req: 12, prereq: [], passive: true, iconSeed: 3,
    blurb: 'Skin like worked metal.',
    effect: (l) => `+${30 + 10 * (l - 1)}% Defence`,
  },
```

- [ ] **refreshPassives** grows the mastery block:

```js
export function refreshPassives(player) {
  const w = skillLevel(player, 'warmth');
  player.manaRegenBonus = w > 0 ? SKILL_BY_ID.warmth.manaRegen(w) : 0;
  player.masteryPoints = {
    axe: skillLevel(player, 'axemastery'),
    mace: skillLevel(player, 'macemastery'),
    sword: skillLevel(player, 'swordmastery'),
  };
  player.ironSkinLevel = skillLevel(player, 'ironskin');
  player.recalc();
}
```

- [ ] **recalc weapon fold.** In `Player.recalc` (`src/game/player.js`), the weapon-damage block becomes:

```js
    // Weapon damage. Bare-handed is deliberately feeble: this is a caster —
    // or it was; a mastery folds in for the matching weapon kind so the
    // sheet stays honest.
    const MASTERY_KIND = { axe: 'axe', mace: 'mace', sword: 'sword', blade: 'sword' };
    const wpn = this.equipment.weapon;
    const mk = wpn ? MASTERY_KIND[wpn.kind] : null;
    const mp = mk ? (this.masteryPoints[mk] || 0) : 0;
    const mBonus = mp > 0 ? 28 + 8 * (mp - 1) : 0;
    this.minDamage = Math.floor(((wpn ? wpn.minDmg : 1) + t.minDmg) * (1 + mBonus / 100));
    this.maxDamage = Math.floor(((wpn ? wpn.maxDmg : 2) + t.maxDmg) * (1 + mBonus / 100));
    this.attackSpeed = 1 + t.ias / 100;
```

and the attack rating line (earlier in recalc) becomes:

```js
    this.attackRating = Math.floor(attackRatingFrom(dex, t.ar, this.level));
```
→ move it BELOW the weapon block and change to:

```js
    this.attackRating = Math.floor(attackRatingFrom(dex, t.ar, this.level) + mBonus);
```

(One reorder inside recalc; nothing reads attackRating mid-recalc.)

- [ ] **Browser check:**
  - Barbarian, `skillPoints = 4`. Note the sheet damage with the Hand Axe. Allocate Axe Mastery → Damage and Attack Rating both jump on the sheet immediately. Buy a Club from Charsi and equip it → the axe bonus leaves the sheet; allocate Mace Mastery → a bonus returns. Unequip entirely → no bonus (bare hands match no kind).
  - Iron Skin at 12: Defence rises 30% and stacks multiplicatively under Shout.
  - Sorceress regression: her sheet numbers unchanged by this task (masteryPoints all zero).
  - Console clean.
- [ ] Commit: `feat: weapon masteries and iron skin, folded honestly into the sheet`

---

### Task 8: The verification contract

**Files:** none created — this task is the spec's ship gate, run end-to-end in a real browser against `serve.js`, with fixes applied where checks fail.

**Steps:**

- [ ] **1. Title.** Both classes creatable from the title; Esc backs out of the class step.
- [ ] **2. New Barbarian.** 55/10 orbs, Hand Axe equipped, Bash bound right; axe swings connect (damage floats, monsters die) and miss (the `miss` float exists) per the to-hit formula.
- [ ] **3. All 14 skills.** Allocate each under its gate (use `window.__g.player` to grant level/points); each casts or swings for the printed mana cost and does what its tooltip says: fear observably routs a pack, stun observably freezes one, Shout and Battle Orders change the character sheet for their printed duration, masteries change displayed damage only while the matching weapon is held, Leap lands where aimed or refuses, Whirlwind traverses and hits en route.
- [ ] **4. Sorceress regression.** An existing (or fresh, played-forward) Sorceress save Continues; her three trees render three columns; Fire Bolt casts; her sheet says Faster Cast Rate.
- [ ] **5. Save round-trip.** Mid-run Barbarian with points spent, buffs up, axe equipped, bindings set: `__save()`, reload, Continue → class, skills, bindings and axe survive; buffs dropped (D2 behaviour).
- [ ] **6. Performance.** Fresh reload: `(() => { const t0 = performance.now(); window.__forceLoad(); return Math.round(performance.now() - t0); })()` under **450 ms**. Then with Whirlwind active through a pack:

```js
(() => { const t = []; for (let i = 0; i < 300; i++) { const a = performance.now(); window.__step(1/60); window.__render(); t.push(performance.now() - a); } t.sort((x, y) => x - y); return { p50: +t[150].toFixed(2), p95: +t[285].toFixed(2) }; })()
```

  p95 under 16 ms.
- [ ] **7. Bundle.** `node build.js` clean; open `diablo.html` from disk, play a Barbarian through the moor.
- [ ] **8. Console clean throughout** every check above.
- [ ] Update `README` backlog / `progress.md` if the repo's audit convention expects a record (follow the existing files' format).
- [ ] Commit: `docs: barbarian verification record` (plus any `fix:` commits the sweep produced, each committed where found)

---

### Task 9 (STRETCH — only after Task 8 is fully green): Nightmare

If Task 8 uncovered enough work that this would rush, move this section to the README backlog instead and stop.

**Files:**
- Modify: `src/save.js` (diff field), `src/main.js` (title option, difficulty plumbing), `src/game/monster.js` (tuning multipliers), `src/game/player.js` (resistance penalty)

**Design (from the spec):** killing Andariel unlocks Nightmare on the title per save: same character, world reseeded, monster level +15 (affix/loot tiers follow ilvl as they already do), monster life ×2.5 and damage ×1.8, player resistances −40, XP curve unchanged. One flag in the save (`diff`), absent = Normal.

**Steps:**

- [ ] `save()` adds `diff: game.diff || 'normal'`; `main.js` keeps `let diff = 'normal'` module state exposed through the `game` object.
- [ ] Title: when `load()` exists and `load().quests && load().quests.andariel`, add a third option `{ id: 'nightmare', label: 'Nightmare' }`. Clicking it runs `continueGame` with a twist: after `applyTo`, set `diff = 'nightmare'`, reroll `seed` fresh, `levels.clear()`, reset `player.quests = {}` and `player.waypoints = { town: true }`, enter town, save. Continue with an existing `d.diff === 'nightmare'` save restores `diff` and the same seed normally.
- [ ] Monster tuning: `getLevel` builds `const def2 = diff === 'nightmare' ? { ...def, areaLevel: def.areaLevel + 15 } : def;` and passes `def2` to `generate`/`populate`/`spawnBoss` (loot ilvl follows `level.areaLevel` automatically). `populate`/`spawnPack`/`spawnBoss`/`Monster` thread an optional `tuning = { hp: 2.5, dmg: 1.8 }` through `opts`; the Monster constructor applies it right after `statsFor`.
- [ ] Player penalty: `player.resPenalty = diff === 'nightmare' ? 40 : 0` set wherever `diff` changes; in `recalc`, resists become `Math.max(-100, Math.min(RES_CAP, t[key] + t.resAll - (this.resPenalty || 0)))`.
- [ ] **Browser check:** beat Andariel (or set `quests.andariel` on a save via console and `__save()`); title shows Nightmare; entering it keeps the character (level, gear) with resists shown 40 lower on the sheet, monsters hit for ~1.8× and take visibly longer to kill, moor drops roll tier-3 bases. Normal Continue still works on a non-flagged save. Console clean.
- [ ] Commit: `feat: nightmare, for the character who has already won once`
