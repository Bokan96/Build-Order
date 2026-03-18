"""
Unit definitions for Prismata Lite.
Each unit has stats (attack, block, health) and may have special abilities.
"""

class Unit:
    """Base class for all units in the game."""
    
    def __init__(self, name, gold_cost, energy_cost, attack, block, health):
        self.name = name
        self.gold_cost = gold_cost
        self.energy_cost = energy_cost
        self.attack = attack
        self.block = block
        self.max_health = health
        self.current_health = health
        self.exhausted = True  # New units enter play exhausted
        self.damage_taken = 0  # Track damage for this turn
        self.fragile = False   # If True, unit is destroyed after blocking
        self.attack_cost = 0   # Energy cost to declare an attack
        self.used_this_turn = False # Track if unit was used by PLAYER this turn
        self.action_log = None # Store action details for undo
        
    def reset_turn_state(self):
        """Reset turn-based flags."""
        self.used_this_turn = False
        self.action_log = None
        
    def ready(self):
        """Ready this unit (un-exhaust it)."""
        self.exhausted = False
        
    def exhaust(self):
        """Exhaust this unit."""
        self.exhausted = True
        
    def take_damage(self, amount):
        """Apply damage to this unit."""
        self.damage_taken += amount
        
    def is_alive(self):
        """Check if unit is still alive. 0-HP units die if they take any damage."""
        if self.max_health == 0:
            return self.damage_taken == 0
        return self.damage_taken < self.current_health
    
    def reset_damage(self):
        """Reset damage at end of turn (damage doesn't carry over)."""
        self.damage_taken = 0
        
    def __str__(self):
        status = "E" if self.exhausted else "R"  # E=Exhausted, R=Ready
        return f"{self.name} [{status}] {self.attack}ATK/{self.block}BLK/{self.current_health}HP"


class Miner(Unit):
    """
    Cost: 2 Gold
    Stats: 0 ATK / 1 BLK / 1 HP
    Ability: Mine (Exhaust, 1 Energy) -> Gain 1 Gold
    """
    
    def __init__(self):
        super().__init__("Miner", gold_cost=2, energy_cost=0, attack=0, block=1, health=1)
        
    def mine(self, player):
        """
        Use Mine ability: Spend 1 Energy to gain 1 Gold.
        Returns True if successful, False if not enough energy or already exhausted.
        """
        if self.exhausted:
            return False, "This Miner is already exhausted"
        if player.energy < 1:
            return False, "Not enough energy (need 1)"
            
        player.energy -= 1
        player.gold += 1
        self.exhaust()
        return True, f"Mined 1 gold (now have {player.gold} gold, {player.energy} energy)"


class Energizer(Unit):
    """
    Cost: 2 Gold
    Stats: 0 ATK / 0 BLK / 3 HP
    Ability: Generate (Exhaust) -> Gain 1 Energy
    """
    
    def __init__(self):
        super().__init__("Energizer", gold_cost=2, energy_cost=0, attack=0, block=0, health=2)
        
    def generate(self, player):
        """
        Use Generate ability: Gain 1 Energy.
        Returns True if successful, False if already exhausted.
        """
        if self.exhausted:
            return False, "This Energizer is already exhausted"
            
        player.energy += 1
        self.exhaust()
        return True, f"Generated 1 energy (now have {player.energy} energy)"


class Striker(Unit):
    """
    Cost: 3 Gold
    Stats: 2 ATK / 0 BLK / 1 HP
    """
    
    def __init__(self):
        super().__init__("Striker", gold_cost=3, energy_cost=0, attack=2, block=0, health=1)
        self.attack_cost = 1 # Requires 1 Energy to attack


class Guard(Unit):
    """
    Cost: 3 Gold
    Stats: 1 ATK / 2 BLK / 2 HP
    """
    
    def __init__(self):
        super().__init__("Guard", gold_cost=3, energy_cost=0, attack=1, block=2, health=2)


class Wall(Unit):
    """
    Cost: 3 Gold
    Stats: 0 ATK / 2 BLK / 2 HP
    Special: Enters play READY.
    """
    
    def __init__(self):
        super().__init__("Wall", gold_cost=3, energy_cost=0, attack=0, block=2, health=2)
        self.exhausted = False # Walls enter play Ready
        
    def repair(self, player):
        """
        Use Repair ability: Spend 1 Energy to ready this unit.
        Returns True if successful, False otherwise.
        """
        if not self.exhausted:
            return False, "This Wall is already ready"
        if player.energy < 1:
            return False, "Not enough energy (need 1 to repair)"
            
        player.energy -= 1
        self.ready()
        return True, "Wall repaired (ready for blocking)"


class Overcharger(Unit):
    """
    Cost: 3 Gold
    Stats: 0 ATK / 1 BLK / 2 HP
    Ability: Overcharge (Exhaust, 1 Energy) -> Ready another unit
    """
    
    def __init__(self):
        super().__init__("Repeater", gold_cost=3, energy_cost=0, attack=0, block=1, health=2)
        
    def overcharge(self, player, target_unit):
        """
        Use Overcharge ability: Spend 1 Energy to ready another unit.
        Returns True if successful, False otherwise.
        """
        if self.exhausted:
            return False, "This Repeater is already exhausted"
        if player.energy < 1:
            return False, "Not enough energy (need 1)"
        if target_unit == self:
            return False, "Cannot overcharge itself"
        if not target_unit.exhausted:
            return False, f"{target_unit.name} is already ready"
            
        player.energy -= 1
        target_unit.ready()
        self.exhaust()
        return True, f"Overcharged {target_unit.name}"


class Volatile(Unit):
    """
    Cost: 4 Gold
    Stats: 5 ATK / 0 BLK / 2 HP
    """
    
    def __init__(self):
        super().__init__("Volatile", gold_cost=4, energy_cost=0, attack=5, block=0, health=2)
        self.attack_cost = 1 # Requires 1 Energy to attack


class Barrier(Unit):
    """
    Cost: 1 Gold
    Stats: 0 ATK / 1 BLK / 1 HP
    """
    
    def __init__(self):
        super().__init__("Barrier", gold_cost=1, energy_cost=0, attack=0, block=2, health=1)
        self.fragile = True


# Unit factory for easy creation
UNIT_TYPES = {
    "miner": Miner,
    "energizer": Energizer,
    "striker": Striker,
    "guard": Guard,
    "wall": Wall,
    "repeater": Overcharger,
    "volatile": Volatile,
    "barrier": Barrier,
}

def create_unit(unit_type):
    """Create a unit by name. Returns None if unit type doesn't exist."""
    unit_class = UNIT_TYPES.get(unit_type.lower())
    if unit_class:
        return unit_class()
    return None
