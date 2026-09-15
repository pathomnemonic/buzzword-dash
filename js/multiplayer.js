/**
 * multiplayer.js — PeerJS transport and match protocol for Buzzword Dash.
 *
 * Supports:
 * - Five-character unambiguous room codes
 * - Host and join flows with predictable Peer IDs
 * - Ready state synchronization
 * - Synchronized match start with configurable delay
 * - Live game-state updates (throttled by caller)
 * - Encounter result messages
 * - End-of-run result messages with final scores
 * - Ping/latency measurement every 3 seconds
 * - Typed callbacks for all message categories
 * - Graceful disconnect and error handling
 * - Dynamic PeerJS CDN loading (no npm needed, works on GitHub Pages)
 *
 * NEW (Multiplayer Expansion):
 * - Multiple game modes: mp_highscore, mp_suddendeath, mp_race
 * - Shared seed for deterministic card ordering and map selection
 * - Seeded card order generation for synchronized question pools
 * - Mode selection constants and configuration
 * - Elimination and race finish message types
 * - Rush reminder overlay support
 *
 * PeerJS abstracts WebRTC into a simple API. After the initial
 * signaling handshake via the free PeerJS cloud server, all data
 * flows directly between browsers with DTLS encryption [3].
 *
 * Usage:
 *   import { multiplayer, MP_MODES, getSeededCardOrder } from './multiplayer.js';
 *   await multiplayer.init();
 *   multiplayer.hostGame(function(code) { ... });
 *   multiplayer.joinGame('ABCDE');
 *   multiplayer.sendGameState({ lane: 1, score: 500, ... });
 */

var PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
var PEER_PREFIX = 'buzzworddash-';
var peerLoadPromise = null;

// ===== MULTIPLAYER MODE DEFINITIONS =====

/**
 * Available multiplayer game modes.
 * UI uses this to render mode selection buttons after both players connect.
 */
export var MP_MODES = [
    {
        id: 'mp_highscore',
        name: '⏱️ High Score',
        desc: 'Most points when timer expires',
        configs: ['timeLimit'],
        defaults: { timeLimit: 120 }
    },
    {
        id: 'mp_suddendeath',
        name: '💀 Sudden Death',
        desc: 'First wrong answer loses',
        configs: [],
        defaults: {}
    },
    {
        id: 'mp_race',
        name: '🏁 Race',
        desc: 'First to X correct wins',
        configs: ['targetCorrect'],
        defaults: { targetCorrect: 20 }
    }
];

// ===== SEEDED RANDOM NUMBER GENERATOR =====

/**
 * Simple deterministic pseudo-random number generator (xorshift32).
 * Used to ensure both players get the same card order from the same seed.
 * Based on George Marsaglia's xorshift algorithm [6].
 *
 * @param {number} seed - Integer seed
 * @returns {function} Function that returns next pseudo-random float [0, 1)
 */
function createSeededRandom(seed) {
    var state = seed | 0;
    if (state === 0) state = 1; // xorshift cannot have state 0

    return function () {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) / 4294967296);
    };
}

/**
 * Generate a deterministic card order from a shared seed.
 * Both players call this with the same seed and subjects to get
 * identical card ID sequences for synchronized gameplay.
 *
 * Used by mp_highscore and mp_suddendeath modes where both players
 * must see the same questions in the same order.
 *
 * @param {number} seed - Shared RNG seed from startMatch message
 * @param {string[]} subjects - Array of selected subject names
 * @param {number} count - Number of cards to include in the order
 * @returns {string[]} Array of card IDs in deterministic order
 */
export function getSeededCardOrder(seed, subjects, count) {
    // Lazy import to avoid circular dependency issues
    // The caller (engine.js/gates.js) should have CARDS available
    // We import here for standalone usage
    var CARDS;
    var customCards;

    try {
        // Dynamic access — these modules should already be loaded by the time
        // multiplayer match starts
        CARDS = window.__BUZZWORD_CARDS || [];
        customCards = window.__BUZZWORD_CUSTOM_CARDS || [];
    } catch (e) {
        CARDS = [];
        customCards = [];
    }

    var allCards = CARDS.concat(customCards);

    // Filter by subjects (empty subjects = all subjects)
    var pool;
    if (subjects && subjects.length > 0) {
        pool = allCards.filter(function (c) {
            return subjects.indexOf(c.subj) >= 0;
        });
    } else {
        pool = allCards.slice();
    }

    if (pool.length === 0) {
        return [];
    }

    // Fisher-Yates shuffle with seeded random
    var rng = createSeededRandom(seed);
    var shuffled = pool.slice();

    for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
    }

    // Return requested count of card IDs
    var result = [];
    var limit = Math.min(count, shuffled.length);
    for (var k = 0; k < limit; k++) {
        result.push(shuffled[k].id);
    }

    return result;
}

