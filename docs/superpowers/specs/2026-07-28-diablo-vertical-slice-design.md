# Diablo 2 Vertical Slice — Design

Date: 2026-07-28
Status: approved

A browser action-RPG in the shape of Diablo 2: Lord of Destruction. No image, audio, or font
assets ship with it. Every sprite, tile, icon and sound effect is computed at load time.

## 1. Constraints

- Runs from `index.html` served by any static server (`python3 -m http.server`). ES modules, no bundler.
- `node build.js` optionally inlines everything into a single `diablo.html` that works from `file://`.
- Zero runtime dependencies. Zero build dependencies.
- Target: 60 fps at 1280x720 with 40 active monsters, on a laptop.

## 2. Coordinate system

Simulation runs in **tile space** (floats). Tiles are 64 wide, 32 tall on screen.

```
screen_x = (wx - wy) * 32
screen_y = (wx + wy) * 16

wx = (screen_x / 32 + screen_y / 16) / 2
wy = (screen_y / 16 - screen_x / 32) / 2
```

Camera centres on the player. Draw order is ascending `wx + wy`, so anything further "down-screen"
paints last and correctly occludes.

Entities are circles of radius 0.32 tiles for collision. Movement resolves one axis at a time
against the blocked-tile grid, which makes wall-sliding fall out for free.

## 3. Fixed timestep

Simulation steps at exactly 60 Hz in `1/60` second increments, accumulating real elapsed time and
capping at 5 steps per frame so a stalled tab does not spiral. Rendering interpolates nothing —
at 60 Hz it is not needed and the extra state doubles every entity's bookkeeping.

## 4. Generated art

### 4.1 Pixel raster primitives (`src/art/pixel.js`)

All sprite work writes into a raw `ImageData` buffer through hand-written rasterizers, never the
Canvas 2D path API — canvas antialiasing destroys pixel art. Primitives:

- `capsule(buf, x0,y0,r0, x1,y1,r1, colorRamp)` — tapered limb, the workhorse
- `ellipse`, `rect`, `line`, `poly`
- `outline(buf, color)` — one-pixel dark border around all opaque pixels, drawn last

Each shape takes a **ramp** of four colours (light / base / dark / outline) rather than one colour.
Shading picks from the ramp by the pixel's position relative to the shape's up-left axis, giving a
consistent single light source from the upper left across the whole game.

### 4.2 Palette (`src/art/palette.js`)

A palette is a handful of base colours. `ramp(hex)` derives light/base/dark/outline by moving
lightness in HSL space. Changing four hex values reskins an entire monster.

### 4.3 Figures (`src/art/figures.js`)

One skeletal poser produces every humanoid and beast in the game.

A **figure spec** gives limb lengths, thicknesses, palette, and optional attachments (weapon, staff,
cape, horns, wings). The poser evaluates an **animation curve** — plain functions of `t` in `[0,1)`
returning joint angles — to place joints in a 3D frame (x right, y depth, z up), projects them to
iso screen space, and rasterizes limbs back-to-front.

Per entity type the factory bakes:

| Animation | Frames | Notes |
|-----------|--------|-------|
| idle      | 4      | breathing sway |
| walk      | 8      | contact / passing / lift cycle |
| attack    | 6      | wind-up, strike on frame 3, recover |
| cast      | 6      | players and casters only |
| death     | 8      | collapse, last frame persists as corpse |

Directions 0–4 are generated; 5–7 are horizontal mirrors. All frames for one type pack into a
single sprite-sheet canvas (8 columns), so drawing is one `drawImage` with a source rect.

Cell size 80x80 keeps Andariel and staff swings inside the frame. Roughly 3 MB per entity type,
about 26 MB total — acceptable, and generation is chunked across animation frames behind a
progress bar so the tab never freezes.

### 4.4 Tiles and props (`src/art/tiles.js`)

Ground tiles are 64x32 diamonds filled with value noise over a base colour, six variants per
terrain (grass, dirt, cobble, cave, crypt, blood) selected by a hash of tile coordinates.

Walls draw as iso blocks: a diamond top plus left and right faces, 44 px tall, with the two faces
at different brightness. Props (tree, rock, column, brazier, barrel, chest, gravestone, torch,
bones) are one-off generated sprites with an anchor point at their base.

### 4.5 Item icons (`src/art/icons.js`)

One generator per base-type family (blade, wand, staff, orb, body, helm, shield, glove, boot, belt,
ring, amulet, potion, gold, scroll). Material tint comes from the item's tier, and a rarity glow
is composited behind magic and better items.

