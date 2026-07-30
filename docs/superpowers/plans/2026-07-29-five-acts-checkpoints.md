# Five Acts, Full Trees, Real Score -- Cross-Session Checkpoints

> Multi-session resume file. At each phase gate the agent checkpoints here (and in progress.md); when the window is worth shedding it appends a self-contained resume prompt, pbcopies it silently, and tells the user it is safe to /clear.
>
> Rules: append-only -- never edit historical prompts. Every resume prompt must be self-contained (a new session sees only CLAUDE.md + the pasted prompt).

## Status

- **Phase 0 -- baseline commit**: done (2026-07-29). Polish batch committed as `ca81421` before this effort touches the same files.
- **Phase 1 -- spec + plan**: done (2026-07-29). Spec `docs/superpowers/specs/2026-07-29-five-acts-design.md` (`2e44543`), plan `docs/superpowers/plans/2026-07-29-five-acts.md` (`be32fa2`) -- 15 tasks, six phases, probes and interfaces pinned per task.
- **Phase 2 -- music rewrite**: done (2026-07-29), pending Joseph's ear only. Task 1 `053091e..0e6fa0a` (engine seam, drone dead, pluck pitch-true ~2 cents with matched struck fallback, full mood-table poison-proofing; 5 fix rounds, final re-review CLEAN). Task 2 `4ef926a`+`780e60b` (fifteen real moods in our own ~80-line Tidal-style mini-notation; 15/15 amended harness band; behavioural tail-silence drone check bites at 529x on the rebuilt-drone control; 1 fix round, CLEAN). Plan harness snippet corrected twice (`46ace45`). Audition: `__audio.playMusic('a3.dungeon')` etc.; ear items: MUSIC_LEVEL 1.8 score presence, the moods themselves. Task-level record: `.superpowers/sdd/2026-07-29-five-acts/progress.md`.
- **Phase 3 -- skills to 30 per class**: done (2026-07-30). Task 3 mechanics `afe8227`+`ec119ee` (1 fix round: cadence timers carry the remainder). Task 4 sorceress `aa0a602`+`920b537` (1 fix round, interrupted by the Jul 29 API-incident crash and completed by a Fable worker after five Opus-lane 529 deaths -- floor ruling ledgered; established the measured-anchor evidence bar; Blizzard 11+4/rank, Thunder Storm 4-10 at nine measured strikes). Task 5 barbarian `3e9c505`+`9a08b08` (1 fix round: sheet-row dangling else, Battle Command buff-free caches). Task 6 panel `0ccbe0a` (zero fix rounds; three-abreast masteries ruling honoured; five sizes verified). Gate swept 60/60 allocate + effect-true, mana-exact, saves byte-equal, console clean (`phase-3-gate-report.md`). Deferred minors in the SDD ledger for final-review triage.
- **Phase 4 -- world scaffolding + Act 1 expansion**: done (2026-07-30). Task 7 `38f45e0` (ACTS, cap 50 with the curve merely continued, save v2 one-place migration; zero fix rounds). Task 8 `2efda38` (Dark Wood + Barracks + The Smith, catacombs rewired, five waypoint tabs, Warriv's travel into a sanctioned stub Lut Gholein, Andariel demoted from finish to gate; zero fix rounds). Death-gold micro-task `3a74121` (dying no longer refunds gold same-frame; re-review clean). Gate PASSED on reviewer evidence (18 walked legs both directions, travel end-to-end; stub's only-if satisfied -- Phase 5 same session). Spec-text conflict for Joseph at Task 13: yolo waypoints act-1-only vs spec's all-acts-lit. Deferred minors in the SDD ledger.
- **Phase 5 -- Acts 2 and 3**: done (2026-07-30). Task 9 art `a003d06` (four terrains, eight props, fifteen figures; review clean, 0 fix rounds). Task 10 world `4876d19` (16 areas, 13 monsters + uniques, both town casts, Radament +1/council/Duriel/Mephisto quests into the travel pattern, tier-4 bases; review clean, 0 fix rounds). Between them, `beca091` -- the ground-grain blur fix -- landed from Joseph's own live session (GRAIN 0.24, sanctioned there, comparison shots in shots/grain-*.png). Gate PASSED: traversal 1->3, all six a2/a3 moods sound (flayerjungle plays a3.dungeon by design -- mood follows ambient darkness), bake 857-964 ms band, jungle-pack p95 3.2 ms, console clean, shots/gate5-*.png. Six Opus 529 deaths this session; both workers cut to Fable per the Task 4 infra ruling.
- **Phase 6 -- Acts 4 and 5**: done (2026-07-30). Task 11 art `f97b328` (obsidian/ice terrains + walls, five props incl. light-emitting lavavent, fourteen figures; review clean, 0 fix rounds; atlas measured 150.6 MB / 48 sheets, bake 783-869 ms reviewer band of 1600). Task 12 world `aedd6fb` (13 areas, lava mechanism with vent lights, 11 monsters + uniques, Fortress + Harrogath casts, izual +2/hephasto/shenk/ancients quests, the REAL Baal victory -- toast "The Worldstone falls quiet.", won-state, keep playing; review clean, 0 fix rounds; lavavent LIGHT_COLORS hookup landed and the dead tiles.js descriptor removed). Gate PASSED: five-act traversal + victory (reviewer), a4/a5 music 14/14, River of Flame lava reachability 30 seeds 0 fails, chaos-pack p95 1.50 ms, bake 934 ms controller cold, console clean, shots/gate6-*.png (six, visually verified). No Opus deaths this phase. Design notes for Task 14: council guards rank normal vs spec elite; resurrect()-to-act-1; lava glow covers ~83% of lava tiles in flame (block extends past the vent chain).
- **Phase 7 -- classic/yolo start, balance, full playthrough, ship gate**: tasks done (2026-07-30), controller close-out pending. Joseph's ruling on the yolo-waypoint conflict: all acts lit, superseding the Phase 4 act-1-only wording. Task 13 `45d68a7` (Classic default -- level 1, one waypoint, 80 gold, Warriv gated by empty quests -- and Yolo as the deliberate second choice, boost extracted to applyYoloBoost(); review clean, 0 fix rounds). Task 14 `b63a591` (xp curve `1600*(n-1) + 6.5*(n-1)^3.31` after a 400x240 two-constant sweep found none that holds all five bands; council guards to champion rank; resurrect() wakes in the current act's town; review clean, 0 fix rounds). Task 15 ship gate: spec section 6's seven points run end to end against the built file plus a file:// leg, contract 7/7 -- 37 areas over 64 exit legs both directions, 17/17 waypoints lit and 34 travel hops, 14/14 quest bosses and all four gates, 60/60 skills, 15/15 moods, 25/25 pacing marks in band, save round-trip and a genuine pre-effort v1 fixture, a 1110-level generation sweep with nothing unreachable, bake 880-893 ms of 1600, p95 3.4 ms of 16.67, bundle 651 KB one file, console clean. Two generation fixes came out of the sweep (`gen.js` keeps the reachability flood and drops spawn points outside it; `monster.js` scatters pack members only onto tiles inside it). Findings and numbers: `.superpowers/sdd/2026-07-29-five-acts/task-15-report.md`.

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