/**
 * Get a deterministic skin index from a shared seed.
 * Both players use this to select the same map/skin.
 *
 * @param {number} seed - Shared seed
 * @param {number} skinCount - Total number of available skins
 * @returns {number} Skin index
 */
export function getSeededSkinIndex(seed, skinCount) {
    if (!skinCount || skinCount <= 0) return 0;
    // Use a simple modulo approach with bit mixing for better distribution
    var mixed = seed;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x45d9f3b);
    mixed ^= mixed >>> 16;
    return ((mixed >>> 0) % skinCount);
}

// ===== PEERJS LOADING =====

/**
 * Dynamically load PeerJS from CDN.
 * Caches the promise so it's only loaded once.
 * @returns {Promise<void>}
 */
function loadPeerJS() {
    if (window.Peer) {
        return Promise.resolve();
    }

    if (peerLoadPromise) {
        return peerLoadPromise;
    }

    peerLoadPromise = new Promise(function (resolve, reject) {
        var existing = document.querySelector(
            'script[data-buzzword-peerjs]'
        );

        if (existing) {
            existing.addEventListener('load', function () {
                resolve();
            });
            existing.addEventListener('error', function () {
                reject(new Error('Failed to load PeerJS.'));
            });
            return;
        }

        var script = document.createElement('script');
        script.src = PEERJS_URL;
        script.async = true;
        script.dataset.buzzwordPeerjs = 'true';

        script.onload = function () {
            if (window.Peer) {
                resolve();
            } else {
                reject(new Error('PeerJS loaded but Peer was unavailable.'));
            }
        };

        script.onerror = function () {
            reject(new Error('Failed to load PeerJS.'));
        };

        document.head.appendChild(script);
    });

    return peerLoadPromise;
}

// ===== ROOM CODE UTILITIES =====

/**
 * Normalize a room code to uppercase, removing ambiguous characters.
 * @param {string} code
 * @returns {string}
 */
function normalizeRoomCode(code) {
    return String(code || '')
        .toUpperCase()
        .replace(/[^A-HJ-NP-Z2-9]/g, '')
        .slice(0, 5);
}

// ===== RUSH REMINDER =====

/**
 * Show a brief rush reminder overlay at the start of a multiplayer match.
 * Displays for 3 seconds then fades out.
 */
function showRushReminder() {
    var existing = document.getElementById('mpRushReminder');
    if (existing) existing.remove();

    var reminder = document.createElement('div');
    reminder.id = 'mpRushReminder';
    reminder.innerHTML = '💡 TIP: Double-tap or press Shift to RUSH through gates for bonus points! ⚡';
    reminder.style.cssText =
        'position:fixed;top:12%;left:50%;transform:translateX(-50%);' +
        'z-index:40;padding:14px 24px;border-radius:16px;' +
        'background:rgba(10,5,30,0.94);border:2px solid rgba(255,136,0,0.6);' +
        'color:#fff;font-size:13px;font-weight:700;text-align:center;' +
        'max-width:340px;pointer-events:none;' +
        'transition:opacity 0.5s ease;opacity:1;' +
        'box-shadow:0 0 20px rgba(255,136,0,0.2);';

    document.body.appendChild(reminder);

    setTimeout(function () {
        reminder.style.opacity = '0';
    }, 2500);

    setTimeout(function () {
        if (reminder.parentNode) reminder.parentNode.removeChild(reminder);
    }, 3200);
}

// ===== MULTIPLAYER CLASS =====

