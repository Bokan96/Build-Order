import sys
import os
import random
from collections import defaultdict

# Add src to python path so imports work
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from prismata.game_state import GameState
from prismata.game_engine import GameEngine
from prismata.agent import Agent

class DummyLogger:
    def write(self, msg): pass
    def flush(self): pass

def run_simulation(p1_strat, p2_strat, max_turns=30):
    game = GameState("Player 1", "Player 2")
    game.setup_game()
    engine = GameEngine(game)
    
    agent1 = Agent(p1_strat, logger=DummyLogger(), interactive=False)
    agent2 = Agent(p2_strat, logger=DummyLogger(), interactive=False)
    
    # In my custom script, we don't have human interactive assignment, 
    # we need to manually resolve breach.
    def resolve_breach(attacker_agent):
        total_attack = sum(u.attack for u in engine.attacking_units)
        total_block = sum(u.block for u in engine.blocking_units)
        remaining = total_attack - total_block - engine.assigned_damage
        
        if remaining > 0:
            assignments = attacker_agent.assign_damage(game, engine, remaining)
            engine.resolve_combat(assignments)

    engine.start_phase()
    engine.action_phase()
    
    timeout = False
    
    while not game.game_over:
        if game.turn_number > max_turns:
            timeout = True
            break
            
        cur_p = game.current_player
        is_p1 = (cur_p.name == "Player 1")
        current_agent = agent1 if is_p1 else agent2
        other_agent = agent2 if is_p1 else agent1
        
        if game.phase == "Start":
            engine.block_phase()
            if game.phase != "Block":
                engine.action_phase()
        elif game.phase == "Block":
            current_agent.execute_turn(game, engine)
            breach, _ = engine.finish_blocking()
            if breach:
               resolve_breach(other_agent)
               engine.end_phase()
               engine.action_phase()
        elif game.phase == "Action":
            current_agent.execute_turn(game, engine)
            engine.end_phase()
            engine.end_turn()
            engine.start_phase()
            
    if timeout:
        return None, max_turns
    else:
        winner_strat = p1_strat if game.winner.name == "Player 1" else p2_strat
        return winner_strat, game.turn_number

if __name__ == "__main__":
    strategies = ["Aggressive", "Tactical", "Guard", "Wall", "Reactive", "Random"]
    
    num_games = 100
    results = defaultdict(lambda: {"wins": 0, "losses": 0, "draws": 0})
    timeouts = 0
    total_turns = 0
    
    print(f"Running {num_games} AI vs AI games (max 30 turns)...")
    
    for i in range(num_games):
        # Pick two random distinct strategies
        s1, s2 = random.sample(strategies, 2)
        
        winner, turns = run_simulation(s1, s2)
        
        if winner is None:
            timeouts += 1
            results[s1]["draws"] += 1
            results[s2]["draws"] += 1
        else:
            loser = s1 if winner == s2 else s2
            results[winner]["wins"] += 1
            results[loser]["losses"] += 1
            
        total_turns += turns
        
    avg_turns = total_turns / num_games
    
    print("\n=== RESULTS ===")
    print(f"Average turns per game: {avg_turns:.1f}")
    print(f"Timeouts (Draws by reaching turn 30): {timeouts}")
    
    print("\n--- Strategy Performance ---")
    
    # Sort by win rate
    sorted_results = []
    for strat, data in results.items():
        total_played = data["wins"] + data["losses"] + data["draws"]
        if total_played > 0:
            win_rate = data["wins"] / total_played
            sorted_results.append((strat, data["wins"], data["losses"], data["draws"], win_rate))
            
    sorted_results.sort(key=lambda x: x[4], reverse=True)
    
    print(f"{'Strategy':<15} {'Win%':<10} {'W':<5} {'L':<5} {'D':<5}")
    print("-" * 45)
    for strat, w, l, d, wr in sorted_results:
        print(f"{strat:<15} {wr*100:>5.1f}%     {w:<5} {l:<5} {d:<5}")


    # Hmmm