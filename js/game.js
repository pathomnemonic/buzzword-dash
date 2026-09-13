/**
 * game.js — Three.js game engine
 *
 * Handles: scene setup, player, track, gates with READABLE text,
 * obstacles, coins, jumping, sliding, rushing, update loop.
 *
 * Gate text fix: Uses 1024x512 canvas textures with NearestFilter
 * to prevent blurry text when mapped to 3D planes.
 */

import * as THREE from 'three';
import { CARDS, SUBJECTS } from './cards.js';
import { storage } from './storage.js';
import { audio } from './audio.js';

// ===== THEME CONFIG =====
const THEMES = {
  "Neurology": { bg: 0x0a0828, ground: 0x0c0a30, wall: 0x2020aa, glow: 0x8844ff, gate: 0x1a1060 },
  "Cardiology": { bg: 0x1a0808, ground: 0x200a0a, wall: 0xaa2020, glow: 0xff4444, gate: 0x601020 },
  "Nephrology": { bg: 0x081820, ground: 0x0a1828, wall: 0x2080aa, glow: 0x44ccff, gate: 0x103050 },
  "Psychiatry": { bg: 0x140828, ground: 0x180a30, wall: 0x8830aa, glow: 0xcc66ff, gate: 0x401060 },
  "Gastroenterology": { bg: 0x181008, ground: 0x201410, wall: 0xaa6620, glow: 0xffaa44, gate: 0x604020 },
  "default": { bg: 0x050816, ground: 0x0a1030, wall: 0x1a3060, glow: 0x18ffff, gate: 0x102040 }
};

function getTheme() {
  const subjects = storage.get('selectedSubjects');
  for (const s of subjects) {
    if (THEMES[s]) return THEMES[s];
  }
  return THEMES["default"];
}

// ===== SHOP ITEMS =====
export const SHOP_ITEMS = [
  { id: "skin_scrubs", name: "Blue Scrubs", price: 0, type: "skin", color: 0x2288dd },
  { id: "skin_gold", name: "Gold Scrubs", price: 500, type: "skin", color: 0xffd740 },
  { id: "skin_white", name: "White Coat", price: 300, type: "skin", color: 0xe8e8f0 },
  { id: "skin_green", name: "Surgical Green", price: 400, type: "skin", color: 0x22aa66 },
  { id: "hat_none", name: "No Hat", price: 0, type: "hat", color: null },
  { id: "hat_cap", name: "Scrub Cap", price: 150, type: "hat", color: 0x40c4ff },
  { id: "hat_mirror", name: "Head Mirror", price: 250, type: "hat", color: 0xffd740 },
  { id: "gear_none", name: "No Gear", price: 0, type: "gear", color: null },
  { id: "gear_steth", name: "Stethoscope", price: 200, type: "gear", color: 0x888888 },
  { id: "gear_clip", name: "Clipboard", price: 175, type: "gear", color: 0x8d6e3f },
];

// ===== QUESTS =====
export const QUESTS = [
  { id: "q_streak8", title: "Hot Streak", desc: "8 correct in one run", target: 8, reward: 75 },
  { id: "q_25enc", title: "Marathon", desc: "25 total encounters", target: 25, reward: 80 },
  { id: "q_daily", title: "Daily Rounds", desc: "Complete a daily round", target: 1, reward: 100 },
  { id: "q_10correct", title: "Sharp Mind", desc: "10 correct answers", target: 10, reward: 50 },
];

