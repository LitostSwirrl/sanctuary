# Try-out Polish Batch -- Cross-Session Checkpoints

> Multi-session resume file. At each phase gate the agent checkpoints here (and in progress.md); when the window is worth shedding it appends a self-contained resume prompt, pbcopies it silently, and tells the user it is safe to /clear.
>
> Rules: append-only -- never edit historical prompts. Every resume prompt must be self-contained (a new session sees only CLAUDE.md + the pasted prompt).

## Status

- **Phase 0 -- maxed-start boost**: done (2026-07-29). Every `newGame` character starts at level cap 30, all 14 class skills at 20, stat points spent evenly, 50000 gold. Block lives in `src/main.js` `newGame()`, marked "Try-out boost", delete-to-revert. Verified in browser via `window.__g` hooks.
- **Phase 1 -- best-in-slot gear at start**: done (2026-07-29). `forgeItem(baseId, name, mods)` exported from `src/items/item.js`; `BEST_GEAR` table + equip loop inside the try-out boost block in `src/main.js` `newGame()`; belt filled with hp3/mp3 potions; `player.recalc()` inserted before `refreshPassives` so fresh == loaded sheet. Verified both classes in browser.
- **Phase 2 -- scrollable merchant list**: done (2026-07-29). `ui.vendorScroll` (whole rows) in panels.js; main.js feeds `Input.mouse.wheel` when vendor open; drawVendor clamps, culls rows to the viewport (no partial rows -> no clipping), draws track+thumb when overflowing; scroll resets on open/close. Verified with 20-row stock: wheel down/up, clamp at 8, scrollbar thumb confirmed by pixel probe.
- **Phase 3 -- background music**: done (2026-07-29). `playMusic`/`stopMusic`/`musicMode` in `src/audio/synth.js`; `ambient(level)` picks town/field/dungeon by `level.townCentre` and the existing `dark` heuristic, so area transitions drive music with no main.js wiring. Debug hook `window.__audio` added in main.js. Verified: mode mapping, bar scheduling liveness, mute path, clean console. Audible quality still needs Joseph's ear (M toggles sound).
- **Phase 4 -- art overhaul toward Diablo 2 LoD**: done (2026-07-29). Figures rebuilt to ~5.5-head D2 proportions (shoulder yoke, V-taper, skirt robes) with 5-band dithered sphere-normal shading in `pixel.js` `shadeOf` / `palette.js` `ramp`; terrain switched to seamless per-terrain 256x128 noise fields cut per tile by screen-lattice position (`getGround`/`getWall` index by `(wx-wy)&7,(wx+wy)&7` -- renderer contract unchanged), wall outlines removed, wall tops continue the ground field; ambients darkened ~25%, tighter warmer light pools, vignette in `paintLights`, player torch 12 -> 8.5 tiles. Bake 358 ms (budget ~600), render 1.82 ms median, console clean, all six areas + both classes screenshot-verified. Before/after shots in `shots/compare-*.png`.
- **Phase 4b -- boost extension (mid-flow request)**: done (2026-07-29). Joseph asked for unlimited money, all checkpoints unlocked, golden/legendary gear. Gold 9,999,999; `WAYPOINT_AREAS` pre-unlocked at newGame; `items/uniques.js` grew a chase tier (Harlequin Crest, SoJ x2, Mara's, Oculus, Vipermagi, Magefist, War Traveler, Arachnid Mesh, Lidless Wall / Schaefer's Hammer, Stormshield, Shaftstop, Steelrend, String of Ears, Bul-Kathos' x2) -- names+shapes verified against Arreat Summit, numbers slice-tuned; `forgeItem` takes rarity opts; `BEST_GEAR` now maps slot -> unique name. Supersedes the Phase 1 forged rares. No set-bonus mechanics exist, so uniques are the gold tier; noted for Joseph. Known trade-off: sorc life 216 (canon glass cannon), barb fire/pois res 25.

## Cross-cutting contracts

- **Project root**: `/Users/jinsoon/Work/Projects/experiments/diablo`
- **Read order (new session)**: `CLAUDE.md` (global) -> this file -> `progress.md` tail -> files named in the phase prompt
- **Build**: `node build.js` packs `src/` into self-contained `diablo.html` (file:// runnable). Always rebuild after src changes so both dev (`serve.js` + index.html) and built paths carry the change.
- **Verify**: drive the BUILT `diablo.html` in Chrome via chrome-devtools MCP. Debug hooks: `window.__forceLoad()`, `__newGame(cls)`, `__continue()`, `__step(dt)`, `__render()`, `__enter(areaId)`, `__g` (getter exposing player/level/ui/state...). If browser launch says profile in use, `pkill -f "chrome-devtools-mcp/chrome-profile"` first.
- **Style**: narrative comments, no emoji, surgical diffs, ES modules under `src/`, no external assets (game must stay self-contained -- art and audio are procedural).
- **Log**: project uses `progress.md` as its log; append What/Why/Next per phase.
- **At every phase gate**: update Status here + progress.md entry; full resume-prompt handoff only when window ~30%+ or user stops for the session.

---

## Phase 4 Resume Prompt

(generated 2026-07-29, after Phase 3 completed; also in clipboard via pbcopy)

```
Continue Phase 4 of the try-out polish batch in ~/Work/Projects/experiments/diablo: art overhaul toward a Diablo 2 LoD look.

Working directory: /Users/jinsoon/Work/Projects/experiments/diablo

State (phases 0-3 done, working tree uncommitted):
- Maxed start + best-in-slot gear: try-out boost block in src/main.js newGame() (BEST_GEAR table, forgeItem in src/items/item.js).
- Scrollable vendor list: ui.vendorScroll in src/ui/panels.js, wheel fed from main.js.
- Procedural BGM: playMusic/ambient in src/audio/synth.js (town/field/dungeon moods).
- All verified in the built diablo.html via chrome-devtools MCP. polish-checkpoints.md has full status.
- Joseph's direction (2026-07-29, verbatim): "all has a minecraft vibe. I want it to look more like diablo 2 LoD" -- the whole look, not just characters.

Before starting:
1. Read polish-checkpoints.md (project root) -- Status + Cross-cutting contracts.
2. Read src/art/figures.js, src/art/tiles.js, src/art/palette.js, and skim src/render/renderer.js -- how figures/tiles/props bake, sprite directions (3/4/7 are draw-time flips of 1/0/5), light radius.
3. Tail of progress.md for conventions and bake-time budget (~600 ms total art bake).

Goals -- iterate with screenshots after every change, judging against D2 LoD:
- Figures: replace the boxy look -- D2-ish silhouettes (longer legs, smaller head, shoulder mass), soft directional shading instead of flat faces, grounded contact shadow. Keep the existing bake/direction/flip pipeline and sprite sizes.
- Terrain: break the visible uniform tile grid -- organic noise-textured dirt/stone, per-tile variation, desaturated dark ground. Keep bake time in the same ballpark.
- Palette/light: darker, moodier ambience; warmer torch pools; stronger falloff toward screen edges -- LoD's oppressive feel.
- Hard constraint: everything stays procedural (no external assets); node build.js must keep producing the single-file diablo.html.

Verify loop each iteration: node build.js, open file:///Users/jinsoon/Work/Projects/experiments/diablo/diablo.html via chrome-devtools MCP, then __forceLoad(); __newGame('sorceress') or ('barbarian'); __enter('moor') / __enter('den'); a few __step(1/60) + __render(); take_screenshot. Compare before/after. If the browser profile is busy: pkill -f "chrome-devtools-mcp/chrome-profile". Backgrounded tabs throttle rAF -- always drive via __forceLoad/__step, never wait on animation.

Conventions: narrative comments matching the codebase voice, surgical diffs, no emoji, ES modules under src/. progress.md gets a What/Why/Next entry at phase end; update the Status block in polish-checkpoints.md.

Output: modified src/art/*.js (+ renderer/palette if needed), rebuilt diablo.html, and before/after screenshots presented to Joseph.

Post-completion checklist: mark the art task complete (TaskList has it as #4 if the task list persisted; otherwise note in progress.md); append the progress.md entry; update polish-checkpoints.md Status; this is the last planned phase, so no next resume prompt -- close with before/after screenshots and an honest list of what was and was not verified. Recommend /clear only if more work is queued and the window is worth shedding.
```
