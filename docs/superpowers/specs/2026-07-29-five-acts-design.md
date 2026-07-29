# Five Acts, Full Trees, Real Score -- Design

2026-07-29. Follows the vertical slice, the Barbarian, and the try-out polish batch.
Joseph's ask, verbatim: "there's a constant humming sound with our bgm. can we get some
real dungeon music assets? also please expland the skills to what the characthers should
have. And make it to 5 acts full."

Scope decisions returned the same day:

1. **Music stays procedural.** No asset files -- the zero-asset charter holds. The constant
   hum is the `ambient()` drone in `src/audio/synth.js` (two endless sine oscillators under
   every track); it dies. The score gets rewritten as fuller per-act compositions from
   synthesis.
2. **Classic start default, "yolo" selectable.** New Game asks Classic (level 1, earn
   everything) or Yolo (the maxed start with chase uniques). "Yolo" is Joseph's label.
3. **Canon-leaning acts, and Act 1 keeps up.** Every act is town + ~6 areas + mini-bosses
   + act boss. Act 1 grows from 4 areas to the same density.

## Non-goals

- No new playable classes (Sorceress and Barbarian only).
- No set-item mechanics, no runewords, no mercenaries, no difficulty tiers (Nightmare
  stays on the README backlog).
- No Arcane Sanctuary / Maggot Lair / Secret Cow Level; the act zone lists below are
  the whole world.
- No audio files, no image files, no fonts -- everything computed at load, as before.

## 1. Music: kill the drone, per-act score

### What goes

`ambient()` in `src/audio/synth.js` currently starts two never-ending sine oscillators
(48/72 Hz base + 1.5x partial, LFO-wobbled) alongside the music. That is the hum. The
drone oscillators are deleted; `ambient(level)` shrinks to mode selection only. The
`stopAmbient` export stays as a no-op shim until callers are cleaned.

### Architecture

One scheduler engine, fifteen mood definitions. `playMusic(key)` keeps its lookahead
scheduler (300 ms tick, 1.5 s ahead, bus-per-mode fade); what changes is that the three
hand-written schedulers become one engine reading `MOODS[key]`, where
`key = act key x {town, field, dungeon}` (e.g. `a2.dungeon`). `ambient(level)` derives
the key from `level.act` + `level.townCentre` + the existing dark heuristic.

New voice primitives, all built from the existing node vocabulary:

- **pluck** -- Karplus-Strong: a millisecond noise burst into a feedback DelayNode with a
  lowpass in the loop. Sounds like a plucked string instead of a triangle blip. This is
  the single biggest step toward "real" -- the Act 1 camp piece becomes an actual guitar
  figure. Tune the loop filter per mood (nylon vs oud vs marimba brightness).
- **pad** -- 3-4 detuned saws through a lowpass, slow attack, slow release.
- **bell** -- two sine partials at an inharmonic ratio (~2.76:1), fast attack, long
  exponential decay. Gongs and tolls.
- **drum** -- the existing `mthump`, plus a tighter high variant (shaker/rim) from short
  bandpassed noise.
- **wind** -- slowly filtered noise with LFO on the filter frequency; replaces the drone's
  atmospheric duty without a fixed pitch to hum.

Every mood is `{tempo, root, scale, bars: [chord roots], voices: {...level per primitive},
density, motifs}` and the engine schedules: chord/bass movement per bar, melodic cells
quantized to the scale, percussion pattern, and rare colour events. All pitch material is
scale-quantized -- dissonance only where a mood's motif table says so (dungeons).

### The fifteen moods (composition intent)

| Act | town | field | dungeon |
|-----|------|-------|---------|
| 1 Rogue Encampment | the existing Am guitar piece, replayed on pluck (Tristram vibe) | D dorian, sparse plucks over pad | war drum + low sawtooth motifs (current, kept, over a pad instead of a drone) |
| 2 Lut Gholein | D phrygian dominant plucks (oud-ish), soft hand-drum cycle | long pads, rare modal pluck phrases, wind | tombs: slow bell tolls, deep pad, sparse drum |
| 3 Kurast | bright short plucks an octave up (marimba-ish) + shaker | polyrhythmic drums, high shimmer cells | temple: gong bells, low pad chant, slow drum |
| 4 Pandemonium | thin high pad + one distant bell -- no camp warmth | dissonant pad clusters, deep irregular drum | chaos: fast war drums, tritone saw stabs, aggressive |
| 5 Harrogath | open-fifth pads, horn-like swells | wind + sparse fifths, cold | worldstone: big drums, low choir pad, bells |

