---
name: playtest
description: Run the Build Order play-tests (headless Chrome + engine checks), show screenshots of the main screens, and report what passed or failed. Use after changing web/ or src/prismata/, or when asked to "playtest", "run the tests" or "check the game".
---

# Playtest Build Order

1. Syntax and engine first (fast): `npm run check` and `npm run test:engine --quick`. Stop and fix if either fails.
2. Browser scenarios: `npm test`. Add `--online` (or run `npm run test:online`) when `multiplayer.js`, `receiveRemoteAction`, `_isValidRemoteAction` or any `sendAction` call changed. To test the deployed site: `BASE=https://bojanbozovic.com/Build-Order/web/ npm test`.
   - Each scenario prints PASS/FAIL lines; `run.js` repeats the full output of failed scenarios at the end. A scenario that only fails on timing (clicking during the 1.2 s turn ribbon, or measuring during the purchase shine) is a test problem, not a game bug: wait for `!gameApp.isTurnTransitioning` / sleep 1.5 s and rerun.
3. Visual review: `npm run screens`, then look at `tests/web/shots/*_2_board.png`, `*_5_block.png`, `*_6_breach.png`, `*_4_shop.png`, `*_7_end.png` for desktop, phone and landscape. Check for overlaps, clipped text, cards off-screen, buttons hidden.
4. Report: scenarios passed/failed, anything odd in the screenshots, and whether the result is safe to push (pushing `Web-Port` deploys the live site).

Scenario map: `suite` (hotseat full block, victory, restart mid-AI-turn, duplicate/quoted names, AI attacks), `tutorial` (desktop, mobile), `ui` (animations/hints/meter/pips/popups/recap/fly-in/hit flash; reduced motion; phone portrait and landscape), `loop` (click sound, stacks, harvest, end-turn confirm, previews, block all/clear, empty-block skip, tilt, embers, end screen, rematch), `online` (two peers through the PeerJS cloud, state compared after every move).
