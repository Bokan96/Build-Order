/**
 * Prismata Lite - Web Bridge
 * Connects the Python game logic to the glassmorphism UI.
 */

const UNIT_KEYS = ['miner', 'energizer', 'striker', 'guard', 'wall', 'repeater', 'volatile', 'barrier'];

// Shop catalogue: gold cost and lifetime cap per unit (mirrors units.py / game_state.py)
const SHOP_UNITS = [
    { id: 'barrier', name: 'Barrier', cost: 1, cap: 5 },
    { id: 'miner', name: 'Miner', cost: 2, cap: 5 },
    { id: 'energizer', name: 'Energizer', cost: 2, cap: 5 },
    { id: 'striker', name: 'Striker', cost: 3, cap: 5 },
    { id: 'guard', name: 'Guard', cost: 3, cap: 5 },
    { id: 'wall', name: 'Wall', cost: 3, cap: 3 },
    { id: 'repeater', name: 'Repeater', cost: 3, cap: 5 },
    { id: 'volatile', name: 'Volatile', cost: 4, cap: 5 }
];

class PrismataWeb {
    constructor() {
        this.pyodide = null;
        this.gameState = null;
        this.gameEngine = null;
        this.aiAgent = null;
        this.isLoaded = false;
        this.selectedAI = null;
        this.gameMode = 'AI'; // 'AI', 'HOTSEAT', or 'ONLINE'
        this.processingTurn = false; // True while an end-turn (incl. AI turn) is being resolved
        this.gameSession = 0; // Bumped on every new/abandoned game so stale async AI loops stop
        this.endGameShown = false;
        this._lastHp = {}; // Base HP seen per seat, for damage popups
        this._maxHp = {}; // Starting base HP per seat, for the health bars
        this._flyingUids = new Set(); // Bought cards whose fly-in ghost hasn't landed yet
        this._recapStart = null; // Opponent's unit counts at the start of their turn
        this.hasInteracted = false;
        this.isTurnTransitioning = false; // Prevents actions during "Begin Turn" banner
        this.isTutorial = false;
        this.tutorialHold = false; // Suppresses tutorial updates while an end-turn is resolving
        this.tutorialStep = 0;
        this.lastTutorialStep = -1;
        this.lastTutorialSubState = "";

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
            uiScaleDisplay: document.getElementById('ui-scale-display'),
            btnHowToPlay: document.getElementById('btn-how-to-play')
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
        this.isTutorial = false; // Always reset when entering menu

        // Clear tutorial UI if coming from tutorial
        const overlay = document.querySelector('.tutorial-overlay');
        if (overlay) overlay.remove();
        this.clearTutorialHighlights();

        this.elements.welcomeScreen.classList.remove('hidden');
        if (this.sounds && this.hasInteracted) {
            this.sounds.startMusic('bg_music - Aetherium_Chronicles.mp3');
        }
        this._initParallaxBg();

        // Prompt first-time players
        if (!localStorage.getItem('tutorialCompleted') && !localStorage.getItem('tutorialPromptDismissed')) {
            setTimeout(() => this._showTutorialPrompt(), 500);
        }
    }

    _showTutorialPrompt() {
        if (document.getElementById('tutorial-prompt-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'tutorial-prompt-overlay';
        overlay.className = 'tutorial-overlay';
        overlay.style.zIndex = '10005';

        overlay.innerHTML = `
            <div class="tutorial-box glass primary animate-in" style="max-width: 500px; text-align: center; padding: 2rem;">
                <h2 style="margin-bottom: 1rem; color: var(--accent-primary);">Welcome to Build Order!</h2>
                <p style="margin-bottom: 2rem; font-size: 1.2rem;">It looks like this is your first time playing. Would you like to play the tutorial?</p>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button id="btn-tutorial-yes" class="action-btn accent">Yes, Start Tutorial</button>
                    <button id="btn-tutorial-no" class="action-btn danger">No, Skip</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('btn-tutorial-yes').onclick = () => {
            this.sounds.play('CLICK');
            overlay.remove();
            this.startTutorial();
        };

        document.getElementById('btn-tutorial-no').onclick = () => {
            this.sounds.play('CLICK');
            localStorage.setItem('tutorialPromptDismissed', 'true');
            overlay.remove();
        };
    }

    initUIScale() {
        const saved = localStorage.getItem('uiScale');
        let scale;
        if (saved !== null) {
            scale = parseFloat(saved);
        } else {
            // Auto-detect based on physical screen width
            const w = window.screen.width;
            if (w <= 1366) scale = 0.85;
            else if (w <= 1920) scale = 1.0;
            else if (w <= 2560) scale = 1.2;
            else scale = 1.4;
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
                        x = (col * cellW) - w / 4 + Math.random() * cellW;
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
                this.onlineGameReady = false;

                // Immediately setup callbacks so we don't miss handshakes
                this.setupMultiplayerCallbacks();

                // Send own name
                const inputNameEl = document.getElementById('player-name-input');
                // Same default setupGame uses for our own seat, so both peers show identical names
                const defaultName = this.isHost ? 'Player 1' : 'Player 2';
                const myName = (inputNameEl && inputNameEl.value.trim() !== '') ? inputNameEl.value.trim() : defaultName;

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
                lobbyCreate.classList.add('hidden');
                lobbyChoice.classList.remove('hidden');
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
            if (action && action.type === 'handshake') {
                const name = String(action.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 12);
                this.opponentName = name || null;
                // Handshake arrived after the game was set up: rename the opponent in place
                if (this.opponentName && this.onlineGameReady) {
                    this._runPy(`(game.player2 if r_opp_is_p2 else game.player1).name = r_name`,
                        { r_opp_is_p2: this.isHost, r_name: this.opponentName });
                    this.syncState();
                    this.updateUI();
                }
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
                this._abandonGame();
                this.multiplayer.disconnect();
                this.elements.app.classList.add('hidden');
                this.showWelcomeScreen();
                document.title = 'Build Order | Strategic Card Battle';
            };
        }
    }

    // Run Python with JS values bound as globals, so untrusted data is never spliced into code
    _runPy(code, vars = {}) {
        for (const [name, value] of Object.entries(vars)) {
            this.pyodide.globals.set(name, value);
        }
        return this.pyodide.runPython(code);
    }

    _isValidRemoteAction(a) {
        if (!a || typeof a !== 'object' || typeof a.type !== 'string' || !this.state) return false;
        // Only the side that is currently acting may send moves (the attacker during Breach)
        const remoteIsP1 = !this.isHost;
        if (this.isP1Turn() !== remoteIsP1) return false;

        const isUnit = (t) => UNIT_KEYS.includes(t);
        const isNum = (n) => Number.isInteger(n) && n >= 1 && n <= 10;
        switch (a.type) {
            case 'buy':
            case 'block':
                return isUnit(a.unitType);
            case 'prepare':
            case 'ability':
            case 'undo':
                return isUnit(a.unitType) && isNum(a.unitNumber);
            case 'breach':
                return isUnit(a.unitType) && isNum(a.unitNumber) && typeof a.isP1Target === 'boolean';
            case 'repeaterTarget':
                return isUnit(a.targetType) && isNum(a.targetNumber) && isNum(a.sourceNumber);
            case 'endTurn':
                return true;
            default:
                return false;
        }
    }

    receiveRemoteAction(action) {
        if (!this._isValidRemoteAction(action)) {
            console.warn('[Online] Ignoring invalid or out-of-turn remote action:', action);
            return;
        }

        this.isRemoteAction = true;

        try {
            switch (action.type) {
                case 'buy':
                    // Call engine directly — bypasses shop UI guards
                    this._runPy(`engine.buy_unit(r_type)`, { r_type: action.unitType });
                    this.log(`Opponent bought ${action.unitType}`, 'opponent');
                    this.syncState();
                    this.updateUI();
                    break;

                case 'prepare':
                    this._runPy(`engine.prepare_unit_attack(r_type, r_num)`,
                        { r_type: action.unitType, r_num: action.unitNumber });
                    this.syncState();
                    this.updateUI();
                    break;

                case 'ability':
                    this._runPy(`engine.use_ability(r_type, r_num)`,
                        { r_type: action.unitType, r_num: action.unitNumber });
                    this.syncState();
                    this.updateUI();
                    break;

                case 'undo':
                    this._runPy(`engine.undo_action(r_type, r_num)`,
                        { r_type: action.unitType, r_num: action.unitNumber });
                    this.syncState();
                    this.updateUI();
                    break;

                case 'block':
                    this._runPy(`engine.assign_blockers([(r_type, 1)])`, { r_type: action.unitType });
                    this.syncState();
                    this.updateUI();
                    break;

                case 'breach':
                    this._runPy(`
                        defender = game.player1 if r_p1_target else game.player2
                        units = defender.get_units_by_type(r_type)
                        if 1 <= r_num <= len(units):
                            engine.resolve_combat([(r_type, units[r_num - 1].current_health)])
                    `, { r_type: action.unitType, r_num: action.unitNumber, r_p1_target: action.isP1Target });
                    // The attacker sends 'endTurn' once all damage is assigned; don't end the breach here
                    this.syncState();
                    this.updateUI();
                    break;

                case 'endTurn':
                    this.handleEndTurn();
                    break;

                case 'repeaterTarget':
                    this._runPy(`
                        targets = game.current_player.get_units_by_type(r_target_type)
                        if 1 <= r_target_num <= len(targets):
                            engine.use_ability("repeater", r_num, target=targets[r_target_num - 1])
                    `, { r_target_type: action.targetType, r_target_num: action.targetNumber, r_num: action.sourceNumber });
                    this.syncState();
                    this.updateUI();
                    break;
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

                this.setupMobileLayout();

                // Clear state triggers before first updateUI
                this.currentTurnPlayer = null;
                this.updateUI();

                // Delay first turn sound to match banner
                if (this.state && this.state.turn === 1) {
                    setTimeout(() => {
                        this.sounds.play('TURN_START');
                    }, 1000);
                } else {
                    this.sounds.play('TURN_START');
                }
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

        // Stop any async work (AI turns, banners) that belongs to the previous game
        this._abandonGame();
        this.endGameShown = false;
        this.onlineGameReady = this.gameMode === 'ONLINE';
        this._lastHp = {}; // Base HP seen per seat, for damage popups
        this._maxHp = {};

        // Initialize GameState and GameEngine instances in Python.
        // Names come from user input / the remote peer, so they're passed as globals, never spliced into code.
        this._runPy(`
            # Create a dummy logger for the AI
            class DummyLogger:
                def write(self, msg):
                    pass
                def flush(self):
                    pass

            game = GameState(r_p1_name, r_p2_name)
            game.setup_game()
            engine = GameEngine(game)

            # Start the first turn properly
            engine.start_phase()
            engine.action_phase()

            if r_is_tutorial:
                # Tutorial starting conditions: 2HP each, 6 Gold, 0 Energy, empty board
                game.player1.base_health = 2
                game.player2.base_health = 2
                game.player1.gold = 6
                game.player1.energy = 0
                game.player1.units = []
                game.player2.units = []
                game.player1.lifetime_units = {}
                game.player2.lifetime_units = {}
            
            # Only create AI agent if not in HOTSEAT mode
            ai = None
            if r_game_mode != "HOTSEAT":
                ai = Agent(r_ai_type, logger=DummyLogger(), interactive=False)
            
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
                            "atkCost": u.attack_cost,
                            "blk": u.block,
                            "type": u.name.lower(),
                            "isAlive": u.is_alive(),
                            "usedThisTurn": u.used_this_turn,
                            "attacking": u in engine.attacking_units or u in game.pending_attackers or u in engine.prepared_squad,
                            "blocking": u in engine.blocking_units
                        } for u in sorted_units]
                    }
                
