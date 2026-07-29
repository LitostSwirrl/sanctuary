# Five Acts, Full Trees, Real Score -- Cross-Session Checkpoints

> Multi-session resume file. At each phase gate the agent checkpoints here (and in progress.md); when the window is worth shedding it appends a self-contained resume prompt, pbcopies it silently, and tells the user it is safe to /clear.
>
> Rules: append-only -- never edit historical prompts. Every resume prompt must be self-contained (a new session sees only CLAUDE.md + the pasted prompt).

## Status

- **Phase 0 -- baseline commit**: done (2026-07-29). Polish batch committed as `ca81421` before this effort touches the same files.
- **Phase 1 -- spec + plan**: done (2026-07-29). Spec `docs/superpowers/specs/2026-07-29-five-acts-design.md` (`2e44543`), plan `docs/superpowers/plans/2026-07-29-five-acts.md` (`be32fa2`) -- 15 tasks, six phases, probes and interfaces pinned per task.
- **Phase 2 -- music rewrite**: in flight (plan Tasks 1-2, one Opus worker on `src/audio/synth.js`)
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
