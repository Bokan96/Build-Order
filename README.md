# Prismata Lite - Digital Playtest Version

A console-based Python implementation of Prismata Lite for testing game balance and mechanics.

## 📋 Requirements

- Python 3.7 or higher
- No external dependencies required (uses only Python standard library)

## 🚀 How to Run

1. Open a terminal/command prompt
2. Navigate to the project root directory
3. Run the game:
   ```bash
   python run.py
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

- **`buy <unit>`** - Purchase a unit (e.g., `buy miner` or `buy m`)
- **`use <unit> [count|all]`** - Use a unit's ability (e.g., `use m 3` or `use m all`)
- **`use <u1> on <u2>`** - Target another unit (e.g., `use o 1 on m 1`)
- **`attack <unit> <number>, ...`** - Prepare units to attack

### Defense Phase Commands

When your opponent attacks, you (the defender) can:

- **`block <unit> [#]`** - Assign units to block (e.g., `block guard 2`)
- **`block end`** - Finish blocking (attacker assigns leftover damage)
- **`assign <target> <damage>`** - Manual damage assignment (if not auto-resolved)

## 📦 Available Units

| Unit | Cost | Stats | Ability |
|------|------|-------|---------|
| **Barrier** | 1G | 0/1/1 | Cheap blocker |
| **Miner** | 2G | 0/0/2 | Mine: 1E → 1G |
| **Energizer** | 2G | 0/0/3 | Generate: Gain 1E |
| **Striker** | 3G | 2/0/1 | Atk Cost: 1E |
| **Guard** | 3G | 1/2/2 | Basic blocker |
| **Overcharger** | 3G+1E | 1/1/3 | Ready another unit |
| **Wall** | 3G | 0/2/0 | Structural defense |
| **Volatile** | 4G+2E | 3/0/2 | Detonate: +3 ATK |

*Stats format: ATK/BLK/HP*

## 🎯 Game Rules

See [docs/RULEBOOK.md](docs/RULEBOOK.md) for complete rules.

## 📁 Project Structure

```text
Prismata/
├── src/
│   └── prismata/      # Core game logic
│       ├── agent.py       # AI logic
│       ├── game_engine.py  # Turn phases and combat
│       ├── game_state.py   # State management
│       ├── main.py        # CLI interface
│       └── units.py       # Unit definitions
├── docs/              # Documentation
│   ├── RULEBOOK.md
│   └── PENDING_FIXES.md
├── tests/             # Test scripts and scenarios
├── data/
│   └── logs/          # Battle logs
├── run.py             # Main entry point
└── .gitignore         # Version control exclusion
```

## 🤖 AI Opponent

The game includes several AI strategies to test against:
- **Aggressive**: Prioritizes Strikers and pressure.
- **Guard**: Builds a balanced defense.
- **Wall**: Focuses on heavy structural defense.
- **Reactive**: Adjusts strategy based on player's board.
- **Random**: For testing unexpected variations.

---
**Developed for Advanced Agentic Coding - Google Deepmind**