                return {
                    "phase": game.phase,
                    "turn": game.turn_number,
                    "currentPlayer": game.current_player.name,
                    # Turn ownership by seat, not name (both players may pick the same name)
                    "currentIsP1": game.current_player is game.player1,
                    "p1": serialize_player(game.player1),
                    "p2": serialize_player(game.player2),
                    "gameOver": game.game_over,
                    "winner": game.winner.name if game.winner else None,
                    "winnerIsP1": game.winner is game.player1,
                    "combat": {
                        "atk": sum(u.attack for u in engine.attacking_units),
                        "blk": sum(u.block for u in engine.blocking_units),
                        "assigned": engine.assigned_damage
                    }
                }
        `, {
            r_p1_name: p1Name,
            r_p2_name: p2Name,
            r_is_tutorial: this.isTutorial,
            r_game_mode: this.gameMode,
            r_ai_type: aiType
        });

        this.syncState();
    }

    syncState() {
        const bundleProxy = this.pyodide.runPython("get_ui_bundle()");
        this.state = bundleProxy.toJs({ dict_converter: Object.fromEntries });
        bundleProxy.destroy();

        // Hotfix: For Breach phase, UI should treat Attacker as active player
        // This ensures proper interaction targeting (Attacker clicks Defender units)
        if (this.state.phase === 'Breach') {
            this.state.currentIsP1 = !this.state.currentIsP1;
            this.state.currentPlayer = this.state.currentIsP1 ? this.state.p1.name : this.state.p2.name;
        }
    }

    // True when Player 1's seat is the active one (the attacker during Breach)
    isP1Turn() {
        return !!(this.state && this.state.currentIsP1);
    }

    // Invalidate the running game's async work (AI loops) and clear its input locks
    _abandonGame() {
        this.gameSession++;
        this.processingTurn = false;
        this.isTurnTransitioning = false;
        this.tutorialHold = false;
        this.aiThinking = false;
        const aiPlate = document.querySelector('#opponent-area .player-stats-bar');
        if (aiPlate) aiPlate.classList.remove('thinking');
        this._flyingUids.clear();
        this._recapStart = null;
        const recap = document.getElementById('recap-toast');
        if (recap) recap.classList.remove('visible');
        document.body.classList.remove('lockout');
        if (this.targeting) {
            this.targeting = null;
            const cancelBtn = document.getElementById('btn-cancel-target');
            if (cancelBtn) cancelBtn.remove();
        }
    }

    // Release the end-turn lock, unless a newer game has taken over since `session` started
    _endProcessing(session) {
        if (session !== this.gameSession) return;
        this.processingTurn = false;
        if (!this.isTurnTransitioning) {
            document.body.classList.remove('lockout');
            // No banner is pending to release the tutorial hold (the turn didn't change hands)
            if (this.tutorialHold) {
                this.tutorialHold = false;
                if (this.isTutorial && this.state) {
                    this.updateTutorialUI();
                    this.applyTutorialHighlights();
                }
            }
        }
        if (this.state) this.updateActionButtons();
    }

    // Sleep, then report whether the game that started this wait is still the active one
    async _waitSession(ms, session) {
        if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms));
        return session === this.gameSession;
    }

    updateUI() {
        if (!this.state) return;

        if (this.state.gameOver && !this.endGameShown) {
            this.endGameShown = true; // Show the modal (and play the sound) only once
            this.showEndGameScreen();
        }

        // Update Header
        document.getElementById('turn-count').textContent = this.state.turn;

        // Format phase name (e.g. ActionPhase -> ACTION PHASE)
        let phaseText = this.state.phase;
        if (phaseText.toLowerCase().includes('phase')) {
            // Already includes "Phase" or "ActionPhase"
            phaseText = phaseText.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
        } else {
            // Append "PHASE" (e.g. "Action" -> "ACTION PHASE")
            phaseText = phaseText.toUpperCase() + " PHASE";
        }

        document.getElementById('phase-name').textContent = phaseText;
        document.getElementById('player-name-display').textContent = this.state.currentPlayer.toUpperCase();

        // Phase tracker (Block › Breach › Action): highlight the current step, mark earlier ones done
        const phaseOrder = ['Block', 'Breach', 'Action'];
        const phaseIndex = phaseOrder.indexOf(this.state.phase);
        document.querySelectorAll('#phase-steps li').forEach(li => {
            const i = phaseOrder.indexOf(li.dataset.phase);
            li.classList.toggle('current', i === phaseIndex);
            li.classList.toggle('done', phaseIndex > -1 && i < phaseIndex);
        });

        // Update Tab Title
        const playerShort = this.isP1Turn() ? 'P1' : 'P2';
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

        // Trigger Turn Transition Banner (keyed by seat so identical names still switch)
        const turnKey = this.isP1Turn() ? 'p1' : 'p2';
        if (this.currentTurnPlayer !== turnKey) {
            const oldPlayer = this.currentTurnPlayer;
            this.currentTurnPlayer = turnKey;
            this._trackRecap(turnKey);

            const triggerBanner = () => {
                const banner = document.getElementById('turn-banner');
                const bannerText = document.getElementById('turn-banner-text');
                if (banner && bannerText) {
                    bannerText.textContent = `${this.state.currentPlayer.toUpperCase()}'S TURN`;

                    // Reset animation by cloning and replacing node
                    const newBanner = banner.cloneNode(true);
                    banner.parentNode.replaceChild(newBanner, banner);

                    newBanner.classList.remove('hidden');
                    newBanner.classList.toggle('them', turnKey !== (this._localSeat() || 'p1')); // purple for the opponent
                    this.isTurnTransitioning = true; // Lock interaction
                    document.body.classList.add('lockout'); // Visual lockout

