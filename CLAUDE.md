# Build Order — project notes

2-player strategy card game. The rules engine is Python (`src/prismata/`), run in the browser through Pyodide; the UI is vanilla JS (`web/`). Live site: https://bojanbozovic.com/Build-Order/web/ (GitHub Pages).

## Run, test, deploy
- **Serve from the repo root**, never from `web/`: the page fetches `../src/prismata/*.py`. `npm run serve` → http://localhost:3500/web/ (hard-refresh with Ctrl+Shift+R after edits).
- `npm run check` — JS syntax (run before every commit; a pre-commit hook does this: enable it once with `git config core.hooksPath .githooks`).
- `npm run test:engine` — Python rule checks (`tests/engine_checks.py`, `--quick` skips the long AI stress run).
- `npm test` — headless-Chrome play-tests (`tests/web/`): gameplay scenarios, both tutorials, UI checks, phone portrait/landscape. `npm run test:online` adds the two-peer PeerJS test (needs internet). `BASE=<url>` targets another host (e.g. the live site). `--only ui:mobile` runs one scenario.
- `npm run screens` — screenshots of the main screens into `tests/web/shots/`.
- **Deploy = push to `Web-Port`.** The Pages workflow publishes within ~30 s, so never push unchecked code. UI changes get reviewed on localhost first, then pushed.
- When `web/app.js`, `style.css` or `effects.css` change, bump their `?v=` in `web/index.html` and the menu version label, or returning players keep stale files.

## Architecture map
- `src/prismata/game_engine.py` — phases (Start → Block → Breach → Action → End), `prepare_unit_attack`, `undo_action` (action logs store the resource delta applied), `assign_blockers` / `clear_blockers`, `resolve_combat`.
- `src/prismata/agent.py` — AI. The web client always uses `plan_turn` / `plan_defense` + `execute_step` (same plan at every speed). "Defensive" in the menu = the Tactical strategy.
- `web/app.js` — `PrismataWeb`: `setupGame` (Python globals bound via `_runPy`, never string-spliced), `syncState` → `get_ui_bundle()`, `updateUI` → `renderUnits` (full rebuild; `_animateCardChanges` animates diffs, floats, fly-ins), `handleEndTurn` (all phase transitions; `processingTurn` lock, `gameSession` guards async AI turns), `_runAIActionTurn` / `_runAIDefense`, tutorial, shop, loop helpers (`_harvest`, `_blockAll`, `_skipEmptyBlockPhase`, end-turn confirm).
- `web/multiplayer.js` — PeerJS rooms (`bo-XXX` ids). Online actions: `buy, prepare, ability, undo, block, clearBlocks, breach, endTurn, repeaterTarget, rematch`; every incoming action passes `_isValidRemoteAction` (unit keys, integer ranges, active-seat check). Turn ownership is by seat (`currentIsP1`), never by name.
- `web/style.css` (layout, cards, phases; mobile ≤768px and landscape ≤500px tall blocks at the end), `web/effects.css` (animations, badges, popups).
- Input feel: cards and breach columns act on mouse **press** (a capture-phase `pointerdown` in `bindEvents` calls the element's `onclick` and swallows the release click; touch stays tap-on-release). The cursor is a native CSS `url()` cursor (`assets/UI/cursor*.svg`), never a JS-drawn element. Sound effects play from pre-decoded Web Audio buffers (`SoundManager.preload`); music stays on `<audio>`. A turn change locks input for 450 ms (tutorial: the full 1.2 s ribbon).

## Agreed rules (don't change without asking)
- AI pacing stays as is: 4 s "thinking" pause and the per-step delays in `_aiStepDelay` (the user chose this deliberately).
- A unit attacks once per turn; a Repeater re-ready only frees it to block.
- Hints and toasts never include player names.
- Respect `prefers-reduced-motion`: no card animations, embers or tilt.

## Workflow
- One commit per logical change, descriptive message. Push after the user has looked at UI work on localhost (or immediately for a broken live site).
- Verify with `npm run check` + `npm test` (and `test:online` when multiplayer code changed) before pushing.
