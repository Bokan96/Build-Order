/**
 * MultiplayerManager — PeerJS-based P2P networking for Build Order
 * Handles room creation, joining, and real-time action messaging.
 */

class MultiplayerManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.roomCode = null;
        this.connected = false;

        // Callbacks
        this._onAction = null;
        this._onStateChange = null;
        this._onError = null;
    }

    /**
     * Pool of memorable 3-letter room codes
     */
    static ROOM_CODES = [
        'ACE', 'CAT', 'DOG', 'FOX', 'KEY',
        'MAP', 'SUN', 'WAR', 'WIN', 'TOP',
        'FUN', 'RED', 'BOX', 'JET', 'CAP',
        'RUN', 'PIG', 'BAT', 'CAR', 'HAT',
        'ANT', 'ARM', 'ART', 'BEE', 'BUS',
        'COW', 'CUP', 'DAY', 'EGG', 'ELF',
        'FAN', 'FIG', 'GEM', 'GYM', 'HEN',
        'ICE', 'INK', 'JAM', 'KIT', 'LOG',
        'MUD', 'NET', 'OAK', 'OWL', 'PAN',
        'PEN', 'POT', 'RAT', 'RAY', 'SEA',
        'SKY', 'TEA', 'TOY', 'VAN', 'WEB',
        'YAK', 'ZIP', 'ZOO', 'BUG', 'COD'
    ];

    /**
     * Pick a random room code from the word list, skipping any in `exclude`
     */
    _generateCode(exclude = new Set()) {
        const codes = MultiplayerManager.ROOM_CODES.filter(c => !exclude.has(c));
        return codes[Math.floor(Math.random() * codes.length)];
    }

    /**
     * Set callback for incoming game actions
     */
    onAction(callback) {
        this._onAction = callback;
    }

    /**
     * Set callback for connection state changes
     * States: 'connecting', 'connected', 'disconnected', 'error'
     */
    onStateChange(callback) {
        this._onStateChange = callback;
    }

    /**
     * Set callback for errors
     */
    onError(callback) {
        this._onError = callback;
    }

    _emitState(state, detail = '') {
        this.connected = (state === 'connected');
        if (this._onStateChange) this._onStateChange(state, detail);
    }

    _emitError(msg) {
        console.error('[Multiplayer]', msg);
        if (this._onError) this._onError(msg);
    }

    /**
     * Create a room (Host mode).
     * Returns a Promise that resolves with the room code once the peer is ready.
     * If the chosen code is already taken, retries with a different one.
     */
    async createRoom(maxAttempts = 5) {
        this.isHost = true;
        this._emitState('connecting', 'Creating room...');
        const tried = new Set();

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            this.roomCode = this._generateCode(tried);
            tried.add(this.roomCode);
            try {
                await this._openHostPeer(this.roomCode);
                return this.roomCode;
            } catch (err) {
                const taken = err && err.type === 'unavailable-id';
                if (!taken || attempt === maxAttempts) {
                    this._emitError(taken ? 'No free room code found. Try again.' : `Connection error: ${err && err.type}`);
                    throw err;
                }
                console.warn(`[Multiplayer] Room code ${this.roomCode} is taken, retrying...`);
            }
        }
    }

    /**
     * Register the host peer for a room code. Resolves once the signaling server accepts it.
     */
    _openHostPeer(code) {
        return new Promise((resolve, reject) => {
            const peer = new Peer('bo-' + code, {
                debug: 1
            });
            this.peer = peer;
            let opened = false;

            peer.on('open', (id) => {
                opened = true;
                console.log('[Multiplayer] Room created:', id);
                this._emitState('waiting', 'Waiting for opponent...');
                resolve();
            });

            peer.on('connection', (conn) => {
                if (this.conn) {
                    // Room already has an opponent; refuse extra guests
                    console.warn('[Multiplayer] Rejecting extra connection');
                    conn.on('open', () => conn.close());
                    return;
                }
                console.log('[Multiplayer] Opponent connected!');
                this.conn = conn;
                this._setupConnection(conn);
            });

            peer.on('error', (err) => {
                console.error('[Multiplayer] Peer error:', err);
                if (!opened) {
                    peer.destroy();
                    reject(err);
                } else {
                    this._emitError(`Connection error: ${err.type}`);
                }
            });

            peer.on('disconnected', () => {
                console.log('[Multiplayer] Peer disconnected from signaling server');
            });
        });
    }

    /**
     * Join an existing room (Guest mode).
     * Returns a Promise that resolves when connected.
     */
    joinRoom(code) {
        return new Promise((resolve, reject) => {
            this.isHost = false;
            this.roomCode = code.toUpperCase().trim();

            this._emitState('connecting', 'Connecting to room...');

            this.peer = new Peer(null, {
                debug: 1
            });

            this.peer.on('open', () => {
                console.log('[Multiplayer] Connecting to room:', this.roomCode);
                const conn = this.peer.connect('bo-' + this.roomCode, { reliable: true });

                conn.on('open', () => {
                    console.log('[Multiplayer] Connected to host!');
                    this.conn = conn;
                    this._setupConnection(conn);
                    resolve();
                });

                conn.on('error', (err) => {
                    this._emitError(`Failed to connect: ${err}`);
                    reject(err);
                });

                // Timeout for connection
                setTimeout(() => {
                    if (!this.connected) {
                        this._emitError('Connection timed out. Check the room code.');
                        reject(new Error('Connection timeout'));
                    }
                }, 15000);
            });

            this.peer.on('error', (err) => {
                console.error('[Multiplayer] Peer error:', err);
                if (err.type === 'peer-unavailable') {
                    this._emitError('Room not found. Check the code and try again.');
                } else {
                    this._emitError(`Connection error: ${err.type}`);
                }
                reject(err);
            });
        });
    }

    /**
     * Set up data connection event handlers
     */
    _setupConnection(conn) {
        this._emitState('connected', 'Opponent connected!');

        conn.on('data', (data) => {
            console.log('[Multiplayer] Received:', data);
            if (this._onAction && data && data.type) {
                this._onAction(data);
            }
        });

        conn.on('close', () => {
            console.log('[Multiplayer] Connection closed');
            this.connected = false;
            this._emitState('disconnected', 'Opponent disconnected');
        });

        conn.on('error', (err) => {
            console.error('[Multiplayer] Connection error:', err);
            this._emitError(`Connection error: ${err}`);
        });
    }

    /**
     * Send a game action to the remote player
     */
    sendAction(action) {
        if (!this.conn || !this.connected) {
            console.warn('[Multiplayer] Cannot send: not connected');
            return false;
        }

        console.log('[Multiplayer] Sending:', action);
        this.conn.send(action);
        return true;
    }

    /**
     * Clean disconnect
     */
    disconnect() {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.connected = false;
        this.roomCode = null;
        this.isHost = false;
        this._emitState('disconnected', 'Disconnected');
    }
}