---

## Phase 4 Resume Prompt

(generated 2026-07-30 after the Phase 3 gate passed 60/60; also in clipboard via pbcopy)

```
Continue Phase 4 of the five-act effort in ~/Work/Projects/experiments/diablo: the act model and Act 1 at full density (plan Tasks 7-8).

Working directory: /Users/jinsoon/Work/Projects/experiments/diablo (branch main; commit per task in repo style; NEVER git push).

State (Phases 0-3 done, 2026-07-30):
- Phase 3 shipped review-clean: both classes at their canon thirty (Task 3 mechanics afe8227+ec119ee; Task 4 sorceress aa0a602+920b537, 1 fix round establishing the measured-anchor evidence bar; Task 5 barbarian 3e9c505+9a08b08, 1 fix round on sheet rows + Battle Command buff-free caches; Task 6 six-tier panel + scrolling picker 0ccbe0a, zero fix rounds). Phase gate swept 60/60 allocate + effect-true, mana-exact on all castables, saves load byte-equal, console clean (full record: .superpowers/sdd/2026-07-29-five-acts/phase-3-gate-report.md).
- Bundle builds clean; frame p50/p95 1.9/2.1 ms with the tree open; cold bake 425 ms of the 1.6 s budget.

Before starting, read in order:
1. docs/superpowers/plans/2026-07-29-five-acts-checkpoints.md -- Status, Cross-cutting contracts, Joseph's scope decisions.
2. The SDD ledger .superpowers/sdd/2026-07-29-five-acts/progress.md -- TAIL FIRST: tasks with a "complete" line are DONE; if a prior session already progressed into Phase 4, resume where the ledger says, not at Task 7's start. The deferred-minors lines ride there too -- carry the relevant ones into dispatches (equip path never calls refreshPassives; describeSkill's per-cache tooltip rule; meteor cast-frame detonation; the +-1-tick hazard boundary tolerance is the standing tooltip ruling).
3. Plan Tasks 7-8: docs/superpowers/plans/2026-07-29-five-acts.md (Phase 4 section; Global Constraints bind every task).
4. Spec sections for the act model, cap 50, save v2 migration, and the 35 exact areas: docs/superpowers/specs/2026-07-29-five-acts-design.md.

Process (SDD, as Phases 2-3 ran it): scripts at /Users/jinsoon/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/scripts/ (task-brief PLAN_FILE N per task; review-package PLAN_FILE BASE HEAD; record BASE via git rev-parse before each dispatch). Fresh Opus implementer per task (Agent tool, model "opus", run_in_background true, "WRITE files, do NOT plan", report to .superpowers/sdd/2026-07-29-five-acts/task-N-report.md, SHORT reply: status/commit/probe/concerns). Opus task reviewer per task with the empirical bar -- this effort's reviewers reproduce number claims in the built game; keep that bar. Fix loop max 5 rounds: 1-3 resume the implementer via SendMessage, 4-5 fresh implementer on Fable; every round ends with a scoped re-review; breaker at 5 = controller adjudicates. Ledger every step. Tasks 7 -> 8 strictly sequential (one worker per the plan).

Goals:
- Task 7: the act model, LEVEL_CAP to 50, save v2 with v1 migration (spec section 4 binds the migration).
- Task 8: Act 1 grows to eight areas; travel and the waypoint tabs.
- Phase gate (controller, after Task 8): per the plan's Phase 4 gate text; then checkpoint (Status + progress.md What/Why/Next + ledger) and hand off Phase 5 only when the window is ~30%+ or Joseph stops.

Environment: node build.js after every task; verify the BUILT diablo.html via chrome-devtools MCP (load tools in ONE ToolSearch batch; if profile busy: pkill -f "chrome-devtools-mcp/chrome-profile"); page hooks __forceLoad/__newGame/__continue/__step/__enter/__g/__mech/__audio; backgrounded tabs throttle rAF -- drive via hooks, never wait on animation. The Chrome profile holds Joseph's real save -- back up before any probe that could write, restore byte-for-byte.

Conventions: Cross-cutting contracts in the checkpoints file. Narrative comments in the codebase voice, no emoji, surgical diffs, zero asset files. Commits Conventional style matching git log, ending with: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Phase 5 Resume Prompt

(generated 2026-07-30 after the Phase 4 gate passed; also in clipboard via pbcopy)

```
Continue Phase 5 of the five-act effort in ~/Work/Projects/experiments/diablo: acts two and three (plan Tasks 9-10, art then world).

