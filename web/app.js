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
        this.hasInteracted = false;

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
            btnEndgameMenu: document.getElementById('btn-endgame-main-menu'),
            shopStaticPreview: document.getElementById('shop-static-preview'),
            shopStaticPreviewImg: document.getElementById('shop-static-preview-img'),
            sliderUIScale: document.getElementById('ui-scale-slider'),
            uiScaleDisplay: document.getElementById('ui-scale-display')
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
            'miner': 'assets/cards/Miner.webp?v=3',
            'energizer': 'assets/cards/Energizer.webp?v=3',
            'striker': 'assets/cards/Striker.webp?v=3',
            'guard': 'assets/cards/Guard.webp?v=3',
            'wall': 'assets/cards/Wall.webp?v=3',
            'repeater': 'assets/cards/Repeater.webp?v=3',
            'volatile': 'assets/cards/Volitile.webp?v=3',
            'barrier': 'assets/cards/Barrier.webp?v=3'
        };

        this.unitDescriptions = {
            'barrier': '<b>Fragile</b><br>Destroyed after blocking.',
            'miner': '<i>Iron pickaxe would be more effitient, ya know...</i>',
            'energizer': '<i>Mitochondria is the powerhouse of the cell!</i>',
            'striker': '<i>Sometimes offence is the best defence.</i>',
            'guard': '<i>Cool, calm, collected.</i>',
            'wall': '<b>Instant</b><br>Enters battlefield ready.',
            'repeater': '<i>Great! Now do that again.</i>',
            'volatile': '<i>KA-BOOM!</i>'
        };

        this.sounds = new SoundManager();
    }

    async init() {
        this.initCustomCursor();

        const handleFirstInteraction = () => {
            if (!this.hasInteracted) {
                this.hasInteracted = true;
                if (this.elements.welcomeScreen && !this.elements.welcomeScreen.classList.contains('hidden')) {
                    if (this.sounds) this.sounds.startMusic('bg_music - Aetherium_Chronicles.mp3');
                }
            }
            window.removeEventListener('click', handleFirstInteraction);
            window.removeEventListener('keydown', handleFirstInteraction);
            window.removeEventListener('touchstart', handleFirstInteraction);
        };
        window.addEventListener('click', handleFirstInteraction);
        window.addEventListener('keydown', handleFirstInteraction);
        window.addEventListener('touchstart', handleFirstInteraction);

        try {
            console.log("Initializing Pyodide... [VERSION 0.5.2 - SNAPPY UPDATE]");
            this.updateLoadingText("Downloading Python runtime...");

            const loadingBar = document.getElementById('loading-bar');
            if (loadingBar) loadingBar.style.width = '10%';

            // Start preloading assets while Pyodide is downloading
            const assetsToLoad = Object.values(this.unitImages).concat([
                'assets/sounds/buy.mp3',
                'assets/sounds/error.mp3',
                'assets/sounds/ability.mp3',
                'assets/sounds/block.mp3',
                'assets/sounds/attack_prep.mp3',
                'assets/sounds/hover_short.mp3',
                'assets/sounds/destroy.mp3',
                'assets/sounds/destroy2.mp3',
                'assets/sounds/destroy3.mp3',
                'assets/sounds/click.mp3',
                'assets/sounds/end_turn.mp3',
                'assets/sounds/victory.mp3',
                'assets/sounds/JDSherbert - Ultimate UI SFX Pack - Cursor - 3.mp3',
                'assets/sounds/JDSherbert - Ultimate UI SFX Pack - Cursor - 5.mp3',
                'assets/sounds/JDSherbert - Ultimate UI SFX Pack - Swipe - 2.mp3',
                'assets/sounds/hover.wav',
                'assets/sounds/shop_open.wav'
            ]);

            let loadedCount = 0;
            const updateProgress = () => {
                loadedCount++;
                if (loadingBar) {
                    loadingBar.style.width = `${10 + (loadedCount / assetsToLoad.length) * 40}%`;
                }
            };

            const preloadPromises = assetsToLoad.map(src => {
                return new Promise((resolve) => {
                    if (src.endsWith('.mp3') || src.endsWith('.wav')) {
                        const audio = new Audio();
                        audio.addEventListener('canplaythrough', resolve, { once: true });
                        audio.addEventListener('error', resolve, { once: true });
                        audio.src = src;
                        audio.load();
                    } else {
                        const img = new Image();
                        img.onload = resolve;
                        img.onerror = resolve;
                        img.src = src;
                    }
                }).then(updateProgress);
            });

            const pyodidePromise = loadPyodide().then(async (pyodideObj) => {
                this.pyodide = pyodideObj;
                if (loadingBar) loadingBar.style.width = '70%';

                this.updateLoadingText("Loading game files...");
                await this.mountFileSystem();
                if (loadingBar) loadingBar.style.width = '100%';
            });

            await Promise.all([...preloadPromises, pyodidePromise]);

            this.isLoaded = true;
            this.bindEvents();

            // Load settings
            const savedName = localStorage.getItem('playerName') || '';
            const playerNameInput = document.getElementById('player-name-input');
            if (playerNameInput) playerNameInput.value = savedName;

            if (playerNameInput) {
                playerNameInput.addEventListener('input', (e) => {
                    localStorage.setItem('playerName', e.target.value.trim());
                });
            }

            this.hideLoading();
            this.showWelcomeScreen();

            // Expose for console debugging
            window.gameApp = this;
            this.setupConsoleDebug();

        } catch (error) {
            console.error("Initialization failed:", error);
            this.updateLoadingText("Error: " + error.message);
        }

        // Apply UI scale after everything is set up
        this.initUIScale();
    }

    showWelcomeScreen() {
        this.elements.welcomeScreen.classList.remove('hidden');
        if (this.sounds && this.hasInteracted) {
            this.sounds.startMusic('bg_music - Aetherium_Chronicles.mp3');
        }
        this._initParallaxBg();
        // event listeners are now in bindEvents
    }

    initUIScale() {
        const saved = localStorage.getItem('uiScale');
        let scale;
        if (saved !== null) {
            scale = parseFloat(saved);
        } else {
            // Auto-detect based on physical screen width
            const w = window.screen.width;
            if      (w <= 1366) scale = 0.85;
            else if (w <= 1920) scale = 1.0;
            else if (w <= 2560) scale = 1.2;
            else                scale = 1.4;
        }
        this._applyUIScale(scale);
        // Sync slider position to the current scale
        if (this.elements.sliderUIScale) {
            this.elements.sliderUIScale.value = Math.round(scale * 10);
        }
    }

    _applyUIScale(scale) {
        scale = Math.min(1.5, Math.max(0.7, scale));
        document.documentElement.style.setProperty('--ui-scale', scale);
        localStorage.setItem('uiScale', scale);
        if (this.elements.uiScaleDisplay) {
            this.elements.uiScaleDisplay.textContent = scale.toFixed(1) + 'x';
        }
    }

    _initParallaxBg() {
        const screen = this.elements.welcomeScreen;
        let bg = screen.querySelector('.menu-parallax-bg');
        if (bg) return; // already injected
        bg = document.createElement('div');
        bg.className = 'menu-parallax-bg';
        screen.insertBefore(bg, screen.firstChild);

        const cardNames = [
            'Miner', 'Energizer', 'Striker', 'Guard',
            'Wall', 'Volitile', 'Repeater', 'Barrier'
        ];
        const W = window.innerWidth;
        const H = window.innerHeight;
        // Scale card count into exactly 16 equal sections
        const area = W * H;
        const baseCount = Math.max(16, Math.min(48, Math.round((area / 35000) * 1.6)));
        const cardsPerCell = Math.max(1, Math.round(baseCount / 16));
        const count = cardsPerCell * 16;

        // Build pool of names and shuffle it
        const pool = [];
        for (let i = 0; i < count; i++) pool.push(cardNames[i % cardNames.length]);
        pool.sort(() => Math.random() - 0.5);

        const cellW = W / 4;
        const cellH = H / 4;
        const placed = [];

        let poolIndex = 0;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                for (let k = 0; k < cardsPerCell; k++) {
                    const name = pool[poolIndex++];
                    let x, y, attempts = 0, ok = false;
                    const w = 90 + Math.random() * 60;
                    let currentMinDist = 300; // Target 300px distance
                    
                    do {
                        // Confine coordinates to the current cell segment (with safe edge bleeding)
                        x = (col * cellW) - w/4 + Math.random() * cellW;
                        y = (row * cellH) - 45 + Math.random() * cellH;
                        
                        const cx = x + w / 2, cy = y + 90;
                        ok = placed.every(p => Math.hypot(cx - p.cx, cy - p.cy) >= currentMinDist);
                        attempts++;
                        
                        // If cell gets too dense to honor 300px spacing, gradually relax the limit
                        if (!ok && attempts % 20 === 0) {
                            currentMinDist *= 0.85; 
                        }
                    } while (!ok && attempts < 150);

                    const img = document.createElement('img');
                    img.src = `assets/cards/${name}.webp`;
                    img.className = 'p-card';
                    const r0 = (Math.random() * 20 - 10).toFixed(1);
                    const r1 = (parseFloat(r0) + (Math.random() * 10 - 5)).toFixed(1);
                    const dx = ((Math.random() * 30) - 15).toFixed(1);
                    const dy = ((Math.random() * 30) - 15).toFixed(1);
                    const dur = 18 + Math.random() * 20;
                    const delay = -(Math.random() * dur);

                    img.style.cssText = `
                        width: ${w.toFixed(0)}px;
                        left: ${x.toFixed(0)}px;
                        top:  ${y.toFixed(0)}px;
                        --r0: ${r0}deg; --r1: ${r1}deg;
                        --dx: ${dx}px;  --dy: ${dy}px;
                        animation: card-drift ${dur.toFixed(1)}s ${delay.toFixed(1)}s ease-in-out infinite;
                    `;
                    bg.appendChild(img);
                    placed.push({ cx: x + (w / 2), cy: y + 90 });
                }
            }
        }
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
                this.gameMode = 'ONLINE';
                this.isHost = this.multiplayer.isHost;
                this.selectedAI = null;
                this.opponentName = null;

                // Immediately setup callbacks so we don't miss handshakes
                this.setupMultiplayerCallbacks();

                // Send own name
                const inputNameEl = document.getElementById('player-name-input');
                const myName = (inputNameEl && inputNameEl.value.trim() !== '') ? inputNameEl.value.trim() : 'Player';

                setTimeout(() => {
                    this.multiplayer.sendAction({ type: 'handshake', name: myName });
                }, 200);

                setTimeout(() => {
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
            this.showWelcomeScreen();
        };
    }

    setupMultiplayerCallbacks() {
        this.multiplayer.onAction((action) => {
            if (action.type === 'handshake') {
                this.opponentName = action.name;
                return;
            }
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
                this.showWelcomeScreen();
                document.title = 'Build Order | Strategic Card Battle';
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
            this.showWelcomeScreen();
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

                this.sounds.play('TURN_START');

                this.setupMobileLayout();
                this.updateUI();
            }, 500);
        }, 100);
    }

    setupMobileLayout() {
        if (window.innerWidth > 768) return;

        const separator = document.querySelector('.player-separator');
        const centralAttack = separator.querySelector('.central-attack');
        const turnBadge = document.querySelector('.stat-badge.turn');
        const phaseBadge = document.querySelector('.stat-badge.phase');
        const settingsBtn = document.getElementById('btn-settings');

        // Create left and right flex containers if they don't exist
        let sepLeft = separator.querySelector('.sep-left');
        let sepRight = separator.querySelector('.sep-right');

        if (!sepLeft) {
            sepLeft = document.createElement('div');
            sepLeft.className = 'sep-left';
            separator.insertBefore(sepLeft, centralAttack);
        }
        if (!sepRight) {
            sepRight = document.createElement('div');
            sepRight.className = 'sep-right';
            separator.appendChild(sepRight);
        }

        // Left side gets just Phase
        if (phaseBadge && !sepLeft.contains(phaseBadge)) {
            sepLeft.appendChild(phaseBadge);
        }

        // Right side gets Turn and Settings
        if (turnBadge && !sepRight.contains(turnBadge)) {
            sepRight.appendChild(turnBadge);
        }
        if (settingsBtn && !sepRight.contains(settingsBtn)) {
            sepRight.appendChild(settingsBtn);
        }
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

        const cacheBust = Date.now();
        for (const file of files) {
            // Path is relative to web/ — cache-bust to always get latest
            const response = await fetch(`../src/prismata/${file}?t=${cacheBust}`);
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
        // Determine player names based on game mode by picking random names from the list
        const nameList = [
            "Bakulinjo", "CatPark", "Boki", "Welstoce",
            "Agamajstor", "Liskoni", "xxJustJuliaxx",
            "Maca Gvini", "Prilicki Princ"
        ];

        // Shuffle the list to get random unique names
        const shuffledNames = [...nameList].sort(() => 0.5 - Math.random());

        const inputNameEl = document.getElementById('player-name-input');
        const customName = (inputNameEl && inputNameEl.value.trim() !== '') ? inputNameEl.value.trim() : null;

        let p1Name = "Player 1";
        let p2Name = (this.gameMode === 'HOTSEAT' || this.gameMode === 'ONLINE') ? "Player 2" : "AI";

        if (this.gameMode === 'ONLINE') {
            if (this.isHost) {
                p1Name = customName || "Player 1";
                p2Name = this.opponentName || "Player 2";
            } else {
                p1Name = this.opponentName || "Player 1";
                p2Name = customName || "Player 2";
            }
        } else {
            p1Name = customName || "Player";
        }

        const aiType = this.selectedAI || 'Standard';

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
            this.state.currentPlayer = defender === this.state.p1.name ? this.state.p2.name : this.state.p1.name;
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
        const playerShort = this.state.currentPlayer === this.state.p1.name ? 'P1' : (this.state.currentPlayer === this.state.p2.name ? 'P2' : this.state.currentPlayer);
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

        // Trigger Turn Transition Banner
        if (this.currentTurnPlayer !== this.state.currentPlayer) {
            this.currentTurnPlayer = this.state.currentPlayer;
            const banner = document.getElementById('turn-banner');
            const bannerText = document.getElementById('turn-banner-text');
            if (banner && bannerText) {
                bannerText.textContent = `${this.state.currentPlayer.toUpperCase()}'S TURN`;

                // Reset animation by cloning and replacing node
                const newBanner = banner.cloneNode(true);
                banner.parentNode.replaceChild(newBanner, banner);

                newBanner.classList.remove('hidden');
                setTimeout(() => {
                    newBanner.classList.add('hidden');
                }, 2000); // 2s is the duration of bannerIn animation
            }
        }

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
            const container = atkEl.parentElement;
            container.style.opacity = '1';
            if (displayVal > 0) {
                container.style.borderColor = 'var(--accent-red)';
                container.style.borderWidth = '3px';
                container.style.background = '#ac2c2c';
                container.classList.add('danger');
            } else {
                container.style.borderColor = 'var(--glass-border)';
                container.style.borderWidth = '2px';
                container.style.background = '#0a093a';
                container.classList.remove('danger');
            }
        }
    }

    updateResourceDisplay(id, checkVal, isHp = false) {
        const el = document.getElementById(id);
        const oldVal = parseInt(el.textContent) || 0;

        if (checkVal === 0) {
            el.classList.add('zero-resource');
        } else {
            el.classList.remove('zero-resource');
        }

        if (checkVal > oldVal) {
            el.textContent = checkVal;
            el.classList.add('resource-bump');
            setTimeout(() => el.classList.remove('resource-bump'), 600);
        } else if (checkVal < oldVal) {
            // Animated count-down: update text gradually, colour change only at 0
            this._animateDecrement(el, oldVal, checkVal);
            el.classList.add('resource-drop');
            setTimeout(() => el.classList.remove('resource-drop'), 600);
        } else {
            el.textContent = checkVal;
        }
    }

    _animateDecrement(el, from, to) {
        // Clear any in-progress decrement
        if (el._decrementInterval) clearInterval(el._decrementInterval);
        const diff = Math.abs(from - to);
        const steps = Math.min(diff, 20);
        const stepDur = 600 / steps;
        let cur = from;
        const dir = to < from ? -1 : 1;
        el._decrementInterval = setInterval(() => {
            cur += dir;
            el.textContent = cur;
            if (cur === to) {
                clearInterval(el._decrementInterval);
                el._decrementInterval = null;
            }
        }, stepDur);
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

                // Block overlay (Block Phase) - block value above shield, blue, only eligible units
                let overlayHtml = '';
                if (this.state.phase === 'Block' && isFriendly && !unit.exhausted && unit.blk > 0) {
                    const blkStyle = 'font-size:2rem;font-weight:900;line-height:1;color:#a0d4ff;' +
                        'text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,' +
                        '0 0 10px rgba(0,150,255,0.9);letter-spacing:1px;';
                    overlayHtml = `<div class="block-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,100,255,0.15);display:flex;align-items:center;justify-content:center;z-index:20;pointer-events:none;user-select:none;"><span style="display:flex;flex-direction:column;align-items:center;gap:1px;"><span style="${blkStyle}">${unit.blk}</span><span style="font-size:2.2rem;line-height:1;">🛡️</span></span></div>`;
                }

                // Status overlays
                let statusHtml = '';
                if (isAttacking) {
                    statusHtml = `<div class="attacking-swords">⚔️</div>`;
                } else if (isExhausted && !isBlocking) {
                    statusHtml = `<div class="exhausted-zzz">💤</div>`;
                }

                card.innerHTML = `
                        <div class="unit-art" style="background-image: url('${imgUrl}')"></div>
                        ${overlayHtml}
                        ${statusHtml}
                    `;

                // Hover Preview - available for all cards
                card.addEventListener('mouseenter', (e) => {
                    if (window.innerWidth <= 768) return; // Disable hover on mobile
                    e.stopPropagation();
                    this.handleUnitMouseEnter(unit, e);

                    // Lift effect
                    if (card.classList.contains('interactive')) {
                        card.classList.add('column-focus');
                    }
                }, { passive: true });

                card.addEventListener('mouseleave', (e) => {
                    if (window.innerWidth <= 768) return;
                    e.stopPropagation();
                    this.handleUnitMouseLeave();
                    card.classList.remove('column-focus');
                }, { passive: true });

                // Touch and Hold Preview for Mobile
                card.addEventListener('touchstart', (e) => {
                    if (window.innerWidth > 768) return;
                    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);

                    this.hoverTimeout = setTimeout(() => {
                        this.sounds.play('UNIT_HOVER');
                        this.updateUnitPreview(unit);
                        const preview = this.elements.unitPreview;

                        // Top or bottom depending on touch Y position
                        if (e.touches && e.touches[0].clientY > window.innerHeight / 2) {
                            preview.classList.add('mobile-top');
                            preview.classList.remove('mobile-bottom');
                        } else {
                            preview.classList.add('mobile-bottom');
                            preview.classList.remove('mobile-top');
                        }
                        preview.classList.remove('hidden');
                    }, 700);
                }, { passive: true });

                const clearTouch = () => {
                    if (window.innerWidth > 768) return;
                    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
                    this.elements.unitPreview.classList.add('hidden');
                    // Also clear any column-focus so card is not "stuck" selected
                    card.classList.remove('column-focus');
                };
                card.addEventListener('touchend', clearTouch, { passive: true });
                card.addEventListener('touchcancel', clearTouch, { passive: true });
                card.addEventListener('touchmove', clearTouch, { passive: true });
                card.addEventListener('contextmenu', (e) => {
                    if (window.innerWidth <= 768) e.preventDefault();
                });

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

                // Breach clicking is handled by the column instead
                // Breach allows ANY unit (ignore interactiveIndex)
                if (canDamageInBreach) {
                    // Do nothing for 'isInteractive' on individual cards
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

            // Check if column is vulnerable in breach
            if (!isFriendly && this.state.phase === 'Breach') {
                const combat = this.state.combat;
                const remaining = Math.max(0, combat.atk - combat.blk - combat.assigned);
                let canDamageColumn = false;
                let hpNeededToKill = 0;
                let topUnitInColumn = null;
                let topUnitIndex = -1;

                // Find top-most alive unit
                for (let i = unitsByType[type].length - 1; i >= 0; i--) {
                    const u = unitsByType[type][i];
                    if (u.hp > 0 && u.hp <= remaining) {
                        canDamageColumn = true;
                        hpNeededToKill = u.hp;
                        topUnitInColumn = u;
                        topUnitIndex = i + 1;
                        break;
                    }
                }

                if (canDamageColumn) {
                    column.classList.add('lethal-target-column');
                    column.style.cursor = 'pointer';
                    const colMarker = document.createElement('div');
                    colMarker.className = 'column-breach-marker';
                    colMarker.style.position = 'absolute';
                    colMarker.style.bottom = '-35px';
                    colMarker.style.left = '50%';
                    colMarker.style.transform = 'translateX(-50%)';
                    colMarker.style.width = '100%';
                    colMarker.style.textAlign = 'center';
                    colMarker.style.fontSize = '1.3rem';
                    colMarker.style.fontWeight = '900';
                    colMarker.style.color = '#fff';
                    colMarker.style.textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 8px rgba(255, 60, 60, 1)';
                    colMarker.innerHTML = `${hpNeededToKill} ⚔️`;

                    // Hover effect listener onto the column itself
                    column.addEventListener('mouseenter', () => { column.style.transform = 'translateY(-5px)'; });
                    column.addEventListener('mouseleave', () => { column.style.transform = ''; });

                    column.appendChild(colMarker);
                    column.onclick = (e) => {
                        e.stopPropagation();
                        this.handleAssignDamage(topUnitInColumn, topUnitIndex, isP1Units, column);
                    };
                }
            }

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
                isMyTurn = this.state.currentPlayer === this.state.p1.name;
            } else {
                isMyTurn = this.state.currentPlayer === this.state.p2.name;
            }
        } else {
            // In AI Mode, only Player 1 is human
            isMyTurn = this.state.currentPlayer === this.state.p1.name;
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

        // Disable and completely hide SHOP button during Block and Breach
        if (phase === 'Block' || phase === 'Breach') {
            this.elements.btnBuy.style.display = 'none';
        } else {
            this.elements.btnBuy.style.display = '';
        }

        if (phase === 'Block') {
            this.elements.btnEnd.textContent = "FINISH BLOCKING";
            this.elements.btnEnd.classList.add('important');
        } else if (phase === 'Breach') {
            const combat = this.state.combat;
            const remaining = Math.max(0, (combat.atk - combat.blk) - combat.assigned);
            this.elements.btnEnd.textContent = `ATTACK BASE ${remaining} ⚔️`;
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

                    // Special destruction animation for Volatile
                    if (unit.type === 'volatile' && animateCard) {
                        animateCard.classList.add('unit-destroy');
                        this.sounds.play('DESTROY');
                        // Delay sync slightly to let animation start
                        setTimeout(() => {
                            this.syncState();
                            this.updateUI();
                        }, 600);
                        return;
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

                if (abilitySuccess) {
                    this.sounds.play('CLICK');
                }

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
                
                if (animateCard) {
                    animateCard.classList.add('unit-destroy');
                    this.sounds.play('DESTROY');
                }

                const volSuccess = await this.processActionResult(resultProxy, animateCard);

                // Send to remote player
                if (volSuccess && this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                    this.multiplayer.sendAction({ type: 'ability', unitType: unit.type, unitNumber, atk: unit.atk, unitName: unit.name });
                }

                // If success, we already triggered destroy animation. Delay sync if needed.
                if (volSuccess) {
                    setTimeout(() => {
                        this.syncState();
                        this.updateUI();
                    }, 600);
                    return;
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
                // cursor removed
                columnEl.style.cursor = '';
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
                // cursor removed
                columnEl.style.cursor = '';
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
            this.sounds.play('DESTROY');

            // Find the barrier column and play destroy animation
            const area = this.state.currentPlayer === this.state.p1.name ? this.elements.p1Units : this.elements.p2Units;
            const columns = area.querySelectorAll('.unit-column');
            for (const col of columns) {
                const card = col.querySelector('[data-type="barrier"]');
                if (card) {
                    // Find the interactive (non-exhausted) barrier
                    const interactiveCard = col.querySelector('.unit-card.interactive') || col.querySelector('.unit-card:not(.exhausted)');
                    if (interactiveCard) {
                        interactiveCard.classList.add('unit-destroy');
                    }
                    break;
                }
            }

            // Delay sync so animation plays
            setTimeout(() => {
                this.syncState();
                this.updateUI();
            }, 600);
            return;
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
            this.handleUnitMouseLeave(); // Ensure hover tooltip is cleared
            this.log(`Destroyed ${unit.name} #${unitNumber}`, 'important');
            this.sounds.play('DESTROY');

            // Play destruction animation on the card
            if (column) {
                const targetCard = column.querySelectorAll('.unit-card')[unitNumber - 1];
                if (targetCard) {
                    targetCard.classList.add('unit-destroy');
                }
            }

            // Send to remote player
            if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                this.multiplayer.sendAction({ type: 'breach', unitType: unit.type, unitNumber, hp: unit.hp, unitName: unit.name, isP1Target });
            }

            // Wait for destroy animation before syncing UI
            setTimeout(() => {
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
            }, 600);
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
                const attackerName = defenderName === this.state.p1.name ? this.state.p2.name : this.state.p1.name;

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
                    if (this.state.currentPlayer === this.state.p1.name) {
                        // AI attacked, P1 defended, now AI (Attacker) assigns
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
                    this.sounds.play('TURN_START');
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
                        this.sounds.play('TURN_START');
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

                    // Wait for the "AI'S TURN" banner animation to finish (approx 2s)
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    const speedMap = { '0': 1500, '1': 900, '2': 0 };
                    const stepDelayMs = speedMap[this.aiSpeed] !== undefined ? speedMap[this.aiSpeed] : 900;

                    if (stepDelayMs > 0) {
                        const stepsProxy = this.pyodide.runPython(`
                            global_def_steps_py = ai.plan_defense(game, engine)
                            global_def_steps_py
                        `);
                        const numSteps = stepsProxy.length;

                        // We gather the summary while replaying the visual steps
                        let blockSummary = [];

                        for (let i = 0; i < numSteps; i++) {
                            const step = stepsProxy.get(i);
                            if (step.get('type') === 'end') {
                                step.destroy();
                                break;
                            }

                            const stepData = step.toJs({ dict_converter: Object.fromEntries });
                            const isBarrierBlock = stepData.type === 'block' && stepData.unit === 'barrier';

                            if (isBarrierBlock) {
                                // Find the barrier card to animate before it's removed by syncState
                                const area = this.elements.p2Units; // AI is always P2 in PVE
                                const barrierCard = area.querySelector('[data-type="barrier"]:not(.exhausted)');
                                if (barrierCard) {
                                    barrierCard.classList.add('unit-destroy');
                                    this.sounds.play('DESTROY');
                                }
                            }

                            const label = this.pyodide.runPython(`ai.execute_step(game, engine, global_def_steps_py[${i}])`);
                            this.log(`🤖 AI: ${label}`, 'opponent');
                            this.sounds.play('BLOCK');
                            blockSummary.push(label.replace('Blocks with', '').trim());

                            if (isBarrierBlock) {
                                // Wait for animation before syncing/updating which removes the card
                                await new Promise(resolve => setTimeout(resolve, 600));
                            }

                            this.syncState();
                            this.updateUI();

                            step.destroy();
                            await new Promise(resolve => setTimeout(resolve, stepDelayMs));
                        }
                        stepsProxy.destroy();

                        if (blockSummary.length > 0) {
                            this.log(`AI blocked with: ${blockSummary.join(', ')}`, "opponent");
                        } else {
                            this.log("AI did not block.", "opponent");
                        }

                        this.pyodide.runPython(`engine.finish_blocking()`);

                    } else {
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
                await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                    const speedMap = { '0': 1500, '1': 900, '2': 0 };
                    const stepDelayMs = speedMap[this.aiSpeed] !== undefined ? speedMap[this.aiSpeed] : 900;

                    let boughtUnits = [];

                    if (stepDelayMs > 0) {
                        // ===  STEP-BY-STEP AI REPLAY  ===
                        const stepsProxy = this.pyodide.runPython(`
                            global_steps_py = ai.plan_turn(game, engine)
                            global_steps_py
                        `);
                        const numSteps = stepsProxy.length;

                        for (let i = 0; i < numSteps; i++) {
                            const step = stepsProxy.get(i);
                            if (step.get('type') === 'end') {
                                step.destroy();
                                break;
                            }

                            const label = this.pyodide.runPython(`ai.execute_step(game, engine, global_steps_py[${i}])`);

                            this.log(`🤖 AI: ${label}`, 'opponent');

                            // Visual/Audio cues for AI Actions
                            if (label.includes('Bought')) {
                                this.sounds.play('BUY');
                            } else if (label.includes('Energizer') || label.includes('Miner') || label.includes('Wall') || label.includes('Repeater')) {
                                this.sounds.play('CLICK');
                            }

                            this.syncState();
                            this.updateUI();

                            // Trigger shine if a unit was bought
                            if (label.includes('Bought')) {
                                const boughtMatch = label.match(/Bought\s+(\w+)/i);
                                if (boughtMatch && boughtMatch[1]) {
                                    this._triggerBuyAnimation(boughtMatch[1].toLowerCase());
                                }
                            }

                            step.destroy();
                            await new Promise(resolve => setTimeout(resolve, stepDelayMs));
                        }
                        stepsProxy.destroy();

                        // 3. End turn and transition
                        const endMsg = this.pyodide.runPython(`
                            engine.end_phase()
                            engine.end_turn()
                            game.current_player.units_purchased = 0
                            engine.start_phase()
                            engine.block_phase()
                            res_msg = ""
                            if game.phase == "Block":
                                total_atk = sum(u.attack for u in engine.attacking_units)
                                res_msg = f"INCOMING: {total_atk}"
                            else:
                                engine.action_phase()
                            res_msg
                        `);

                        if (endMsg) {
                            this.log(`🚨 ${endMsg} damage incoming! Assign your blockers.`, 'important');
                        }
                    } else {
                        // ===  INSTANT: single-batch (original behavior)  ===
                        const resultProxy = this.pyodide.runPython(`
                            summary = ai.execute_turn(game, engine)
                            game.current_player.units_purchased = 0
                            engine.end_phase()
                            engine.end_turn()
                            engine.start_phase()
                            engine.block_phase()
                            res_msg = ""
                            if game.phase == "Block":
                                total_atk = sum(u.attack for u in engine.attacking_units)
                                res_msg = f"INCOMING: {total_atk}"
                            else:
                                engine.action_phase()
                            {"summary": summary, "msg": res_msg}
                        `);
                        const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
                        resultProxy.destroy();

                        if (result.summary && result.summary.length > 0) {
                            this.log(`AI Actions: ${result.summary.join(", ")}`, 'opponent');
                            result.summary.forEach(action => {
                                if (action.includes('Bought')) {
                                    const boughtMatch = action.match(/Bought\s+(\w+)/i);
                                    if (boughtMatch && boughtMatch[1]) {
                                        boughtUnits.push(boughtMatch[1].toLowerCase());
                                    }
                                }
                            });
                        }
                        if (result.msg) {
                            this.log(`🚨 ${result.msg} damage incoming! Assign your blockers.`, 'important');
                        }
                    }

                    this.syncState();
                    this.updateUI();

                    if (boughtUnits.length > 0) {
                        boughtUnits.forEach(u => this._triggerBuyAnimation(u));
                    }

                    if (this.state.phase !== 'Block') {
                        this.log("Your turn!", "player1");
                    }
                } catch (aiError) {
                    console.error("AI turn error:", aiError);
                    this.log("AI turn failed: " + aiError.message, "important");
                    this.pyodide.runPython(`
                        game.current_player.units_purchased = 0
                        if game.phase != "Action":
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
            this._triggerBuyAnimation(type);
            this.hideShop();
        } else {
            this.sounds.play('ERROR');
            this.log(`Error: ${result.msg}`, 'important');
        }
    }

    _triggerBuyAnimation(unitType) {
        // AI purchases during AI turn go to AI area (P2 usually, or whoever is current)
        const isP1Turn = this.state.currentPlayer === this.state.p1.name;
        const area = isP1Turn ? this.elements.p1Units : this.elements.p2Units;

        const columns = area.querySelectorAll('.unit-column');
        for (const col of columns) {
            const anyCard = col.querySelector(`[data-type="${unitType}"]`);
            if (!anyCard) continue;

            // Exhausted cards are the newest units (except Walls which aren't exhausted, so fallback to last child)
            const exhaustedCards = Array.from(col.querySelectorAll('.unit-card.exhausted'));
            const target = exhaustedCards.length > 0
                ? exhaustedCards[exhaustedCards.length - 1]
                : col.querySelector('.unit-card:last-child');

            if (target) {
                setTimeout(() => {
                    target.classList.remove('unit-shine');
                    void target.offsetWidth; // Force CSS reflow to restart animation
                    target.classList.add('unit-shine');
                    setTimeout(() => target.classList.remove('unit-shine'), 1100);
                }, 300);
            }
            break;
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
            { id: 'barrier', name: 'Barrier', cost: 1, energyCost: 0, desc: this.unitDescriptions['barrier'] },
            { id: 'miner', name: 'Miner', cost: 2, energyCost: 0, desc: this.unitDescriptions['miner'] },
            { id: 'energizer', name: 'Energizer', cost: 2, energyCost: 0, desc: this.unitDescriptions['energizer'] },
            { id: 'striker', name: 'Striker', cost: 3, energyCost: 0, desc: this.unitDescriptions['striker'] },
            { id: 'guard', name: 'Guard', cost: 3, energyCost: 0, desc: this.unitDescriptions['guard'] },
            { id: 'wall', name: 'Wall', cost: 3, energyCost: 0, desc: this.unitDescriptions['wall'] },
            { id: 'repeater', name: 'Repeater', cost: 3, energyCost: 0, desc: this.unitDescriptions['repeater'] },
            { id: 'volatile', name: 'Volatile', cost: 4, energyCost: 0, desc: this.unitDescriptions['volatile'] }
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
            item.dataset.unitId = u.id; // needed for mobile preview

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
                // cursor removed
                item.style.cursor = '';
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
            `;

            // Desktop hover preview
            item.onmouseenter = () => {
                if (window.innerWidth > 768) {
                    this.elements.shopStaticPreviewImg.src = imgUrl;
                    const preview = this.elements.shopStaticPreview;
                    const nameEl = preview.querySelector('.shop-preview-name');
                    const descEl = preview.querySelector('.shop-preview-desc');
                    if (nameEl) nameEl.textContent = u.name;
                    if (descEl) descEl.innerHTML = u.desc;
                    preview.classList.remove('hidden');
                }
            };
            item.onmouseleave = () => {
                if (window.innerWidth > 768) {
                    this.elements.shopStaticPreview.classList.add('hidden');
                }
            };

            this.elements.shopGrid.appendChild(item);
        });

        this.sounds.play('SHOP_OPEN');
        this.elements.shopModal.classList.remove('hidden');

        let container = this.elements.shopModal.querySelector('.modal-content');
        if (container) {
            container.classList.remove('shop-modal-close-anim');
            container.classList.add('shop-modal-open-anim');
        }

        // --- Mobile: Preview-on-click flow ---
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            const previewCard = document.getElementById('shop-preview-card');
            let selectedUnitId = null;
            let selectedAffordable = false;

            // Swap action bar: End Turn -> BUY, SHOP -> EXIT SHOP
            this.elements.btnEnd.style.display = 'none';
            this.elements.btnBuy.textContent = 'EXIT SHOP';
            this.elements.btnBuy.onclick = (e) => {
                e.stopPropagation();
                this.hideShop();
            };

            // Add a BUY button where End Turn was
            let mobileBuyBtn = document.getElementById('mobile-shop-buy');
            if (!mobileBuyBtn) {
                mobileBuyBtn = document.createElement('button');
                mobileBuyBtn.id = 'mobile-shop-buy';
                mobileBuyBtn.className = 'action-btn accent';
                mobileBuyBtn.textContent = 'BUY';
                this.elements.btnEnd.parentNode.appendChild(mobileBuyBtn);
            }
            // Use visibility: hidden to reserve space and keep EXIT SHOP on the left
            mobileBuyBtn.style.display = 'flex';
            mobileBuyBtn.style.visibility = 'hidden';
            mobileBuyBtn.disabled = true;

            // Force layout to push buttons apart
            this.elements.btnBuy.parentNode.style.justifyContent = 'space-between';
            this.elements.btnBuy.parentNode.style.width = '100%';

            // Reset preview
            previewCard.classList.add('hidden');
            previewCard.classList.remove('disabled-preview');
            document.querySelectorAll('.shop-list-item.selected').forEach(el => el.classList.remove('selected'));

            // Add scroll arrow buttons (up and down)
            const gridParent = this.elements.shopGrid.parentNode;
            let scrollArrowUp = gridParent.querySelector('.shop-scroll-arrow.up');
            if (!scrollArrowUp) {
                scrollArrowUp = document.createElement('button');
                scrollArrowUp.className = 'shop-scroll-arrow up';
                scrollArrowUp.innerHTML = '&#9650;'; // Up arrow
                gridParent.insertBefore(scrollArrowUp, this.elements.shopGrid);
            }
            scrollArrowUp.onclick = () => {
                this.elements.shopGrid.scrollBy({ top: -100, behavior: 'smooth' });
            };

            let scrollArrowDown = gridParent.querySelector('.shop-scroll-arrow.down');
            if (!scrollArrowDown) {
                scrollArrowDown = document.createElement('button');
                scrollArrowDown.className = 'shop-scroll-arrow down';
                scrollArrowDown.innerHTML = '&#9660;'; // Down arrow
                gridParent.appendChild(scrollArrowDown);
            }
            scrollArrowDown.onclick = () => {
                this.elements.shopGrid.scrollBy({ top: 100, behavior: 'smooth' });
            };

            // Remove any old non-directional arrows
            const oldArrow = gridParent.querySelector('.shop-scroll-arrow:not(.up):not(.down)');
            if (oldArrow) oldArrow.remove();

            // Set up scroll listener to toggle arrows
            const updateArrows = () => {
                const grid = this.elements.shopGrid;
                if (!grid) return;

                // Show up arrow if not at top
                if (grid.scrollTop > 5) {
                    scrollArrowUp.classList.remove('arrow-hidden');
                } else {
                    scrollArrowUp.classList.add('arrow-hidden');
                }

                // Show down arrow if not at bottom (+ 2 for fractional rounding)
                if (grid.scrollTop + grid.clientHeight < grid.scrollHeight - 2) {
                    scrollArrowDown.classList.remove('arrow-hidden');
                } else {
                    scrollArrowDown.classList.add('arrow-hidden');
                }
            };

            if (!this.elements.shopGrid._scrollListenerAdded) {
                this.elements.shopGrid.addEventListener('scroll', updateArrows);
                this.elements.shopGrid._scrollListenerAdded = true;
            }
            // Add small delay to allow DOM render before checking scroll height
            setTimeout(updateArrows, 10);

            // Wire ALL shop items (including disabled) to preview
            this.elements.shopGrid.querySelectorAll('.shop-list-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    // Deselect previous
                    document.querySelectorAll('.shop-list-item.selected').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    selectedUnitId = item.dataset.unitId;
                    selectedAffordable = !item.classList.contains('disabled');

                    // Populate preview card
                    const u = shopUnits.find(su => su.id === selectedUnitId);
                    if (u) {
                        previewCard.querySelector('.shop-preview-art').style.backgroundImage = `url('${this.unitImages[u.id]}')`;
                        previewCard.querySelector('.shop-preview-name').textContent = u.name;
                        let costTxt = `${u.cost} 🪙`;
                        if (u.energyCost > 0) costTxt += ` ${u.energyCost} 🔋`;
                        previewCard.querySelector('.shop-preview-cost').textContent = costTxt;
                        previewCard.querySelector('.shop-preview-desc').innerHTML = u.desc;
                        previewCard.classList.remove('hidden');

                        // Grey tint for unaffordable
                        if (!selectedAffordable) {
                            previewCard.classList.add('disabled-preview');
                        } else {
                            previewCard.classList.remove('disabled-preview');
                        }

                        // Show/enable BUY only if affordable
                        mobileBuyBtn.style.visibility = 'visible';
                        if (selectedAffordable) {
                            mobileBuyBtn.disabled = false;
                            mobileBuyBtn.textContent = 'BUY';
                        } else {
                            mobileBuyBtn.disabled = true;
                            mobileBuyBtn.textContent = 'BUY';
                        }
                    }
                    this.sounds.play('HOVER');
                };
            });

            // BUY button action
            mobileBuyBtn.onclick = (e) => {
                e.stopPropagation();
                if (selectedUnitId && selectedAffordable) {
                    this.buyUnit(selectedUnitId);
                } else {
                    this.sounds.play('ERROR');
                }
            };
        }
    } // end showShop

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

        // Restore mobile action bar
        if (window.innerWidth <= 768) {
            this.elements.btnEnd.style.display = '';
            this.elements.btnBuy.textContent = 'SHOP';
            this.elements.btnBuy.onclick = () => { this.handleBuy(); };
            this.elements.btnBuy.parentNode.style.justifyContent = '';
            this.elements.btnBuy.parentNode.style.width = '';
            const mobileBuyBtn = document.getElementById('mobile-shop-buy');
            if (mobileBuyBtn) {
                mobileBuyBtn.style.display = 'none';
                mobileBuyBtn.style.visibility = 'hidden';
            }
            const previewCard = document.getElementById('shop-preview-card');
            if (previewCard) previewCard.classList.add('hidden');
        }
    }

    async runAIActionPhase() {
        if (this.processingTurn) return;
        this.processingTurn = true;
        this.elements.btnEnd.disabled = true;
        this.elements.btnBuy.disabled = true;

        this.sounds.play('TURN_START');
        this.log("AI Opponent is thinking...", "system");
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            const speedMap = { '0': 1500, '1': 900, '2': 0 };
            const stepDelayMs = speedMap[this.aiSpeed] !== undefined ? speedMap[this.aiSpeed] : 900;
            
            let boughtUnits = [];

            if (stepDelayMs > 0) {
                // ===  STEP-BY-STEP AI REPLAY  ===
                const stepsProxy = this.pyodide.runPython(`
                    global_steps_py = ai.plan_turn(game, engine)
                    global_steps_py
                `);
                const numSteps = stepsProxy.length;

                for (let i = 0; i < numSteps; i++) {
                    const step = stepsProxy.get(i);
                    if (step.get('type') === 'end') {
                        step.destroy();
                        break;
                    }

                    const label = this.pyodide.runPython(`ai.execute_step(game, engine, global_steps_py[${i}])`);

                    this.log(`🤖 AI: ${label}`, 'opponent');

                    // Visual/Audio cues for AI Actions
                    if (label.includes('Bought')) {
                        this.sounds.play('BUY');
                    } else if (label.includes('Energizer') || label.includes('Miner') || label.includes('Wall') || label.includes('Repeater')) {
                        this.sounds.play('CLICK');
                    }

                    this.syncState();
                    this.updateUI();

                    // Trigger shine if a unit was bought
                    if (label.includes('Bought')) {
                        const boughtMatch = label.match(/Bought\s+(\w+)/i);
                        if (boughtMatch && boughtMatch[1]) {
                            this._triggerBuyAnimation(boughtMatch[1].toLowerCase());
                        }
                    }

                    step.destroy();
                    await new Promise(resolve => setTimeout(resolve, stepDelayMs));
                }
                stepsProxy.destroy();

                // 3. End turn and transition
                const endMsg = this.pyodide.runPython(`
                    engine.end_phase()
                    engine.end_turn()
                    game.current_player.units_purchased = 0
                    engine.start_phase()
                    engine.block_phase()
                    res_msg = ""
                    if game.phase == "Block":
                        total_atk = sum(u.attack for u in engine.attacking_units)
                        res_msg = f"INCOMING: {total_atk}"
                    else:
                        engine.action_phase()
                    res_msg
                `);

                if (endMsg) {
                    this.log(`🚨 ${endMsg} damage incoming! Assign your blockers.`, 'important');
                }
            } else {
                // ===  INSTANT: single-batch (original behavior)  ===
                const resultProxy = this.pyodide.runPython(`
                    summary = ai.execute_turn(game, engine)
                    game.current_player.units_purchased = 0
                    engine.end_phase()
                    engine.end_turn()
                    engine.start_phase()
                    engine.block_phase()
                    res_msg = ""
                    if game.phase == "Block":
                        total_atk = sum(u.attack for u in engine.attacking_units)
                        res_msg = f"INCOMING: {total_atk}"
                    else:
                        engine.action_phase()
                    {"summary": summary, "msg": res_msg}
                `);
                const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
                resultProxy.destroy();

                if (result.summary && result.summary.length > 0) {
                    this.log(`AI Actions: ${result.summary.join(", ")}`, 'opponent');
                    result.summary.forEach(action => {
                        if (action.includes('Bought')) {
                            const boughtMatch = action.match(/Bought\s+(\w+)/i);
                            if (boughtMatch && boughtMatch[1]) {
                                boughtUnits.push(boughtMatch[1].toLowerCase());
                            }
                        }
                    });
                }
                if (result.msg) {
                    this.log(`🚨 ${result.msg} damage incoming! Assign your blockers.`, 'important');
                }
            }

            this.syncState();
            this.updateUI();

            if (boughtUnits.length > 0) {
                boughtUnits.forEach(u => this._triggerBuyAnimation(u));
            }

            if (this.state.phase !== 'Block') {
                this.log("Your turn!", "player1");
            }

        } catch (aiError) {
            console.error("AI turn error:", aiError);
            this.log("AI turn failed: " + aiError.message, "important");
            this.pyodide.runPython(`
                game.current_player.units_purchased = 0
                if game.phase != "Action":
                    engine.action_phase()
            `);
            this.syncState();
            this.updateUI();
        }

        this.processingTurn = false;
        this.elements.btnEnd.disabled = false;
        this.elements.btnBuy.disabled = false;
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

        // Stats hidden as requested
        statsEl.style.display = 'none';

        descEl.innerHTML = this.unitDescriptions[unit.type] || 'A strategic unit.';
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
            this.pyodide.runPython(`game.player1.gold += ${n} `);
            this.syncState();
            this.updateUI();
            console.log(`Added ${n} Gold.`);
        };

        window.addEnergy = (n) => {
            this.pyodide.runPython(`game.player1.energy += ${n} `);
            this.syncState();
            this.updateUI();
            console.log(`Added ${n} Energy.`);
        };

        window.addAttack = (n) => {
            this.pyodide.runPython(`game.player1.displayed_attack += ${n} `);
            this.syncState();
            this.updateUI();
            console.log(`Added ${n} Attack power(UI only, use properly for logic).`);
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
            this.sounds.play('CLICK');

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
        if (this.elements.btnLogToggle) {
            this.elements.btnLogToggle.onclick = () => {
                this.sounds.play('CLICK');
                if (!this.elements.combatLogWrapper) return;
                this.elements.combatLog.classList.toggle('expanded');
                const isExpanded = this.elements.combatLog.classList.contains('expanded');
                this.elements.btnLogToggle.innerHTML = isExpanded ? '❌' : '📜';
            };
        }

        // Initialize Modals - Close Button (shop only, not settings)
        const closeBtns = document.querySelectorAll('#shop-modal .close-btn');
        closeBtns.forEach(btn => {
            btn.onclick = () => {
                this.sounds.play('CLICK');
                this.hideShop();
            };
        });

        // Close shop modal on outside click
        this.elements.shopModal.onclick = (e) => {
            if (e.target === this.elements.shopModal) {
                this.sounds.play('CLICK');
                this.hideShop();
            }
        };

        // Settings
        const updateSettingsButtons = (isMainMenu) => {
            const actionsDiv = document.querySelector('.settings-actions');
            if (actionsDiv) {
                actionsDiv.style.display = isMainMenu ? 'none' : '';
            }
            const playerNameDiv = document.getElementById('setting-player-name');
            if (playerNameDiv) {
                playerNameDiv.style.display = isMainMenu ? '' : 'none';
            }
        };

        this.elements.btnSettings.onclick = () => {
            this.sounds.play('CLICK');
            updateSettingsButtons(false);

            // Show/hide AI speed setting based on game mode
            const aiSpeedItem = document.getElementById('setting-ai-speed');
            if (aiSpeedItem) {
                aiSpeedItem.style.display = this.gameMode === 'AI' ? '' : 'none';
            }

            this.elements.settingsModal.classList.remove('hidden');
        };

        // Output logic for AI Speed setting
        this.aiSpeed = '0'; // default (1x)
        const speedSlider = document.getElementById('ai-speed-slider');
        const speedDisplay = document.getElementById('ai-speed-display');
        const speedLabels = ['1x', '2x', '5x'];

        if (speedSlider && speedDisplay) {
            speedSlider.addEventListener('input', (e) => {
                this.aiSpeed = e.target.value;
                speedDisplay.textContent = speedLabels[this.aiSpeed] || '1x';
            });

            speedSlider.addEventListener('change', () => {
                this.sounds.play('CLICK');
            });
        }

        // UI Scale slider
        if (this.elements.sliderUIScale) {
            this.elements.sliderUIScale.addEventListener('input', (e) => {
                const scale = parseInt(e.target.value) / 10;
                this._applyUIScale(scale);
            });
            this.elements.sliderUIScale.addEventListener('change', () => {
                this.sounds.play('CLICK');
            });
        }

        const btnMainSettings = document.getElementById('btn-main-settings');
        if (btnMainSettings) {
            btnMainSettings.onclick = () => {
                this.sounds.play('CLICK');
                updateSettingsButtons(true);
                this.elements.settingsModal.classList.remove('hidden');
            };
        }

        this.elements.closeSettings.onclick = () => {
            this.sounds.play('CLICK');
            this.elements.settingsModal.classList.add('hidden');
        };

        // Close settings on outside click
        this.elements.settingsModal.onclick = (e) => {
            if (e.target === this.elements.settingsModal) {
                this.sounds.play('CLICK');
                this.elements.settingsModal.classList.add('hidden');
            }
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
                this.showWelcomeScreen();
                document.title = 'Build Order | Strategic Card Battle';
                if (this.gameMode === 'ONLINE') {
                    this.multiplayer.disconnect();
                }
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
                this.showWelcomeScreen();
                document.title = 'Build Order | Strategic Card Battle';
                if (this.gameMode === 'ONLINE') {
                    this.multiplayer.disconnect();
                }
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

        if (this.elements.endgameWinner) this.elements.endgameWinner.textContent = `Winner: ${winnerName} `;
        if (this.elements.endgameTurns) this.elements.endgameTurns.textContent = this.state.turn;
        if (this.elements.endgameUnits) this.elements.endgameUnits.textContent = unitsBought;
        if (this.elements.endgameGold) this.elements.endgameGold.textContent = winnerState ? winnerState.gold : 0;
        if (this.elements.endgameEnergy) this.elements.endgameEnergy.textContent = winnerState ? winnerState.energy : 0;

        if (this.elements.endgameModal) this.elements.endgameModal.classList.remove('hidden');
    }
    initCustomCursor() {
        const cursor = document.getElementById('custom-cursor');
        if (!cursor) return;

        let mouseX = -100;
        let mouseY = -100;
        let scale = 1;

        const updateCursor = () => {
            cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) scale(${scale})`;
            requestAnimationFrame(updateCursor);
        };
        requestAnimationFrame(updateCursor);

        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            if (!cursor.classList.contains('active')) {
                cursor.classList.add('active');
            }
        }, { passive: true });

        window.addEventListener('mousedown', () => {
            cursor.classList.add('holding');
        }, { passive: true });

        window.addEventListener('mouseup', () => {
            cursor.classList.remove('holding');
        }, { passive: true });

        // Delegation for hover scaling - using mouseover to handle dynamically added elements
        document.addEventListener('mouseover', (e) => {
            const interactable = e.target.closest('button, .unit-card, .shop-list-item, .ai-choice, .close-btn, .icon-btn, .log-toggle-btn, .action-btn, .copy-btn, .settings-actions .menu-btn');
            if (interactable) {
                scale = 1.25;
            } else {
                scale = 1;
            }
        }, { passive: true });
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
        this.musicVolume = 0.5;
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
            'UNIT_HOVER': 'hover.wav',
            'TURN_START': 'turn-start.mp3'
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
        if (!this.enabled) return;

        if (this.bgMusic) {
            // Prevent restarting if it points to the same track
            if (this.bgMusic.src.includes(encodeURI(src))) {
                if (this.bgMusic.paused) this.bgMusic.play().catch(e => console.log("Music blocked"));
                return;
            }

            // Crossfade
            const oldMusic = this.bgMusic;
            const startVol = oldMusic.volume;
            let steps = 20;
            let step = 0;

            const newMusic = new Audio(this.basePath + src + '?v=2');
            newMusic.loop = true;
            newMusic.volume = 0;
            newMusic.play().catch(e => console.log("Music blocked"));

            const fadeInterval = setInterval(() => {
                step++;
                const fraction = step / steps;

                oldMusic.volume = Math.max(0, startVol * (1 - fraction));
                newMusic.volume = this.musicVolume * fraction;

                if (step >= steps) {
                    clearInterval(fadeInterval);
                    oldMusic.pause();
                    newMusic.volume = this.musicVolume;
                }
            }, 1000 / steps); // 1.0 second crossfade

            this.bgMusic = newMusic;
        } else {
            this.bgMusic = new Audio(this.basePath + src + '?v=2');
            this.bgMusic.loop = true;
            this.bgMusic.volume = this.musicVolume;
            this.bgMusic.play().catch(e => console.log("Music blocked"));
        }
    }
}

// Start
const game = new PrismataWeb();
window.addEventListener('load', () => game.init());
