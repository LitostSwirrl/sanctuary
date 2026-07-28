# Progress

Browser action-RPG in the shape of Diablo 2. No image, audio or font files ship with it —
every sprite, tile, item icon and sound effect is computed at load time.

**Run it:** `node serve.js` then open `http://localhost:8231/index.html`

- Spec: `docs/superpowers/specs/2026-07-28-diablo-vertical-slice-design.md`
- Plan: `docs/superpowers/plans/2026-07-28-diablo-vertical-slice.md`
- Checkpoints: `docs/superpowers/plans/2026-07-28-diablo-vertical-slice-checkpoints.md`

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

## Measurements

| What | Result |
|------|--------|
| Bake all art (11 figures, 7 terrains, 12 props) | 545 ms |
| Frame time, 3840x1858, 27 entities, 1075 drawables | 1.8 ms median, 5.9 ms worst |
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