Working directory: /Users/jinsoon/Work/Projects/experiments/diablo (branch main; commit per task in repo style; NEVER git push).

State (Phases 0-4 done, 2026-07-30):
- Phase 4 shipped review-clean, zero fix rounds: ACTS/cap-50/save-v2 (38f45e0), Act 1 at eight areas with travel and five waypoint tabs, Andariel demoted from finish to gate (2efda38), death-gold micro-fix (3a74121). Gate passed; stub Lut Gholein sanctioned pending Phase 5.
- Both classes at their canon thirty (Phase 3), fifteen per-act moods live behind level.act (Phase 2 + Task 7 stamp).

Before starting, read in order:
1. docs/superpowers/plans/2026-07-29-five-acts-checkpoints.md -- Status, Cross-cutting contracts, Joseph's scope decisions.
2. The SDD ledger .superpowers/sdd/2026-07-29-five-acts/progress.md -- TAIL FIRST: tasks with a "complete" line are DONE; if a prior session already progressed into Phase 5, resume where the ledger says. The Phase 5 orchestration ruling stands: Tasks 9-10 dispatch SEQUENTIALLY (art, then world) despite the plan's parallel wording -- shared checkout, shared Chrome profile, pkill hazard, and Task 10's probe needs Task 9's commit.
3. Plan Tasks 9-10 + the Phase 5 gate: docs/superpowers/plans/2026-07-29-five-acts.md (Phase 5 section; Global Constraints bind every task).
4. Spec section 3's zone lists for acts 2-3: docs/superpowers/specs/2026-07-29-five-acts-design.md.

