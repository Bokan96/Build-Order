"""
Game engine for Prismata Lite.
Handles turn phases, combat resolution, and game flow.
"""

import typing
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .game_state import GameState
else:
    try:
        from .game_state import GameState
    except ImportError:
        from prismata.game_state import GameState

class GameEngine:
    """Manages turn phases and game logic."""
    
    def __init__(self, game_state):
        self.game = game_state
        self.attacking_units = []  # Units currently attacking the player (for Defense)
        self.prepared_squad = []   # Units prepared this turn to attack NEXT turn
        self.blocking_units = []   # Units assigned to block
        self.assigned_damage = 0   # Track damage assigned this turn

        
    def start_phase(self):
        """Execute the Start Phase."""
        # Start Phase resets resources. Units were redied at the end of the previous turn.
        player = self.game.current_player
        player.units_purchased = 0
        player.displayed_attack = 0
        player.displayed_block = 0
        player.reset_unit_damage()
        # Do NOT reset other_player.displayed_attack here, as it might be needed for Defense phase
        self.game.other_player.reset_unit_damage()

        msg = "Start Phase: Resources reset."
        if self.game.pending_attackers:
            total_damage = sum(u.attack for u in self.game.pending_attackers)
            msg += f"\n[NOTICE] Incoming attack discovered: {total_damage} damage."
            
        self.game.phase = "Start"
        return msg

    def block_phase(self):
        """Enter the Block Phase after actions are complete."""
        player = self.game.current_player
        
        if self.game.pending_attackers:
            self.game.phase = "Block"
            self.attacking_units = self.game.pending_attackers
            self.game.pending_attackers = []
            self.blocking_units = [] 
            self.assigned_damage = 0 
            
            total_damage = sum(u.attack for u in self.attacking_units)
            # Ensure the attacker's damage is displayed during our block phase
            self.game.other_player.displayed_attack = total_damage
            
            ready_blockers = [u for u in player.units if not u.exhausted and u.block > 0]
            
            if ready_blockers:
                return f"Block Phase: INCOMING ATTACK! {total_damage} damage incoming.\nYou may assign blockers."
            else:
                return f"Block Phase: INCOMING ATTACK! {total_damage} damage incoming.\n[NO READY BLOCKERS AVAILABLE]"
        
        # No attack to defend against
        self.game.phase = "ActionDone" 
        player.ready_all_units() # Ready immediately if no defense needed
        return "No incoming attack. Proceeding to Action."

    def finish_blocking(self):
        """End blocking and check if breach phase is needed."""
        if self.game.phase != "Block":
            return False, "Not in Block Phase"
            
        total_atk = sum(u.attack for u in self.attacking_units)
        total_blk = sum(u.block for u in self.blocking_units)
        
        if total_atk > total_blk:
            self.game.phase = "Breach"
            return True, "Breach! Assign damage to enemy units or base."
        else:
            self.end_phase()
            self.action_phase()
            return True, "Blocking resolved. Moving to Action."
        
    def action_phase(self):
        """Enter the Action Phase."""
        if self.game.phase == "Block":
             # We just finished defending? No, defense happens before Action.
             pass
        self.game.phase = "Action"
        return "Action Phase: You may buy units, use abilities, and prepare attackers."

    # ... (Buy/Use logic remains same) ...
        
    def buy_unit(self, unit_type):
        """Buy a unit during Action Phase."""
        if self.game.phase != "Action":
            return False, "Can only buy units during Action Phase"
            
        success, message, unit = self.game.current_player.buy_unit(unit_type)
        return success, message
        
    def use_ability(self, unit_type, unit_number, target=None):
        """
        Use a unit's ability during Action Phase.
        unit_number is 1-indexed (e.g., "use miner 1" means the first miner)
        """
        if self.game.phase != "Action":
            return False, "Can only use abilities during Action Phase"
            
        player = self.game.current_player
        units = player.get_units_by_type(unit_type)
        
        if not units:
            return False, f"You don't have any {unit_type}s"
            
        if unit_number < 1 or unit_number > len(units):
            return False, f"Invalid {unit_type} number (you have {len(units)})"
            
        unit = units[unit_number - 1]
        
        # Handle different abilities
        if unit.name == "Miner":
            success, msg = unit.mine(player)
            if success:
                unit.used_this_turn = True
                unit.action_log = {"type": "mine", "energy": -1, "gold": 1}
            return success, msg
        elif unit.name == "Energizer":
            success, msg = unit.generate(player)
            if success:
                unit.used_this_turn = True
                unit.action_log = {"type": "generate", "energy": 1}
            return success, msg
        elif unit.name == "Repeater":
            if target is None:
                return False, "Overcharge requires a target unit"
            if not target.is_alive():
                return False, f"Cannot overcharge {target.name} because it is about to be destroyed"
            success, msg = unit.overcharge(player, target)
            if success:
                unit.used_this_turn = True
                unit.action_log = {"type": "overcharge", "energy": -1, "target": target}
            return success, msg
        elif unit.name == "Wall":
            success, msg = unit.repair(player)
            if success:
                unit.used_this_turn = True
                unit.action_log = {"type": "repair", "energy": 1}
            return success, msg
        else:
            return False, f"{unit.name} has no usable ability"

    def undo_action(self, unit_type, unit_number):
        """Revert a unit's action and untap it."""
        if self.game.phase != "Action":
            return False, "Can only undo actions during Action Phase"
            
        player = self.game.current_player
        units = player.get_units_by_type(unit_type)
        
        if not units or unit_number < 1 or unit_number > len(units):
            return False, "Invalid unit"
            
        unit = units[unit_number - 1]
        
        if not unit.used_this_turn or not unit.action_log:
            return False, "This unit was not used this turn or cannot be undone"
            
        log = unit.action_log
        log_type = log.get("type")
        
        # Resource Check: Only check if undoING the action has a positive cost
        # (e.g. if the action gave 1 Gold, undoing it costs 1 Gold)
        gold_cost = log.get("gold", 0)
        energy_cost = log.get("energy", 0)
        
        if gold_cost > 0 and player.gold < gold_cost:
            return False, f"Not enough Gold to undo this action (needs {gold_cost})"
        if energy_cost > 0 and player.energy < energy_cost:
            return False, f"Not enough Energy to undo this action (needs {energy_cost})"

        if log_type == "mine":
            player.energy += abs(energy_cost) # Miner log: energy is -1, gold is 1
            player.gold -= gold_cost
        elif log_type == "generate":
            player.energy -= energy_cost # Energizer log: energy is 1
        elif log_type == "repair":
            player.energy += abs(energy_cost) # Wall log: energy is -1
            unit.exhausted = True # Re-exhaust after repair undo
        elif log_type == "overcharge":
            player.energy += abs(energy_cost) # Repeater log: energy is -1
            target = log["target"]
            target.exhausted = True # Re-exhaust the target
        elif log_type == "prepare_attack":
            player.energy += abs(energy_cost) # Strikers: 0, Wall: -1
            if unit in self.prepared_squad:
                self.prepared_squad.remove(unit)
            player.displayed_attack = sum(u.attack for u in self.prepared_squad)
        else:
            return False, f"Unknown action type: {log_type}"
            
        unit.exhausted = False
        unit.used_this_turn = False
        unit.action_log = None
        
        if unit.name == "Volatile":
            # Volatile is tricky because it takes 99 damage and is removed from list?
            # No, if it was 'used', it's still alive in this turn until end_phase removes it.
            # Wait, prepare_attackers for Volatile does: u.take_damage(99); player.remove_dead_units()
            # If so, it's GONE and cannot be undone. User said 'cannot untap just bought units'.
            # If it's dead, it's not even in the UI. 
            pass

        return True, f"Undid {unit.name} action"
            
    def prepare_attackers(self, unit_list):
        """
        Prepare units to attack.
        unit_list is a list of (unit_type, count) tuples.
        """
        if self.game.phase != "Action":
            return False, "Can only prepare attackers during Action Phase"
            
        player = self.game.current_player
        total_energy_needed: int = 0
        units_added_this_batch: int = 0
        
        for unit_type, count in unit_list:
            units = player.get_units_by_type(unit_type)
            ready_units = [u for u in units if not u.exhausted]
            
            if count == "all":
                # How many can we afford/have ready?
                if not ready_units:
                    count = 0
                elif ready_units[0].attack_cost == 0:
                    count = len(ready_units)
                else:
                    max_affordable = player.energy // ready_units[0].attack_cost
                    count = min(len(ready_units), max_affordable)
            else:
                try:
                    count = int(count)
                except (ValueError, TypeError):
                    count = 0
            
            if count <= 0:
                continue

            if len(ready_units) < count:
                return False, f"Not enough ready {unit_type}s (wanted {count}, have {len(ready_units)})"
                
            # Check energy cost
            energy_needed: int = 0
            for i in range(count):
                u = ready_units[i]
                energy_needed += u.attack_cost
            
            if player.energy < energy_needed:
                 return False, f"Not enough energy to attack with {unit_type}s (Need {energy_needed}, Have {player.energy})"

            player.energy = player.energy - energy_needed
            total_energy_needed += energy_needed
            
            # Exhaust units
            for i in range(count):
                u = ready_units[i]
                u.exhaust()
                if u.name == "Volatile":
                    u.take_damage(99) # Destroy at end of turn
                    player.remove_dead_units()
                self.prepared_squad.append(u)
                units_added_this_batch += 1
            
        total_attack = sum(u.attack for u in self.prepared_squad)
        player.displayed_attack = total_attack
        return True, f"Prepared {units_added_this_batch} units to attack (Total attackers: {len(self.prepared_squad)}, Total damage: {total_attack})"
        
    def attack_phase(self):
        """Enter the Attack Phase."""
        self.game.phase = "Attack"
        
        if not self.attacking_units:
            return "Attack Phase: No attackers prepared. Skipping to End Phase."
            
        total_attack = sum(u.attack for u in self.attacking_units)
        return f"Attack Phase: Attacking with {total_attack} total damage. Defender may assign blockers."
        
    def assign_blockers(self, unit_list):
        """
        Assign units to block.
        unit_list is a list of (unit_type, count) tuples.
        """
        if self.game.phase != "Block":
            return False, "Can only assign blockers during Block Phase"
            
        defender = self.game.current_player
        added_count: int = 0
        
        for unit_type, count in unit_list:
            units = defender.get_units_by_type(unit_type)
            # Defenders must be ready and not ALREADY blocking
            available_units = [u for u in units if not u.exhausted and u not in self.blocking_units]
            
            if count == "all":
                count = len(available_units)
            else:
                try:
                    count = int(count)
                except (ValueError, TypeError):
                    count = 0
                
            if count <= 0:
                continue

            if len(available_units) < count:
                return False, f"Not enough available {unit_type}s to block (wanted {count}, have {len(available_units)})"
                
            for i in range(count):
                u = available_units[i]
                if u.name == "Wall":
                    u.exhaust() # Walls exhaust when blocking in this Lite version
                if u.fragile:
                    u.take_damage(99) # Fragile units die after blocking
                self.blocking_units.append(u)
                added_count += 1
        
        total_block = sum(u.block for u in self.blocking_units)
        defender.displayed_block = total_block
        return True, f"Assigned blockers. Total block: {total_block}"
        
    def resolve_combat(self, damage_assignments):
        """
        Resolve combat with damage assignments.
        """
        if self.game.phase not in ["Block", "Breach"]:
            return False, "Can only resolve combat during Block or Breach Phase"
            
        # Calculate total damage
        total_attack = sum(u.attack for u in self.attacking_units)
        total_block = sum(u.block for u in self.blocking_units)
        remaining_damage = max(0, total_attack - total_block)
        
        # Verify damage assignments don't exceed available damage
        assigned_damage = sum(dmg for _, dmg in damage_assignments)
        
        # Calculate previously assigned damage needs to be accounted for
        available_now = remaining_damage - self.assigned_damage
        
        if assigned_damage > available_now:
            return False, f"Cannot assign {assigned_damage} damage (only {available_now} available)"
            
        defender = self.game.current_player  # In Defense phase, current player IS defender
        results: list[str] = []
        actual_damage_used = 0
        
        # Apply damage
        for target_type, damage in damage_assignments:
            if target_type.lower() == "base":
                defender.take_base_damage(damage)
                actual_damage_used += damage
                results.append(f"Dealt {damage} damage to {defender.name}'s base (now at {defender.base_health} HP)")
                
                if defender.is_defeated():
                    self.game.end_game(self.game.other_player)  # Attacker wins
                    results.append(f"\n*** {self.game.other_player.name} WINS! ***")
            else:
                units = defender.get_units_by_type(target_type)
                if not units:
                    return False, f"No {target_type}s to target"
                
                # Sort by HP ascending to destroy as many as possible
                # Treat units with max_health=0 as currently 'alive' for targeting
                alive_units = [u for u in units if u.is_alive()]
                alive_units.sort(key=lambda u: u.current_health)
                
                damage_left = damage
                destroyed = []
                
                for unit in alive_units:
                    hp_needed = unit.current_health
                    # 0-HP units are destroyed 'for free' (don't consume damage pool)
                    if damage_left >= hp_needed:
                        # Only subtract if HP > 0
                        if hp_needed > 0:
                            damage_left -= hp_needed
                            actual_damage_used += hp_needed
                        
                        unit.take_damage(max(1, hp_needed)) # Ensure it takes at least 1 damage to 'die'
                        destroyed.append(unit.name)
                    else:
                        break  # Not enough damage to destroy this unit
                
                if not destroyed:
                    # Nothing destroyed - check if damage was insufficient
                    min_hp = min(u.current_health for u in alive_units) if alive_units else 0
                    return False, f"Need at least {min_hp} damage to destroy a {target_type}"
                
                results.append(f"Destroyed {len(destroyed)} {target_type}(s)")
                
                # Leftover damage from overkill goes to waste (Prismata rules)
                if damage_left > 0:
                    results.append(f"({damage_left} overkill damage wasted)")
                    actual_damage_used += damage_left  # Still counts as used
        
        self.assigned_damage += actual_damage_used
        return True, "\n".join(results)
        
    def end_phase(self):
        """Execute the End Phase."""
        # If we are finishing the Action Phase, do NOT clear prepared attackers
        # They need to be passed to the next player's Block Phase
        is_action_ending = (self.game.phase == "Action")
        
        self.game.phase = "End"
        
        # Remove dead units
        dead_units_p1 = self.game.current_player.remove_dead_units()
        dead_units_p2 = self.game.other_player.remove_dead_units()
        
        # Reset energy
        self.game.current_player.energy = 0
        
        # FRAGILE: Destroy units that blocked and were fragile
        for unit in self.blocking_units:
            if unit.fragile:
                unit.current_health = 0 # Mark for removal
        
        # Clear blocking units (always) and assigned damage
        self.blocking_units = []
        self.assigned_damage = 0
        
        # Clear attacking units ONLY if we just finished blocking (combat resolved)
        # If we just finished Action, we keep them for the queue
        if not is_action_ending:
             self.attacking_units = []
             # USER REQUEST: Ready units after block phase
             self.game.current_player.ready_all_units()
        
        # Reset display stats
        self.game.current_player.displayed_attack = 0
        self.game.current_player.displayed_block = 0
        if not is_action_ending:
            self.game.other_player.displayed_attack = 0
        self.game.other_player.displayed_block = 0
        
        results: list[str] = []
        if dead_units_p1:
            results.append(f"{self.game.current_player.name} lost: {', '.join(u.name for u in dead_units_p1)}")
        if dead_units_p2:
            results.append(f"{self.game.other_player.name} lost: {', '.join(u.name for u in dead_units_p2)}")
            
        return "End Phase: " + ("; ".join(results) if results else "No units destroyed")
        
    def end_turn(self):
        """End the current turn and switch players."""
        # Queue prepared squad for the opponent
        if self.prepared_squad:
             self.game.pending_attackers = self.prepared_squad
             self.prepared_squad = []
        else:
             # Ensure pending_attackers is empty if nothing new was prepared?
             # Actually, if we didn't prepare anything, there are no attackers for next turn.
             self.game.pending_attackers = []
             
        self.game.switch_player()
        self.game.turn_number += 1
        return f"\n--- Turn {self.game.turn_number} begins: {self.game.current_player.name}'s turn ---"
