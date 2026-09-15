/**
 * engine.js — Core game engine for Buzzword Dash
 *
 * Manages the 3D scene, game loop, player movement, gate encounters,
 * obstacles, coins, power-ups, exam monster, and all gameplay state.
 *
 * Features:
 * - Three.js scene with dynamic track skins
 * - Lane-based movement with smooth interpolation
 * - Rush mechanic with stackable speed boosts
 * - Power-up system (shield, magnet, double score, autopilot, score frenzy)
 * - Exam monster that chases the player
 * - Faceplant animation on all deaths
 * - Camera shake and dramatic camera on death
 * - Autopilot auto-rushes through correct gate
 * - Multiplayer hooks: seeded card order, sudden death, race mode
 * - Heart pickups when low on lives
 * - Map transitions between track skins
 * - Speed timer for competitive play
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { audio } from '../audio.js';
import { buildPlayer, getPlayerLimbs } from './player.js';
import { pickCard, spawnGates, updateGateHighlights, flashGateResult, resolveStats, validateCardNoLeak } from './gates.js';
import { spawnObstacle, spawnCoinBatch, spawnPowerup } from './obstacles.js';
import { buildTrack, spawnEnvProp, updateRunningLights, updateAtmosphericParticles, updateScrollLines, updateWallScrollPanels, updateWallMarkers, updateSkyboxElements, calculateTargetFOV, updateCameraFOV, calculateCameraLean, getStreakVisualIntensity } from './track.js';
import { getRandomSkin, SKINS, getSkinByName } from './skins.js';
import { getTheme } from './themes.js';
import { setupInput } from './input.js';
import { PowerUpFX } from './powerupfx.js';
import { TrailSystem } from './trails.js';
import { buildExamMonster, getMonsterParts } from './exammonster.js';
import { CONTINUE_COST, QUESTS } from './shopdata.js';

// ===== CONSTANTS =====
var LANE_X = [-3, 0, 3];
var BASE_SPEED = 8;
var SPEED_SCALE = 1.8;
var GATE_SPAWN_Z = -60;
var GATE_RESOLVE_Z = -1;
var OBSTACLE_SPAWN_INTERVAL_MIN = 3.0;
var OBSTACLE_SPAWN_INTERVAL_MAX = 6.0;
var COIN_SPAWN_INTERVAL_MIN = 4.0;
var COIN_SPAWN_INTERVAL_MAX = 8.0;
var POWERUP_SPAWN_INTERVAL_MIN = 15.0;
var POWERUP_SPAWN_INTERVAL_MAX = 30.0;
var ENV_PROP_SPAWN_INTERVAL = 3.0;
var MAP_TRANSITION_INTERVAL = 60;
var HEART_SPAWN_CHANCE = 0.35;
var MONSTER_BASE_Z = -45;
var MONSTER_MIN_Z = -12;
var MONSTER_MAX_Z = -55;
var RUSH_DURATION = 0.5;
var FACEPLANT_DURATION = 1.2;
var CAMERA_DEFAULT_Y = 3.5;
var CAMERA_DEFAULT_Z = 10;
var CAMERA_LOOK_Y = 1.2;

// ===== HEART PICKUP BUILDER =====
function buildHeartPickup() {
    var group = new THREE.Group();
    // Heart shape from two spheres + cone
    var mat = new THREE.MeshBasicMaterial({ color: 0xff4488 });
    var left = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), mat);
    left.position.set(-0.12, 0.12, 0);
    group.add(left);
    var right = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), mat);
    right.position.set(0.12, 0.12, 0);
    group.add(right);
    var bottom = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8), mat);
    bottom.position.set(0, -0.1, 0);
    bottom.rotation.z = Math.PI;
    group.add(bottom);
    // Glow
    var glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4488, transparent: true, opacity: 0.2 })
    );
    group.add(glow);
    return group;
}

// ===== GAME ENGINE =====

var game = {
    // --- Three.js ---
    renderer: null,
    scene: null,
    camera: null,

    // --- State ---
    running: false,
    paused: false,
    mode: 'endless',
    time: 0,
    deltaTime: 0,

    // --- Player ---
    player: null,
    playerLimbs: null,
    currentLane: 1,
    targetLane: 1,
    playerY: 0,
    isJumping: false,
    isSliding: false,
    jumpTimer: 0,
    slideTimer: 0,
    jumpVelocity: 0,

    // --- Score ---
    score: 0,
    coins: 0,
    streak: 0,
    bestStreak: 0,
    multiplier: 1,
    correct: 0,
    wrong: 0,
    lives: 3,
    encountersDone: 0,

    // --- Speed ---
    userSpeed: 1,
    currentSpeed: 0,
    baseSpeed: 0,

    // --- Gates ---
    gatesActive: false,
    gateMeshes: [],
    gateData: [],
    currentCard: null,
    recentCardIds: [],
    dailyIndex: 0,
    gateZ: GATE_SPAWN_Z,

    // --- Rush ---
    rushing: false,
    rushStacks: 0,
    rushTimer: 0,
    rushSpeed: 0,
    rushVignetteEl: null,

    // --- Obstacles / Coins / Power-ups ---
    obstacleMeshes: [],
    coinMeshes: [],
    obstacleTimer: 0,
    coinTimer: 0,
    powerupTimer: 0,
    envPropTimer: 0,
    envPropMeshes: [],

    // --- Power-ups active ---
    powerups: {
        shield: 0,
        magnet: 0,
        double: 0,
        autoPilot: 0,
        scoreFrenzy: 0
    },
    powerupFX: null,
    trailSystem: null,

    // --- Exam Monster ---
    monster: null,
    monsterParts: null,
    monsterZ: MONSTER_BASE_Z,
    monsterTargetZ: MONSTER_BASE_Z,
    monsterVisible: false,

    // --- Track / Skin ---
    currentSkin: null,
    trackRefs: null,
    theme: null,
    mapTimer: 0,
    skinIndex: 0,

    // --- Heart Pickups ---
    heartMeshes: [],

    // --- Faceplant ---
    faceplanting: false,
    faceplantTimer: 0,
    faceplantCameraState: null,

    // --- Camera ---
    cameraShake: 0,
    cameraLeanX: 0,

    // --- Speed Timer ---
    speedTimerEnabled: false,
    speedTimerValue: 0,
    encounterStartTime: 0,
    fastestAnswer: 99999,

    // --- Multiplayer ---
    seededCardOrder: null,
    mpMode: null, // 'mp_highscore', 'mp_suddendeath', 'mp_race'
    mpConfig: null,
    mpRaceCorrectTarget: 20,
    mpMatchStartTime: 0,

    // --- Continue ---
    continuesUsed: 0,
    continueCost: CONTINUE_COST,

    // --- Callbacks ---
    onEncounterStart: null,
    onEncounterResolve: null,
    onRunEnd: null,
    onHudUpdate: null,
    onScorePopup: null,
    onStreakMilestone: null,
    onPowerupCollected: null,
    onAchievementUnlocked: null,
    onContinuePrompt: null,
    onSkinSelected: null,
    onMapTransition: null,
    onPlayerFaceplant: null,

    // ===== INIT =====
    init: function () {
        var container = document.getElementById('gameContainer');
        if (!container) return;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        this.rushVignetteEl = document.getElementById('rushVignette');

        setupInput(this.renderer, this);

        var self = this;
        window.addEventListener('resize', function () {
            if (self.renderer && self.camera) {
                self.renderer.setSize(window.innerWidth, window.innerHeight);
                self.camera.aspect = window.innerWidth / window.innerHeight;
                self.camera.updateProjectionMatrix();
            }
        });
    },

    // ===== BUILD PLAYER =====
    buildPlayer: function () {
        if (this.player && this.scene) {
            this.scene.remove(this.player);
            this.player.traverse(function (child) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(function (m) { m.dispose(); });
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }

        this.player = buildPlayer();
        this.playerLimbs = getPlayerLimbs(this.player);

        if (this.scene) {
            this.scene.add(this.player);
            this.player.position.set(LANE_X[this.currentLane], 0, 0);
        }
    },

    // ===== START =====
    start: function (mode) {
        this.mode = mode || 'endless';
        this.running = false;
        this.paused = false;
        this.time = 0;
        this.score = 0;
        this.coins = 0;
        this.streak = 0;
        this.bestStreak = 0;
        this.multiplier = 1;
        this.correct = 0;
        this.wrong = 0;
        this.encountersDone = 0;
        this.currentLane = 1;
        this.targetLane = 1;
        this.playerY = 0;
        this.isJumping = false;
        this.isSliding = false;
        this.jumpTimer = 0;
        this.slideTimer = 0;
        this.gatesActive = false;
        this.rushing = false;
        this.rushStacks = 0;
        this.rushTimer = 0;
        this.recentCardIds = [];
        this.dailyIndex = 0;
        this.obstacleTimer = 2.0;
        this.coinTimer = 1.5;
        this.powerupTimer = 10.0;
        this.envPropTimer = 1.0;
        this.mapTimer = 0;
        this.continuesUsed = 0;
        this.continueCost = CONTINUE_COST;
        this.faceplanting = false;
        this.faceplantTimer = 0;
        this.faceplantCameraState = null;
        this.cameraShake = 0;
        this.cameraLeanX = 0;
        this.speedTimerValue = 0;
        this.fastestAnswer = 99999;
        this.monsterZ = MONSTER_BASE_Z;
        this.monsterTargetZ = MONSTER_BASE_Z;
        this.monsterVisible = false;
        this.mpMatchStartTime = Date.now();

        // Multiplayer config
        if (this.mode === 'mp_suddendeath' || this.mode === 'mp_highscore' || this.mode === 'mp_race') {
            this.mpMode = this.mode;
        } else {
            this.mpMode = null;
        }

        // Lives based on mode
        if (this.mode === 'study') {
            this.lives = 999;
        } else if (this.mode === 'mp_suddendeath') {
            this.lives = 1;
        } else {
            this.lives = 3;
        }

        // Speed
        this.userSpeed = storage.get('userSpeed') || 1;
        this.baseSpeed = BASE_SPEED + (this.userSpeed - 1) * SPEED_SCALE;
        this.currentSpeed = this.baseSpeed;

        // Speed timer
        this.speedTimerEnabled = storage.get('speedTimerEnabled') || false;

        // Power-ups reset
        this.powerups = { shield: 0, magnet: 0, double: 0, autoPilot: 0, scoreFrenzy: 0 };

        // Clear old scene
        if (this.scene) {
            this.scene.traverse(function (child) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(function (m) { m.dispose(); });
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }

        // New scene
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
        this.resetCamera();

        // Pick skin
        this.currentSkin = getRandomSkin();
        this.skinIndex = SKINS.indexOf(this.currentSkin);
        this.theme = getTheme(storage.get('selectedSubjects'));

        // Build track
        this.trackRefs = buildTrack(this.scene, this.currentSkin);

        // Build player
        this.buildPlayer();

        // Clear mesh arrays
        this.obstacleMeshes = [];
        this.coinMeshes = [];
        this.envPropMeshes = [];
        this.heartMeshes = [];
        this.gateMeshes = [];
        this.gateData = [];

        // Power-up FX
        if (this.powerupFX) this.powerupFX.dispose();
        this.powerupFX = new PowerUpFX(this.scene);

        // Trail system
        if (this.trailSystem) this.trailSystem.dispose();
        this.trailSystem = new TrailSystem(this.scene);

        // Exam Monster
        this.monster = buildExamMonster();
        this.monsterParts = getMonsterParts(this.monster);
        // Position monster in front of camera (negative Z) but far away
        this.monster.position.set(0, 1.5, this.monsterZ);
        this.monster.visible = false;
        this.scene.add(this.monster);

        if (this.onSkinSelected) {
            this.onSkinSelected(this.currentSkin.name);
        }
    },

    // ===== RESET CAMERA =====
    resetCamera: function () {
        if (!this.camera) return;
        this.camera.position.set(0, CAMERA_DEFAULT_Y, CAMERA_DEFAULT_Z);
        this.camera.lookAt(0, CAMERA_LOOK_Y, 0);
        this.camera.rotation.z = 0;
        this.cameraLeanX = 0;
        this.cameraShake = 0;
    },

    // ===== GO (after countdown) =====
    go: function () {
        this.running = true;
        this.paused = false;

        // Start ambient audio with skin name
        audio.startAmbient(this.currentSkin.name);

        // Spawn first encounter
        this.spawnEncounter();

        // Start game loop
        var self = this;
        var lastTime = performance.now();

        function loop(now) {
            if (!self.running) return;
            self._animFrameId = requestAnimationFrame(loop);

            var dt = (now - lastTime) / 1000;
            lastTime = now;
            if (dt > 0.1) dt = 0.033;

            if (!self.paused && !self.faceplanting) {
                self.update(dt);
            } else if (self.faceplanting) {
                self.updateFaceplant(dt);
            }

            self.render();
        }

        this._animFrameId = requestAnimationFrame(loop);
    },

    // ===== UPDATE =====
    update: function (dt) {
        this.time += dt;
        this.deltaTime = dt;

        var speed = this.currentSpeed;
        var move = speed * dt;

        // --- Speed ramping ---
        var targetSpeed = this.baseSpeed + this.streak * 0.15;
        if (this.rushing) {
            targetSpeed = this.rushSpeed;
        }
        this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1, 3 * dt);

        // --- Player lane movement ---
        var targetX = LANE_X[this.targetLane];
        var playerX = this.player.position.x;
        var laneSpeed = 12;
        this.player.position.x += (targetX - playerX) * Math.min(1, laneSpeed * dt);

        // Snap lane
        if (Math.abs(this.player.position.x - targetX) < 0.05) {
            this.player.position.x = targetX;
            this.currentLane = this.targetLane;
        } else {
            // Determine closest lane
            var minDist = 999;
            for (var li = 0; li < 3; li++) {
                var d = Math.abs(this.player.position.x - LANE_X[li]);
                if (d < minDist) { minDist = d; this.currentLane = li; }
            }
        }

        // --- Jump ---
        if (this.isJumping) {
            this.jumpTimer += dt;
            this.jumpVelocity -= 18 * dt;
            this.playerY += this.jumpVelocity * dt;
            if (this.playerY <= 0) {
                this.playerY = 0;
                this.isJumping = false;
                this.jumpTimer = 0;
            }
            this.player.position.y = this.playerY;
        }

        // --- Slide ---
        if (this.isSliding) {
            this.slideTimer -= dt;
            this.player.scale.y = 0.5;
            this.player.position.y = -0.25;
            if (this.slideTimer <= 0) {
                this.isSliding = false;
                this.player.scale.y = 1;
                this.player.position.y = this.playerY;
            }
        } else if (!this.isJumping) {
            this.player.position.y = this.playerY;
        }

        // --- Player animation ---
        this.animatePlayer(dt);

        // --- Rush timer ---
        if (this.rushing) {
            this.rushTimer -= dt;
            if (this.rushTimer <= 0) {
                this.rushing = false;
                this.rushStacks = 0;
                if (this.rushVignetteEl) this.rushVignetteEl.classList.remove('active');
            }
        }

        // --- Gates movement ---
        if (this.gatesActive && this.gateMeshes.length > 0) {
            for (var gi = 0; gi < this.gateMeshes.length; gi++) {
                this.gateMeshes[gi].position.z += move;
            }
            this.gateZ += move;

            // Auto-pilot: auto move to correct lane and rush
            if (this.powerups.autoPilot > 0 && this.gateData.length > 0) {
                for (var ai = 0; ai < this.gateData.length; ai++) {
                    if (this.gateData[ai].correct) {
                        this.targetLane = ai;
                        // Auto-rush through correct gate
                        if (!this.rushing && this.gateZ > GATE_SPAWN_Z + 10) {
                            this.addRushStack();
                        }
                        break;
                    }
                }
            }

            updateGateHighlights(this.gateMeshes, this.currentLane);

            // Resolve encounter
            if (this.gateZ >= GATE_RESOLVE_Z) {
                this.resolveEncounter();
            }
        }

        // --- Obstacles ---
        this.obstacleTimer -= dt;
        if (this.obstacleTimer <= 0 && !this.gatesActive) {
            this.obstacleTimer = OBSTACLE_SPAWN_INTERVAL_MIN + Math.random() * (OBSTACLE_SPAWN_INTERVAL_MAX - OBSTACLE_SPAWN_INTERVAL_MIN);
            // Don't spawn obstacles during gates
            if (!this.gatesActive) {
                spawnObstacle(this.scene, this.obstacleMeshes);
            }
        }

        for (var oi = this.obstacleMeshes.length - 1; oi >= 0; oi--) {
            var obs = this.obstacleMeshes[oi];
            obs.position.z += move;

            if (obs.position.z > 5) {
                this.scene.remove(obs);
                this.obstacleMeshes.splice(oi, 1);
                continue;
            }

            // Collision check
            if (!this.rushing && this.powerups.shield <= 0 &&
                Math.abs(obs.position.z) < 1.5 &&
                obs.userData.lane === this.currentLane) {

                var obsType = obs.userData.type;
                var hit = false;

                if (obsType === 'low' && !this.isJumping) hit = true;
                if (obsType === 'high' && !this.isSliding) hit = true;

                if (hit) {
                    this.loseLife('obstacle');
                    this.scene.remove(obs);
                    this.obstacleMeshes.splice(oi, 1);
                }
            }
        }

        // --- Coins ---
        this.coinTimer -= dt;
        if (this.coinTimer <= 0) {
            this.coinTimer = COIN_SPAWN_INTERVAL_MIN + Math.random() * (COIN_SPAWN_INTERVAL_MAX - COIN_SPAWN_INTERVAL_MIN);
            spawnCoinBatch(this.scene, this.coinMeshes);
        }

        // --- Power-ups ---
        this.powerupTimer -= dt;
        if (this.powerupTimer <= 0) {
            this.powerupTimer = POWERUP_SPAWN_INTERVAL_MIN + Math.random() * (POWERUP_SPAWN_INTERVAL_MAX - POWERUP_SPAWN_INTERVAL_MIN);
            spawnPowerup(this.scene, this.coinMeshes);
        }

        // --- Coin/Powerup collection ---
        var magnetRange = this.powerups.magnet > 0 ? 4.0 : 1.2;
        for (var ci = this.coinMeshes.length - 1; ci >= 0; ci--) {
            var c = this.coinMeshes[ci];
            c.position.z += move;

            // Coin spin
            if (c.userData.type === 'coin') {
                c.rotation.y += dt * 3;
            } else if (c.userData.type === 'powerup') {
                // Spin power-up rings
                for (var rci = 0; rci < c.children.length; rci++) {
                    if (c.children[rci].geometry && c.children[rci].geometry.type === 'TorusGeometry') {
                        c.children[rci].rotation.z += dt * 2;
                    }
                }
                c.position.y = 1.5 + Math.sin(this.time * 3) * 0.2;
            }

            if (c.position.z > 8) {
                this.scene.remove(c);
                this.coinMeshes.splice(ci, 1);
                continue;
            }

            if (c.userData.collected) continue;

            // Magnet attraction
            if (this.powerups.magnet > 0 && c.userData.type === 'coin') {
                var dx = this.player.position.x - c.position.x;
                var dz = this.player.position.z - c.position.z;
                var dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < magnetRange && dist > 0.1) {
                    c.position.x += (dx / dist) * 8 * dt;
                    c.position.z += (dz / dist) * 8 * dt;
                }
            }

            // Collection
            var collectDist = (c.userData.type === 'powerup') ? 1.8 : 1.2;
            if (Math.abs(c.position.z - this.player.position.z) < collectDist &&
                Math.abs(c.position.x - this.player.position.x) < collectDist &&
                Math.abs(c.position.y - this.player.position.y - 0.8) < 1.5) {

                c.userData.collected = true;
                c.visible = false;

                if (c.userData.type === 'coin') {
                    var coinValue = this.powerups.double > 0 ? 2 : 1;
                    if (this.powerups.scoreFrenzy > 0) coinValue *= 2;
                    this.coins += coinValue;
                    audio.play('coin', c.userData.lane);

                    // Quest: coin collection
                    storage.incrementQuest('q_50coins', coinValue);
                } else if (c.userData.type === 'powerup') {
                    this.activatePowerup(c.userData.powerupType);
                }
            }
        }

        // --- Heart pickups ---
        for (var hi = this.heartMeshes.length - 1; hi >= 0; hi--) {
            var heart = this.heartMeshes[hi];
            heart.position.z += move;
            heart.rotation.y += dt * 2;
            heart.position.y = 1.2 + Math.sin(this.time * 2) * 0.2;

            if (heart.position.z > 5) {
                this.scene.remove(heart);
                this.heartMeshes.splice(hi, 1);
                continue;
            }

            // Collection
            if (Math.abs(heart.position.z) < 1.5 &&
                Math.abs(heart.position.x - this.player.position.x) < 1.5) {
                this.lives = Math.min(this.lives + 1, this.mode === 'study' ? 999 : 5);
                audio.play('heart');
                this.scene.remove(heart);
                this.heartMeshes.splice(hi, 1);

                if (this.onHudUpdate) this.onHudUpdate();
            }
        }

        // --- Power-up timers ---
        for (var pk in this.powerups) {
            if (this.powerups[pk] > 0) {
                this.powerups[pk] -= dt;
                if (this.powerups[pk] <= 0) {
                    this.powerups[pk] = 0;
                    if (pk === 'shield') {
                        // Shield expired
                    }
                }
            }
        }

        // --- Power-up FX ---
        if (this.powerupFX) {
            this.powerupFX.update(dt, this.player.position, this.powerups, this.rushStacks);
        }

        // --- Trail system ---
        if (this.trailSystem) {
            this.trailSystem.update(dt, this.player.position.x, this.player.position.y, this.player.position.z, this.streak);
        }

        // --- Env props ---
        this.envPropTimer -= dt;
        if (this.envPropTimer <= 0) {
            this.envPropTimer = ENV_PROP_SPAWN_INTERVAL;
            if (this.envPropMeshes.length < 20) {
                spawnEnvProp(this.scene, this.envPropMeshes, storage.get('selectedSubjects'));
            }
        }
        for (var ei = this.envPropMeshes.length - 1; ei >= 0; ei--) {
            var ep = this.envPropMeshes[ei];
            ep.position.z += move * 0.8;
            ep.rotation.y += dt * 0.2;
            if (ep.position.z > 10) {
                this.scene.remove(ep);
                ep.traverse(function (child) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(function (m) { m.dispose(); });
                        } else {
                            child.material.dispose();
                        }
                    }
                });
                this.envPropMeshes.splice(ei, 1);
            }
        }

        // --- Map transition ---
        this.mapTimer += dt;
        if (this.mapTimer >= MAP_TRANSITION_INTERVAL) {
            this.mapTimer = 0;
            this.transitionMap();
        }

        // --- Track scrolling updates ---
        if (this.trackRefs) {
            updateRunningLights(this.trackRefs.runningLights, this.time, speed);
            updateAtmosphericParticles(this.trackRefs.particlePool, this.trackRefs.particleStates, dt, move, this.time);
            updateScrollLines(this.trackRefs.scrollLines, dt, move);
            updateWallScrollPanels(this.trackRefs.wallScrollPanels, dt, move);
            updateWallMarkers(this.trackRefs.wallMarkers, dt, move);
            updateSkyboxElements(this.trackRefs.skyboxElements, dt, move, this.time);
        }

        // --- Exam Monster ---
        this.updateMonster(dt);

        // --- Camera ---
        this.updateCamera(dt);

        // --- Speed timer ---
        if (this.speedTimerEnabled && this.gatesActive) {
            this.speedTimerValue += dt;
        }

        // --- Audio speed pitch ---
        audio.updateSpeedPitch(this.baseSpeed, this.currentSpeed);

        // --- HUD update ---
        if (this.onHudUpdate) this.onHudUpdate();

        // --- Multiplayer: race mode check ---
        if (this.mpMode === 'mp_race' && this.correct >= this.mpRaceCorrectTarget) {
            this.endRun();
        }

        // --- Multiplayer: high score timer ---
        if (this.mpMode === 'mp_highscore' && this.mpConfig && this.mpConfig.timeLimit) {
            var elapsed = (Date.now() - this.mpMatchStartTime) / 1000;
            if (elapsed >= this.mpConfig.timeLimit) {
                this.endRun();
            }
        }
    },

    // ===== SPAWN ENCOUNTER =====
    spawnEncounter: function () {
        // Pick card
        var card = pickCard(this.recentCardIds, this.mode, this.dailyIndex, this.seededCardOrder);
        if (!card) return;

        this.currentCard = card;
        this.recentCardIds.push(card.id);
        if (this.recentCardIds.length > 15) this.recentCardIds.shift();

        if (this.mode === 'daily') this.dailyIndex++;

        // Build gate data
        var correctLane = Math.floor(Math.random() * 3);
        var distractors = card.d.slice();
        // Shuffle distractors
        for (var di = distractors.length - 1; di > 0; di--) {
            var dj = Math.floor(Math.random() * (di + 1));
            var temp = distractors[di];
            distractors[di] = distractors[dj];
            distractors[dj] = temp;
        }

        this.gateData = [];
        var dIdx = 0;
        for (var g = 0; g < 3; g++) {
            if (g === correctLane) {
                this.gateData.push({ label: card.ans, correct: true });
            } else {
                this.gateData.push({ label: distractors[dIdx] || 'N/A', correct: false });
                dIdx++;
            }
        }

        // Validate no answer leak
        validateCardNoLeak(card, this.gateData);

        // Spawn gate meshes
        this.gateMeshes = spawnGates(this.scene, this.gateData, this.currentLane, this.theme);
        this.gateZ = GATE_SPAWN_Z;
        this.gatesActive = true;
        this.encounterStartTime = performance.now();

        // Callback
        if (this.onEncounterStart) {
            this.onEncounterStart(card, this.gateData);
        }

        // TTS
        audio.speak(card.bw.join(', '), this.currentSpeed);

        // Spawn heart if low lives
        if (this.lives <= 1 && this.mode !== 'study' && Math.random() < HEART_SPAWN_CHANCE) {
            this.spawnHeart();
        }
    },

    // ===== RESOLVE ENCOUNTER =====
    resolveEncounter: function () {
        if (!this.gatesActive) return;
        this.gatesActive = false;

        var chosenGate = this.gateData[this.currentLane];
        var wasCorrect = chosenGate && chosenGate.correct;

        // Flash gates
        flashGateResult(this.gateMeshes, this.gateData, this.currentLane);

        // Speed timer
        if (this.speedTimerEnabled) {
            var answerTime = performance.now() - this.encounterStartTime;
            if (wasCorrect && answerTime < this.fastestAnswer) {
                this.fastestAnswer = answerTime;
            }
            // Quest: speed answers
            if (wasCorrect && answerTime < 2000) {
                storage.incrementQuest('q_speed3');
            }
            this.speedTimerValue = 0;
        }

        // Resolve stats
        resolveStats(this.currentCard, wasCorrect);
        this.encountersDone++;

        if (wasCorrect) {
            this.correct++;
            this.streak++;
            if (this.streak > this.bestStreak) this.bestStreak = this.streak;

            // Multiplier
            this.multiplier = 1 + Math.floor(this.streak / 5);
            if (this.multiplier > 8) this.multiplier = 8;

            // Score
            var points = 100 * this.multiplier;
            if (this.rushing) points += 50 * this.rushStacks;
            if (this.powerups.double > 0) points *= 2;
            if (this.powerups.scoreFrenzy > 0) points *= 2;
            this.score += points;

            // Coins
            var coinReward = 5 + Math.floor(this.streak / 3);
            this.coins += coinReward;

            audio.play('correct');
            audio.correctCounter++;

            // Streak milestones
            if (this.streak % 5 === 0 && this.streak > 0) {
                audio.playStreakSound(this.streak);
                if (this.onStreakMilestone) {
                    this.onStreakMilestone(this.streak, this.multiplier);
                }
            }

            if (this.onScorePopup) this.onScorePopup(points);

            // Monster falls back
            this.monsterTargetZ = Math.max(this.monsterTargetZ - 3, MONSTER_MAX_Z);

            // Quest tracking
            storage.incrementQuest('q_10correct');
            if (this.rushing) storage.incrementQuest('q_rush3');

            // Quest: streak
            if (this.streak >= 8) {
                storage.incrementQuest('q_streak8', 0); // Just check, don't increment
                var qp = storage.getQuestProgress('q_streak8');
                if (qp < 8) {
                    storage.incrementQuest('q_streak8', this.streak - qp);
                }
            }

            // Subject tracking for quest
            if (this.currentCard && this.currentCard.subj) {
                // Track subjects answered
                var subjectsAnswered = this._subjectsAnswered || {};
                subjectsAnswered[this.currentCard.subj] = true;
                this._subjectsAnswered = subjectsAnswered;
                var uniqueSubjects = Object.keys(subjectsAnswered).length;
                if (uniqueSubjects >= 5) {
                    storage.incrementQuest('q_allsubjects', 0);
                    var qpS = storage.getQuestProgress('q_allsubjects');
                    if (qpS < uniqueSubjects) {
                        storage.incrementQuest('q_allsubjects', uniqueSubjects - qpS);
                    }
                }
            }

        } else {
            this.wrong++;
            this.streak = 0;
            this.multiplier = 1;
            audio.play('wrong');
            audio.correctCounter = 0;

            // Monster advances
            this.monsterTargetZ = Math.min(this.monsterTargetZ + 5, MONSTER_MIN_Z);

            // Sudden death elimination
            if (this.mpMode === 'mp_suddendeath') {
                // Will lose life and end run
            }

            if (this.mode !== 'study' && this.powerups.shield <= 0) {
                this.loseLife('wrong');
            }
        }

        // Callback
        if (this.onEncounterResolve) {
            this.onEncounterResolve(this.currentCard, wasCorrect);
        }

        // Remove gate meshes after delay
        var self = this;
        setTimeout(function () {
            for (var ri = 0; ri < self.gateMeshes.length; ri++) {
                if (self.scene) self.scene.remove(self.gateMeshes[ri]);
            }
            self.gateMeshes = [];
        }, 500);

        // Quest: encounters
        storage.incrementQuest('q_25enc');

        // Spawn next encounter after brief gap
        var self2 = this;
        setTimeout(function () {
            if (self2.running && !self2.faceplanting) {
                self2.spawnEncounter();
            }
        }, 800);
    },

    // ===== LOSE LIFE =====
    loseLife: function (reason) {
        if (this.powerups.shield > 0) {
            this.powerups.shield = 0;
            if (this.powerupFX) this.powerupFX.shatterShield(this.player.position);
            audio.play('wrong');
            return;
        }

        this.lives--;

        if (this.lives <= 0) {
            // Faceplant then continue/end prompt
            this.startFaceplant();
        } else {
            // Faceplant animation but continue playing
            this.startFaceplant();
        }
    },

    // ===== FACEPLANT =====
    startFaceplant: function () {
        this.faceplanting = true;
        this.faceplantTimer = FACEPLANT_DURATION;

        audio.play('faceplant');
        if (this.onPlayerFaceplant) this.onPlayerFaceplant();

        // Store camera state for reset
        this.faceplantCameraState = {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z
        };

        // Dramatic camera shake
        this.cameraShake = 0.8;
    },

    updateFaceplant: function (dt) {
        this.faceplantTimer -= dt;

        // Camera shake decay
        if (this.cameraShake > 0) {
            this.cameraShake -= dt * 1.5;
            if (this.cameraShake < 0) this.cameraShake = 0;

            this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.5;
            this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.3;
        }

        // Dramatic zoom toward player
        var zoomProgress = 1 - (this.faceplantTimer / FACEPLANT_DURATION);
        var zoomT = Math.min(zoomProgress * 2, 1);
        this.camera.position.z = CAMERA_DEFAULT_Z - zoomT * 3;
        this.camera.position.y = CAMERA_DEFAULT_Y - zoomT * 1.0;

        // Player falls forward
        if (this.player && this.playerLimbs && !this.playerLimbs.isVehicle) {
            var fallAngle = Math.min(zoomProgress * 2, 1) * (Math.PI / 3);
            this.player.rotation.x = fallAngle;
        } else if (this.player && this.playerLimbs && this.playerLimbs.isVehicle) {
            // Vehicle tips forward
            var tipAngle = Math.min(zoomProgress * 2, 1) * 0.3;
            this.player.rotation.x = tipAngle;
        }

        // Render during faceplant
        this.render();

        if (this.faceplantTimer <= 0) {
            this.faceplanting = false;

            // Reset player rotation
            if (this.player) this.player.rotation.x = 0;

            // Reset camera
            this.resetCamera();

            if (this.lives <= 0) {
                // Show continue prompt or end run
                if (this.mode === 'study') {
                    // Study mode: infinite lives, just continue
                    this.lives = 999;
                } else if (this.continuesUsed < 3 && storage.get('coins') >= this.continueCost) {
                    if (this.onContinuePrompt) {
                        this.onContinuePrompt(this.continueCost);
                    } else {
                        this.endRun();
                    }
                } else {
                    this.endRun();
                }
            } else {
                // Continue playing — spawn next encounter if needed
                if (!this.gatesActive) {
                    var self = this;
                    setTimeout(function () {
                        if (self.running) self.spawnEncounter();
                    }, 300);
                }
            }
        }
    },

    // ===== CONTINUE =====
    doContinue: function () {
        if (storage.get('coins') < this.continueCost) return false;

        storage.spendCoins(this.continueCost);
        this.continuesUsed++;
        this.continueCost = CONTINUE_COST * (this.continuesUsed + 1);
        this.lives = 2;
        this.streak = 0;
        this.multiplier = 1;
        this.faceplanting = false;
        this.faceplantTimer = 0;

        // Reset player
        if (this.player) this.player.rotation.x = 0;
        this.resetCamera();

        audio.play('continue');

        // Monster falls back
        this.monsterTargetZ = MONSTER_BASE_Z;

        // Resume
        if (!this.gatesActive) {
            var self = this;
            setTimeout(function () {
                if (self.running) self.spawnEncounter();
            }, 500);
        }

        return true;
    },

    // ===== END RUN =====
    endRun: function () {
        this.running = false;
        this.faceplanting = false;

        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }

        // Reset player visual state
        if (this.player) this.player.rotation.x = 0;
        this.resetCamera();

        // Save stats
        var totalCoins = this.coins;
        storage.addCoins(totalCoins);

        if (this.score > storage.get('bestScore')) {
            storage.set('bestScore', this.score);
        }
        if (this.bestStreak > storage.get('bestStreak')) {
            storage.set('bestStreak', this.bestStreak);
        }

        // Daily completion
        if (this.mode === 'daily') {
            storage.set('dailyDone', true);
            storage.set('lastDaily', new Date().toDateString());
            var ds = storage.get('dailyStreak') + 1;
            storage.set('dailyStreak', ds);

            // Quest
            storage.incrementQuest('q_daily');
        }

        // Calendar data
        var today = new Date();
        var dateKey = today.getFullYear() + '-' +
            String(today.getMonth() + 1).padStart(2, '0') + '-' +
            String(today.getDate()).padStart(2, '0');
        var totalAnswered = this.correct + this.wrong;
        var accuracy = totalAnswered > 0 ? Math.round(this.correct / totalAnswered * 100) : 0;
        var cal = storage.get('calendarData');
        cal[dateKey] = accuracy;
        storage.set('calendarData', cal);

        // Fastest answer tracking
        if (this.fastestAnswer < 99999) {
            storage.recordFastestAnswer(this.fastestAnswer);
        }

        // Achievement check
        var runData = {
            score: this.score,
            correct: this.correct,
            wrong: this.wrong,
            perfect: this.wrong === 0 && this.correct > 0,
            bestStreak: this.bestStreak,
            speed: this.userSpeed,
            fastestAnswer: this.fastestAnswer
        };

        var newAchievements = storage.checkAchievements(runData);

        // Golden Doctor unlock
        if (this.wrong === 0 && this.correct >= 20) {
            if (storage.unlockAchievement('ach_golden_doctor')) {
                newAchievements.push('ach_golden_doctor');
            }
            // Unlock golden avatar
            if (!storage.ownsItem('avatar_golden')) {
                var owned = storage.get('ownedItems');
                owned.push('avatar_golden');
                storage.set('ownedItems', owned);
            }
        }

        if (newAchievements.length > 0 && this.onAchievementUnlocked) {
            this.onAchievementUnlocked(newAchievements);
        }

        // Callback
        if (this.onRunEnd) this.onRunEnd();
    },

    // ===== RUSH =====
    addRushStack: function () {
        if (!this.gatesActive) return;

        this.rushStacks = Math.min(this.rushStacks + 1, 3);
        this.rushing = true;

        // Calculate rush speed: cover remaining gate distance in RUSH_DURATION seconds
        var remainingDist = Math.abs(this.gateZ - GATE_RESOLVE_Z);
        if (remainingDist < 1) remainingDist = 1;
        this.rushSpeed = remainingDist / RUSH_DURATION * this.rushStacks;

        this.rushTimer = RUSH_DURATION;

        audio.play('rush');

        if (this.rushVignetteEl) {
            this.rushVignetteEl.classList.add('active');
        }

        // Update rush HUD
        var rushEl = document.getElementById('rushEl');
        if (rushEl) {
            rushEl.textContent = '⚡ RUSH ×' + this.rushStacks + ' ⚡';
            rushEl.classList.add('show');
            setTimeout(function () { rushEl.classList.remove('show'); }, 600);
        }
    },

    // ===== JUMP / SLIDE =====
    jump: function () {
        if (this.isJumping || this.isSliding) return;
        this.isJumping = true;
        this.jumpVelocity = 8;
        this.jumpTimer = 0;

        storage.incrementQuest('q_jump5');
    },

    slide: function () {
        if (this.isJumping || this.isSliding) return;
        this.isSliding = true;
        this.slideTimer = 0.6;

        storage.incrementQuest('q_slide5');
    },

    // ===== PAUSE =====
    togglePause: function () {
        if (!this.running) return;
        this.paused = !this.paused;

        var overlay = document.getElementById('pauseOverlay');
        if (overlay) {
            overlay.classList.toggle('active', this.paused);
        }
    },

    resume: function () {
        this.paused = false;
        var overlay = document.getElementById('pauseOverlay');
        if (overlay) overlay.classList.remove('active');
    },

    // ===== ACTIVATE POWER-UP =====
    activatePowerup: function (type) {
        audio.play('powerup');

        var duration = 10;
        switch (type) {
            case 'shield':
                this.powerups.shield = duration;
                break;
            case 'magnet':
                this.powerups.magnet = duration;
                break;
            case 'double':
                this.powerups.double = duration;
                break;
            case 'autoPilot':
                this.powerups.autoPilot = duration;
                break;
            case 'scoreFrenzy':
                this.powerups.scoreFrenzy = duration;
                break;
        }

        storage.incrementQuest('q_3powerups');

        if (this.onPowerupCollected) {
            this.onPowerupCollected(type);
        }
    },

    // ===== SPAWN HEART =====
    spawnHeart: function () {
        var lane = Math.floor(Math.random() * 3);
        var heart = buildHeartPickup();
        heart.position.set(LANE_X[lane], 1.2, -45);
        this.scene.add(heart);
        this.heartMeshes.push(heart);
    },

    // ===== MAP TRANSITION =====
    transitionMap: function () {
        this.skinIndex = (this.skinIndex + 1) % SKINS.length;
        var newSkin = SKINS[this.skinIndex];
        this.currentSkin = newSkin;

        if (this.onMapTransition) {
            this.onMapTransition(newSkin.name);
        }
    },

    // ===== MONSTER =====
    updateMonster: function (dt) {
        if (!this.monster) return;

        // Show monster after a few encounters
        if (this.encountersDone >= 3 && !this.monsterVisible) {
            this.monsterVisible = true;
            this.monster.visible = true;
        }

        if (!this.monsterVisible) return;

        // Smooth monster Z movement (positioned at negative Z, in front of player)
        var monsterDiff = this.monsterTargetZ - this.monsterZ;
        this.monsterZ += monsterDiff * dt * 1.5;
        this.monster.position.z = this.monsterZ;

        // Animate monster parts
        var parts = this.monsterParts;
        if (!parts) return;

        var t = this.time;

        // Body pulse
        if (parts.body) {
            var bodyPulse = 1.0 + Math.sin(t * 2) * 0.05;
            parts.body.scale.set(bodyPulse, bodyPulse, bodyPulse);
        }

        // Aura pulse
        if (parts.aura) {
            var auraPulse = 1.0 + Math.sin(t * 1.5) * 0.08;
            parts.aura.scale.set(auraPulse, auraPulse, auraPulse);
            parts.aura.material.opacity = 0.10 + Math.sin(t * 2) * 0.05;
        }

        // Eyes glow
        if (parts.eyes) {
            for (var ei = 0; ei < parts.eyes.length; ei++) {
                var eye = parts.eyes[ei];
                var intensity = 0.8 + Math.sin(t * 3 + ei * 0.5) * 0.2;
                eye.material.color.setRGB(intensity, 0.1, 0.1);
            }
        }

        // Tentacles wave
        if (parts.tentacles) {
            for (var ti = 0; ti < parts.tentacles.length; ti++) {
                var tentacle = parts.tentacles[ti];
                tentacle.rotation.x = -0.5 + Math.sin(t * 1.5 + ti * 0.7) * 0.2;
                tentacle.rotation.z += Math.sin(t * 0.8 + ti * 0.5) * 0.003;
            }
        }

        // Question marks orbit
        if (parts.questionMarks) {
            for (var qi = 0; qi < parts.questionMarks.length; qi++) {
                var qm = parts.questionMarks[qi];
                var ud = qm.userData;
                ud.orbitAngle += dt * ud.orbitSpeed;
                qm.position.set(
                    Math.cos(ud.orbitAngle) * ud.orbitRadius,
                    ud.orbitHeight + Math.sin(t * 0.5 + qi) * 0.3,
                    Math.sin(ud.orbitAngle) * ud.orbitRadius
                );
                qm.rotation.y += dt * 2;
            }
        }

        // Mouth animation
        if (parts.mouth) {
            var mouthScale = 1.0 + Math.sin(t * 4) * 0.15;
            parts.mouth.scale.set(mouthScale, mouthScale, 1);
        }

        // Play monster close sound
        if (this.monsterZ > -18 && this.monsterZ < -10) {
            if (!this._monsterClosePlayedAt || this.time - this._monsterClosePlayedAt > 5) {
                audio.play('monsterClose');
                this._monsterClosePlayedAt = this.time;
            }
        }

        // Monster catches player
        if (this.monsterZ >= -8) {
            audio.play('monsterConsume');
            this.monsterTargetZ = MONSTER_BASE_Z;
            this.monsterZ = MONSTER_BASE_Z;
            this.loseLife('monster');
        }
    },

    // ===== PLAYER ANIMATION =====
    animatePlayer: function (dt) {
        if (!this.player || !this.playerLimbs) return;

        var t = this.time;
        var limbs = this.playerLimbs;

        if (limbs.isVehicle) {
            // Vehicle animation: wheel spin
            if (limbs.wheels) {
                for (var wi = 0; wi < limbs.wheels.length; wi++) {
                    limbs.wheels[wi].rotation.z += dt * this.currentSpeed * 0.5;
                }
            }
            // Flashing lights
            if (limbs.lights) {
                for (var fli = 0; fli < limbs.lights.length; fli++) {
                    var light = limbs.lights[fli];
                    light.visible = Math.sin(t * 8 + fli * Math.PI) > 0;
                }
            }
            return;
        }

        // Humanoid running animation
        var runSpeed = this.currentSpeed * 0.4;

        if (limbs.leftLeg) {
            limbs.leftLeg.rotation.x = Math.sin(t * runSpeed) * 0.6;
        }
        if (limbs.rightLeg) {
            limbs.rightLeg.rotation.x = Math.sin(t * runSpeed + Math.PI) * 0.6;
        }
        if (limbs.leftArm) {
            limbs.leftArm.rotation.x = Math.sin(t * runSpeed + Math.PI) * 0.5;
        }
        if (limbs.rightArm) {
            limbs.rightArm.rotation.x = Math.sin(t * runSpeed) * 0.5;
        }

        // Head bob
        if (limbs.head) {
            limbs.head.position.y += Math.sin(t * runSpeed * 2) * 0.005;
        }

        // Cape physics
        if (limbs.cape) {
            limbs.cape.rotation.x = 0.15 + Math.sin(t * runSpeed) * 0.1 + (this.rushing ? 0.3 : 0);
        }

        // Coat tail
        if (limbs.coatTail) {
            limbs.coatTail.rotation.x = 0.1 + Math.sin(t * runSpeed * 0.8) * 0.06;
        }

        // Mouth smile changes with streak
        if (limbs.mouth) {
            var smileScale = 1.0 + Math.min(this.streak * 0.01, 0.2);
            limbs.mouth.scale.set(smileScale, smileScale, 1);
        }
    },

    // ===== CAMERA =====
    updateCamera: function (dt) {
        if (!this.camera) return;

        // Camera lean
        this.cameraLeanX = calculateCameraLean(this.cameraLeanX, this.targetLane, dt, 0);
        this.camera.position.x = this.cameraLeanX;

        // Camera shake decay
        if (this.cameraShake > 0 && !this.faceplanting) {
            this.cameraShake -= dt * 2;
            if (this.cameraShake < 0) this.cameraShake = 0;
            this.camera.position.x += (Math.random() - 0.5) * this.cameraShake * 0.3;
            this.camera.position.y += (Math.random() - 0.5) * this.cameraShake * 0.2;
        }

        // FOV based on speed
        var targetFOV = calculateTargetFOV(this.baseSpeed, this.currentSpeed, 70, 85, this.rushing);
        updateCameraFOV(this.camera, targetFOV, dt, 2.0);

        // Look at point
        this.camera.lookAt(this.cameraLeanX * 0.5, CAMERA_LOOK_Y, 0);
    },

    // ===== RENDER =====
    render: function () {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    },

    // ===== NIGHT MODE =====
    updateNightMode: function () {
        this.theme = getTheme(storage.get('selectedSubjects'));
    }
};

export { game };
