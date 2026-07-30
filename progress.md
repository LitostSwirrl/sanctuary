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
a real Bash swing (5.9 damage, mana spent ~2) through the same production input path used
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

## The try-out polish batch (2026-07-29, in flight)

Joseph wanted the game sampleable without the grind, then flagged three gaps: no shop
scrolling, no music, and the whole look reading "Minecraft" when the target is Diablo 2 LoD.
Tracked in `polish-checkpoints.md`.

- **Maxed start** (done): `newGame` levels every character to the cap through `gainXp`, sets
  all 14 class skills to 20, spends stat points evenly, grants 50000 gold. One marked block
  in `main.js`; delete it to restore the level-1 start.
- **Best-in-slot gear** (done): `forgeItem` in `items/item.js` builds fixed-roll rares —
  same shape `rollItem` produces, mods handed in. `BEST_GEAR` in `main.js` defines per-class
  loadouts: six max-roll distinct-mod lines per slot, belts of top potions. Both classes
  verified in-browser: resists capped, sorc +6 per tree / 150 fcr, barb 115-168 per swing
  with 18% steal. A recalc now runs between equipping and `refreshPassives` so the masteries
  read the amulet's +skills the same way on a fresh start and a loaded save.
- **Next**: shop scroll wheel, then procedural BGM, then the LoD-direction art overhaul
  (figures, terrain, palette/light).

### Shop scrolling and the music engine (same day)

The vendor list now scrolls: `ui.vendorScroll` counts whole rows, the main loop feeds it
`Input.mouse.wheel` while the shop is open, and `drawVendor` clamps it, culls rows to the
viewport (no partial rows, so no clipping), and draws a track-and-thumb when the stock
overflows. Verified against a 20-row stock: clamp at 8, wheel both directions, thumb
position confirmed by pixel probe.

Music: `playMusic(mode)` in `audio/synth.js`, driven by `ambient(level)` so it follows area
transitions with no new wiring in main.js. Three moods from the same oscillator primitives
as the effects — camp: eight bars of finger-picked A-minor arpeggios (Am F C G / Am F Dm E)
over a swelling bass root; wilds: sparse pentatonic sines over the drone with whole bars of
rest; dungeon: a lowpass-noise war drum, sawtooth fragments on minor seconds and the
tritone, a rare slow shimmer. A 300 ms timer keeps 1.5 s scheduled ahead; a mode change
fades the whole bus in half a second. Verified in-browser: modes map town/moor/den
correctly, bars keep advancing, mute holds and releases, console clean. What no automation
can judge is whether it sounds good — that is Joseph's ear.

## The art overhaul, and the boost widened (2026-07-29)

**What.** The whole look moved toward Diablo 2 LoD. Figures: the shared skeleton went from
four-heads-tall chunk to five-and-a-half heads — legs as long as head and torso together, heads
about a fifth smaller, shoulders wider, a V-tapered trunk, a trapezius yoke welding arms to chest
(the outline pass used to sever them at the shoulder), deltoid-weighted upper arms, and robes that
are flared skirts stopping mid-shin instead of tubes. Shading: `shadeOf` in `art/pixel.js` now
recovers the implied sphere normal's z component, lights it, and picks from five ramp bands (new
`hi`/`deep` entries in `ramp()`) with a checkerboard dither at each boundary — capsules read as lit
volumes instead of three flat stripes. Ankles fade toward the ground and the renderer's blob shadow
tightened to a hard pool (1.05x radius, 0.46 alpha). Terrain: per-tile independent noise variants
are gone. Each terrain bakes one seamless 256x128 wrapping value-noise field and every tile cuts
its own 64x32 window by screen-lattice position (`getGround` indexes by `(wx-wy)&7, (wx+wy)&7`), so
texture flows across tile edges and the grid disappears; the broad octave is two tiles wide because
at one tile its blobs land in step with the lattice and the grid ghosts back. Built floors
(cobble/crypt) instead read as two-tile masonry slabs with per-slab tone. Walls lost their
per-block outline — that outline was most of the Minecraft look — and share three face variants
with seam joints; their tops are cut from the same field as the ground so a plateau reads as one
landform. Light: every area's ambient dropped roughly a quarter, pools got a hot core with a long
dim tail, the player torch tightened from 12 to 8.5 tiles and warmed, and a vignette multiplies
into the light buffer so corners sink no matter what the lights do. Terrain colours darker and
greyer across the board; skin tones out of toy-pink; trees darker and scragglier; rocks no longer
glow against the ground.

