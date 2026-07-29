# Five Acts, Full Trees, Real Score -- Cross-Session Checkpoints

> Multi-session resume file. At each phase gate the agent checkpoints here (and in progress.md); when the window is worth shedding it appends a self-contained resume prompt, pbcopies it silently, and tells the user it is safe to /clear.
>
> Rules: append-only -- never edit historical prompts. Every resume prompt must be self-contained (a new session sees only CLAUDE.md + the pasted prompt).

## Status

- **Phase 0 -- baseline commit**: done (2026-07-29). Polish batch committed as `ca81421` before this effort touches the same files.
- **Phase 1 -- spec + plan**: done (2026-07-29). Spec `docs/superpowers/specs/2026-07-29-five-acts-design.md` (`2e44543`), plan `docs/superpowers/plans/2026-07-29-five-acts.md` (`be32fa2`) -- 15 tasks, six phases, probes and interfaces pinned per task.
- **Phase 2 -- music rewrite**: done (2026-07-29), pending Joseph's ear only. Task 1 `053091e..0e6fa0a` (engine seam, drone dead, pluck pitch-true ~2 cents with matched struck fallback, full mood-table poison-proofing; 5 fix rounds, final re-review CLEAN). Task 2 `4ef926a`+`780e60b` (fifteen real moods in our own ~80-line Tidal-style mini-notation; 15/15 amended harness band; behavioural tail-silence drone check bites at 529x on the rebuilt-drone control; 1 fix round, CLEAN). Plan harness snippet corrected twice (`46ace45`). Audition: `__audio.playMusic('a3.dungeon')` etc.; ear items: MUSIC_LEVEL 1.8 score presence, the moods themselves. Task-level record: `.superpowers/sdd/2026-07-29-five-acts/progress.md`.
- **Phase 3 -- skills to 30 per class**: pending
- **Phase 4 -- world scaffolding + Act 1 expansion**: pending
- **Phase 5 -- Acts 2 and 3**: pending
- **Phase 6 -- Acts 4 and 5**: pending
- **Phase 7 -- classic/yolo start, balance, full playthrough, ship gate**: pending

## Joseph's scope decisions (2026-07-29, this effort's charter)

1. **Music stays procedural** -- no asset files, ever. Kill the constant drone (`ambient()` oscillators in `src/audio/synth.js`), rewrite the score as fuller per-act compositions from synthesis. The zero-asset charter holds.
2. **Classic start is the default, "yolo" mode selectable** -- New Game asks: Classic (level 1, earn everything) or Yolo (the current maxed start with chase uniques). Joseph's own word for the label: yolo.
3. **Canon-leaning act density, and "act 1 should keep up"** -- each act is town + ~6 areas + mini-bosses + act boss; Act 1 gets expanded to the same density, not left at 4 areas.
4. **The project's final goal, reset mid-effort (2026-07-29)**: 100% of a smaller, honest Diablo -- NOT parity with D2. Definition of done, roadmap (classes -> difficulties -> item endgame), and the ruled-out list (multiplayer, level-99 grind, any external asset) live in README "The goal"/"Roadmap"/"Ruled out". This effort's scope is unchanged by the reset.

## Cross-cutting contracts

