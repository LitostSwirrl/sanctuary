# The Barbarian — Cross-Session Checkpoints

> Append-only. Each completed task gets a log entry; resume prompts are added when a session hands off.
> Every resume prompt must be self-contained: a new session sees only CLAUDE.md plus the pasted prompt.

## State

- **Spec** — `docs/superpowers/specs/2026-07-29-barbarian-class-design.md`: done (2026-07-29)
- **Plan** — `docs/superpowers/plans/2026-07-29-barbarian-class.md`: done, self-reviewed, committed (2026-07-29)
- **Task 1 — The Barbarian figure**: done (2026-07-29, commit 272e7d9)
- **Task 2 — Class data and plumbing**: done (2026-07-29, commit 4ab59fd)
- **Task 3 — Class select on the title**: done (2026-07-29, commit 79fcb99)
- **Task 4 — Melee skill path + Combat strikes**: done (2026-07-29, commit 7cf6975)
- **Task 5 — Leap and Whirlwind**: pending
- **Task 6 — Monster status + Warcries**: pending
- **Task 7 — Masteries**: pending
- **Task 8 — Verification contract (ship gate)**: pending
- **Task 9 — Nightmare (STRETCH, only after Task 8 green)**: pending

Execution mode: **subagent-driven** (decided 2026-07-29). First execution resume prompt below.

## Cross-cutting contracts

- **Project root**: `/Users/jinsoon/Work/Projects/experiments/diablo`
- **Spec**: `docs/superpowers/specs/2026-07-29-barbarian-class-design.md` — the why and the numbers
- **Plan**: `docs/superpowers/plans/2026-07-29-barbarian-class.md` — 9 tasks with exact files, code and browser checks; its Global Constraints section binds every task
- **Read order for a new session**: CLAUDE.md → plan (Global Constraints + the task being executed) → this file → the source files that task names
- **Run it**: `node serve.js` from the project root, then `http://localhost:8231/index.html`. Never python http.server — serve.js sends no-store; a cached ES module once made a real fix look like it had failed.
- **Verification is browser-driven** with claude-in-chrome (Chrome DevTools MCP is blocked by a stale profile lock in this environment). A backgrounded tab throttles rAF to ~1 fps: call `window.__forceLoad()` first, drive with `window.__step(1/60)` + `window.__render()`; `window.__g` exposes live game state, `window.__newGame(cls)` after Task 2.
- **No assets, no dependencies, no bundler.** Plain ES modules with explicit `.js` extensions. No emoji anywhere.
- **SKILLS entries are appended after the Sorceress block, never inserted** — `bakeSkillIcon` falls back to array position for pips; every new skill sets an explicit `iconSeed` regardless.
- **Save stays v1, no migration** — `cls` has been stored since v1 (verified against a live save).
- **The `humanoid()` build-merge trap**: `...over` spreads after `build:`, so a figure spec must spell out `{ ...DEFAULT_BUILD, ... }` itself.
- **Commit after every task**, Conventional Commits, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- **Post-task checklist** (restated in every resume prompt): mark the task done in this file's State block with the date; append a What/Why/Next entry to the Log below; commit; then — only if the window is worth shedding (~30%+) or the session is ending — generate the next task's resume prompt, pbcopy it silently, append it here, and tell the user it is safe to /clear.

## Log

### Spec + plan (2026-07-29)

**What**: The Barbarian design spec (written at the end of the previous session) and the 9-task implementation plan, both committed in `e66ac6b`.

**Why**: A second class is the reason a second run exists, and it proves the class-shaped systems actually hold two classes. The plan front-loads the figure (Task 1) because nothing is playable without a sheet, lands plumbing before skills (Task 2–3), then adds mechanics in dependency order: melee path (4) → body-owning skills (5) → monster status + buffs (6) → passive folds (7) → the spec's verification contract as ship gate (8), with Nightmare gated behind full green (9). Key mechanism decisions recorded in the plan itself: melee skills set their own attack animation and weapon-speed busy inside `cast()` while `doCast` merely skips the caster lockout for `melee: true`; Leap/Whirlwind run through a `player.action` per-frame closure ticked at the top of `Player.update`; buffs live in `player.buffs = { id: { t, mag } }` folded in `recalc`; masteries flow through `refreshPassives` writing `player.masteryPoints` (the Warmth precedent — no skills import in player.js).

**Next**: Execute Task 1 (the figure) per the plan, subagent-driven.

### Task 1 — The Barbarian figure (2026-07-29)

**What**: Palette ramps, the two-handed attack pose (both arms drive the swing, peak on frame 3), the greataxe rig with the left-hand haft snap, and `FIGURE_SPECS.barbarian` — commit `272e7d9`. Implemented by a subagent, reviewed by a second; review Approved with every code requirement verified against source (branch ordering, the build-merge trap, valid build keys, automatic bake-step registration).

**Why**: The sheet is the foundation; nothing is playable without it. All five anims bake (`__sheetFor('barbarian')` has cast, canvas 640 wide); the sprite reads broader than the Sorceress, both hands on the axe, swing sweeps, death topples; console clean.

**Next**: Task 2 (class data and plumbing). One parked finding rides along: the 450ms cold-bake gate fails at the pre-Barbarian baseline in this environment (557-561ms without him, ~590ms with; marginal cost ~25-30ms) — re-measured and adjudicated at Task 8 check 6.

### Task 2 — Class data and plumbing (2026-07-29)

