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
        this.gameMode = 'AI'; // 'AI' or 'HOTSEAT'
        this.processingTurn = false;

        // UI Elements
        this.elements = {
            loadingOverlay: document.getElementById('loading-overlay'),
            welcomeScreen: document.getElementById('welcome-screen'),
            aiSelectionScreen: document.getElementById('ai-selection-screen'),
            app: document.getElementById('app'),
            p1Units: document.getElementById('p1-units'),
            p2Units: document.getElementById('p2-units'),
            logEntries: document.getElementById('combat-log'),
            combatLogWrapper: document.querySelector('.combat-log-wrapper'),
            combatLog: document.getElementById('combat-log'),
            btnLogToggle: document.getElementById('btn-toggle-log'),
            btnEnd: document.getElementById('btn-end'),
            btnBuy: document.getElementById('btn-buy'),
            shopModal: document.getElementById('shop-modal'),
            shopGrid: document.getElementById('shop-grid'),
            settingsModal: document.getElementById('settings-modal'),
            btnSettings: document.getElementById('btn-settings'),
            closeSettings: document.getElementById('close-settings'),
            btnRestart: document.getElementById('btn-restart-game'),
            sliderMusic: document.getElementById('volume-music'),
            sliderSFX: document.getElementById('volume-sfx'),
            unitPreview: document.getElementById('unit-preview')
        };

        this.hoverTimeout = null;

        this.unitIcons = {
            'miner': '👷',
            'energizer': '🔋',
            'striker': '⚔️',
            'guard': '🛡️',
            'wall': '🧱',
            'overcharger': '⚡',
            'repeater': '⚡',
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
            'repeater': 'assets/cards/Repeater.webp',
            'volatile': 'assets/cards/Volitile.webp',
            'barrier': 'assets/cards/Barrier.webp'
        };

        this.sounds = new SoundManager();
    }

    async init() {
        try {
            console.log("Initializing Pyodide... [VERSION 0.5.2 - SNAPPY UPDATE]");
            this.updateLoadingText("Downloading Python runtime...");

            this.pyodide = await loadPyodide();

            this.updateLoadingText("Loading game files...");
            await this.mountFileSystem();

            this.isLoaded = true;
            this.bindEvents();
            this.hideLoading();
            this.showWelcomeScreen();

            // Expose for console debugging
            window.gameApp = this;
            this.setupConsoleDebug();

        } catch (error) {
            console.error("Initialization failed:", error);
            this.updateLoadingText("Error: " + error.message);
        }
    }

    showWelcomeScreen() {
        this.elements.welcomeScreen.classList.remove('hidden');
        // event listeners are now in bindEvents
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
        this.sounds.startMusic();
        this.elements.aiSelectionScreen.classList.add('hidden');
        this.updateLoadingText("Starting game engine...");
        this.elements.loadingOverlay.style.display = 'flex';
        this.elements.loadingOverlay.style.opacity = '1';

        setTimeout(() => {
            if (!this.initialized) {
                this.setupGame();
                this.initialized = true;
            } else {
                this.setupGame();
            }
            this.elements.loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                this.elements.loadingOverlay.style.display = 'none';
                this.elements.app.classList.remove('hidden');

                // Set body class based on game mode
                if (this.gameMode === 'AI') {
                    document.body.classList.add('ai-mode');
                    document.body.classList.remove('hotseat-mode');
                    this.log(`Game Initialized. Battling ${this.selectedAI} AI.`, "system");
                } else {
                    document.body.classList.add('hotseat-mode');
                    document.body.classList.remove('ai-mode');
                    this.log("Hotseat PvP Mode Started.", "system");
                }

                this.updateUI();
            }, 500);
        }, 100);
    }

    resetGame() {
        this.setupGame();
        this.updateUI();
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
        // Determine player names based on game mode
        const p1Name = "Player 1";
        const p2Name = this.gameMode === 'HOTSEAT' ? "Player 2" : "AI";
        const aiType = this.selectedAI || 'Aggressive';

        // Initialize GameState and GameEngine instances in Python
        this.pyodide.runPython(`
            # Create a dummy logger for the AI
            class DummyLogger:
                def write(self, msg):
                    pass
                def flush(self):
                    pass
            
            game = GameState("${p1Name}", "${p2Name}")
            game.setup_game()
            engine = GameEngine(game)
            
            # Only create AI agent if not in HOTSEAT mode
            ai = None
            if "${this.gameMode}" != "HOTSEAT":
                ai = Agent("${aiType}", logger=DummyLogger(), interactive=False)
            
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
        // In AI mode, P1 is always friendly, P2 is AI.
        // In HOTSEAT mode, 'isFriendly' depends on who is the 'currentPlayer' in the state.
        const p1Name = this.state.p1.name;
        const p2Name = this.state.p2.name;
        const isP1Turn = this.state.currentPlayer === p1Name;

        this.renderUnits(this.elements.p1Units, this.state.p1.units, isP1Turn);
        this.renderUnits(this.elements.p2Units, this.state.p2.units, !isP1Turn);

        // Update Central Attack
        this.updateCentralAttack();

        // Update Buttons
        this.updateActionButtons();
    }

    updatePlayerStats(player, data) {
        document.getElementById(`${player}-hp`).textContent = data.hp;

        // Update player name display
        const nameEl = document.getElementById(`${player}-name`);
        if (nameEl) {
            nameEl.textContent = data.name.toUpperCase();
        }

        // Add glow to active player's stats bar
        const statsBar = document.querySelector(`#${player === 'p1' ? 'player-area' : 'opponent-area'} .player-stats-bar`);
        if (statsBar) {
            if (this.state.currentPlayer === data.name) {
                statsBar.classList.add('active-player');
            } else {
                statsBar.classList.remove('active-player');
            }
        }

        // Resource styling
        this.updateResourceDisplay(`${player}-gold`, data.gold);
        this.updateResourceDisplay(`${player}-energy`, data.energy);
        this.updateResourceDisplay(`${player}-hp`, data.hp, true);
    }

    updateCentralAttack() {
        const p1Atk = this.state.p1?.atk || 0;
        const p2Atk = this.state.p2?.atk || 0;
        let displayVal = Math.max(p1Atk, p2Atk);

        // Logic for phases
        if (this.state.phase === 'Defense') {
            // Show unblocked damage
            // In Defense, the active player is the DEFENDER.
            // But the attack value comes from the ATTACKER (inactive player).
            // We want to show (Attacker Atk) - (Defender Block).
            // However, `data.atk` is usually current player's accumulated attack.
            // We need `combat.atk` which is locked in for combat phase.
            // But combat object might not be fully populated until end of turn?
            // Actually, pyodide state should have combat info if in Defense.

            // Wait, let's use the simple heuristic:
            // If p1 is defending, p2 is attacking. Incoming = p2Atk.
            // But combat calculation is better if available.
            // Let's assume `p1Atk` / `p2Atk` reflects current board state.

            // During defense, blockers generate `blk`.
            // We want to show: Incoming Atk - Current Block.

            // Let's use `updateUI` logic:
            // The user says "resource attack div... should decrement".

            // Where to get Block value?
            // Block is sum of blocking units block value.
            const p1Blk = this.state.p1.units.reduce((sum, u) => sum + (u.blocking ? u.blk : 0), 0);
            const p2Blk = this.state.p2.units.reduce((sum, u) => sum + (u.blocking ? u.blk : 0), 0);

            if (this.state.currentPlayer === this.state.p1.name) {
                // P1 is defending against P2
                displayVal = Math.max(0, p2Atk - p1Blk);
            } else {
                // P2 is defending against P1
                displayVal = Math.max(0, p1Atk - p2Blk);
            }

        } else if (this.state.phase === 'Assignment') {
            const combat = this.state.combat;
            displayVal = Math.max(0, combat.atk - combat.blk - combat.assigned);
        }

        const atkEl = document.getElementById('central-atk');
        if (atkEl) {
            atkEl.textContent = displayVal;
            // Visual feedback if > 0
            if (displayVal > 0) {
                atkEl.parentElement.style.opacity = '1';
                atkEl.parentElement.style.borderColor = 'var(--accent-red)';
            } else {
                atkEl.parentElement.style.opacity = '0.5';
                atkEl.parentElement.style.borderColor = 'var(--glass-border)';
            }
        }
    }

    updateResourceDisplay(id, checkVal, isHp = false) {
        const el = document.getElementById(id);
        const oldVal = parseInt(el.textContent) || 0;
        el.textContent = checkVal;

        if (checkVal === 0) {
            el.classList.add('zero-resource');
        } else {
            el.classList.remove('zero-resource');
        }

        if (checkVal > oldVal) {
            el.classList.add('resource-bump');
            setTimeout(() => el.classList.remove('resource-bump'), 300);
        }
    }

    renderUnits(container, units, isFriendly) {
        container.innerHTML = '';

        // Group units by type
        const unitsByType = {};
        const typeOrder = ['miner', 'energizer', 'striker', 'guard', 'wall', 'overcharger', 'volatile', 'barrier'];

        units.forEach(unit => {
            if (!unit.isAlive) return;
            if (!unitsByType[unit.type]) {
                unitsByType[unit.type] = [];
            }
            unitsByType[unit.type].push(unit);
        });

        // Create columns for each unit type
        typeOrder.forEach(type => {
            if (!unitsByType[type] || unitsByType[type].length === 0) return;

            const column = document.createElement('div');
            column.className = 'unit-column';

            // interactiveIndex: The card that glows and handles clicks (bottom-most/front-most)
            let interactiveIndex = -1;
            for (let i = unitsByType[type].length - 1; i >= 0; i--) {
                const u = unitsByType[type][i];
                const isAssignmentPhase = !isFriendly && this.state.phase === 'Assignment';
                if (isAssignmentPhase) {
                    if (u.hp > 0) {
                        interactiveIndex = i;
                        break;
                    }
                } else {
                    if (!u.exhausted || (isFriendly && u.type === 'wall')) {
                        interactiveIndex = i;
                        break;
                    }
                }
            }

            // rotationIndex: The card that visually rotates/exhausts (top-most)
            let rotationIndex = -1;
            for (let i = 0; i < unitsByType[type].length; i++) {
                const u = unitsByType[type][i];
                if (!u.exhausted || (isFriendly && u.type === 'wall')) {
                    rotationIndex = i;
                    break;
                }
            }

            column.onmouseenter = () => {
                const interactiveCard = column.querySelector('.unit-card.interactive');
                if (interactiveCard) {
                    interactiveCard.classList.add('column-focus');
                }
            };
            column.onmouseleave = () => {
                const focused = column.querySelector('.column-focus');
                if (focused) focused.classList.remove('column-focus');
            };

            const interactiveUnit = interactiveIndex !== -1 ? unitsByType[type][interactiveIndex] : null;

            unitsByType[type].forEach((unit, indexInType) => {
                const card = document.createElement('div');
                const isAttacking = unit.attacking;
                const isBlocking = unit.blocking;
                const isExhausted = unit.exhausted;
                const unitNumber = indexInType + 1;

                card.className = `unit-card ${isExhausted ? 'exhausted' : ''} ${isAttacking ? 'attacking' : ''} ${isBlocking ? 'blocking' : ''}`;
                card.style.zIndex = indexInType;
                const imgUrl = this.unitImages[unit.type];

                card.innerHTML = `
                        <div class="unit-art" style="background-image: url('${imgUrl}')"></div>
                        ${isAttacking ? '<div class="combat-badge attacking">⚔️</div>' : ''}
                        ${isBlocking ? '<div class="combat-badge blocking">🛡️</div>' : ''}
                    `;

                // Hover Preview - available for all cards
                card.addEventListener('mouseenter', (e) => {
                    e.stopPropagation();
                    this.handleUnitMouseEnter(unit);
                }, { passive: true });
                card.addEventListener('mouseleave', (e) => {
                    e.stopPropagation();
                    this.handleUnitMouseLeave();
                }, { passive: true });

                // Interactive Glow (Bottom Card)
                if (indexInType === interactiveIndex) {
                    const canActInAction = isFriendly && this.state.phase === 'Action' && (!isExhausted || unit.type === 'wall');
                    const canBlockInDefense = isFriendly && !isExhausted && this.state.phase === 'Defense' && unit.blk > 0 && !isBlocking;
                    const canDamageInAssignment = !isFriendly && this.state.phase === 'Assignment' && unit.hp > 0;

                    if (canActInAction || canBlockInDefense || canDamageInAssignment) {
                        card.classList.add('interactive');
                    }
                }

                // Mark for rotation animation (Top Card)
                if (indexInType === rotationIndex) {
                    card.classList.add('rotation-target');
                    card.style.transformOrigin = 'top center';
                }

                card.dataset.type = type;
                card.dataset.unitNumber = unitNumber;

                column.appendChild(card);
            });

            const interactiveUnitNum = interactiveIndex + 1;
            const rotationUnitNum = rotationIndex + 1;

            // Set column level interaction
            if (interactiveUnit) {
                const isInteractiveAction = isFriendly && this.state.phase === 'Action' && (!interactiveUnit.exhausted || interactiveUnit.type === 'wall');
                const isInteractiveDefense = isFriendly && !interactiveUnit.exhausted && this.state.phase === 'Defense' && interactiveUnit.blk > 0 && !interactiveUnit.blocking;
                const isInteractiveAssignment = !isFriendly && this.state.phase === 'Assignment' && interactiveUnit.hp > 0;

                if (isInteractiveAction) {
                    column.onclick = () => this.handleUnitClick(interactiveUnit, rotationUnitNum, column);
                    column.style.cursor = 'pointer';
                } else if (isInteractiveDefense) {
                    column.onclick = () => this.handleBlock(interactiveUnit, rotationUnitNum);
                    column.style.cursor = 'pointer';
                } else if (isInteractiveAssignment) {
                    column.onclick = () => this.handleAssignDamage(interactiveUnit, interactiveUnitNum);
                    column.style.cursor = 'pointer';
                }
            }

            container.appendChild(column);
        });
    }

    updateActionButtons() {
        // In AI mode, we restrict actions to Player 1.
        // In HOTSEAT mode, we allow actions for whoever is the current player.

        let isMyTurn = false;
        const phase = this.state.phase;

        if (this.gameMode === 'HOTSEAT') {
            // In Hotseat, it's always "my turn" if I am the active human
            isMyTurn = true;
        } else {
            // In AI Mode, only Player 1 is human
            isMyTurn = this.state.currentPlayer === "Player 1";
        }

        // Special case for Assignment: Attacker acts, which might be P1 even if defender is current?
        // Actually engine logic usually switches "currentPlayer" context.
        // But let's keep the loose "Assignment" check for safety if legacy logic requires it.
        const canAct = isMyTurn || (this.gameMode !== 'HOTSEAT' && phase === 'Assignment' && this.state.p1.units.some(u => u.attacking));
        // Logic simplification: In Hotseat, canAct is always true effectively

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
            this.elements.btnEnd.textContent = `ATTACK BASE (${remaining})`;
            this.elements.btnEnd.classList.add('important');
        } else {
            this.elements.btnEnd.textContent = "END TURN";
            this.elements.btnEnd.classList.remove('important');
        }
    }

    // -- Game Actions --

    async handleUnitClick(unit, unitNumber, columnElement) {
        try {
            console.log("handleUnitClick", unit.type, unitNumber);
            if (this.targeting) {
                this.handleTargeting(unit, unitNumber);
                return;
            }

            // Action context
            const isP1Card = this.elements.p1Units.contains(columnElement);
            const isP1Turn = this.state.currentPlayer === this.state.p1.name;
            const isFriendly = (isP1Card && isP1Turn) || (!isP1Card && !isP1Turn);

            const canAct = this.state.phase === 'Action' && isFriendly;
            if (!canAct) {
                console.log("Cannot act: Phase", this.state.phase, "Friendly", isFriendly);
                return;
            }

            // Find the card to animate (the rotation-target)
            let animateCard = null;
            if (columnElement) {
                animateCard = columnElement.querySelector('.unit-card.rotation-target') || columnElement.querySelector('.unit-card.interactive');
                // FORCE SNAPPY: Remove transition temporarily
                if (animateCard) animateCard.style.transition = 'none';
            }
            // Units with attack value (striker, guard, volatile, overcharger) - auto-prepare for attack
            if (unit.atk > 0 && unit.type !== 'overcharger') {
                // Prepare this specific unit for attack
                const resultProxy = this.pyodide.runPython(`
                    # Find the actual unit object
                    unit_type = "${unit.type}"
                    unit_idx = ${unitNumber} - 1  # Convert to 0-based index
                    units_of_type = game.current_player.get_units_by_type(unit_type)
                    
                    if unit_idx < len(units_of_type):
                        target_unit = units_of_type[unit_idx]
                        if not target_unit.exhausted and target_unit.is_alive():
                            # Add to prepared squad (to attack next turn)
                            if target_unit not in engine.prepared_squad:
                                if game.current_player.energy >= target_unit.attack_cost:
                                    engine.prepared_squad.append(target_unit)
                                    game.current_player.energy -= target_unit.attack_cost
                                    target_unit.exhausted = True
                                    game.current_player.displayed_attack = sum(u.attack for u in engine.prepared_squad)
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
                        msg = f"Invalid ${unit.type} number"
                    
                    {"success": success, "msg": msg}
                `);
                const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
                resultProxy.destroy();

                if (result.success) {
                    if (animateCard) {
                        animateCard.classList.add('exhausting-animation');
                    }
                    this.sounds.play('PREPARE_ATTACK');
                    this.log(`${unit.name} #${unitNumber} prepared to attack!`, 'player1');
                } else {
                    this.log(`Error: ${result.msg}`, 'important');
                    this.sounds.play('ERROR');
                }
                this.syncState();
                this.updateUI();
                return;
            }

            // Resource generation units (miner, energizer, wall)
            if (unit.type === 'miner' || unit.type === 'energizer' || unit.type === 'wall') {
                const resultProxy = this.pyodide.runPython(`engine.use_ability("${unit.type}", ${unitNumber})`);
                await this.processActionResult(resultProxy, animateCard);
            } else if (unit.type === 'overcharger') {
                this.startTargeting(unit, unitNumber, animateCard);
            } else if (unit.type === 'volatile') {
                // Detonate volatile
                const resultProxy = this.pyodide.runPython(`engine.use_ability("${unit.type}", ${unitNumber})`);
                await this.processActionResult(resultProxy, animateCard);
            }
        } catch (e) {
            console.error("handleUnitClick error", e);
            this.log("Error interacting with unit: " + e.message, 'important');
        }
    }

    startTargeting(sourceUnit, sourceNumber) {
        this.targeting = { sourceUnit, sourceNumber };
        const currentPlayerName = this.state.currentPlayer;
        this.log(`Click a friendly unit to overcharge with Overcharger #${sourceNumber}`, 'system');

        // Temporarily change all current player's cards to targeting mode
        const friendlyArea = currentPlayerName === this.state.p1.name ? this.elements.p1Units : this.elements.p2Units;
        const friendlyCards = friendlyArea.querySelectorAll('.unit-card');

        friendlyCards.forEach((cardEl) => {
            const originalClass = cardEl.className;
            cardEl.style.border = '2px solid yellow';
            cardEl.onclick = (e) => {
                e.stopPropagation();
                const targetType = cardEl.dataset.type;
                const targetNum = cardEl.dataset.unitNumber;
                this.executeTargetedAbility(targetType, targetNum);
                // Restore cards
                this.updateUI();
            };
        });
    }

    executeTargetedAbility(targetType, targetNumber) {
        const { sourceUnit, sourceNumber } = this.targeting;
        this.pyodide.runPython(`
            source_type = "${sourceUnit.type}"
            source_num = ${sourceNumber}
            target_type = "${targetType}"
            target_idx = ${targetNumber}
            
            # Find the actual unit object in python
            target_unit = game.current_player.get_units_by_type(target_type)[int(target_idx)-1]
            success, msg = engine.use_ability(source_type, source_num, target=target_unit)
            {"success": success, "msg": msg}
        `);

        this.targeting = null;
        this.log(`Overcharged ${targetType} #${targetNumber}`, 'player1');
        this.sounds.play('ABILITY');
        this.syncState();
    }

    handleBlock(unit) {
        const result = this.pyodide.runPython(`engine.assign_blockers([("${unit.type}", 1)])`);
        this.sounds.play('BLOCK');
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
            units = defender.get_units_by_type(target_type)
            
            if 1 <= target_num <= len(units):
                target_unit = units[target_num-1]
                hp_needed = target_unit.current_health
                
                # Try to resolve combat for this unit
                success, msg = engine.resolve_combat([(target_type, hp_needed)])
            else:
                success = False
                msg = f"Invalid unit number {target_num}"
                
            {"success": success, "msg": msg}
        `);
        const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
        resultProxy.destroy();

        if (result.success) {
            this.log(`Destroyed ${unit.name} #${unitNumber}`, 'important');
            this.sounds.play('DESTROY');

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
        console.log("handleEndTurn called - Current Player:", this.state?.currentPlayer, "Phase:", this.state?.phase, "GameMode:", this.gameMode);

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

                    // In HOTSEAT mode, always let the human attacker assign
                    if (this.gameMode === 'HOTSEAT') {
                        this.log("BREACH! Click enemy units to assign damage.", "important");
                        this.syncState();
                        this.updateUI();
                        this.processingTurn = false;
                        this.elements.btnEnd.disabled = false;
                        this.elements.btnBuy.disabled = false;
                        return;
                    }

                    // AI mode logic
                    if (this.state.currentPlayer === 'Player 1') {
                        // AI attacked, Player 1 defended, now AI (Attacker) assigns
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
                        this.elements.btnEnd.disabled = false;
                        this.elements.btnBuy.disabled = false;
                        return;
                    }
                } else {
                    this.log(res.msg, "system");
                }

                this.syncState();
                this.updateUI();
                this.processingTurn = false;
                this.elements.btnEnd.disabled = false;
                this.elements.btnBuy.disabled = false;

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

                // Proceed with next player's Action phase
                this.processingTurn = false;

                // Only run AI action phase if in AI mode
                if (this.gameMode !== 'HOTSEAT') {
                    setTimeout(() => this.runAIActionPhase(), 100);
                } else {
                    this.log(`${this.state.currentPlayer}'s turn!`, "system");
                    this.updateUI();
                }

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

                // ===== HOTSEAT MODE =====
                if (this.gameMode === 'HOTSEAT') {
                    if (this.state.phase === 'Defense') {
                        // Opponent needs to defend (human player)
                        const incomingAtkProxy = this.pyodide.runPython(`sum(u.attack for u in engine.attacking_units)`);
                        const incomingAtk = incomingAtkProxy;
                        this.log(`🚨 INCOMING ATTACK! ${incomingAtk} damage. ${this.state.currentPlayer}, assign your blockers!`, "important");
                    } else {
                        // No attack, just Action phase
                        this.pyodide.runPython(`
                           if game.phase != "Action":
                               engine.action_phase()
                        `);
                        this.syncState();
                        this.log(`${this.state.currentPlayer}'s turn!`, "system");
                    }
                    this.updateUI();
                    this.processingTurn = false;
                    this.elements.btnEnd.disabled = false;
                    this.elements.btnBuy.disabled = false;
                    return;
                }

                // ===== AI MODE =====
                if (this.state.phase === 'Defense') {
                    // Player attacked - AI needs to defend
                    const incomingAtkProxy = this.pyodide.runPython(`sum(u.attack for u in engine.attacking_units)`);
                    const incomingAtk = incomingAtkProxy;
                    this.log(`🚨 INCOMING ATTACK! ${incomingAtk} damage aimed at AI.`, "important");
                    await new Promise(resolve => setTimeout(resolve, 800));

                    const defenseResultProxy = this.pyodide.runPython(`
                        # AI executes defense (blocking)
                        summary = ai.execute_turn(game, engine)
                        engine.finish_defense()
                        {"summary": summary, "phase": game.phase}
                    `);
                    const defenseResult = defenseResultProxy.toJs({ dict_converter: Object.fromEntries });
                    defenseResultProxy.destroy();

                    if (defenseResult.summary && defenseResult.summary.length > 0) {
                        this.log(`AI blocked with: ${defenseResult.summary.join(', ')}`, "opponent");
                    } else {
                        this.log("AI did not block.", "opponent");
                    }

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
            this.sounds.play('BUY');
            this.hideShop();
            this.syncState();
            this.updateUI();
        } else {
            this.sounds.play('ERROR');
            this.log(`Error: ${result.msg}`, 'important');
        }
    }

    async processActionResult(proxy, cardElement) {
        const result = proxy.toJs({ dict_converter: Object.fromEntries });
        proxy.destroy();
        if (result[0]) {
            if (cardElement) {
                cardElement.classList.add('exhausting-animation');
            }
            this.sounds.play('ABILITY');
            this.log(result[1], 'player1');

            this.syncState();
            this.updateUI();
            return true;
        } else {
            this.log(result[1], 'important');
            this.sounds.play('ERROR');
            return false;
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
            { id: 'barrier', name: 'Barrier', cost: 1, energyCost: 0, desc: 'Cheap and fragile' },
            { id: 'miner', name: 'Miner', cost: 2, energyCost: 0, desc: 'Produces Gold' },
            { id: 'energizer', name: 'Energizer', cost: 2, energyCost: 0, desc: 'Produces Energy' },
            { id: 'striker', name: 'Striker', cost: 3, energyCost: 0, desc: 'Strong attacker, cannot block' },
            { id: 'guard', name: 'Guard', cost: 3, energyCost: 0, desc: 'Basic unit.' },
            { id: 'wall', name: 'Wall', cost: 3, energyCost: 0, desc: 'Instant blocker.' },
            { id: 'overcharger', name: 'Repeater', cost: 3, energyCost: 1, desc: 'Unexhausts activated unit' },
            { id: 'volatile', name: 'Volatile', cost: 4, energyCost: 2, desc: 'Burst attack' }
        ];

        // Sort by cost ascending
        shopUnits.sort((a, b) => a.cost - b.cost);

        this.elements.shopGrid.innerHTML = '';

        // Determine affordability
        const player = (this.state.currentPlayer === this.state.p1.name) ? this.state.p1 : this.state.p2;
        const currentGold = player.gold;
        const currentEnergy = player.energy;
        // 2nd unit purchased costs +1 Energy
        const penalty = (player.purchased === 1) ? 1 : 0;
        const unitsBought = player.purchased;

        shopUnits.forEach(u => {
            const item = document.createElement('div');
            item.className = 'shop-list-item';

            // Check affordability logic matching python
            const unitEnergyCost = u.energyCost || 0;
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

            // Build cost display
            let costDisplay = `${u.cost}💰`;
            if (unitEnergyCost > 0) {
                costDisplay += ` ${unitEnergyCost}⚡`;
            }
            if (penalty > 0) {
                costDisplay += ` ${penalty}⚡`;
            }

            item.innerHTML = `
                <div class="shop-item-info">
                   <div class="shop-item-main">
                      <span class="unit-cost">${costDisplay}</span>
                      <span class="unit-name">${u.name}</span>
                       ${!affordable ? `<span class="unit-xs-reason">${reason}</span>` : ''}
                   </div>
                   <div class="shop-item-desc">${u.desc}</div>
                </div>
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

        this.sounds.play('SHOP_OPEN');
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
                    res_msg = f"INCOMING: ${total_atk}"
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

    // -- Unit Preview --

    handleUnitMouseEnter(unit) {
        if (this.hoverTimeout) clearTimeout(this.hoverTimeout);

        this.hoverTimeout = setTimeout(() => {
            this.updateUnitPreview(unit);
            this.elements.unitPreview.classList.remove('hidden');
        }, 400);
    }

    handleUnitMouseLeave() {
        if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
        this.elements.unitPreview.classList.add('hidden');
    }

    updateUnitPreview(unit) {
        const preview = this.elements.unitPreview;
        const nameEl = preview.querySelector('.preview-name');
        const artEl = preview.querySelector('.preview-art');
        const statsEl = preview.querySelector('.preview-stats');
        const descEl = preview.querySelector('.preview-desc');

        nameEl.textContent = unit.type.charAt(0).toUpperCase() + unit.type.slice(1);
        artEl.style.backgroundImage = `url('${this.unitImages[unit.type]}')`;

        // Stats
        statsEl.innerHTML = `
            <span class="stat hp">❤️ ${unit.hp}</span>
            <span class="stat atk">⚔️ ${unit.atk}</span>
            <span class="stat blk">🛡️ ${unit.blk}</span>
        `;

        // Descriptions (Static for now, could be pulled from Python)
        const descriptions = {
            'barrier': 'Cheap and fragile',
            'miner': 'Produces Gold',
            'energizer': 'Produces Energy',
            'striker': 'Strong attacker, cannot block',
            'guard': 'Basic unit.',
            'wall': 'Instant blocker.',
            'overcharger': 'Unexhausts activated unit',
            'repeater': 'Unexhausts activated unit',
            'volatile': 'Burst attack'
        };
        descEl.textContent = descriptions[unit.type] || 'A strategic unit.';
    }

    // -- Debugging --

    setupConsoleDebug() {
        console.log("%c BUILD ORDER DEBUG CONSOLE ", "background: #bd00ff; color: white; font-weight: bold; padding: 5px;");
        console.log("Commands available:");
        console.log(" - restartGame()");
        console.log(" - addGold(n)");
        console.log(" - addEnergy(n)");
        console.log(" - addAttack(n)");

        window.restartGame = () => {
            console.log("Restarting game...");
            this.setupGame();
            this.syncState();
            this.updateUI();
            this.log("Game restarted manually.", "system");
        };

        window.addGold = (n) => {
            this.pyodide.runPython(`game.player1.gold += ${n}`);
            this.syncState();
            this.updateUI();
            console.log(`Added ${n} Gold.`);
        };

        window.addEnergy = (n) => {
            this.pyodide.runPython(`game.player1.energy += ${n}`);
            this.syncState();
            this.updateUI();
            console.log(`Added ${n} Energy.`);
        };

        window.addAttack = (n) => {
            this.pyodide.runPython(`game.player1.displayed_attack += ${n}`);
            this.syncState();
            this.updateUI();
            console.log(`Added ${n} Attack power (UI only, use properly for logic).`);
        };
    }

    bindEvents() {
        // Main Game Buttons
        this.elements.btnEnd.onclick = () => this.handleEndTurn();
        this.elements.btnBuy.onclick = () => this.handleBuy();

        // Global Event Delegation for Menu Buttons (Robustness Fix)
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            if (target.id === 'btn-pve') {
                console.log("PvE Mode Selected via Delegation");
                this.gameMode = 'AI';
                this.elements.welcomeScreen.classList.add('hidden');
                this.showAISelection();
            } else if (target.id === 'btn-pvp') {
                console.log("PvP Mode Selected via Delegation");
                this.gameMode = 'HOTSEAT';
                this.selectedAI = 'Human';
                this.elements.welcomeScreen.classList.add('hidden');
                this.startGame();
            }
        });

        // Initialize Log Toggle
        this.elements.btnLogToggle.onclick = () => {
            if (!this.elements.combatLogWrapper) return;
            this.elements.combatLog.classList.toggle('expanded');
            const isExpanded = this.elements.combatLog.classList.contains('expanded');
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

        // Settings
        this.elements.btnSettings.onclick = () => {
            this.elements.settingsModal.classList.remove('hidden');
        };

        this.elements.closeSettings.onclick = () => {
            this.elements.settingsModal.classList.add('hidden');
        };

        this.elements.btnRestart.onclick = () => {
            this.sounds.play('CLICK');
            this.elements.settingsModal.classList.add('hidden');
            this.resetGame();
            this.log("Game restarted.", "system");
        };

        const btnExitMenu = document.getElementById('btn-exit-menu');
        if (btnExitMenu) {
            btnExitMenu.onclick = () => {
                this.sounds.play('CLICK');
                this.elements.settingsModal.classList.add('hidden');
                this.elements.app.classList.add('hidden');
                this.elements.welcomeScreen.classList.remove('hidden');
                this.log("Exited to Main Menu", "system");
            };
        }

        this.elements.sliderMusic.oninput = (e) => {
            this.sounds.setMusicVolume(e.target.value / 100);
        };

        this.elements.sliderSFX.oninput = (e) => {
            this.sounds.setSFXVolume(e.target.value / 100);
        };
    }
}


/**
 * Sound Manager for Prismata Lite
 */
class SoundManager {
    constructor() {
        this.enabled = true;
        this.basePath = 'assets/sounds/';
        this.sfxVolume = 0.5;
        this.musicVolume = 0.0;
        this.sounds = {
            'CLICK': 'click.mp3',
            'BUY': 'buy.mp3',
            'PREPARE_ATTACK': 'attack_prep.mp3',
            'ABILITY': 'ability.mp3',
            'BLOCK': 'block.mp3',
            'DESTROY': 'destroy.mp3',
            'END_TURN': 'end_turn.mp3',
            'BREACH': 'breach.mp3',
            'ERROR': 'error.mp3',
            'VICTORY': 'victory.mp3',
            'DEFEAT': 'defeat.mp3',
            'SHOP_OPEN': 'shop_open.mp3'
        };

        this.bgMusic = null;
    }

    setMusicVolume(v) {
        this.musicVolume = v;
        if (this.bgMusic) this.bgMusic.volume = v;
    }

    setSFXVolume(v) {
        this.sfxVolume = v;
    }

    play(name) {
        if (!this.enabled || !this.sounds[name]) return;

        const audio = new Audio(this.basePath + this.sounds[name]);
        audio.volume = this.sfxVolume;
        audio.play().catch(e => console.log("Audio playback blocked by browser"));
    }

    startMusic(src = 'music_loop.mp3') {
        if (this.bgMusic) this.bgMusic.pause();

        this.bgMusic = new Audio(this.basePath + src);
        this.bgMusic.loop = true;
        this.bgMusic.volume = this.musicVolume;
        this.bgMusic.play().catch(e => console.log("Music playback blocked until user interaction"));
    }
}

// Start
const game = new PrismataWeb();
window.addEventListener('load', () => game.init());