- **Project root**: `/Users/jinsoon/Work/Projects/experiments/diablo`
- **Read order (new session)**: CLAUDE.md (global) -> this file -> the spec -> the plan's phase section -> progress.md tail
- **Build**: `node build.js` packs `src/` into self-contained `diablo.html` (file:// runnable). Always rebuild after src changes.
- **Verify**: drive the BUILT `diablo.html` in Chrome via chrome-devtools MCP. Debug hooks: `window.__forceLoad()`, `__newGame(cls)`, `__continue()`, `__step(dt)`, `__render()`, `__enter(areaId)`, `__g`, `window.__audio`. If browser launch says profile in use: `pkill -f "chrome-devtools-mcp/chrome-profile"`. Backgrounded tabs throttle rAF -- always drive via `__forceLoad`/`__step`, never wait on animation.
- **Style**: narrative comments, no emoji, surgical diffs, ES modules under `src/`, no external assets (art and audio stay procedural).
- **Model split**: implementation goes to Opus 5 workers (Agent tool, `model: "opus"`, explicit "WRITE files, do NOT plan" instruction, disjoint file sets when parallel); spec/plan/review/verification stay in the main loop.
- **Log**: progress.md gets a What/Why/Next entry per phase; update Status here at every gate.
- **At every phase gate**: update Status + progress.md; full resume-prompt handoff (pbcopy + append here + tell Joseph it is safe to /clear) only when the window is ~30%+ or Joseph stops for the session.

---

## Phase 3 Resume Prompt

(generated 2026-07-29 after Phase 2 closed review-clean; also in clipboard via pbcopy)

```
Continue Phase 3 of the five-act effort in ~/Work/Projects/experiments/diablo: both classes grow to their canon thirty skills (plan Tasks 3-6).

Working directory: /Users/jinsoon/Work/Projects/experiments/diablo (branch main; commit per task in repo style; NEVER git push).

State (Phases 0-2 done, 2026-07-29):
- Phase 2 (music) shipped review-clean: drone dead, pitch-true Karplus-Strong engine, fifteen per-act moods in our own mini-notation, behavioural drone-regression harness. Commits 053091e..0e6fa0a (Task 1, 5 fix rounds), 4ef926a+780e60b (Task 2, 1 round), docs 46ace45. Joseph's ear audition may still be pending -- if mood retune requests arrive mid-phase, they are MOODS-table edits in src/audio/synth.js: dispatch as a micro-task with a scoped re-review, do not derail the phase.
- Task-level record (deferred minors, Task 1 calibration notes, all round history): .superpowers/sdd/2026-07-29-five-acts/progress.md (the SDD ledger; append every dispatch/verdict/completion there).
- Bundle builds clean at 437 KB.

Before starting, read in order:
1. docs/superpowers/plans/2026-07-29-five-acts-checkpoints.md -- Status, Cross-cutting contracts, Joseph's scope decisions (incl. the goal reset: 100% of a smaller honest Diablo).
2. The SDD ledger above -- resume rules: tasks with a "complete" line are DONE (Tasks 1-2); resume at Task 3.
3. Plan Tasks 3-6: docs/superpowers/plans/2026-07-29-five-acts.md (Phase 3 section; Global Constraints bind every task).
4. Spec section 2: docs/superpowers/specs/2026-07-29-five-acts-design.md (the exact 30-skill lists, chains, req tiers, engine mechanics).

Process (SDD, as Phases 1-2 ran it):
- Scripts: /Users/jinsoon/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/scripts/ -- task-brief PLAN_FILE N (brief per task), review-package PLAN_FILE BASE HEAD (record BASE via git rev-parse before each dispatch).
- Workers: fresh Opus implementer per task (Agent tool, model "opus", run_in_background true, "WRITE files, do NOT plan", report to .superpowers/sdd/2026-07-29-five-acts/task-N-report.md, reply SHORT status/commit/probe/concerns). Opus task reviewer per task with license to measure claims in the built game itself -- this effort's reviewers reproduce numbers empirically; keep that bar. Fix loop max 5 rounds: 1-3 resume the implementer via SendMessage, 4-5 fresh implementer on Fable; every round ends with a scoped re-review; breaker at 5 = controller adjudicates (park with ruling, or BLOCKED to Joseph). Ledger every step.
- Tasks 3 -> 4 -> 5 -> 6 STRICTLY sequential (shared files: skills.js, icons.js). No parallel implementers this phase.

Goals:
- Task 3: engine mechanics only (hazards, hydra pet, chain/beam/thrown projectiles, buff hooks incl. onStruck/esplit/proc/stacks/plusSkills, taunt, corpse targeting) -- interfaces named in the plan are load-bearing for Tasks 4-5.
- Task 4: the Sorceress's 16 new defs + req-tier moves of her existing 14 + icons.
- Task 5: the Barbarian's 16 + polearm/spear bases + icons.
- Task 6: tree panel at six req tiers + scrolling picker at thirty.
- Phase gate (controller, after Task 6): the 60-skill sweep -- both classes, fresh yolo char, allocate all 30 through the real UI, cast/trigger every skill, mana-exact and effect-true per task probes; existing saves still load. Then checkpoint here + progress.md What/Why/Next; full resume-prompt handoff for Phase 4 only when the window is ~30%+ or Joseph stops.

Environment: node build.js after every task; verify the BUILT diablo.html via chrome-devtools MCP (load tools in ONE ToolSearch batch; if profile busy: pkill -f "chrome-devtools-mcp/chrome-profile"); page hooks __forceLoad/__newGame/__continue/__step/__enter/__g/__audio; backgrounded tabs throttle rAF -- drive via hooks, never wait on animation.

Conventions: Cross-cutting contracts in the checkpoints file. Narrative comments in the codebase voice, no emoji, surgical diffs, zero asset files. Commits Conventional style matching git log, ending with: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
