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
        this.processingTurn = false;

        // UI Elements
        this.elements = {
            loadingOverlay: document.getElementById('loading-overlay'),
            welcomeScreen: document.getElementById('welcome-screen'),
            aiSelectionScreen: document.getElementById('ai-selection-screen'),
            app: document.getElementById('app'),
            p1Units: document.getElementById('p1-units'),
            p2Units: document.getElementById('p2-units'),
            logEntries: document.getElementById('combat-log'), /* Wrapper now is combat-log */
            combatLogWrapper: document.getElementById('combat-log'), /* Container for expanding */
            btnLogToggle: document.getElementById('btn-toggle-log'),
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
            # Create a dummy logger for the AI
            class DummyLogger:
                def write(self, msg):
                    pass
                def flush(self):
                    pass
            
            game = GameState("Player 1", "AI")
            game.setup_game()
            engine = GameEngine(game)
            ai = Agent("${this.selectedAI || 'Aggressive'}", logger=DummyLogger(), interactive=False)
            
            # Start the first turn properly
            engine.start_phase()
            engine.action_phase()
            
            # Helper to get state as dict for JS
            def get_ui_bundle():
                def serialize_player(p):
                    # Sort units by type priority
                    priority = {
                        "miner": 1, "energizer": 2, "striker": 3, 
                        "guard": 4, "wall": 5, "volatile": 6, 
                        "overcharger": 7, "barrier": 8
                    }
                    sorted_units = sorted(p.units, key=lambda u: priority.get(u.name.lower(), 99))
                    
                    return {
                        "name": p.name,
                        "gold": p.gold,
                        "energy": p.energy,
                        "hp": p.base_health,
                        "purchased": p.units_purchased,
                        "lifetime": p.lifetime_units,
                        "atk": p.displayed_attack,
                        "blk": p.displayed_block,
                        "units": [{
                            "name": u.name,
                            "id": id(u),
                            "exhausted": u.exhausted,
                            "hp": u.current_health if u.is_alive() else 0,
                            "atk": u.attack,
                            "blk": u.block,
                            "type": u.name.lower(),
                            "isAlive": u.is_alive(),
                            "attacking": u in engine.attacking_units or u in game.pending_attackers or u in engine.prepared_squad,
                            "blocking": u in engine.blocking_units
                        } for u in sorted_units]
                    }
                
                return {
                    "phase": game.phase,
                    "turn": game.turn_number,
                    "currentPlayer": game.current_player.name,
                    "p1": serialize_player(game.player1),
                    "p2": serialize_player(game.player2),
                    "gameOver": game.game_over,
                    "winner": game.winner.name if game.winner else None,
                    "combat": {
                        "atk": sum(u.attack for u in engine.attacking_units),
                        "blk": sum(u.block for u in engine.blocking_units),
                        "assigned": engine.assigned_damage
                    }
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

        if (this.state.gameOver) {
            alert(`GAME OVER! Winner: ${this.state.winner}`);
            this.state.gameOver = false; // Prevent logic loop or manage appropriately
            // Ideally strictly disable inputs here
        }

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

    updatePlayerStats(player, data) {
        document.getElementById(`${player}-hp`).textContent = data.hp;
        document.getElementById(`${player}-gold`).textContent = data.gold;
        document.getElementById(`${player}-energy`).textContent = data.energy;
        document.getElementById(`${player}-atk`).textContent = data.atk;
    }

    renderUnits(container, units, isFriendly) {
        container.innerHTML = '';

        units.forEach((unit, index) => {
            const slot = document.createElement('div');
            slot.className = 'unit-slot';

            const card = document.createElement('div');
            const isAttacking = unit.attacking;
            const isBlocking = unit.blocking;
            const isExhausted = unit.exhausted;

            // Calculate the unit number within its type
            const unitsOfSameType = units.filter((u, i) => i <= index && u.type === unit.type);
            const unitNumber = unitsOfSameType.length;

            if (!unit.isAlive) return;

            card.className = `unit-card ${isExhausted ? 'exhausted' : ''} ${isAttacking ? 'attacking' : ''} ${isBlocking ? 'blocking' : ''}`;
            const imgUrl = this.unitImages[unit.type];

            // Use the actual card image
            card.innerHTML = `
                <div class="unit-art" style="background-image: url('${imgUrl}')"></div>
                <div class="count-badge">#${unitNumber}</div>
                ${isAttacking ? '<div class="combat-badge attacking">⚔️</div>' : ''}
                ${isBlocking ? '<div class="combat-badge blocking">🛡️</div>' : ''}
            `;

            // Interaction Handlers with Animation
            if (isFriendly && !isExhausted && this.state.phase === 'Action') {
                card.onclick = async () => {
                    // Trigger animation before processing
                    card.classList.add('exhausting-animation');
                    await new Promise(r => setTimeout(r, 400));
                    this.handleUnitClick(unit, unitNumber);
                };
            } else if (isFriendly && !isExhausted && this.state.phase === 'Defense' && unit.blk > 0 && !isBlocking) {
                card.onclick = () => this.handleBlock(unit, unitNumber);
            } else if (!isFriendly && this.state.phase === 'Assignment' && unit.hp > 0) {
                // If it's the player's turn to assign damage to AI
                card.onclick = () => this.handleAssignDamage(unit, unitNumber);
            }

            slot.appendChild(card);
            container.appendChild(slot);
        });
    }

    updateActionButtons() {
        // In Assignment phase, the ATTACKER (Player 1) is acting, 
        // even if the currentPlayer tracker might be the defender (AI).
        const isMyTurn = this.state.currentPlayer === "Player 1";
        const phase = this.state.phase;

        const canAct = isMyTurn || phase === 'Assignment';

        this.elements.btnEnd.disabled = !canAct;
        this.elements.btnBuy.disabled = !isMyTurn || phase === 'Defense' || phase === 'Assignment';

        // Hide buttons completely when cannot act
        if (!canAct) {
            this.elements.btnEnd.style.opacity = '0.3';
            this.elements.btnBuy.style.opacity = '0.3';
        } else {
            this.elements.btnEnd.style.opacity = '1';
            this.elements.btnBuy.style.opacity = '1';
        }

        if (phase === 'Defense') {
            this.elements.btnEnd.textContent = "FINISH BLOCKING";
            this.elements.btnEnd.classList.add('important');
        } else if (phase === 'Assignment') {
            const combat = this.state.combat;
            const remaining = Math.max(0, (combat.atk - combat.blk) - combat.assigned);
            this.elements.btnEnd.textContent = `FINISH BREACH (${remaining})`;
            this.elements.btnEnd.classList.add('important');
        } else {
            this.elements.btnEnd.textContent = "END TURN";
            this.elements.btnEnd.classList.remove('important');
        }
    }

    // -- Game Actions --

    async handleUnitClick(unit, unitNumber) {
        // Units with attack value (striker, guard, volatile, overcharger) - auto-prepare for attack
        if (unit.atk > 0 && unit.type !== 'overcharger') {
            // Prepare this specific unit for attack
            const resultProxy = this.pyodide.runPython(`
                # Find the actual unit object
                unit_type = "${unit.type}"
                unit_idx = ${unitNumber} - 1  # Convert to 0-based index
                units_of_type = game.player1.get_units_by_type(unit_type)
                
                if unit_idx < len(units_of_type):
                    target_unit = units_of_type[unit_idx]
                    if not target_unit.exhausted and target_unit.is_alive():
                        # Add to prepared squad (to attack next turn)
                        if target_unit not in engine.prepared_squad:
                            if game.player1.energy >= target_unit.attack_cost:
                                engine.prepared_squad.append(target_unit)
                                game.player1.energy -= target_unit.attack_cost
                                target_unit.exhausted = True
                                game.player1.displayed_attack = sum(u.attack for u in engine.prepared_squad)
                                success = True
                                msg = f"Prepared {target_unit.name} for attack"
                            else:
                                success = False
                                msg = "Not enough energy"
                        else:
                            success = False
                            msg = "Unit already attacking"
                    else:
                        success = False
                        msg = "Unit is exhausted or dead"
                else:
                    success = False
                    msg = f"Invalid {unit_type} number"
                
                {"success": success, "msg": msg}
            `);
            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            resultProxy.destroy();

            if (result.success) {
                this.log(`${unit.name} #${unitNumber} prepared to attack!`, 'player1');
            } else {
                this.log(`Error: ${result.msg}`, 'important');
            }
            this.syncState();
            this.updateUI();
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
        const result = this.pyodide.runPython(`engine.assign_blockers([("${unit.type}", 1)])`);
        this.syncState();
        this.updateUI();
    }

    handleAssignDamage(unit, unitNumber) {
        const resultProxy = this.pyodide.runPython(`
            target_type = "${unit.type}"
            target_num = ${unitNumber}
            
            # Attacker (Player 1) chooses where leftover damage goes
            # Determine how much HP is needed to kill this unit
            defender = game.player2
            target_unit = defender.get_units_by_type(target_type)[target_num-1]
            hp_needed = target_unit.current_health
            
            # Try to resolve combat for this unit
            success, msg = engine.resolve_combat([(target_type, hp_needed)])
            {"success": success, "msg": msg}
        `);
        const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
        resultProxy.destroy();

        if (result.success) {
            this.log(`Destroyed ${unit.name} #${unitNumber}`, 'important');

            // Re-sync to check if breach is finished
            this.syncState();

            const combat = this.state.combat;
            const remaining = (combat.atk - combat.blk) - combat.assigned;

            if (remaining <= 0) {
                this.log("All breach damage assigned.", "system");
                // Use the same logic as btnEnd.onclick for Assignment phase
                this.handleEndTurn();
            } else {
                this.updateUI();
            }
        } else {
            this.log(`Could not target ${unit.name}: ${result.msg}`, 'important');
            this.updateUI();
        }
    }

    async handleEndTurn() {
        // Prevent double-clicking
        if (this.processingTurn) return;
        this.processingTurn = true;
        this.elements.btnEnd.disabled = true;
        this.elements.btnBuy.disabled = true;

        try {
            if (this.state.phase === 'Defense') {
                // Defender finished blocking - check for breach using engine
                const resProxy = this.pyodide.runPython(`
                    success, msg = engine.finish_defense()
                    {"game_phase": game.phase, "msg": msg}
                `);
                const res = resProxy.toJs({ dict_converter: Object.fromEntries });
                resProxy.destroy();

                if (res.game_phase === 'Assignment') {
                    // Attacker must assign breach damage
                    if (this.state.currentPlayer === 'Player 1') {
                        // AI attacked, Athlete (Player 1) defended, now AI (Attacker) assigns
                        this.log("AI is assigning damage...", "system");
                        const aiResProxy = this.pyodide.runPython(`
                            assignments = ai.assign_damage(game, engine, sum(u.attack for u in engine.attacking_units) - sum(u.block for u in engine.blocking_units))
                            success, msg = engine.resolve_combat(assignments)
                            engine.end_phase()
                            msg
                        `);
                        this.log(`AI Result: ${aiResProxy.toString()}`, "opponent");
                        this.pyodide.runPython(`engine.action_phase()`);
                    } else {
                        // Player 1 attacked, AI defended, now Player 1 (Attacker) assigns
                        this.log("BREACH! Click enemy units to assign damage.", "important");
                        this.syncState();
                        this.updateUI();
                        this.processingTurn = false;
                        return;
                    }
                } else {
                    this.log(res.msg, "system");
                }

                this.syncState();
                this.updateUI();
                this.processingTurn = false;

            } else if (this.state.phase === 'Assignment') {
                // Attacker finished assigning damage - auto-assign leftover to base
                this.log("Finishing damage assignment...", "system");
                const resProxy = this.pyodide.runPython(`
                    # Auto-assign remaining to base
                    total_atk = sum(u.attack for u in engine.attacking_units)
                    total_blk = sum(u.block for u in engine.blocking_units)
                    remaining = total_atk - total_blk - engine.assigned_damage
                    results = []
                    if remaining > 0:
                        success, msg = engine.resolve_combat([("base", remaining)])
                        results.append(msg)
                    
                    # Log all dead units from the attacker's turn
                    dead_p2 = [u.name for u in game.player2.units if not u.is_alive()]
                    if dead_p2:
                        results.append(f"Units destroyed: {', '.join(dead_p2)}")
                        
                    engine.end_phase()
                    engine.action_phase()
                    " ; ".join(results) if results else "Breach finished"
                `);
                const msg = resProxy.toString();
                if (msg !== "Breach finished") this.log(msg, "player1");

                this.syncState();
                this.updateUI();

                // Proceed with AI's Action phase
                this.processingTurn = false;

                // Use setTimeout to ensure UI updates before AI logic hits
                setTimeout(() => this.runAIActionPhase(), 100);

            } else {
                // End Action Phase
                this.log("Ending Turn...", "system");

                this.pyodide.runPython(`
                    engine.end_phase()
                    engine.end_turn()
                    engine.start_phase()
                    
                    # Enter Defense phase if needed
                    engine.defense_phase()
                `);

                this.syncState();
                this.updateUI();

                if (this.state.phase === 'Defense') {
                    // Player attacked - AI needs to defend
                    const incomingAtkProxy = this.pyodide.runPython(`sum(u.attack for u in engine.attacking_units)`);
                    const incomingAtk = incomingAtkProxy;
                    this.log(`🚨 INCOMING ATTACK! ${incomingAtk} damage aimed at AI.`, "important");
                    await new Promise(resolve => setTimeout(resolve, 800));

                    this.pyodide.runPython(`
                        # AI executes defense (blocking)
                        ai.execute_turn(game, engine)
                        engine.finish_defense()
                    `);
                    this.syncState();

                    // If it's now Assignment phase, P1 enters Assignment mode
                    if (this.state.phase === 'Assignment') {
                        this.log("BREACH! Click AI units to destroy them.", "important");
                        this.updateUI();
                        this.processingTurn = false;
                        return; // Wait for player to assign
                    }
                } else {
                    // No attack, but we might still need to transition to Action phase for AI
                    this.pyodide.runPython(`
                       if game.phase != "Action":
                           engine.action_phase()
                    `);
                    this.syncState();
                }

                // AI Action Phase
                this.log("AI Opponent is thinking...", "system");
                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    const resultProxy = this.pyodide.runPython(`
                        # AI executes actions
                        summary = ai.execute_turn(game, engine)
                        
                        # End AI Action phase
                        engine.end_phase()
                        engine.end_turn()
                        
                        # Start player's turn
                        engine.start_phase()
                        engine.defense_phase()
                        
                        res_msg = ""
                        if game.phase == "Defense":
                            total_atk = sum(u.attack for u in engine.attacking_units)
                            res_msg = f"INCOMING: {total_atk}"
                        else:
                            engine.action_phase()
                        
                        # Return summary to JS
                        {"summary": summary, "msg": res_msg}
                    `);

                    const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
                    resultProxy.destroy();

                    if (result.summary && result.summary.length > 0) {
                        this.log(`AI Actions: ${result.summary.join(", ")}`, 'opponent');
                    }

                    if (result.msg) {
                        this.log(`🚨 ${result.msg} damage incoming! Assign your blockers.`, "important");
                    }

                    this.syncState();
                    this.updateUI();

                    if (this.state.phase !== 'Defense') {
                        this.log("Your turn!", "player1");
                    }
                } catch (aiError) {
                    console.error("AI turn error:", aiError);
                    this.log("AI turn failed: " + aiError.message, "important");
                    // Try to recover by just advancing to player turn
                    this.pyodide.runPython(`
                        game.current_player.units_purchased = 0
                        engine.action_phase()
                    `);
                    this.syncState();
                    this.updateUI();
                }

                this.processingTurn = false;
            }
        } catch (error) {
            console.error("Turn processing error:", error);
            this.log("Error processing turn: " + error.message, "important");
            this.processingTurn = false;
            this.elements.btnEnd.disabled = false;
            this.elements.btnBuy.disabled = false;
        }
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
        // Define base costs as integers for sorting
        const shopUnits = [
            { id: 'barrier', name: 'Barrier', cost: 1, display: '1💰' },
            { id: 'miner', name: 'Miner', cost: 2, display: '2💰' },
            { id: 'energizer', name: 'Energizer', cost: 2, display: '2💰' },
            { id: 'striker', name: 'Striker', cost: 3, display: '3💰' },
            { id: 'guard', name: 'Guard', cost: 3, display: '3💰' },
            { id: 'wall', name: 'Wall', cost: 3, display: '3💰' },
            { id: 'overcharger', name: 'Overcharger', cost: 3, display: '3💰' },
            { id: 'volatile', name: 'Volatile', cost: 4, display: '4💰' }
        ];

        // Sort by cost ascending
        shopUnits.sort((a, b) => a.cost - b.cost);

        this.elements.shopGrid.innerHTML = '';

        // Determine affordability
        const player = this.state.p1;
        const currentGold = player.gold;
        const currentEnergy = player.energy;
        // 2nd unit purchased costs +1 Energy
        const penalty = (player.purchased === 1) ? 1 : 0;
        const unitsBought = player.purchased;

        shopUnits.forEach(u => {
            const item = document.createElement('div');
            item.className = 'shop-list-item';

            // Check affordability logic matching python
            // Cost is Gold + Energy(0 usually)
            // But we only track Gold cost in the object above for sorting
            const unitEnergyCost = 0; // Most units 0, assuming for now
            const totalEnergyReq = unitEnergyCost + penalty;

            let affordable = true;
            let reason = "";

            if (unitsBought >= 2) {
                affordable = false;
                reason = "Max 2 units";
            } else if (currentGold < u.cost) {
                affordable = false;
                reason = "Need Gold";
            } else if (currentEnergy < totalEnergyReq) {
                affordable = false;
                reason = "Need Energy";
            }

            if (!affordable) {
                item.classList.add('disabled');
                item.style.opacity = '0.5';
                item.style.pointerEvents = 'none'; // Prevent clicks
            } else {
                item.style.cursor = 'pointer';
            }

            const imgUrl = this.unitImages[u.id];

            item.innerHTML = `
                <span class="unit-cost">${u.display}</span>
                <span class="unit-name">${u.name}</span>
                ${!affordable ? `<span class="unit-xs-reason" style="font-size: 0.7em; color: #ff5555; margin-left: auto;">${reason}</span>` : ''}
                <div class="shop-preview">
                    <img src="${imgUrl}" alt="${u.name}">
                </div>
            `;

            if (affordable) {
                item.onclick = (e) => {
                    e.stopPropagation();
                    // Double check in case UI is stale, but backend handles it too
                    this.buyUnit(u.id);
                };
            }
            this.elements.shopGrid.appendChild(item);
        });

        this.elements.shopModal.classList.remove('hidden');
    }

    async runAIActionPhase() {
        if (this.processingTurn) return;
        this.processingTurn = true;
        this.elements.btnEnd.disabled = true;
        this.elements.btnBuy.disabled = true;

        this.log("AI Opponent is thinking...", "system");
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            const resultProxy = this.pyodide.runPython(`
                # AI executes actions
                summary = ai.execute_turn(game, engine)
                
                # End AI Action phase
                engine.end_phase()
                engine.end_turn()
                
                # Start player's turn
                engine.start_phase()
                engine.defense_phase()
                
                res_msg = ""
                if game.phase == "Defense":
                    total_atk = sum(u.attack for u in engine.attacking_units)
                    res_msg = f"INCOMING: {total_atk}"
                else:
                    engine.action_phase()
                
                # Return summary to JS
                {"summary": summary, "msg": res_msg}
            `);

            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            resultProxy.destroy();

            if (result.summary && result.summary.length > 0) {
                this.log(`AI Actions: ${result.summary.join(", ")}`, 'opponent');
            }

            if (result.msg) {
                this.log(`🚨 ${result.msg} damage incoming! Assign your blockers.`, "important");
            }

            this.syncState();
            this.updateUI();

            this.processingTurn = false;

            if (this.state.phase !== 'Defense') {
                this.log("Your turn!", "player1");
            }
        } catch (aiError) {
            console.error("AI Action Phase error:", aiError);
            this.log("AI turn failed: " + aiError.message, "important");
            this.processingTurn = false;
            this.elements.btnEnd.disabled = false;
        }
    }

    hideShop() {
        this.elements.shopModal.classList.add('hidden');
    }

    bindEvents() {
        this.elements.btnEnd.onclick = () => this.handleEndTurn();
        this.elements.btnBuy.onclick = () => this.handleBuy();

        // Initialize Log Toggle
        this.elements.btnLogToggle.onclick = () => {
            this.elements.combatLogWrapper.classList.toggle('expanded');
            const isExpanded = this.elements.combatLogWrapper.classList.contains('expanded');
            this.elements.btnLogToggle.innerHTML = isExpanded ? '❌' : '📜';
        };

        // Initialize Modals - Close Button
        const closeBtns = document.querySelectorAll('.close-btn');
        closeBtns.forEach(btn => {
            btn.onclick = () => this.hideShop();
        });

        // Close modal on outside click
        this.elements.shopModal.onclick = (e) => {
            if (e.target === this.elements.shopModal) this.hideShop();
        };
    }
}

// Start
const game = new PrismataWeb();
window.addEventListener('load', () => game.init());