**What**: `CLASS_STATS.barbarian`, `CLASS_TREES`/`TREE_NAME`, the `canAllocate` class gate, per-class tree panel, three new icon glyph branches, the Attack Speed sheet row, class-aware Kashya/Akara greetings via `populateTown(cls)`, inert player fields (`buffs`/`masteryPoints`/`ironSkinLevel`), `newGame(cls)` with the Hand Axe start, and `window.__newGame` — commit `4ab59fd`. Review Approved; call-site audits (populateTown, newGame, new Player) came back complete.

**Why**: A Barbarian is now fully playable through `__newGame('barbarian')` — 55/10 orbs, Hand Axe swings kill moor monsters, three named empty tree columns, class greetings — with the Sorceress regression-checked (Fire Bolt, FCR row, her three columns). Console clean both passes.

**Next**: Task 3 (class select on the title). Deferred minor on record: `CLASS_TREES[player.cls]` unguarded (plan-mandated; matters only if a third class lands).

### Task 3 — Class select on the title (2026-07-29)

**What**: `titleStep` state, the two-card `drawClassSelect` (hard-pixel idle portraits, hover highlight, flavour lines), input routing (New Game opens the class step; Continue never asks), Esc back, and the `titleStep = 'menu'` resets in both `newGame` and `continueGame` — commit `79fcb99`, src/main.js only. Review Approved: click rects provably identical to drawn rects, Continue structurally cannot reach class select, Esc handling matches the dead-state convention, and the portrait draw's flip omission was independently confirmed correct against `figures.js` (`index(anim, dir, frame)`, dir 2 unmirrored).

**Why**: The title is where a second class becomes visible; both classes are now creatable in-game end to end (card click → spawn → save → reload → Continue restores the Barbarian without asking).

**Next**: Task 4 (melee skill path + Bash / Double Swing / Concentrate).

### Task 4 — Melee skill path + Combat strikes (2026-07-29)

**What**: `monsterDefense` in combat.js; the melee helpers in skills.js (`weaponHit`, `knockback`, `MELEE_REACH 1.9`, two-pass `meleeTarget`, `meleeStrike` with veto-and-refund); Bash / Double Swing / Concentrate appended under the `// BARBARIAN COMBAT` banner; `doCast`'s `melee: true` bypass; `playerAttack` reads `monsterDefense`; a new Barbarian starts with Bash allocated and bound right — commit `7cf6975`. Review Approved; cross-cutting audits clean (all rollHit sites accounted for; SKILL_BY_ID/doCast consumers unaffected; no import cycle).

**Why**: The melee path is the mechanical spine of the class — mana-paid, veto-refunded, weapon-speed strikes with the skill ED/AR stacking the plan's formula convention. All observed live: knockback displacement (exact 0.7), two floats on one Double Swing, tooltip growth, "Not enough mana", the class gate both directions.

**Next**: Task 5 (Leap and Whirlwind). One parked plan-level finding (controller-adjudicated, stands as designed): Double Swing's second hit shares the primary's hit-frame gate — whiffs entirely if the primary is invalidated mid-windup (~0.2s, 1 mana); matches the plain-attack whiff convention; only bash/doubleswing/concentrate consume meleeStrike. Overrule = move the guard per-hit.

---

## Execution Resume Prompt (Tasks 1 onward)

(2026-07-29, generated after the subagent-driven decision landed)

```
Continue the Barbarian build: execute the implementation plan task-by-task with subagent-driven development.

Working directory: /Users/jinsoon/Work/Projects/experiments/diablo

State:
- Spec done: docs/superpowers/specs/2026-07-29-barbarian-class-design.md
- Plan done, self-reviewed, committed (e66ac6b): docs/superpowers/plans/2026-07-29-barbarian-class.md — 9 tasks with exact files, code blocks and browser checks
- Checkpoints file: docs/superpowers/plans/2026-07-29-barbarian-class-checkpoints.md (State block, cross-cutting contracts, log)
- No implementation has started; Tasks 1-9 all pending. Execution mode decided: subagent-driven (fresh subagent per task, review between tasks).

Before starting:
1. Read the plan's Global Constraints section, then Task 1 in full.
2. Read the checkpoints file's Cross-cutting contracts — serve.js usage, browser-verification hooks (__forceLoad / __step / __render / __g / __sheetFor), the SKILLS append-only rule, the humanoid() build-merge trap, commit convention.
3. Invoke superpowers:subagent-driven-development and drive the plan through it.

Goals:
- Execute Tasks 1-8 in order, one fresh subagent per task, reviewing each subagent's diff against the plan task before moving on. Task 8 is the spec's verification contract — the class ships only when all eight checks have been observed in a real browser against serve.js (claude-in-chrome; Chrome DevTools MCP is blocked by a stale profile lock in this environment). Task 9 (Nightmare) only if Task 8 is fully green and there is room; otherwise move that section to the README backlog per the plan.
- Subagents must WRITE files, not plan — instruct them explicitly. Verify each task's file changes exist on disk before accepting the result.
- Each task ends committed: Conventional Commits, trailer "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>".

Conventions: the plan's Global Constraints and the checkpoints file's Cross-cutting contracts bind every task. Console must stay clean in every browser check. Never python http.server — node serve.js only.

Output: working code committed per task; the checkpoints file kept current as tasks complete.

After each task (post-completion checklist):
1. Mark the task done in the checkpoints State block with the date.
2. Append a What/Why/Next entry to the checkpoints Log.
3. Commit.
4. Only at a gate where the context window is worth shedding (~30%+ used) or the session is ending: generate the next task's resume prompt (self-contained, this same shape), pbcopy it silently, append it to the checkpoints file, and tell the user it is safe to /clear. Otherwise continue in-session.
```
