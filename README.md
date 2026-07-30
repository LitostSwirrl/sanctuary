# Sanctuary

A small Diablo 2 in the browser. No image, audio or font files ship with it — every sprite,
tile, item icon and sound effect is computed at load, in about a second.

## Run it

Play it in a browser: **https://litostswirrl.github.io/sanctuary/**

Or locally:

```
node serve.js          # then open http://localhost:8231
```

Or build the standalone file and open it directly, no server needed:

```
node build.js          # writes diablo.html, ~650 KB, one file
```

There are no dependencies to install. Node is used only for the two scripts above.

## Controls

| Input | Action |
|-------|--------|
| Left click | move, attack, pick up, open a chest, talk to whoever is standing there |
| Right click | cast the bound skill |
| `1`–`4` | drink the belt potion in that slot |
| `I` | inventory |
| `C` | character sheet |
| `T` | skill tree — left click spends a point, right click binds to right mouse |
| `Tab` | map overlay |
| `Alt` (hold) | show every item name on the ground |
| `Space` / `Esc` | close panels |
| `M` | mute |

Click something out of reach and you walk over and do it on arrival, rather than clicking twice.
The cursor says what a click will do: a red bracket over something you can kill, gold over someone
you can talk to, green over something you can pick up.

The two boxes either side of the belt are the bound skills. Click one to choose what that mouse
button does — either button takes any skill you have a point in, or the plain attack. The belt
slots on the bar are clickable as well as bound to `1`–`4`.

Drag items between the bag and the paperdoll. Right click an item in the bag to equip it, or a
potion to send it to the belt; right click something you are wearing to take it off. Drop
something outside the panel and it lands on the floor.

## What is in it

