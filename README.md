# Sanctuary

A small Diablo 2 in the browser. No image, audio or font files ship with it — every sprite,
tile, item icon and sound effect is computed at load, in about a second.

## Run it

```
node serve.js          # then open http://localhost:8231
```

Or build the standalone file and open it directly, no server needed:

```
node build.js          # writes diablo.html, ~300 KB, one file
```

There are no dependencies to install. Node is used only for the two scripts above.

## Controls

| Input | Action |
|-------|--------|
| Left click | move, attack, pick up, open a chest, talk to the vendor |
| Right click | cast the bound skill |
| `1`–`4` | drink the belt potion in that slot |
| `I` | inventory |
| `C` | character sheet |
| `T` | skill tree — left click spends a point, right click binds to right mouse |
| `Tab` | map overlay |
| `Alt` (hold) | show every item name on the ground |
| `Space` / `Esc` | close panels |
| `M` | mute |

Drag items between the bag and the paperdoll. Right click an item in the bag to equip it, or a
potion to send it to the belt. Drop something outside the panel and it lands on the floor.

## What is in it

Six areas — Rogue Encampment, Blood Moor, Den of Evil, Cold Plains, Burial Grounds, Catacombs —
generated from a seed, ending at Andariel. Nine monster types plus three bosses, with champion and
unique packs that carry modifiers like Extra Fast and Cold Enchanted. Fourteen Sorceress skills
across three trees with real synergies: points in Fire Bolt raise Fire Ball's damage. Forty-two
item bases, sixty affixes gated by item level, sixteen fixed uniques, and a grid inventory that
honours item footprints.

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
  game/              entity, combat formulas, player, monsters, AI, skills, projectiles, loot
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
| Generate all art (11 figures, 7 terrains, 12 props, 179 icons) | about 1 s |
| Frame time, 3840x1858, 89 live monsters | 2.6 ms median, 6.5 ms at p95, budget 16.67 ms |
| Level generation | 1–17 ms per area |
| Standalone bundle | 303 KB, 35 modules, one file |

## Notes

- Saves keep only the character and the world seed. Areas regenerate from the seed, so the map is
  identical every time and monsters come back, exactly as in the original. Quest flags persist, so
  a slain boss stays slain.
- Serve with `node serve.js`, not `python3 -m http.server`. It sends `no-store`; a cached ES module
  once made a real fix look like it had failed.
- Development notes, the design spec and the phase-by-phase verification record are in
  `progress.md` and `docs/superpowers/`.

## Not included

Multiplayer, mercenaries, rune words, gems and sockets, gambling, the stash, difficulties above
Normal, and acts two through five.
