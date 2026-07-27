# Diablo 2 Vertical Slice — Cross-Session Checkpoints

> Append-only. Each completed task gets a log entry; resume prompts are added when a session hands off.
> Every resume prompt must be self-contained: a new session sees only CLAUDE.md plus the pasted prompt.

## State

- **Task 1 — Shell, loop, isometric camera**: done (2026-07-28)
- **Task 2 — Pixel rasterizer and palettes**: done (2026-07-28)
- **Task 3 — Figure poser and sprite sheets**: done (2026-07-28)
- **Task 4 — Tiles, props, particles, loading**: done (2026-07-28)
- **Task 5 — Level structures, generators, pathing**: done (2026-07-28)
- **Task 6 — Renderer and lighting**: done (2026-07-28)
- **Tasks 7-14** — player and combat, items, monsters and AI, skills, UI, audio, assembly, packaging: all done (2026-07-28)

All fourteen tasks are complete. The game is playable start to finish and every phase check in
the plan has been observed in a browser. See progress.md for the verification record.

## Cross-cutting contracts

- **Project root**: `/Users/jinsoon/Work/Projects/experiments/diablo`
- **Spec**: `docs/superpowers/specs/2026-07-28-diablo-vertical-slice-design.md`
- **Plan**: `docs/superpowers/plans/2026-07-28-diablo-vertical-slice.md` — task list with exact files and published interfaces
- **Read order for a new session**: CLAUDE.md → plan (the task being executed) → this file → the source files that task names
- **Run it**: `node serve.js` from the project root, then open `http://localhost:8231/index.html`. Use serve.js rather than python3 -m http.server: it sends no-store, and a cached ES module once made a real fix look like it had failed.
- **No assets, no dependencies, no bundler.** Plain ES modules with explicit `.js` extensions. No emoji anywhere.
- **Verification is browser-driven.** Chrome DevTools MCP is blocked by a stale profile lock in this environment; use claude-in-chrome instead.
- **A backgrounded tab throttles requestAnimationFrame to about 1 fps.** This breaks both chunked loading and any rAF-based timing under automation. `src/main.js` therefore exposes `window.__forceLoad()` to drain the loader synchronously and `window.__bench(n)` to time `step`+`render` in a synchronous loop. Keep equivalent hooks in any harness.
- **Commit after every task**, Conventional Commits, with the Co-Authored-By trailer.

## Established interfaces (tasks 1-6)

- `core/rng.js` — `Rng` with `.f() .i(n) .int(a,b) .range .pick .chance .weighted .fork(salt)`; `fbm2(rng, octaves)`
- `core/iso.js` — `TILE_W=64 TILE_H=32`, `worldToScreen`, `screenToWorld`, `dirFromVector`, `Camera{x,y,zoom,toScreen,toWorld,visibleTileBounds,follow,addShake}`
- `core/loop.js` — `startLoop({step, draw})`, `TICK = 1/60`
- `core/input.js` — `Input` singleton, `.mouse`, `.down/pressed/consume(code)`, `consumeL/consumeR`, `endFrame()`
- `art/pixel.js` — `Buf`, `capsule`, `ellipse`, `ellipseF`, `rectF`, `lineP`, `polyF`, `outline`, `tint`, `bufToCanvas`
- `art/palette.js` — `ramp(hex)`, `shift(hex,dL)` (returns a **packed int**, not a hex string), `packHex`, `packRGB`, `COLORS`
- `art/figures.js` — `bakeAllFigures(out)` generator, `CELL=80`, `FOOT_Y=70`, `ANIMS={idle:4,walk:8,attack:6,cast:6,death:8}`; a sheet has `.canvas .footY .has(anim) .index(anim,dir,frame) -> {sx,sy,flip}`. Eleven figures: sorceress, fallen, devilkin, shaman, zombie, ghoul, quillrat, skeleton, corpsefire, bloodraven, andariel. Attack lands on frame 3 of 6.
- `art/tiles.js` — `bakeTiles()` generator, `getGround(terrain,x,y)`, `getWall(terrain,x,y) -> {canvas,ox,oy}`, `getProp(name,seed) -> {canvas,ox,oy,light}`
- `art/fx.js` — `Particles` with `spawn burst arc ring decal float update draw drawDecals drawFloats lights(out)`; recipe object `FX` (`fireBurst iceBurst lightBurst hitBlood hitSpark fireTrail death levelUp teleport`)
- `world/level.js` — `Level`, tile constants `VOID FLOOR WALL PATH`, `blockedCircle(x,y,r)`, `walkableTile`, `nearestOpen`, `markExplored`, `addProp`, `addEntity`, `floodRegion`
- `world/gen.js` — `generate(def, seed)` dispatching to `genTown genOutdoor genDungeon`
- `world/levels.js` — `AREAS` (town, moor, den, coldplains, burial, catacombs), `AREA_BY_ID`, `WAYPOINT_AREAS`
- `world/path.js` — `findPath(level,sx,sy,tx,ty)`, `smooth(level,path,from)`, `hasLineOfSight`
- `render/renderer.js` — `Renderer{resize, draw(level, cam, {player, fx, projectiles, time, playerLightRadius, extraLights})}`. Entities it draws must expose `x y dir animName frame sheet radius alive` and optionally `hitFlash frozen chilled alpha uniqueAura`.
- `render/minimap.js` — `drawMinimap(ctx, level, player, 'corner'|'overlay', w, h, uiScale)`

## Decisions worth carrying forward

- Sprite directions 0-4 are baked; 3, 4 and 7 are horizontal flips applied at draw time. Mirroring maps screen angle `a` to `180-a`, which never crosses between the front-facing and back-facing halves, so the flip is always valid.
- Figure proportions are deliberately chunky, about four heads to the body. Anatomically correct ratios read as stick figures at sixty pixels tall.
- Outdoor "walls" are low banks with exposed rock faces and a terrain-coloured top. Full-height grass-topped blocks read as an artificial maze.
- Walls with no exposed side paint their top face only. Skipping them entirely leaves large rock masses as holes through to the background.
- Terrain continues past the map edge as raised ground, because a wide viewport sees further than the level extends. Camera clamping cannot fix this on a large display.
- Performance headroom is large: median frame 1.8ms, worst 5.9ms at 3840x1858 with 27 entities and 1075 sorted drawables. Budget is 16ms.

## Log

### Tasks 1-6 — rendering foundation (2026-07-28)

**What**: Isometric shell, fixed-timestep loop and camera; a hand-written pixel rasterizer that avoids canvas antialiasing; one skeletal poser that bakes all eleven creatures into sprite sheets in 266ms; generated ground tiles, wall blocks, twelve props and a particle system; two level generators plus A* with line-of-sight path smoothing; and the renderer with its multiply-composited light buffer.

**Why**: The light buffer is the single highest-value effect and drove several decisions — particles and projectiles contribute light sources, and ambient colour per area sets the mood before any light is added. Sprite baking is generative rather than drawn so a creature is a palette plus a dozen proportions. Level connectivity is structural (every region but the largest becomes wall) rather than checked and patched afterwards.

**Next**: Task 7 — entity base with axis-separated collision, D2 combat formulas (chance to hit from attack rating against defence with the level term, life and mana derived from vitality and energy, resistances capped at 75, the experience curve with its level-difference penalty), and the player with click-to-move over `findPath` + `smooth`.
