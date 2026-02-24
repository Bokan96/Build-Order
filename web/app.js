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
        this.gameMode = 'AI'; // 'AI', 'HOTSEAT', or 'ONLINE'
        this.processingTurn = false;

        // Online multiplayer state
        this.multiplayer = new MultiplayerManager();
        this.isHost = false;
        this.isRemoteAction = false; // true when replaying a remote action

        // UI Elements
        this.elements = {
            loadingOverlay: document.getElementById('loading-overlay'),
            welcomeScreen: document.getElementById('welcome-screen'),
            aiSelectionScreen: document.getElementById('ai-selection-screen'),
            onlineLobbyScreen: document.getElementById('online-lobby-screen'),
            disconnectModal: document.getElementById('disconnect-modal'),
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
            unitPreview: document.getElementById('unit-preview'),
            endgameModal: document.getElementById('endgame-modal'),
            endgameWinner: document.getElementById('endgame-winner'),
            endgameTurns: document.getElementById('endgame-turns'),
            endgameUnits: document.getElementById('endgame-units'),
            endgameGold: document.getElementById('endgame-gold'),
            endgameEnergy: document.getElementById('endgame-energy'),
            btnEndgameMenu: document.getElementById('btn-endgame-main-menu')
        };

        this.hoverTimeout = null;

        this.unitIcons = {
            'miner': '👷',
            'energizer': '🔋',
            'striker': '⚔️',
            'guard': '🛡️',
            'wall': '🧱',
            'repeater': '🔋',
            'volatile': '🧨',
            'barrier': '🚧'
        };

        this.unitImages = {
            'miner': 'assets/cards/Miner.webp',
            'energizer': 'assets/cards/Energizer.webp',
            'striker': 'assets/cards/Striker.webp',
            'guard': 'assets/cards/Guard.webp',
            'wall': 'assets/cards/Wall.webp',
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

    showOnlineLobby() {
        this.elements.welcomeScreen.classList.add('hidden');
        this.elements.onlineLobbyScreen.classList.remove('hidden');

        const lobbyChoice = document.getElementById('lobby-choice');
        const lobbyCreate = document.getElementById('lobby-create');
        const lobbyJoin = document.getElementById('lobby-join');
        const lobbyStatus = document.getElementById('lobby-status');

        // Reset to initial state
        lobbyChoice.classList.remove('hidden');
        lobbyCreate.classList.add('hidden');
        lobbyJoin.classList.add('hidden');
        lobbyStatus.classList.add('hidden');
        lobbyStatus.className = 'lobby-status hidden';

        const updateStatus = (state, msg) => {
            lobbyStatus.classList.remove('hidden', 'connecting', 'waiting', 'connected', 'error');
            lobbyStatus.classList.add(state);
            lobbyStatus.querySelector('.status-text').textContent = msg;
        };

        this.multiplayer.onStateChange((state, detail) => {
            updateStatus(state, detail);

            if (state === 'connected') {
                // Brief delay, then start game
                setTimeout(() => {
                    this.gameMode = 'ONLINE';
                    this.isHost = this.multiplayer.isHost;
                    this.selectedAI = null;
                    this.setupMultiplayerCallbacks();
                    this.elements.onlineLobbyScreen.classList.add('hidden');
                    this.startGame();
                }, 800);
            }
        });

        this.multiplayer.onError((msg) => {
            updateStatus('error', msg);
        });

        // Create Room
        document.getElementById('btn-create-room').onclick = async () => {
            lobbyChoice.classList.add('hidden');
            lobbyCreate.classList.remove('hidden');
            this.sounds.play('CLICK');

            try {
                const code = await this.multiplayer.createRoom();
                document.getElementById('room-code-text').textContent = code;
            } catch (e) {
                console.error('Failed to create room:', e);
            }
        };

        // Copy code
        document.getElementById('btn-copy-code').onclick = () => {
            const code = document.getElementById('room-code-text').textContent;
            navigator.clipboard.writeText(code).then(() => {
                const btn = document.getElementById('btn-copy-code');
                btn.textContent = '✅';
                setTimeout(() => btn.textContent = '📋', 1500);
            });
            this.sounds.play('CLICK');
        };

        // Join Room
        document.getElementById('btn-join-room').onclick = () => {
            lobbyChoice.classList.add('hidden');
            lobbyJoin.classList.remove('hidden');
            this.sounds.play('CLICK');
            document.getElementById('join-code-input').focus();
        };

        // Connect button
        document.getElementById('btn-connect').onclick = async () => {
            const code = document.getElementById('join-code-input').value.trim();
            if (!code) return;
            this.sounds.play('CLICK');

            try {
                await this.multiplayer.joinRoom(code);
            } catch (e) {
                console.error('Failed to join room:', e);
            }
        };

        // Enter key in input
        document.getElementById('join-code-input').onkeydown = (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-connect').click();
            }
        };

        // Back button
        document.getElementById('btn-back-to-menu-lobby').onclick = () => {
            this.sounds.play('CLICK');
            this.multiplayer.disconnect();
            this.elements.onlineLobbyScreen.classList.add('hidden');
            this.elements.welcomeScreen.classList.remove('hidden');
        };
    }

    setupMultiplayerCallbacks() {
        this.multiplayer.onAction((action) => {
            console.log('[Online] Received remote action:', action);
            this.receiveRemoteAction(action);
        });

        this.multiplayer.onStateChange((state, detail) => {
            if (state === 'disconnected' && this.gameMode === 'ONLINE') {
                // Show disconnect modal
                if (this.elements.disconnectModal) {
                    this.elements.disconnectModal.classList.remove('hidden');
                }
            }
        });

        // Disconnect modal button
        const btnDisconnectMenu = document.getElementById('btn-disconnect-menu');
        if (btnDisconnectMenu) {
            btnDisconnectMenu.onclick = () => {
                this.sounds.play('CLICK');
                this.elements.disconnectModal.classList.add('hidden');
                this.multiplayer.disconnect();
                this.elements.app.classList.add('hidden');
                this.elements.welcomeScreen.classList.remove('hidden');
            };
        }
    }

    receiveRemoteAction(action) {
        this.isRemoteAction = true;

        try {
            switch (action.type) {
                case 'buy':
                    // Call engine directly — bypasses shop UI guards
                    this.pyodide.runPython(`engine.buy_unit("${action.unitType}")`);
                    this.log(`Opponent bought ${action.unitType}`, 'opponent');
                    this.syncState();
                    this.updateUI();
                    break;

                case 'ability':
                    if (action.atk > 0 && action.unitType !== 'repeater') {
                        // Attack preparation — call engine directly
                        this.pyodide.runPython(`
                            unit_type = "${action.unitType}"
                            unit_idx = ${action.unitNumber} - 1
                            units_of_type = game.current_player.get_units_by_type(unit_type)
                            if unit_idx < len(units_of_type):
                                target_unit = units_of_type[unit_idx]
                                if not target_unit.exhausted and target_unit.is_alive():
                                    if target_unit not in engine.prepared_squad:
                                        if game.current_player.energy >= target_unit.attack_cost:
                                            engine.prepared_squad.append(target_unit)
                                            game.current_player.energy -= target_unit.attack_cost
                                            target_unit.exhausted = True
                                            if target_unit.name == "Volatile":
                                                target_unit.take_damage(99)
                                                game.current_player.remove_dead_units()
                                            game.current_player.displayed_attack = sum(u.attack for u in engine.prepared_squad)
                        `);
                    } else {
                        // Resource units (miner, energizer, wall) or volatile
                        this.pyodide.runPython(`engine.use_ability("${action.unitType}", ${action.unitNumber})`);
                    }
                    this.syncState();
                    this.updateUI();
                    break;

                case 'block':
                    // Call engine directly
                    this.pyodide.runPython(`engine.assign_blockers([("${action.unitType}", 1)])`);
                    this.syncState();
                    this.updateUI();
                    break;

                case 'breach': {
                    // Call engine directly
                    const isP1Target = action.isP1Target;
                    this.pyodide.runPython(`
                        target_type = "${action.unitType}"
                        target_num = ${action.unitNumber}
                        defender_is_p1 = ${isP1Target ? 'True' : 'False'}
                        defender = game.player1 if defender_is_p1 else game.player2
                        units = defender.get_units_by_type(target_type)
                        if 1 <= target_num <= len(units):
                            target_unit = units[target_num-1]
                            hp_needed = target_unit.current_health
                            engine.resolve_combat([(target_type, hp_needed)])
                    `);
                    this.syncState();

                    // Check if breach is finished
                    const combat = this.state.combat;
                    const remaining = (combat.atk - combat.blk) - combat.assigned;
                    if (remaining <= 0) {
                        this.handleEndTurn();
                    } else {
                        this.updateUI();
                    }
                    break;
                }

                case 'endTurn':
                    this.handleEndTurn();
                    break;

                case 'repeaterTarget':
                    // Call engine directly with source and target
                    this.pyodide.runPython(`
                        target_unit = game.current_player.get_units_by_type("${action.targetType}")[int(${action.targetNumber})-1]
                        engine.use_ability("repeater", ${action.sourceNumber}, target=target_unit)
                    `);
                    this.syncState();
                    this.updateUI();
                    break;

                default:
                    console.warn('[Online] Unknown action type:', action.type);
            }
        } catch (e) {
            console.error('[Online] Error replaying remote action:', e);
        }

        this.isRemoteAction = false;
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
        this.elements.onlineLobbyScreen.classList.add('hidden');
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
                    document.body.classList.remove('hotseat-mode', 'online-mode');
                    this.log(`Game Initialized. Battling ${this.selectedAI} AI.`, "system");
                } else if (this.gameMode === 'ONLINE') {
                    document.body.classList.add('online-mode');
                    document.body.classList.remove('ai-mode', 'hotseat-mode');
                    const role = this.isHost ? 'Player 1 (Host)' : 'Player 2 (Guest)';
                    this.log(`Online game started! You are ${role}.`, "system");
                } else {
                    document.body.classList.add('hotseat-mode');
                    document.body.classList.remove('ai-mode', 'online-mode');
                    this.log("Local Multiplayer Mode Started.", "system");
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
        const p2Name = (this.gameMode === 'HOTSEAT' || this.gameMode === 'ONLINE') ? "Player 2" : "AI";
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
                        "repeater": 7, "barrier": 8
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

        // Hotfix: For Breach phase, UI should treat Attacker as active player
        // This ensures proper interaction targeting (Attacker clicks Defender units)
        if (this.state.phase === 'Breach') {
            const defender = this.state.currentPlayer;
            this.state.currentPlayer = defender === 'Player 1' ? 'Player 2' : 'Player 1';
        }
    }

    updateUI() {
        if (!this.state) return;

        if (this.state.gameOver) {
            this.state.gameOver = false; // Prevent logic loop or manage appropriately
            this.showEndGameScreen();
        }

        // Update Header
        document.getElementById('turn-count').textContent = this.state.turn;
        document.getElementById('phase-name').textContent = this.state.phase.toUpperCase();
        document.getElementById('player-name-display').textContent = this.state.currentPlayer.toUpperCase();

        // Update Tab Title
        const playerShort = this.state.currentPlayer === 'Player 1' ? 'P1' : (this.state.currentPlayer === 'Player 2' ? 'P2' : this.state.currentPlayer);
        const phaseEmojis = {
            'Start': '🏁',
            'Action': '🧭',
            'Block': '🛡️',
            'Breach': '⚔️',
            'End': '⌛',
            'GameOver': '🏆'
        };
        const emoji = phaseEmojis[this.state.phase] || (this.state.gameOver ? '🏆' : '🎮');
        document.title = `Build Order | ${playerShort} ${this.state.phase} ${emoji}`;

        // Update Stats
        this.updatePlayerStats('p1', this.state.p1);
        this.updatePlayerStats('p2', this.state.p2);

        // Render Units
        // In AI mode, P1 is always friendly, P2 is AI.
        // In HOTSEAT mode, 'isFriendly' depends on who is the 'currentPlayer' in the state.
        const p1Name = this.state.p1.name;
        const p2Name = this.state.p2.name;
        const isP1Turn = this.state.currentPlayer === p1Name;

        // In AI mode, P2 (AI) is never 'friendly' (interactable) for the user
        const isHotseat = this.gameMode === 'HOTSEAT';
        const isOnline = this.gameMode === 'ONLINE';
        let p1IsFriendly = isP1Turn;
        let p2IsFriendly = isHotseat ? !isP1Turn : false;

        // In Online mode, only YOUR side is interactive
        if (isOnline) {
            if (this.isHost) {
                p1IsFriendly = isP1Turn;
                p2IsFriendly = false;
            } else {
                p1IsFriendly = false;
                p2IsFriendly = !isP1Turn;
            }
            // During Breach phase, the attacker gets to interact with enemy units
            // This is handled by the existing canDamageInBreach logic in renderUnits
        }

        this.renderUnits(this.elements.p1Units, this.state.p1.units, p1IsFriendly);
        this.renderUnits(this.elements.p2Units, this.state.p2.units, p2IsFriendly);

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
        const combat = this.state.combat;
        const p1Atk = this.state.p1?.atk || 0;
        const p2Atk = this.state.p2?.atk || 0;
        let displayVal = Math.max(p1Atk, p2Atk);

        // Logic for phases
        if (this.state.phase === 'Block' && combat) {
            displayVal = Math.max(0, combat.atk - combat.blk);
        } else if (this.state.phase === 'Breach' && combat) {
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
                atkEl.parentElement.style.opacity = '1';
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
            setTimeout(() => el.classList.remove('resource-bump'), 600);
        } else if (checkVal < oldVal) {
            el.classList.add('resource-drop');
            setTimeout(() => el.classList.remove('resource-drop'), 600);
        }
    }

    renderUnits(container, units, isFriendly) {
        container.innerHTML = '';
        const isP1Units = container.id === 'p1-units';

        // Group units by type
        const unitsByType = {};
        const typeOrder = ['miner', 'energizer', 'striker', 'guard', 'wall', 'repeater', 'volatile', 'barrier'];

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
                const isBreachPhase = !isFriendly && this.state.phase === 'Breach';
                if (isBreachPhase) {
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
            const rotationUnitNum = rotationIndex + 1;

            unitsByType[type].forEach((unit, indexInType) => {
                const card = document.createElement('div');
                const isAttacking = unit.attacking;
                const isBlocking = unit.blocking;
                const isExhausted = unit.exhausted;
                const unitNumber = indexInType + 1;

                card.className = `unit-card ${isExhausted ? 'exhausted' : ''} ${isAttacking ? 'attacking' : ''} ${isBlocking ? 'blocking' : ''}`;
                card.style.zIndex = indexInType;
                const imgUrl = this.unitImages[unit.type];

                // Lethal/Safe Overlay (Breach Phase)
                let overlayHtml = '';
                if (this.state.phase === 'Breach' && !isFriendly && unit.hp > 0) {
                    const combat = this.state.combat;
                    const remaining = Math.max(0, combat.atk - combat.blk - combat.assigned);
                    if (unit.hp <= remaining) {
                        const rotateFix = isExhausted ? 'transform: rotate(-90deg);' : '';
                        overlayHtml = `<div class="lethal-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(255, 68, 68, 0.4);color:white;display:flex;align-items:center;justify-content:center;z-index:20;text-shadow: 0 0 10px black;pointer-events:none;user-select:none;"><span style="${rotateFix} display:flex;flex-direction:column;align-items:center;"><span style="font-size:3rem;line-height:1;">💔</span><span style="font-size:1.5rem;font-weight:bold;margin-top:-5px;text-shadow:0 2px 4px black;">${unit.hp}</span></span></div>`;
                        card.classList.add('lethal-target');
                    }
                }

                card.innerHTML = `
                        <div class="unit-art" style="background-image: url('${imgUrl}')"></div>
                        ${isAttacking ? '<div class="combat-badge attacking">⚔️</div>' : ''}
                        ${isBlocking ? '<div class="combat-badge blocking">🛡️</div>' : ''}
                        ${overlayHtml}
                    `;

                // Hover Preview - available for all cards
                card.addEventListener('mouseenter', (e) => {
                    e.stopPropagation();
                    this.handleUnitMouseEnter(unit, e);

                    // Lift effect
                    if (card.classList.contains('interactive')) {
                        card.classList.add('column-focus');
                    }
                }, { passive: true });

                card.addEventListener('mouseleave', (e) => {
                    e.stopPropagation();
                    this.handleUnitMouseLeave();
                    card.classList.remove('column-focus');
                }, { passive: true });

                // Interaction Logic
                const canActInAction = isFriendly && this.state.phase === 'Action' && (!isExhausted || unit.type === 'wall');
                const canBlockInBlock = isFriendly && !isExhausted && this.state.phase === 'Block' && unit.blk > 0 && !isBlocking;
                const canDamageInBreach = !isFriendly && this.state.phase === 'Breach' && unit.hp > 0;

                let isInteractive = false;

                if (indexInType === interactiveIndex) {
                    // Action/Block Restricted to Top Card
                    if (canActInAction || canBlockInBlock) {
                        isInteractive = true;
                    }
                }

                // Breach allows ANY unit (ignore interactiveIndex)
                if (canDamageInBreach) {
                    isInteractive = true;
                }

                if (isInteractive) {
                    card.classList.add('interactive');
                    card.style.cursor = 'pointer';

                    card.onclick = (e) => {
                        e.stopPropagation();
                        if (canActInAction) {
                            this.handleUnitClick(unit, rotationUnitNum, column);
                        } else if (canBlockInBlock) {
                            this.handleBlock(unit);
                        } else if (canDamageInBreach) {
                            this.handleAssignDamage(unit, unitNumber, isP1Units, column);
                        }
                    };
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

            container.appendChild(column);
        });
    }

    updateActionButtons() {
        // In AI mode, we restrict actions to Player 1.
        // In HOTSEAT mode, we allow actions for whoever is the current player.
        // In ONLINE mode, only the local player's turn is interactive.

        let isMyTurn = false;
        const phase = this.state.phase;

        if (this.gameMode === 'HOTSEAT') {
            // In Hotseat, it's always "my turn" if I am the active human
            isMyTurn = true;
        } else if (this.gameMode === 'ONLINE') {
            // In Online mode, check if it's the local player's turn
            if (this.isHost) {
                isMyTurn = this.state.currentPlayer === 'Player 1';
            } else {
                isMyTurn = this.state.currentPlayer === 'Player 2';
            }
        } else {
            // In AI Mode, only Player 1 is human
            isMyTurn = this.state.currentPlayer === "Player 1";
        }

        // Special case for Breach: Attacker acts, which might be P1 even if defender is current?
        // Actually engine logic usually switches "currentPlayer" context.
        // But let's keep the loose "Breach" check for safety if legacy logic requires it.
        const canAct = isMyTurn || (this.gameMode !== 'HOTSEAT' && this.gameMode !== 'ONLINE' && phase === 'Breach' && this.state.p1.units.some(u => u.attacking));
        // Logic simplification: In Hotseat, canAct is always true effectively

        this.elements.btnEnd.disabled = !canAct;
        this.elements.btnBuy.disabled = !isMyTurn || phase === 'Block' || phase === 'Breach';

        // Hide buttons completely when cannot act
        if (!canAct) {
            this.elements.btnEnd.style.opacity = '0.3';
            this.elements.btnBuy.style.opacity = '0.3';
        } else {
            this.elements.btnEnd.style.opacity = '1';
            this.elements.btnBuy.style.opacity = '1';
        }

        if (phase === 'Block') {
            this.elements.btnEnd.textContent = "FINISH BLOCKING";
            this.elements.btnEnd.classList.add('important');
        } else if (phase === 'Breach') {
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
                // If we're in targeting mode, ignore clicks that come through the normal path
                // (targeting onclick handlers are set up by startTargeting)
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
            if (unit.atk > 0 && unit.type !== 'repeater') {
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
                                    if target_unit.name == "Volatile":
                                        target_unit.take_damage(99)
                                        game.current_player.remove_dead_units()
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

                    // Send to remote player
                    if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                        this.multiplayer.sendAction({ type: 'ability', unitType: unit.type, unitNumber, atk: unit.atk, unitName: unit.name });
                    }
                } else {
                    this.log(`Error: ${result.msg}`, 'important');
                    this.sounds.play('ERROR');

                    if (result.msg.includes("energy")) {
                        const energyEl = document.getElementById(isP1Turn ? 'p1-energy' : 'p2-energy');
                        if (energyEl && energyEl.parentElement) {
                            energyEl.parentElement.classList.add('error-bump');
                            setTimeout(() => energyEl.parentElement.classList.remove('error-bump'), 600);
                        }
                    }
                }
                this.syncState();
                this.updateUI();
                return;
            }

            // Resource generation units (miner, energizer, wall)
            if (unit.type === 'miner' || unit.type === 'energizer' || unit.type === 'wall') {
                const resultProxy = this.pyodide.runPython(`engine.use_ability("${unit.type}", ${unitNumber})`);
                const abilitySuccess = await this.processActionResult(resultProxy, animateCard);

                // Send to remote player
                if (abilitySuccess && this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                    this.multiplayer.sendAction({ type: 'ability', unitType: unit.type, unitNumber, atk: unit.atk, unitName: unit.name });
                }
            } else if (unit.type === 'repeater') {
                // Check energy from Python state directly to avoid desync
                const currentPlayerName = this.state.currentPlayer;
                const pyEnergy = this.pyodide.runPython(`game.current_player.energy`);
                if (pyEnergy < 1) {
                    this.log("Not enough energy to use Repeater (needs 1🔋)", "important");
                    this.sounds.play('ERROR');
                    const energyEl = document.getElementById(currentPlayerName === this.state.p1.name ? 'p1-energy' : 'p2-energy');
                    if (energyEl && energyEl.parentElement) {
                        energyEl.parentElement.classList.add('error-bump');
                        setTimeout(() => energyEl.parentElement.classList.remove('error-bump'), 600);
                    }
                    if (animateCard) {
                        animateCard.classList.add('shake-animation');
                        setTimeout(() => animateCard.classList.remove('shake-animation'), 600);
                    }
                    // Re-sync JS state in case it was stale
                    this.syncState();
                    this.updateUI();
                } else {
                    this.startTargeting(unit, unitNumber, animateCard);
                }
            } else if (unit.type === 'volatile') {
                // Detonate volatile
                const resultProxy = this.pyodide.runPython(`engine.use_ability("${unit.type}", ${unitNumber})`);
                const volSuccess = await this.processActionResult(resultProxy, animateCard);

                // Send to remote player
                if (volSuccess && this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                    this.multiplayer.sendAction({ type: 'ability', unitType: unit.type, unitNumber, atk: unit.atk, unitName: unit.name });
                }
            }
        } catch (e) {
            console.error("handleUnitClick error", e);
            this.log("Error interacting with unit: " + e.message, 'important');
        }
    }

    startTargeting(sourceUnit, sourceNumber, animateCard) {
        this.targeting = { sourceUnit, sourceNumber, animateCard };
        const currentPlayerName = this.state.currentPlayer;
        this.log(`Click a friendly unit to unexhaust with Repeater #${sourceNumber}. Click Repeater again to cancel.`, 'system');

        if (animateCard) {
            animateCard.style.transform = 'scale(1.1)';
            animateCard.style.zIndex = '100';
            animateCard.style.transition = 'transform 0.2s';
        }

        const friendlyArea = currentPlayerName === this.state.p1.name ? this.elements.p1Units : this.elements.p2Units;
        friendlyArea.classList.add('targeting-mode');
        const columns = friendlyArea.querySelectorAll('.unit-column');

        columns.forEach((columnEl) => {
            const cards = Array.from(columnEl.querySelectorAll('.unit-card'));
            if (cards.length === 0) return;

            const colType = cards[0].dataset.type;
            const isSelfColumn = colType === sourceUnit.type;

            // Find first exhausted card in this column (the target we'll unexhaust)
            const firstExhausted = cards.find(c => c.classList.contains('exhausted'));
            const hasExhausted = !!firstExhausted;
            const firstExhaustedNum = firstExhausted ? firstExhausted.dataset.unitNumber : null;

            // Style each card using outline+filter to avoid fighting CSS !important on box-shadow/border
            cards.forEach((cardEl) => {
                const isExhausted = cardEl.classList.contains('exhausted');
                if (isSelfColumn) {
                    cardEl.style.outline = '2px solid rgba(255, 68, 68, 0.9)';
                    cardEl.style.filter = isExhausted
                        ? 'drop-shadow(0 0 8px rgba(255,0,0,0.7)) grayscale(1) brightness(0.7)'
                        : 'drop-shadow(0 0 8px rgba(255,0,0,0.7))';
                } else if (isExhausted) {
                    cardEl.style.outline = '2px solid rgba(0, 255, 0, 0.9)';
                    cardEl.style.filter = 'drop-shadow(0 0 10px rgba(0,255,0,0.8)) grayscale(1) brightness(0.85)';
                } else if (hasExhausted) {
                    // Non-exhausted card in a valid-target column: soft glow
                    cardEl.style.outline = '2px solid rgba(0, 255, 0, 0.5)';
                    cardEl.style.filter = 'drop-shadow(0 0 6px rgba(0,255,0,0.4))';
                } else {
                    cardEl.style.opacity = '0.35';
                }
            });

            // THE KEY FIX: The top card (last in DOM, highest z-index) intercepts all clicks.
            // We must override ITS onclick so the targeting action fires, regardless of
            // whether it's exhausted or not. Without this, stopPropagation on the
            // interactive card's onclick blocks column-level handlers from ever firing.
            const topCard = cards[cards.length - 1];

            if (isSelfColumn) {
                columnEl.style.cursor = 'pointer';
                // Override top card onclick to cancel
                topCard.onclick = (e) => {
                    e.stopPropagation();
                    this.cancelTargeting();
                };
            } else if (hasExhausted) {
                columnEl.style.cursor = 'pointer';
                // Override top card onclick to execute ability
                topCard.onclick = (e) => {
                    e.stopPropagation();
                    this.executeTargetedAbility(colType, firstExhaustedNum);
                };
                // Column fallback for clicks in the gap between cards
                columnEl.onclick = (e) => {
                    e.stopPropagation();
                    this.executeTargetedAbility(colType, firstExhaustedNum);
                };
            } else {
                columnEl.style.cursor = 'not-allowed';
                topCard.onclick = (e) => { e.stopPropagation(); };
            }
        });

        // Add a cancel button in the action bar
        const mainBtns = document.querySelector('.main-buttons');
        if (mainBtns && !document.getElementById('btn-cancel-target')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'btn-cancel-target';
            cancelBtn.className = 'action-btn danger';
            cancelBtn.textContent = 'CANCEL';
            cancelBtn.onclick = () => this.cancelTargeting();
            mainBtns.insertBefore(cancelBtn, mainBtns.firstChild);
        }
    }

    cancelTargeting() {
        if (!this.targeting) return;
        if (this.targeting.animateCard) {
            this.targeting.animateCard.style.transform = '';
            this.targeting.animateCard.style.zIndex = '';
        }
        this.targeting = null;
        // Remove targeting-mode class from both areas (safe to call on both)
        this.elements.p1Units.classList.remove('targeting-mode');
        this.elements.p2Units.classList.remove('targeting-mode');
        this.log('Targeting canceled.', 'system');
        const cancelBtn = document.getElementById('btn-cancel-target');
        if (cancelBtn) cancelBtn.remove();
        this.syncState(); // Re-sync from Python to prevent energy desync
        this.updateUI(); // Resets styles and onclick handlers
    }

    executeTargetedAbility(targetType, targetNumber) {
        if (!this.targeting) return;
        const { sourceUnit, sourceNumber, animateCard } = this.targeting;
        const processProxy = this.pyodide.runPython(`
            source_type = "${sourceUnit.type}"
            source_num = ${sourceNumber}
            target_type = "${targetType}"
            target_idx = ${targetNumber}
            
            # Find the actual unit object in python
            target_unit = game.current_player.get_units_by_type(target_type)[int(target_idx)-1]
            success, msg = engine.use_ability(source_type, source_num, target=target_unit)
            
            {"success": success, "msg": msg}
        `);

        const result = processProxy.toJs({ dict_converter: Object.fromEntries });
        processProxy.destroy();

        const cancelBtn = document.getElementById('btn-cancel-target');
        if (cancelBtn) cancelBtn.remove();
        this.targeting = null;

        if (result.success) {
            if (animateCard) {
                animateCard.style.transform = '';
                animateCard.style.zIndex = '';
                animateCard.classList.add('exhausting-animation');
            }
            this.log(`Unexhausted ${targetType} #${targetNumber}`, 'player1');
            this.sounds.play('ABILITY');

            // Send to remote player
            if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                this.multiplayer.sendAction({ type: 'repeaterTarget', targetType, targetNumber, sourceNumber });
            }
        } else {
            if (animateCard) {
                animateCard.style.transform = '';
                animateCard.style.zIndex = '';
            }
            this.log(result.msg, 'important');
            this.sounds.play('ERROR');
        }

        this.syncState();
        this.updateUI();
    }

    handleBlock(unit) {
        const result = this.pyodide.runPython(`engine.assign_blockers([("${unit.type}", 1)])`);
        this.sounds.play('BLOCK');

        // Send to remote player
        if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
            this.multiplayer.sendAction({ type: 'block', unitType: unit.type, unitName: unit.name });
        }

        if (unit.type === 'barrier') {
            this.log('Barrier shattered blocking the attack!', 'important');
            this.handleUnitMouseLeave(); // Fix tooltip freeze as unit is destroyed
        }

        this.syncState();
        this.updateUI();
    }

    handleAssignDamage(unit, unitNumber, isP1Target, column) {
        // Calculate remaining in JS to avoid engine state issues
        const combat = this.state.combat;
        const remaining = Math.max(0, combat.atk - combat.blk - combat.assigned);

        const resultProxy = this.pyodide.runPython(`
            target_type = "${unit.type}"
            target_num = ${unitNumber}
            remaining_dmg = ${remaining}
            
            # Attacker chooses where leftover damage goes
            # Determine who is being damaged based on which unit was clicked
            defender_is_p1 = ${isP1Target ? 'True' : 'False'}
            defender = game.player1 if defender_is_p1 else game.player2
            
            units = defender.get_units_by_type(target_type)
            
            if 1 <= target_num <= len(units):
                target_unit = units[target_num-1]
                hp_needed = target_unit.current_health
                
                # Check remaining unassigned attack
                remaining = remaining_dmg
                
                if hp_needed > remaining:
                    success = False
                    msg = f"Not enough damage remaining! Needed: {hp_needed}, Available: {remaining}"
                else:
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

            // Send to remote player
            if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                this.multiplayer.sendAction({ type: 'breach', unitType: unit.type, unitNumber, hp: unit.hp, unitName: unit.name, isP1Target });
            }

            // Re-sync to check if breach is finished
            this.syncState();

            // Check if all damage assigned
            const combat = this.state.combat;
            const remaining = (combat.atk - combat.blk) - combat.assigned;

            if (remaining <= 0) {
                this.handleEndTurn();
            } else {
                this.updateUI();
            }
        } else {
            // Error handling
            this.log(`Error: ${result.msg}`, 'important');
            this.sounds.play('ERROR');

            if (column) {
                // Shake animation
                const card = column.querySelector('.unit-card.interactive') || column.querySelector('.unit-card');
                if (card) {
                    card.classList.add('shake-animation');
                    setTimeout(() => card.classList.remove('shake-animation'), 600);
                }
            }
            this.updateUI();
        }
    }


    async handleEndTurn() {
        console.log("handleEndTurn called - Current Player:", this.state?.currentPlayer, "Phase:", this.state?.phase, "GameMode:", this.gameMode);

        // Cancel targeting if active
        if (this.targeting) {
            this.cancelTargeting();
        }

        // Prevent double-clicking
        if (this.processingTurn) return;
        this.processingTurn = true;
        this.elements.btnEnd.disabled = true;
        this.elements.btnBuy.disabled = true;

        // Send to remote player
        if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
            this.multiplayer.sendAction({ type: 'endTurn' });
        }

        try {
            if (this.state.phase === 'Block') {
                const defenderName = this.state.currentPlayer;
                const attackerName = defenderName === 'Player 1' ? 'Player 2' : 'Player 1';

                // Defender finished blocking - check for breach using engine
                const resProxy = this.pyodide.runPython(`
                    success, msg = engine.finish_blocking()
                    {"game_phase": game.phase, "msg": msg}
                `);
                const res = resProxy.toJs({ dict_converter: Object.fromEntries });
                resProxy.destroy();


                if (res.game_phase === 'Breach') {
                    // Attacker must assign breach damage

                    // In HOTSEAT or ONLINE mode, let human attacker assign
                    if (this.gameMode === 'HOTSEAT' || this.gameMode === 'ONLINE') {
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

            } else if (this.state.phase === 'Breach') {
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
                if (this.gameMode === 'AI') {
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
                    
                    # Enter Block phase if needed
                    engine.block_phase()
                `);

                this.syncState();
                this.updateUI();

                // ===== HOTSEAT / ONLINE MODE =====
                if (this.gameMode === 'HOTSEAT' || this.gameMode === 'ONLINE') {
                    if (this.state.phase === 'Block') {
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
                if (this.state.phase === 'Block') {
                    // Player attacked - AI needs to defend
                    const incomingAtkProxy = this.pyodide.runPython(`sum(u.attack for u in engine.attacking_units)`);
                    const incomingAtk = incomingAtkProxy;
                    this.log(`🚨 INCOMING ATTACK! ${incomingAtk} damage aimed at AI.`, "important");
                    await new Promise(resolve => setTimeout(resolve, 800));

                    const defenseResultProxy = this.pyodide.runPython(`
                        # AI executes defense (blocking)
                        summary = ai.execute_turn(game, engine)
                        engine.finish_blocking()
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

                    // If it's now Breach phase, P1 enters Breach mode
                    if (this.state.phase === 'Breach') {
                        this.log("BREACH! Click AI units to destroy them.", "important");
                        this.updateUI();
                        this.processingTurn = false;
                        return; // Wait for player to assign
                    }
                } else if (this.state.phase === 'Breach') {
                    // Human finished Breach Phase -> Transition to Defender Action
                    this.pyodide.runPython(`
                        engine.end_phase()
                        engine.action_phase()
                    `);
                    this.syncState();
                    this.updateUI();
                    this.processingTurn = false;
                    this.elements.btnEnd.disabled = false;
                    this.elements.btnBuy.disabled = false;
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
                        engine.block_phase()
                        
                        res_msg = ""
                        if game.phase == "Block":
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

                    if (this.state.phase !== 'Block') {
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

            // Send to remote player
            if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                this.multiplayer.sendAction({ type: 'buy', unitType: type });
            }

            this.syncState();
            this.updateUI();
            this.hideShop();
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

            if (result[1].includes("energy")) {
                const isP1Turn = this.state.currentPlayer === this.state.p1.name;
                const energyEl = document.getElementById(isP1Turn ? 'p1-energy' : 'p2-energy');
                if (energyEl && energyEl.parentElement) {
                    energyEl.parentElement.classList.add('error-bump');
                    setTimeout(() => energyEl.parentElement.classList.remove('error-bump'), 600);
                }
            }
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
            { id: 'repeater', name: 'Repeater', cost: 3, energyCost: 0, desc: 'Unexhausts activated unit' },
            { id: 'volatile', name: 'Volatile', cost: 4, energyCost: 0, desc: 'Burst attack' }
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

            let limitMax = u.id === 'wall' ? 3 : 5;
            let currentAmount = 0;
            if (player && player.lifetime && player.lifetime[u.id]) {
                currentAmount = player.lifetime[u.id];
            }

            if (currentAmount >= limitMax) {
                affordable = false;
                reason = "Max limit reached";
                // Optionally gray out more aggressively, but existing disabled styles should handle it.
            } else if (unitsBought >= 2) {
                affordable = false;
                reason = "Max 2 units per turn";
            } else if (currentGold < u.cost) {
                affordable = false;
            } else if (currentEnergy < totalEnergyReq) {
                affordable = false;
            }

            if (!affordable) {
                item.classList.add('disabled');
                item.style.opacity = '0.5';
                item.onclick = (e) => {
                    e.stopPropagation();
                    this.sounds.play('ERROR');
                };
            } else {
                item.style.cursor = `url('assets/UI/cursor-pointer.svg') 5 5, auto !important`;
                item.onclick = (e) => {
                    e.stopPropagation();
                    // Double check in case UI is stale, but backend handles it too
                    this.buyUnit(u.id);
                };
            }

            const imgUrl = this.unitImages[u.id];

            let costDisplay = `${u.cost}🪙`;
            if (unitEnergyCost > 0) {
                costDisplay += ` ${unitEnergyCost}🔋`;
            }
            if (penalty > 0) {
                costDisplay += ` +${penalty}🔋`;
            }

            // Build progress bar segments based on limit
            let progressHtml = '<div class="shop-item-progress-bar" title="Purchase Limit">';
            let availableUnits = Math.max(0, limitMax - currentAmount);
            for (let i = 0; i < limitMax; i++) {
                let filledClass = i < availableUnits ? 'filled' : '';
                progressHtml += `<div class="progress-segment ${filledClass}"></div>`;
            }
            progressHtml += '</div>';

            item.innerHTML = `
                <div class="shop-item-info">
                   <div class="shop-item-main">
                      <span class="unit-cost">${costDisplay}</span>
                      <span class="unit-name">${u.name}</span>
                       ${!affordable && reason ? `<span class="unit-xs-reason">${reason}</span>` : ''}
                   </div>
                </div>
                ${progressHtml}
                <div class="shop-preview">
                    <img src="${imgUrl}" alt="${u.name}">
                </div>
            `;

            this.elements.shopGrid.appendChild(item);
        });

        this.sounds.play('SHOP_OPEN');
        this.elements.shopModal.classList.remove('hidden');

        let container = this.elements.shopModal.querySelector('.modal-content');
        if (container) {
            container.classList.remove('shop-modal-close-anim');
            container.classList.add('shop-modal-open-anim');
        }
    }

    hideShop() {
        let container = this.elements.shopModal.querySelector('.modal-content');
        if (container) {
            container.classList.remove('shop-modal-open-anim');
            container.classList.add('shop-modal-close-anim');
            setTimeout(() => {
                this.elements.shopModal.classList.add('hidden');
            }, 200);
        } else {
            this.elements.shopModal.classList.add('hidden');
        }
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
                engine.block_phase()
                
                res_msg = ""
                if game.phase == "Block":
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

    // -- Unit Preview --

    handleUnitMouseEnter(unit, e) {
        if (this.hoverTimeout) clearTimeout(this.hoverTimeout);

        this.hoverTimeout = setTimeout(() => {
            this.sounds.play('UNIT_HOVER');
            this.updateUnitPreview(unit);

            // Positioning Logic: Prevent tooltip overlapping units on the right side
            const preview = this.elements.unitPreview;
            if (e && e.clientX > window.innerWidth / 2) {
                preview.classList.add('left-side');
            } else {
                preview.classList.remove('left-side');
            }

            preview.classList.remove('hidden');
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
        this.elements.btnEnd.onclick = () => {
            this.sounds.play('CLICK');
            this.handleEndTurn();
        };
        this.elements.btnBuy.onclick = () => {
            this.handleBuy();
        };

        // Global visual click effect and sound
        document.body.addEventListener('click', (e) => {
            // Only play generic click if it's not a button or clickable card
            const isInteractable = e.target.closest('button') || e.target.closest('.close-btn') || e.target.closest('.unit-card');

            if (!isInteractable) {
                this.sounds.play('CLICK');

                // Create Ripple Effect
                const ripple = document.createElement('div');
                ripple.className = 'click-ripple';
                ripple.style.left = `${e.clientX}px`;
                ripple.style.top = `${e.clientY}px`;
                document.body.appendChild(ripple);

                // Play particles
                for (let i = 0; i < 5; i++) {
                    const particle = document.createElement('div');
                    particle.className = 'click-particle';
                    particle.style.left = `${e.clientX}px`;
                    particle.style.top = `${e.clientY}px`;
                    const angle = Math.random() * Math.PI * 2;
                    const distance = 20 + Math.random() * 30;
                    particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
                    particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
                    document.body.appendChild(particle);
                    setTimeout(() => particle.remove(), 600);
                }

                setTimeout(() => {
                    ripple.remove();
                }, 600);
            }
        });

        // Existing logic
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
            } else if (target.id === 'btn-online') {
                console.log("Online Mode Selected via Delegation");
                this.showOnlineLobby();
            }
        });

        // Hover Sounds for Buttons and Shop Items
        document.body.addEventListener('mouseover', (e) => {
            const target = e.target;
            const validHover = target.closest('button') || target.closest('.close-btn') || target.closest('.shop-list-item');
            if (validHover && !validHover._hasHovered) {
                validHover._hasHovered = true;
                this.sounds.play('HOVER');
                validHover.addEventListener('mouseleave', () => {
                    validHover._hasHovered = false;
                }, { once: true });
            }
        });

        // Initialize Log Toggle
        this.elements.btnLogToggle.onclick = () => {
            this.sounds.play('CLICK');
            if (!this.elements.combatLogWrapper) return;
            this.elements.combatLog.classList.toggle('expanded');
            const isExpanded = this.elements.combatLog.classList.contains('expanded');
            this.elements.btnLogToggle.innerHTML = isExpanded ? '❌' : '📜';
        };

        // Initialize Modals - Close Button
        const closeBtns = document.querySelectorAll('.close-btn');
        closeBtns.forEach(btn => {
            btn.onclick = () => {
                this.sounds.play('CLICK');
                this.hideShop();
            };
        });

        // Close modal on outside click
        this.elements.shopModal.onclick = (e) => {
            if (e.target === this.elements.shopModal) {
                this.sounds.play('CLICK');
                this.hideShop();
            }
        };

        // Settings
        this.elements.btnSettings.onclick = () => {
            this.sounds.play('CLICK');
            this.elements.settingsModal.classList.remove('hidden');
        };

        this.elements.closeSettings.onclick = () => {
            this.sounds.play('CLICK');
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

        if (this.elements.btnEndgameMenu) {
            this.elements.btnEndgameMenu.onclick = () => {
                this.sounds.play('CLICK');
                this.elements.endgameModal.classList.add('hidden');
                this.elements.app.classList.add('hidden');
                this.elements.welcomeScreen.classList.remove('hidden');
                this.log("Exited to Main Menu", "system");
            };
        }
    }

    showEndGameScreen() {
        this.sounds.play('VICTORY');

        let winnerName = this.state.winner;
        let winnerState = winnerName === this.state.p1.name ? this.state.p1 : this.state.p2;

        let startingUnits = 2; // Miner, Energizer
        if (winnerName === this.state.p2.name) startingUnits = 3; // + Barrier

        let totalAcquired = 0;
        if (winnerState && winnerState.lifetime) {
            for (let unitType in winnerState.lifetime) {
                totalAcquired += winnerState.lifetime[unitType];
            }
        }
        let unitsBought = Math.max(0, totalAcquired - startingUnits);

        if (this.elements.endgameWinner) this.elements.endgameWinner.textContent = `Winner: ${winnerName}`;
        if (this.elements.endgameTurns) this.elements.endgameTurns.textContent = this.state.turn;
        if (this.elements.endgameUnits) this.elements.endgameUnits.textContent = unitsBought;
        if (this.elements.endgameGold) this.elements.endgameGold.textContent = winnerState ? winnerState.gold : 0;
        if (this.elements.endgameEnergy) this.elements.endgameEnergy.textContent = winnerState ? winnerState.energy : 0;

        if (this.elements.endgameModal) this.elements.endgameModal.classList.remove('hidden');
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
            'SHOP_OPEN': 'shop_open.wav',
            'HOVER': 'hover_short.mp3',
            'UNIT_HOVER': 'hover.wav'
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
