# Progress

Browser action-RPG in the shape of Diablo 2. No image, audio or font files ship with it —
every sprite, tile, item icon and sound effect is computed at load time.

**Run it:** `python3 -m http.server 8231` then open `http://localhost:8231/index.html`

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
| 9 | Monsters and AI | in progress | |
| 10 | Skills and projectiles | pending | |
| 11 | HUD, panels, tooltips | pending | |
| 12 | Audio | pending | |
| 13 | Assembly, quests, bosses, save | pending | |
| 14 | Packaging and README | pending | |

## What works right now

The rendering foundation is complete and running in a browser. A generated level draws in
isometric with depth-sorted walls, props and animated figures, lit by a light buffer that
is multiplied over the scene — room corners go dark, a torch carves out a radius, and
walking behind a wall correctly hides the lower body.

All six areas generate from a seed with every exit, spawn point, waypoint and boss room
reachable from the entrance.

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
