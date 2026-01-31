
import sys
import os
import random

# Add src to python path
sys.path.append(os.path.join(os.getcwd(), "src"))

from prismata.game_state import GameState
from prismata.game_engine import GameEngine
from prismata.agent import Agent

def simulate_game(strategy1_name, strategy2_name, game_id):
    game = GameState()
    game.setup_game()
    engine = GameEngine(game)
    
    agent1 = Agent(strategy1_name, logger=open(os.devnull, "w"))
    agent2 = Agent(strategy2_name, logger=open(os.devnull, "w"))
    
    turn_limit = 70 # Limit turns to 70 as requested
    current_turn = 0
    
    while not game.game_over and current_turn < turn_limit:
        current_turn += 1
        active_agent = agent1 if game.current_player == game.player1 else agent2
        
        # 1. Start Phase
        engine.start_phase()
        if game.phase == "Start":
            engine.action_phase()
        
        # AI Turn
        active_agent.execute_turn(game, engine)
        
        # Advance if still in Action
        if game.phase == "Action":
             engine.end_phase()
             engine.end_turn()

    player1_hp = game.player1.base_health
    player2_hp = game.player2.base_health
    winner = "P1" if player2_hp <= 0 else "P2" if player1_hp <= 0 else "Draw"
    
    return winner, current_turn, player1_hp, player2_hp

def run_batch(iterations=20):
    strategies = ["Aggressive", "Guard", "Wall", "Reactive", "Random"]
    results = {}

    for s1 in strategies:
        for s2 in strategies:
            # Re-initialize to ensure 50 iterations of Random vs Random specifically
            p1_wins = 0
            p2_wins = 0
            draws = 0
            total_turns = 0
            
            print(f"Running batch simulation: {iterations} games of {s1} vs {s2}...")
            
            for i in range(iterations):
                winner, turns, p1_hp, p2_hp = simulate_game(s1, s2, i) # Changed to simulate_game
                if winner == "P1": # Changed to "P1"
                    p1_wins += 1
                elif winner == "P2": # Changed to "P2"
                    p2_wins += 1
                else:
                    draws += 1
                total_turns += turns
            
            avg_turns = total_turns / iterations
            results[(s1, s2)] = (p1_wins, p2_wins, draws, avg_turns)

    print("\n" + "="*65)
    print(f"{'P1 Strat':<12} {'P2 Strat':<12} {'P1 Wins':<8} {'P2 Wins':<8} {'Draws':<8} {'Avg Turns'}")
    print("-" * 65)
    for (s1, s2), (w1, w2, d, avg) in results.items():
        print(f"{s1:<12} {s2:<12} {w1:<8} {w2:<8} {d:<8} {avg:.1f}")

if __name__ == "__main__":
    run_batch(iterations=50)