// ===== GATE TEXTURE =====
// High-res canvas + NearestFilter = crisp readable text on 3D planes
function makeGateTexture(text, isHighlighted) {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');

  // Solid opaque background
  cx.fillStyle = isHighlighted ? '#1a3088' : '#0c1840';
  cx.fillRect(0, 0, W, H);

  // Border
  cx.strokeStyle = isHighlighted ? '#66bbff' : '#334488';
  cx.lineWidth = 8;
  cx.strokeRect(4, 4, W - 8, H - 8);

  // Inner glow line for highlighted
  if (isHighlighted) {
    cx.strokeStyle = 'rgba(100, 180, 255, 0.3)';
    cx.lineWidth = 4;
    cx.strokeRect(12, 12, W - 24, H - 24);
  }

  // Text
  cx.fillStyle = '#ffffff';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';

  // Auto-size font
  let fontSize = 52;
  cx.font = 'bold ' + fontSize + 'px Arial, sans-serif';
  while (cx.measureText(text).width > W - 80 && fontSize > 24) {
    fontSize -= 2;
    cx.font = 'bold ' + fontSize + 'px Arial, sans-serif';
  }

  // Word wrap
  const words = text.split(' ');
  let lines = [], line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (cx.measureText(test).width > W - 100 && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineHeight = fontSize + 10;
  const startY = H / 2 - ((lines.length - 1) * lineHeight) / 2;
  for (let j = 0; j < lines.length; j++) {
    cx.fillText(lines[j], W / 2, startY + j * lineHeight);
  }

  const tex = new THREE.CanvasTexture(cv);
  // KEY FIX: NearestFilter prevents blurry text
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// ===== LANE CONSTANTS =====
const LANE_X = [-3, 0, 3];

// ===== CARD SELECTOR =====
function pickCard(recentIds, mode) {
  const subjects = storage.get('selectedSubjects');
  let pool = CARDS.filter(c => subjects.includes(c.subj));

  if (mode === 'weakness') {
    const weak = pool.filter(c => {
      const s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weak.length >= 3) pool = weak;
  }

  if (!pool.length) return null;

  // Weighted selection avoiding recent cards
  let weighted = pool.map(c => {
    const s = storage.getCardStat(c.id);
    let w = 10;
    if (s.seen > 0) {
      const accuracy = s.correct / s.seen;
      if (accuracy < 0.5) w *= 3;
      else if (accuracy > 0.9 && s.seen > 3) w *= 0.3;
    }
    if (recentIds.includes(c.id)) w *= 0.05;
    return { card: c, weight: Math.max(w, 0.01) };
  });

  const total = weighted.reduce((sum, x) => sum + x.weight, 0);
  let r = Math.random() * total;
  for (const x of weighted) {
    r -= x.weight;
    if (r <= 0) return x.card;
  }
  return weighted[weighted.length - 1].card;
}

// ===== GAME CLASS =====
class Game {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = null;

    // Player
    this.playerGroup = null;
    this.leftLeg = null;
    this.rightLeg = null;
    this.leftArm = null;
    this.rightArm = null;

    // State
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

    // Speed: units per second
    this.speed = 15;
    this.baseSpeed = 15;
    this.userSpeed = 1;

    // Scoring
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.multiplier = 1;
    this.coins = 0;
    this.encountersDone = 0;
    this.correct = 0;
    this.wrong = 0;
    this.lives = 3;

    // Rush
    this.rushing = false;
    this.rushBonus = 0;

    // Cards
    this.card = null;
    this.gates = [];
    this.gateMeshes = [];
    this.gateTexData = [];
    this.gateZ = 0;
    this.gatesActive = false;
    this.recentIds = [];
    this.runCards = [];

    // Objects
    this.obstacleMeshes = [];
    this.coinMeshes = [];

    // Timers
    this.feedbackTimer = 0;
    this.teachTimer = 0;

    // Power-ups
    this.powerups = { shield: 0, slow: 0, double: 0, magnet: 0 };

    // Callbacks — set by main.js to communicate with UI
    this.onEncounterStart = null;
    this.onEncounterResolve = null;
    this.onRunEnd = null;
    this.onHudUpdate = null;
  }

  init() {
    this.clock = new THREE.Clock();

    // Scene
    this.scene = new THREE.Scene();
    const theme = getTheme();
    this.scene.background = new THREE.Color(theme.bg);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      70, window.innerWidth / window.innerHeight, 0.1, 300
    );
    this.camera.position.set(0, 4.5, 10);
    this.camera.lookAt(0, 1, -20);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    document.getElementById('gameContainer').appendChild(this.renderer.domElement);

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 20, 10);
    dir.castShadow = true;
    this.scene.add(dir);
    this.scene.add(new THREE.HemisphereLight(0x8888ff, 0x002244, 0.5));

    this.buildTrack();
    this.buildPlayer();
    this.setupInput();

    // Render loop — setAnimationLoop guarantees render every frame [3]
    const self = this;
    this.renderer.setAnimationLoop(function () {
      const dt = self.clock.getDelta();
      // Clamp to prevent huge jumps after tab switch
      const clampedDt = dt > 0.1 ? 0.016 : dt;
      if (self.running && !self.paused) {
        self.update(clampedDt);
      }
      self.renderer.render(self.scene, self.camera);
    });

    // Resize
    window.addEventListener('resize', function () {
      self.camera.aspect = window.innerWidth / window.innerHeight;
      self.camera.updateProjectionMatrix();
      self.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  buildTrack() {
    const theme = getTheme();

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 400),
      new THREE.MeshStandardMaterial({ color: theme.ground })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -190;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Lane dividers
    [-1.5, 1.5].forEach(x => {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 400),
        new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.2 })
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.02, -190);
      this.scene.add(line);
    });

    // Side walls + pillars
    [-1, 1].forEach(side => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 3, 400),
        new THREE.MeshBasicMaterial({ color: theme.wall })
      );
      wall.position.set(side * 6, 1.5, -190);
      this.scene.add(wall);

      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.1, 400),
        new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.35 })
      );
      glow.position.set(side * 6, 3.05, -190);
      this.scene.add(glow);

      for (let z = -160; z < 20; z += 16) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 3.5, 0.5),
          new THREE.MeshStandardMaterial({ color: theme.wall })
        );
        pillar.position.set(side * 5.3, 1.75, z);
        this.scene.add(pillar);

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 8),
          new THREE.MeshBasicMaterial({ color: theme.glow })
        );
        sphere.position.set(side * 5.3, 3.7, z);
        this.scene.add(sphere);
      }
    });
  }

  buildPlayer() {
    if (this.playerGroup) this.scene.remove(this.playerGroup);
    const pg = new THREE.Group();

    const equipped = storage.get('equipped');
    const skinItem = SHOP_ITEMS.find(s => s.id === equipped.skin) || SHOP_ITEMS[0];
    const hatItem = SHOP_ITEMS.find(s => s.id === equipped.hat);
    const gearItem = SHOP_ITEMS.find(s => s.id === equipped.gear);

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 1, 0.45),
      new THREE.MeshStandardMaterial({ color: skinItem.color })
    );
    body.position.y = 0.8;
    body.castShadow = true;
    pg.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffccaa })
    );
    head.position.y = 1.6;
    pg.add(head);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222244 });
    [-0.09, 0.09].forEach(x => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
      eye.position.set(x, 1.63, -0.24);
      pg.add(eye);
    });

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a5599 });
    this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.25), legMat);
    this.leftLeg.position.set(-0.15, 0.15, 0);
    pg.add(this.leftLeg);
    this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.25), legMat);
    this.rightLeg.position.set(0.15, 0.15, 0);
    pg.add(this.rightLeg);

    // Arms
    const armMat = new THREE.MeshStandardMaterial({ color: skinItem.color });
    this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), armMat);
    this.leftArm.position.set(-0.42, 0.85, 0);
    pg.add(this.leftArm);
    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), armMat);
    this.rightArm.position.set(0.42, 0.85, 0);
    pg.add(this.rightArm);

    // Shoes
    const shoeMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.35), shoeMat);
    shoeL.position.y = -0.32;
    this.leftLeg.add(shoeL);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.35), shoeMat);
    shoeR.position.y = -0.32;
    this.rightLeg.add(shoeR);

    // Hat
    if (hatItem && hatItem.color) {
      const hat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.3, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: hatItem.color })
      );
      hat.position.y = 1.88;
      pg.add(hat);
    }

    // Gear
    if (gearItem && gearItem.color && gearItem.id === 'gear_steth') {
      const steth = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.025, 6, 12),
        new THREE.MeshStandardMaterial({ color: gearItem.color, metalness: 0.5 })
      );
      steth.position.set(0, 1.2, -0.1);
      steth.rotation.x = Math.PI / 2.5;
      pg.add(steth);
    }

    pg.position.set(0, 0, 0);
    this.playerGroup = pg;
    this.scene.add(pg);
  }

  setupInput() {
    let sx = 0, sy = 0, swiped = false, lastTap = 0;
    const el = this.renderer.domElement;
    const self = this;

    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (!self.running || self.paused) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      swiped = false;
      const now = Date.now();
      if (now - lastTap < 300 && self.gatesActive) self.startRush();
      lastTap = now;
    }, { passive: false });

    el.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!self.running || self.paused || swiped) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) {
        if (dy < -30) { self.jump(); swiped = true; }
        else if (dy > 30) { self.slide(); swiped = true; }
      } else if (Math.abs(dx) > 30) {
        if (dx > 0 && self.targetLane < 2) self.targetLane++;
        else if (dx < 0 && self.targetLane > 0) self.targetLane--;
        swiped = true;
      }
    }, { passive: false });

    document.addEventListener('keydown', function (e) {
      if (!self.running || self.paused) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') { if (self.targetLane > 0) self.targetLane--; }
      if (e.key === 'ArrowRight' || e.key === 'd') { if (self.targetLane < 2) self.targetLane++; }
      if (e.key === 'ArrowUp' || e.key === 'w') self.jump();
      if (e.key === 'ArrowDown' || e.key === 's') self.slide();
      if (e.key === 'Shift' || e.key === ' ') { if (self.gatesActive) self.startRush(); }
      if (e.key === 'Escape') self.togglePause();
    });
  }

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

  // --- Start a run ---
  start(mode) {
    this.mode = mode;
    this.userSpeed = storage.get('userSpeed') || 1;
    if (mode === 'daily' && storage.get('dailyDone')) {
      alert('Daily round already completed! Come back tomorrow.');
      return;
    }

    // Reset state
    this.currentLane = 1;
    this.targetLane = 1;
    this.jumping = false;
    this.sliding = false;
    this.playerY = 0;
    this.jumpVel = 0;
    this.legPhase = 0;

    // Speed: 1x = 15 u/s, 5x = 35 u/s, study = 10
    const mapped = 15 + (this.userSpeed - 1) * 5;
    this.speed = mode === 'study' ? 10 : mapped;
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

    // Update theme
    const theme = getTheme();
    this.scene.background.set(theme.bg);

    // Reset clock
    this.clock.getDelta();

    this.buildPlayer();
  }

  go() {
    this.running = true;
    this.paused = false;
    this.clock.getDelta(); // flush accumulated delta
    this.spawnEncounter();
  }

  cleanupObjects() {
    this.gateMeshes.forEach(m => this.scene.remove(m));
    this.gateMeshes = [];
    this.gateTexData = [];
    this.obstacleMeshes.forEach(m => this.scene.remove(m));
    this.obstacleMeshes = [];
    this.coinMeshes.forEach(m => this.scene.remove(m));
    this.coinMeshes = [];
  }

  // --- Spawn an encounter ---
  spawnEncounter() {
    const card = pickCard(this.recentIds, this.mode);
    if (!card) { this.endRun(); return; }

    this.card = card;
    this.recentIds.push(card.id);
    if (this.recentIds.length > 10) this.recentIds.shift();

    const correctLane = Math.floor(Math.random() * 3);
    const distractors = card.d.slice();
    this.gates = [];
    for (let i = 0; i < 3; i++) {
      if (i === correctLane) {
        this.gates.push({ label: card.ans, correct: true });
      } else {
        this.gates.push({ label: distractors.shift() || 'N/A', correct: false });
      }
    }

    this.gateZ = -60;

    // Clean old gates
    this.gateMeshes.forEach(m => this.scene.remove(m));
    this.gateMeshes = [];
    this.gateTexData = [];

    for (let j = 0; j < 3; j++) {
      const group = new THREE.Group();

      // Frame
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 3, 0.2),
        new THREE.MeshBasicMaterial({ color: 0x1a2a60, transparent: true, opacity: 0.85 })
      );
      group.add(frame);

      // Label — high-res texture with NearestFilter
      const tex = makeGateTexture(this.gates[j].label, j === this.currentLane);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 1.25),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      label.position.z = -0.12;
      group.add(label);

      this.gateTexData.push({
        mesh: label,
        lane: j,
        lastHighlight: j === this.currentLane
      });

      // Glow bars
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x18ffff, transparent: true, opacity: 0.4
      });
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.2), glowMat);
      topBar.position.y = 1.55;
      group.add(topBar);
      const botBar = topBar.clone();
      botBar.position.y = -1.55;
      group.add(botBar);

      group.position.set(LANE_X[j], 1.5, this.gateZ);
      this.scene.add(group);
      this.gateMeshes.push(group);
    }

    this.gatesActive = true;
    this.rushing = false;
    document.getElementById('rushEl').classList.remove('show');

    // Notify UI
    if (this.onEncounterStart) {
      this.onEncounterStart(card);
    }

    audio.speak(card.bw.join('. '));
  }

  // --- Resolve encounter ---
  resolveEncounter() {
    this.gatesActive = false;
    document.getElementById('rushEl').classList.remove('show');

    const gate = this.gates[this.currentLane];
    const card = this.card;
    const ok = gate.correct;

    // Stats
    storage.updateCardStat(card.id, ok);
    storage.updateSubjectStat(card.subj, ok);
    if (ok) storage.set('totalCorrect', storage.get('totalCorrect') + 1);
    else storage.set('totalWrong', storage.get('totalWrong') + 1);
    storage.set('totalEncounters', storage.get('totalEncounters') + 1);

    this.encountersDone++;
    this.runCards.push({ card, ok, choice: gate.label });

    if (ok) {
      this.correct++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      const mult = this.powerups.double > 0 ? 2 : 1;
      let pts = (10 + this.streak * 2) * this.multiplier * mult;
      if (this.rushing) pts += this.rushBonus;
      pts += Math.floor(this.userSpeed * 6);
      this.score += pts;
      this.coins += 1 + Math.floor(this.streak / 3);
      if (this.streak % 5 === 0) this.multiplier = Math.min(this.multiplier + 1, 8);

      audio.play('correct');
      audio.play('coin');

      // Flash correct gate green
      this.gateMeshes.forEach((g, i) => {
        if (this.gates[i].correct) g.children[0].material.color.setHex(0x00cc55);
      });

      // Quest tracking
      storage.incrementQuest('q_10correct');
    } else {
      this.wrong++;
      this.streak = 0;
      this.multiplier = Math.max(1, this.multiplier - 1);
      this.lives--;

      audio.play('wrong');

      this.gateMeshes.forEach((g, i) => {
        if (this.gates[i].correct) g.children[0].material.color.setHex(0x00cc55);
        else if (i === this.currentLane) g.children[0].material.color.setHex(0xcc0000);
      });

      if (this.lives <= 0 && this.mode !== 'study') {
        this.feedbackTimer = 1.5;
        const self = this;
        setTimeout(function () { self.endRun(); }, 500);
        if (this.onEncounterResolve) this.onEncounterResolve(card, ok);
        return;
      }
    }

    this.feedbackTimer = 1.5;
    if (this.mode === 'study' || !ok) {
      this.teachTimer = this.mode === 'study' ? 3.5 : 2;
    }

    // Notify UI
    if (this.onEncounterResolve) this.onEncounterResolve(card, ok);

    // Quest: streak
    storage.incrementQuest('q_streak8', 0); // we'll check in UI

    // Power-up chance
    if (Math.random() < 0.1 && ok) {
      const types = ['shield', 'slow', 'double', 'magnet'];
      const t = types[Math.floor(Math.random() * types.length)];
      this.powerups[t] = t === 'shield' ? 999 : (t === 'slow' ? 8 : (t === 'double' ? 15 : 10));
      audio.play('powerup');
    }

    if (this.mode === 'daily' && this.encountersDone >= 15) {
      const self = this;
      setTimeout(function () { self.endRun(); }, 600);
      return;
    }

    // Next encounter after delay
    const delay = this.mode === 'study' ? 1500 : 500;
    const self = this;
    setTimeout(function () {
      if (!self.running) return;
      self.gateMeshes.forEach(m => self.scene.remove(m));
      self.gateMeshes = [];
      self.gateTexData = [];

      if (self.mode !== 'study' && Math.random() < 0.4) self.spawnObstacle();
      self.spawnCoin();
      self.spawnCoin();

      setTimeout(function () {
        if (self.running) self.spawnEncounter();
      }, 200);
    }, delay);
  }

  spawnObstacle() {
    const lane = Math.floor(Math.random() * 3);
    const type = Math.random() < 0.5 ? 'high' : 'low';
    const g = new THREE.Group();

    if (type === 'high') {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6),
        new THREE.MeshBasicMaterial({ color: 0x888899 })
      );
      pole.position.y = 1.6;
      g.add(pole);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.18, 0.18),
        new THREE.MeshBasicMaterial({ color: 0xff4444 })
      );
      bar.position.y = 3;
      g.add(bar);
    } else {
      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.35, 1.1),
        new THREE.MeshBasicMaterial({ color: 0x44aa66 })
      );
      bed.position.y = 0.45;
      g.add(bed);
    }

    g.position.set(LANE_X[lane], 0, -50);
    g.userData = { lane, type };
    this.scene.add(g);
    this.obstacleMeshes.push(g);
  }

  spawnCoin() {
    const lane = Math.floor(Math.random() * 3);
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd740 })
    );
    coin.position.set(LANE_X[lane], 1.2, -45 - Math.random() * 12);
    coin.rotation.x = Math.PI / 2;
    coin.userData = { lane, collected: false };
    this.scene.add(coin);
    this.coinMeshes.push(coin);
  }

  // --- Update loop (called every frame with real dt) ---
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
    if (!this.jumping && !this.sliding) {
      this.legPhase += currentSpeed * rushMult * dt * 0.8;
      const swing = Math.sin(this.legPhase) * 0.35;
      if (this.leftLeg) {
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;
        this.leftArm.rotation.x = -swing * 0.8;
        this.rightArm.rotation.x = swing * 0.8;
      }
      this.playerGroup.position.y = this.playerY + Math.abs(Math.sin(this.legPhase)) * 0.04;
    }

    // Gates
    if (this.gatesActive) {
      this.gateZ += move;
      for (let i = 0; i < this.gateMeshes.length; i++) {
        this.gateMeshes[i].position.z = this.gateZ;
      }
      // Update highlight only on lane change (not every frame)
      for (let k = 0; k < this.gateTexData.length; k++) {
        const gtd = this.gateTexData[k];
        const hl = gtd.lane === this.currentLane;
        if (hl !== gtd.lastHighlight) {
          gtd.mesh.material.map = makeGateTexture(this.gates[gtd.lane].label, hl);
          gtd.mesh.material.needsUpdate = true;
          gtd.lastHighlight = hl;
        }
      }
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
            if (this.powerups.shield > 0) {
              this.powerups.shield = 0;
            } else {
              this.lives--;
              audio.play('wrong');
              if (this.lives <= 0 && this.mode !== 'study') this.endRun();
            }
          }
        }
        this.scene.remove(ob);
        this.obstacleMeshes.splice(oi, 1);
      }
    }

    // Coins
    for (let ci = this.coinMeshes.length - 1; ci >= 0; ci--) {
      const c = this.coinMeshes[ci];
      c.position.z += move;
      c.rotation.y += dt * 3;
      if (c.position.z > 1) {
        if ((c.userData.lane === this.currentLane || this.powerups.magnet > 0) && !c.userData.collected) {
          c.userData.collected = true;
          this.coins++;
          audio.play('coin');
        }
        this.scene.remove(c);
        this.coinMeshes.splice(ci, 1);
      }
    }

    // Power-up timers
    ['shield', 'slow', 'double', 'magnet'].forEach(k => {
      if (this.powerups[k] > 0) this.powerups[k] -= dt;
    });

    // Feedback timers
    if (this.feedbackTimer > 0) this.feedbackTimer -= dt;
    if (this.teachTimer > 0) this.teachTimer -= dt;

    // Speed progression
    if (this.mode !== 'study') {
      this.speed = Math.min(this.baseSpeed * 1.8, this.baseSpeed + this.encountersDone * 0.4);
    }

    // Notify UI for HUD update
    if (this.onHudUpdate) this.onHudUpdate();
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    document.getElementById('pauseOverlay').classList.toggle('active', this.paused);
    if (!this.paused) this.clock.getDelta(); // flush delta
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

    // Save stats
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

    // Notify UI
    if (this.onRunEnd) this.onRunEnd();
  }
}

export const game = new Game();