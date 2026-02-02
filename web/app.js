/**
 * Prismata Lite - Web Bridge
 * Connects the Python game logic to the glassmorphism UI.
 */

class PrismataWeb {
    constructor() {
        this.pyodide = null;
        this.gameState = null;
        this.gameEngine = null;
        this.aiAgent = null;
        this.isLoaded = false;
        this.selectedAI = null;

        // UI Elements
        this.elements = {
            loadingOverlay: document.getElementById('loading-overlay'),
            welcomeScreen: document.getElementById('welcome-screen'),
            aiSelectionScreen: document.getElementById('ai-selection-screen'),
            app: document.getElementById('app'),
            p1Units: document.getElementById('p1-units'),
            p2Units: document.getElementById('p2-units'),
            logEntries: document.getElementById('log-entries'),
            btnEnd: document.getElementById('btn-end'),
            btnBuy: document.getElementById('btn-buy'),
            shopModal: document.getElementById('shop-modal'),
            shopGrid: document.getElementById('shop-grid')
        };

        this.unitIcons = {
            'miner': '👷',
            'energizer': '🔋',
            'striker': '⚔️',
            'guard': '🛡️',
            'wall': '🧱',
            'overcharger': '⚡',
            'volatile': '🧨',
            'barrier': '🚧'
        };

        this.unitImages = {
            'miner': 'assets/cards/Miner.webp',
            'energizer': 'assets/cards/Energizer.webp',
            'striker': 'assets/cards/Striker.webp',
            'guard': 'assets/cards/Guard.webp',
            'wall': 'assets/cards/Wall.webp',
            'overcharger': 'assets/cards/Repeater.webp',
            'volatile': 'assets/cards/Volitile.webp',
            'barrier': 'assets/cards/Barrier.webp'
        };
    }

    async init() {
        try {
            console.log("Initializing Pyodide...");
            this.updateLoadingText("Downloading Python runtime...");

            this.pyodide = await loadPyodide();

            this.updateLoadingText("Loading game files...");
            await this.mountFileSystem();

            this.isLoaded = true;
            this.hideLoading();
            this.showWelcomeScreen();

        } catch (error) {
            console.error("Initialization failed:", error);
            this.updateLoadingText("Error: " + error.message);
        }
    }

    showWelcomeScreen() {
        this.elements.welcomeScreen.classList.remove('hidden');

        document.getElementById('btn-pve').onclick = () => {
            this.elements.welcomeScreen.classList.add('hidden');
            this.showAISelection();
        };
    }

    showAISelection() {
        this.elements.aiSelectionScreen.classList.remove('hidden');

        document.querySelectorAll('.ai-choice').forEach(btn => {
            btn.onclick = () => {
                this.selectedAI = btn.getAttribute('data-ai');
                this.startGame();
            };
        });

        document.getElementById('btn-back-to-menu').onclick = () => {
            this.elements.aiSelectionScreen.classList.add('hidden');
            this.elements.welcomeScreen.classList.remove('hidden');
        };
    }

