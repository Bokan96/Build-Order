"""
Game state management for Prismata Lite.
Tracks players, resources, units, and base health.
"""

from units import create_unit, Miner, Energizer

class Player:
    """Represents a player in the game."""
    
    def __init__(self, name):
        self.name = name
        self.gold = 0
        self.energy = 0
        self.base_health = 10
        self.units = []
        self.purchased_unit = False  # Track if player bought a unit this turn
        self.displayed_attack = 0
        self.displayed_block = 0
        
    def add_starting_units(self):
        """Add starting units: 1 Miner and 1 Energizer (both ready)."""
        miner = Miner()
        energizer = Energizer()
        # Starting units begin ready (not exhausted)
        miner.exhausted = False
        energizer.exhausted = False
        self.units.append(miner)
        self.units.append(energizer)
        
    def can_afford(self, unit):
        """Check if player can afford a unit."""
        return self.gold >= unit.gold_cost and self.energy >= unit.energy_cost
        
    def buy_unit(self, unit_type):
        """
        Attempt to buy a unit.
        Returns (success, message, unit)
        """
        if self.purchased_unit:
            return False, "You can only buy one unit per turn", None
            
        unit = create_unit(unit_type)
        if not unit:
            return False, f"Unknown unit type: {unit_type}", None
            
        if not self.can_afford(unit):
            return False, f"Cannot afford {unit.name} (costs {unit.gold_cost}G {unit.energy_cost}E, you have {self.gold}G {self.energy}E)", None
            
        self.gold -= unit.gold_cost
        self.energy -= unit.energy_cost
        self.units.append(unit)
        self.purchased_unit = True
        return True, f"Bought {unit.name} for {unit.gold_cost}G {unit.energy_cost}E", unit
        
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
