"""
Prismata Lite - Console Interface
A text-based implementation for testing game balance.
"""

import os
from .game_state import GameState
from .game_engine import GameEngine
from .units import UNIT_TYPES
from .agent import Agent
import time
import random

# Unit descriptions for help system
UNIT_HELP = {
    "miner": """
MINER - Economic Unit
Cost: 2 Gold
Stats: 0 ATK / 1 BLK / 1 HP

Ability: MINE (Exhaust, costs 1 Energy)
  - Spend 1 Energy to gain 1 Gold
  - Use: 'use miner' (uses 1), 'use miner 3' (uses 3), 'use miner all' (uses all)
""",
    "energizer": """
ENERGIZER - Energy Generator
Cost: 2 Gold
Stats: 0 ATK / 0 BLK / 3 HP

Ability: GENERATE (Exhaust)
  - Gain 1 Energy
  - Use: 'use energizer' (uses 1), 'use energizer all' (uses all)
""",
    "striker": """
STRIKER - Basic Attacker
Cost: 3 Gold
Stats: 2 ATK / 0 BLK / 1 HP

Cheap attacker for early pressure.
Each attack prepared costs 1 Energy.
Use: 'attack striker 1'
""",
    "guard": """
GUARD - Basic Defender
Cost: 3 Gold
Stats: 1 ATK / 2 BLK / 2 HP

Basic defensive unit.
Can block 2 damage when ready.
""",
    "wall": """
WALL - Heavy Blocker
Cost: 3 Gold
Stats: 0 ATK / 2 BLK / 0 HP (Limit 3 per player)

Structural defensive unit.
Provides 2 block. (Must REPAIR for 1 Energy if used to block)
Does not ready automatically at start of turn.
Use: 'use wall' to repair.
""",
    "overcharger": """
OVERCHARGER - Utility Unit
Cost: 3 Gold + 1 Energy
Stats: 1 ATK / 1 BLK / 3 HP

Ability: OVERCHARGE (Exhaust, costs 1 Energy)
  - Ready another unit (allows it to be used again this turn)
  - Enables powerful combos and double-use strategies
  - Use: 'use overcharger 1' then select target
""",
    "volatile": """
VOLATILE - Burst Damage
Cost: 4 Gold + 2 Energy
Stats: 0 ATK / 0 BLK / 2 HP

Ability: DETONATE (Exhaust, costs 1 Energy)
  - Destroy this unit to gain +5 Attack (total 5 ATK!)
  - Massive burst finisher
  - Use: 'use volatile 1' to detonate
""",
    "barrier": """
BARRIER - Cheap Blocker
Cost: 1 Gold
Stats: 0 ATK / 1 BLK / 1 HP

Cheap disposable blocker.
Good for emergency defense.
"""
}

def clear_screen():
    """Clear the console screen."""
    os.system('cls' if os.name == 'nt' else 'clear')

def print_help(unit_name=None):
    """Display available commands or unit-specific help."""
    clear_screen()
    
    if unit_name:
        # Show help for specific unit
        unit_name = resolve_unit_name(unit_name)
        if unit_name in UNIT_HELP:
            print("="*60)
            print(UNIT_HELP[unit_name])
            print("="*60)
        else:
            print(f"[ERROR] Unknown unit: {unit_name}")
            print("Available units: miner, energizer, striker, guard, wall, overcharger, volatile, barrier")
        return
    
    # Show general help
    print("="*60)
    print("PRISMATA LITE - COMMAND REFERENCE")
    print("="*60)
    print("\nGENERAL:")
    print("  help                    - Show this help message")
    print("  help <unit>             - Show detailed unit info (e.g., 'help miner')")
    print("  state                   - Display current game state")
    print("  end                     - End current phase/turn")
    print("  quit                    - Exit the game")
    
    print("\nACTION PHASE:")
    print("  buy                     - Show unit shop")
    print("  buy <unit>              - Buy unit (e.g. 'buy miner' or 'buy m')")
    print("  use <unit> [count|all]  - Use ability (e.g. 'use m', 'use m 3')")
    print("  use <u1> on <u2>        - Target unit for ability (e.g. 'use o 1 on m 1')")
    print("  attack <unit> <#>, ...  - Prepare attackers")
    
    print("\nDEFENSE PHASE:")
    print("  block <unit> [#]        - Assign blocker (e.g., 'block guard' or 'block wall 2')")
    print("  <unit>                  - Kill a unit (if Attacker) or block with one (if Defender)")
    print("  base                    - Damage enemy base (Attacker command)")
    print("  end                     - Finish blocking (Defense) or current phase (Action)")
    
    print("\nUNITS (type 'help <unit>' for details):")
    print("  miner, energizer, striker, guard, wall, overcharger, volatile, barrier")
    print("="*60)
    print("\nTIP: The screen clears after each command to reduce clutter!")
    print("="*60)

