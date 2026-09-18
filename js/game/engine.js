/**
 * engine.js — Main game class: init, update loop, state management
 * Imports from all other game/ modules.
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { audio } from '../audio.js';
import { getTheme } from './themes.js';
import { buildTrack } from './track.js';
import { buildPlayer, getPlayerLimbs } from './player.js';
import { setupInput } from './input.js';
import { getCardPool, pickCard, spawnGates, updateGateHighlights, flashGateResult, resolveStats } from './gates.js';
import { spawnObstacle, spawnCoinBatch } from './obstacles.js';

// Re-export for ui.js
export { SHOP_ITEMS, QUESTS } from './shopdata.js';

const LANE_X = [-3, 0, 3];

class Game {
  constructor() {
    this.scene = null; this.camera = null; this.renderer = null; this.clock = null;
    this.playerGroup = null; this.limbs = null;
    this.running = false; this.paused = false; this.mode = 'endless';
    this.currentLane = 1; this.targetLane = 1;
    this.jumping = false; this.jumpVel = 0; this.playerY = 0;
    this.sliding = false; this.slideTimer = 0; this.legPhase = 0;
    this.speed = 15; this.baseSpeed = 15; this.userSpeed = 1;
    this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.multiplier = 1; this.coins = 0;
    this.encountersDone = 0; this.correct = 0; this.wrong = 0; this.lives = 3;
    this.rushing = false; this.rushBonus = 0;
    this.card = null; this.gates = []; this.gateMeshes = [];
    this.gateZ = 0; this.gatesActive = false;
    this.recentIds = []; this.runCards = [];
    this.obstacleMeshes = []; this.coinMeshes = [];
    this.feedbackTimer = 0; this.teachTimer = 0;
    this.powerups = { shield: 0, slow: 0, double: 0, magnet: 0 };
    // Callbacks
    this.onEncounterStart = null; this.onEncounterResolve = null;
    this.onRunEnd = null; this.onHudUpdate = null;
  }

  init() {
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    const theme = getTheme(storage.get('selectedSubjects'));
    this.scene.background = new THREE.Color(theme.bg);

    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 300);
    this.camera.position.set(0, 4.5, 10);
    this.camera.lookAt(0, 1, -20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    document.getElementById('gameContainer').appendChild(this.renderer.domElement);

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 20, 10); dir.castShadow = true;
    this.scene.add(dir);
    this.scene.add(new THREE.HemisphereLight(0x8888ff, 0x002244, 0.5));

    buildTrack(this.scene, theme);
    this.rebuildPlayer();
    var self = this;
    this._inputDispose = setupInput(this.renderer.domElement, {
        moveLeft: function() { if (self.targetLane > 0) self.targetLane--; },
        moveRight: function() { if (self.targetLane < 2) self.targetLane++; },
        jump: function() { self.jump(); },
        slide: function() { self.slide(); },
        rush: function() { self.addRushStack(); },
        pause: function() { self.togglePause(); }
    }, {
        enabled: function() { return self._state === GAME_STATES.PLAYING; }
    });

    const self = this;
    this.renderer.setAnimationLoop(function () {
      const dt = self.clock.getDelta();
      const clamped = dt > 0.1 ? 0.016 : dt;
      if (self.running && !self.paused) self.update(clamped);
      self.renderer.render(self.scene, self.camera);
    });

    window.addEventListener('resize', function () {
      self.camera.aspect = innerWidth / innerHeight;
      self.camera.updateProjectionMatrix();
      self.renderer.setSize(innerWidth, innerHeight);
    });
  }

  rebuildPlayer() {
    if (this.playerGroup) this.scene.remove(this.playerGroup);
    this.playerGroup = buildPlayer();
    this.limbs = getPlayerLimbs(this.playerGroup);
    this.scene.add(this.playerGroup);
  }

  // Alias for ui.js compatibility
  buildPlayer() { this.rebuildPlayer(); }

  jump() {
    if (!this.jumping && !this.sliding) {
      this.jumping = true; this.jumpVel = 12; audio.play('countdown');
    }
  }

  slide() {
    if (!this.sliding && !this.jumping) {
      this.sliding = true; this.slideTimer = 0; audio.play('countdown');
    }
  }

  startRush() {
    if (this.rushing || !this.gatesActive) return;
    this.rushing = true;
    this.rushBonus = Math.max(0, Math.floor(Math.max(0, (-this.gateZ - 10)) / 50 * 80));
    audio.play('rush');
    document.getElementById('rushEl').classList.add('show');
  }

  start(mode) {
    this.mode = mode;
    this.userSpeed = storage.get('userSpeed') || 1;
    if (mode === 'daily' && storage.get('dailyDone')) {
      alert('Daily round already completed today!'); return;
    }
    this.currentLane = 1; this.targetLane = 1;
    this.jumping = false; this.sliding = false;
    this.playerY = 0; this.jumpVel = 0; this.legPhase = 0;
    const mapped = 15 + (this.userSpeed - 1) * 5;
    this.speed = mode === 'study' ? 10 : mapped;
    this.baseSpeed = this.speed;
    this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.multiplier = 1; this.coins = 0;
    this.encountersDone = 0; this.correct = 0; this.wrong = 0;
    this.lives = mode === 'study' ? 99 : 3;
    this.rushing = false; this.rushBonus = 0;
    this.card = null; this.gatesActive = false;
    this.runCards = []; this.recentIds = [];
    this.feedbackTimer = 0; this.teachTimer = 0;
    this.powerups = { shield: 0, slow: 0, double: 0, magnet: 0 };
    if (this.playerGroup) { this.playerGroup.scale.set(1,1,1); this.playerGroup.position.set(0,0,0); }
    this.cleanupObjects();
    const theme = getTheme(storage.get('selectedSubjects'));
    this.scene.background.set(theme.bg);
    this.clock.getDelta();
    this.rebuildPlayer();
  }

  go() {
    this.running = true; this.paused = false;
    this.clock.getDelta();
    this.spawnEncounter();
  }

  cleanupObjects() {
    this.gateMeshes.forEach(m => this.scene.remove(m)); this.gateMeshes = [];
    this.obstacleMeshes.forEach(m => this.scene.remove(m)); this.obstacleMeshes = [];
    this.coinMeshes.forEach(m => this.scene.remove(m)); this.coinMeshes = [];
  }

  spawnEncounter() {
    var poolResult = getCardPool({
        subjects: storage.get('selectedSubjects') || [],
        filters: {
            exams: storage.get('selectedExams') || [],
            questionTypes: storage.get('selectedQuestionTypes') || [],
            sources: storage.get('selectedSources') || [],
            years: storage.get('selectedYears') || [],
            highYieldOnly: storage.get('highYieldOnly') || false,
            includeCustomCards: true
        },
        mode: this.mode
    });
    
    if (poolResult.error || poolResult.cards.length === 0) {
        this.endRun();
        return;
    }
    
    var pickResult = pickCard({
        pool: poolResult.cards,
        recentIds: this.recentIds,
        mode: this.mode,
        encounterIndex: this.encountersDone,
        orderedCardIds: null,
        selectionState: { recentQuestionTypes: [], recentSubjects: [] },
        rng: Math.random
    });
    
    var card = pickResult ? pickResult.card : null;
    if (!card) { this.endRun(); return; }
    this.card = card;
    this.recentIds.push(card.id);
    if (this.recentIds.length > 10) this.recentIds.shift();
    const correctLane = Math.floor(Math.random() * 3);
    const distractors = card.d.slice();
    this.gates = [];
    for (let i = 0; i < 3; i++) {
      if (i === correctLane) this.gates.push({ label: card.ans, correct: true });
      else this.gates.push({ label: distractors.shift() || 'N/A', correct: false });
    }
    this.gateZ = -60;
    this.gateMeshes.forEach(m => this.scene.remove(m));
    const theme = getTheme(storage.get('selectedSubjects'));
    this.gateMeshes = spawnGates(this.scene, this.gates, this.currentLane, theme);
    this.gatesActive = true; this.rushing = false;
    document.getElementById('rushEl').classList.remove('show');
    if (this.onEncounterStart) this.onEncounterStart(card, this.gates);
    audio.speak(card.bw.join('. '));
  }

  resolveEncounter() {
    this.gatesActive = false;
    document.getElementById('rushEl').classList.remove('show');
    const gate = this.gates[this.currentLane];
    const card = this.card;
    const ok = gate.correct;
    resolveStats(card, ok);
    this.encountersDone++;
    this.runCards.push({ card, ok, choice: gate.label });
    if (ok) {
      this.correct++; this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      const mult = this.powerups.double > 0 ? 2 : 1;
      let pts = (10 + this.streak * 2) * this.multiplier * mult;
      if (this.rushing) pts += this.rushBonus;
      pts += Math.floor(this.userSpeed * 6);
      this.score += pts;
      this.coins += 1 + Math.floor(this.streak / 3);
      if (this.streak % 5 === 0) this.multiplier = Math.min(this.multiplier + 1, 8);
      audio.play('correct'); audio.play('coin');
      this.gateMeshes.forEach((g, i) => { if (this.gates[i].correct) g.children[0].material.color.setHex(0x00cc55); });
      storage.incrementQuest('q_10correct');
    } else {
      this.wrong++; this.streak = 0;
      this.multiplier = Math.max(1, this.multiplier - 1);
      this.lives--;
      audio.play('wrong');
      flashGateResult(this.gateMeshes, this.gates, this.currentLane);
      if (this.lives <= 0 && this.mode !== 'study') {
        this.feedbackTimer = 1.5;
        if (this.onEncounterResolve) this.onEncounterResolve(card, ok);
        const self = this;
        setTimeout(function () { self.endRun(); }, 500);
        return;
      }
    }
    this.feedbackTimer = 1.5;
    if (this.mode === 'study' || !ok) this.teachTimer = this.mode === 'study' ? 3.5 : 2;
    if (this.onEncounterResolve) this.onEncounterResolve(card, ok);
    if (Math.random() < 0.1 && ok) {
      const types = ['shield', 'slow', 'double', 'magnet'];
      const t = types[Math.floor(Math.random() * types.length)];
      this.powerups[t] = t === 'shield' ? 999 : (t === 'slow' ? 8 : (t === 'double' ? 15 : 10));
      audio.play('powerup');
    }
    if (this.mode === 'daily' && this.encountersDone >= 15) {
      const self = this; setTimeout(function () { self.endRun(); }, 600); return;
    }
    const delay = this.mode === 'study' ? 1500 : 500;
    const self = this;
    setTimeout(function () {
      if (!self.running) return;
      self.gateMeshes.forEach(m => self.scene.remove(m)); self.gateMeshes = [];
      if (self.mode !== 'study' && Math.random() < 0.4) spawnObstacle(self.scene, self.obstacleMeshes);
      const coinCount = 4 + Math.floor(Math.random() * 3);
      spawnCoinBatch(self.scene, self.coinMeshes, coinCount);
      setTimeout(function () { if (self.running) self.spawnEncounter(); }, 200);
    }, delay);
  }

  update(dt) {
    const currentSpeed = this.powerups.slow > 0 ? this.speed * 0.6 : this.speed;
    const rushMult = this.rushing ? 3.0 : 1.0;
    const move = currentSpeed * rushMult * dt;

    // Lane movement
    const targetX = LANE_X[this.targetLane];
    this.playerGroup.position.x += (targetX - this.playerGroup.position.x) * Math.min(1, 10 * dt);
    this.currentLane = this.targetLane;

    // Jump
    if (this.jumping) {
      this.playerY += this.jumpVel * dt;
      this.jumpVel -= 30 * dt;
      if (this.playerY <= 0) { this.playerY = 0; this.jumping = false; this.jumpVel = 0; }
    }
    this.playerGroup.position.y = this.playerY;

    // Slide
    if (this.sliding) {
      this.slideTimer += dt;
      this.playerGroup.scale.y = 0.35; this.playerGroup.position.y = -0.35;
      if (this.slideTimer >= 0.45) { this.sliding = false; this.playerGroup.scale.y = 1; this.playerGroup.position.y = this.playerY; }
    }

    // Running animation
    if (!this.jumping && !this.sliding && this.limbs) {
      this.legPhase += currentSpeed * rushMult * dt * 0.8;
      const sw = Math.sin(this.legPhase) * 0.35;
      this.limbs.leftLeg.rotation.x = sw;
      this.limbs.rightLeg.rotation.x = -sw;
      this.limbs.leftArm.rotation.x = -sw * 0.8;
      this.limbs.rightArm.rotation.x = sw * 0.8;
      this.playerGroup.position.y = this.playerY + Math.abs(Math.sin(this.legPhase)) * 0.04;
    }

    // Gates
    if (this.gatesActive) {
      this.gateZ += move;
      for (let i = 0; i < this.gateMeshes.length; i++) this.gateMeshes[i].position.z = this.gateZ;
      updateGateHighlights(this.gateMeshes, this.currentLane);
      if (this.gateZ >= 0) this.resolveEncounter();
    }

    // Obstacles
    for (let oi = this.obstacleMeshes.length - 1; oi >= 0; oi--) {
      const ob = this.obstacleMeshes[oi];
      ob.position.z += move;
      if (ob.position.z > 2) {
        const od = ob.userData;
        if (od.lane === this.currentLane) {
          const dodged = (od.type === 'high' && this.sliding) || (od.type === 'low' && this.jumping);
          if (!dodged) {
            if (this.powerups.shield > 0) this.powerups.shield = 0;
            else { this.lives--; audio.play('wrong'); if (this.lives <= 0 && this.mode !== 'study') this.endRun(); }
          }
        }
        this.scene.remove(ob); this.obstacleMeshes.splice(oi, 1);
      }
    }

    // Coins
    for (let ci = this.coinMeshes.length - 1; ci >= 0; ci--) {
      const c = this.coinMeshes[ci];
      c.position.z += move; c.rotation.y += dt * 3;
      if (c.position.z > 1) {
        if ((c.userData.lane === this.currentLane || this.powerups.magnet > 0) && !c.userData.collected) {
          c.userData.collected = true; this.coins++; audio.play('coin');
        }
        this.scene.remove(c); this.coinMeshes.splice(ci, 1);
      }
    }

    // Power-up timers
    ['shield', 'slow', 'double', 'magnet'].forEach(k => { if (this.powerups[k] > 0) this.powerups[k] -= dt; });

    // Feedback timers
    if (this.feedbackTimer > 0) this.feedbackTimer -= dt;
    if (this.teachTimer > 0) this.teachTimer -= dt;

    // Speed progression
    if (this.mode !== 'study') this.speed = Math.min(this.baseSpeed * 1.8, this.baseSpeed + this.encountersDone * 0.4);

    if (this.onHudUpdate) this.onHudUpdate();
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    document.getElementById('pauseOverlay').classList.toggle('active', this.paused);
    if (!this.paused) this.clock.getDelta();
  }

  resume() {
    this.paused = false;
    document.getElementById('pauseOverlay').classList.remove('active');
    this.clock.getDelta();
  }

  endRun() {
    this.running = false; this.paused = false;
    document.getElementById('pauseOverlay').classList.remove('active');
    document.getElementById('rushEl').classList.remove('show');
    storage.set('coins', storage.get('coins') + this.coins);
    if (this.score > storage.get('bestScore')) storage.set('bestScore', this.score);
    if (this.bestStreak > storage.get('bestStreak')) storage.set('bestStreak', this.bestStreak);
    if (this.mode === 'daily') {
      storage.set('dailyDone', true);
      storage.set('lastDaily', new Date().toDateString());
      storage.set('dailyStreak', storage.get('dailyStreak') + 1);
      storage.incrementQuest('q_daily');
    }
    storage.incrementQuest('q_25enc', this.encountersDone);
    this.cleanupObjects();
    if (this.onRunEnd) this.onRunEnd();
  }
}

export const game = new Game();
