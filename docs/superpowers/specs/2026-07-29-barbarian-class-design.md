# The Barbarian — second character class

2026-07-29. Follows the vertical-slice spec of 2026-07-28; that document still describes the
game. This one describes the first thing added to it.

## Why this, of everything not included

The slice ends: Andariel dies and there is no reason to play again. The backlog in the README
(mercenaries, runewords, sockets, stash, Nightmare, Acts II–V) is all depth or breadth for a
second run nobody has a reason to start. A second class is the reason. It also happens to be
the feature that proves the systems are systems — the poser, the skill trees, the combat
formulas and the save were all written class-shaped but have only ever held one class.

Alternatives considered: an itemization pack (sockets, gems, runewords) is well-bounded but
adds depth to a game you still only play once; Act II is mostly more data through the same
pipelines; Nightmare alone is cheap but thin. The Barbarian subsumes the argument for all
three: he makes the second run exist. Nightmare stays in as a stretch goal because it
compounds with him.

## What the player sees

New Game asks a question it never asked before: Sorceress or Barbarian. Two cards, a portrait
each (blit of the baked idle sprite, scaled with hard pixels), a line of flavour, Esc backs
out. Continue never asks — the save knows.

The Barbarian starts in the encampment with a Hand Axe, 55 life, 10 mana, and Bash bound to
the right mouse button the way Fire Bolt is for the Sorceress (one granted point pays for
it). Kashya no longer says "Another sorceress." to him. His skill tree shows Warcries,
Combat and Masteries — never the Sorceress trees, and hers never show his. His character
sheet shows Attack Speed where hers shows Faster Cast Rate.

He plays melee: weapon damage, attack rating against defence, the hit landing on frame 3 of
a two-handed swing that the poser has never had to draw before. Warcries are his casts —
instant, self-centred, on the existing cast path and animation. Leap and Whirlwind move him,
the way Teleport moves her.

## Class data

`CLASS_STATS.barbarian` (combat.js), D2 Normal values:

| | str | dex | vit | ene | life | mana | lifePerVit | manaPerEne | lifePerLevel | manaPerLevel |
|---|---|---|---|---|---|---|---|---|---|---|
| barbarian | 30 | 20 | 25 | 10 | 55 | 10 | 4 | 1 | 2 | 1 |
| sorceress (existing) | 10 | 25 | 10 | 35 | 40 | 35 | 2 | 2 | 1 | 2 |

`stamina`/`blockBase` follow the existing dead-field convention (92 / 20). Starting kit:
plain identified Hand Axe equipped, 80 gold, no potions — the axe is his firebolt-point.

## The fourteen skills

Three new trees: `combat` (Combat), `cries` (Warcries), `mastery` (Masteries). Entries are
appended after the Sorceress block in `SKILLS` — `bakeSkillIcon` derives pip patterns from
array position, so insertion would silently restyle her icons. Every new skill sets an
explicit `iconSeed` anyway.

Levels below are skill level `L` (hard points + gear). ED = enhanced weapon damage. All melee
skills roll to-hit like the plain attack; warcries do not (D2 behaviour).

### Combat

| Skill | req | prereq | mana | Effect at L / growth |
|---|---|---|---|---|
| Bash | 1 | — | 2 | Weapon hit, ED +50% +8%/L, AR +20 +5/L, knocks the target back 0.7 tiles |
| Double Swing | 6 | Bash | 1 | Two weapon hits: the target, then the nearest other monster within reach; AR +15 +5/L each |
| Leap | 6 | — | 3 | Jump to a point up to 5 +0.25/L tiles away; landing knocks enemies within 1.5 back and stuns 0.4 +0.05/L s |
| Concentrate | 18 | Bash | 2 | Weapon hit, ED +60% +10%/L, AR +30 +5/L. Synergy: Bash +5% ED per point |
| Whirlwind | 24 | Concentrate | 12 | Travel toward the clicked point (max 7 tiles) in a straight line, stopping early at the first blocked tile; every 0.15 s en route, a weapon hit at ED −50% +10%/L against everything within 1.5 |

### Warcries

All instant, centred on the Barbarian, cast animation (the symmetric two-arm gesture reads
as a shout). Bosses (`def.boss`) are immune to fear and stun, as monsters are to neither
chill nor Static Field today.

| Skill | req | prereq | mana | Effect at L / growth |
|---|---|---|---|---|
| Howl | 1 | — | 4 | Monsters within 4 tiles flee for 3 +0.4/L s |
| Shout | 6 | Howl | 6 | +100% +10%/L defence for 20 +5/L s |
| Battle Cry | 18 | Howl | 5 | Enemies within 3.5: −50% defence, −25% damage for 12 +1/L s |
| Battle Orders | 24 | Shout | 7 | +30% +3%/L max life and mana for 30 +6/L s |
| War Cry | 24 | Battle Cry | 10 | Phys 18–28, +6/+8 per L, within 3 tiles; stun 1 +0.1/L s (cap 3). Synergies: Howl +6%, Battle Cry +6% per point |

### Masteries (passive)

+28% +8%/L ED and +28 +8/L AR while wielding that weapon `kind`. Iron Skin: defence
+30% +10%/L, always. Staggered reqs because the tree panel fits two icons per tier row:

| Skill | req | kinds covered |
|---|---|---|
| Axe Mastery | 1 | `axe` |
| Mace Mastery | 1 | `mace` |
| Sword Mastery | 6 | `sword`, `blade` |
| Iron Skin | 12 | — |

## Mechanics that do not exist yet

