# Prismata Lite - Digital Playtest Version

A console-based Python implementation of Prismata Lite for testing game balance and mechanics.

## 📋 Requirements

- Python 3.7 or higher
- No external dependencies required (uses only Python standard library)

## 🚀 How to Run

1. Open a terminal/command prompt
2. Navigate to this directory:
   ```
   cd "d:\GitHub Repositories\Prismata"
   ```
3. Run the game:
   ```
   python main.py
   ```

## 🎮 How to Play

The game is played through text commands. Type `help` in-game to see all available commands.

### Basic Commands

- **`help`** - Show all available commands
- **`state`** - Display current game state (resources, units, base HP)
- **`end`** - End the current phase and progress to the next
- **`quit`** - Exit the game

### Action Phase Commands

During your Action Phase, you can:

- **`buy <unit>`** - Purchase a unit
  - Example: `buy miner`
  - Example: `buy striker`
  
- **`use <unit> <number>`** - Use a unit's ability
  - Example: `use miner 1` (use the first Miner's Mine ability)
  - Example: `use volatile 1` (detonate the first Volatile)
  
- **`attack <unit> <number>, ...`** - Prepare units to attack
  - Example: `attack striker 1`
  - Example: `attack striker 1, striker 2, overcharger 1`

### Attack Phase Commands

When your opponent attacks, you (the defender) can:

- **`block <unit> <number>, ...`** - Assign units to block
  - Example: `block guard 1`
  - Example: `block guard 1, wall 1, barrier 1`
  
- **`assign <target> <damage>`** - Assign remaining damage
  - Example: `assign base 5` (deal 5 damage to opponent's base)
  - Example: `assign guard 1 3` (deal 3 damage to destroy opponent's Guard #1)

## 📦 Available Units

| Unit | Cost | Stats | Ability |
|------|------|-------|---------|
| **Miner** | 2G | 0/0/2 | Mine: Exhaust + 1E → +1G |
| **Energizer** | 2G | 0/0/3 | Generate: Exhaust → +1E |
| **Striker** | 3G | 2/0/1 | None |
| **Guard** | 3G | 0/2/3 | None |
| **Wall** | 4G | 0/4/6 | None |
| **Overcharger** | 3G+1E | 1/1/3 | Overcharge: Exhaust + 1E → Ready another unit |
| **Volatile** | 4G+2E | 3/0/2 | Detonate: Exhaust + 2E → +3 ATK, destroy self |
| **Barrier** | 1G | 0/1/1 | None |

*Stats format: ATK/BLK/HP*

## 🎯 Game Rules

See [RULEBOOK.md](RULEBOOK.md) for complete rules.

**Quick Summary:**
- Win by reducing opponent's base to 0 HP (starts at 10)
- Each turn has 4 phases: Start → Action → Attack → End
- Manage two resources: Gold (carries over) and Energy (resets each turn)
- Only ready units can block; exhausted units cannot

## 🧪 Example Game Session

```
Turn 1 - Player 1
> buy miner
✅ Bought Miner for 2G 0E
> use miner 1
✅ Mined 1 gold (now have 1 gold, 0 energy)
> end

Turn 1 - Player 2
> buy energizer
✅ Bought Energizer for 2G 0E
> end

Turn 2 - Player 1
> state
(shows current game state)
> buy striker
✅ Bought Striker for 3G 0E
> attack striker 1
✅ Prepared 1 units to attack (total 2 damage)
> end

Turn 2 - Player 2 (defending)
> block guard 1
✅ Assigned 1 blockers (total 2 block)
> end
```

## 📁 Project Structure

- **`units.py`** - Unit definitions and abilities
- **`game_state.py`** - Game state management (players, resources, units)
- **`game_engine.py`** - Turn phases and combat logic
- **`main.py`** - Console interface and game loop
- **`RULEBOOK.md`** - Complete game rules

## 🐛 Known Limitations

This is a playtest version focused on testing balance, not a polished game:

- No AI opponent (requires two human players)
- No save/load functionality
- Combat damage assignment is manual (not automated)
- No undo functionality
- Limited input validation

## 💡 Tips for Balance Testing

1. Try different opening builds (Miner-heavy vs Energizer-heavy)
2. Test timing attacks with Strikers
3. Experiment with Overcharger combos
4. Find the optimal Volatile timing
5. Track which strategies consistently win

## 📝 Future Enhancements

Potential additions for balance testing:
- Simple AI opponents with different strategies
- Game replay/logging system
- Statistics tracking (win rates, average game length)
- Batch simulation mode
- Unit stat tweaking without code changes

---

**Have fun testing! Report any bugs or balance issues you discover.**