### Verification (machine side)

Offline-render 10 s of each of the 15 moods: RMS above a silence floor, peak below clip,
and the sub-60 Hz band must NOT hold sustained energy across the whole window (the drone
regression test). Mode mapping checked per area over all five acts. Mute/unmute and
area-transition fades still clean. What no automation can judge is whether it sounds
good -- `window.__audio.play(key)` gives Joseph a one-call audition per mood, and his ear
is the gate.

## 2. Skills: 30 per class, canon-shaped

Both classes go from 14 to 30, matching Diablo 2's trees, with numbers cut to this
slice's scale (the same charter the uniques file uses). Rank cap stays 20. Req tiers
move to canon 1/6/12/18/24/30 (the cap rises to 50, so tier 30 is reachable; existing
saves keep their allocated points -- gates only bind future allocation).

### Sorceress (existing 14 keep their ids; 16 new)

**Fire**: Fire Bolt (1), Warmth (1, passive), Inferno (6, cone burst), Blaze (12, fire
trail hazard behind the caster), Fire Ball (12), Fire Wall (18, ground hazard line),
Enchant (18, weapon fire buff, castable on self), Meteor (24), Fire Mastery (30),
Hydra (30, stationary turret entity spitting fire bolts for a duration).
Chains: firebolt->fireball->meteor; inferno->blaze->firewall->hydra; warmth->enchant;
firemastery keeps prereq fireball.

**Cold**: Ice Bolt (1), Frozen Armor (1, defence buff + chills melee attackers), Frost
Nova (6), Ice Blast (6, single-target freeze), Shiver Armor (12), Glacial Spike (18,
AoE freeze projectile), Blizzard (24, area hazard raining ice over time), Chilling
Armor (24), Frozen Orb (30), Cold Mastery (30).
Chains: icebolt->iceblast->glacialspike->blizzard->frozenorb; frozenarmor->shiverarmor->
chillingarmor; frostnova keeps icebolt; coldmastery keeps frostnova.

**Lightning**: Charged Bolt (1), Static Field (6), Telekinesis (6, ranged zap +
knockback/short stun), Nova (12), Lightning (12, instant beam down a line), Chain
Lightning (18, re-aims at the nearest untouched enemy on each hit; hop count grows
with rank), Teleport (18, moves from req 6),
Thunder Storm (24, buff: periodic strike on a random nearby enemy), Energy Shield (24,
buff: portion of damage taken paid from mana), Lightning Mastery (30).
Chains: chargedbolt->lightning->chainlightning->thunderstorm; staticfield->nova;
telekinesis->teleport and telekinesis->energyshield; lightmastery keeps nova.

### Barbarian (existing 14 keep their ids; 16 new)

**Combat**: Bash (1), Double Swing (6), Leap (6), Stun (12), Double Throw (12, two
weapon-damage axe projectiles, any weapon), Leap Attack (18, leap + weapon AoE on
landing), Concentrate (18), Frenzy (24, hit grants stacking swing-speed buff),
Whirlwind (30), Berserk (30, big damage multiplier, defence to 0 for a beat).
Chains: bash->stun->concentrate->berserk; doubleswing->doublethrow->frenzy;
leap->leapattack; whirlwind prereq [concentrate, leapattack].

**Warcries**: Howl (1), Find Potion (1, targets a corpse, rolls a potion, consumes it),
Taunt (6, forces a monster to close and swing, small damage/AR debuff), Shout (6),
Find Item (12, targets a corpse, rolls loot, consumes it), Battle Cry (18), Battle
Orders (24), Grim Ward (24, plants a totem hazard that pulses fear), War Cry (30),
Battle Command (30, +1 all skills buff for a duration).
Chains: howl->shout->battleorders->battlecommand; howl->taunt->battlecry->warcry;
findpotion->finditem; grimward prereq taunt.

**Masteries** (all passive, standalone): Sword (1), Axe (1), Mace (1), Polearm (6),
Throwing (6, boosts Double Throw), Spear (12), Increased Stamina (12 -- adapted: +max
life %, since the slice has no stamina bar; documented in its tooltip), Iron Skin (18,
moves from 12), Increased Speed (24, +run speed), Natural Resistance (30, +all resists).

### Engine mechanics the new skills need

- **Ground hazards**: `level.hazards` array `{x, y, r, element, dps, until, ...}` ticked
  from the main update; damage on overlap with the usual throttles. Serves Fire Wall,
  Blaze, Blizzard (with falling-ice fx), Grim Ward (fear pulse instead of damage).
