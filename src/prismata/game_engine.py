"""
Game engine for Prismata Lite.
Handles turn phases, combat resolution, and game flow.
"""

from .game_state import GameState

class GameEngine:
    """Manages turn phases and game logic."""
    
    def __init__(self, game_state):
        self.game = game_state
        self.attacking_units = []  # Units prepared to attack
        self.blocking_units = []   # Units assigned to block
        self.assigned_damage = 0   # Track damage assigned this turn

        
    def start_phase(self):
        """Execute the Start Phase."""
        # Start Phase always readies units and resets resources
        player = self.game.current_player
        player.ready_all_units()
        player.units_purchased = 0
        player.displayed_attack = 0
        player.displayed_block = 0
        player.reset_unit_damage()
        self.game.other_player.reset_unit_damage()

        if self.game.pending_attackers:
            self.game.phase = "Defense"
            self.attacking_units = self.game.pending_attackers
            self.game.pending_attackers = []
            self.blocking_units = [] # Clear blocking units for the new attack
            self.assigned_damage = 0 # Reset assigned damage for the new attack
            
            total_damage = sum(u.attack for u in self.attacking_units)
            
            # Check if defender has any ready units with block value
            ready_blockers = [u for u in player.units if not u.exhausted and u.block > 0]
            
            if ready_blockers:
                return f"Defense Phase: INCOMING ATTACK! {total_damage} damage incoming.\nYou may assign blockers."
            else:
                # No blockers available - flag for auto-forward
                return f"Defense Phase: INCOMING ATTACK! {total_damage} damage incoming.\n[NO BLOCKERS AVAILABLE]"
            
        # 2. Normal Start Phase
        self.game.phase = "Start"
        return "Start Phase: Readied all units."
        
    def action_phase(self):
        """Enter the Action Phase."""
        if self.game.phase == "Defense":
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
            return unit.mine(player)
        elif unit.name == "Energizer":
            return unit.generate(player)
        elif unit.name == "Overcharger":
            if target is None:
                return False, "Overcharge requires a target unit"
            return unit.overcharge(player, target)
        elif unit.name == "Volatile":
            success, message = unit.detonate(player)
            if success:
                # Automatically add to attackers since detonating is an offensive action
                if unit not in self.attacking_units:
                    self.attacking_units.append(unit)
            return success, message
        elif unit.name == "Wall":
            return unit.repair(player)
        else:
            return False, f"{unit.name} has no usable ability"
            
    def prepare_attackers(self, unit_list):
        """
        Prepare units to attack.
        unit_list is a list of (unit_type, count) tuples.
        """
        if self.game.phase != "Action":
            return False, "Can only prepare attackers during Action Phase"
            
        self.attacking_units = []
        player = self.game.current_player
        
        for unit_type, count in unit_list:
            units = player.get_units_by_type(unit_type)
            ready_units = [u for u in units if not u.exhausted]
            
            if len(ready_units) < count:
                return False, f"Not enough ready {unit_type}s (wanted {count}, have {len(ready_units)})"
                
            # Check energy cost
            energy_needed = 0
            for i in range(count):
                u = ready_units[i]
                energy_needed += u.attack_cost
            
            if player.energy < energy_needed:
                 return False, f"Not enough energy to attack with {unit_type}s (Need {energy_needed}, Have {player.energy})"

            player.energy -= energy_needed
            
            # Exhaust the first 'count' ready units
            for i in range(count):
                u = ready_units[i]
                u.exhaust()
                self.attacking_units.append(u)
            
        total_attack = sum(u.attack for u in self.attacking_units)
        player.displayed_attack = total_attack
        return True, f"Prepared {len(self.attacking_units)} units to attack (total {total_attack} damage, cost {energy_needed if 'energy_needed' in locals() else 0} energy)"
        
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
        if self.game.phase != "Defense":
            return False, "Can only assign blockers during Defense Phase"
            
        defender = self.game.current_player
        added_count = 0
        
        for unit_type, count in unit_list:
            units = defender.get_units_by_type(unit_type)
            # Defenders must be ready
            ready_units = [u for u in units if not u.exhausted]
            
            if len(ready_units) < count:
                return False, f"Not enough ready {unit_type}s to block (wanted {count}, have {len(ready_units)})"
                
            for i in range(count):
                u = ready_units[i]
                u.exhaust() # Exhaust the unit for blocking
                self.blocking_units.append(u)
                added_count += count # Note: this is actually 'count' per iteration? No, +1 per unit
        
        total_block = sum(u.block for u in self.blocking_units)
        defender.displayed_block = total_block
        return True, f"Assigned blockers. Total block: {total_block}"
        
    def resolve_combat(self, damage_assignments):
        """
        Resolve combat with damage assignments.
        damage_assignments is a list of (target_type, damage) tuples.
        target_type can be "base" or a unit type.
        For units, damage destroys as many as HP permits.
        In Defense phase, current_player is defender, other_player is attacker.
        """
        if self.game.phase != "Defense":
            return False, "Can only resolve combat during Defense Phase"
            
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
        results = []
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
        # They need to be passed to the next player's Defense Phase
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
        
        # Clear attacking units ONLY if we just finished defending (combat resolved)
        # If we just finished Action, we keep them for the queue
        if not is_action_ending:
             self.attacking_units = []
        
        # Reset display stats
        self.game.current_player.displayed_attack = 0
        self.game.current_player.displayed_block = 0
        self.game.other_player.displayed_attack = 0
        self.game.other_player.displayed_block = 0
        
        results = []
        if dead_units_p1:
            results.append(f"{self.game.current_player.name} lost: {', '.join(u.name for u in dead_units_p1)}")
        if dead_units_p2:
            results.append(f"{self.game.other_player.name} lost: {', '.join(u.name for u in dead_units_p2)}")
            
        return "End Phase: " + ("; ".join(results) if results else "No units destroyed")
        
    def end_turn(self):
        """End the current turn and switch players."""
        # Queue prepared attackers for the opponent
        if self.attacking_units:
             self.game.pending_attackers = self.attacking_units
             self.attacking_units = []
             
        self.game.switch_player()
        self.game.turn_number += 1
        return f"\n--- Turn {self.game.turn_number} begins: {self.game.current_player.name}'s turn ---"
