# The Barbarian — Cross-Session Checkpoints

> Append-only. Each completed task gets a log entry; resume prompts are added when a session hands off.
> Every resume prompt must be self-contained: a new session sees only CLAUDE.md plus the pasted prompt.

## State

- **Spec** — `docs/superpowers/specs/2026-07-29-barbarian-class-design.md`: done (2026-07-29)
- **Plan** — `docs/superpowers/plans/2026-07-29-barbarian-class.md`: done, self-reviewed, committed (2026-07-29)
- **Task 1 — The Barbarian figure**: pending
- **Task 2 — Class data and plumbing**: pending
- **Task 3 — Class select on the title**: pending
- **Task 4 — Melee skill path + Combat strikes**: pending
- **Task 5 — Leap and Whirlwind**: pending
- **Task 6 — Monster status + Warcries**: pending
- **Task 7 — Masteries**: pending
- **Task 8 — Verification contract (ship gate)**: pending
- **Task 9 — Nightmare (STRETCH, only after Task 8 green)**: pending

Execution mode (subagent-driven vs inline): awaiting the user's choice; the first execution resume prompt is written once it lands.

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

**Next**: Await the execution-mode decision, then execute Task 1 (the figure) per the plan.
