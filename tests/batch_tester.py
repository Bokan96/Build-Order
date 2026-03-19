
import sys
import os
import random

# Add src to python path
sys.path.append(os.path.join(os.getcwd(), "src"))

from prismata.game_state import GameState
from prismata.game_engine import GameEngine
from prismata.agent import Agent

def simulate_game(strategy1_name, strategy2_name, game_id, debug=False):
    game = GameState()
    game.setup_game()
    engine = GameEngine(game)
    
    logger = sys.stdout if debug else open(os.devnull, "w")
    
    agent1 = Agent(strategy1_name, logger=logger)
    agent2 = Agent(strategy2_name, logger=logger)
    
    turn_limit = 70 # Limit turns to 70 as requested
    current_turn = 0
    
    while not game.game_over and current_turn < turn_limit:
        current_turn += 1
        active_agent = agent1 if game.current_player == game.player1 else agent2
        
        # 1. Start Phase
        engine.start_phase()
        
        # 2. Defense Phase Logic
        engine.block_phase() # Checks for attackers
        
        if game.phase == "Block":
            active_agent.execute_turn(game, engine)
            # After defense turn, we need to finish defense
            # In agent.execute_turn, if breach happens, it handles resolution
            result, msg = engine.finish_blocking()
            
        # 3. Assignment Phase Logic
        if game.phase == "Assignment":
             active_agent.execute_turn(game, engine)
        
        # TRANSITION: If we were in Defense/Assignment, we might now be in Action or End
        # If we were NOT in Defense (i.e. ActionDone), we need to manually start Action
        if game.phase == "ActionDone" or game.phase == "Start":
            engine.action_phase()
             
        # 4. Action Phase Logic
        if game.phase == "Action":
            active_agent.execute_turn(game, engine)
            engine.end_phase()
            engine.end_turn()

    player1_hp = game.player1.base_health
    player2_hp = game.player2.base_health
    winner = "P1" if player2_hp <= 0 else "P2" if player1_hp <= 0 else "Draw"
    
    return winner, current_turn, player1_hp, player2_hp

def run_batch(iterations=20):
    strategies = ["Aggressive", "Guard", "Wall", "Reactive", "Random"]
    results = {}
    
    global_p1_wins = 0
    global_p2_wins = 0
    global_draws = 0

    for s1 in strategies:
        for s2 in strategies:
            p1_wins = 0
            p2_wins = 0
            draws = 0
            total_turns = 0
            
            print(f"Running batch simulation: {iterations} games of {s1} vs {s2}...")
            
            for i in range(iterations):
                winner, turns, p1_hp, p2_hp = simulate_game(s1, s2, i)
                if winner == "P1":
                    p1_wins = p1_wins + 1
                    global_p1_wins = global_p1_wins + 1
                elif winner == "P2":
                    p2_wins = p2_wins + 1
                    global_p2_wins = global_p2_wins + 1
                else:
                    draws = draws + 1
                    global_draws = global_draws + 1
                total_turns = total_turns + turns
            
            avg_turns = total_turns / iterations
            results[(s1, s2)] = (p1_wins, p2_wins, draws, avg_turns)

    print("\n" + "="*65)
    print(f"{'P1 Strat':<12} {'P2 Strat':<12} {'P1 Wins':<8} {'P2 Wins':<8} {'Draws':<8} {'Avg Turns'}")
    print("-" * 65)
    for (s1, s2), (w1, w2, d, avg) in results.items():
        print(f"{s1:<12} {s2:<12} {w1:<8} {w2:<8} {d:<8} {avg:.1f}")
        
    total_games = global_p1_wins + global_p2_wins + global_draws
    print("\n" + "="*65)
    print("GLOBAL WINRATE ANALYSIS")
    print("-" * 65)
    print(f"Total Games Played: {total_games}")
    print(f"Total P1 Wins:      {global_p1_wins} ({global_p1_wins/total_games*100:.1f}%)")
    print(f"Total P2 Wins:      {global_p2_wins} ({global_p2_wins/total_games*100:.1f}%)")
    print(f"Total Draws:        {global_draws} ({global_draws/total_games*100:.1f}%)")

if __name__ == "__main__":
    run_batch(iterations=20)