Carried traps for the dispatches (from the ledger's deferred minors):
- main.js:172 (yolo waypoint boost) throws on a WAYPOINT_AREAS id without a def while panels degrades -- Task 10 adds ids+defs together or fixes the asymmetry in its own scope.
- askPassage throws on a travel NPC without passage lines -- Meshif (both towns) needs his lines with the def.
- getLevel's townsfolk gate hardcodes id==='town' (main.js:226) -- Lut Gholein's and Kurast's five need that condition widened, def-driven.
- The stub Lut Gholein wears the encampment's furniture: genTown hardcodes tents/anvil/wagon (gen.js:388-400) -- Phase 5 def-drives town furniture.
- actFor (save.js:24) survives unknown ids but enterArea throws -- area ids in defs/ACTS/saves must stay exactly aligned.
- Task 10's monster defs reference Task 9's figure keys BY NAME; a missing figure throws at bake -- that throw is the integration test, run it after art lands.
- Standing rules: measured-anchor evidence at declared frames for any tooltip number; +-1-tick hazard-rate tolerance; probes pin hp/defense per-frame against the 5%-hit floor at level 50; tab hygiene (isolated contexts, Joseph's save backed up + byte-verified sha256 f50cb6dd..db7c, default tabs parked at title, no pkill while another agent may be probing).

Process (SDD, as Phases 2-4 ran it): scripts at /Users/jinsoon/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/scripts/ (task-brief PLAN_FILE N; review-package PLAN_FILE BASE HEAD; BASE via git rev-parse before each dispatch). Fresh Opus implementer per task (background, "WRITE files, do NOT plan", report to .superpowers/sdd/2026-07-29-five-acts/task-N-report.md, SHORT reply); Opus reviewer per task, empirical bar (reviewers reproduce numbers in the built game); fix loop max 5 rounds (1-3 resume implementer, 4-5 fresh on Fable); scoped re-review every round; ledger every step.

Goals:
- Task 9: desert/jungle terrains, walls, eight props, fifteen figures (reskins per plan; bigs on the andariel scale precedent).
- Task 10: sixteen area defs, thirteen monsters + uniques, both town NPC casts, quests (Radament +1 skill, council flag, Duriel/Mephisto gates into the travel pattern), tier-4 bases.
- Phase 5 gate (controller): traversal act 1 -> 3 continuous; a2/a3 music keys sound in their areas; bake budget green; frame p95 in a flayer-jungle pack; console clean; screenshots per new town + one wilderness + one dungeon per act into shots/.

Environment: node build.js after every task; verify the BUILT diablo.html via chrome-devtools MCP (ONE ToolSearch batch; profile busy -> pkill only if no other agent is probing); hooks __forceLoad/__newGame/__continue/__step/__enter/__g/__mech/__audio; backgrounded tabs throttle rAF -- drive via hooks.

Conventions: Cross-cutting contracts in the checkpoints file. Narrative comments, no emoji, surgical diffs, zero asset files. Commits Conventional style matching git log, ending with: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Phase 6 Resume Prompt

(generated 2026-07-30 after the Phase 5 gate passed; also in clipboard via pbcopy)

```
Continue Phase 6 of the five-act effort in ~/Work/Projects/experiments/diablo: acts four and five (plan Tasks 11-12, art then world).

Working directory: /Users/jinsoon/Work/Projects/experiments/diablo (branch main; commit per task in repo style; NEVER git push).

State (Phases 0-5 done, 2026-07-30):
- Phase 5 shipped review-clean, zero fix rounds: Task 9 art a003d06 (desert/jungle terrains, eight props, fifteen figures), Task 10 world 4876d19 (16 areas, 13 monsters + uniques, both town casts, Radament +1 skill/council flag/Duriel/Mephisto travel gates, tier-4 bases). Gate passed: traversal 1->3 continuous, six a2/a3 moods sound, bake 857-964 ms of 1600, jungle p95 3.2 ms, console clean, shots/gate5-*.
- beca091 (between the two) is the ground-grain blur fix from Joseph's own live session -- sanctioned, GRAIN 0.24 in tiles.js; new Task 11 terrains inherit it automatically via bakeGroundField.
- Infra: Opus workers died on API 529 six times this session; standing ruling (from Task 4) is cut to a Fable worker after ~3 Opus deaths -- Opus is the floor, not ceiling.

Before starting, read in order:
1. docs/superpowers/plans/2026-07-29-five-acts-checkpoints.md -- Status, Cross-cutting contracts, Joseph's scope decisions.
2. The SDD ledger .superpowers/sdd/2026-07-29-five-acts/progress.md -- TAIL FIRST: tasks with a "complete" line are DONE; resume where the ledger says. The Phase 5 sequential-dispatch ruling carries to Phase 6 (Tasks 11-12 art then world: shared checkout, shared Chrome profile, Task 12's bake probe needs Task 11's commit).
3. Plan Tasks 11-12 + the Phase 6 gate: docs/superpowers/plans/2026-07-29-five-acts.md (Phase 6 section; Global Constraints bind every task).
4. Spec section 3's zone lists for acts 4-5: docs/superpowers/specs/2026-07-29-five-acts-design.md.

Carried traps for the dispatches (ledger deferred minors):
- ATLAS MEMORY CEILING: 34 figure sheets ~118 MB before Phase 6; acts 4-5 add ~14 figures. Task 11's dispatch must budget or probe cell-wise -- full-sheet getImageData readback has blanked earlier canvases in Chrome; game path draws single cells.
- Bake headroom is thinner than old headlines: 857-964 ms measured of the 1600 budget. Task 11 records before/after.
- The fortress stub (act 4 arrival) wears crypt terrain until Task 11's real hell terrain; genTown's shared clutter ring puts campfires on Kurast docks (cosmetic, ledgered).
- resurrect() always wakes the player in the Act 1 encampment, from any act (pre-existing; Task 14 unless Task 12's scope naturally touches it).
- ACTS travel.npc 'meshif' is decorative and mismatches the def id meshif3 (nothing reads it; tidy only if touched).
- won-state machinery is reserved intact for Baal -- Task 12 wires the real finish there (Andariel/Duriel/Mephisto precedents are gates, not wins).
- Task 12's monster defs reference Task 11's figure keys BY NAME; a missing figure throws at bake -- that throw is the integration test, run it after art lands.
- Council guards spawn rank normal vs the spec's elite wording -- design note for Joseph, lands with Task 14 balance.
- Standing rules: measured-anchor evidence at declared frames for any tooltip number; +-1-tick hazard-rate tolerance; probes pin hp/defense per-frame against the 5%-hit floor at level 50; tab hygiene (isolated contexts, Joseph's save backed up + byte-verified sha256 f50cb6dd..db7c, default tabs parked at title, NEVER pkill the Chrome profile -- Joseph may be playing).

Process (SDD, as Phases 2-5 ran it): scripts at /Users/jinsoon/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/scripts/ (task-brief PLAN_FILE N; review-package PLAN_FILE BASE HEAD; BASE via git rev-parse before each dispatch). Fresh Opus implementer per task (background, "WRITE files, do NOT plan", report to .superpowers/sdd/2026-07-29-five-acts/task-N-report.md, SHORT reply); Opus reviewer per task, empirical bar (reviewers reproduce numbers in the built game); fix loop max 5 rounds (1-3 resume implementer, 4-5 fresh on Fable); scoped re-review every round; ledger every step. On repeated Opus 529 deaths (~3), cut the role to Fable per the standing infra ruling.

Goals:
- Task 11: hell and mountain terrains/walls/props/figures per plan (reskins per plan; bigs on the andariel scale precedent; fortress gets its real terrain).
- Task 12: acts 4-5 area defs, monsters + uniques, town NPC casts, quests incl. the REAL ending at Baal (won-state), travel pattern completed.
- Phase 6 gate (controller): per the plan's Phase 6 gate text (traversal probe, a4/a5 music, bake + atlas budgets, frame p95 heaviest scene, console clean, screenshots per new town + one wilderness + one dungeon per act into shots/).
- After the gate: checkpoint (Status + progress.md What/Why/Next + ledger); hand off Phase 7 (Tasks 13-15: classic/yolo start -- Joseph decides the yolo-waypoint spec conflict at Task 13 -- balance pass, full playthrough, ship gate) when the window warrants.

Environment: node build.js after every task; verify the BUILT diablo.html via chrome-devtools MCP (ONE ToolSearch batch); hooks __forceLoad/__newGame/__continue/__step/__enter/__g/__mech/__audio; backgrounded tabs throttle rAF -- drive via hooks; __enter has a 0.6 s entry cooldown -- step past it between hops.

Conventions: Cross-cutting contracts in the checkpoints file. Narrative comments, no emoji, surgical diffs, zero asset files. Commits Conventional style matching git log, ending with: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Phase 7 Resume Prompt

(generated 2026-07-30 after the Phase 6 gate passed; also in clipboard via pbcopy)

```
Continue Phase 7 of the five-act effort in ~/Work/Projects/experiments/diablo: start modes, balance, the ship gate (plan Tasks 13-15).

Working directory: /Users/jinsoon/Work/Projects/experiments/diablo (branch main; commit per task in repo style; NEVER git push).

State (Phases 0-6 done, 2026-07-30):
- The full five-act game is live end-to-end: Phase 6 shipped review-clean, zero fix rounds -- Task 11 art f97b328 (obsidian/ice, five props, fourteen figures; atlas 150.6 MB / 48 sheets; bake 783-869 ms band of 1600), Task 12 world aedd6fb (13 areas, lava with vent lights, both town casts, izual/hephasto/shenk/ancients quests, the REAL Baal victory: toast "The Worldstone falls quiet.", won-state, keep playing). Gate passed: traversal + victory, a4/a5 music 14/14, lava reachability 30 seeds 0 fails, chaos p95 1.50 ms, bake 934 ms controller cold, console clean, shots/gate6-*.
- FIRST ACTION at Task 13, before dispatching: surface the yolo-waypoint spec conflict to Joseph and WAIT for his ruling. Phase 4 ledgered yolo waypoints as act-1-only wording vs the plan's Task 13 text "all waypoints all acts lit". One question, two options, recommend all-acts-lit (matches the plan text and yolo's convenience purpose). His ruling goes verbatim into the Task 13 brief.

Before starting, read in order:
1. docs/superpowers/plans/2026-07-29-five-acts-checkpoints.md -- Status, Cross-cutting contracts, Joseph's scope decisions (Classic default / Yolo selectable is charter decision 2).
2. The SDD ledger .superpowers/sdd/2026-07-29-five-acts/progress.md -- TAIL FIRST: tasks with a "complete" line are DONE; resume where the ledger says. Tasks 13-15 are strictly sequential (each consumes the prior's state).
3. Plan Tasks 13-15 + the Phase 7 gate: docs/superpowers/plans/2026-07-29-five-acts.md (Phase 7 section + Self-review notes; Global Constraints bind every task).
4. Spec sections 4 (start modes), 5 (pacing bands), 6 (ship contract): docs/superpowers/specs/2026-07-29-five-acts-design.md.

Carried traps for the dispatches (ledger deferred minors -- Task 14 is where the balance-class ones land):
- Council guards spawn rank normal vs the spec's elite wording -- Joseph design note, resolve at Task 14.
- resurrect() always wakes the player in the Act 1 encampment from any act -- pre-existing, fix at Task 14 (or ship-gate finding if Task 14's scope stays pure xp).
- Lava glow covers ~83% of flame's lava tiles (vent chains, block extends past the glow) -- cosmetic design note, Joseph may waive.
- __enter('stonyfield') and __enter('tamoehighland') throw reading 'kind' -- pre-existing on 799476a, reproduce before blaming a worker; triage at Task 15 if still live.
- genTown's shared clutter ring (campfires on Kurast docks, same furniture silhouette in all five towns) -- ledgered cosmetic.
- ACTS travel.npc 'meshif' decorative id mismatch (nothing reads it) -- tidy only if touched.
- Solid prop can occupy a waypoint tile (pre-existing, ~1-3% of levels) -- ship-gate finding if it bites.
- Standing rules: measured-anchor evidence at declared frames for any tooltip number; +-1-tick hazard-rate tolerance; Task 14's pacing probe drives REAL kills (sample areas, do not clear maps), bands per spec: Andariel 12-14, Duriel 20-22, Mephisto 27-29, Diablo 33-35, Baal 40-45, three consecutive runs in band; tab hygiene (isolated contexts, Joseph's save backed up + byte-verified sha256 f50cb6dd..db7c, default tabs parked at title, NEVER pkill the Chrome profile -- Joseph may be playing).

Process (SDD, as Phases 2-6 ran it): scripts at /Users/jinsoon/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/scripts/ (task-brief PLAN_FILE N; review-package PLAN_FILE BASE HEAD; BASE via git rev-parse before each dispatch). Fresh Opus implementer per task (background, "WRITE files, do NOT plan", report to .superpowers/sdd/2026-07-29-five-acts/task-N-report.md, SHORT reply); Opus reviewer per task, empirical bar (reviewers reproduce numbers in the built game); fix loop max 5 rounds (1-3 resume implementer, 4-5 fresh on Fable); scoped re-review every round; ledger every step. On ~3 Opus 529 deaths, cut the role to Fable per the standing infra ruling.

Goals:
- Task 13: mode row at class select -- Classic default (level 1, starter kit, act 1 town, nothing lit but town, Warriv refuses travel), Yolo second (level 50, all 30 class skills at 20, waypoints per Joseph's ruling, chase gear as today). Both save/load faithfully. Commit: feat: classic start, with yolo a deliberate second choice
- Task 14: pacing pass -- probe first (scripted classic kills along the golden path, level recorded at each act boss), tune xp constants until three consecutive runs land every band, log the runs. Commit: tune: the xp curve carries a classic hero to baal in band
- Task 15: ship gate -- run spec section 6's seven-point contract end to end (traversal, bosses, 60-skill harness, 15-mood harness, pacing bands, save round-trip + v1 fixture, generation sweep 35x30 [AREAS is actually 37 -- sweep them all; spec headline miscounts, ledgered], budgets, console, file:// smoke). Fix findings surgically; structural findings go to the main loop, not silent rewrites. Update progress.md status table + What/Why/Next with Measurements, README act list if named, checkpoints Status. Commit: docs: the five-act effort ships -- gate record and measurements
- Phase 7 gate (controller): re-run traversal + one boss + both harnesses independently; confirm budgets in progress.md match measured; close the effort in the checkpoints file.
- After the gate: checkpoint + close-out (this is the LAST phase -- the effort ends here; write the closing Status entry and tell Joseph the effort is shipped).

Environment: node build.js after every task; verify the BUILT diablo.html via chrome-devtools MCP (ONE ToolSearch batch); hooks __forceLoad/__newGame/__continue/__step/__render/__enter/__g/__mech/__audio/__killBoss. CONTROLLER PROBE NOTES (hard-won): __step REQUIRES a dt argument -- __step(1/60); a bare __step() poisons cam/clock with NaN, floods console with createRadialGradient errors, and only a reload clears it. __enter has a 0.6 s entry cooldown -- run ~50 steps of 1/60 between hops. For screenshots in hostile areas keep the probe hero alive (top up player.hp each step or use a leveled hero); call __render() before each screenshot; backgrounded tabs throttle rAF -- drive via hooks.

Conventions: Cross-cutting contracts in the checkpoints file. Narrative comments, no emoji, surgical diffs, zero asset files. Commits Conventional style matching git log, ending with: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
