"""
Game state management for Prismata Lite.
Tracks players, resources, units, and base health.
"""

from .units import create_unit, Miner, Energizer

class Player:
    """Represents a player in the game."""
    
    def __init__(self, name):
        self.name = name
        self.gold = 2
        self.energy = 1
        self.base_health = 10
        self.units = []
        self.units_purchased = 0  # Track number of units bought this turn
        self.displayed_attack = 0
        self.displayed_block = 0
        
    def add_starting_units(self):
        """Add starting units: 1 Miner and 1 Energizer (all ready)."""
        miner = Miner()
        miner.exhausted = False
        self.units.append(miner)
            
        energizer = Energizer()
        energizer.exhausted = False
        self.units.append(energizer)
        
    def can_afford(self, unit, penalty_energy=0):
        """Check if player can afford a unit with potential energy penalty."""
        return self.gold >= unit.gold_cost and self.energy >= (unit.energy_cost + penalty_energy)
        
    def buy_unit(self, unit_type):
        """
        Attempt to buy a unit.
        The second unit purchase costs 1 additional energy.
        Returns (success, message, unit)
        """
        if self.units_purchased >= 2:
            return False, "You can only buy two units per turn", None
            
        # Enforce unit cap of 5
        existing_count = len(self.get_units_by_type(unit_type))
        if existing_count >= 5:
            return False, f"Unit cap reached: You cannot have more than 5 {unit_type}s", None

        unit = create_unit(unit_type)
        if not unit:
            return False, f"Unknown unit type: {unit_type}", None
            
        penalty = 1 if self.units_purchased == 1 else 0
        
        if not self.can_afford(unit, penalty):
            msg = f"Cannot afford {unit.name}"
            if penalty > 0:
                msg += f" (includes 1 energy penalty for 2nd unit)"
            msg += f" (costs {unit.gold_cost}G {unit.energy_cost + penalty}E, you have {self.gold}G {self.energy}E)"
            return False, msg, None
            
        self.gold -= unit.gold_cost
        self.energy -= (unit.energy_cost + penalty)
        self.units.append(unit)
        self.units_purchased += 1
        return True, f"Bought {unit.name} for {unit.gold_cost}G {unit.energy_cost + penalty}E", unit
        
    def get_units_by_type(self, unit_type):
        """Get all units of a specific type."""
        return [u for u in self.units if u.name.lower() == unit_type.lower()]
        
    def ready_all_units(self):
        """Ready all units at start of turn."""
        for unit in self.units:
            unit.ready()
            
    def remove_dead_units(self):
        """Remove units that have taken lethal damage."""
        dead_units = [u for u in self.units if not u.is_alive()]
        self.units = [u for u in self.units if u.is_alive()]
        return dead_units
        
    def reset_unit_damage(self):
        """Reset damage on all units (damage doesn't carry over)."""
        for unit in self.units:
            unit.reset_damage()
            
    def take_base_damage(self, amount):
        """Apply damage to the base."""
        self.base_health -= amount
        return self.base_health <= 0  # Returns True if base is destroyed
        
    def is_defeated(self):
        """Check if player has lost."""
        return self.base_health <= 0
        
    def get_ready_units(self):
        """Get all ready (non-exhausted) units."""
        return [u for u in self.units if not u.exhausted]
        
    def get_exhausted_units(self):
        """Get all exhausted units."""
        return [u for u in self.units if u.exhausted]
        
    def display_state(self, compact=False):
        """Display player's current state."""
        if not compact:
            print(f"\n{'='*50}")
            print(f"{self.name}'s State")
            print(f"{'='*50}")
        else:
            print(f"\n{self.name}: ", end="")
            
        # Stats string with Attack/Block if non-zero
        stats = f"Base: {self.base_health}/10 HP | Gold: {self.gold} | Energy: {self.energy}"
        if self.displayed_attack > 0:
            stats += f" | Atk: {self.displayed_attack}"
        if self.displayed_block > 0:
            stats += f" | Blk: {self.displayed_block}"
        print(stats)
        
        if not self.units:
            print("  Units: (none)")
        else:
            # Group units by type for cleaner display
            unit_groups = {}
            for unit in self.units:
                key = unit.name
                if key not in unit_groups:
                    unit_groups[key] = []
                unit_groups[key].append(unit)
            
            # Compact display
            unit_summary = []
            for unit_type, units in unit_groups.items():
                ready_count = sum(1 for u in units if not u.exhausted)
                total = len(units)
                # Format: [Ready/Total]UnitName
                if total > 0:
                    unit_summary.append(f"[{ready_count}/{total}]{unit_type}s")
            
            print(f"  Units: {', '.join(unit_summary)}")


class GameState:
    """Manages the overall game state."""
    
    def __init__(self, player1_name="Player 1", player2_name="Player 2"):
        self.player1 = Player(player1_name)
        self.player2 = Player(player2_name)
        self.current_player = self.player1
        self.other_player = self.player2
        self.turn_number = 1
        self.phase = "Start"  # Start, Defense, Action, End
        self.game_over = False
        self.winner = None
        self.pending_attackers = []  # Units attacking from the previous turn
        
    def setup_game(self):
        """Initialize the game with starting units."""
        self.player1.add_starting_units()
        self.player2.add_starting_units()
        # Player 2 Advantage: +1 Gold
        self.player2.gold += 1
        
    def switch_player(self):
        """Switch to the other player."""
        self.current_player, self.other_player = self.other_player, self.current_player
        
    def end_game(self, winner):
        """End the game with a winner."""
        self.game_over = True
        self.winner = winner
        
    def display_full_state(self):
        """Display the complete game state."""
        print(f"\n{'='*60}")
        print(f"TURN {self.turn_number} - {self.phase} Phase | {self.current_player.name}'s Turn")
        print(f"{'='*60}")
        
        self.current_player.display_state(compact=True)
        self.other_player.display_state(compact=True)
        print("="*60)
