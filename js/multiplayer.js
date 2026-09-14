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
 * PeerJS abstracts WebRTC into a simple API. After the initial
 * signaling handshake via the free PeerJS cloud server, all data
 * flows directly between browsers with DTLS encryption.
 *
 * Usage:
 *   import { multiplayer } from './multiplayer.js';
 *   await multiplayer.init();
 *   multiplayer.hostGame(function(code) { ... });
 *   multiplayer.joinGame('ABCDE');
 *   multiplayer.sendGameState({ lane: 1, score: 500, ... });
 */

var PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
var PEER_PREFIX = 'buzzworddash-';
var peerLoadPromise = null;

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
        protocolVersion: 1,
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
          protocolVersion: 1,
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

      case 'startMatch':
        if (this.onMatchStart) {
          this.onMatchStart({
            startAt: data.startAt,
            seed: data.seed,
            subjects: data.subjects || [],
            mode: data.mode || 'versus'
          });
        }
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
   * @param {object} [config]
   * @param {number} [config.startAt] - Timestamp when match begins
   * @param {number} [config.seed] - Shared RNG seed
   * @param {string[]} [config.subjects] - Subject list
   * @returns {object|false} The config sent, or false if not host
   */
  sendStartMatch(config) {
    if (!this.isHost) {
      return false;
    }

    config = config || {};

    var message = {
      type: 'startMatch',
      startAt: config.startAt || Date.now() + 1500,
      seed: config.seed || Math.floor(Math.random() * 2147483647),
      subjects: Array.isArray(config.subjects)
        ? config.subjects.slice()
        : [],
      mode: 'versus',
      timestamp: Date.now()
    };

    this.send(message);
    return message;
  }

  /**
   * Send current game state to opponent.
   * Called periodically (throttled) during gameplay.
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
      timestamp: Date.now()
    });
  }

  /**
   * Send encounter result in real-time.
   *
   * @param {boolean} correct
   * @param {number} score
   * @returns {boolean}
   */
  sendEncounterResult(correct, score) {
    return this.send({
      type: 'encounterResult',
      correct: !!correct,
      score: Number(score) || 0,
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
  }
}

export var multiplayer = new Multiplayer();
