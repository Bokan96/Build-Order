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
        'RUN', 'PIG', 'BAT', 'CAR', 'HAT'
    ];

    /**
     * Pick a random room code from the word list
     */
    _generateCode() {
        const codes = MultiplayerManager.ROOM_CODES;
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
     */
    createRoom() {
        return new Promise((resolve, reject) => {
            this.isHost = true;
            this.roomCode = this._generateCode();

            this._emitState('connecting', 'Creating room...');

            this.peer = new Peer(this.roomCode, {
                debug: 1
            });

            this.peer.on('open', (id) => {
                console.log('[Multiplayer] Room created:', id);
                this._emitState('waiting', 'Waiting for opponent...');
                resolve(this.roomCode);
            });

            this.peer.on('connection', (conn) => {
                console.log('[Multiplayer] Opponent connected!');
                this.conn = conn;
                this._setupConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('[Multiplayer] Peer error:', err);
                if (err.type === 'unavailable-id') {
                    this._emitError('Room code already in use. Try again.');
                    reject(new Error('Room code already in use'));
                } else {
                    this._emitError(`Connection error: ${err.type}`);
                    reject(err);
                }
            });

            this.peer.on('disconnected', () => {
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
                const conn = this.peer.connect(this.roomCode, { reliable: true });

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
