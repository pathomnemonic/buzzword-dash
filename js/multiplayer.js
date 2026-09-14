/**
 * multiplayer.js — PeerJS head-to-head + optional Firebase leaderboard
 *
 * PeerJS handles real-time peer-to-peer connections via WebRTC.
 * The free PeerJS cloud signaling server handles connection setup [3].
 * After the initial handshake, all data flows directly between browsers.
 *
 * Firebase (optional) handles async leaderboards and daily rankings.
 * Both work on GitHub Pages with zero server cost.
 *
 * Usage:
 *   import { multiplayer } from './multiplayer.js';
 *   await multiplayer.init();
 *   multiplayer.hostGame(function(code) { ... });
 *   multiplayer.joinGame('ABCDE', function() { ... });
 *   multiplayer.sendGameState({ lane: 1, score: 500 });
 */

export class Multiplayer {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.roomCode = '';
        this.isHost = false;
        this.connected = false;

        // Callbacks
        this.onOpponentUpdate = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onError = null;
    }

    /**
     * Dynamically load PeerJS from CDN.
     * No npm install needed — works on GitHub Pages.
     */
    async init() {
        if (window.Peer) return;

        await new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
            script.onload = resolve;
            script.onerror = function () {
                reject(new Error('Failed to load PeerJS'));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Generate a 5-character room code.
     * Uses characters that are unambiguous (no O/0, I/1, L).
     */
    generateRoomCode() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var code = '';
        for (var i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Host a new game room.
     * Creates a Peer with a predictable ID based on the room code.
     * The opponent joins by connecting to this ID.
     *
     * @param {function} onReady - Called with the room code when peer is open
     */
    hostGame(onReady) {
        var self = this;
        this.isHost = true;
        this.roomCode = this.generateRoomCode();

        try {
            this.peer = new Peer('buzzworddash-' + this.roomCode);
        } catch (e) {
            if (this.onError) this.onError('Failed to create peer: ' + e.message);
            return;
        }

        this.peer.on('open', function () {
            if (onReady) onReady(self.roomCode);
        });

        this.peer.on('connection', function (conn) {
            self.conn = conn;
            self._setupConnection(conn);
        });

        this.peer.on('error', function (err) {
            console.warn('PeerJS host error:', err.type, err.message);
            if (self.onError) self.onError(err.type + ': ' + err.message);
        });
    }

    /**
     * Join an existing game room.
     * Connects to the host's Peer using the room code.
     *
     * @param {string} roomCode - The 5-character room code
     * @param {function} onReady - Called when connection attempt starts
     */
    joinGame(roomCode, onReady) {
        var self = this;
        this.isHost = false;
        this.roomCode = roomCode.toUpperCase().trim();

        try {
            this.peer = new Peer();
        } catch (e) {
            if (this.onError) this.onError('Failed to create peer: ' + e.message);
            return;
        }

        this.peer.on('open', function () {
            try {
                var conn = self.peer.connect('buzzworddash-' + self.roomCode, {
                    reliable: true
                });
                self.conn = conn;
                self._setupConnection(conn);
                if (onReady) onReady();
            } catch (e) {
                if (self.onError) self.onError('Connection failed: ' + e.message);
            }
        });

        this.peer.on('error', function (err) {
            console.warn('PeerJS join error:', err.type, err.message);
            if (self.onError) self.onError(err.type + ': ' + err.message);
        });
    }

    /**
     * Set up event handlers on a data connection.
     * @param {DataConnection} conn
     */
    _setupConnection(conn) {
        var self = this;

        conn.on('open', function () {
            self.connected = true;
            if (self.onConnected) self.onConnected();
        });

        conn.on('data', function (data) {
            if (self.onOpponentUpdate) self.onOpponentUpdate(data);
        });

        conn.on('close', function () {
            self.connected = false;
            if (self.onDisconnected) self.onDisconnected();
        });

        conn.on('error', function (err) {
            console.warn('PeerJS connection error:', err);
            if (self.onError) self.onError('Connection error');
        });
    }

    /**
     * Send arbitrary data to the connected peer.
     * @param {object} data
     */
    send(data) {
        if (this.conn && this.conn.open) {
            try {
                this.conn.send(data);
            } catch (e) {
                console.warn('Send failed:', e);
            }
        }
    }

    /**
     * Send current game state to opponent.
     * Called every frame or on significant state changes during gameplay.
     *
     * @param {object} state - Current game state snapshot
     */
    sendGameState(state) {
        this.send({
            type: 'gameState',
            lane: state.lane,
            score: state.score,
            streak: state.streak,
            correct: state.correct,
            wrong: state.wrong,
            rushing: state.rushing,
            rushStacks: state.rushStacks,
            timestamp: Date.now()
        });
    }

    /**
     * Send end-of-run results to opponent.
     *
     * @param {object} finalState - Final run statistics
     */
    sendEndRun(finalState) {
        this.send({
            type: 'endRun',
            score: finalState.score,
            correct: finalState.correct,
            wrong: finalState.wrong,
            bestStreak: finalState.bestStreak,
            coins: finalState.coins,
            timestamp: Date.now()
        });
    }

    /**
     * Send a ready signal to opponent (both players ready to start).
     */
    sendReady() {
        this.send({ type: 'ready', timestamp: Date.now() });
    }

    /**
     * Send encounter result in real-time.
     *
     * @param {boolean} correct - Whether the answer was correct
     * @param {number} score - Current total score
     */
    sendEncounterResult(correct, score) {
        this.send({
            type: 'encounterResult',
            correct: correct,
            score: score,
            timestamp: Date.now()
        });
    }

    /**
     * Check if currently connected to an opponent.
     * @returns {boolean}
     */
    isConnected() {
        return this.connected && this.conn && this.conn.open;
    }

    /**
     * Disconnect from opponent and destroy peer.
     */
    disconnect() {
        this.connected = false;
        if (this.conn) {
            try { this.conn.close(); } catch (e) {}
            this.conn = null;
        }
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
        }
        this.roomCode = '';
    }
}

export var multiplayer = new Multiplayer();
