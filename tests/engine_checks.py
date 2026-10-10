"""Engine regression checks (no browser). Run: python tests/engine_checks.py [--quick]

Covers the rules we rely on in the web client: undo exploits stay closed, a unit attacks once per turn,
clear_blockers restores Walls/Barriers, the Defensive AI buys like Tactical, and AI-vs-AI games run clean.
"""
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from prismata.agent import Agent  # noqa: E402
from prismata.game_engine import GameEngine  # noqa: E402
from prismata.game_state import GameState  # noqa: E402
from prismata.units import create_unit  # noqa: E402

QUICK = "--quick" in sys.argv
failures = 0


def check(cond, label):
    global failures
    print(f"  {'PASS' if cond else 'FAIL'}  {label}")
    if not cond:
        failures += 1


def fresh():
    g = GameState("P1", "P2")
    g.setup_game()
    e = GameEngine(g)
    e.start_phase()
    e.action_phase()
    return g, e


def add(player, unit_type, ready=True):
    u = create_unit(unit_type)
    u.exhausted = not ready
    player.units.append(u)
    return u


def undo_checks():
    print("undo rules")
    g, e = fresh()
    p = g.player1
    add(p, "repeater")
    e.use_ability("energizer", 1)
    en = p.get_units_by_type("energizer")[0]
    e.use_ability("repeater", 1, target=en)
    e.use_ability("energizer", 1)
    ok, _ = e.undo_action("repeater", 1)
    check(not ok and p.energy == 1, "Repeater undo refused once the readied unit was used (no energy loop)")

    g, e = fresh()
    p = g.player1
    w = add(p, "wall", ready=False)
    p.energy = 1
    e.use_ability("wall", 1)
    ok, _ = e.undo_action("wall", 1)
    check(ok and p.energy == 1 and w.exhausted, "Wall repair undo refunds energy and re-exhausts the Wall")

    g, e = fresh()
    p = g.player1
    s = add(p, "striker")
    p.energy = 1
    e.prepare_unit_attack("striker", 1)
    ok, _ = e.undo_action("striker", 1)
    check(ok and p.energy == 1 and p.displayed_attack == 0 and not e.prepared_squad, "Striker prep undo works at 0 energy")

    g, e = fresh()
    p = g.player1
    s = add(p, "striker")
    add(p, "repeater")
    p.energy = 3
    e.prepare_unit_attack("striker", 1)
    e.use_ability("repeater", 1, target=s)
    ok, _ = e.prepare_unit_attack("striker", 1)
    e.prepare_attackers([("striker", "all")])
    check(not ok and len(e.prepared_squad) == 1 and p.displayed_attack == 2, "a re-readied attacker never attacks twice")


def block_checks():
    print("blocking")
    g, e = fresh()
    s = add(g.player1, "striker")
    g.player1.energy = 1
    e.prepare_unit_attack("striker", 1)
    e.end_phase(); e.end_turn(); e.start_phase(); e.block_phase()
    w = add(g.player2, "wall")
    bar = g.player2.get_units_by_type("barrier")[0]
    e.assign_blockers([("barrier", 1), ("wall", 1)])
    ok, _ = e.clear_blockers()
    check(ok and not w.exhausted and bar.is_alive() and g.player2.displayed_block == 0 and not e.blocking_units,
          "clear_blockers restores the Wall and the Barrier")
    e.assign_blockers([("wall", 1)])
    ok, _ = e.finish_blocking()
    check(ok and g.phase == "Action", "blocking still resolves after a clear")


def ai_checks():
    print("AI")
    g = GameState("P1", "AI")
    g.setup_game()
    e = GameEngine(g)
    for t in ["striker"] * 3 + ["energizer"] * 2:
        add(g.player1, t)
    g.switch_player(); e.start_phase(); e.action_phase()
    g.player2.gold = 7
    g.player2.lifetime_units["barrier"] = 2
    buys = [s["unit"] for s in Agent("Defensive").plan_turn(g, e) if s["type"] == "buy"]
    check(buys[:1] == ["wall"], f"Defensive AI buys Walls when threatened ({buys})")

    games = 20 if QUICK else 100
    strats = ["Standard", "Defensive", "Tactical", "Aggressive", "Reactive", "Random", "Guard", "Wall"]
    random.seed(7)
    errors = 0
    for _ in range(games):
        a, b = random.choice(strats), random.choice(strats)
        g = GameState("A", "B"); g.setup_game(); e = GameEngine(g)
        agents = {"A": Agent(a), "B": Agent(b)}
        e.start_phase(); e.action_phase()
        try:
            for _turn in range(120):
                ag = agents[g.current_player.name]
                for step in ag.plan_turn(g, e):
                    if step["type"] == "end":
                        break
                    ag.execute_step(g, e, step)
                e.end_phase(); e.end_turn(); g.current_player.units_purchased = 0; e.start_phase(); e.block_phase()
                if g.phase == "Block":
                    d = agents[g.current_player.name]
                    for step in d.plan_defense(g, e):
                        if step["type"] == "end":
                            break
                        d.execute_step(g, e, step)
                    e.finish_blocking()
                    if g.phase == "Breach":
                        atk = agents[g.other_player.name]
                        total = sum(u.attack for u in e.attacking_units) - sum(u.block for u in e.blocking_units)
                        e.resolve_combat(atk.assign_damage(g, e, total))
                        e.end_phase(); e.action_phase()
                else:
                    e.action_phase()
                assert len(e.prepared_squad) == len(set(map(id, e.prepared_squad)))
                assert g.current_player.energy >= 0 and g.current_player.gold >= 0
                if g.game_over:
                    break
        except Exception as ex:  # noqa: BLE001
            errors += 1
            print("   ", a, "vs", b, "->", repr(ex))
    check(errors == 0, f"{games} AI-vs-AI games without engine errors")


undo_checks()
block_checks()
ai_checks()
print(f"\n{'ALL ENGINE CHECKS PASSED' if not failures else str(failures) + ' CHECK(S) FAILED'}")
sys.exit(1 if failures else 0)
