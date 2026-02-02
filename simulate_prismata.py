
import sys
import os
import time

# Add src to python path
sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from prismata.game_state import GameState
from prismata.game_engine import GameEngine
from prismata.agent import Agent

def run_simulation(p1_strat, p2_strat, sim_id, logger):
    game = GameState(f"AI1 ({p1_strat})", f"AI2 ({p2_strat})")
    game.setup_game()
    engine = GameEngine(game)
    
    agent1 = Agent(p1_strat, logger=logger, interactive=False)
    agent2 = Agent(p2_strat, logger=logger, interactive=False)
    
    logger.write(f"\n--- SIMULATION {sim_id}: {p1_strat} vs {p2_strat} ---\n")
    
    # Start loop
    engine.start_phase()
    engine.action_phase()
    
    turn_limit = 100
    while not game.game_over and game.turn_number < turn_limit:
        # Phase Auto-Advancement logic (same as main.py)
        if game.phase == "Start":
            engine.defense_phase()
            if game.phase != "Defense":
                engine.action_phase()
        
        active_agent = agent1 if game.current_player == game.player1 else agent2
        
        if game.phase == "Defense":
            active_agent.execute_turn(game, engine)
            engine.end_phase()
            engine.action_phase()
            
        if game.phase == "Action":
            active_agent.execute_turn(game, engine)
            engine.end_phase()
            engine.end_turn()
            engine.start_phase()
            # Log turn start status as requested
            logger.write(f"\n=== TURN {game.turn_number} START: {game.current_player.name} ===\n")
            logger.write(f"{game.player1.get_state_string()}\n")
            logger.write(f"{game.player2.get_state_string()}\n")
            logger.flush()
            
    winner = game.winner.name if game.winner else "Draw/Timeout"
    return winner

def main():
    strats = ["Aggressive", "Guard", "Reactive", "Random"]
    tactical = "Tactical"
    
    results = {}
    
    log_file = open("simulation_log.txt", "w")
    log_file.write("--- PRISMATA SIMULATION BATCH ---\n")
    
    print("Starting 20 simulations...", flush=True)
    for strat in strats:
        print(f"Simulating Tactical vs {strat} (5 times)...", flush=True)
        results[strat] = {"Tactical": 0, strat: 0, "Draw": 0}
        for i in range(5):
            # Alternating P1/P2 advantage? 
            # Let's just do Tactical as P1 for consistency or maybe 3 as P1, 2 as P2?
            # User said "4 variations", which I interpret as the 4 opponent types.
            if i % 2 == 0:
                winner = run_simulation(tactical, strat, f"{strat}_{i+1}", log_file)
            else:
                winner = run_simulation(strat, tactical, f"{strat}_{i+1}_flip", log_file)
            
            if "Tactical" in winner:
                results[strat]["Tactical"] += 1
            elif strat in winner:
                results[strat][strat] += 1
            else:
                results[strat]["Draw"] += 1
                
    log_file.close()
    
    print("\n--- RESULTS ---")
    print(f"{'Opponent':<15} {'Tactical Wins':<15} {'Opponent Wins':<15} {'Draws':<10}")
    print("-" * 60)
    for strat, res in results.items():
        print(f"{strat:<15} {res['Tactical']:<15} {res[strat]:<15} {res['Draw']:<10}")

if __name__ == "__main__":
    main()