export class Multiplayer {
    constructor() {
        this.peer = null;
        this.conn = null;

        this.roomCode = '';
        this.isHost = false;
        this.connected = false;

        this.localReady = false;
        this.opponentReady = false;

        this.latency = null;
        this.pingInterval = null;

        // Selected multiplayer mode (set before starting match)
        this.selectedMode = 'mp_highscore';
        this.modeConfig = {};

        // Shared seed for deterministic card/skin selection
        this.sharedSeed = 0;

        // Typed callbacks
        this.onConnected = null;
        this.onDisconnected = null;
        this.onError = null;

        this.onOpponentUpdate = null;
        this.onReadyState = null;
        this.onMatchStart = null;
        this.onEncounterResult = null;
        this.onEndRun = null;
        this.onMessage = null;

        // NEW callbacks for expanded modes
        this.onEliminated = null;      // Sudden death: opponent was eliminated
        this.onRaceFinished = null;    // Race mode: opponent finished the race
        this.onModeSelected = null;    // Mode selection confirmed by host
    }

    /**
     * Initialize PeerJS. Must be called before host/join.
     * @returns {Promise<void>}
     */
    async init() {
        await loadPeerJS();
    }

    /**
     * Generate a 5-character room code.
     * Uses characters that are unambiguous (no O/0, I/1, L).
     * @returns {string}
     */
    generateRoomCode() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var code = '';

        for (var i = 0; i < 5; i++) {
            code += chars.charAt(
                Math.floor(Math.random() * chars.length)
            );
        }