def show_unit_shop():
    """Display available units sorted by cost."""
    clear_screen()
    print("="*60)
    print("UNIT SHOP - Available Units")
    print("="*60)
    
    units = [
        ("Barrier", "1G", "0/1/1", "Cheap blocker"),
        ("Miner", "2G", "0/0/2", "Mine: 1E -> 1G"),
        ("Energizer", "2G", "0/0/2", "Generate: Gain 1E"),
        ("Striker", "3G", "2/0/1", "Atk Cost: 1E"),
        ("Guard", "3G", "1/2/2", "Basic blocker"),
        ("Overcharger", "3G+1E", "1/1/3", "Ready another unit"),
        ("Wall", "3G", "0/2/0", "READY on enter"),
        ("Volatile", "4G+2E", "3/0/2", "Detonate: +3 ATK"),
    ]
    
    print(f"\n{'Unit':<15} {'Cost':<8} {'ATK/BLK/HP':<12} {'Ability'}")
    print("-"*60)
    for name, cost, stats, desc in units:
        print(f"{name:<15} {cost:<8} {stats:<12} {desc}")
    
    print("="*60)
    print("Type 'buy <unit>' to purchase (e.g., 'buy miner')")
    print("Type 'help <unit>' for detailed info (e.g., 'help miner')")
    print("Shortcuts: First letter of unit name also works (e.g., 'buy m')")
    print("="*60)

def resolve_unit_name(name):
    """
    Resolve a potential unit shortcut to its full name.
    e.g. 'm' -> 'miner', 'E' -> 'energizer'
    If no match found, returns the original name (lowercased).
    """
    name = name.lower()
    shortcuts = {
        'm': 'miner',
        'e': 'energizer',
        's': 'striker',
        'g': 'guard',
        'w': 'wall',
        'o': 'overcharger',
        'v': 'volatile',
        'b': 'barrier'
    }
    return shortcuts.get(name, name)

def parse_unit_list(text):
    """
    Parse a comma-separated list of units.
    Example: "striker 1, striker 2, guard 1" -> [("striker", 1), ("striker", 2), ("guard", 1)]
    """
    units = []
    parts = text.split(",")
    
    for part in parts:
        part = part.strip()
        tokens = part.split()
        
        if len(tokens) == 1:
            # Default to 1 unit
            unit_type = resolve_unit_name(tokens[0])
            unit_number = 1
        elif len(tokens) == 2:
            # format: <unit> <number>
            unit_type = resolve_unit_name(tokens[0])
            try:
                unit_number = int(tokens[1])
            except ValueError:
                return None, f"Invalid number: '{tokens[1]}'"
        else:
            return None, f"Invalid format: '{part}' (expected '<unit> <number>' or just '<unit>')"
            
        units.append((unit_type, unit_number))
        
    return units, None

def parse_damage_assignment(text, game, engine):
    """
    Parse damage assignment with streamlined syntax.
    Example: "base" -> ("base", all_remaining)
    Example: "m" -> ("miner", lethal_to_one)
    """
    tokens = text.strip().split()
    total_attack = sum(u.attack for u in engine.attacking_units)
    total_block = sum(u.block for u in engine.blocking_units)
    remaining = total_attack - total_block - engine.assigned_damage
    
    if len(tokens) == 0:
        return None, "Empty command"
        
    target = tokens[0].lower()
    
    if target == "base":
        return ("base", remaining), None
    else:
        unit_type = resolve_unit_name(target)
        # Find lethal damage for 1 unit of this type
        defender = game.current_player
        units = defender.get_units_by_type(unit_type)
        alive_units = [u for u in units if u.is_alive()]
        
        if not alive_units:
            return None, f"No alive {unit_type}s to target"
            
        # Sort by HP to get the most efficient kill
        alive_units.sort(key=lambda u: u.current_health)
        lethal_damage = alive_units[0].current_health
        
        # If user specified exact damage, use it (old syntax fallback)
        if len(tokens) == 2:
            try:
                lethal_damage = int(tokens[1])
            except ValueError:
                return None, f"Invalid damage value: '{tokens[1]}'"
        
        return (unit_type, lethal_damage), None

