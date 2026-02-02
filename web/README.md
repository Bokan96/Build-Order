# Prismata Lite - Web Interface

## How to Run

Since this uses Pyodide (Python in the browser), you need to serve the files over HTTP (not just opening index.html directly).

### Option 1: Python HTTP Server (Easiest)

```bash
cd web
python -m http.server 8000
```

Then open: http://localhost:8000

### Option 2: Node.js HTTP Server

```bash
cd web
npx http-server -p 8000
```

Then open: http://localhost:8000

### Option 3: VS Code Live Server

1. Install "Live Server" extension in VS Code
2. Right-click on `index.html` → "Open with Live Server"

## Game Controls

1. **Welcome Screen**: Choose "Player vs AI"
2. **AI Selection**: Pick your opponent strategy
3. **Game Screen**: 
   - Click cards to use them (tap/exhaust)
   - Cards with attack automatically add to damage pool
   - Resource cards (Miner, Energizer) generate resources
   - Click "SHOP" to buy units
   - Click "END TURN" when ready

## Card Mechanics

- **Exhausted cards** rotate 90° (like tapping in Magic: The Gathering)
- **Attack units** (Striker, Guard) automatically prepare for attack when clicked
- **Overcharger** requires selecting a target unit after clicking
- **Miner/Energizer** generate resources when clicked

## Notes

- First load takes ~10-20 seconds to download Pyodide
- All game logic runs in Python via WebAssembly
- No backend server needed - everything runs in your browser!