        return code;
    }

    /**
     * Set the multiplayer game mode and its configuration.
     * Should be called by the host before sendStartMatch().
     *
     * @param {string} modeId - One of: 'mp_highscore', 'mp_suddendeath', 'mp_race'
     * @param {object} [config] - Mode-specific configuration
     */
    setMode(modeId, config) {
        this.selectedMode = modeId || 'mp_highscore';
        this.modeConfig = config || {};

        // Apply defaults from MP_MODES if not specified
        for (var i = 0; i < MP_MODES.length; i++) {
            if (MP_MODES[i].id === this.selectedMode) {
                var defaults = MP_MODES[i].defaults || {};
                for (var key in defaults) {
                    if (this.modeConfig[key] === undefined) {
                        this.modeConfig[key] = defaults[key];
                    }
                }
                break;
            }
        }

        // Broadcast mode selection to opponent
        this.send({
            type: 'modeSelected',
            mode: this.selectedMode,
            config: this.modeConfig,
            timestamp: Date.now()
        });
    }

    /**
     * Host a new game room.
     * Creates a Peer with a predictable ID based on the room code.
     * The opponent joins by connecting to this ID.
     *
     * @param {function} onReady - Called with the room code when peer is open
     */
    async hostGame(onReady) {
        await this.init();
        this.disconnect();

        this.isHost = true;
        this.roomCode = this.generateRoomCode();
        this.localReady = false;
        this.opponentReady = false;

        var self = this;

        try {
            this.peer = new window.Peer(
                PEER_PREFIX + this.roomCode
            );
        } catch (error) {
            this._emitError(
                'Failed to create room: ' + error.message
            );
            return;
        }

        this.peer.on('open', function () {
            if (onReady) {
                onReady(self.roomCode);
            }
        });

        this.peer.on('connection', function (conn) {
            // Only accept one opponent
            if (self.conn && self.conn.open) {
                conn.close();
                return;
            }

            self.conn = conn;
            self._setupConnection(conn);
        });

        this.peer.on('disconnected', function () {
            self.connected = false;
            self._stopPing();

            if (self.onDisconnected) {
                self.onDisconnected('Peer signaling disconnected.');
            }
        });

        this.peer.on('close', function () {
            self._handleDisconnected('Room closed.');
        });

        this.peer.on('error', function (error) {
            self._emitError(
                (error.type || 'Peer error') +
                ': ' +
                (error.message || 'Unknown error')
            );
        });
    }

    /**
     * Join an existing game room.
     * Connects to the host's Peer using the room code.
     *
     * @param {string} roomCode - The 5-character room code
     * @param {function} [onReady] - Called when connection attempt starts
     */
    async joinGame(roomCode, onReady) {
        await this.init();
        this.disconnect();

        var normalized = normalizeRoomCode(roomCode);

        if (normalized.length !== 5) {
            this._emitError('Room code must contain five characters.');
            return;
        }

        this.isHost = false;
        this.roomCode = normalized;
        this.localReady = false;
        this.opponentReady = false;

        var self = this;

        try {
            this.peer = new window.Peer();
        } catch (error) {
            this._emitError(
                'Failed to initialize multiplayer: ' + error.message
            );
            return;
        }

        this.peer.on('open', function () {
            try {
                var conn = self.peer.connect(
                    PEER_PREFIX + self.roomCode,
                    {
                        reliable: true,
                        serialization: 'json'
                    }
                );

                self.conn = conn;
                self._setupConnection(conn);

                if (onReady) {
                    onReady();
                }
            } catch (error) {
                self._emitError(
                    'Connection failed: ' + error.message
                );
            }
        });

        this.peer.on('disconnected', function () {
            self.connected = false;
            self._stopPing();

            if (self.onDisconnected) {
                self.onDisconnected('Peer signaling disconnected.');
            }
        });

        this.peer.on('close', function () {
            self._handleDisconnected('Connection closed.');
        });

        this.peer.on('error', function (error) {
            var message = error.message || error.type || 'Unknown error';

            if (error.type === 'peer-unavailable') {
                message = 'Room not found. Check the room code.';
            }

            self._emitError(message);
        });
    }

    /**
     * Set up event handlers on a data connection.
     * @param {DataConnection} conn
     * @private
     */
    _setupConnection(conn) {
        var self = this;

        conn.on('open', function () {
            self.connected = true;
            self.localReady = false;
            self.opponentReady = false;

            self._startPing();

            self.send({
                type: 'hello',
                protocolVersion: 2, // Bumped for new mode support
                timestamp: Date.now()
            });

            if (self.onConnected) {
                self.onConnected({
                    roomCode: self.roomCode,
                    isHost: self.isHost
                });
            }
        });

        conn.on('data', function (data) {
            self._handleMessage(data);
        });

        conn.on('close', function () {
            self._handleDisconnected('Opponent disconnected.');
        });

        conn.on('error', function (error) {
            self._emitError(
                'Connection error: ' +
                (error.message || 'Unknown error')
            );
        });
    }

    /**
     * Handle an incoming message from the opponent.
     * Routes to the appropriate typed callback.
     * @param {object} data
     * @private
     */
    _handleMessage(data) {
        if (!data || typeof data !== 'object') {
            return;
        }

        // Generic message callback
        if (this.onMessage) {
            this.onMessage(data);
        }

        switch (data.type) {
            case 'hello':
                this.send({
                    type: 'helloAck',
                    protocolVersion: 2,
                    timestamp: Date.now()
                });
                break;

            case 'helloAck':
                // Connection fully established
                break;

            case 'ready':
                this.opponentReady = !!data.ready;

                if (this.onReadyState) {
                    this.onReadyState({
                        localReady: this.localReady,
                        opponentReady: this.opponentReady
                    });
                }
                break;

            case 'modeSelected':
                // Opponent (host) has selected a mode
                this.selectedMode = data.mode || 'mp_highscore';
                this.modeConfig = data.config || {};
                if (this.onModeSelected) {
                    this.onModeSelected({
                        mode: this.selectedMode,
                        config: this.modeConfig
                    });
                }
                break;

            case 'startMatch':
                this.sharedSeed = data.seed || 0;
                if (this.onMatchStart) {
                    this.onMatchStart({
                        startAt: data.startAt,
                        seed: data.seed,
                        subjects: data.subjects || [],
                        mode: data.mode || 'versus',
                        config: data.config || {}
                    });
                }
                // Show rush reminder for all multiplayer modes
                showRushReminder();
                break;

            case 'gameState':
                if (this.onOpponentUpdate) {
                    this.onOpponentUpdate(data);
                }
                break;

            case 'encounterResult':
                if (this.onEncounterResult) {
                    this.onEncounterResult(data);
                }
                break;

            case 'eliminated':
                // Sudden death: opponent reports they were eliminated
                if (this.onEliminated) {
                    this.onEliminated(data);
                }
                break;

            case 'raceFinished':
                // Race mode: opponent finished reaching target correct
                if (this.onRaceFinished) {
                    this.onRaceFinished(data);
                }
                break;

            case 'endRun':
                if (this.onEndRun) {
                    this.onEndRun(data);
                }
                break;

            case 'ping':
                this.send({
                    type: 'pong',
                    pingId: data.pingId,
                    originalTimestamp: data.originalTimestamp,
                    timestamp: Date.now()
                });
                break;

            case 'pong':
                if (data.originalTimestamp) {
                    this.latency = Math.max(
                        0,
                        Date.now() - data.originalTimestamp
                    );
                }
                break;
        }
    }

    /**
     * Send data to the connected peer.
     * @param {object} data
     * @returns {boolean} Whether the send succeeded
     */
    send(data) {
        if (!this.conn || !this.conn.open) {
            return false;
        }

        try {
            this.conn.send(data);
            return true;
        } catch (error) {
            console.warn('Multiplayer send failed:', error);
            return false;
        }
    }

    /**
     * Signal readiness to start the match.
     * @param {boolean} [ready=true]
     */
    sendReady(ready) {
        this.localReady = ready !== false;

        this.send({
            type: 'ready',
            ready: this.localReady,
            timestamp: Date.now()
        });

        if (this.onReadyState) {
            this.onReadyState({
                localReady: this.localReady,
                opponentReady: this.opponentReady
            });
        }
    }

    /**
     * Start the match (host only).
     * Sends a startMatch message with a future timestamp so both
     * clients can synchronize their countdown.
     *
     * Now supports multiple game modes with per-mode configuration.
     *
     * @param {object} [config]
     * @param {number} [config.startAt] - Timestamp when match begins
     * @param {number} [config.seed] - Shared RNG seed
     * @param {string[]} [config.subjects] - Subject list
     * @param {string} [config.mode] - Game mode ID (mp_highscore, mp_suddendeath, mp_race, or versus)
     * @param {object} [config.modeConfig] - Mode-specific configuration overrides
     * @returns {object|false} The config sent, or false if not host
     */
    sendStartMatch(config) {
        if (!this.isHost) {
            return false;
        }

        config = config || {};

        var seed = config.seed || Math.floor(Math.random() * 2147483647);
        this.sharedSeed = seed;

        // Determine the mode — use selectedMode if set, fall back to config or 'versus'
        var mode = config.mode || this.selectedMode || 'versus';

        // Merge mode config: explicit overrides > stored modeConfig > defaults
        var finalModeConfig = {};
        
        // Start with defaults for the selected mode
        for (var i = 0; i < MP_MODES.length; i++) {
            if (MP_MODES[i].id === mode) {
                var defaults = MP_MODES[i].defaults || {};
                for (var dk in defaults) {
                    finalModeConfig[dk] = defaults[dk];
                }
                break;
            }
        }

        // Layer on stored modeConfig
        if (this.modeConfig) {
            for (var mk in this.modeConfig) {
                finalModeConfig[mk] = this.modeConfig[mk];
            }
        }

        // Layer on explicit overrides from config parameter
        if (config.modeConfig) {
            for (var ck in config.modeConfig) {
                finalModeConfig[ck] = config.modeConfig[ck];
            }
        }

        var message = {
            type: 'startMatch',
            startAt: config.startAt || Date.now() + 1500,
            seed: seed,
            subjects: Array.isArray(config.subjects)
                ? config.subjects.slice()
                : [],
            mode: mode,
            config: finalModeConfig,
            timestamp: Date.now()
        };

        this.send(message);

        // Show rush reminder for host too
        showRushReminder();

        return message;
    }

    /**
     * Send current game state to opponent.
     * Called periodically (throttled) during gameplay.
     *
     * Now includes additional fields for mode-specific tracking.
     *
     * @param {object} state
     * @returns {boolean}
     */
    sendGameState(state) {
        state = state || {};

        return this.send({
            type: 'gameState',
            lane: Number(state.lane) || 0,
            score: Number(state.score) || 0,
            streak: Number(state.streak) || 0,
            correct: Number(state.correct) || 0,
            wrong: Number(state.wrong) || 0,
            lives: Number(state.lives) || 0,
            rushing: !!state.rushing,
            rushStacks: Number(state.rushStacks) || 0,
            running: !!state.running,
            // NEW fields for expanded modes
            correctCount: Number(state.correctCount) || Number(state.correct) || 0,
            timeRemaining: Number(state.timeRemaining) || 0,
            eliminated: !!state.eliminated,
            timestamp: Date.now()
        });
    }

    /**
     * Send encounter result in real-time.
     *
     * @param {boolean} correct
     * @param {number} score
     * @param {string} [cardId] - Optional card ID for shared-question verification
     * @returns {boolean}
     */
    sendEncounterResult(correct, score, cardId) {
        return this.send({
            type: 'encounterResult',
            correct: !!correct,
            score: Number(score) || 0,
            cardId: cardId || '',
            timestamp: Date.now()
        });
    }

    /**
     * Send elimination message (Sudden Death mode).
     * Called when this player gets a wrong answer in sudden death.
     *
     * @param {string} cardId - The card that caused elimination
     * @returns {boolean}
     */
    sendEliminated(cardId) {
        return this.send({
            type: 'eliminated',
            cardId: cardId || '',
            timestamp: Date.now()
        });
    }

    /**
     * Send race finished message (Race mode).
     * Called when this player reaches the target number of correct answers.
     *
     * @param {number} correctCount - Total correct answers (should equal target)
     * @param {number} totalTime - Time in milliseconds from match start to finish
     * @returns {boolean}
     */
    sendRaceFinished(correctCount, totalTime) {
        return this.send({
            type: 'raceFinished',
            correctCount: Number(correctCount) || 0,
            totalTime: Number(totalTime) || 0,
            timestamp: Date.now()
        });
    }

    /**
     * Send end-of-run results to opponent.
     *
     * @param {object} finalState
     * @returns {boolean}
     */
    sendEndRun(finalState) {
        finalState = finalState || {};

        return this.send({
            type: 'endRun',
            score: Number(finalState.score) || 0,
            correct: Number(finalState.correct) || 0,
            wrong: Number(finalState.wrong) || 0,
            bestStreak: Number(finalState.bestStreak) || 0,
            coins: Number(finalState.coins) || 0,
            // NEW fields
            correctCount: Number(finalState.correctCount) || Number(finalState.correct) || 0,
            eliminated: !!finalState.eliminated,
            raceTime: Number(finalState.raceTime) || 0,
            timestamp: Date.now()
        });
    }

    /**
     * Check if currently connected to an opponent.
     * @returns {boolean}
     */
    isConnected() {
        return !!(
            this.connected &&
            this.conn &&
            this.conn.open
        );
    }

    /**
     * Get the current shared seed for this match.
     * @returns {number}
     */
    getSeed() {
        return this.sharedSeed;
    }

    /**
     * Get the current selected mode.
     * @returns {string}
     */
    getMode() {
        return this.selectedMode || 'versus';
    }

    /**
     * Get the current mode configuration.
     * @returns {object}
     */
    getModeConfig() {
        return this.modeConfig || {};
    }

    /**
     * Start periodic ping messages for latency measurement.
     * @private
     */
    _startPing() {
        this._stopPing();

        var self = this;

        this.pingInterval = setInterval(function () {
            if (!self.isConnected()) {
                return;
            }

            var now = Date.now();

            self.send({
                type: 'ping',
                pingId: now,
                originalTimestamp: now
            });
        }, 3000);
    }

    /**
     * Stop periodic ping messages.
     * @private
     */
    _stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Handle disconnection cleanup and callback.
     * @param {string} reason
     * @private
     */
    _handleDisconnected(reason) {
        var wasConnected = this.connected;

        this.connected = false;
        this.localReady = false;
        this.opponentReady = false;
        this._stopPing();

        if (wasConnected && this.onDisconnected) {
            this.onDisconnected(reason || 'Disconnected.');
        }
    }

    /**
     * Emit an error via callback and console.
     * @param {string} message
     * @private
     */
    _emitError(message) {
        console.warn('Multiplayer:', message);

        if (this.onError) {
            this.onError(message);
        }
    }

    /**
     * Disconnect from opponent and destroy peer.
     * Safe to call multiple times.
     */
    disconnect() {
        this._stopPing();

        this.connected = false;
        this.localReady = false;
        this.opponentReady = false;

        if (this.conn) {
            try {
                this.conn.close();
            } catch (error) {
                // Ignore cleanup errors.
            }

            this.conn = null;
        }

        if (this.peer) {
            try {
                this.peer.destroy();
            } catch (error) {
                // Ignore cleanup errors.
            }

            this.peer = null;
        }

        this.roomCode = '';
        this.isHost = false;
        this.latency = null;
        this.sharedSeed = 0;
    }
}

export var multiplayer = new Multiplayer();