def run_attacker_assignment_loop(game, engine):
    """
    Handles the loop where the attacker assigns remaining damage.
    Returns True if assignment completed (or game ended), False otherwise.
    """
    total_attack = sum(u.attack for u in engine.attacking_units)
    total_block = sum(u.block for u in engine.blocking_units)
    remaining = total_attack - total_block - engine.assigned_damage
    
    if remaining <= 0:
        return True # Nothing to assign
        
    attacker = game.other_player
    print(f"\n{'='*60}")
    print(f">>> {attacker.name} (ATTACKER): Assign {remaining} remaining damage <<<")
    print(f"{'='*60}")
    print(f"Use '<unit>' to kill one (e.g. 'm') or 'base' to finish.")
    print(f"Target: {game.current_player.name}'s units/base")
    
    while remaining > 0 and not game.game_over:
        print(f"\n[{remaining} damage remaining] {attacker.name}> ", end="")
        assign_cmd = input().strip().lower()
        
        if not assign_cmd:
            continue
        if assign_cmd == "state":
            game.display_full_state()
            continue
        
        tokens = assign_cmd.split(maxsplit=1)
        # Support both "assign m" and just "m"
        cmd_part = tokens[0]
        if cmd_part == "assign" and len(tokens) > 1:
            target_input = tokens[1]
        else:
            target_input = assign_cmd
            
        assignment, error = parse_damage_assignment(target_input, game, engine)
        if error:
            print(f"[ERROR] {error}")
            continue
            
        success, message = engine.resolve_combat([assignment])
        print("[OK] " + message if success else "[ERROR] " + message)
        
        if success:
            remaining = total_attack - total_block - engine.assigned_damage
            
    return True
def handle_combat_resolution(game, engine, ai_agent=None):
    """
    Finalize combat by having the attacker assign any remaining damage.
    If the attacker is AI, it happens automatically.
    """
    total_attack = sum(u.attack for u in engine.attacking_units)
    total_block = sum(u.block for u in engine.blocking_units)
    remaining = total_attack - total_block - engine.assigned_damage
    
    if remaining <= 0:
        return True
        
    attacker = game.other_player
    # Identify AI name dynamically (usually "AI Opponent")
    is_ai_attacker = ai_agent and ("AI" in attacker.name or "Random" in attacker.name or "Aggressive" in attacker.name)
    
    if is_ai_attacker:
        # AI assigns damage
        print(f"\n[AI] {attacker.name} is assigning {remaining} damage...")
        assignments = ai_agent.assign_damage(game, engine, remaining)
        success, message = engine.resolve_combat(assignments)
        if success:
             ai_agent.logger.write(f"AI assigned damage: {assignments}\n")
             print("[OK] " + message)
        else:
             print("[ERROR] AI assignment failed: " + message)
        return success
    else:
        # Human assigns damage
        return run_attacker_assignment_loop(game, engine)

