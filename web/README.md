# Prismata Lite - Web Interface

A web-based graphical interface for Prismata Lite, running entirely in the browser using WebAssembly.

![Web Interface](assets/screenshot.png)

## 🌟 Features

- **Full GUI**: Play the game with a visual interface instead of text commands.
- **In-Browser Logic**: Validates moves and runs game logic locally using **Pyodide** (CPython compiled to WebAssembly).
- **Interactive Elements**:
  - Clickable cards for units and diverse strategies.
  - Visual resource tracking (Gold, Energy, Attack, Defense).
  - Animated feedback for actions and turn phases.
- **Responsive Design**: Adapts to different screen sizes.

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Game Logic**: Python 3.11 (via Pyodide)
- **Styling**: Custom CSS with flexbox/grid layouts
- **No Backend Required**: The entire game engine runs client-side.

## 🚀 How to Run

Because this project uses Pyodide to load Python modules, browsers block local file access (`file://`) for security reasons (CORS). You must run a local web server.

### Option 1: Python HTTP Server (Recommended)

If you have Python installed:

```bash
cd web
python -m http.server 8000
```

Then open: [http://localhost:8000](http://localhost:8000)

### Option 2: Node.js HTTP Server

If you have Node.js installed:

```bash
cd web
npx http-server -p 8000
```

### Option 3: VS Code Live Server

1. Install the "Live Server" extension in VS Code.
2. Right-click on `web/index.html`.
3. Select "Open with Live Server".

## 🎮 Game Controls

- **Start Game**: Select a difficulty/AI opponent from the main menu.
- **Play Cards**: Click on unit cards in your hand or supply.
  - **Blue Cards (Resources)**: Click to generate Gold/Energy.
  - **Red Cards (Units)**: Click to buy or activate abilities.
  - **Attack**: Click attack units (like Strikers) to queue damage.
- **End Turn**: Click the "End Turn" button to proceed.
- **Debug Console**: Open the browser developer console (F12) to see Pyodide logs.

## 📂 Project Structure

- `index.html`: Main entry point and layout.
- `style.css`: All visual styling and animations.
- `app.js`: Connects the UI events to the Python game engine.
- `assets/`: Images and icons.