## 5. Lighting (`src/render/renderer.js`)

The single highest-value effect. Three passes:

1. Scene draws at full brightness to the main canvas.
2. Lights draw to a **light buffer** at 1/3 resolution: fill with the level's ambient colour, then
   `lighter`-composite a radial gradient per light source.
3. The light buffer scales up over the scene with `globalCompositeOperation = 'multiply'`.

Light sources: the player's own radius (11 tiles), braziers and torches, every live projectile,
and short-lived flashes on explosions and lightning. Ambient runs from `rgb(96,92,104)` outdoors to
`rgb(26,24,34)` in the Catacombs.

## 6. World

### 6.1 Generators (`src/world/gen.js`)

- **Outdoor** — cellular-automata blob for the walkable region, a wandering spine path of packed
  dirt between entrances, prop scatter weighted away from the path.
- **Dungeon** — binary-space-partition rooms joined by L-corridors, one guaranteed dead-end room
  reserved for the boss or the quest objective.

Both take a seed. The same seed always yields the same level, which is what makes save/load cheap.

### 6.2 Areas (`src/world/levels.js`)

| # | Area | Type | Area lvl | Contents |
|---|------|------|----------|----------|
| 1 | Rogue Encampment | town | — | vendor, waypoint, no hostiles |
| 2 | Blood Moor | outdoor | 1 | Fallen, Zombie |
| 3 | Den of Evil | dungeon | 3 | Fallen, Shaman; **Corpsefire** (unique) |
| 4 | Cold Plains | outdoor | 5 | Devilkin, Shaman, Quill Rat |
| 5 | Burial Grounds | outdoor | 7 | Skeleton, Zombie; **Blood Raven** (boss) |
| 6 | Catacombs | dungeon | 10 | Skeleton, Devilkin, Ghoul; **Andariel** (final boss) |

Areas connect through exit portals at fixed map edges. Waypoints in town, Cold Plains and
Catacombs allow fast travel once touched.

### 6.3 Pathing (`src/world/path.js`)

A* over the tile grid for player click-to-move, followed by line-of-sight string-pulling so the
character walks diagonals instead of stair-stepping. Monsters steer directly at their target with
local avoidance and only fall back to A* after being blocked for half a second — 40 monsters
running full A* every frame is the obvious performance trap here.

## 7. Rules (`src/game/combat.js`)

Real D2 formulas, not approximations.

**Chance to hit** (clamped 5–95):

```
hit% = 100 * (AR / (AR + DEF)) * (2 * alvl / (alvl + dlvl))
```

**Life / mana:**

```
life = base + vitality * lifePerVit + level * lifePerLevel
mana = base + energy   * manaPerEne + level * manaPerLevel
```

Sorceress: `lifePerVit 2, manaPerEne 2, lifePerLevel 1, manaPerLevel 2`, bases 40 / 35.

**Physical damage** = `roll(min,max) * (1 + enhancedDamage%) * (1 + str/100)`, reduced by the
target's damage-reduction, then by physical resist.

**Elemental damage** is reduced by `resist%`, capped at 75 for the player. Monster resists are
lowered by the matching mastery's `-resist` term, which can push them below zero.

**Cold** applies a slow (35 % movement and attack speed) for a duration scaling with skill level.
**Lightning** rolls over a deliberately wide min–max. **Fire** leaves a burn ticking for 2 seconds.

**Experience** uses the D2 curve with the level-difference penalty, so grinding Blood Moor at
level 20 is pointless. Level cap for the slice is **30**.

## 8. Skills (`src/game/skills.js`)

Thirteen skills, one point per level, D2 prerequisite gating, real synergies.

| Tree | Skill | Req lvl | Effect | Synergies |
|------|-------|---------|--------|-----------|
| Fire | Fire Bolt | 1 | fast single-target bolt | — |
| Fire | Warmth | 1 | passive mana regeneration | — |
| Fire | Fire Ball | 6 | projectile, 2.5-tile explosion | Fire Bolt +14 %/pt |
| Fire | Meteor | 18 | delayed sky impact + burning ground | Fire Bolt, Fire Ball |
| Fire | Fire Mastery | 24 | −enemy fire resist, +fire damage | — |
| Cold | Ice Bolt | 1 | bolt, slows | — |
| Cold | Frost Nova | 6 | expanding ring, slows | Ice Bolt |
| Cold | Frozen Orb | 24 | orb shedding ice shards | Ice Bolt, Frost Nova |
| Cold | Cold Mastery | 24 | −enemy cold resist | — |
| Light | Charged Bolt | 1 | fan of seeking bolts | — |
| Light | Static Field | 6 | strips a % of current life in a radius | — |
| Light | Teleport | 6 | instant blink to cursor | — |
| Light | Nova | 18 | radial lightning burst | Charged Bolt, Static Field |
| Light | Lightning Mastery | 24 | −enemy lightning resist | — |

