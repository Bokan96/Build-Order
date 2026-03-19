
import random
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))
from prismata.game_state import GameState
from prismata.game_engine import GameEngine
from prismata.agent import Agent

def simulate_game(strategy1_name, strategy2_name, game_id):
    game = GameState()
    game.setup_game()
    engine = GameEngine(game)
    
    log_filename = f"game_{game_id}_log.txt" if game_id in [8, 18] else "nul"
    log_file = open(log_filename, "w")
    agent1 = Agent(strategy1_name, logger=log_file)
    agent2 = Agent(strategy2_name, logger=log_file)
    
    turn_limit = 50
    current_turn = 0
    
    while not game.game_over and current_turn < turn_limit:
        current_turn += 1
        active_agent = agent1 if game.current_player == game.player1 else agent2
        
        # 1. Start Phase
        engine.start_phase()
        if game.phase == "Start":
            engine.action_phase()
        
        # 2/3. AI handles both Defense and Action phases if they occur
        active_agent.execute_turn(game, engine)

        # Agent logic usually ends after preparing attackers or ending phase.
        # We need to ensure the turn actually advances if the agent didn't do it.
        # In Agent.execute_turn, it calls end_phase() for Defense.
        # If it's Action phase, the engine end_turn handles transition.
        
        if game.phase == "Action":
             engine.end_phase()
             engine.end_turn()

    player1_hp = game.player1.base_health
    player2_hp = game.player2.base_health
    winner = "P1" if player2_hp <= 0 else "P2" if player1_hp <= 0 else "Draw"
    
    return winner, current_turn, player1_hp, player2_hp, len(game.player1.units), len(game.player2.units)

strategies = ["Aggressive", "Guard", "Wall", "Reactive", "Random"]
print(f"{'Game':<5} {'P1 Strat':<10} {'P2 Strat':<10} {'Winner':<10} {'Turns':<5} {'P1 HP':<5} {'P2 HP':<5} {'P1 Units':<5} {'P2 Units':<5}")

idx = 1
# Test against Aggressive
strategies_to_test = ["Guard", "Wall", "Reactive", "Random", "Aggressive"]

print("-" * 75)
print("PART 1: P1 (Aggressive) vs AI P2")
for s in strategies_to_test:
    for _ in range(2): 
        winner, turns, p1hp, p2hp, p1u, p2u = simulate_game("Aggressive", s, idx)
        print(f"{idx:<5} {'Aggressive':<10} {s:<10} {winner:<10} {turns:<5} {p1hp:<5} {p2hp:<5} {p1u:<5} {p2u:<5}")
        idx += 1

print("-" * 75)
print("PART 2: P2 (Aggressive) vs AI P1")
for s in strategies_to_test:
    for _ in range(2):
        winner, turns, p1hp, p2hp, p1u, p2u = simulate_game(s, "Aggressive", idx)
        print(f"{idx:<5} {s:<10} {'Aggressive':<10} {winner:<10} {turns:<5} {p1hp:<5} {p2hp:<5} {p1u:<5} {p2u:<5}")
        idx += 1