def main():
    """Main game loop."""
    print("\n" + "="*60)
    # Menu for Game Mode
    print("CHOOSE GAME MODE:")
    print("  1. Human vs Human")
    print("  2. Human vs AI")
    mode = input("\nSelect (1-2): ").strip()
    
    ai_agent = None
    if mode == "2":
        print("\nCHOOSE AI STRATEGY:")
        strats = ["Aggressive", "Tactical", "Guard", "Wall", "Reactive", "Random"]
        for i, s in enumerate(strats):
             print(f"  {i+1}. {s}")
        choice = input(f"\nSelect (1-{len(strats)}): ").strip()
        try:
            strat_name = strats[int(choice)-1]
        except:
            strat_name = "Aggressive"
        
        # Open log file
        log_file = open("battle_log.txt", "w")
        log_file.write(f"--- PRISMATA BATTLE LOG ---\n")
        log_file.write(f"Player 1: Human\n")
        log_file.write(f"Player 2: AI ({strat_name})\n")
        log_file.write(f"Match Start: {time.ctime()}\n\n")
        
        ai_agent = Agent(strat_name, logger=log_file, interactive=True)
        print(f"\n[INFO] Playing against {strat_name} AI. Actions logged to 'battle_log.txt'.")
        time.sleep(1)

    # Initialize game
    p1_name = "Player 1"
    p2_name = "AI Opponent" if ai_agent else "Player 2"
    
    if ai_agent and random.random() < 0.5:
        p1_name, p2_name = p2_name, p1_name
        print(f"\n[INFO] Coin toss! {p1_name} goes first.")
    
    game = GameState(p1_name, p2_name)
    game.setup_game()
    engine = GameEngine(game)
    
    # Start first turn
    print(engine.start_phase())
    print(engine.action_phase())
    game.display_full_state()
    # Main game loop
    while not game.game_over:
        # Identify if current player is AI
        is_ai_turn = ai_agent and ("AI" in game.current_player.name or "Opponent" in game.current_player.name)
        
        # AI Turn Handling
        if is_ai_turn:
            # 1. Action Phase
            if game.phase == "Action":
                print(f"\n[AI] {game.current_player.name} is thinking...")
                time.sleep(1)
                ai_agent.logger.write(f"\n--- ACTION PHASE (AI) ---\n")
                ai_agent.execute_turn(game, engine)
                ai_agent.logger.write(f"AI finished action phase.\n")
                engine.defense_phase()
            
            # 2. Defense Phase
            if game.phase == "Defense":
                ai_agent.logger.write(f"\n--- DEFENSE PHASE (AI) ---\n")
                ai_agent.execute_turn(game, engine)
                # If AI finished defense, it moves to Resolve in execute_turn or we handle here
            
            # 3. Finalize Turn
            if game.phase in ["Defense", "ActionDone", "End"]:
                engine.end_phase()
                engine.end_turn()
                engine.start_phase()
                engine.action_phase()
                
                clear_screen()
                game.display_full_state()
                print("-" * 60)
                print(f"[AI] Turn complete. Check 'battle_log.txt' for details.")
                continue

        # Custom prompt for Defense phase showing block progress
        if game.phase == "Defense":
            total_attack = sum(u.attack for u in engine.attacking_units)
            total_block = sum(u.block for u in engine.blocking_units)
            unblocked = max(0, total_attack - total_block)
            
            # Check if we should auto-trigger damage assignment
            ready_blockers = [u for u in game.current_player.units if not u.exhausted and u.block > 0]
            if not ready_blockers and unblocked > 0:
                 # No more blockers, attacker must assign
                 attacker = game.other_player
                 if not ai_agent or attacker == game.player1:
                      print(f"\n[INFO] No blockers available. {attacker.name} must assign {unblocked} damage.")
                      handle_combat_resolution(game, engine, ai_agent)
                      
                      # finalized defense
                      msgs = ["Defense Phase Complete."]
                      msgs.append(engine.end_phase())
                      game.current_player.units_purchased = 0
                      msgs.append(engine.action_phase())
                      
                      clear_screen()
                      game.display_full_state()
                      print("-" * 60)
                      print("\n".join(msgs))
                      continue

            # Identify if defending player is AI
            is_ai_defending = ai_agent and ("AI" in game.current_player.name or "Opponent" in game.current_player.name)

            if is_ai_defending:
                 print(f"\n[AI Defending - {unblocked} damage unblocked] {game.other_player.name} (ATTACKER)> ", end="")
            else:
                 print(f"\n[Defending {total_block}/{total_attack}] {game.current_player.name}> ", end="")
        else:
            print(f"\n[{game.phase} Phase] {game.current_player.name}> ", end="")
        
        command = input().strip().lower()
        
        if not command:
            continue
            
        tokens = command.split(maxsplit=1)
        cmd = tokens[0]
        args = tokens[1] if len(tokens) > 1 else ""
        
        # Handle commands
        if cmd == "quit":
            if ai_agent: ai_agent.logger.write("Player quit the game.\n")
            print("\nThanks for playing!")
            break
            
        elif cmd == "help":
            print_help(args if args else None)
            
        elif cmd == "state":
            clear_screen()
            game.display_full_state()
            
        elif cmd == "buy":
            if game.phase == "Defense":
                print("[ERROR] Cannot buy units during Defense Phase. Use 'block' or 'end'.")
                continue
            if not args:
                show_unit_shop()
                continue
            unit_type = resolve_unit_name(args)
            success, message = engine.buy_unit(unit_type)
            if success and ai_agent: ai_agent.logger.write(f"Player bought {unit_type}\n")
            clear_screen()
            game.display_full_state()
            print("-" * 60)
            print("[OK] " + message if success else "[ERROR] " + message)
            
        elif cmd == "use":
            if game.phase == "Defense":
                print("[ERROR] Cannot use abilities during Defense Phase. Use 'block' or 'end'.")
                continue
            if not args:
                print("[ERROR] Format: use <unit> [count|all] (e.g., 'use miner', 'use miner 3', 'use miner all')")
                continue
            
            parts = args.split()
            
            # Check for targeting syntax (e.g. use overcharger 1 on miner 1)
            # Check for targeting syntax (explicit "on" or implicit second unit type)
            target = None
            is_targeting = False
            
            # 1. Parsing scan for targeting
            # Look for "on/target" keyword
            separator_idx = -1
            if "on" in parts: separator_idx = parts.index("on")
            elif "target" in parts: separator_idx = parts.index("target")
            
            # Look for second unit type (implicit targeting)
            implicit_target_idx = -1
            if separator_idx == -1:
                for i in range(1, len(parts)):
                    p_resolved = resolve_unit_name(parts[i].lower())
                    try:
                         # Ensure it's not a number (count) and is a valid unit type
                         int(parts[i])
                    except ValueError:
                         if p_resolved in UNIT_TYPES and parts[i].lower() != "all":
                             implicit_target_idx = i
                             break
            
            if separator_idx != -1 or implicit_target_idx != -1:
                 # Targeting detected!
                 try:
                     unit_type = resolve_unit_name(parts[0])
                     
                     # Determine Source Unit Number
                     # If explicit/implicit separator is at index 1 (e.g., 'use o on...' or 'use o m...'), index is 1
                     if separator_idx == 1 or implicit_target_idx == 1:
                         unit_number = 1
                     else:
                         try:
                             unit_number = int(parts[1])
                         except ValueError:
                             print(f"[ERROR] Invalid source unit number: '{parts[1]}'")
                             continue

                     # Determine Target Type and Number
                     if separator_idx != -1:
                         target_token_idx = separator_idx + 1
                         target_num_idx = separator_idx + 2
                     else:
                         target_token_idx = implicit_target_idx
                         target_num_idx = implicit_target_idx + 1
                     
                     if target_token_idx >= len(parts):
                         print("[ERROR] Missing target unit type")
                         continue
                         
                     target_type = resolve_unit_name(parts[target_token_idx])
                     
                     if target_num_idx < len(parts):
                         try:
                             target_number = int(parts[target_num_idx])
                         except ValueError:
                             print(f"[ERROR] Invalid target number: '{parts[target_num_idx]}'")
                             continue
                     else:
                         target_number = 1
                     
                     # Validate Target
                     target_units = game.current_player.get_units_by_type(target_type)
                     if not target_units:
                         # Try opponent's units? Usually abilities target own units (Overcharger). Volatile targets self.
                         # Rule check: Overcharger says "Ready another unit". Only own units make sense.
                         print(f"[ERROR] You don't have any {target_type}s to target")
                         continue
                         
                     if target_number < 1 or target_number > len(target_units):
                         print(f"[ERROR] Invalid target: {target_type} #{target_number}")
                         continue
                         
                     target = target_units[target_number - 1]
                     is_targeting = True
                     
                     # Setup for execution
                     use_all = False
                     count = 1
                     
                 except Exception as e:
                     print(f"[ERROR] Parsing error: {e}")
                     continue
            
            else:
                # Standard non-targeting logic
                unit_type = resolve_unit_name(parts[0])
                
                # Determine how many to use
                if len(parts) == 1:
                    # Default: use 1
                    count = 1
                    use_all = False
                elif parts[1].lower() == "all":
                    # Use all units of this type
                    use_all = True
                    count = 0
                else:
                    try:
                        count = int(parts[1])
                        use_all = False
                    except ValueError:
                        print(f"[ERROR] Invalid count: '{parts[1]}' (use a number or 'all')")
                        continue
            
            # Execute the ability
            # Execute the ability
            units = game.current_player.get_units_by_type(unit_type)
            if not units:
                print(f"[ERROR] You don't have any {unit_type}s")
                continue

            # Identify which units are ready (1-based indices)
            ready_indices = [i + 1 for i, u in enumerate(units) if not u.exhausted]
            
            if not ready_indices:
                print(f"[ERROR] All {unit_type}s are exhausted")
                continue

            # Determine which units to use
            indices_to_use = []
            if is_targeting:
                # If targeting, we stick to the specific unit identified
                if unit_number not in ready_indices:
                    print(f"[ERROR] {unit_type} #{unit_number} is exhausted")
                    continue
                indices_to_use = [unit_number]
            elif use_all:
                indices_to_use = ready_indices
            else:
                if count > len(ready_indices):
                    print(f"[ERROR] Not enough ready {unit_type}s (wanted {count}, have {len(ready_indices)})")
                    continue
                indices_to_use = ready_indices[:count]

            success_count = 0
            results = []
            
            for idx in indices_to_use:
                # Correct function signature: use_ability(type, number, target)
                success, message = engine.use_ability(unit_type, idx, target)
                if success and ai_agent:
                     target_str = f" on {target.name}" if target else ""
                     ai_agent.logger.write(f"Player used {unit_type} #{idx}{target_str}\n")
                
                if success:
                    success_count += 1
                    results.append(message)
                else:
                    results.append(f"Unit #{idx}: {message}")
            
            clear_screen()
            game.display_full_state()
            print("-" * 60)
            
            if success_count > 0:
                print(f"[OK] Used {success_count} {unit_type}(s)")
                # Summarize resource generation
                if unit_type == "Miner":
                     print(f"     Mined {success_count} gold (now have {game.current_player.gold} gold, {game.current_player.energy} energy)")
                elif unit_type == "Energizer":
                     print(f"     Generated {success_count} energy (now have {game.current_player.energy} energy)")
                else:
                     for msg in results:
                         print(f"     {msg}")
            else:
                print("[ERROR] Failed to use units:")
                for msg in results:
                    print(f"     {msg}")
            
        elif cmd == "attack":
            if game.phase == "Defense":
                print("[ERROR] Cannot prepare attackers during Defense Phase. Use 'block' or 'end'.")
                continue
            if not args:
                print("[ERROR] Specify attackers (e.g., 'attack striker 1, striker 2')")
                continue
            unit_list, error = parse_unit_list(args)
            if error:
                print(f"[ERROR] {error}")
                continue
            success, message = engine.prepare_attackers(unit_list)
            if success and ai_agent:
                ai_agent.logger.write(f"Player prepared attack: {args}\n")
            clear_screen()
            game.display_full_state()
            print("-" * 60)
            print("[OK] " + message if success else "[ERROR] " + message)
            
        elif cmd == "block":
            if game.phase != "Defense":
                print("[ERROR] Can only block during Defense Phase")
                continue
                
            # Handle 'block end' to finish blocking early
            if args.strip().lower() == "end":
                # Trigger attacker damage assignment
                total_attack = sum(u.attack for u in engine.attacking_units)
                total_block = sum(u.block for u in engine.blocking_units)
                remaining = total_attack - total_block - engine.assigned_damage
                
                if remaining > 0:
                    handle_combat_resolution(game, engine, ai_agent)
                
                # Transition to Action phase
                msgs = []
                msgs.append("Defense Phase Complete.")
                msgs.append(engine.end_phase())
                # DO NOT ready units here - blocking exhausts them!
                game.current_player.units_purchased = 0
                msgs.append(engine.action_phase())
                
                clear_screen()
                game.display_full_state()
                print("-" * 60)
                print("\n".join(msgs))
                continue
            
            # Handle 'block clear' to reset blockers
            if args.strip().lower() == "clear":
                # Ready all units and clear blockers
                game.current_player.ready_all_units()
                engine.blocking_units = []
                clear_screen()
                game.display_full_state()
                print("-" * 60)
                print("[OK] Cleared all blockers.")
                continue
            
            # Normal blocking
            if not args:
                print("[ERROR] Specify blockers (e.g., 'block guard 1' or 'block end' to finish)")
                continue
            unit_list, error = parse_unit_list(args)
            if error:
                print(f"[ERROR] {error}")
                continue
            success, message = engine.assign_blockers(unit_list)
            if success and ai_agent:
                ai_agent.logger.write(f"Player assigned blockers: {args}\n")
            
            if success:
                # Check if fully blocked or no more blockers
                total_attack = sum(u.attack for u in engine.attacking_units)
                total_block = sum(u.block for u in engine.blocking_units)
                ready_blockers = [u for u in game.current_player.units if not u.exhausted and u.block > 0]
                
                if total_block >= total_attack:
                    msgs = []
                    msgs.append(f"[OK] {message}")
                    msgs.append("All damage blocked! Defense complete.")
                    msgs.append(engine.end_phase())
                    game.current_player.units_purchased = 0
                    msgs.append(engine.action_phase())
                    
                    clear_screen()
                    game.display_full_state()
                    print("-" * 60)
                    print("\n".join(msgs))
                    continue
                elif not ready_blockers:
                    msgs = []
                    msgs.append(f"[OK] {message}")
                    msgs.append("[INFO] No more blockers available. Attacker must assign remaining damage.")
                    print("\n".join(msgs))
                    
                    # Run assignment loop
                    handle_combat_resolution(game, engine, ai_agent)
                    
                    # After assignment, finalize defense
                    msgs = ["Defense Phase Complete."]
                    msgs.append(engine.end_phase())
                    game.current_player.units_purchased = 0
                    msgs.append(engine.action_phase())
                    
                    clear_screen()
                    game.display_full_state()
                    print("-" * 60)
                    print("\n".join(msgs))
                    continue
            
            clear_screen()
            game.display_full_state()
            print("-" * 60)
            print("[OK] " + message if success else "[ERROR] " + message)
            
        elif cmd == "assign":
            if not args:
                print("[ERROR] Specify target (e.g., 'base' or 'guard')")
                continue
            assignment, error = parse_damage_assignment(args, game, engine)
            if error:
                print(f"[ERROR] {error}")
                continue
            success, message = engine.resolve_combat([assignment])
            if success and ai_agent:
                ai_agent.logger.write(f"Player assigned damage: {args}\n")
            clear_screen()
            
            if not game.game_over:
                game.display_full_state()
                print("-" * 60)
                
            print("[OK] " + message if success else "[ERROR] " + message)
            
            # Check if all damage is assigned - auto-transition
            if success and game.phase == "Defense":
                 total_attack = sum(u.attack for u in engine.attacking_units)
                 total_block = sum(u.block for u in engine.blocking_units)
                 max_damage = max(0, total_attack - total_block)
                 remaining = max_damage - engine.assigned_damage
                 
                 if remaining <= 0:
                     msgs = []
                     msgs.append("[INFO] All damage assigned. Defense complete.")
                     msgs.append(engine.end_phase())
                     # Now start normal Action phase for the current player (defender)
                     game.current_player.ready_all_units()
                     game.current_player.units_purchased = 0
                     msgs.append(engine.action_phase())
                     
                     clear_screen()
                     game.display_full_state()
                     print("-" * 60)
                     print("\n".join(msgs))
                     continue
            
            # Logic for resolve_combat non-auto-end case already prints above
            pass
            
        elif cmd == "end":
            if ai_agent: ai_agent.logger.write(f"Player ended {game.phase} phase.\n")
            # Progress through phases
            if game.phase == "Defense":
                # Shorthand for 'block end'
                total_attack = sum(u.attack for u in engine.attacking_units)
                total_block = sum(u.block for u in engine.blocking_units)
                remaining = total_attack - total_block - engine.assigned_damage
                
                if remaining > 0:
                    handle_combat_resolution(game, engine, ai_agent)
                
                # Turn is over after defense now!
                print(engine.end_phase())
                print(engine.end_turn())
                print(engine.start_phase())
                print(engine.action_phase())
                
                clear_screen()
                game.display_full_state()
                print("-" * 60)
                continue

            elif game.phase == "Action":
                print(engine.defense_phase())
                if game.phase != "Defense":
                     engine.end_phase()
                     engine.end_turn()
                     engine.start_phase()
                     engine.action_phase()
                
                clear_screen()
                game.display_full_state()
                print("-" * 60)
                continue

            elif game.phase == "Defense":
                # During Defense phase, use 'block end' instead
                print("[INFO] Use 'block end' to finish blocking and proceed.")
                continue
            
            else:
                # Fallback
                msgs = []
                msgs.append(engine.end_phase())
                msgs.append(engine.end_turn())
                msgs.append(engine.start_phase())
                msgs.append(engine.action_phase())
                
                clear_screen()
                game.display_full_state()
                print("-" * 60)
                print("\n".join(msgs))
                
        else:
            # Check for shorthand unit commands in Defense phase
            if game.phase == "Defense":
                resolved = resolve_unit_name(cmd)
                attacker = game.other_player
                # If it's a valid unit type and we are defending
                if resolved in UNIT_TYPES:
                    is_ai_defending = ai_agent and ("AI" in game.current_player.name or "Opponent" in game.current_player.name)
                    
                    if is_ai_defending:
                        # Human is attacking, unit name means assign damage
                        assignment, error = parse_damage_assignment(command, game, engine)
                        if error:
                            print(f"[ERROR] {error}")
                            continue
                        success, message = engine.resolve_combat([assignment])
                        if success and ai_agent:
                            ai_agent.logger.write(f"Player assigned damage: {command}\n")
                        clear_screen()
                        if not game.game_over:
                            game.display_full_state()
                        print("[OK] " + message if success else "[ERROR] " + message)
                        
                        # Auto-transition check
                        total_attack = sum(u.attack for u in engine.attacking_units)
                        total_block = sum(u.block for u in engine.blocking_units)
                        max_damage = max(0, total_attack - total_block)
                        remaining = max_damage - engine.assigned_damage
                        if success and remaining <= 0:
                             msgs = ["[INFO] All damage assigned. Defense complete."]
                             msgs.append(engine.end_phase())
                             game.current_player.ready_all_units()
                             game.current_player.units_purchased = 0
                             msgs.append(engine.action_phase())
                             clear_screen()
                             game.display_full_state()
                             print("\n".join(msgs))
                        continue
                    else:
                        # Human is defending, unit name means block with 1
                        success, message = engine.assign_blockers([(resolved, 1)])
                        if success and ai_agent:
                            ai_agent.logger.write(f"Player assigned blocker: {resolved}\n")
                        
                        if success:
                            # Auto-transition check
                            total_attack = sum(u.attack for u in engine.attacking_units)
                            total_block = sum(u.block for u in engine.blocking_units)
                            ready_blockers = [u for u in game.current_player.units if not u.exhausted and u.block > 0]
                            
                            if total_block >= total_attack:
                                msgs = [f"[OK] {message}", "All damage blocked! Defense complete."]
                                msgs.append(engine.end_phase())
                                game.current_player.units_purchased = 0
                                msgs.append(engine.action_phase())
                                clear_screen()
                                game.display_full_state()
                                print("\n".join(msgs))
                                continue
                            elif not ready_blockers:
                                print(f"[OK] {message}")
                                print("[INFO] No more blockers available. Attacker must assign remaining damage.")
                                handle_combat_resolution(game, engine, ai_agent)
                                msgs = ["Defense Phase Complete."]
                                msgs.append(engine.end_phase())
                                game.current_player.units_purchased = 0
                                msgs.append(engine.action_phase())
                                clear_screen()
                                game.display_full_state()
                                print("\n".join(msgs))
                                continue
                        
                        clear_screen()
                        game.display_full_state()
                        print("[OK] " + message if success else "[ERROR] " + message)
                        continue

            print(f"[ERROR] Unknown command: '{cmd}'. Type 'help' for available commands.")
    
    # Game over
    if game.game_over and game.winner:
        print("\n" + "="*60)
        print(f"GAME OVER - {game.winner.name} WINS!")
        print("="*60)
        print(f"\nFinal Score:")
        print(f"  {game.player1.name}: {game.player1.base_health} HP, {len(game.player1.units)} units")
        print(f"  {game.player2.name}: {game.player2.base_health} HP, {len(game.player2.units)} units")
    
    if ai_agent and ai_agent.logger:
        ai_agent.logger.close()

if __name__ == "__main__":
    main()
