/**
 * engine.js — Main game class
 *
 * Includes all Phase 1-3 features:
 * - Continuous coin spawning (coinSpawnTimer)
 * - Physical power-up collectibles on track
 * - No freeze after correct answers in endless mode
 * - Speed dial 1-10, 1x = 3.75 u/s
 * - TTS speed adapts to game speed
 * - Streak milestone sounds
 * - Camera shake on wrong answer
 * - Answer-leak validation
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { audio } from '../audio.js';
import { getTheme } from './themes.js';
import { buildTrack } from './track.js';
import { buildPlayer, getPlayerLimbs } from './player.js';
import { setupInput } from './input.js';
import { pickCard, spawnGates, updateGateHighlights, flashGateResult, resolveStats } from './gates.js';
import { spawnObstacle, spawnCoinBatch, spawnPowerup } from './obstacles.js';

export { SHOP_ITEMS, QUESTS } from './shopdata.js';

var LANE_X = [-3, 0, 3];

class Game {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = null;
    this.playerGroup = null;
    this.limbs = null;

    this.running = false;
    this.paused = false;
    this.mode = 'endless';
    this.currentLane = 1;
    this.targetLane = 1;

    this.jumping = false;
    this.jumpVel = 0;
    this.playerY = 0;
    this.sliding = false;
    this.slideTimer = 0;
    this.legPhase = 0;

    this.speed = 3.75;
    this.baseSpeed = 3.75;
    this.userSpeed = 1;

    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.multiplier = 1;
    this.coins = 0;
    this.encountersDone = 0;
    this.correct = 0;
    this.wrong = 0;
    this.lives = 3;

    this.rushing = false;
    this.rushBonus = 0;

    this.card = null;
    this.gates = [];
    this.gateMeshes = [];
    this.gateZ = 0;
    this.gatesActive = false;
    this.recentIds = [];
    this.runCards = [];

    this.obstacleMeshes = [];
    this.coinMeshes = [];

    this.feedbackTimer = 0;
    this.teachTimer = 0;

    this.powerups = { shield: 0, slow: 0, double: 0, magnet: 0 };

    this.coinSpawnTimer = 0;
    this.powerupSpawnTimer = 0;
    this.waitingForNext = false;
    this.nextEncounterTimer = 0;

    // Camera shake
    this.shakeTimer = 0;
    this.cameraBasePos = new THREE.Vector3(0, 4.5, 10);

    // Callbacks
    this.onEncounterStart = null;
    this.onEncounterResolve = null;
    this.onRunEnd = null;
    this.onHudUpdate = null;
    this.onStreakMilestone = null;
    this.onScorePopup = null;
    this.onPowerupCollected = null;
  }

  init() {
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    var theme = getTheme(storage.get('selectedSubjects'));
    this.scene.background = new THREE.Color(theme.bg);

    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 300);
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(0, 1, -20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    document.getElementById('gameContainer').appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 20, 10);
    dir.castShadow = true;
    this.scene.add(dir);
    this.scene.add(new THREE.HemisphereLight(0x8888ff, 0x002244, 0.5));

    buildTrack(this.scene, theme);
    this.rebuildPlayer();
    setupInput(this.renderer, this);

    var self = this;
    this.renderer.setAnimationLoop(function () {
      var dt = self.clock.getDelta();
      var clamped = dt > 0.1 ? 0.016 : dt;
      if (self.running && !self.paused) {
        self.update(clamped);
      }
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

  buildPlayer() { this.rebuildPlayer(); }

  jump() {
    if (!this.jumping && !this.sliding) {
      this.jumping = true;
      this.jumpVel = 12;
      audio.play('countdown');
    }
  }

  slide() {
    if (!this.sliding && !this.jumping) {
      this.sliding = true;
      this.slideTimer = 0;
      audio.play('countdown');
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
      alert('Daily round already completed today!');
      return;
    }

    this.currentLane = 1;
    this.targetLane = 1;
    this.jumping = false;
    this.sliding = false;
    this.playerY = 0;
    this.jumpVel = 0;
    this.legPhase = 0;

    // Speed: 1-10. Level 1 = 3.75 u/s, Level 10 = 37.5 u/s
    var mapped = 3.75 + (this.userSpeed - 1) * 3.75;
    this.speed = mode === 'study' ? 3 : mapped;
    this.baseSpeed = this.speed;

    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.multiplier = 1;
    this.coins = 0;
    this.encountersDone = 0;
    this.correct = 0;
    this.wrong = 0;
    this.lives = mode === 'study' ? 99 : 3;
    this.rushing = false;
    this.rushBonus = 0;
    this.card = null;
    this.gatesActive = false;
    this.waitingForNext = false;
    this.nextEncounterTimer = 0;
    this.coinSpawnTimer = 0;
    this.powerupSpawnTimer = 8;
    this.shakeTimer = 0;
    this.runCards = [];
    this.recentIds = [];
    this.feedbackTimer = 0;
    this.teachTimer = 0;
    this.powerups = { shield: 0, slow: 0, double: 0, magnet: 0 };

    if (this.playerGroup) {
      this.playerGroup.scale.set(1, 1, 1);
      this.playerGroup.position.set(0, 0, 0);
    }

    this.cleanupObjects();
    var theme = getTheme(storage.get('selectedSubjects'));
    this.scene.background.set(theme.bg);
    this.camera.position.copy(this.cameraBasePos);
    this.clock.getDelta();
    this.rebuildPlayer();
  }

  go() {
    this.running = true;
    this.paused = false;
    this.clock.getDelta();
    this.spawnEncounter();
  }

  cleanupObjects() {
    var i;
    for (i = 0; i < this.gateMeshes.length; i++) this.scene.remove(this.gateMeshes[i]);
    this.gateMeshes = [];
    for (i = 0; i < this.obstacleMeshes.length; i++) this.scene.remove(this.obstacleMeshes[i]);
    this.obstacleMeshes = [];
    for (i = 0; i < this.coinMeshes.length; i++) this.scene.remove(this.coinMeshes[i]);
    this.coinMeshes = [];
  }

  collectPowerup(type) {
    var duration;
    switch (type) {
      case 'shield': duration = 999; break;
      case 'slow': duration = 8; break;
      case 'double': duration = 15; break;
      case 'magnet': duration = 10; break;
      default: duration = 10;
    }
    this.powerups[type] = duration;
    audio.play('powerup');
    if (this.onPowerupCollected) this.onPowerupCollected(type);
  }

  triggerShake() {
    this.shakeTimer = 0.15;
  }

  spawnEncounter() {
    var card = pickCard(this.recentIds, this.mode);
    if (!card) { this.endRun(); return; }

    this.card = card;
    this.recentIds.push(card.id);
    if (this.recentIds.length > 10) this.recentIds.shift();

    var correctLane = Math.floor(Math.random() * 3);
    var distractors = card.d.slice();
    this.gates = [];
    for (var i = 0; i < 3; i++) {
      if (i === correctLane) {
        this.gates.push({ label: card.ans, correct: true });
      } else {
        this.gates.push({ label: distractors.shift() || 'N/A', correct: false });
      }
    }

    this.gateZ = -60;
    for (var g = 0; g < this.gateMeshes.length; g++) this.scene.remove(this.gateMeshes[g]);
    var theme = getTheme(storage.get('selectedSubjects'));
    this.gateMeshes = spawnGates(this.scene, this.gates, this.currentLane, theme);

    this.gatesActive = true;
    this.rushing = false;
    this.waitingForNext = false;
    document.getElementById('rushEl').classList.remove('show');

    if (this.onEncounterStart) this.onEncounterStart(card, this.gates);

    audio.speak(card.bw.join('. '), this.speed);
  }

  resolveEncounter() {
    this.gatesActive = false;
    document.getElementById('rushEl').classList.remove('show');

    var gate = this.gates[this.currentLane];
    var card = this.card;
    var ok = gate.correct;

    resolveStats(card, ok);
    this.encountersDone++;
    this.runCards.push({ card: card, ok: ok, choice: gate.label });

    var pointsEarned = 0;

    if (ok) {
      this.correct++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;

      var mult = this.powerups.double > 0 ? 2 : 1;
      pointsEarned = (10 + this.streak * 2) * this.multiplier * mult;
      if (this.rushing) pointsEarned += this.rushBonus;
      pointsEarned += Math.floor(this.userSpeed * 3);
      this.score += pointsEarned;
      this.coins += 1 + Math.floor(this.streak / 3);

      // Streak milestones
      if (this.streak % 5 === 0) {
        this.multiplier = Math.min(this.multiplier + 1, 8);
        if (this.streak >= 10) {
          audio.play('streak10');
        } else {
          audio.play('streak5');
        }
        if (this.onStreakMilestone) this.onStreakMilestone(this.streak, this.multiplier);
      } else {
        audio.play('correct');
      }
      audio.play('coin');

      for (var i = 0; i < this.gateMeshes.length; i++) {
        if (this.gates[i].correct) {
          this.gateMeshes[i].children[0].material.color.setHex(0x00cc55);
        }
      }

      storage.incrementQuest('q_10correct');
      if (this.onScorePopup) this.onScorePopup(pointsEarned);

    } else {
      this.wrong++;
      this.streak = 0;
      this.multiplier = Math.max(1, this.multiplier - 1);
      this.lives--;

      audio.play('wrong');
      flashGateResult(this.gateMeshes, this.gates, this.currentLane);
      this.triggerShake();

      if (this.lives <= 0 && this.mode !== 'study') {
        this.feedbackTimer = 1.5;
        if (this.onEncounterResolve) this.onEncounterResolve(card, ok);
        var self = this;
        setTimeout(function () { self.endRun(); }, 500);
        return;
      }
    }

    this.feedbackTimer = 1.2;

    if (this.mode === 'study') {
      this.teachTimer = 3.5;
      this.waitingForNext = true;
      this.nextEncounterTimer = ok ? 1.5 : 3.5;
    } else if (!ok) {
      this.teachTimer = 2.0;
      this.waitingForNext = true;
      this.nextEncounterTimer = 1.0;
    } else {
      this.waitingForNext = true;
      this.nextEncounterTimer = 0.05;
    }

    if (this.onEncounterResolve) this.onEncounterResolve(card, ok);

    if (this.mode === 'daily' && this.encountersDone >= 15) {
      var self2 = this;
      setTimeout(function () { self2.endRun(); }, 600);
    }
  }

  transitionToNextEncounter() {
    for (var m = 0; m < this.gateMeshes.length; m++) this.scene.remove(this.gateMeshes[m]);
    this.gateMeshes = [];

    if (this.mode !== 'study' && Math.random() < 0.4) {
      spawnObstacle(this.scene, this.obstacleMeshes);
    }

    this.spawnEncounter();
  }

  update(dt) {
    var currentSpeed = this.powerups.slow > 0 ? this.speed * 0.6 : this.speed;
    var rushMult = this.rushing ? 3.0 : 1.0;
    var move = currentSpeed * rushMult * dt;

    // Lane
    var targetX = LANE_X[this.targetLane];
    this.playerGroup.position.x += (targetX - this.playerGroup.position.x) * Math.min(1, 10 * dt);
    this.currentLane = this.targetLane;

    // Jump
    if (this.jumping) {
      this.playerY += this.jumpVel * dt;
      this.jumpVel -= 30 * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.jumping = false;
        this.jumpVel = 0;
      }
    }
    this.playerGroup.position.y = this.playerY;

    // Slide
    if (this.sliding) {
      this.slideTimer += dt;
      this.playerGroup.scale.y = 0.35;
      this.playerGroup.position.y = -0.35;
      if (this.slideTimer >= 0.45) {
        this.sliding = false;
        this.playerGroup.scale.y = 1;
        this.playerGroup.position.y = this.playerY;
      }
    }

    // Running animation
    if (!this.jumping && !this.sliding && this.limbs) {
      this.legPhase += currentSpeed * rushMult * dt * 0.8;
      var sw = Math.sin(this.legPhase) * 0.35;
      this.limbs.leftLeg.rotation.x = sw;
      this.limbs.rightLeg.rotation.x = -sw;
      this.limbs.leftArm.rotation.x = -sw * 0.8;
      this.limbs.rightArm.rotation.x = sw * 0.8;
      this.playerGroup.position.y = this.playerY + Math.abs(Math.sin(this.legPhase)) * 0.04;
    }

    // Camera shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      var intensity = this.shakeTimer * 3;
      this.camera.position.x = this.cameraBasePos.x + (Math.random() - 0.5) * intensity;
      this.camera.position.y = this.cameraBasePos.y + (Math.random() - 0.5) * intensity * 0.5;
    } else {
      this.camera.position.x = this.cameraBasePos.x;
      this.camera.position.y = this.cameraBasePos.y;
    }

    // Gates
    if (this.gatesActive) {
      this.gateZ += move;
      for (var i = 0; i < this.gateMeshes.length; i++) {
        this.gateMeshes[i].position.z = this.gateZ;
      }
      updateGateHighlights(this.gateMeshes, this.currentLane);
      if (this.gateZ >= 0) this.resolveEncounter();
    }

    // Next encounter timer
    if (this.waitingForNext) {
      this.nextEncounterTimer -= dt;
      if (this.nextEncounterTimer <= 0) {
        this.waitingForNext = false;
        this.transitionToNextEncounter();
      }
    }

    // Continuous coin spawning
    this.coinSpawnTimer -= dt;
    if (this.coinSpawnTimer <= 0) {
      spawnCoinBatch(this.scene, this.coinMeshes);
      this.coinSpawnTimer = 0.8 + Math.random() * 1.2;
    }

    // Power-up spawning
    this.powerupSpawnTimer -= dt;
    if (this.powerupSpawnTimer <= 0) {
      spawnPowerup(this.scene, this.coinMeshes);
      this.powerupSpawnTimer = 15 + Math.random() * 10;
    }

    // Obstacles
    for (var oi = this.obstacleMeshes.length - 1; oi >= 0; oi--) {
      var ob = this.obstacleMeshes[oi];
      ob.position.z += move;
      if (ob.position.z > 2) {
        var od = ob.userData;
        if (od.lane === this.currentLane) {
          var dodged = (od.type === 'high' && this.sliding) || (od.type === 'low' && this.jumping);
          if (!dodged) {
            if (this.powerups.shield > 0) {
              this.powerups.shield = 0;
            } else {
              this.lives--;
              audio.play('wrong');
              this.triggerShake();
              if (this.lives <= 0 && this.mode !== 'study') this.endRun();
            }
          }
        }
        this.scene.remove(ob);
        this.obstacleMeshes.splice(oi, 1);
      }
    }

    // Coins and power-ups
    for (var ci = this.coinMeshes.length - 1; ci >= 0; ci--) {
      var c = this.coinMeshes[ci];
      c.position.z += move;

      // Animate
      if (c.userData.type === 'coin') {
        c.rotation.y += dt * 3;
      } else if (c.userData.type === 'powerup') {
        c.rotation.y += dt * 2;
        c.position.y = 1.5 + Math.sin(Date.now() * 0.003 + ci) * 0.3;
      }

      // Remove if past player
      if (c.position.z > 3) {
        this.scene.remove(c);
        this.coinMeshes.splice(ci, 1);
        continue;
      }

      // Collection check (generous zone)
      if (c.position.z > -3 && c.position.z < 2 && !c.userData.collected) {
        var inLane = c.userData.lane === this.currentLane;
        var magnetActive = this.powerups.magnet > 0;
        var closeEnough = Math.abs(LANE_X[this.currentLane] - c.position.x) < 1.8;

        if ((inLane || closeEnough || magnetActive)) {
          c.userData.collected = true;

          if (c.userData.type === 'powerup') {
            this.collectPowerup(c.userData.powerupType);
          } else {
            this.coins++;
            audio.play('coin');
          }

          this.scene.remove(c);
          this.coinMeshes.splice(ci, 1);
        }
      }
    }

    // Power-up timers
    var puKeys = ['shield', 'slow', 'double', 'magnet'];
    for (var pk = 0; pk < puKeys.length; pk++) {
      if (this.powerups[puKeys[pk]] > 0) this.powerups[puKeys[pk]] -= dt;
    }

    // Feedback timers
    if (this.feedbackTimer > 0) this.feedbackTimer -= dt;
    if (this.teachTimer > 0) this.teachTimer -= dt;

    // Speed progression
    if (this.mode !== 'study') {
      this.speed = Math.min(this.baseSpeed * 2.0, this.baseSpeed + this.encountersDone * 0.3);
    }

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
    this.running = false;
    this.paused = false;
    document.getElementById('pauseOverlay').classList.remove('active');
    document.getElementById('rushEl').classList.remove('show');
    this.camera.position.copy(this.cameraBasePos);

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

export var game = new Game();
