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
        super().__init__("Energizer", gold_cost=2, energy_cost=0, attack=0, block=0, health=3)
        
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
    Stats: 0 ATK / 2 BLK / 0 HP
    Special: Enters play READY.
    """
    
    def __init__(self):
        super().__init__("Wall", gold_cost=3, energy_cost=0, attack=0, block=2, health=0)
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
    Cost: 3 Gold + 1 Energy
    Stats: 1 ATK / 1 BLK / 3 HP
    Ability: Overcharge (Exhaust, 1 Energy) -> Ready another unit
    """
    
    def __init__(self):
        super().__init__("Overcharger", gold_cost=3, energy_cost=1, attack=1, block=1, health=3)
        
    def overcharge(self, player, target_unit):
        """
        Use Overcharge ability: Spend 1 Energy to ready another unit.
        Returns True if successful, False otherwise.
        """
        if self.exhausted:
            return False, "This Overcharger is already exhausted"
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
    Cost: 4 Gold + 2 Energy
    Stats: 3 ATK / 0 BLK / 2 HP
    Ability: Detonate (Exhaust, 2 Energy) -> Destroy this unit, gain +3 Attack this turn
    """
    
    def __init__(self):
        super().__init__("Volatile", gold_cost=4, energy_cost=2, attack=0, block=0, health=2)
        self.detonated = False
        
    def detonate(self, player):
        """
        Use Detonate ability: Spend 1 Energy, destroy this unit, gain +5 Attack.
        Returns True if successful, False otherwise.
        """
        if self.exhausted:
            return False, "This Volatile is already exhausted"
        if player.energy < 1:
            return False, "Not enough energy (need 1)"
            
        player.energy -= 1
        self.attack += 5  # Gain 5 attack
        self.detonated = True
        self.current_health = 0  # Will be destroyed at end of turn
        self.exhaust()
        return True, f"Detonated! This Volatile now has {self.attack} attack"


class Barrier(Unit):
    """
    Cost: 1 Gold
    Stats: 0 ATK / 1 BLK / 1 HP
    """
    
    def __init__(self):
        super().__init__("Barrier", gold_cost=1, energy_cost=0, attack=0, block=1, health=1)
        self.fragile = True


# Unit factory for easy creation
UNIT_TYPES = {
    "miner": Miner,
    "energizer": Energizer,
    "striker": Striker,
    "guard": Guard,
    "wall": Wall,
    "overcharger": Overcharger,
    "volatile": Volatile,
    "barrier": Barrier,
}

def create_unit(unit_type):
    """Create a unit by name. Returns None if unit type doesn't exist."""
    unit_class = UNIT_TYPES.get(unit_type.lower())
    if unit_class:
        return unit_class()
    return None