                    setTimeout(() => {
                        newBanner.classList.add('hidden');
                        this.isTurnTransitioning = false; // Unlock interaction
                        // Visual unlock, unless a turn (e.g. the AI's) is still being resolved
                        if (!this.processingTurn) document.body.classList.remove('lockout');

                        // RE-UPDATE BUTTONS: Ensure buttons return to 1.0 opacity after transition ends
                        this.updateActionButtons();

                        if (this.isTutorial) {
                            this.tutorialHold = false; // The new turn is on screen; tutorial may update again
                            this.updateTutorialUI();
                            this.applyTutorialHighlights();
                        }
                    }, 1200); // matches the ribbonIn animation in style.css
                }
            };

            // Delay for the very first turn of the game
            if (this.state.turn === 1 && !oldPlayer) {
                this.isTurnTransitioning = true; // Lock tutorial/UI immediately
                setTimeout(triggerBanner, 600);
            } else {
                triggerBanner();
            }
        }

        // Update Stats
        this.updatePlayerStats('p1', this.state.p1);
        this.updatePlayerStats('p2', this.state.p2);

        // Render Units
        // In AI mode, P1 is always friendly, P2 is AI.
        // In HOTSEAT mode, 'isFriendly' depends on who is the 'currentPlayer' in the state.
        const isP1Turn = this.isP1Turn();

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

        // Dim the side that isn't acting. In Breach the attacker clicks the defender's units, so those stay bright.
        const activeIsP1 = this.state.phase === 'Breach' ? !isP1Turn : isP1Turn;
        const dimSides = !this.state.gameOver;
        document.getElementById('player-area').classList.toggle('inactive-side', dimSides && !activeIsP1);
        document.getElementById('opponent-area').classList.toggle('inactive-side', dimSides && activeIsP1);

        // Seat colours + YOU tag: cyan for you, purple for the opponent (hotseat: seat 1 cyan, seat 2 purple)
        const localSeat = this._localSeat();
        const mySeat = localSeat || 'p1';
        document.getElementById('player-area').classList.toggle('them', mySeat !== 'p1');
        document.getElementById('opponent-area').classList.toggle('them', mySeat !== 'p2');
        document.getElementById('p1-you').classList.toggle('hidden', localSeat !== 'p1');
        document.getElementById('p2-you').classList.toggle('hidden', localSeat !== 'p2');

        // Update Central Attack
        this.updateCentralAttack();

        // Update Buttons
        this.updateActionButtons();

        // "What now" hint next to the buttons
        this.updateTurnHint();

        // Tutorial last: renderUnits rebuilds the unit columns, which would drop any highlight applied earlier
        if (this.isTutorial) {
            this.updateTutorialUI();
            this.applyTutorialHighlights();
        }
    }

    updatePlayerStats(player, data) {
        // Base damage pops a red number over the ❤️ (skipped on a game's first render)
        const lastHp = this._lastHp[player];
        if (lastHp !== undefined && data.hp < lastHp) {
            const r = document.getElementById(`${player}-hp`).getBoundingClientRect();
            this._spawnFloatText(r.left + r.width / 2, r.top - 6, `-${lastHp - data.hp}`, 'damage');
            this._flashBaseHit(player);
        }
        this._lastHp[player] = data.hp;
        this._renderHpBar(player, data.hp, lastHp);

        document.getElementById(`${player}-hp`).textContent = data.hp;

        // Update player name display
        const nameEl = document.getElementById(`${player}-name`);
        if (nameEl) {
            nameEl.textContent = data.name.toUpperCase();
        }

        // Add glow to active player's stats bar
        const statsBar = document.querySelector(`#${player === 'p1' ? 'player-area' : 'opponent-area'} .player-stats-bar`);
        if (statsBar) {
            if ((player === 'p1') === this.isP1Turn()) {
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

    // Segmented base-health bar under the player's name; pips lost since the last update flash
    _renderHpBar(player, hp, lastHp) {
        const bar = document.getElementById(`${player}-hp-bar`);
        if (!bar) return;
        if (this._maxHp[player] === undefined) this._maxHp[player] = Math.max(1, hp); // 10, or 2 in the tutorial
        const max = Math.min(20, Math.max(this._maxHp[player], hp));
        if (bar.children.length !== max) {
            bar.innerHTML = '';
            for (let i = 0; i < max; i++) {
                const pip = document.createElement('span');
                pip.className = 'hp-pip';
                bar.appendChild(pip);
            }
        }
        Array.from(bar.children).forEach((pip, i) => {
            const lost = i >= hp;
            pip.classList.toggle('lost', lost);
            if (lost && lastHp !== undefined && i < lastHp) {
                pip.classList.remove('just-lost');
                void pip.offsetWidth; // restart the flash
                pip.classList.add('just-lost');
            }
        });
        bar.title = `Base health: ${Math.max(0, hp)} / ${max}`;
    }

    // Attack meter between the two sides: what the number means, and an arrow toward the defender
    updateCentralAttack() {
        const s = this.state;
        const combat = s.combat || { atk: 0, blk: 0, assigned: 0 };
        const isP1Turn = this.isP1Turn();
        let mode = 'idle', value = 0, label = '', breakdown = '', attackerIsP1 = null;

        if (s.phase === 'Block') {
            // The current player is defending against the other seat
            value = Math.max(0, combat.atk - combat.blk);
            if (value > 0) {
                mode = 'incoming';
                label = 'INCOMING';
                attackerIsP1 = !isP1Turn;
                breakdown = combat.blk > 0 ? `${combat.atk} incoming · ${combat.blk} blocked` : `${combat.atk} incoming`;
            } else if (combat.atk > 0) {
                label = 'BLOCKED';
                breakdown = `${combat.atk} incoming · all blocked`;
            }
        } else if (s.phase === 'Breach') {
            value = Math.max(0, combat.atk - combat.blk - combat.assigned);
            mode = 'assign';
            label = 'ASSIGN';
            attackerIsP1 = isP1Turn; // Breach makes the attacker the active seat
            breakdown = 'unblocked damage';
        } else {
            const active = isP1Turn ? s.p1 : s.p2;
            value = (active && active.atk) || 0;
            if (value > 0) {
                mode = 'attack';
                label = 'ATTACK';
                attackerIsP1 = isP1Turn;
                breakdown = 'hits next turn';
            }
        }
        if (s.gameOver) {
            mode = 'idle';
            label = '';
            breakdown = '';
            attackerIsP1 = null;
        }

        const container = document.getElementById('central-attack-container');
        const atkEl = document.getElementById('central-atk');
        if (!container || !atkEl) return;
        // The meter itself is just the number + arrow; the label/breakdown only live in its tooltip
        atkEl.textContent = value;
        container.classList.remove('mode-idle', 'mode-attack', 'mode-incoming', 'mode-assign', 'toward-p1', 'toward-p2');
        container.classList.add(`mode-${mode}`);
        if (attackerIsP1 !== null) container.classList.add(attackerIsP1 ? 'toward-p2' : 'toward-p1');
        container.title = label ? `${label}: ${value}${breakdown ? ' (' + breakdown + ')' : ''}` : 'Attack';
    }

    updateResourceDisplay(id, checkVal, isHp = false) {
        const el = document.getElementById(id);
        const oldVal = parseInt(el.textContent) || 0;

        if (checkVal === 0) {
            el.classList.add('zero-resource');
        } else {
            el.classList.remove('zero-resource');
        }

        if (checkVal !== oldVal) {
            el.textContent = checkVal;
            const animClass = checkVal > oldVal ? 'resource-bump' : 'resource-drop';
            el.classList.add(animClass);
            // Match the shorter animation duration (0.4s)
            setTimeout(() => el.classList.remove(animClass), 400);
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
        // Remember where every card was, so the rebuilt cards can animate from there
        const prevCards = this._snapshotCards(container);
        this._hideActionChip(); // its card is about to be replaced
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
            column.id = `${container.id}-${type}-col`; // Add specific ID for highlighting

            // interactiveIndex: The card that glows and handles clicks (bottom-most/front-most)
            // PRIORITIZE ready units; fall back to undoable
            let interactiveIndex = -1;
            for (let i = unitsByType[type].length - 1; i >= 0; i--) {
                const u = unitsByType[type][i];
                const isBreachPhase = !isFriendly && this.state.phase === 'Breach';
                if (isBreachPhase) {
                    if (u.hp > 0) {
                        interactiveIndex = i;
                        break;
                    }
                } else if (!u.exhausted || (isFriendly && u.type === 'wall')) {
                    interactiveIndex = i;
                    break;
                }
            }
            if (interactiveIndex === -1) {
                for (let i = unitsByType[type].length - 1; i >= 0; i--) {
                    const u = unitsByType[type][i];
                    if (isFriendly && this.state.phase === 'Action' && u.usedThisTurn) {
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
            if (rotationIndex === -1) {
                for (let i = 0; i < unitsByType[type].length; i++) {
                    const u = unitsByType[type][i];
                    if (isFriendly && this.state.phase === 'Action' && u.usedThisTurn) {
                        rotationIndex = i;
                        break;
                    }
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

            const sortedUnits = unitsByType[type].map((unit, index) => ({ unit, originalIndex: index }))
                .sort((a, b) => {
                    if (a.unit.exhausted && !b.unit.exhausted) return -1;
                    if (!a.unit.exhausted && b.unit.exhausted) return 1;
                    return a.originalIndex - b.originalIndex;
                });

            sortedUnits.forEach((item, domIndex) => {
                const unit = item.unit;
                const indexInType = item.originalIndex;
                const card = document.createElement('div');
                const isAttacking = unit.attacking;
                const isBlocking = unit.blocking;
                const isExhausted = unit.exhausted;
                const unitNumber = indexInType + 1;

                card.className = `unit-card ${isExhausted ? 'exhausted' : ''} ${isAttacking ? 'attacking' : ''} ${isBlocking ? 'blocking' : ''}`;
                card.style.zIndex = domIndex;
                const imgUrl = this.unitImages[unit.type];

                // Block Phase: a small badge with the block value on units that can block (art stays visible)
                let overlayHtml = '';
                if (this.state.phase === 'Block' && isFriendly && !unit.exhausted && unit.blk > 0) {
                    overlayHtml = `<div class="block-badge">🛡️ ${unit.blk}</div>`;
                    if (!isBlocking) card.classList.add('can-block');
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
                    if (!this._canHover()) return; // Touch screens use long-press instead
                    e.stopPropagation();
                    this.handleUnitMouseEnter(unit, e);
                    // What a click does: the card's own hint, or its column's (breach targets)
                    this._showActionChip(card.dataset.hint ? card : column);

                    // Lift effect
                    if (card.classList.contains('interactive')) {
                        card.classList.add('column-focus');
                    }
                }, { passive: true });

                card.addEventListener('mouseleave', (e) => {
                    if (!this._canHover()) return;
                    e.stopPropagation();
                    this.handleUnitMouseLeave();
                    this._hideActionChip();
                    card.classList.remove('column-focus');
                }, { passive: true });

                // Touch and Hold Preview for Mobile
                card.addEventListener('touchstart', (e) => {
                    if (this._canHover()) return;
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
                    if (this._canHover()) return;
                    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
                    this.elements.unitPreview.classList.add('hidden');
                    // Also clear any column-focus so card is not "stuck" selected
                    card.classList.remove('column-focus');
                };
                card.addEventListener('touchend', clearTouch, { passive: true });
                card.addEventListener('touchcancel', clearTouch, { passive: true });
                card.addEventListener('touchmove', clearTouch, { passive: true });
                card.addEventListener('contextmenu', (e) => {
                    if (!this._canHover()) e.preventDefault();
                });

                // Interaction Logic
                const canActInAction = isFriendly && this.state.phase === 'Action' && (!isExhausted || unit.type === 'wall' || unit.usedThisTurn);
                const canBlockInBlock = isFriendly && !isExhausted && this.state.phase === 'Block' && unit.blk > 0 && !isBlocking;
                const canDamageInBreach = !isFriendly && this.state.phase === 'Breach' && unit.hp > 0;

                let isInteractive = false;

                if (indexInType === interactiveIndex) {
                    // Action/Block Restricted to Top Card
                    if (canActInAction || canBlockInBlock) {
                        isInteractive = true;
                    }
                }

                // Allow clicking ANY unit that was used this turn to undo it!
                if (isFriendly && this.state.phase === 'Action' && unit.usedThisTurn) {
                    isInteractive = true;
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
                            this.handleUnitClick(unit, unitNumber, column);
                        } else if (canBlockInBlock) {
                            this.handleBlock(unit);
                        } else if (canDamageInBreach) {
                            this.handleAssignDamage(unit, unitNumber, isP1Units, column);
                        }
                    };
                }

                // What a click on this card does (chip on hover, desktop)
                const hint = this._cardHint(unit, { isFriendly, isInteractive, canActInAction, canBlockInBlock });
                if (hint) card.dataset.hint = hint;

                // Mark for rotation animation (Top Card)
                if (indexInType === rotationIndex) {
                    card.classList.add('rotation-target');
                }

                card.dataset.type = type;
                card.dataset.unitNumber = unitNumber;
                card.dataset.uid = unit.id; // Stable across re-renders; used to animate changes
                // A just-bought card stays hidden until its fly-in ghost lands (even if re-rendered meanwhile)
                if (this._flyingUids.has(String(unit.id))) card.style.visibility = 'hidden';
                card.dataset.hp = unit.hp;
                card.dataset.used = unit.usedThisTurn ? '1' : '';

                column.appendChild(card);
            });

            // Stack size, so overlapping cards don't need counting
            const stack = unitsByType[type];
            if (stack.length >= 2) {
                const readyCount = stack.filter(u => !u.exhausted).length;
                const stackBadge = document.createElement('div');
                stackBadge.className = 'stack-count';
                stackBadge.textContent = readyCount < stack.length ? `×${stack.length} · ${readyCount} ready` : `×${stack.length}`;
                column.appendChild(stackBadge);
            }

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
                    const targetName = topUnitInColumn.type.charAt(0).toUpperCase() + topUnitInColumn.type.slice(1);
                    column.dataset.hint = `Destroy ${targetName}: ${hpNeededToKill}⚔️`;
                    column.addEventListener('mouseenter', () => {
                        column.style.transform = 'translateY(-5px)';
                        if (this._canHover()) this._showActionChip(column);
                    });
                    column.addEventListener('mouseleave', () => {
                        column.style.transform = '';
                        this._hideActionChip();
                    });

                    column.appendChild(colMarker);
                    column.onclick = (e) => {
                        e.stopPropagation();
                        this.handleAssignDamage(topUnitInColumn, topUnitIndex, isP1Units, column);
                    };
                }
            }

            container.appendChild(column);
        });

        this._animateCardChanges(container, prevCards);
    }

    // Where each card is now (visually, mid-animation included), keyed by unit id
    _snapshotCards(container) {
        const cards = new Map();
        container.querySelectorAll('.unit-card[data-uid]').forEach(el => {
            const rect = el.getBoundingClientRect();
            const rotate = parseFloat(getComputedStyle(el).rotate) || 0; // 'none' -> 0
            cards.set(el.dataset.uid, {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                rotate,
                exhausted: el.classList.contains('exhausted'),
                hp: parseInt(el.dataset.hp, 10) || 0,
                type: el.dataset.type
            });
        });
        return {
            cards,
            phase: container._renderPhase,
            session: container._renderSession
        };
    }

    // Animate rebuilt cards from their previous angle/position (tap, untap, reorder), and pop
    // floating numbers for resource gains and combat losses
    _animateCardChanges(container, prev) {
        const phase = this.state.phase;
        container._renderPhase = phase;
        container._renderSession = this.gameSession;
        // A new or restarted game replaces every unit; nothing to animate from
        if (prev.session !== this.gameSession) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const cards = Array.from(container.querySelectorAll('.unit-card[data-uid]'));
        const columns = Array.from(container.querySelectorAll('.unit-column'));
        const untapping = cards.filter(el => {
            const old = prev.cards.get(el.dataset.uid);
            return old && old.exhausted && !el.classList.contains('exhausted');
        });
        const isWave = untapping.length >= 2; // turn start: untap one column after another
        const boughtCards = [];

        cards.forEach(el => {
            const old = prev.cards.get(el.dataset.uid);
            if (!old) {
                boughtCards.push(el); // a unit id we haven't seen this game: it was just bought
                return;
            }
            const exhausted = el.classList.contains('exhausted');

            // Resource gains: a unit that just tapped for its ability
            if (!old.exhausted && exhausted && el.dataset.used) {
                const r = el.getBoundingClientRect();
                if (old.type === 'energizer') this._spawnFloatText(r.left + r.width / 2, r.top + r.height / 2, '+1🔋', 'energy');
                if (old.type === 'miner') this._spawnFloatText(r.left + r.width / 2, r.top + r.height / 2, '+1🪙', 'gold');
            }

            if (reduceMotion) return;
            const rect = el.getBoundingClientRect();
            const dx = old.x - (rect.left + rect.width / 2);
            const dy = old.y - (rect.top + rect.height / 2);
            const toRotate = exhausted ? 90 : 0;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(old.rotate - toRotate) < 0.5) return;

            const colIndex = columns.indexOf(el.closest('.unit-column'));
            const delay = isWave && untapping.includes(el) ? Math.max(0, colIndex) * 40 : 0;
            el.animate([
                { translate: `${dx}px ${dy}px`, rotate: `${old.rotate}deg` },
                { translate: '0px 0px', rotate: `${toRotate}deg` }
            ], { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', delay, fill: 'backwards' });
        });

        boughtCards.forEach(el => this._flyInCard(el, container, reduceMotion));

        // Combat losses: units that vanished during blocking/breach pop their HP where they stood
        const inCombat = ['Block', 'Breach'].includes(phase) || ['Block', 'Breach'].includes(prev.phase);
        if (inCombat) {
            const present = new Set(cards.map(el => el.dataset.uid));
            prev.cards.forEach((old, uid) => {
                if (!present.has(uid) && old.hp > 0) this._spawnFloatText(old.x, old.y, `-${old.hp}`, 'damage');
            });
        }
    }

    // Short-lived rising label (e.g. "+1🔋", "-2") at a screen position
    _spawnFloatText(x, y, text, kind) {
        const el = document.createElement('div');
        el.className = `float-text ${kind}`;
        el.textContent = text;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 950);
    }

    // A just-bought card flies in (as a ghost above everything) from the SHOP button, or from the
    // owner's name plate when it's the opponent buying; then it shines in place
    _flyInCard(card, container, reduceMotion) {
        const uid = card.dataset.uid;
        const shine = () => {
            const live = container.querySelector(`.unit-card[data-uid="${uid}"]`);
            if (!live) return;
            live.style.visibility = '';
            live.classList.remove('unit-shine');
            void live.offsetWidth; // restart the animation
            live.classList.add('unit-shine');
            setTimeout(() => live.classList.remove('unit-shine'), 1100);
        };
        if (reduceMotion) {
            shine();
            return;
        }

        const ownerSeat = container.id === 'p1-units' ? 'p1' : 'p2';
        const actingSeat = this.isP1Turn() ? 'p1' : 'p2';
        const shopBtn = this.elements.btnBuy;
        const fromShop = ownerSeat === actingSeat && this._isMyTurn() && shopBtn && shopBtn.offsetParent !== null;
        const source = fromShop ? shopBtn : document.querySelector(`#${ownerSeat === 'p1' ? 'player-area' : 'opponent-area'} .player-stats-bar`);
        if (!source) {
            shine();
            return;
        }

        const from = source.getBoundingClientRect();
        const to = card.getBoundingClientRect();
        const w = card.offsetWidth;
        const h = card.offsetHeight;
        const toX = to.left + to.width / 2;
        const toY = to.top + to.height / 2;
        const ghost = document.createElement('div');
        ghost.className = 'fly-card';
        ghost.style.width = `${w}px`;
        ghost.style.height = `${h}px`;
        ghost.style.left = `${toX - w / 2}px`;
        ghost.style.top = `${toY - h / 2}px`;
        const art = card.querySelector('.unit-art');
        if (art) ghost.style.backgroundImage = art.style.backgroundImage;
        document.body.appendChild(ghost);

        this._flyingUids.add(uid);
        card.style.visibility = 'hidden';
        let landed = false;
        const land = () => {
            if (landed) return;
            landed = true;
            this._flyingUids.delete(uid);
            ghost.remove();
            shine();
        };
        const flight = ghost.animate([
            { translate: `${from.left + from.width / 2 - toX}px ${from.top + from.height / 2 - toY}px`, scale: 0.35, rotate: '0deg', opacity: 0.5 },
            { translate: '0px 0px', scale: 1, rotate: card.classList.contains('exhausted') ? '90deg' : '0deg', opacity: 1 }
        ], { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        flight.onfinish = land;
        flight.oncancel = land;
        setTimeout(land, 900); // safety net if the animation never reports back
    }

    // Base took damage: its plate shakes, and the screen edge flashes red when it's your base
    _flashBaseHit(player) {
        const plate = document.querySelector(`#${player === 'p1' ? 'player-area' : 'opponent-area'} .player-stats-bar`);
        if (plate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            plate.classList.remove('hit');
            void plate.offsetWidth;
            plate.classList.add('hit');
            setTimeout(() => plate.classList.remove('hit'), 500);
        }
        const localSeat = this._localSeat();
        if (localSeat === null || localSeat === player) {
            const flash = document.createElement('div');
            flash.className = 'hit-flash';
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 700);
        }
    }

    // Last-turn recap (AI / online): note the opponent's units when their turn starts, and when mine
    // starts, report what they bought and whether they're attacking
    _trackRecap(turnKey) {
        const localSeat = this._localSeat();
        const s = this.state;
        if (!localSeat || this.isTutorial || !s || s.gameOver) return;
        if (s.phase === 'Breach') return; // the attacker is shown as active during a breach: not a new turn
        const oppSeat = localSeat === 'p1' ? 'p2' : 'p1';

        if (turnKey === oppSeat) {
            this._recapStart = { session: this.gameSession, lifetime: { ...(s[oppSeat].lifetime || {}) } };
            return;
        }
        const start = this._recapStart;
        this._recapStart = null;
        if (!start || start.session !== this.gameSession) return;

        const now = s[oppSeat].lifetime || {};
        const bought = [];
        Object.keys(now).forEach(type => {
            const n = (now[type] || 0) - (start.lifetime[type] || 0);
            if (n > 0) {
                const name = type.charAt(0).toUpperCase() + type.slice(1);
                bought.push(n > 1 ? `${n}× ${name}` : name);
            }
        });
        const attack = s.phase === 'Block' ? ((s.combat && s.combat.atk) || 0) : 0;
        const who = this.gameMode === 'AI' ? 'AI' : 'Opponent';
        const text = `${who} ${bought.length ? 'bought ' + bought.join(' + ') : 'bought nothing'} · ${attack > 0 ? `attacking for ⚔️${attack}` : 'no attack'}`;
        const session = this.gameSession;
        setTimeout(() => {
            if (session === this.gameSession && this.state && !this.state.gameOver) this._showRecap(text);
        }, 1250); // after the turn ribbon
    }

    _showRecap(text) {
        let toast = document.getElementById('recap-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'recap-toast';
            toast.className = 'recap-toast';
            toast.title = 'Click to dismiss';
            toast.onclick = () => toast.classList.remove('visible');
            document.querySelector('.game-board').appendChild(toast);
        }
        toast.textContent = text;
        toast.classList.remove('visible');
        void toast.offsetWidth;
        toast.classList.add('visible');
        clearTimeout(this._recapTimer);
        this._recapTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
        this.log(`Last turn: ${text}`, 'opponent');
    }

    // Real hover (mouse/trackpad) on a wide screen. Phones in either orientation use tap + long-press,
    // so hover-only popups (preview, action chip) don't get stuck after a tap.
    _canHover() {
        return window.innerWidth > 768 && window.matchMedia('(hover: hover)').matches;
    }

    // Label for what clicking a card will do right now ('' when nothing)
    _cardHint(unit, { isFriendly, isInteractive, canActInAction, canBlockInBlock }) {
        if (!isFriendly || !isInteractive || !this._isMyTurn()) return '';
        if (canBlockInBlock) return unit.type === 'barrier' ? `Block: 🛡️${unit.blk} · breaks` : `Block: 🛡️${unit.blk}`;
        if (!canActInAction) return '';
        if (unit.exhausted && unit.usedThisTurn) return unit.attacking ? 'Cancel attack' : 'Undo';
        if (unit.exhausted) return unit.type === 'wall' ? 'Repair: −1🔋' : '';
        if (unit.atk > 0 && unit.type !== 'repeater') {
            if (unit.attacking) return 'Already attacking';
            const cost = unit.atkCost > 0 ? `−${unit.atkCost}🔋 → ` : '';
            const extra = unit.type === 'volatile' ? ' · self-destructs' : (unit.atkCost > 0 ? '' : ' (free)');
            return `Attack: ${cost}⚔️${unit.atk}${extra}`;
        }
        switch (unit.type) {
            case 'energizer': return 'Tap: +1🔋';
            case 'miner': return 'Tap: −1🔋 → +1🪙';
            case 'repeater': return 'Ready a unit: −1🔋';
            case 'wall': return 'Ready to block';
            case 'barrier': return 'Blocks the next attack';
        }
        return '';
    }

    // Small floating label above a hovered card/column saying what a click does
    _showActionChip(el) {
        const text = el && el.dataset ? el.dataset.hint : '';
        if (!text) {
            this._hideActionChip();
            return;
        }
        let chip = document.getElementById('action-chip');
        if (!chip) {
            chip = document.createElement('div');
            chip.id = 'action-chip';
            chip.className = 'action-chip';
            document.body.appendChild(chip);
        }
        chip.textContent = text;
        const r = el.getBoundingClientRect();
        chip.style.left = `${r.left + r.width / 2}px`;
        chip.style.top = `${r.top}px`;
        chip.classList.add('visible');
    }

    _hideActionChip() {
        const chip = document.getElementById('action-chip');
        if (chip) chip.classList.remove('visible');
    }

    // Short, player-facing version of an engine refusal message
    _shortReason(msg) {
        const m = String(msg || '');
        const rules = [
            [/Not enough Gold to undo/i, 'Needs 🪙 to undo'],
            [/Not enough Energy to undo/i, 'Needs 🔋 to undo'],
            [/already been used/i, "Can't undo now"],
            [/cannot be undone|not used this turn/i, "Can't undo"],
            [/already prepared/i, 'Already attacking'],
            [/already exhausted/i, 'Already used'],
            [/already ready/i, 'Already ready'],
            [/no usable ability/i, 'No ability to use'],
            [/about to be destroyed/i, 'Being destroyed'],
            [/Cannot overcharge itself/i, "Can't target itself"],
            [/Not enough damage/i, 'Not enough ⚔️'],
            [/energy/i, 'Needs 1🔋'],
            [/afford|gold/i, 'Not enough 🪙']
        ];
        const hit = rules.find(([re]) => re.test(m));
        return hit ? hit[1] : m.slice(0, 28);
    }

    // "Why not?" popup at the element a failed click came from
    _warnAt(el, msg) {
        if (!el || !el.getBoundingClientRect) return;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        this._spawnFloatText(r.left + r.width / 2, r.top + Math.min(40, r.height / 3), this._shortReason(msg), 'warn');
    }

    // "Thinking…" dots on the AI's name plate during its pauses
    _setAIThinking(on) {
        this.aiThinking = !!on;
        const plate = document.querySelector('#opponent-area .player-stats-bar');
        if (plate) plate.classList.toggle('thinking', this.aiThinking);
        if (this.state) this.updateTurnHint();
    }

    // Brief glow on the card(s) an AI step just used, so its turn is easy to follow
    _flashAIStep(step) {
        if (!step) return;
        let cards = [];
        if (step.type === 'use_ability' && step.unit) {
            cards = Array.from(document.querySelectorAll(`#p2-units .unit-card[data-type="${step.unit}"][data-unit-number="${step.number}"]`));
        } else if (step.type === 'block' && step.unit) {
            const blockers = document.querySelectorAll(`#p2-units .unit-card.blocking[data-type="${step.unit}"]`);
            if (blockers.length) cards = [blockers[blockers.length - 1]];
        } else if (step.type === 'attack') {
            cards = Array.from(document.querySelectorAll('#p2-units .unit-card.attacking'));
        }
        cards.forEach(card => {
            card.classList.remove('ai-acted');
            void card.offsetWidth; // restart the glow
            card.classList.add('ai-acted');
        });
    }

    // Whether the local human is the one acting right now (in Breach that's the attacker)
    _isMyTurn() {
        if (this.gameMode === 'HOTSEAT') return true; // Both players share this screen
        if (this.gameMode === 'ONLINE') return this.isHost ? this.isP1Turn() : !this.isP1Turn();
        return this.isP1Turn(); // AI mode: the human is always seat 1
    }

    // The local player's seat ('p1'/'p2'), or null in hotseat where both seats are local
    _localSeat() {
        if (this.gameMode === 'HOTSEAT') return null;
        if (this.gameMode === 'ONLINE') return this.isHost ? 'p1' : 'p2';
        return 'p1';
    }

    // True when the acting player has nothing useful left this Action phase (drives the END TURN pulse)
    _hasNothingToDo() {
        const s = this.state;
        if (!s || s.phase !== 'Action' || s.gameOver || this.isTutorial || !this._isMyTurn()) return false;
        const me = this.isP1Turn() ? s.p1 : s.p2;
        const ready = me.units.filter(u => u.isAlive && !u.exhausted);
        const energy = me.energy;
        if (ready.some(u => u.type === 'energizer')) return false;
        if (energy >= 1 && ready.some(u => u.type === 'miner')) return false;
        if (ready.some(u => (u.type === 'striker' || u.type === 'volatile') && !u.attacking && energy >= u.atkCost)) return false;
        if (energy >= 1 && ready.some(u => u.type === 'repeater') && me.units.some(u => u.isAlive && u.exhausted)) return false;
        if (energy >= 1 && me.units.some(u => u.type === 'wall' && u.exhausted)) return false;
        // Anything left to buy? (second purchase costs +1 energy)
        if (me.purchased < 2 && energy >= (me.purchased === 1 ? 1 : 0)) {
            const lifetime = me.lifetime || {};
            if (SHOP_UNITS.some(u => (lifetime[u.id] || 0) < u.cap && me.gold >= u.cost)) return false;
        }
        return true; // Guards are ignored: attacking with one is optional
    }

    // One-line "what now" guidance next to the action buttons
    updateTurnHint() {
        const el = document.getElementById('turn-hint');
        if (!el) return;
        const text = this._turnHint();
        el.textContent = text;
        el.classList.toggle('hidden', !text);
    }

    _turnHint() {
        const s = this.state;
        if (!s || s.gameOver || this.isTutorial) return '';
        const combat = s.combat || { atk: 0, blk: 0, assigned: 0 };

        // Just the tip, no player names
        if (!this._isMyTurn()) {
            if (this.gameMode === 'AI') {
                if (s.phase === 'Block') return 'AI is choosing blockers…';
                return this.aiThinking ? 'AI is thinking…' : 'AI is playing its turn…';
            }
            if (s.phase === 'Breach') return 'Opponent is assigning damage…';
            if (s.phase === 'Block') return 'Opponent is choosing blockers…';
            return 'Waiting for your opponent…';
        }

        if (s.phase === 'Block') {
            const me = this.isP1Turn() ? s.p1 : s.p2;
            const left = Math.max(0, combat.atk - combat.blk);
            const canBlock = me.units.some(u => u.isAlive && !u.exhausted && u.blk > 0 && !u.blocking);
            if (left === 0) return 'Attack fully blocked. Press FINISH BLOCKING.';
            if (!canBlock) return `Incoming ⚔️${left} and no blockers ready. Press FINISH BLOCKING.`;
            return `Incoming ⚔️${left}. Click units to block, then FINISH BLOCKING.`;
        }
        if (s.phase === 'Breach') {
            const left = Math.max(0, combat.atk - combat.blk - combat.assigned);
            return `Assign ${left}⚔️: click a glowing enemy unit, or ATTACK BASE.`;
        }
        if (this._hasNothingToDo()) return 'Nothing left to do. Press END TURN.';
        return 'Tap units for 🔋/🪙, shop, then END TURN.';
    }

    updateActionButtons() {
        // In AI mode, we restrict actions to Player 1.
        // In HOTSEAT mode, we allow actions for whoever is the current player.
        // In ONLINE mode, only the local player's turn is interactive.
        const isMyTurn = this._isMyTurn();
        const phase = this.state.phase;

        // Special case for Breach: Attacker acts, which might be P1 even if defender is current?
        // Actually engine logic usually switches "currentPlayer" context.
        // But let's keep the loose "Breach" check for safety if legacy logic requires it.
        const canAct = isMyTurn || (this.gameMode !== 'HOTSEAT' && this.gameMode !== 'ONLINE' && phase === 'Breach' && this.state.p1.units.some(u => u.attacking));
        // Logic simplification: In Hotseat, canAct is always true effectively

        const locked = this.isTurnTransitioning || this.processingTurn || this.state.gameOver;
        this.elements.btnEnd.disabled = !canAct || locked;
        this.elements.btnBuy.disabled = !isMyTurn || phase === 'Block' || phase === 'Breach' || locked;

        // Hide buttons completely when cannot act
        if (!canAct) {
            this.elements.btnEnd.style.opacity = '0.3';
            this.elements.btnBuy.style.opacity = '0.3';
        } else if (locked) {
            // Intermediate state during transition
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

        // Buys chip on SHOP, only when it matters: the next buy costs +1 energy, or both buys are used
        const chip = document.getElementById('buys-chip');
        if (chip) {
            const active = this.isP1Turn() ? this.state.p1 : this.state.p2;
            const left = Math.max(0, 2 - active.purchased);
            const shopOpen = !this.elements.shopModal.classList.contains('hidden');
            const showChip = isMyTurn && phase === 'Action' && !this.state.gameOver && !shopOpen && left < 2;
            chip.textContent = left === 1 ? '+1🔋' : '0 left';
            chip.classList.toggle('hidden', !showChip);
            chip.classList.toggle('none-left', left === 0);
        }

        // Gentle glow on END TURN when there's nothing useful left to do
        this.elements.btnEnd.classList.toggle('idle-pulse', !locked && this._hasNothingToDo());
    }

    // -- Game Actions --

    async handleUnitClick(unit, unitNumber, columnElement) {
        try {
            if (this.isTurnTransitioning || this.processingTurn || this.state.gameOver) return;
            console.log("handleUnitClick", unit.type, unitNumber);
            if (this.targeting) {
                // If we're in targeting mode, ignore clicks that come through the normal path
                // (targeting onclick handlers are set up by startTargeting)
                return;
            }

            // Action context
            const isP1Card = this.elements.p1Units.contains(columnElement);
            const isP1Turn = this.isP1Turn();
            const isFriendly = (isP1Card && isP1Turn) || (!isP1Card && !isP1Turn);

            const canAct = this.state.phase === 'Action' && isFriendly;
            if (!canAct) {
                console.log("Cannot act: Phase", this.state.phase, "Friendly", isFriendly);
                return;
            }

            // UNDO LOGIC: If unit is exhausted but was used this turn, undo it
            if (unit.exhausted && unit.usedThisTurn) {
                console.log("Undoing action for", unit.type, unitNumber);
                const resultProxy = this._runPy(`
                    success, msg = engine.undo_action(r_type, r_num)
                    {"success": success, "msg": msg}
                `, { r_type: unit.type, r_num: unitNumber });
                const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
                resultProxy.destroy();

                if (result.success) {
                    this.sounds.play('CLICK');
                    this.log(`Undid ${unit.name} action.`, 'system');
                    if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                        this.multiplayer.sendAction({ type: 'undo', unitType: unit.type, unitNumber });
                    }
                    this.syncState();
                    this.updateUI();
                } else {
                    this.log(`Could not undo: ${result.msg}`, 'important');
                    this.sounds.play('ERROR');
                    this._warnAt(columnElement && (columnElement.querySelector(`.unit-card[data-unit-number="${unitNumber}"]`) || columnElement), result.msg);
                }
                return;
            }

            // Find the card to animate (the rotation-target)
            let animateCard = null;
            if (columnElement) {
                animateCard = columnElement.querySelector('.unit-card.rotation-target') || columnElement.querySelector('.unit-card.interactive');
            }
            // Units with attack value (striker, guard, volatile, overcharger) - auto-prepare for attack
            if (unit.atk > 0 && unit.type !== 'repeater') {
                // Prepare this specific unit for attack (same engine call the remote peer replays)
                const resultProxy = this._runPy(`
                    success, msg = engine.prepare_unit_attack(r_type, r_num)
                    {"success": success, "msg": msg}
                `, { r_type: unit.type, r_num: unitNumber });
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
                        this.multiplayer.sendAction({ type: 'prepare', unitType: unit.type, unitNumber });
                    }

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
                    this._warnAt(animateCard || columnElement, result.msg);

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
                const resultProxy = this._runPy(`
                    success, msg = engine.use_ability(r_type, r_num)
                    {"success": success, "msg": msg}
                `, { r_type: unit.type, r_num: unitNumber });
                const abilitySuccess = await this.processActionResult(resultProxy, animateCard);

                if (abilitySuccess) {
                    this.sounds.play('CLICK');
                    if (this.isTutorial && this.tutorialStep === 8 && unit.type === 'energizer') {
                        this.advanceTutorial();
                    }
                }

                // Send to remote player
                if (abilitySuccess && this.gameMode === 'ONLINE' && !this.isRemoteAction) {
                    this.multiplayer.sendAction({ type: 'ability', unitType: unit.type, unitNumber });
                }
            } else if (unit.type === 'repeater') {
                // Check energy from Python state directly to avoid desync
                const pyEnergy = this.pyodide.runPython(`game.current_player.energy`);
                if (pyEnergy < 1) {
                    this.log("Not enough energy to use Repeater (needs 1🔋)", "important");
                    this.sounds.play('ERROR');
                    this._warnAt(animateCard || columnElement, 'Not enough energy');
                    const energyEl = document.getElementById(isP1Turn ? 'p1-energy' : 'p2-energy');
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
            }
        } catch (e) {
            console.error("handleUnitClick error", e);
            this.log("Error interacting with unit: " + e.message, 'important');
        }
    }

    startTargeting(sourceUnit, sourceNumber, animateCard) {
        this.targeting = { sourceUnit, sourceNumber, animateCard };
        this.log(`Click a friendly unit to unexhaust with Repeater #${sourceNumber}. Click Repeater again to cancel.`, 'system');

        if (animateCard) {
            animateCard.style.transform = 'scale(1.1)';
            animateCard.style.zIndex = '100';
            animateCard.style.transition = 'transform 0.2s';
        }

        const friendlyArea = this.isP1Turn() ? this.elements.p1Units : this.elements.p2Units;
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
            const firstExhaustedNum = firstExhausted ? parseInt(firstExhausted.dataset.unitNumber, 10) : null;

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
        const processProxy = this._runPy(`
            # Find the actual unit object in python
            target_unit = game.current_player.get_units_by_type(r_target_type)[r_target_num - 1]
            success, msg = engine.use_ability(r_type, r_num, target=target_unit)

            {"success": success, "msg": msg}
        `, { r_type: sourceUnit.type, r_num: sourceNumber, r_target_type: targetType, r_target_num: targetNumber });

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
            this._warnAt(document.getElementById(`${this.isP1Turn() ? 'p1' : 'p2'}-units-${targetType}-col`), result.msg);
        }

        this.syncState();
        this.updateUI();
    }

    handleBlock(unit) {
        if (this.isTurnTransitioning || this.processingTurn || this.state.gameOver) return;
        this._runPy(`engine.assign_blockers([(r_type, 1)])`, { r_type: unit.type });
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
            const area = this.isP1Turn() ? this.elements.p1Units : this.elements.p2Units;
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
        if (this.isTurnTransitioning || this.processingTurn || this.state.gameOver) return;
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
                msg = f"Invalid ${unit.type} number"
                
            {"success": success, "msg": msg}
        `);
        const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
        resultProxy.destroy();

        if (result.success) {
            if (this.isTutorial && this.tutorialStep === 13) {
                this.advanceTutorial();
            }
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
            this._warnAt(column, result.msg);

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

        if (!this.state || this.state.gameOver) return;
        // Local clicks are ignored during the turn banner or while a turn is resolving.
        // A remote player's end-turn must never be dropped, or the two games drift apart.
        if (!this.isRemoteAction && (this.isTurnTransitioning || this.processingTurn)) return;

        const session = this.gameSession;
        this.processingTurn = true; // Block spam clicking; released in finally
        this.tutorialHold = this.isTutorial; // Don't show the next step's text until its turn is on screen
        document.body.classList.add('lockout'); // Visual lockout

        // Cancel targeting if active
        if (this.targeting) {
            this.cancelTargeting();
        }

        if (this.isTutorial) {
            if (this.tutorialStep === 6) this.advanceTutorial();
            else if (this.tutorialStep === 9) this.advanceTutorial();
            else if (this.tutorialStep === 11) this.advanceTutorial();
            else if (this.tutorialStep === 12) this.advanceTutorial();
            else if (this.tutorialStep === 14) this.advanceTutorial();
        }

        this.elements.btnEnd.disabled = true;
        this.elements.btnBuy.disabled = true;

        // Send to remote player
        if (this.gameMode === 'ONLINE' && !this.isRemoteAction) {
            this.multiplayer.sendAction({ type: 'endTurn' });
        }

        try {
            if (this.state.phase === 'Block') {
                // Defender finished blocking - check for breach using engine
                const resProxy = this.pyodide.runPython(`
                    success, msg = engine.finish_blocking()
                    {"game_phase": game.phase, "msg": msg}
                `);
                const res = resProxy.toJs({ dict_converter: Object.fromEntries });
                resProxy.destroy();

                if (res.game_phase === 'Breach') {
                    // The defender is the current player here, so in AI mode a P1 defender means the AI attacked
                    const aiIsAttacker = this.gameMode === 'AI' && this.isP1Turn();
                    if (!aiIsAttacker) {
                        // Human attacker (HOTSEAT/ONLINE, or P1 attacking the AI) clicks units to assign damage
                        this.log("BREACH! Click enemy units to assign damage.", "important");
                        this.syncState();
                        this.updateUI();
                        return;
                    }

                    // AI attacked, P1 defended, now AI (Attacker) assigns
                    this.log("AI is assigning damage...", "system");
                    const aiResult = this.pyodide.runPython(`
                        assignments = ai.assign_damage(game, engine, sum(u.attack for u in engine.attacking_units) - sum(u.block for u in engine.blocking_units))
                        success, msg = engine.resolve_combat(assignments)
                        engine.end_phase()
                        msg
                    `);
                    this.log(`AI Result: ${aiResult}`, "opponent");
                    this.pyodide.runPython(`engine.action_phase()`);
                } else {
                    this.log(res.msg, "system");
                }

                this.syncState();
                this.updateUI();

            } else if (this.state.phase === 'Breach') {
                // Attacker finished assigning damage - auto-assign leftover to base
                this.log("Finishing damage assignment...", "system");
                const msg = this.pyodide.runPython(`
                    # Auto-assign remaining to base
                    total_atk = sum(u.attack for u in engine.attacking_units)
                    total_blk = sum(u.block for u in engine.blocking_units)
                    remaining = total_atk - total_blk - engine.assigned_damage
                    results = []
                    if remaining > 0:
                        success, msg = engine.resolve_combat([("base", remaining)])
                        results.append(msg)

                    # Log the defender's units destroyed in this breach (current_player is the defender)
                    dead_units = [u.name for u in game.current_player.units if not u.is_alive()]
                    if dead_units:
                        results.append(f"Units destroyed: {', '.join(dead_units)}")

                    engine.end_phase()
                    engine.action_phase()
                    " ; ".join(results) if results else "Breach finished"
                `);
                if (this.isTutorial && this.tutorialStep === 13) {
                    this.advanceTutorial();
                }
                if (msg !== "Breach finished") this.log(msg, "player1");

                this.syncState();
                this.updateUI();
                if (this.state.gameOver) return;

                // Proceed with next player's Action phase
                this.sounds.play('TURN_START');
                if (this.gameMode === 'AI') {
                    await this._runAIActionTurn(session);
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
                        const incomingAtk = this.pyodide.runPython(`sum(u.attack for u in engine.attacking_units)`);
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
                    return;
                }

                // ===== AI MODE =====
                if (this.state.phase === 'Block') {
                    // Player attacked - AI needs to defend
                    const incomingAtk = this.pyodide.runPython(`sum(u.attack for u in engine.attacking_units)`);
                    this.log(`🚨 INCOMING ATTACK! ${incomingAtk} damage aimed at AI.`, "important");

                    // Wait for banner + extra buffer
                    this._setAIThinking(true);
                    const stillActive = await this._waitSession(4800, session);
                    if (!stillActive) return;
                    this._setAIThinking(false);
                    if (!(await this._runAIDefense(session))) return;

                    this.syncState();

                    // If it's now Breach phase, P1 enters Breach mode
                    if (this.state.phase === 'Breach') {
                        this.log("BREACH! Click AI units to destroy them.", "important");
                        this.updateUI();
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
                await this._runAIActionTurn(session);
            }
        } catch (error) {
            console.error("Turn processing error:", error);
            this.log("Error processing turn: " + error.message, "important");
        } finally {
            this._endProcessing(session);
        }
    }

    // Per-step delay for the AI speed setting (0 = instant)
    _aiStepDelay() {
        const speedMap = { '0': 3500, '1': 2000, '2': 0 };
        return speedMap[this.aiSpeed] !== undefined ? speedMap[this.aiSpeed] : 900;
    }

    // AI blocks step by step (same plan at every speed). Returns false if the game was abandoned meanwhile.
    async _runAIDefense(session) {
        const stepDelayMs = this._aiStepDelay();
        const stepsProxy = this.pyodide.runPython(`
            global_def_steps_py = ai.plan_defense(game, engine)
            global_def_steps_py
        `);
        const numSteps = stepsProxy.length;
        const blockSummary = [];

        try {
            for (let i = 0; i < numSteps; i++) {
                const step = stepsProxy.get(i);
                const stepData = step.toJs({ dict_converter: Object.fromEntries });
                step.destroy();
                if (stepData.type === 'end') break;

                const isBarrierBlock = stepData.type === 'block' && stepData.unit === 'barrier';
                if (isBarrierBlock) {
                    // Find the barrier card to animate before it's removed by syncState
                    const barrierCard = this.elements.p2Units.querySelector('[data-type="barrier"]:not(.exhausted)'); // AI is always P2 in PVE
                    if (barrierCard) {
                        barrierCard.classList.add('unit-destroy');
                        this.sounds.play('DESTROY');
                    }
                }

                const label = this.pyodide.runPython(`ai.execute_step(game, engine, global_def_steps_py[${i}])`);
                this.log(`🤖 AI: ${label}`, 'opponent');
                this.sounds.play('BLOCK');
                blockSummary.push(label.replace('Blocks with', '').trim());

                // Wait for the barrier animation before syncing/updating removes the card
                if (isBarrierBlock && !(await this._waitSession(600, session))) return false;

                this.syncState();
                this.updateUI();
                this._flashAIStep(stepData);

                if (!(await this._waitSession(stepDelayMs, session))) return false;
            }
        } finally {
            stepsProxy.destroy();
        }

        if (blockSummary.length > 0) {
            this.log(`AI blocked with: ${blockSummary.join(', ')}`, "opponent");
        } else {
            this.log("AI did not block.", "opponent");
        }

        this.pyodide.runPython(`engine.finish_blocking()`);
        return true;
    }

    // AI plays its Action phase step by step (same plan at every speed), then passes the turn back.
    // Returns false if the game ended or was abandoned meanwhile.
    async _runAIActionTurn(session) {
        this.log("AI Opponent is thinking...", "system");
        this._setAIThinking(true);
        const stillActive = await this._waitSession(4000, session);
        if (!stillActive) return false;
        this._setAIThinking(false);
        if (this.state.gameOver) return false;

        try {
            const stepDelayMs = this._aiStepDelay();
            const stepsProxy = this.pyodide.runPython(`
                global_steps_py = ai.plan_turn(game, engine)
                global_steps_py
            `);
            const numSteps = stepsProxy.length;

            try {
                for (let i = 0; i < numSteps; i++) {
                    const step = stepsProxy.get(i);
                    const stepData = step.toJs({ dict_converter: Object.fromEntries });
                    step.destroy();
                    if (stepData.type === 'end') break;

                    const label = this.pyodide.runPython(`ai.execute_step(game, engine, global_steps_py[${i}])`);

                    this.log(`🤖 AI: ${label}`, 'opponent');

                    // Visual/Audio cues for AI Actions
                    if (label.includes('Bought')) {
                        this.sounds.play('BUY');
                    } else if (label.includes('Energizer') || label.includes('Miner') || label.includes('Wall') || label.includes('Repeater')) {
                        this.sounds.play('CLICK');
                    }

                    this.syncState();
                    this.updateUI(); // a bought unit flies in from the AI's plate (see _animateCardChanges)
                    this._flashAIStep(stepData);

                    if (!(await this._waitSession(stepDelayMs, session))) return false;
                }
            } finally {
                stepsProxy.destroy();
            }

            // End turn and transition
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

            this.syncState();
            this.updateUI();

            if (this.state.phase !== 'Block') {
                this.log("Your turn!", "player1");
            }
            return true;
        } catch (aiError) {
            if (session !== this.gameSession) return false;
            console.error("AI turn error:", aiError);
            this.log("AI turn failed: " + aiError.message, "important");
            this.pyodide.runPython(`
                game.current_player.units_purchased = 0
                if game.phase != "Action":
                    engine.action_phase()
            `);
            this.syncState();
            this.updateUI();
            return false;
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
            this.updateUI(); // the new unit flies in from the SHOP button (see _animateCardChanges)
            this.hideShop();

            if (this.isTutorial) {
                if (this.tutorialStep === 5 && type === 'energizer') this.advanceTutorial();
                else if (this.tutorialStep === 7 && type === 'miner') this.advanceTutorial();
                else if (this.tutorialStep === 10 && type === 'striker') this.advanceTutorial();
            }
        } else {
            this.sounds.play('ERROR');
            this.log(`Error: ${result.msg}`, 'important');
        }
    }

    async processActionResult(proxy, cardElement) {
        const result = proxy.toJs({ dict_converter: Object.fromEntries });
        proxy.destroy();

        // Handle both dict {"success": ..., "msg": ...} and array [success, msg]
        const success = result.success !== undefined ? result.success : result[0];
        const msg = result.msg !== undefined ? result.msg : result[1];

        if (success) {
            if (cardElement) {
                cardElement.classList.add('exhausting-animation');
            }
            this.sounds.play('ABILITY');
            if (msg) this.log(msg, 'player1');

            this.syncState();
            this.updateUI();
            return true;
        } else {
            if (msg) this.log(msg, 'important');
            this.sounds.play('ERROR');
            this._warnAt(cardElement, msg);

            if (msg && typeof msg === 'string' && msg.includes("energy")) {
                const isP1Turn = this.isP1Turn();
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
        let shopUnits = SHOP_UNITS.map(u => ({ ...u, energyCost: 0, desc: this.unitDescriptions[u.id] }));

        if (this.isTutorial) {
            // Tutorial Shop: Energizer, Miner, Striker only
            shopUnits = shopUnits.filter(u => u.id === 'energizer' || u.id === 'miner' || u.id === 'striker');
        }

        // Sort by cost ascending
        shopUnits.sort((a, b) => a.cost - b.cost);

        this.elements.shopGrid.innerHTML = '';

        // Determine affordability
        const player = this.isP1Turn() ? this.state.p1 : this.state.p2;
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

            const limitMax = u.cap;
            let currentAmount = 0;
            if (player && player.lifetime && player.lifetime[u.id]) {
                currentAmount = player.lifetime[u.id];
            }

            // Say exactly what's missing, so a greyed-out unit isn't a mystery
            if (currentAmount >= limitMax) {
                affordable = false;
                reason = `Max ${limitMax} owned`;
            } else if (unitsBought >= 2) {
                affordable = false;
                reason = "2 buys used this turn";
            } else if (currentGold < u.cost) {
                affordable = false;
                reason = `Need ${u.cost - currentGold} more 🪙`;
            } else if (currentEnergy < totalEnergyReq) {
                affordable = false;
                reason = `Need ${totalEnergyReq - currentEnergy} more 🔋 (2nd buy)`;
            }

            if (this.isTutorial && this.tutorialStep === 5 && u.id !== 'energizer') {
                affordable = false;
            }
            if (this.isTutorial && this.tutorialStep === 7 && u.id !== 'miner') {
                affordable = false;
            }
            if (this.isTutorial && this.tutorialStep === 10 && u.id !== 'striker') {
                affordable = false;
            }

            if (!affordable) {
                item.classList.add('disabled');
                item.onclick = (e) => {
                    e.stopPropagation();
                    this.sounds.play('ERROR');
                    if (reason) this._warnAt(item, reason);
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
                <div class="shop-item-art" style="background-image: url('${imgUrl}')"></div>
                <div class="shop-item-info">
                   <div class="shop-item-main">
                      <span class="unit-name">${u.name}</span>
                      <span class="unit-cost">${costDisplay}</span>
                   </div>
                   ${!affordable && reason ? `<span class="unit-xs-reason">${reason}</span>` : ''}
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
        this.updateActionButtons(); // hides the buys chip while the shop is open

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
            this.elements.btnBuy.querySelector('.btn-label').textContent = 'EXIT SHOP';
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

            // On mobile tutorial, clear shop button highlight once entered
            if (this.isTutorial) {
                const shopBtn = document.getElementById('btn-buy');
                if (shopBtn) {
                    shopBtn.classList.remove('tutorial-highlight');
                    shopBtn.classList.remove('tutorial-pulse');
                }
            }

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
                if (this.state) this.updateActionButtons(); // bring the buys chip back
            }, 200);
        } else {
            this.elements.shopModal.classList.add('hidden');
            if (this.state) this.updateActionButtons();
        }

        // Restore mobile action bar
        if (window.innerWidth <= 768) {
            this.elements.btnEnd.style.display = '';
            this.elements.btnBuy.querySelector('.btn-label').textContent = 'SHOP';
            this.elements.btnBuy.onclick = () => {
                if (this.isTurnTransitioning || this.processingTurn) return;
                this.handleBuy();
            };
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
        }, 120);
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
            if (this.isTurnTransitioning || this.processingTurn) return;
            this.sounds.play('CLICK');
            this.handleEndTurn();
        };
        this.elements.btnBuy.onclick = () => {
            if (this.isTurnTransitioning || this.processingTurn) return;
            this.handleBuy();
        };

        // Global visual click effect and sound
        document.body.addEventListener('mousedown', (e) => {
            // Only play generic click if it's not a button or clickable card
            const isInteractable = e.target.closest('button') || e.target.closest('.close-btn') || e.target.closest('.unit-card');

            if (!isInteractable) {
                this.sounds.play('CLICK');

                const offX = 11; // Offset to the right
                const offY = 7; // Offset down

                // Create Ripple Effect
                const ripple = document.createElement('div');
                ripple.className = 'click-ripple';
                ripple.style.left = `${e.clientX + offX}px`;
                ripple.style.top = `${e.clientY + offY}px`;
                document.body.appendChild(ripple);

                // Play particles
                for (let i = 0; i < 5; i++) {
                    const particle = document.createElement('div');
                    particle.className = 'click-particle';
                    particle.style.left = `${e.clientX + offX}px`;
                    particle.style.top = `${e.clientY + offY}px`;
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
                this.isTutorial = false;
                this.gameMode = 'AI';
                this.elements.welcomeScreen.classList.add('hidden');
                this.showAISelection();
            } else if (target.id === 'btn-pvp') {
                console.log("PvP Mode Selected via Delegation");
                this.isTutorial = false;
                this.gameMode = 'HOTSEAT';
                this.selectedAI = 'Human';
                this.elements.welcomeScreen.classList.add('hidden');
                this.startGame();
            } else if (target.id === 'btn-online') {
                console.log("Online Mode Selected via Delegation");
                this.isTutorial = false;
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
            // Restart only resets the local copy, which would desync an online game
            this.elements.btnRestart.style.display = this.gameMode === 'ONLINE' ? 'none' : '';

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
                this._abandonGame(); // Stop a running AI turn from continuing in the background
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
                this._abandonGame();
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

        if (this.elements.btnHowToPlay) {
            this.elements.btnHowToPlay.onclick = () => {
                this.sounds.play('CLICK');
                this.startTutorial();
            };
        }
    }

    showEndGameScreen() {
        if (this.isTutorial) {
            this.showTutorialVictory();
            return;
        }
        this.sounds.play('VICTORY');

        let winnerName = this.state.winner;
        let winnerState = this.state.winnerIsP1 ? this.state.p1 : this.state.p2;

        let startingUnits = 2; // Miner, Energizer
        if (!this.state.winnerIsP1) startingUnits = 3; // + Barrier

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

    startTutorial() {
        this.isTutorial = true;
        this.tutorialStep = 1;
        this.tutorialPart = 1;
        this.gameMode = 'AI';
        this.selectedAI = 'Pacifist';
        this.elements.welcomeScreen.classList.add('hidden');
        this.startGame();
    }

    advanceTutorial() {
        this.tutorialStep++;
        this.tutorialPart = 1;
        this.updateUI();
    }

    updateTutorialUI() {
        if (!this.isTutorial) return;
        // Hold while the banner shows, and from End Turn until the next turn's banner has finished
        if (this.isTurnTransitioning || this.tutorialHold) return;

        let text = "";
        let highlightId = "";
        let buttonText = null;
        let onButtonClick = null;
        let subState = "";

        switch (this.tutorialStep) {
            case 1: // Start - Introduction
                text = "Welcome to Build Order! Your goal is to destroy the enemy Base. Let's look at your resources.";
                buttonText = "Next";
                onButtonClick = () => this.advanceTutorial();
                break;
            case 2: // HP
                text = "This is your Base HP❤️. If it reaches 0, you lose!<br>Both you and the AI start with 2 HP today.";
                highlightId = "p1-hp-res";
                buttonText = "Next";
                onButtonClick = () => this.advanceTutorial();
                break;
            case 3: // Gold
                text = "This is your Gold🪙. Use it to buy units from the Shop.";
                highlightId = "p1-gold-res";
                buttonText = "Next";
                onButtonClick = () => this.advanceTutorial();
                break;
            case 4: // Energy
                text = "This is your Energy🔋. Units use it for special actions.<br>Energy🔋 resets to 0 at the start of every turn.";
                highlightId = "p1-energy-res";
                buttonText = "Next";
                onButtonClick = () => this.advanceTutorial();
                break;
            case 5: // Buy Energizer
                text = "Time to build! Open the <b>SHOP</b> and buy an <b>Energizer</b>.<br>Energizer will provide 1 Energy🔋 every turn.";
                highlightId = "btn-buy";
                break;
            case 6: // After buying Energizer
                text = "New units enter <b>Tapped</b> 💤 and cannot act the turn they are bought. End your turn to proceed.";
                highlightId = "btn-end";
                break;
            case 7: // Turn 2 - Buy Miner
                if (this.state.turn >= 2 && this.isP1Turn() && this.state.phase === 'Action') {
                    text = "Now buy a <b>Miner</b>.<br>Miners convert 🔋 into 🪙!";
                    highlightId = "btn-buy";
                }
                subState = this.state.currentPlayer;
                break;
            case 8: // Turn 2 - Use Energizer
                const readyEnergizer = this.state.p1.units.filter(u => u.name === 'Energizer' && !u.exhausted).length > 0;
                if (readyEnergizer) {
                    text = "Tap your Energizer to generate Energy🔋";
                    highlightId = "p1-units-energizer-col";
                } else {
                    text = "Energizer used! See your Energy🔋 increased? Now end your turn.";
                    highlightId = "btn-end";
                }
                subState = `${readyEnergizer ? "ready" : "used"}_${this.state.currentPlayer}`;
                break;
            case 9: // Turn 2 - End
                text = "Good job. End your turn to see how the AI responds.";
                highlightId = "btn-end";
                subState = this.state.currentPlayer;
                break;
            case 10: // Turn 3 - Gold vs Energy
                if (this.state.turn >= 3 && this.isP1Turn() && this.state.phase === 'Action') {
                    const gold = this.state.p1.gold;

                    if (gold >= 3) {
                        text = "Now you have 3 Gold🪙! Let's get some offense.<br>Buy a <b>Striker</b>.";
                        highlightId = "btn-buy";
                    } else {
                        text = "The AI just bought a unit! Notice your <b>Energy🔋 resets</b>, but your <b>Gold🪙 carries over</b>.<br>Gather 3 Gold by tapping Energizer and Miner.";
                        highlightId = "p1-gold-res p1-energy-res";
                    }
                    // Avoid pop-out by only updating subState when the text might actually change
                    subState = `${gold >= 3}_${this.state.currentPlayer}`;
                } else {
                    subState = this.state.currentPlayer;
                }
                break;
            case 11: // After buying striker
                text = "End your turn. Your Striker will be ready next turn!";
                highlightId = "btn-end";
                break;
            case 12: // Turn 4 - Attack Power
                if (this.state.turn >= 4 && this.isP1Turn() && this.state.phase === 'Action') {
                    const hasPrepared = this.state.p1.atk > 0;
                    const hasEnergy = this.state.p1.energy > 0;
                    if (hasPrepared) {
                        text = "Enemy will have 2 Attack Power ⚔️ incoming to assign to its blockers 🛡️. End your turn.";
                        highlightId = "btn-end";
                    } else if (hasEnergy) {
                        text = "Now use your gathered Energy🔋 to Tap the Striker";
                        highlightId = "p1-units-striker-col";
                    } else {
                        text = "Tap your <b>Energizer</b> to get Energy🔋.";
                        highlightId = "p1-units-energizer-col";
                    }
                    subState = `${hasPrepared}_${hasEnergy}_${this.state.currentPlayer}`;
                } else {
                    subState = this.state.currentPlayer;
                }
                break;
            case 13: // Target decision
                if (this.state.phase === 'Breach') {
                    if (this.tutorialPart === 1) {
                        text = "Enemy Miner Blocked 🛡️ 1 damage from your Total Attack Power⚔️ with its Miner. Any leftover unblocked damage will be assigned by the attacker during the Breach Phase.";
                        buttonText = "Next";
                        onButtonClick = () => {
                            this.tutorialPart = 2;
                            this.updateTutorialUI();
                        };
                    } else {
                        text = "You have 1 more leftover Attack Power⚔️ to assign either to Enemy Base or enemy Miner thus destroying it.";
                        highlightId = "p2-units-miner-col btn-end";
                        buttonText = null;
                    }
                    subState = `${this.tutorialPart}_${this.state.currentPlayer}_${this.state.phase}`;
                } else {
                    text = "AI is blocking...";
                    subState = `${this.state.phase}`;
                }
                break;
            case 14: // Final turn start
                if (this.isP1Turn() && this.state.phase === 'Action') {
                    text = "The enemy is wide open! Finish this!";
                    highlightId = "p1-units-energizer-col p1-units-striker-col";
                } else {
                    text = "";
                }
                subState = this.state.currentPlayer + "_" + this.state.phase;
                break;
        }

        if (this.tutorialStep === this.lastTutorialStep && subState === this.lastTutorialSubState) {
            return;
        }
        this.lastTutorialStep = this.tutorialStep;
        this.lastTutorialSubState = subState;

        const oldOverlay = document.querySelector('.tutorial-overlay');
        if (oldOverlay) oldOverlay.remove();
        this.clearTutorialHighlights();
        this.tutorialHighlightId = '';

        if (text === "") return;

        this.showTutorialOverlay(text, buttonText, onButtonClick, highlightId);
    }

    // (Re)apply the current step's highlight. Unit columns are rebuilt on every render, dropping the class.
    applyTutorialHighlights() {
        if (!this.isTutorial || !this.tutorialHighlightId) return;
        this.tutorialHighlightId.split(/\s+/).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('tutorial-highlight', 'tutorial-pulse');
        });
    }

    showTutorialVictory() {
        if (document.getElementById('tutorial-victory-overlay')) return;
        localStorage.setItem('tutorialCompleted', 'true');
        this.sounds.play('VICTORY');
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-victory-overlay';
        overlay.classList.add('tutorial-overlay'); // Reuses existing overlay styles
        overlay.style.zIndex = '10005';
        overlay.innerHTML = `
            <div class="tutorial-box victory-box glass danger animate-in" style="max-width: 600px; text-align: center; padding: 3rem; border: 3px solid gold;">
                <h1 style="color: gold; font-size: 3rem; margin-bottom: 1.5rem; text-shadow: 0 0 15px rgba(255, 215, 0, 0.5);">CONGRATULATIONS! ⚔️</h1>
                <p style="font-size: 1.4rem; line-height: 1.6; margin-bottom: 2.5rem; color: white;">
                    Thank you for playing the tutorial! 🥳<br>
                    You have mastered the basics of Build Order.<br>
                    Now you are ready to face real opponents or more advanced bots.<br><br>
                    <b style="color: var(--accent-primary); font-size: 1.6rem;">Good luck on your journey!</b>
                </p>
                <button id="btn-tutorial-victory-exit" class="menu-btn primary" style="padding: 1rem 3rem; font-size: 1.5rem; min-width: 250px;">MAIN MENU</button>
            </div>
        `;
        document.body.appendChild(overlay);

        // Grey out and disable board
        if (this.elements.btnEnd) {
            this.elements.btnEnd.style.filter = 'grayscale(1) opacity(0.5)';
            this.elements.btnEnd.style.pointerEvents = 'none';
        }
        if (this.elements.btnBuy) {
            this.elements.btnBuy.style.filter = 'grayscale(1) opacity(0.5)';
            this.elements.btnBuy.style.pointerEvents = 'none';
        }
        if (this.elements.p1Units) {
            this.elements.p1Units.style.filter = 'grayscale(1) opacity(0.5)';
            this.elements.p1Units.style.pointerEvents = 'none';
        }
        if (this.elements.p2Units) {
            this.elements.p2Units.style.filter = 'grayscale(1) opacity(0.5)';
            this.elements.p2Units.style.pointerEvents = 'none';
        }

        document.getElementById('btn-tutorial-victory-exit').onclick = () => {
            overlay.remove();
            if (this.elements.btnEnd) {
                this.elements.btnEnd.style.filter = '';
                this.elements.btnEnd.style.pointerEvents = '';
            }
            if (this.elements.btnBuy) {
                this.elements.btnBuy.style.filter = '';
                this.elements.btnBuy.style.pointerEvents = '';
            }
            if (this.elements.p1Units) {
                this.elements.p1Units.style.filter = '';
                this.elements.p1Units.style.pointerEvents = '';
            }
            if (this.elements.p2Units) {
                this.elements.p2Units.style.filter = '';
                this.elements.p2Units.style.pointerEvents = '';
            }
            this.showWelcomeScreen();
        };
    }

    showTutorialOverlay(text, buttonText, onClick, highlightId) {
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';

        let html = `<div class="tutorial-text">${text}</div>`;
        if (buttonText) {
            html += `<button class="tutorial-btn">${buttonText}</button>`;
        }
        overlay.innerHTML = html;

        // Mobile UX: Click overlay to flip position if it covers something
        overlay.onclick = (e) => {
            if (e.target.closest('.tutorial-btn')) return;
            overlay.classList.toggle('top');
            this.sounds.play('CLICK');
        };

        if (buttonText && onClick) {
            overlay.querySelector('.tutorial-btn').onclick = () => {
                this.sounds.play('CLICK');
                onClick();
            };
        }

        document.body.appendChild(overlay);

        this.tutorialHighlightId = (highlightId || '').trim();
        this.applyTutorialHighlights();

        // Mobile: bring a highlighted unit into view, and keep the box away from what it points at
        if (window.innerWidth <= 768) {
            const firstId = this.tutorialHighlightId.split(/\s+/)[0];
            const target = firstId ? document.getElementById(firstId) : null;
            if (target) {
                if (firstId.endsWith('-col')) target.scrollIntoView({ block: 'nearest' });
                const rect = target.getBoundingClientRect();
                if (rect.top + rect.height / 2 > window.innerHeight / 2) {
                    overlay.classList.add('top');
                }
            }
        }
    }

    clearTutorialHighlights() {
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
            el.classList.remove('tutorial-pulse');
        });
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