**Melee skill path.** Skills today never roll to-hit and `doCast` forces the cast animation
plus a flat FCR lockout. Melee skills carry `melee: true`; `doCast` branches: attack
animation, `busy = 0.42 / attackSpeed`, `hitFrame: 3`, and the skill's effect runs in the
hit-frame callback — validated and mana-paid up front through `castSkill` as today, with
`cast()` returning false (existing veto-and-refund semantics) when no target is in reach.
A shared helper rolls weapon damage (`rollDamage` over `minDamage/maxDamage/ed/str`) with
the skill's ED and AR bonuses folded in.

**Timed buffs.** `player.buffs = { id: { t, mag } }`, ticked in `player.update`, folded into
`recalc` (Shout → defence multiplier, Battle Orders → max life/mana multiplier; on expiry
current life/mana clamp to the lowered max). Recalc already runs on equip; buffs call it on
apply and expiry.

**Monster stun, fear, debuff.** `m.stunned` (timer: AI takes no action, movement stops),
fear via the existing flee state (`state = 'flee'`, `fleeTimer = duration` — the machinery
champions already use when their leader dies), and `m.battlecry = { def, dmg, t }` read by
the to-hit roll against his defence and by the monster's own damage roll.

**Weapon masteries.** `refreshPassives` (the Warmth precedent) writes
`player.masteryPoints = { axe: n, mace: n, sword: n }` and Iron Skin's level;
`recalc` folds the bonus matching `equipment.weapon.kind` into displayed damage/AR, so the
character sheet is honest without a skills import in player.js.

**Two-handed swing.** `poseAngles` gains an `attackStyle: 'twoHand'` branch — both
shoulders driven by the swing scalar, hands converging, more hip twist. `segments` gains a
`greataxe` weapon rig on the forearm carry (`at()`, like the sword — the staff's upright
`shaft()` rig would kill the sweep) with a wedge head, and the left hand snaps to the haft.
The axe stays welded to the right arm, so mirrored facings read left-handed — accepted, the
skeleton's sword already does this, and baking 8 directions would double the figure's cost.

**The figure.** `BARB_BUILD` written out in full (the `humanoid()` build merge drops
defaults — known trap, every spec spells its build out): shoulders ~13, torso ~7.8, arms
~3.8/3.2, chest-out stance. Palette ramps `barbSkin/barbHide/barbFur/barbTrim/barbHair` in
palette.js next to the sorceress block. All five animations (~25 ms, ~160 cells — the bake
budget absorbs it; the loading bar derives its step count).

## Class plumbing

- `newGame(cls)`; class select is a `titleStep` inside the title state, not a new state.
- `continueGame` constructs `new Player({ cls: d.cls || 'sorceress', ... })` and picks
  `assets.figures[cls]`. The save has carried `cls` since v1 (verified against a live save);
  no version bump, no migration.
- `CLASS_TREES = { sorceress: ['fire','cold','light'], barbarian: ['cries','combat','mastery'] }`
  in skills.js; the tree panel iterates `CLASS_TREES[player.cls]` with `colW = w / trees.length`;
  `canAllocate` rejects skills from another class's trees (defence in depth — the panel never
  shows them). `TREE_NAME` and `TREE_COLOUR` gain the three new entries, `bakeSkillIcon` gains
  three glyph branches: an axe wedge for combat, nested shout arcs for cries, an anvil
  block for mastery.
- Character sheet: one conditional row — Attack Speed for the Barbarian, Faster Cast Rate
  for the Sorceress. Nothing else changes.
- Items stay classless (no class-restricted bases exist and none are added). Akara's
  caster-only weapon stock already gives the shopping distinction meaning.
- Test hooks: `__newGame(cls)`, and everything else unchanged.

## Explicitly out

Left-hand weapon slot, dual wield, weapon swap, class-restricted items, Find Item/Potion,
Leap Attack, Berserk, Natural Resistance, Grim Ward. Barbarian-specific audio beyond reusing
the cast/hit set — one synthesized shout for warcries is a polish item, taken only if the
audio phase is trivially green.

## Stretch: Nightmare

Only after the Barbarian passes full verification. Killing Andariel unlocks Nightmare on the
title screen per save: same world reseeded, monster level +15 (affix/loot tiers follow ilvl
as they already do), monster life ×2.5 and damage ×1.8, player resistances −40 (the D2
Nightmare penalty), XP curve unchanged. One flag in the save (`diff`), defaulting absent =
Normal. If the Barbarian work leaves no room, this section moves to the backlog unbuilt.

## Verification contract

The class ships when, in a real browser session against `serve.js`:

1. Both classes are creatable from the title; Esc backs out of the class step.
2. A new Barbarian: 55/10 orbs, Hand Axe equipped, Bash bound right, axe swings connect
   (damage floats, monsters die) and miss (the "miss" float exists) per the to-hit formula.
3. All 14 skills allocate under their gates, cast/swing for the printed mana cost, and do
   what their tooltip says — fear observably routs a pack, stun observably freezes one,
   Shout/Battle Orders change the character sheet for their printed duration, masteries
   change displayed damage only while the matching weapon is held, Leap lands where aimed
   or refuses, Whirlwind traverses and hits en route.
4. The Sorceress regression: her save Continues, her three trees render three columns, Fire
   Bolt still casts, her sheet still says Faster Cast Rate.
5. Save round-trip mid-run for the Barbarian: class, skills, buffs dropped (buffs do not
   persist — D2 behaviour), bindings and axe survive reload.
6. Full bake stays under 450 ms cold; frame p95 stays under budget with Whirlwind active.
7. `node build.js` bundles clean; the single file plays as a Barbarian from disk.
8. Console clean throughout.