Left mouse holds one skill (default Attack/Move), right mouse another. `F1`–`F8` bind hotkeys.

## 9. Items

**Bases** (`src/items/bases.js`) — dagger, wand, staff, orb, body armour, helm, shield, gloves,
boots, belt, ring, amulet. Each carries inventory footprint, requirements, base damage or defence,
and a quality tier gated by area level.

**Affixes** (`src/items/affixes.js`) — prefix and suffix pools with level gating and per-slot
applicability: enhanced damage, added elemental damage, +life, +mana, +all resist, single resist,
faster cast rate, +skill levels, +stats, +attack rating, life steal, +defence, magic find.

**Rarity roll:** unique 0.6 %, rare 6 %, magic 27 %, else normal — biased upward by the killer's
level and by any magic-find on the character. Rare items take 3–6 affixes, magic 1–2.

**Uniques** (`src/items/uniques.js`) — twelve fixed-roll chase items with D2 names and the drop
constraint that the base type must roll first.

**Inventory** — 10x4 grid honouring item footprints, plus eleven equipment slots and a four-slot
potion belt bound to `1`–`4`. Gold is a single counter. The town vendor buys at 25 % and sells a
refreshing stock.

Item stats aggregate through one function that walks every equipped item and returns a single
totals object; nothing else in the codebase reads item affixes directly.

## 10. Sound (`src/audio/synth.js`)

Web Audio, synthesized on demand, no files. Filtered noise bursts for impacts and whooshes,
detuned oscillator stacks for spells, a short arpeggio for level-up, a low pad for boss encounters.
Every effect is a function of a few numbers, so pitch and length vary per instance and repetition
does not grate.

## 11. Save (`src/save.js`)

One JSON object in `localStorage`: character stats, skill allocation, inventory and equipment,
gold, current area, world seed, quest flags. Areas regenerate from the seed on load. Autosaves on
area transition and on level-up.

## 12. Module layout

```
index.html          build.js
src/main.js
src/core/     rng.js loop.js input.js iso.js
src/art/      palette.js pixel.js figures.js tiles.js icons.js fx.js
src/audio/    synth.js
src/world/    gen.js levels.js level.js path.js
src/game/     player.js monster.js monsterdefs.js ai.js combat.js skills.js projectile.js loot.js
src/items/    bases.js affixes.js uniques.js item.js
src/render/   renderer.js minimap.js
src/ui/       hud.js panels.js tooltip.js
src/save.js
```

Dependency direction is one-way: `core` → `art`/`audio` → `items` → `world`/`game` → `render`/`ui`
→ `main`. Nothing lower imports anything higher.

## 13. Controls

| Input | Action |
|-------|--------|
| Left click | move, or attack / cast left-bound skill |
| Right click | cast right-bound skill |
| Shift + click | attack in place without moving |
| `1`–`4` | drink belt potion |
| `I` `C` `T` | inventory, character, skill tree |
| `Tab` | map overlay |
| `Alt` (hold) | show all ground item labels |
| `Space` | close all panels |
| `F1`–`F8` | bind hovered skill to hotkey |

## 14. Verification

Driven in a real browser, each confirmed by observation rather than assumed:

1. Loads with an empty console.
2. Click-to-move paths around walls without sticking.
3. Monsters acquire, chase, attack, die, and drop loot and gold.
4. Equipping an item changes the character sheet numbers by the item's stated amounts.
5. Levelling grants points; the skill tree spends them and gated skills stay locked.
6. Belt potions restore life and mana.
7. All six areas are reachable on foot; Corpsefire, Blood Raven and Andariel all die.
8. Save, reload, and the character and world come back identical.
9. Frame time stays under 16 ms with a screen full of monsters and particles.

## 15. Out of scope

Multiplayer, mercenaries, rune words, gems, sockets, gambling, the stash, difficulty tiers beyond
Normal, acts two through five, and a unit-test harness. For a real-time game with no server logic,
driving the actual build in a browser is the honest verification; a test framework here would be
ceremony that proves less.