Five acts and thirty-seven areas, generated from a seed — the Rogue Encampment down through the
Catacombs to Andariel, Lut Gholein and the desert to Duriel, Kurast and the jungle to Mephisto,
the Pandemonium Fortress and the River of Flame to Diablo, then Harrogath and Mount Arreat to
Baal in the Worldstone Chamber. Twenty-nine monster types plus fourteen quest bosses, with
champion and unique packs that carry modifiers like Extra Fast and Cold Enchanted. Four of the
bosses are act gates: kill her and the caravan master will take you east. Two playable classes,
Sorceress and Barbarian, with sixty skills across six trees — the Sorceress's three have real
synergies (points in Fire Bolt raise Fire Ball's damage), the Barbarian's trees lean on weapon
masteries and warcries that root a pack in fear or leave it stunned. Seventy-one item bases
across nine weapon classes, sixty affixes gated by item level, thirty-two fixed uniques, and a grid
inventory that honours item footprints. Fifteen moods of procedural score, one per act per place,
so the town, the field and the dungeon each sound like where you are.

Six people stand in the encampment and each of them does something. Akara heals you and sells
casting gear; Charsi deals in steel; Gheed gambles, which is to say you buy the base type and find
out what it turned into afterwards; Deckard Cain names what you are carrying. Rares and uniques
come out of the ground unidentified and cannot be worn until he does. Kashya and Warriv talk, and
what they say tracks which of the three quests you have finished.

Loot is not only what falls off a corpse. Every area outside town is seeded with items when it is
generated — a few in the open, most tucked against a rock or a gravestone or behind a tree.

The rules follow the original rather than approximating it. Chance to hit weighs attack rating
against defence with a level term and clamps to 5–95. Life and mana derive from vitality and energy
on the Sorceress table. Resistances cap at 75, and masteries pierce resistance rather than raising
damage, so a mastery can drive a monster's resistance below zero.

## How the art works

There is one skeletal poser. It computes joints in a body-local frame, rotates them by facing,
projects them with the same 2:1 isometric ratio the tiles use, then depth-sorts the limbs and
rasterizes them as tapered capsules. A creature is a palette and a dozen proportions, not a
drawing — which is why eleven of them cost 266 ms to build.

Nothing uses the Canvas path API for sprite work; it antialiases, and antialiased pixel art turns
to mush when scaled. Every shape goes through hand-written rasterizers into a raw pixel buffer.

The lighting is the part that makes it read as Diablo 2. The scene paints at full brightness, then
a third-resolution buffer is filled with the area's ambient colour, has every light added to it,
and is multiplied over the whole frame. Corners of rooms genuinely go dark, and a fireball
genuinely lights the room it flies through.

Sound is oscillators and filtered noise, built when an effect fires and torn down when it
finishes. Because each effect is a function of a few numbers, a pack of Fallen dying does not sound
like the same click twelve times.

## Layout

```
index.html   serve.js   build.js
src/
  main.js            state machine, areas, quests, death, save wiring
  core/              rng, isometric camera, fixed-timestep loop, input
  art/               pixel rasterizers, palettes, figure poser, tiles, icons, particles
  audio/             synthesized effects
  world/             level container, generators, A* with clearance-aware smoothing
  game/              entity, combat formulas, player, monsters, AI, npcs, skills, projectiles, loot
  items/             bases, affixes, uniques, rolling and presentation
  render/            renderer with the light buffer, minimap
  ui/                HUD, panels, tooltips
  save.js
```

Dependencies run one way: `core` → `art`/`audio` → `items` → `world`/`game` → `render`/`ui` →
`main`. Monster behaviour reaches the rest of the game only through a context object passed in, so
`ai.js` imports neither the projectile system nor the world.

## Measurements

| What | Result |
|------|--------|
| Generate all art (17 figures, 7 terrains, 18 props, 217 icons) | 358 ms to the title screen |
| Generate all art (18 figures, Barbarian added) | 570-598 ms to the title screen (5 fresh reloads, median 587 ms — see progress.md) |
| Generate all art (five acts: 48 figures, 13 terrains, 31 props, icons) | 880-893 ms bake, 911 ms from navigation to the title screen (budget 1600 ms); an independent run on another machine measured 923-952 ms, so read these as best-case |
| Frame time, 2400x1472, Catacombs | 0.9 ms median, 1.3 ms at p95, budget 16.67 ms |
| Frame time, Whirlwind live, 51-monster Den of Evil | 1.9 ms median, 3.8 ms at p95, budget 16.67 ms |
| Frame time, worst of four five-act scenes (River of Flame, 47 monsters, 69 hazards burning) | 2.6 ms median, 3.4 ms at p95, budget 16.67 ms; an independent run on a heavier scene and another machine measured 8.3-10.9 ms at p95, so read this as best-case too |
| Level generation | 1–17 ms per area |
| Generation sweep, 37 areas × 30 seeds | 1110 levels: 0 unreachable exits, 0 waypoints you cannot walk up to, 0 orphan spawns |
| Standalone bundle | 651 KB, 36 modules, one file |

## Notes

- Saves keep only the character and the world seed. Areas regenerate from the seed, so the map is
  identical every time and monsters come back, exactly as in the original. Quest flags persist, so
  a slain boss stays slain.
- Serve with `node serve.js`, not `python3 -m http.server`. It sends `no-store`; a cached ES module
  once made a real fix look like it had failed.
- Development notes, the design spec and the phase-by-phase verification record are in
  `progress.md` and `docs/superpowers/`.

## The goal

**100% of a smaller, honest Diablo — not 50% of the original.** (Set 2026-07-29.) The identity
of this artifact is being a complete, coherent action-RPG in one file well under a megabyte,
with nothing downloaded and nothing licensed — which is a thing Diablo 2 itself cannot be.
Chasing parity would eventually pressure exactly the constraint that makes the project
interesting: the moment "real" music or art files feel necessary, the charter is broken. So
the finish line is defined by completeness, not comparison.

Done means: five acts ending at the Worldstone; the classic five classes, each with its
thirty-skill trees; Normal, Nightmare and Hell; an item endgame of sets, sockets, gems and the
cube's core recipes on top of the affix system that already rolls correctly; all of it
ship-gated in one file:// runnable html. When that list is empty, the project is finished.

Two caveats, stated plainly rather than promised around. By rough count of content — acts,
areas, skills, bases, monsters — this lands somewhere near a quarter of D2 once the five-act
effort ships, and the rest of the list needs no technology the codebase does not already
have: a class is a figure, a tree and data (the Barbarian proved the pattern); difficulties
are scaling tables plus immunities; sets and sockets extend the item roller. By production
values, no: D2's atmosphere is thousands of hand-painted sprites, recorded voice acting and
Matt Uelmen's guitar, and computed art has a real ceiling well short of that. The darkness,
the light pools and the plucked-string score get further than you might expect, and that is
where the pushing stops.

## Roadmap

Effort-sized, in order. Each lands ship-gated or not at all.

1. **Five acts, full trees, real score** — shipped 2026-07-30. The hum is dead and fifteen
   per-act moods play in its place; both trees reach thirty; the world runs from the Rogue
   Encampment to the Worldstone Chamber — 37 areas, fourteen quest bosses, four act gates,
   Baal at the end of it. Spec, plan and the ship-gate record under `docs/superpowers/`.
2. **The other three** — Amazon, Necromancer, Paladin. Per the Barbarian pattern each is a
   figure, a tree and data; the Necromancer's summons ride the pet machinery Hydra added,
   Paladin auras ride the buff hooks, and the Amazon brings bows, the one genuinely new
   piece. Assassin and Druid only after the classic five feel right.
3. **Nightmare and Hell** — the designed Nightmare (the Barbarian plan's Task 9 carries the
   full mechanics) generalized to two more tiers, plus monster immunities, with affix and
   loot tiers following ilvl as they already do.
4. **The item endgame** — set bonuses, sockets and gems, the cube's core recipes.

Fine additions that are not on the list and not required for 100%: mercenaries, runewords,
the stash.

## Ruled out

Multiplayer (a different engineering universe, and it contradicts the single file),
level-99-scale endgame grind (it only makes sense with multiplayer economies), and any
external asset ever — image, audio or font. The constraint is the product.
