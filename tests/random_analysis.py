
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
    
    turn_limit = 70 
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
    
    # Simple summary of unit composition for analysis
    p1_strikers = len(game.player1.get_units_by_type("striker"))
    p1_miners = len(game.player1.get_units_by_type("miner"))
    p2_strikers = len(game.player2.get_units_by_type("striker"))
    p2_miners = len(game.player2.get_units_by_type("miner"))
    
    return winner, current_turn, p1_strikers, p1_miners, p2_strikers, p2_miners

def run_analysis_batch(iterations=50):
    print(f"Running {iterations} games of Random vs Random...")
    p1_wins = 0
    p2_wins = 0
    draws = 0
    
    total_turns = 0
    win_miners = []
    win_strikers = []
    lose_miners = []
    lose_strikers = []

    for i in range(iterations):
        winner, turns, p1s, p1m, p2s, p2m = simulate_game("Random", "Random", i)
        total_turns += turns
        if winner == "P1":
            p1_wins += 1
            win_miners.append(p1m)
            win_strikers.append(p1s)
            lose_miners.append(p2m)
            lose_strikers.append(p2s)
        elif winner == "P2":
            p2_wins += 1
            win_miners.append(p2m)
            win_strikers.append(p2s)
            lose_miners.append(p1m)
            lose_strikers.append(p1s)
        else:
            draws += 1

    print("\n=== RANDOM VS RANDOM ANALYSIS ===")
    print(f"Total Games: {iterations}")
    print(f"P1 Wins: {p1_wins} ({p1_wins/iterations*100:.1f}%)")
    print(f"P2 Wins: {p2_wins} ({p2_wins/iterations*100:.1f}%)")
    print(f"Draws: {draws}")
    print(f"Avg Turns: {total_turns/iterations:.1f}")
    
    if win_miners:
        print("\nAVERAGE UNIT COMPOSITION:")
        print(f"Winners: {sum(win_miners)/len(win_miners):.1f} Miners, {sum(win_strikers)/len(win_strikers):.1f} Strikers")
        print(f"Losers:  {sum(lose_miners)/len(lose_miners):.1f} Miners, {sum(lose_strikers)/len(lose_strikers):.1f} Strikers")

if __name__ == "__main__":
    run_analysis_batch(50)