**Boost widened (same day, mid-flow request).** Gold is now 9,999,999; all three waypoints
(town, Cold Plains, Catacombs) come pre-lit on a new character; and the try-out gear is the
classic endgame loadout as real gold uniques. `items/uniques.js` grew a chase tier — Harlequin
Crest, Stone of Jordan, Mara's Kaleidoscope, The Oculus, Skin of the Vipermagi, Magefist, War
Traveler, Arachnid Mesh, Lidless Wall for the Sorceress; Schaefer's Hammer, Stormshield,
Shaftstop, Steelrend, String of Ears, double Bul-Kathos' Wedding Band for the Barbarian — names
and mod shapes verified against Arreat Summit (classic.battle.net), numbers cut to this slice per
the file's charter. `forgeItem` accepts a rarity/flavour opts argument, and `BEST_GEAR` in main.js
maps slot to unique name. The lower-gated pieces can also drop in the deepest floors. D2's green
sets (Tal Rasha's Wrappings, Immortal King) were confirmed real but this slice has no set-bonus
mechanics, so uniques stay the gold tier here.

**Trade-offs made knowingly.** Canon shapes replaced stat-stuffed forged rares: the Sorceress
drops to 216 life (glass cannon, as the original) while gaining +12 all skills and 120 fcr with
resists at the 75 cap; the Barbarian swings 141-577 with 18% steal and 49 flat damage reduction
but sits at 25 fire/poison resist — real D2 barbs ran under-capped too, and one line in
`uniques.js` retunes any piece if that stings in play.

**Measured.** Full art bake 358 ms against the ~600 ms budget (the field cuts are cheaper than
the old per-variant FBM and pay for the costlier figure shading). Render 1.82 ms median at
3840x1814. Console clean across load, both classes, all six areas, vendor, waypoint and
inventory panels.

**Not machine-verifiable here.** How the darkness feels in real play (a 27" monitor at night is
not a screenshot), whether 8.5 tiles of torch is too tight while kiting, and the balance of the
canon loadout against Andariel — those need Joseph's hands on it.

## The five-act effort (2026-07-29, in flight)

Joseph's ask: kill the constant hum in the BGM (it is the `ambient()` drone), expand both
classes to the skills they should have, and make the game five full acts. Scope decided the
same day: music stays procedural (fuller per-act score, no asset files), classic level-1
start with "yolo" selectable, canon-leaning act density with Act 1 expanded to keep up.

- Spec: `docs/superpowers/specs/2026-07-29-five-acts-design.md`
- Plan: `docs/superpowers/plans/2026-07-29-five-acts.md` (15 tasks, six phases)
- Checkpoints: `docs/superpowers/plans/2026-07-29-five-acts-checkpoints.md`

Mid-effort, Joseph reset the project's destination: **100% of a smaller, honest Diablo,
not 50% of the original** — completeness in one unlicensed file is the identity, parity is
not the goal. The README's "The goal" and "Roadmap" sections are now the durable statement
(definition of done, the three efforts after this one, and what is ruled out).

Phase log (What/Why/Next per phase):

- **Phase 1, spec + plan (done)**: the two documents above, committed `2e44543`/`be32fa2`.
  Why: the spec is the contract -- 60 exact skills, 35 exact areas, 15 music moods, budgets
  and a seven-point ship gate -- so implementation can fan out to workers without drift.
  Next: Phase 2, the music rewrite.
- **Phase 2, the music rewrite (done, 2026-07-29)**: the hum is dead and the score is real.
  What: the `ambient()` drone deleted; five voice primitives (a Karplus-Strong pluck that is
  pitch-true to ~2 cents at any register, pad, bell, shaker, bounded wind); one data-driven
  bar scheduler behind `scheduleBar`; fifteen per-act moods written in a Tidal-style
  mini-notation parsed by ~80 lines of our own; an offline `renderMood` harness whose drone
  check is behavioural (schedule stops at 6 s, the tail of a 20 s render must be silent) and
  demonstrably bites -- the old drone rebuilt as a control fails it by 529x while all fifteen
  moods measure bit-exact zero. Why it took five fix rounds on Task 1: Chrome adds a render
  quantum inside feedback loops (every pluck was flat), lowpass Q is denominated in decibels
  (the loop ran away), and the review chain kept refusing to let a guard sit at the wrong
  layer -- the mood-table surface is now poison-proof (60+ malformed cases degrade to a
  diagnosed part-silence, never a frozen scheduler). Commits `053091e..0e6fa0a`,
  `4ef926a`, `780e60b`, `46ace45`; bundle 437 KB.
  Not machine-verifiable: whether it sounds good. `__audio.playMusic(key)` with keys
  `a1`-`a5` x `.town/.field/.dungeon`; the +5 dB score presence is one constant
  (`MUSIC_LEVEL`, synth.js) if it sits too loud in the mix.
  Next: Phase 3, both classes to their canon thirty (plan Tasks 3-6).
- **Phase 3, sixty skills (done, 2026-07-30)**: both classes hold their canon
  thirty. What: Task 3 laid the machinery (hazards, pets, chain/beam/thrown,
  buff hooks with plusSkills/proc/stacks/onStruck, taunt that refuses bosses,
  corpse targeting); Task 4 the Sorceress's sixteen with req moves on her
  fourteen; Task 5 the Barbarian's sixteen plus polearm and spear bases; Task 6
  a six-tier tree panel with a scrolling bind picker. Gate swept 60/60: every
  skill allocated through the real panel, every castable spends exactly its
  printed mana, every effect measures true to its tooltip, old saves load
  byte-equal. Why the fix rounds: Task 4's damage-per-mana anchors were argued
  from arithmetic instead of measurement (meteor priced without its burn) --
  the round established the standing evidence bar: anchors are measured at a
  declared frame, and Blizzard/Thunder Storm were retuned on the corrected
  numbers; Task 5's round repaired a dangling else that put a Sorceress row on
  the Barbarian's sheet and made Battle Command's +1 leak permanently into
  cached passives (caches now read a buff-free level). A session crash mid-
  Task-4 (the July 29 API incident) was recovered from the ledger: the fix
  round finished on a Fable worker after the Opus lane died five times --
  ruling ledgered, the model split's floor is a floor. Deferred minors ride
  the SDD ledger for final-review triage (equip path never refreshes passive
  caches; meteor detonates on the cast frame when aimed dead-on; per-cache
  tooltip rule). Next: Phase 4, the act model and Act 1 at full density (plan
  Tasks 7-8).
- **Phase 4, the act model and Act 1 at full density (done, 2026-07-30)**: the
  world knows about five acts. What: every area carries its act; ACTS drives
  travel (Warriv's passage east, gated on Andariel, landing in a stub Lut
  Gholein that Phase 5 replaces); level cap 50 with the existing xp curve
  simply continued; save v2 with a one-place migration and the act field as a
  high-water mark; Act 1 grew to eight areas (Dark Wood, the Barracks, The
  Smith on its deepest floor) with the catacombs rewired behind them; the
  waypoint panel grew five act tabs; killing Andariel no longer ends the game
  -- she is act one's gate now, and the won screen waits for Baal. Along the
  way a pre-existing bug died: dying no longer refunds your own gold in the
  same frame (the walk-up pass now belongs to the living). Why: Task 7 read
  the xp formula and changed only a false comment -- the power law already
  priced 31-50; the save migration was designed once and reused; travelToAct
  is data-driven off ACTS so acts three through five need only defs and a
  town. All four reviews clean with zero fix rounds; every number reproduced
  empirically by independent reviewers. Next: Phase 5, acts two and three
  (art then world, sequentially -- the desert, the jungle, Duriel, Mephisto).
