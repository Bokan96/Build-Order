# ⚔️ PENDING FIXES - Reported by Game Tester

The following critical bugs were identified during automated playtesting.

## 1. Attack Phase Deadlock
- **Location:** `main.py`
- **Description:** When a player attacks but the defender has no blockers, the `end` command in the `Attack` phase does not transition to the `End` phase. It merely prints a help message.
- **Requirement:** Update the `elif game.phase == "Attack":` block to allow turn progression even if `blocking_units` is empty.
- **Status:** ✅ **RESOLVED**

## 2. Infinite Damage Exploit
- **Location:** `game_engine.py` -> `resolve_combat()`
- **Reproduction:**
  1. Prepare 1 Striker (2 ATK).
  2. Enter Attack Phase.
  3. Execute `assign base 2`.
  4. Repeat `assign base 2`.
- **Issue:** `total_attack` is recalculated every time `resolve_combat` is called, and damage is never "spent."
- **Requirement:** 
  - Either clear `self.attacking_units` immediately after `assign` is used once.
  - Or (better) track `remaining_damage_pool` and subtract from it.
  - Automatically call `end_phase()`/`end_turn()` once all damage is assigned.
- **Status:** ✅ **RESOLVED** (Damage tracking added, auto-end turn implemented)

## 3. Shortcut System Desync
- **Context:** The Tester added a `resolve_unit_name` system.
- **Note:** Ensure all new logic in `game_engine.py` stays compatible with these shortcuts or relies on the full names passed down from `main.py`.
- **Status:** ✅ **VERIFIED** (Main.py handles resolution before passing to engine)

---

## 4. Negative Damage Exploit (CRITICAL)
- **Description:** The `assign` command accepts negative values, which heals the target and *increases* the remaining damage pool for the attacker.
- **Example:** `assign base -10` makes a single Striker (2 ATK) have a damage pool of 12 for the rest of the phase.
- **Requirement:** Ensure damage assigned in `resolve_combat` or `parse_damage_assignment` is always positive.
- **Status:** ✅ **RESOLVED** (Input validation added)

## 5. Multiple Purchase Exploit
- **Description:** Rulebook limit "Buy 1 Unit" is not enforced. Players can buy unlimited units if they have the gold.
- **Requirement:** Add turn-based purchase limit.
- **Status:** ✅ **RESOLVED** (Added `purchased_unit` tracking to Player state)

## 6. Overcharger UI Deadlock
- **Description:** Overcharger requires a target unit object in `use_ability`, but the CLI `use` command has no syntax to specify a target (index or type).
- **Requirement:** Update `use` command syntax to support targets (e.g. `use overcharger 1 target miner 1`).
- **Status:** ✅ **RESOLVED** (Added `use <u1> on <u2>` syntax support)

## 7. Passive Energy / Starter Unit Discrepancy
- **Description:** Rulebook says energy is gained in Start Phase from Reactors. Code requires manually "using" Energizers (which exhausts them).
- **Requirement:** Clarify design and sync rulebook/code.
- **Status:** ✅ **RESOLVED** (Rulebook updated to match Active Energizer design in Step 207)

---
**Status:** All Critical Issues Resolved
**Reporters:** Antigravity (QA / Game Tester)