- **Turret pet**: Hydra -- a non-blocking entity with a lifetime that fires fire bolts at
  the nearest waked monster. Monsters do not target it (documented simplification).
- **Chain projectile**: Chain Lightning re-aims at the next nearest untouched enemy on
  hit, up to its hop count.
- **Beam**: Lightning damages everything along a line instantly with a drawn bolt fx.
- **Armor buffs + retaliation**: the buff system gains an `onStruck` hook (melee hit on
  the player) so the three cold armors chill/damage the striker.
- **Periodic proc buff**: Thunder Storm ticks on its own timer while active.
- **Damage redirect**: Energy Shield takes its cut before life, capped by current mana.
- **Corpse targeting**: Find Potion/Find Item click a corpse (corpses already persist
  for resurrect); consumed corpses cannot be raised or re-looted.
- **Forced aggro**: Taunt overrides flee/shyness and pins the target on the player.
- **Stacking buff**: Frenzy stacks decay individually; sheet shows current stack count.

### UI

- The tree panel lays each tree out on six req-tier rows (1/6/12/18/24/30), up to two
  icons per row per tree, prereq lines preserved. Three trees stay side by side.
- The skill picker lists all 30, grouped by tree, scrolling if needed.
- Icons stay procedural: element glyph variants for the Sorceress additions, `iconSeed`
  extensions for the Barbarian's. `ICON_BAKE_STEPS` stays data-derived.
- The yolo boost grants all 30 class skills at 20 (600 virtual points -- it is a boost,
  not a build).

### Verification

The formula-check harness extends to all 60: allocation gates (level, prereq, points,
cap 20), printed mana cost equals spent mana, tooltip claims match behaviour probes (a
hazard damages inside r and not outside; Chain Lightning touches N distinct targets;
Energy Shield drains mana by its exact split; Find Item consumes the corpse; Taunt
overrides flee; Frenzy stacks and decays on schedule). Both classes' existing 14 must
pass unchanged (req-tier moves acknowledged in the harness).

## 3. World: five acts

### Act model

`AREAS` entries gain `act: 1..5`. A new `ACTS` export names each act, its town, and its
travel NPC. The waypoint panel groups by act (five tabs). Act travel: each town's travel
NPC -- Warriv (1 to 2), Meshif (2 to 3 and again 3 to 4), Tyrael (4 to 5) -- offers
passage onward once that act's gate quest flag is set; arriving lights the destination
town's waypoint. All town waypoints are also cross-act waypoints once lit.

### Zone lists (35 areas)

Ids in parentheses; areaLevel after the colon; `dungeon dN` = a dungeon of N floors;
`wp` = waypoint. All outdoor unless marked.

**Act 1 -- Rogue Encampment** (existing six keep their ids)
town: 0. Blood Moor (moor): 1. Den of Evil (den, dungeon d3): 3, Corpsefire, quest +1
skill. Cold Plains (coldplains): 5, wp. Burial Grounds (burial): 7, Blood Raven.
Dark Wood (darkwood, NEW): 8, wp. Barracks (barracks, NEW, dungeon d3): 9, The Smith.
Catacombs (catacombs, dungeon d4): 11, wp, Andariel (gate). Chain: town->moor->
coldplains->darkwood->barracks->catacombs; den off moor; burial off coldplains.

**Act 2 -- Lut Gholein** (desert)
town (lutgholein): wp. Sewers (sewers, dungeon d2): 13, Radament, quest +1 skill.
Rocky Waste (rockywaste): 13. Dry Hills (dryhills): 15, wp. Far Oasis (faroasis): 16.
Lost City (lostcity): 17, wp. Claw Viper Temple (vipertemple, dungeon d2): 18. Tal Rasha's Tomb (talrasha, dungeon d3): 19, Duriel (gate).
Chain: town->rockywaste->dryhills->faroasis->lostcity->vipertemple(stairs)->talrasha;
sewers off town (stairs).

**Act 3 -- Kurast Docks** (jungle)
town (kurast): wp. Spider Forest (spiderforest): 21. Great Marsh (greatmarsh): 22, wp.
Flayer Jungle (flayerjungle): 23. Kurast Bazaar (bazaar): 24, wp. Travincal
(travincal): 25, Council mini-boss trio (one named unique + elite pack). Durance of
Hate (durance, dungeon d3): 26, Mephisto (gate). Chain: linear; durance via stairs
under Travincal.

