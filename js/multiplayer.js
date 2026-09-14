/**
 * multiplayer.js — PeerJS transport and match protocol for Buzzword Dash.
 *
 * Supports:
 * - Five-character room codes
 * - Host and join flows
 * - Ready state and synchronized match start
 * - Live game-state updates
 * - Encounter results and end-of-run results
 * - Ping/latency measurement
 * - Graceful disconnect and error handling
 */

var PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
var PEER_PREFIX = 'buzzworddash-';
var peerLoadPromise = null;

function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (peerLoadPromise) return peerLoadPromise;

  peerLoadPromise = new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = PEERJS_URL;
    script.async = true;
    script.onload = function () {
      if (window.Peer) resolve();
      else reject(new Error('PeerJS loaded but Peer unavailable.'));
    };
    script.onerror = function () {
      reject(new Error('Failed to load PeerJS.'));
    };
    document.head.appendChild(script);
  });

  return peerLoadPromise;
}

function normalizeRoomCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 5);
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

  async init() {
    await loadPeerJS();
  }

  generateRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async hostGame(onReady) {
    await this.init();
    this.disconnect();
    this.isHost = true;
    this.roomCode = this.generateRoomCode();
    this.localReady = false;
    this.opponentReady = false;
    var self = this;

    try {
      this.peer = new window.Peer(PEER_PREFIX + this.roomCode);
    } catch (error) {
      this._emitError('Failed to create room: ' + error.message);
      return;
    }

    this.peer.on('open', function () {
      if (onReady) onReady(self.roomCode);
    });
    this.peer.on('connection', function (conn) {
      if (self.conn && self.conn.open) { conn.close(); return; }
      self.conn = conn;
      self._setupConnection(conn);
    });
    this.peer.on('error', function (error) {
      self._emitError((error.type || 'Peer error') + ': ' + (error.message || 'Unknown'));
    });
    this.peer.on('close', function () {
      self._handleDisconnected('Room closed.');
    });
  }

  async joinGame(roomCode, onReady) {
    await this.init();
    this.disconnect();
    var normalized = normalizeRoomCode(roomCode);
    if (normalized.length !== 5) {
      this._emitError('Room code must be five characters.');
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
      this._emitError('Failed to init: ' + error.message);
      return;
    }

    this.peer.on('open', function () {
      try {
        var conn = self.peer.connect(PEER_PREFIX + self.roomCode, { reliable: true, serialization: 'json' });
        self.conn = conn;
        self._setupConnection(conn);
        if (onReady) onReady();
      } catch (error) {
        self._emitError('Connection failed: ' + error.message);
      }
    });
    this.peer.on('error', function (error) {
      var msg = error.message || error.type || 'Unknown';
      if (error.type === 'peer-unavailable') msg = 'Room not found.';
      self._emitError(msg);
    });
    this.peer.on('close', function () {
      self._handleDisconnected('Connection closed.');
    });
  }

  _setupConnection(conn) {
    var self = this;
    conn.on('open', function () {
      self.connected = true;
      self._startPing();
      self.send({ type: 'hello', protocolVersion: 1, timestamp: Date.now() });
      if (self.onConnected) self.onConnected({ roomCode: self.roomCode, isHost: self.isHost });
    });
    conn.on('data', function (data) { self._handleMessage(data); });
    conn.on('close', function () { self._handleDisconnected('Opponent disconnected.'); });
    conn.on('error', function (error) { self._emitError('Connection error: ' + (error.message || 'Unknown')); });
  }

  _handleMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (this.onMessage) this.onMessage(data);

    switch (data.type) {
      case 'hello':
        this.send({ type: 'helloAck', protocolVersion: 1, timestamp: Date.now() });
        break;
      case 'ready':
        this.opponentReady = !!data.ready;
        if (this.onReadyState) this.onReadyState({ localReady: this.localReady, opponentReady: this.opponentReady });
        break;
      case 'startMatch':
        if (this.onMatchStart) this.onMatchStart({ startAt: data.startAt, seed: data.seed, subjects: data.subjects || [], mode: data.mode || 'versus' });
        break;
      case 'gameState':
        if (this.onOpponentUpdate) this.onOpponentUpdate(data);
        break;
      case 'encounterResult':
        if (this.onEncounterResult) this.onEncounterResult(data);
        break;
      case 'endRun':
        if (this.onEndRun) this.onEndRun(data);
        break;
      case 'ping':
        this.send({ type: 'pong', pingId: data.pingId, originalTimestamp: data.originalTimestamp, timestamp: Date.now() });
        break;
      case 'pong':
        if (data.originalTimestamp) this.latency = Math.max(0, Date.now() - data.originalTimestamp);
        break;
    }
  }

  send(data) {
    if (!this.conn || !this.conn.open) return false;
    try { this.conn.send(data); return true; }
    catch (e) { return false; }
  }

  sendReady(ready) {
    this.localReady = ready !== false;
    this.send({ type: 'ready', ready: this.localReady, timestamp: Date.now() });
    if (this.onReadyState) this.onReadyState({ localReady: this.localReady, opponentReady: this.opponentReady });
  }

  sendStartMatch(config) {
    if (!this.isHost) return false;
    config = config || {};
    var message = {
      type: 'startMatch',
      startAt: config.startAt || Date.now() + 1500,
      seed: config.seed || Math.floor(Math.random() * 2147483647),
      subjects: Array.isArray(config.subjects) ? config.subjects.slice() : [],
      mode: 'versus',
      timestamp: Date.now()
    };
    this.send(message);
    return message;
  }

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

  sendEncounterResult(correct, score) {
    return this.send({ type: 'encounterResult', correct: !!correct, score: Number(score) || 0, timestamp: Date.now() });
  }

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

  isConnected() {
    return !!(this.connected && this.conn && this.conn.open);
  }

  _startPing() {
    this._stopPing();
    var self = this;
    this.pingInterval = setInterval(function () {
      if (!self.isConnected()) return;
      var now = Date.now();
      self.send({ type: 'ping', pingId: now, originalTimestamp: now });
    }, 3000);
  }

  _stopPing() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
  }

  _handleDisconnected(reason) {
    var was = this.connected;
    this.connected = false;
    this.localReady = false;
    this.opponentReady = false;
    this._stopPing();
    if (was && this.onDisconnected) this.onDisconnected(reason || 'Disconnected.');
  }

  _emitError(message) {
    console.warn('Multiplayer:', message);
    if (this.onError) this.onError(message);
  }

  disconnect() {
    this._stopPing();
    this.connected = false;
    this.localReady = false;
    this.opponentReady = false;
    if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this.roomCode = '';
    this.isHost = false;
    this.latency = null;
  }
}

export var multiplayer = new Multiplayer();
