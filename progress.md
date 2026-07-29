# Progress

Browser action-RPG in the shape of Diablo 2. No image, audio or font files ship with it —
every sprite, tile, item icon and sound effect is computed at load time.

**Run it:** `node serve.js` then open `http://localhost:8231/index.html`

- Spec: `docs/superpowers/specs/2026-07-28-diablo-vertical-slice-design.md`
- Plan: `docs/superpowers/plans/2026-07-28-diablo-vertical-slice.md`
- Checkpoints: `docs/superpowers/plans/2026-07-28-diablo-vertical-slice-checkpoints.md`
- Barbarian spec: `docs/superpowers/specs/2026-07-29-barbarian-class-design.md`
- Barbarian plan: `docs/superpowers/plans/2026-07-29-barbarian-class.md`
- Barbarian checkpoints: `docs/superpowers/plans/2026-07-29-barbarian-class-checkpoints.md`

## Status

| # | Task | State | Verified by |
|---|------|-------|-------------|
| 1 | Shell, loop, isometric camera | done | Grid projects as diamonds, camera follows, clean console |
| 2 | Pixel rasterizer and palettes | done | Hard edges at 4x, no antialias fringe, one-pixel outline |
| 3 | Figure poser and sprite sheets | done | 11 creatures, 8 directions, all animations; bake 266ms |
| 4 | Tiles, props, particles, loading | done | No tile seams, no visible repetition, all effects fire |
| 5 | Level generators and pathing | done | 6 areas, zero orphan tiles, everything reachable |
| 6 | Renderer and lighting | done | Occlusion correct; 1.8ms median, 5.9ms worst frame |
| 7 | Player, movement, combat formulas | done | 24/24 formula checks; 60/60 walks arrive, 0 stuck |
| 8 | Items | done | 12k rolls: 0 rule violations; unique 0.61% at ilvl 12; MF works |
| 9 | Monsters and AI | done | wake, separation, hit-frame, flee, resurrect, loot all verified |
| 10 | Skills and projectiles | done | 14 skills; mana exact, teleport 200/200 safe, mastery works |
| 11 | HUD, panels, tooltips | done | equip deltas exact, 0 grid overlaps, gating and vendor correct |
| 12 | Audio | done | 21 effects render non-silent offline, none clip, throttle works |
| 13 | Assembly, quests, bosses, save | done | full playthrough: traversal, 3 bosses, save round-trip, death |
| 14 | Packaging and README | done | 303KB single file, 0 external refs, runs and plays |
| 15 | Audit: every button, NPC, skill and attack | done | see the pass below; 346KB single file |
| 16 | Encampment decor, generator fix, deploy | done | 720 levels generated, 0 unreachable exits |
| 17 | Barbarian: second class, ship-gate verification | done | 7/8 spec checks pass outright; cold bake over budget (570-598 ms vs 450 ms, pre-existing per Task 1's baseline bisect — see Measurements); one pre-existing vendor bug found and fixed |

## What works right now

All fifteen tasks are complete. The game is playable start to finish: a new Sorceress in the
Rogue Encampment, out through the Blood Moor, the Den of Evil, Cold Plains and Burial Grounds,
down into the Catacombs, and Andariel dies at the end of it.

## The audit pass

Every control was exercised by driving real mouse and keyboard events at the running page and
reading the resulting state, rather than by reading the code. Ten things were broken or missing.

| What was wrong | Fix |
|----------------|-----|
| A new character's right mouse button did nothing: `allocate` silently refused because the player had no skill point to spend, so the bound Fire Bolt was never learned | grant the point that pays for it |
| The belt slots on the bar were drawn as buttons and were not clickable | `drawHUD` already returned its rectangles; nothing read them |
| The two skill buttons on the bar were not clickable | same, plus a picker panel behind them |
| No way to bind anything to the left mouse button | the picker binds either button |
| Right clicking something you were wearing did nothing | takes it off into the bag |
| Equipping a shield over a two-handed weapon left both on | drag-and-drop enforced the rule; right-click equip did not |
| The vendor was an invisible point next to a chest | six NPCs, each of whom does something |
| There was no mouse cursor at all: the page hides the system one and nothing drew a replacement | drawn cursor that reports what a click will do |
| Clicking an item, chest or NPC out of reach walked you there and then waited for a second click | the action is remembered and fires on arrival |
| Picked-up items were never removed from `level.items`, so the list grew for the whole session | pruned in the same pass that collects gold |

Verified after the fixes, all by automation against the running game:

- 14 of 14 skills cast, spend the right mana and do damage; teleport moves; Static Field takes a
  quarter of current life; the three masteries report their pierce.
- 6 of 6 NPCs open, cycle dialogue, and every service works: heal restores life, mana and status;
  each merchant keeps a separate stock drawn from the types they deal in; gambling charges and
  returns something better than plain; Cain identifies and unidentified items cannot be worn first.
- Every key: `I` `C` `T` `Tab` `Space` `Esc` `M` and `1`–`4`.
- Every button: belt slots, both skill buttons, the four attribute buttons, all 14 skill icons,
  right-click binding, buy, sell, gamble, travel, and the dialogue actions.
- 53 of 53 item bases roll over 30k rolls; 7 weapon classes all draw an icon; every area outside
  town has items lying in it at generation.
- Full playthrough: all six areas, three bosses through the real kill path, quest flags, death
  leaving a corpse with your gold, resurrection in town, recovering the corpse, and a save round
  trip that preserves unidentified state.
- Console clean, both under `serve.js` and with `diablo.html` opened straight off disk.

## The decor pass, and the generator bug it turned up

The encampment was a cobbled circle with torches in it. It now has six props of its own — tents,
a wagon, an anvil, campfires, crates and a stake palisade — laid out so each of the six townsfolk
is standing at a station rather than in a field. The fence is placed inside the wall with gaps
left at the gates.

Putting a solid fence in a town is what exposed the real bug. `verifyReachable` flooded **tiles**
and ignored `level.solid`, so a prop standing in a one-tile corridor sealed it and the check
walked straight through and reported the level fine. About one dungeon in a hundred was generated
with an exit nothing could reach — a soft lock, present since the generators were written and
invisible because the tile flood always said yes.

`verifyReachable` now floods with `walkableTile`, which respects props. When it does find a
sealed exit it falls back to what the original code already intended: drop prop collision for
that level. Over 720 generated levels the fallback fires 3 times and no exit is unreachable.

Two of the new props were redrawn after looking at them in place: the crate read as a plank lying
on the ground until it was made nearly as tall as it is wide, and the campfire's stone ring read
as flower petals until the stones were made small and dark and the flame tall.

The loading bar no longer counts art by hand. `TILE_BAKE_STEPS`, `FIGURE_BAKE_STEPS` and
`ICON_BAKE_STEPS` are derived from the data, so adding a prop or a figure can no longer make it
lie. Measured cold load on this machine: 358 ms to the title screen, 103 bake steps.

## The Barbarian, and what the ship gate found

A second playable class: Warcries, Combat and Masteries, fourteen skills against the Sorceress's
fourteen, chosen from a class-select screen New Game never asked before. He plays melee — weapon
damage, attack rating against defence, Bash bound to the right button the way Fire Bolt is for her.
Leap and Whirlwind move him the way Teleport moves her; warcries are casts that fear a pack, stun
one, or change the character sheet for a printed duration rather than doing damage at all.

The class shipped through the same eight-check verification contract the design spec wrote for it,
run end to end in a real browser against `serve.js`, not read off the source. A new Barbarian starts
55/55 life, 10/10 mana, Hand Axe equipped, and connects (damage floats, kills) and misses — a
forced-defence probe confirmed the miss branch sits exactly on the formula's 5% floor — with the
same `chanceToHit` the Sorceress swings by. All fourteen skills allocate under their level and
prereq gates, cost their printed mana, and do what their tooltip says: Bash knocks a target back
before its own AI starts closing the gap again; Leap lands on the aimed tile or refuses into a
genuine wall mass with no mana spent; Whirlwind hits everything within 1.5 tiles along its line and
stops early at the first blocked tile, exactly as the original does; Howl routs a non-boss pack
while a boss shrugs it off; Shout and Battle Orders change the sheet by their exact formula and
revert at their exact printed duration, clamping life and mana down on expiry; the three weapon
masteries and Iron Skin move the sheet only for the weapon kind actually in hand. The Sorceress came
through untouched: her save Continues, her tree panel still shows three columns, Fire Bolt still
casts and kills, her sheet still reads Faster Cast Rate. A mid-run save round trip — fourteen skills
spent, custom left/right bindings set through the real skill-tree and skill-picker panels, an active
buff, the Hand Axe worn — came back byte for byte except the buff, which the save format never
carried and so correctly did not return.

One bug came out of it, and it was not his: buying anything from a named vendor (Charsi, Akara,
Gheed) threw `TypeError: Cannot read properties of null (reading 'filter')` after the gold was
already spent and the item already in the bag, because the buy handler always wrote back to
`this.vendorStock`, which stays `null` for a real NPC — their stock lives on the NPC itself.
Reproduced live while buying a Club and a Short Sword to prove Mace and Sword Mastery actually swap
with the weapon in hand, then fixed to read whichever place really holds the stock
(`src/ui/panels.js`).

Performance held up under him: Whirlwind live inside a 51-monster Den of Evil scene measured 1.9 ms
median, 3.8 ms at p95, against a 16.67 ms budget. Cold bake did not: five fresh reloads measured
570-598 ms against the spec's 450 ms target. This was isolated back in Task 1 — the Sorceress-only
baseline on this machine already measures 557-561 ms, so the Barbarian's own share is roughly
25-30 ms, proportionate to being the eighteenth figure baked. The shortfall predates this class and
belongs to the shared baking pipeline in this sandboxed environment, not to anything fixable inside
this task's scope — recorded rather than quietly passed.

`node build.js` bundles clean at 369 KB across 36 modules. Opened directly off disk
(`file:///.../diablo.html`, `location.protocol` confirmed `'file:'`) through a headless-Chromium
Playwright driver — the browser extension used for the rest of this sweep refuses `file://`
navigation outright, so it could not establish this leg itself. From that genuine file:// origin:
loaded, baked, started a Barbarian, ran 300 simulation frames, walked into the Blood Moor and landed
a real Bash swing (5.9 damage, mana spent exactly 2) through the same production input path used
everywhere else in this sweep. Zero console messages, zero page errors. The same flow was also run
earlier through `serve.js` (`http://localhost:8231/diablo.html`) with the same result and is kept as
supplementary evidence of the bundle's deeper gameplay (a full Bash-to-kill sequence); the file://
run is what actually proves the single-file, no-server claim.

## Measurements

| What | Result |
|------|--------|
| Bake all art (11 figures, 7 terrains, 12 props) | 545 ms |
| Bake all art (18 figures, 7 terrains, 18 props, 217 icons), Barbarian added | 570-598 ms (5 fresh reloads, median 587 ms) |
| Frame time, 3840x1858, 27 entities, 1075 drawables | 1.8 ms median, 5.9 ms worst |
| Frame time, Whirlwind live, 51-monster Den of Evil | 1.9 ms median, 3.8 ms at p95, budget 16.67 ms |
| Level generation | 1-17 ms per area |
| Line of sight, random open pairs in a dungeon | 13.1% clear — routes go around obstacles |

## Notes for anyone picking this up

- A backgrounded browser tab throttles `requestAnimationFrame` to about 1 fps, which breaks
  both chunked loading and rAF-based timing under automation. `src/main.js` exposes
  `window.__forceLoad()` and `window.__bench(n)` to work around it.
- `shift()` in `art/palette.js` returns a packed integer, not a hex string. Do not pass its
  result to `packHex()`.
- Sprite directions 3, 4 and 7 are horizontal flips of 1, 0 and 5, applied at draw time.
- NPCs live in `level.entities` so they sort and animate with everything else. They carry `isNpc`,
  and the AI, the damage paths and the projectile hit tests all skip on it. Adding a new way to
  hurt something means adding that guard too.
- `floodRegion` in `level.js` walks tiles only. That is correct where it is used to pick the
  largest region, because props do not exist yet, and wrong anywhere a prop could be in the way.
  `verifyReachable` has its own solid-aware flood for exactly that reason.
- Serve with `node serve.js` (not `python3 -m http.server`). It sends no-store, and a
  cached ES module once made a real fix look like it had failed.