**Act 4 -- Pandemonium Fortress** (hell; canon act 4 is short and stays short)
town (fortress): wp. Outer Steppes (steppes): 28. Plains of Despair (despair): 29,
Izual, quest +2 skills. City of the Damned (damned): 30, wp. River of Flame (flame,
dungeon d1, lava): 31, Hephasto, wp. Chaos Sanctuary (chaos, dungeon d1): 32,
Diablo (gate). Chain: linear; flame and chaos are stairs.

**Act 5 -- Harrogath** (snow)
town (harrogath): wp. Bloody Foothills (foothills): 35, Shenk. Frigid Highlands
(highlands): 36, wp. Arreat Plateau (plateau): 37. Crystalline Passage (crystalline,
dungeon d2, ice): 38, wp. The Ancients' Way (ancientsway): 39, The Ancient (a single
guardian; quest grants a large xp bounty). Worldstone Keep (worldstone, dungeon d3):
40, wp. Throne of Destruction (throne, dungeon d1): 41, Baal (victory). Chain: linear.

areaLevels between listed anchors interpolate; act bosses sit 1-2 above their floor.

### Terrain and props

New terrains (ground + wall each): **sand** (dunes, soft unbuilt walls), **sandstone**
(built -- Act 2 town accents, tombs, temple), **jungle** (dense dark green ground; tall
unbuilt foliage walls), **temple** (built mossy stone -- Act 3 bazaar/travincal/durance),
**obsidian** (built -- Act 4 fortress and chaos), **ice** (Act 5 dungeons; snow already
exists for ground, blood already exists and becomes Act 4's scorched ground). Palettes
follow the LoD-dark direction of the art overhaul; the seamless-field pipeline is reused
untouched.

New props: palm, cactus, obelisk, sarcophagus, urn, fern, vine, idol, hellspike,
lavavent (emits a light pool like the brazier), icicle, frozencorpse, banner. Reuse
existing props freely (rocks, bones, columns, braziers, gravestones).

### Monsters and figures

New monster defs per act, with the figure economy split between genuinely new
silhouettes and palette/detail reskins of existing specs (a reskin is a new
FIGURE_SPEC entry sharing the pose recipe -- cheap to author, still a bake step):

- **Act 2**: sandraider (new), vulturedemon (new, winged), sandmaggot (new, low
  crawler), scarab (new, small; lightning-enchant flavour), mummy (zombie reskin),
  greatermummy (mummy reskin, caster -- Radament's kind), clawviper (new, serpent).
  Skeletons reused. Bosses: Radament (greatermummy unique), **Duriel** (new, big).
- **Act 3**: flayer (fallen-frame reskin), flayershaman (shaman reskin), thornhulk
  (new, big treeman), giantspider (new), zealot (new humanoid), councilmember (zealot
  reskin, caster). Bosses: Council (councilmember unique + pack), **Mephisto** (new,
  floating).
- **Act 4**: doomknight (new armoured humanoid), oblivionknight (doomknight reskin,
  caster), balrog (new, big winged), urdar (new, bulky mauler). Bosses: Izual (balrog
  reskin, cold-blue, big), Hephasto (urdar reskin with hammer), **Diablo** (new, big).
- **Act 5**: enslaved (fallen reskin, imp-ish), deathminion (new, bulky), succubus
  (new, winged humanoid caster), frozenhorror (new, yeti), moonlord (balrog reskin).
  Bosses: Shenk (deathminion unique), The Ancient (barbarian-figure reskin, statue
  bronze), **Baal** (new, big).

Tally: 18 new silhouettes (five of them act-boss-grade) + ~11 reskins = ~29 figure
specs on top of the existing 18. Each area's monster mix, pack sizes and
weights follow the Act 1 pattern; every act introduces its roster early and its
elite variants deep.

### NPCs

Every act town gets 4-6 NPCs on the existing services framework, reusing the six baked
townsfolk figures (and Cain's) as-is -- no new NPC bakes, accepted cheapness. Canon
names: Act 2 Fara (heal+trade), Drognan (trade), Elzix (gamble+trade), Meshif (travel),
Cain. Act 3 Ormus (heal+trade), Hratli (trade), Alkor (gamble+trade), Meshif (travel),
Cain. Act 4 Jamella (heal+trade), Halbu (trade), Tyrael (travel -- opens the portal),
Cain. Act 5 Malah (heal+trade), Larzuk (trade), Anya (gamble+trade), Qual-Kehk,
Cain. Each has 2-3 dialogue lines in period voice, as Act 1 does.

### Items

- New base kinds **polearm** (voulge t1, halberd t2, war scythe t3 -- twoHand) and
  **spear** (spear t1, trident t2, pike t3 -- twoHand), so the two new masteries have
  something to master; icons.js learns both shapes.
- One tier-4 base per existing kind (sword/axe/mace/blade/wand/staff/orb/body/helm/
  shield, plus polearm/spear t4) gated to Act 3+ areaLevels, so late acts drop
  visibly better bases. Affixes already scale by ilvl; the chase uniques and their
  deep-floor drop rule are untouched.

### Generators

The existing outdoor and dungeon generators cover every new area via terrain/prop/size
parameters. The only new generator feature: `lava` flag (River of Flame) pools
impassable glowing channels using the existing water/void mechanism if one exists, else
solid hazard strips with lavavent light props. Boss floors reuse the Andariel lair
pattern. `verifyReachable` and the prop-collision fallback apply to all 35 defs.

## 4. Progression, start modes, balance

- **Level cap 50** (from 30). XP curve extends with the same shape; skill points stay
  1/level, stat points 5/level. Quest skill points: den +1, radament +1, izual +2 --
  a capped classic character allocates 53 points against 30-point trees: builds are
  real choices, as intended.
- **Classic start**: level 1, starter kit (existing pre-boost newGame path), Act 1 town.
  Pacing target: Andariel ~12-14, Duriel ~20-22, Mephisto ~27-29, Diablo ~33-35,
  Baal ~40-45. Monster xp/stat scaling via the existing `scaleStat` against the new
  areaLevels; tune xp curve constants until scripted kill-path probes land in those
  bands (automated: simulate kills along the golden path, assert level bands).
- **Yolo start**: the current boost block, updated -- level 50, all 30 class skills at
  20, chase uniques, 9,999,999 gold, all waypoints in all five acts lit.
- **New Game flow**: class select gains a second row: Classic / Yolo. Default Classic.
  Save files record nothing new -- yolo is a start condition, not a mode.
- **Save compatibility**: saves carry a version; v1 saves load with `act` defaulted
  from area id, keep their skills (req-tier moves only gate future points), and cap
  raise applies silently. A saved position inside a rewired area falls back to the
  area entrance (continueGame already snaps off blocked tiles).

## 5. Budgets

| What | Budget | Note |
|------|--------|------|
| Cold bake to title | <= 1.6 s | ~28 new figures + 6 terrains + 13 props + icons on top of today's ~590 ms. If measured worse: named fallback is bake-behind-title (core set first, rest during the menu), not asset cuts. |
| Frame time | <= 16.67 ms p95 | measure in the heaviest new scene (Act 4/5 packs, hazards burning, Whirlwind live) |
| Bundle | single diablo.html, no external refs | expect ~550-700 KB; still file:// runnable |
| Music CPU | inaudible scheduling cost | 15 moods share one engine; only one plays |

## 6. Ship gate (Phase 7 verification contract)

All automated against the built `diablo.html` in a real browser, plus one file:// leg:

1. Full golden-path traversal: every one of the 35 areas entered through its real exits
   in both directions; every waypoint lights and travels, across acts.
2. All boss kill paths: Corpsefire, Blood Raven, The Smith, Radament, Duriel, Council,
   Mephisto, Izual, Hephasto, Shenk, The Ancient, Baal -- and the four gate quests
   unlock act travel; Baal completes the game (victory toast, flag saved).
3. 60-skill harness green (section 2); 15-mood music harness green (section 1).
4. Classic pacing probes inside the level bands (section 4); a fresh yolo Sorceress and
   Barbarian each one-shot their way to any act 5 area without console errors.
5. Save round-trip mid-Act-3 preserving act, waypoints, quests, buffs excluded as
   before; a pre-effort v1 save loads and plays.
6. Generation sweep: every area def x 30 seeds -- zero unreachable exits after the
   fallback, zero orphan spawns.
7. Budgets measured and recorded in progress.md; console clean throughout; file://
   smoke run (load, newGame both modes, walk, one swing, one cast).

## 7. Phases

Phase 2 music; Phase 3 skills; Phase 4 act model + Act 1 expansion + progression
scaffolding; Phase 5 Acts 2-3; Phase 6 Acts 4-5; Phase 7 start modes, balance, ship
gate. Detail lives in the plan (`docs/superpowers/plans/2026-07-29-five-acts.md`).
Every phase ends with its own in-browser verification before the next begins, per the
project's standing practice.