    startGame() {
        this.elements.aiSelectionScreen.classList.add('hidden');
        this.updateLoadingText("Starting game engine...");
        this.elements.loadingOverlay.style.display = 'flex';
        this.elements.loadingOverlay.style.opacity = '1';

        setTimeout(() => {
            this.setupGame();
            this.bindEvents();
            this.elements.loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                this.elements.loadingOverlay.style.display = 'none';
                this.elements.app.classList.remove('hidden');
                this.updateUI();
                this.log(`Game Initialized. Battling ${this.selectedAI} AI.`, "system");
            }, 500);
        }, 100);
    }

    async mountFileSystem() {
        // Create the directory structure in Pyodide
        this.pyodide.FS.mkdir('/prismata');

        // Files to load from the ../src/prismata directory
        const files = [
            'units.py',
            'game_state.py',
            'game_engine.py',
            'agent.py'
        ];

        for (const file of files) {
            // Path is relative to web/
            const response = await fetch(`../src/prismata/${file}`);
            const content = await response.text();
            this.pyodide.FS.writeFile(`/prismata/${file}`, content);
        }

        // Create an empty __init__.py so it's a valid package
        this.pyodide.FS.writeFile('/prismata/__init__.py', '');

        // Add to python path
        this.pyodide.runPython(`
            import sys
            sys.path.append('/')
            from prismata.game_state import GameState
            from prismata.game_engine import GameEngine
            from prismata.agent import Agent
            from prismata.units import UNIT_TYPES
        `);
    }

    setupGame() {
        // Initialize GameState and GameEngine instances in Python
        this.pyodide.runPython(`
            game = GameState("Player 1", "AI Opponent")
            game.setup_game()
            engine = GameEngine(game)
            ai = Agent("${this.selectedAI || 'Aggressive'}") # Use selected AI
            
            # Helper to get state as dict for JS
            def get_ui_bundle():
                def serialize_player(p):
                    return {
                        "name": p.name,
                        "gold": p.gold,
                        "energy": p.energy,
                        "hp": p.base_health,
                        "atk": p.displayed_attack,
                        "blk": p.displayed_block,
                        "units": [{
                            "name": u.name,
                            "id": id(u),
                            "exhausted": u.exhausted,
                            "hp": u.current_health,
                            "atk": u.attack,
                            "blk": u.block,
                            "type": u.name.lower()
                        } for u in p.units]
                    }
                
                return {
                    "phase": game.phase,
                    "turn": game.turn_number,
                    "currentPlayer": game.current_player.name,
                    "p1": serialize_player(game.player1),
                    "p2": serialize_player(game.player2),
                    "gameOver": game.game_over,
                    "winner": game.winner.name if game.winner else None
                }
        `);

        this.syncState();
    }

    syncState() {
        const bundleProxy = this.pyodide.runPython("get_ui_bundle()");
        this.state = bundleProxy.toJs({ dict_converter: Object.fromEntries });
        bundleProxy.destroy();
    }

    updateUI() {
        if (!this.state) return;

        // Update Header
        document.getElementById('turn-count').textContent = this.state.turn;
        document.getElementById('phase-name').textContent = this.state.phase.toUpperCase();
        document.getElementById('player-name-display').textContent = this.state.currentPlayer.toUpperCase();

        // Update Stats
        this.updatePlayerStats('p1', this.state.p1);
        this.updatePlayerStats('p2', this.state.p2);

        // Render Units
        this.renderUnits(this.elements.p1Units, this.state.p1.units, true);
        this.renderUnits(this.elements.p2Units, this.state.p2.units, false);

        // Update Buttons
        this.updateActionButtons();
    }

    updatePlayerStats(prefix, player) {
        document.getElementById(`${prefix}-name`).textContent = player.name;
        document.getElementById(`${prefix}-hp`).textContent = player.hp;
        document.getElementById(`${prefix}-gold`).textContent = player.gold;
        document.getElementById(`${prefix}-energy`).textContent = player.energy;
        document.getElementById(`${prefix}-atk`).textContent = player.atk;
        document.getElementById(`${prefix}-blk`).textContent = player.blk;

        const hpPercent = (player.hp / 10) * 100;
        document.getElementById(`${prefix}-hp-fill`).style.width = `${hpPercent}%`;
    }

    renderUnits(container, units, isFriendly) {
        container.innerHTML = '';

        units.forEach((unit, index) => {
            const card = document.createElement('div');
            card.className = `unit-card ${unit.exhausted ? 'exhausted' : ''}`;
            const imgUrl = this.unitImages[unit.type];

            // Use the actual card image
            card.innerHTML = `
                <div class="unit-art" style="background-image: url('${imgUrl}')"></div>
                <div class="count-badge">#${index + 1}</div>
            `;

            const unitNumber = index + 1;
            if (isFriendly && !unit.exhausted && this.state.phase === 'Action') {
                card.onclick = () => this.handleUnitClick(unit, unitNumber);
            } else if (isFriendly && !unit.exhausted && this.state.phase === 'Defense' && unit.blk > 0) {
                card.onclick = () => this.handleBlock(unit, unitNumber);
            }

            container.appendChild(card);
        });
    }

    updateActionButtons() {
        const isMyTurn = this.state.currentPlayer === "Player 1";
        const phase = this.state.phase;

        this.elements.btnEnd.disabled = !isMyTurn;
        this.elements.btnBuy.disabled = !isMyTurn || phase === 'Defense';

        if (phase === 'Defense') {
            this.elements.btnEnd.textContent = "FINISH BLOCKING";
            this.elements.btnEnd.classList.add('important');
        } else {
            this.elements.btnEnd.textContent = "END TURN";
            this.elements.btnEnd.classList.remove('important');
        }
    }

    // -- Game Actions --

    async handleUnitClick(unit, unitNumber) {
        // Units with attack value (striker, guard, volatile, overcharger) - auto-prepare for attack
        if (unit.atk > 0) {
            this.pyodide.runPython(`
                # Prepare this unit for attack
                success, msg = engine.prepare_attackers([("${unit.type}", ${unitNumber})])
                {"success": success, "msg": msg}
            `);
            this.syncState();
            this.updateUI();
            this.log(`${unit.name} #${unitNumber} prepared to attack!`, 'player1');
            return;
        }

        // Resource generation units (miner, energizer, wall)
        if (unit.type === 'miner' || unit.type === 'energizer' || unit.type === 'wall') {
            const result = this.pyodide.runPython(`engine.use_ability("${unit.type}", ${unitNumber})`);
            this.processActionResult(result);
        } else if (unit.type === 'overcharger') {
            this.startTargeting(unit, unitNumber);
        } else if (unit.type === 'volatile') {
            // Detonate volatile
            const result = this.pyodide.runPython(`engine.use_ability("${unit.type}", ${unitNumber})`);
            this.processActionResult(result);
        }
    }

    startTargeting(sourceUnit, sourceNumber) {
        this.targeting = { sourceUnit, sourceNumber };
        this.log(`Click a friendly unit to overcharge with Overcharger #${sourceNumber}`, 'system');

        // Temporarily change all friendly cards to targeting mode
        const friendlyCards = this.elements.p1Units.querySelectorAll('.unit-card');
        friendlyCards.forEach((cardEl, idx) => {
            const originalClass = cardEl.className;
            cardEl.style.border = '2px solid yellow';
            cardEl.onclick = (e) => {
                e.stopPropagation();
                this.executeTargetedAbility(idx + 1);
                // Restore cards
                this.updateUI();
            };
        });
    }

    executeTargetedAbility(targetNumber) {
        const { sourceUnit, sourceNumber } = this.targeting;
        this.pyodide.runPython(`
            source_type = "${sourceUnit.type}"
            source_num = ${sourceNumber}
            target_type = "${this.state.p1.units[targetNumber - 1].type}"
            target_idx = ${targetNumber}
            
            # Find the actual unit object in python
            target_unit = game.player1.get_units_by_type(target_type)[target_idx-1]
            success, msg = engine.use_ability(source_type, source_num, target=target_unit)
            {"success": success, "msg": msg}
        `);

        this.targeting = null;
        this.log(`Overcharged unit #${targetNumber}`, 'player1');
        this.syncState();
    }

    handleBlock(unit) {
        this.pyodide.runPython(`engine.assign_blockers([("${unit.type}", 1)])`);
        this.syncState();
        this.updateUI();
    }

    async handleEndTurn() {
        if (this.state.phase === 'Defense') {
            // End defense: handle combat resolution
            this.pyodide.runPython(`
                # Attacker (AI) assigns damage if player finished blocking
                total_atk = sum(u.attack for u in engine.attacking_units)
                total_blk = sum(u.block for u in engine.blocking_units)
                remaining = max(0, total_atk - total_blk)
                if remaining > 0:
                    assignments = ai.assign_damage(game, engine, remaining)
                    engine.resolve_combat(assignments)
                
                engine.end_phase()
                engine.action_phase()
            `);
        } else {
            // End Turn
            this.pyodide.runPython(`
                engine.end_phase()
                engine.end_turn()
                engine.start_phase()
                
                # If it's AI turn, execute it
                if "AI" in game.current_player.name:
                    engine.defense_phase()
                    if game.phase == "Defense":
                        ai.handle_defense(game, engine)
                        # Combat resolution (Player as attacker doesn't assign yet)
                        # For simplicity in Lite AI, assume combat resolves
                    
                    if game.phase != "Action":
                        engine.action_phase()
                    ai.handle_action(game, engine)
                    
                    # End AI turn
                    engine.end_phase()
                    engine.end_turn()
                    engine.start_phase()
            `);
        }
        this.syncState();
        this.updateUI();
        this.log("Phase advanced.", "system");
    }

    async handleBuy() {
        this.showShop();
    }

    buyUnit(type) {
        const successProxy = this.pyodide.runPython(`
            success, msg = engine.buy_unit("${type}")
            {"success": success, "msg": msg}
        `);
        const result = successProxy.toJs({ dict_converter: Object.fromEntries });
        successProxy.destroy();

        if (result.success) {
            this.log(`Bought ${type}: ${result.msg}`, 'player1');
            this.hideShop();
            this.syncState();
            this.updateUI();
        } else {
            this.log(`Error: ${result.msg}`, 'important');
        }
    }

    processActionResult(proxy) {
        const result = proxy.toJs({ dict_converter: Object.fromEntries });
        proxy.destroy();
        if (result[0]) {
            this.log(result[1], 'player1');
            this.syncState();
            this.updateUI();
        } else {
            this.log(result[1], 'important');
        }
    }

    // -- UI Helpers --

    log(message, type = '') {
        const div = document.createElement('div');
        div.className = `log-entry ${type}`;
        div.textContent = `> ${message}`;
        this.elements.logEntries.appendChild(div);
        this.elements.logEntries.scrollTop = this.elements.logEntries.scrollHeight;
    }

    updateLoadingText(text) {
        document.getElementById('loading-text').textContent = text;
    }

    hideLoading() {
        this.elements.loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            this.elements.loadingOverlay.style.display = 'none';
            this.elements.app.classList.remove('hidden');
        }, 500);
    }

    showShop() {
        const shopUnits = [
            { id: 'miner', name: 'Miner', cost: '2G' },
            { id: 'energizer', name: 'Energizer', cost: '2G' },
            { id: 'striker', name: 'Striker', cost: '3G' },
            { id: 'guard', name: 'Guard', cost: '3G' },
            { id: 'wall', name: 'Wall', cost: '3G' },
            { id: 'overcharger', name: 'Overcharger', cost: '3G' },
            { id: 'volatile', name: 'Volatile', cost: '4G' },
            { id: 'barrier', name: 'Barrier', cost: '1G' }
        ];

        this.elements.shopGrid.innerHTML = '';
        shopUnits.forEach(u => {
            const item = document.createElement('div');
            item.className = 'buy-item';
            const imgUrl = this.unitImages[u.id];
            item.innerHTML = `
                <div class="unit-art" style="width: 80px; height: 100px; font-size: 2rem; background-image: url('${imgUrl}')">
                    ${!imgUrl ? (this.unitIcons[u.id] || '❓') : ''}
                </div>
                <div class="unit-name">${u.name}</div>
                <div class="cost-tag">${u.cost}</div>
            `;
            item.onclick = () => this.buyUnit(u.id);
            this.elements.shopGrid.appendChild(item);
        });

        this.elements.shopModal.classList.remove('hidden');
    }

    hideShop() {
        this.elements.shopModal.classList.add('hidden');
    }

    bindEvents() {
        this.elements.btnEnd.onclick = () => this.handleEndTurn();
        this.elements.btnBuy.onclick = () => this.handleBuy();

        document.querySelector('.close-btn').onclick = () => this.hideShop();

        // Close modal on outside click
        this.elements.shopModal.onclick = (e) => {
            if (e.target === this.elements.shopModal) this.hideShop();
        };
    }
}

// Start
const game = new PrismataWeb();
window.addEventListener('load', () => game.init());
