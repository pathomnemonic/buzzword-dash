/**
 * engine.js — Core game engine
 *
 * FIXES APPLIED:
 * - FIX #1: Static import of exammonster.js
 * - FIX #2: Protected PowerUpFX and TrailSystem from cleanupTrack()
 * - FIX #3: Faceplant triggers on death even without monster, with dramatic camera
 * - FIX #4: Removed duplicate audio.crossfadeMusic() in transitionSkin()
 * - FIX #5: Heart spawn threshold restored to 3 encounters (original design)
 * - FIX #6: Rush propels player through gate within 0.5s (gate teleport)
 * - FIX #7: Monster starts at Z=20, wider visibility, faster approach
 * - FIX #8: Track name delayed until after countdown
 * - FIX #9: Player faces correct direction (no extra rotation)
 * - FIX #10: Monster consume + faceplant camera animation
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { audio } from '../audio.js';
import { getTheme } from './themes.js';
import { getRandomSkin, SKINS } from './skins.js';
import {
    buildTrack, spawnEnvProp,
    updateRunningLights, updateAtmosphericParticles,
    updateScrollLines, updateWallScrollPanels,
    updateWallMarkers, updateSkyboxElements,
    calculateTargetFOV, updateCameraFOV,
    calculateCameraLean, getStreakVisualIntensity
} from './track.js';
import { buildPlayer, getPlayerLimbs } from './player.js';
import { setupInput } from './input.js';
import { pickCard, spawnGates, updateGateHighlights, flashGateResult, resolveStats, validateCardNoLeak } from './gates.js';
import { spawnObstacle, spawnCoinBatch, spawnPowerup } from './obstacles.js';
import { TrailSystem } from './trails.js';
import { PowerUpFX } from './powerupfx.js';

export { SHOP_ITEMS, QUESTS, AVATARS, ACHIEVEMENTS, CONTINUE_COST } from './shopdata.js';
import { CONTINUE_COST } from './shopdata.js';

// FIX #1: Static import instead of dynamic import with top-level await
import { buildExamMonster, getMonsterParts } from './exammonster.js';

var LANE_X = [-3, 0, 3];

function disposeObject(obj) {
    if (!obj) return;
    if (obj.children) {
        for (var i = obj.children.length - 1; i >= 0; i--) disposeObject(obj.children[i]);
    }
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
        if (Array.isArray(obj.material)) {
            for (var m = 0; m < obj.material.length; m++) {
                if (obj.material[m].map) obj.material[m].map.dispose();
                obj.material[m].dispose();
            }
        } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
        }
    }
}

function removeAndDispose(scene, obj) {
    scene.remove(obj);
    disposeObject(obj);
}

function buildHeartMesh() {
    var group = new THREE.Group();
    var heartMat = new THREE.MeshBasicMaterial({ color: 0xff2255 });
    var glowMat = new THREE.MeshBasicMaterial({ color: 0xff4477, transparent: true, opacity: 0.4 });

    var leftLobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), heartMat);
    leftLobe.position.set(-0.12, 0.1, 0);
    group.add(leftLobe);

    var rightLobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), heartMat);
    rightLobe.position.set(0.12, 0.1, 0);
    group.add(rightLobe);

    var bottom = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8), heartMat);
    bottom.position.set(0, -0.12, 0);
    bottom.rotation.z = Math.PI;
    group.add(bottom);

    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), glowMat);
    glow.position.set(0, 0, 0);
    group.add(glow);

    return group;
}

class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = null;
        this.playerGroup = null;
        this.limbs = null;
        this.trailSystem = null;
        this.powerupFX = null;

        this.currentSkin = null;
        this.trackRefs = null;
        this.elapsedTime = 0;
        this.cameraLeanX = 0;
        this.playerTilt = 0;

        this.running = false;
        this.paused = false;
        this.mode = 'endless';
        this.currentLane = 1;
        this.targetLane = 1;
        this.prevLane = 1;

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
        this.continued = false;

        this.rushing = false;
        this.rushStacks = 0;
        this.maxRushStacks = 3;
        this.rushBonus = 0;
        this.rushInvulnerable = false;
        this.rushPropelTimer = 0;

        this.card = null;
        this.gates = [];
        this.gateMeshes = [];
        this.gateZ = 0;
        this.gatesActive = false;
        this.recentIds = [];
        this.runCards = [];

        this.obstacleMeshes = [];
        this.coinMeshes = [];
        this.envPropMeshes = [];
        this.speedLines = [];

        this.feedbackTimer = 0;
        this.teachTimer = 0;

        this.powerups = { shield: 0, double: 0, magnet: 0, autoPilot: 0, scoreFrenzy: 0 };
        this.autoPilotGatesLeft = 0;

        this.coinSpawnTimer = 0;
        this.powerupSpawnTimer = 0;
        this.envPropSpawnTimer = 0;
        this.speedLineTimer = 0;
        this.waitingForNext = false;
        this.nextEncounterTimer = 0;

        this.shakeTimer = 0;
        this.cameraBasePos = new THREE.Vector3(0, 4.5, 10);
        this.baseFOV = 70;

        this.celebrateTimer = 0;
        this.stumbleTimer = 0;
        this.landingTimer = 0;
        this.wasJumping = false;

        this.playerShadow = null;

        this.encounterStartTime = 0;
        this.lastEncounterTime = 0;

        this.isNewBest = false;
        this.runEnded = false;

        this.runCoinsCollected = 0;
        this.runPowerupsCollected = 0;

        // Map transition system
        this.encountersUntilTransition = 10;
        this.transitionActive = false;
        this.transitionTimer = 0;
        this.transitionDuration = 3.0;
        this.transitionOldSkin = null;
        this.transitionNewSkin = null;
        this.transitionProgress = 0;

        // Exam Monster system
        this.examMonster = null;
        this.monsterParts = null;
        this.monsterZ = 20;
        this.monsterTargetZ = 20;
        this.monsterVisible = false;
        this.monsterWarningPlayed = false;

        // Heart spawn
        this.heartSpawnCounter = 0;

        // Faceplant state
        this.faceplanting = false;
        this.faceplantTimer = 0;

        // FIX #8: Track name delay
        this._skinNamePending = null;
        this._skinNameDelay = 0;

        // Callbacks
        this.onEncounterStart = null;
        this.onEncounterResolve = null;
        this.onRunEnd = null;
        this.onHudUpdate = null;
        this.onStreakMilestone = null;
        this.onScorePopup = null;
        this.onPowerupCollected = null;
        this.onAchievementUnlocked = null;
        this.onContinuePrompt = null;
        this.onSkinSelected = null;
        this.onMapTransition = null;
        this.onPlayerFaceplant = null;
    }

    init() {
        this.clock = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.currentSkin = getRandomSkin();
        this.scene.background = new THREE.Color(this.currentSkin.colors.bg);

        this.camera = new THREE.PerspectiveCamera(this.baseFOV, innerWidth / innerHeight, 0.1, 300);
        this.camera.position.copy(this.cameraBasePos);
        this.camera.lookAt(0, 1, -20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(innerWidth, innerHeight);
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        document.getElementById('gameContainer').appendChild(this.renderer.domElement);

        this.trackRefs = buildTrack(this.scene, this.currentSkin);
        this.rebuildPlayer();
        this.createPlayerShadow();
        this.trailSystem = new TrailSystem(this.scene);
        this.powerupFX = new PowerUpFX(this.scene);
        setupInput(this.renderer, this);

        var self = this;
        this.renderer.setAnimationLoop(function () {
            var dt = self.clock.getDelta();
            var clamped = dt > 0.1 ? 0.016 : dt;
            if (self.running && !self.paused) self.update(clamped);
            if (self.running) {
                self.renderer.render(self.scene, self.camera);
            }
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

    createPlayerShadow() {
        if (this.playerShadow) {
            this.scene.remove(this.playerShadow);
            this.playerShadow.geometry.dispose();
            this.playerShadow.material.dispose();
        }
        this.playerShadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 16),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 })
        );
        this.playerShadow.rotation.x = -Math.PI / 2;
        this.playerShadow.position.set(0, 0.02, 0);
        this.scene.add(this.playerShadow);
    }

    createExamMonster() {
        if (this.examMonster) {
            this.scene.remove(this.examMonster);
        }
        this.examMonster = buildExamMonster();
        this.monsterParts = getMonsterParts(this.examMonster);
        // FIX #7: Monster positioned behind camera but within render distance
        this.examMonster.position.set(0, 1.5, this.monsterZ);
        this.examMonster.visible = false;
        this.scene.add(this.examMonster);
    }

    transitionSkin(newSkin) {
        this.transitionActive = true;
        this.transitionTimer = 0;
        this.transitionOldSkin = this.currentSkin;
        this.transitionNewSkin = newSkin;
        this.transitionProgress = 0;

        // FIX #4: Only use callback OR direct call, not both
        if (this.onMapTransition) {
            this.onMapTransition(newSkin.name);
        } else {
            try {
                audio.crossfadeMusic && audio.crossfadeMusic(newSkin.name, this.transitionDuration);
            } catch (e) {}
        }

        try { audio.play('mapTransition'); } catch (e) {}
    }

    updateMapTransition(dt) {
        if (!this.transitionActive) return;

        this.transitionTimer += dt;
        this.transitionProgress = Math.min(this.transitionTimer / this.transitionDuration, 1.0);

        var oldColors = this.transitionOldSkin.colors;
        var newColors = this.transitionNewSkin.colors;

        var oldBg = new THREE.Color(oldColors.bg);
        var newBg = new THREE.Color(newColors.bg);
        var blendedBg = oldBg.clone().lerp(newBg, this.transitionProgress);
        this.scene.background = blendedBg;

        if (this.scene.fog) {
            this.scene.fog.color.copy(blendedBg);
        }

        if (this.transitionProgress >= 1.0) {
            this.transitionActive = false;
            this.currentSkin = this.transitionNewSkin;
            this.transitionOldSkin = null;
            this.transitionNewSkin = null;

            this.cleanupTrack();
            this.trackRefs = buildTrack(this.scene, this.currentSkin);

            if (this.playerGroup && !this.scene.children.includes(this.playerGroup)) {
                this.scene.add(this.playerGroup);
            }
            if (this.playerShadow && !this.scene.children.includes(this.playerShadow)) {
                this.scene.add(this.playerShadow);
            }
            if (this.examMonster && !this.scene.children.includes(this.examMonster)) {
                this.scene.add(this.examMonster);
            }

            // FIX #2: Re-add PowerUpFX and TrailSystem
            this._readdPowerupFX();
            this._readdTrailSystem();

            if (this.onSkinSelected) this.onSkinSelected(this.currentSkin.name);
            audio.startAmbient(this.currentSkin.name);
        }
    }

    _readdPowerupFX() {
        if (!this.powerupFX || !this.powerupFX.effects) return;
        for (var key in this.powerupFX.effects) {
            var effect = this.powerupFX.effects[key];
            if (effect && effect.group && !this.scene.children.includes(effect.group)) {
                this.scene.add(effect.group);
            }
        }
        if (this.powerupFX.rushGhosts) {
            for (var i = 0; i < this.powerupFX.rushGhosts.length; i++) {
                var ghost = this.powerupFX.rushGhosts[i];
                if (ghost.mesh && !this.scene.children.includes(ghost.mesh)) {
                    this.scene.add(ghost.mesh);
                }
            }
        }
    }

    _readdTrailSystem() {
        if (!this.trailSystem || !this.trailSystem.pool) return;
        for (var i = 0; i < this.trailSystem.pool.length; i++) {
            var p = this.trailSystem.pool[i];
            if (p.mesh && !this.scene.children.includes(p.mesh)) {
                this.scene.add(p.mesh);
            }
        }
    }

    updateExamMonster(dt) {
        if (!this.examMonster) return;

        // Lerp monster toward target - faster rate
        this.monsterZ += (this.monsterTargetZ - this.monsterZ) * dt * 1.2;

        if (this.monsterZ < 3) this.monsterZ = 3;

        // FIX #7: Monster visible when Z < 18 (camera is at Z=10, looking at Z=-20)
        // Monster is BEHIND the player (positive Z), camera can see it
        var shouldBeVisible = this.monsterZ < 16;
        if (shouldBeVisible !== this.monsterVisible) {
            this.monsterVisible = shouldBeVisible;
            this.examMonster.visible = shouldBeVisible;
        }

        this.examMonster.position.set(0, 1.5, this.monsterZ);

        if (this.monsterVisible) {
            var distFactor = Math.max(0.3, 1.0 - (this.monsterZ - 3) / 15);
            this.examMonster.scale.set(distFactor, distFactor, distFactor);
        }

        if (this.monsterZ < 8 && !this.monsterWarningPlayed) {
            this.monsterWarningPlayed = true;
            try { audio.play('monsterClose'); } catch (e) {}
        }
        if (this.monsterZ >= 10) {
            this.monsterWarningPlayed = false;
        }

        // Animate monster parts
        if (this.monsterParts && this.monsterVisible) {
            var t = this.elapsedTime;
            if (this.monsterParts.body) {
                var pulse = 1.0 + Math.sin(t * 2) * 0.05;
                this.monsterParts.body.scale.set(pulse, pulse, pulse);
            }
            if (this.monsterParts.eyes) {
                for (var ei = 0; ei < this.monsterParts.eyes.length; ei++) {
                    var eye = this.monsterParts.eyes[ei];
                    if (eye.material) {
                        eye.material.opacity = 0.7 + Math.sin(t * 3 + ei) * 0.3;
                    }
                }
            }
            if (this.monsterParts.tentacles) {
                for (var ti = 0; ti < this.monsterParts.tentacles.length; ti++) {
                    var tent = this.monsterParts.tentacles[ti];
                    tent.rotation.z = Math.sin(t * 1.5 + ti * 0.8) * 0.2;
                }
            }
            if (this.monsterParts.questionMarks) {
                for (var qi = 0; qi < this.monsterParts.questionMarks.length; qi++) {
                    var qm = this.monsterParts.questionMarks[qi];
                    var angle = t * 1.2 + (qi / this.monsterParts.questionMarks.length) * Math.PI * 2;
                    qm.position.x = Math.cos(angle) * 1.5;
                    qm.position.z = Math.sin(angle) * 1.5;
                    qm.rotation.y += dt * 2;
                }
            }
        }
    }

    spawnHeartPickup() {
        var lane = Math.floor(Math.random() * 3);
        var heartGroup = buildHeartMesh();
        heartGroup.position.set(LANE_X[lane], 1.5, -45 - Math.random() * 15);
        heartGroup.userData = { lane: lane, collected: false, type: 'heart' };
        this.scene.add(heartGroup);
        this.coinMeshes.push(heartGroup);
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

    // FIX #6: Rush should propel through gate within 0.5s
    addRushStack() {
        if (!this.gatesActive) return;
        if (this.rushStacks < this.maxRushStacks) {
            this.rushStacks++;
            this.rushing = true;

            this.rushInvulnerable = true;

            // Calculate speed needed to reach gate in 0.5 seconds
            var distToGate = Math.abs(this.gateZ);
            // We need to cover distToGate in 0.5 seconds
            // Store the required rush speed multiplier
            this.rushPropelTimer = 0.5;
            // Calculate the multiplier needed: distance / (baseSpeed * 0.5)
            var neededSpeed = distToGate / 0.5;
            this.rushSpeedOverride = neededSpeed / Math.max(this.speed, 0.01);

            var distanceBonus = Math.max(0, (-this.gateZ - 10)) / 50;
            this.rushBonus = Math.floor(distanceBonus * 40 * this.rushStacks);
            audio.play('rush');
            document.getElementById('rushEl').textContent = '\u26A1 RUSH \u00D7' + this.rushStacks + ' \u26A1';
            document.getElementById('rushEl').classList.add('show');
        }
    }

    updateNightMode() {
        var theme = getTheme(storage.get('selectedSubjects'));
        this.scene.background.set(theme.bg);
    }

    cleanupObjects() {
        var i;
        for (i = 0; i < this.gateMeshes.length; i++) removeAndDispose(this.scene, this.gateMeshes[i]);
        this.gateMeshes = [];
        for (i = 0; i < this.obstacleMeshes.length; i++) removeAndDispose(this.scene, this.obstacleMeshes[i]);
        this.obstacleMeshes = [];
        for (i = 0; i < this.coinMeshes.length; i++) removeAndDispose(this.scene, this.coinMeshes[i]);
        this.coinMeshes = [];
        for (i = 0; i < this.envPropMeshes.length; i++) removeAndDispose(this.scene, this.envPropMeshes[i]);
        this.envPropMeshes = [];
        for (i = 0; i < this.speedLines.length; i++) {
            this.speedLines[i].geometry.dispose();
            this.speedLines[i].material.dispose();
            this.scene.remove(this.speedLines[i]);
        }
        this.speedLines = [];
    }

    // FIX #2: cleanupTrack protects PowerUpFX groups and TrailSystem particles
    cleanupTrack() {
        var toRemove = [];
        var self = this;

        var protectedSet = new Set();
        protectedSet.add(self.camera);
        protectedSet.add(self.playerShadow);
        protectedSet.add(self.playerGroup);
        if (self.examMonster) protectedSet.add(self.examMonster);

        if (self.powerupFX && self.powerupFX.effects) {
            for (var key in self.powerupFX.effects) {
                var effect = self.powerupFX.effects[key];
                if (effect && effect.group) protectedSet.add(effect.group);
            }
            if (self.powerupFX.rushGhosts) {
                for (var gi = 0; gi < self.powerupFX.rushGhosts.length; gi++) {
                    if (self.powerupFX.rushGhosts[gi].mesh) {
                        protectedSet.add(self.powerupFX.rushGhosts[gi].mesh);
                    }
                }
            }
        }

        if (self.trailSystem && self.trailSystem.pool) {
            for (var ti = 0; ti < self.trailSystem.pool.length; ti++) {
                if (self.trailSystem.pool[ti].mesh) {
                    protectedSet.add(self.trailSystem.pool[ti].mesh);
                }
            }
        }

        this.scene.traverse(function (child) {
            if (protectedSet.has(child)) return;
            var parent = child.parent;
            while (parent) {
                if (protectedSet.has(parent)) return;
                parent = parent.parent;
            }
            if (child.isMesh || child.isGroup || child.isLine) toRemove.push(child);
            if (child.isLight && child.userData.skinLight) toRemove.push(child);
        });
        for (var i = 0; i < toRemove.length; i++) {
            if (toRemove[i].parent === this.scene) removeAndDispose(this.scene, toRemove[i]);
        }
        this.trackRefs = null;
    }

    collectPowerup(type) {
        switch (type) {
            case 'shield': this.powerups.shield = 999; break;
            case 'magnet': this.powerups.magnet = 10; break;
            case 'double': this.powerups.double = 15; break;
            case 'autoPilot': this.autoPilotGatesLeft = 1; this.powerups.autoPilot = 999; break;
            case 'scoreFrenzy': this.powerups.scoreFrenzy = 8; break;
        }
        audio.play('powerup');
        this.runPowerupsCollected++;
        if (this.runPowerupsCollected <= 3) {
            storage.incrementQuest('q_3powerups');
        }
        if (this.onPowerupCollected) this.onPowerupCollected(type);
    }

    triggerShake() { this.shakeTimer = 0.15; }

    doContinue() {
        if (storage.spendCoins(CONTINUE_COST)) {
            this.lives = 1;
            this.continued = true;
            this.running = true;
            this.paused = false;
            audio.play('continue');
            this.clock.getDelta();
            this.spawnEncounter();
            return true;
        }
        return false;
    }

    start(mode) {
        this.mode = mode;
        this.userSpeed = storage.get('userSpeed') || 1;
        if (mode === 'daily' && storage.get('dailyDone')) {
            alert('Daily round already completed today!');
            return;
        }
        this.currentLane = 1; this.targetLane = 1; this.prevLane = 1;
        this.jumping = false; this.sliding = false;
        this.playerY = 0; this.jumpVel = 0; this.legPhase = 0;
        this.elapsedTime = 0; this.cameraLeanX = 0; this.playerTilt = 0;
        var mapped = 3.75 + (this.userSpeed - 1) * 3.75;
        this.speed = mode === 'study' ? 3 : mapped;
        this.baseSpeed = this.speed;
        this.score = 0; this.streak = 0; this.bestStreak = 0;
        this.multiplier = 1; this.coins = 0;
        this.encountersDone = 0; this.correct = 0; this.wrong = 0;
        this.lives = mode === 'study' ? 99 : 3;
        this.continued = false;
        this.rushing = false; this.rushStacks = 0; this.rushBonus = 0;
        this.rushInvulnerable = false; this.rushPropelTimer = 0;
        this.rushSpeedOverride = 0;
        this.card = null; this.gatesActive = false;
        this.waitingForNext = false; this.nextEncounterTimer = 0;
        this.coinSpawnTimer = 0; this.powerupSpawnTimer = 8;
        this.envPropSpawnTimer = 0.5; this.speedLineTimer = 0;
        this.shakeTimer = 0;
        this.runCards = []; this.recentIds = [];
        this.feedbackTimer = 0; this.teachTimer = 0;
        this.powerups = { shield: 0, double: 0, magnet: 0, autoPilot: 0, scoreFrenzy: 0 };
        this.autoPilotGatesLeft = 0;

        this.celebrateTimer = 0;
        this.stumbleTimer = 0;
        this.landingTimer = 0;
        this.wasJumping = false;
        this.encounterStartTime = 0;
        this.lastEncounterTime = 0;
        this.isNewBest = false;
        this.runEnded = false;
        this.runCoinsCollected = 0;
        this.runPowerupsCollected = 0;

        this.encountersUntilTransition = 10;
        this.transitionActive = false;
        this.transitionTimer = 0;

        this.monsterZ = 20;
        this.monsterTargetZ = 20;
        this.monsterVisible = false;
        this.monsterWarningPlayed = false;

        // FIX #5: Keep heart spawn threshold at 3 (original)
        this.heartSpawnCounter = 0;

        this.faceplanting = false;
        this.faceplantTimer = 0;

        // FIX #8: Reset skin name delay
        this._skinNamePending = null;
        this._skinNameDelay = 0;

        if (this.playerGroup) {
            this.playerGroup.scale.set(1, 1, 1);
            this.playerGroup.position.set(0, 0, 0);
            this.playerGroup.rotation.set(0, 0, 0);
        }
        this.cleanupObjects();
        this.cleanupTrack();
        if (this.powerupFX) this.powerupFX.hideAll();
        this.currentSkin = getRandomSkin();
        this.trackRefs = buildTrack(this.scene, this.currentSkin);
        this.camera.position.copy(this.cameraBasePos);
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
        this.clock.getDelta();
        this.rebuildPlayer();
        this.createPlayerShadow();

        this._readdPowerupFX();
        this._readdTrailSystem();

        // Create exam monster
        this.createExamMonster();

        // FIX #8: Delay the skin name display so it doesn't overlap countdown
        this._skinNamePending = this.currentSkin.name;
        this._skinNameDelay = 4.0; // Show after countdown finishes
    }

    go() {
        this.running = true;
        this.paused = false;
        this.clock.getDelta();
        audio.startAmbient(this.currentSkin.name);
        this.spawnEncounter();
    }

    spawnEncounter() {
        var card = pickCard(this.recentIds, this.mode, this.encountersDone);
        if (!card) { this.endRun(); return; }
        this.card = card;
        this.recentIds.push(card.id);
        if (this.recentIds.length > 10) this.recentIds.shift();
        var correctLane = Math.floor(Math.random() * 3);
        var distractors = card.d.slice();
        this.gates = [];
        for (var i = 0; i < 3; i++) {
            if (i === correctLane) this.gates.push({ label: card.ans, correct: true });
            else this.gates.push({ label: distractors.shift() || 'N/A', correct: false });
        }
        validateCardNoLeak(card, this.gates);

        var cardStat = storage.getCardStat(card.id);
        if (cardStat.wrong > 0) {
            var revengeBanner = document.getElementById('revengeCardBanner');
            if (revengeBanner) {
                revengeBanner.classList.add('show');
                setTimeout(function () { revengeBanner.classList.remove('show'); }, 1500);
            }
        }

        if (this.autoPilotGatesLeft > 0) {
            for (var ap = 0; ap < this.gates.length; ap++) {
                if (this.gates[ap].correct) { this.targetLane = ap; break; }
            }
        }

        this.gateZ = -60;
        for (var g = 0; g < this.gateMeshes.length; g++) removeAndDispose(this.scene, this.gateMeshes[g]);
        var gateTheme = { glow: this.currentSkin.colors.gateGlow, gate: this.currentSkin.colors.gateBase };
        this.gateMeshes = spawnGates(this.scene, this.gates, this.currentLane, gateTheme);
        this.gatesActive = true;
        this.rushing = false;
        this.rushStacks = 0;
        this.rushInvulnerable = false;
        this.rushPropelTimer = 0;
        this.rushSpeedOverride = 0;
        document.getElementById('rushEl').classList.remove('show');

        this.encounterStartTime = performance.now();

        if (this.onEncounterStart) this.onEncounterStart(card, this.gates);
        audio.speak(card.bw.join('. '), this.speed);
    }

    resolveEncounter() {
        this.gatesActive = false;
        document.getElementById('rushEl').classList.remove('show');
        this.rushing = false;
        this.rushStacks = 0;
        this.rushInvulnerable = false;
        this.rushPropelTimer = 0;
        this.rushSpeedOverride = 0;

        this.lastEncounterTime = performance.now() - this.encounterStartTime;

        var gate = this.gates[this.currentLane];
        var card = this.card;
        var ok = gate.correct;

        resolveStats(card, ok);
        this.encountersDone++;
        this.runCards.push({ card: card, ok: ok, choice: gate.label });

        storage.incrementQuest('q_25enc');

        // Map transition every 10 encounters
        this.encountersUntilTransition--;
        if (this.encountersUntilTransition <= 0) {
            this.encountersUntilTransition = 10;
            var newSkin = getRandomSkin();
            var attempts = 0;
            while (newSkin.name === this.currentSkin.name && attempts < 20) {
                newSkin = getRandomSkin();
                attempts++;
            }
            if (newSkin.name !== this.currentSkin.name) {
                this.transitionSkin(newSkin);
            }
        }

        // Monster moves faster on wrong answers
        if (this.examMonster) {
            if (!ok) {
                this.monsterTargetZ -= 4;
            } else {
                this.monsterTargetZ += 1.5;
            }
            this.monsterTargetZ = Math.min(this.monsterTargetZ, 30);
            this.monsterTargetZ = Math.max(this.monsterTargetZ, 3);
        }

        var pointsEarned = 0;

        if (ok) {
            this.correct++;
            this.streak++;
            if (this.streak > this.bestStreak) this.bestStreak = this.streak;

            if (this.streak === 8) {
                storage.incrementQuest('q_streak8');
            }

            var mult = this.powerups.double > 0 ? 2 : 1;
            pointsEarned = (10 + this.streak * 2) * this.multiplier * mult;
            if (this.rushBonus > 0) pointsEarned += this.rushBonus;
            pointsEarned += Math.floor(this.userSpeed * 3);
            this.score += pointsEarned;

            var coinMult = this.powerups.scoreFrenzy > 0 ? 5 : 1;
            this.coins += (1 + Math.floor(this.streak / 3)) * coinMult;

            if (this.streak % 5 === 0) {
                this.multiplier = Math.min(this.multiplier + 1, 8);
                audio.playStreakSound(this.streak);
                if (this.onStreakMilestone) this.onStreakMilestone(this.streak, this.multiplier);
            } else {
                audio.play('correct');
            }
            audio.play('coin');

            this.celebrateTimer = 0.3;
            this.playerY += 0.5;
            this.jumpVel = 3;
            if (!this.jumping) {
                this.jumping = true;
            }

            for (var gi = 0; gi < this.gateMeshes.length; gi++) {
                if (this.gates[gi].correct) {
                    this.gateMeshes[gi].children[0].material.color.setHex(0x00ff44);
                    this.gateMeshes[gi].children[0].material.opacity = 1.0;
                    this.gateMeshes[gi].scale.set(1.3, 1.3, 1.3);
                    this._spawnGateParticles(this.gateMeshes[gi].position, 0x00ff44, 10);
                } else {
                    var otherFrame = this.gateMeshes[gi].children[0];
                    otherFrame.material.opacity = 0;
                }
            }

            storage.incrementQuest('q_10correct');
            if (this.onScorePopup) this.onScorePopup(pointsEarned);

        } else {
            this.wrong++;
            this.streak = 0;
            this.multiplier = Math.max(1, this.multiplier - 1);
            this.lives--;

            audio.correctCounter = 0;
            this.stumbleTimer = 0.3;
            audio.play('wrong');

            for (var gwi = 0; gwi < this.gateMeshes.length; gwi++) {
                if (this.gates[gwi].correct) {
                    this.gateMeshes[gwi].children[0].material.color.setHex(0x00cc55);
                    this.gateMeshes[gwi].children[0].material.opacity = 1.0;
                } else if (gwi === this.currentLane) {
                    this.gateMeshes[gwi].children[0].material.color.setHex(0xff2222);
                    this.gateMeshes[gwi].children[0].material.opacity = 0.5;
                } else {
                    this.gateMeshes[gwi].children[0].material.opacity = 0;
                }
            }

            flashGateResult(this.gateMeshes, this.gates, this.currentLane);
            this.triggerShake();

            if (this.lives < 0 && this.powerups.shield > 0) {
                this.lives = 0;
            }

            if (this.lives <= 0 && this.mode !== 'study') {
                if (this.powerups.shield > 0) {
                    this.powerups.shield = 0;
                    this.lives = 1;
                    if (this.powerupFX) this.powerupFX.shatterShield(this.playerGroup.position);
                } else {
                    this.feedbackTimer = 1.5;
                    if (this.onEncounterResolve) this.onEncounterResolve(card, ok);

                    // FIX #3 + #10: Trigger faceplant on death
                    if (this.examMonster && this.monsterZ < 20) {
                        this._triggerMonsterConsume();
                    } else {
                        this._triggerFaceplant();
                    }

                    var canContinue = !this.continued && storage.get('coins') >= CONTINUE_COST;
                    if (canContinue && this.onContinuePrompt) {
                        this.running = false;
                        this.onContinuePrompt(CONTINUE_COST);
                    } else {
                        var self = this;
                        var endDelay = this.faceplanting ? 2000 : 500;
                        setTimeout(function () { self.endRun(); }, endDelay);
                    }
                    return;
                }
            }
        }

        if (this.autoPilotGatesLeft > 0) {
            this.autoPilotGatesLeft--;
            if (this.autoPilotGatesLeft <= 0) {
                this.autoPilotGatesLeft = 0;
                this.powerups.autoPilot = 0;
            }
        }

        this.feedbackTimer = 1.2;
        this.rushBonus = 0;

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
            this.waitingForNext = false;
            var self2 = this;
            setTimeout(function () { self2.endRun(); }, 600);
            return;
        }

        // FIX #5: Heart spawn logic - original threshold of 3
        if (this.lives === 1 && this.mode !== 'study') {
            this.heartSpawnCounter++;
            if (this.heartSpawnCounter >= 3) {
                this.heartSpawnCounter = 0;
                if (Math.random() < 0.7) {
                    this.spawnHeartPickup();
                }
            }
        }
    }

    _triggerMonsterConsume() {
        if (!this.examMonster) return;

        this.monsterTargetZ = 0;
        this.monsterZ = Math.min(this.monsterZ, 10);
        this.examMonster.visible = true;

        try { audio.play('monsterConsume'); } catch (e) {}

        // FIX #10: Dramatic faceplant with camera movement
        this.faceplanting = true;
        this.faceplantTimer = 1.8;

        if (this.onPlayerFaceplant) {
            this.onPlayerFaceplant();
        }

        try { audio.play('faceplant'); } catch (e) {}
    }

    // FIX #3: Standalone faceplant even without monster
    _triggerFaceplant() {
        this.faceplanting = true;
        this.faceplantTimer = 1.5;

        if (this.onPlayerFaceplant) {
            this.onPlayerFaceplant();
        }

        try { audio.play('faceplant'); } catch (e) {}
    }

    _spawnGateParticles(position, color, count) {
        var scene = this.scene;
        for (var i = 0; i < count; i++) {
            var particle = new THREE.Mesh(
                new THREE.SphereGeometry(0.06, 4, 4),
                new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
            );
            particle.position.set(position.x, position.y, position.z);
            var angle = (i / count) * Math.PI * 2;
            var speed = 2 + Math.random() * 2;
            var vx = Math.cos(angle) * speed;
            var vy = 1 + Math.random() * 2;
            var vz = Math.sin(angle) * speed;
            scene.add(particle);

            (function (p, velX, velY, velZ, sc) {
                var startTime = Date.now();
                function animateParticle() {
                    var elapsed = (Date.now() - startTime) / 1000;
                    if (elapsed > 0.4) {
                        sc.remove(p);
                        p.geometry.dispose();
                        p.material.dispose();
                        return;
                    }
                    p.position.x += velX * 0.016;
                    p.position.y += velY * 0.016;
                    p.position.z += velZ * 0.016;
                    velY -= 6 * 0.016;
                    p.material.opacity = (1 - elapsed / 0.4) * 0.8;
                    var s = (1 - elapsed / 0.4) * 0.8 + 0.2;
                    p.scale.set(s, s, s);
                    requestAnimationFrame(animateParticle);
                }
                animateParticle();
            })(particle, vx, vy, vz, scene);
        }
    }

    transitionToNextEncounter() {
        for (var m = 0; m < this.gateMeshes.length; m++) removeAndDispose(this.scene, this.gateMeshes[m]);
        this.gateMeshes = [];
        if (this.mode !== 'study' && Math.random() < 0.4) {
            spawnObstacle(this.scene, this.obstacleMeshes);
        }
        this.spawnEncounter();
    }

    update(dt) {
        this.elapsedTime += dt;
        var currentSpeed = this.speed;
        var rushMult = 1.0 + this.rushStacks;

        // FIX #6: During rush propulsion, use calculated speed to guarantee gate arrival
        if (this.rushPropelTimer > 0) {
            this.rushPropelTimer -= dt;
            if (this.rushSpeedOverride > 0) {
                rushMult = this.rushSpeedOverride;
            } else {
                rushMult = 3.0;
            }
            if (this.rushPropelTimer <= 0) {
                this.rushInvulnerable = false;
                this.rushSpeedOverride = 0;
            }
        }

        var move = currentSpeed * rushMult * dt;

        // FIX #8: Delayed skin name display
        if (this._skinNamePending && this._skinNameDelay > 0) {
            this._skinNameDelay -= dt;
            if (this._skinNameDelay <= 0) {
                if (this.onSkinSelected) this.onSkinSelected(this._skinNamePending);
                this._skinNamePending = null;
            }
        }

        // FIX #10: Faceplant animation with dramatic camera
        if (this.faceplanting) {
            this.faceplantTimer -= dt;
            var totalDuration = this.examMonster && this.monsterZ < 15 ? 1.8 : 1.5;
            var fp = totalDuration - this.faceplantTimer;

            if (fp < 0.3) {
                // Lean forward rapidly
                this.playerGroup.rotation.x = (fp / 0.3) * 0.8;
            } else if (fp < 0.6) {
                // Arms forward
                this.playerGroup.rotation.x = 0.8 + ((fp - 0.3) / 0.3) * 0.5;
                if (this.limbs && this.limbs.leftArm) {
                    this.limbs.leftArm.rotation.x = -1.2 * ((fp - 0.3) / 0.3);
                }
                if (this.limbs && this.limbs.rightArm) {
                    this.limbs.rightArm.rotation.x = -1.2 * ((fp - 0.3) / 0.3);
                }
            } else if (fp < 1.0) {
                // Hit ground
                this.playerGroup.rotation.x = Math.PI / 2;
                this.playerGroup.position.y = Math.max(0, this.playerGroup.position.y - dt * 5);
            }

            // FIX #10: Move camera to show the faceplant dramatically
            var camProgress = Math.min(fp / totalDuration, 1.0);
            this.camera.position.x = this.cameraBasePos.x + Math.sin(camProgress * Math.PI) * 2;
            this.camera.position.y = this.cameraBasePos.y - camProgress * 2;
            this.camera.position.z = this.cameraBasePos.z - camProgress * 3;
            this.camera.lookAt(this.playerGroup.position.x, 1, this.playerGroup.position.z);

            if (this.faceplantTimer <= 0) {
                this.faceplanting = false;
            }

            if (this.onHudUpdate) this.onHudUpdate();
            return;
        }

        // Update map transition
        this.updateMapTransition(dt);

        // Update exam monster
        this.updateExamMonster(dt);

        // AUTO-PILOT
        if (this.autoPilotGatesLeft > 0 && this.gatesActive) {
            for (var ap = 0; ap < this.gates.length; ap++) {
                if (this.gates[ap].correct) { this.targetLane = ap; break; }
            }
        }

        // PLAYER MOVEMENT
        var targetX = LANE_X[this.targetLane];
        var dx = targetX - this.playerGroup.position.x;
        var snapSpeed = Math.min(1, 12 * dt);
        var absDx = Math.abs(dx);
        if (absDx > 0.01) {
            var easeMultiplier = absDx > 1.5 ? 1.5 : (absDx < 0.3 ? 0.5 : 1.0);
            this.playerGroup.position.x += dx * snapSpeed * easeMultiplier;
        } else {
            this.playerGroup.position.x = targetX;
        }
        this.currentLane = this.targetLane;

        // Body tilt
        var tiltTarget = 0;
        if (this.targetLane !== this.prevLane) {
            tiltTarget = (this.targetLane - this.prevLane) * -0.15;
        }
        this.playerTilt += (tiltTarget - this.playerTilt) * Math.min(1, 8 * dt);
        if (Math.abs(this.playerTilt) < 0.005) {
            this.playerTilt = 0;
            this.prevLane = this.targetLane;
        }
        this.playerGroup.rotation.z = this.playerTilt;

        // Jump
        if (this.jumping) {
            this.playerY += this.jumpVel * dt;
            var gravity = 30;
            if (Math.abs(this.jumpVel) < 3) gravity = 18;
            this.jumpVel -= gravity * dt;
            if (this.playerY <= 0) {
                this.playerY = 0;
                this.jumping = false;
                this.jumpVel = 0;
                if (this.wasJumping) {
                    this.landingTimer = 0.1;
                }
            }
        }
        this.wasJumping = this.jumping;
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

        // Landing squash
        if (this.landingTimer > 0 && !this.sliding) {
            this.landingTimer -= dt;
            this.playerGroup.scale.y = 0.85;
            if (this.landingTimer <= 0) {
                this.playerGroup.scale.y = 1.0;
            }
        }

        // Stumble animation
        if (this.stumbleTimer > 0) {
            this.stumbleTimer -= dt;
            var stumbleProgress = this.stumbleTimer / 0.3;
            this.playerGroup.rotation.x = stumbleProgress * 0.15;
            if (this.stumbleTimer <= 0) {
                this.playerGroup.rotation.x = 0;
            }
        }

        // Celebration animation
        if (this.celebrateTimer > 0) {
            this.celebrateTimer -= dt;
            if (this.limbs && this.limbs.rightArm) {
                var celebProgress = this.celebrateTimer / 0.3;
                var pumpAngle = celebProgress > 0.5
                    ? -1.2 * ((1.0 - celebProgress) / 0.5)
                    : -1.2 * (celebProgress / 0.5);
                this.limbs.rightArm.rotation.x = pumpAngle;
            }
            if (this.celebrateTimer <= 0 && this.limbs && this.limbs.rightArm) {
                this.limbs.rightArm.rotation.x = 0;
            }
        }

        // Running animation
        if (!this.jumping && !this.sliding && this.limbs && this.celebrateTimer <= 0) {
            this.legPhase += currentSpeed * rushMult * dt * 0.8;
            var sw = Math.sin(this.legPhase) * 0.45;
            if (this.limbs.leftLeg) {
                this.limbs.leftLeg.rotation.x = sw;
                this.limbs.rightLeg.rotation.x = -sw;
            }
            if (this.limbs.leftArm) {
                this.limbs.leftArm.rotation.x = -sw * 0.9;
                if (this.celebrateTimer <= 0) {
                    this.limbs.rightArm.rotation.x = sw * 0.9;
                }
            }
            if (this.limbs.cape) {
                this.limbs.cape.rotation.x = 0.15 + Math.sin(this.legPhase * 1.5) * 0.1;
            }
            this.playerGroup.position.y = this.playerY + Math.abs(Math.sin(this.legPhase)) * 0.06;
        }

        // Player shadow
        if (this.playerShadow) {
            this.playerShadow.position.x = this.playerGroup.position.x;
            this.playerShadow.position.z = this.playerGroup.position.z;
            var shadowScale = Math.max(0.3, 1.0 - this.playerY * 0.15);
            this.playerShadow.scale.set(shadowScale, shadowScale, shadowScale);
            this.playerShadow.material.opacity = 0.2 * shadowScale;
        }

        // Trail system
        if (this.trailSystem) {
            this.trailSystem.update(dt, this.playerGroup.position.x, this.playerGroup.position.y, this.playerGroup.position.z, this.streak);
        }

        // Power-up visual effects
        if (this.powerupFX) {
            var px = this.playerGroup.position.x;
            var py = this.playerGroup.position.y;
            var pz = this.playerGroup.position.z;
            this.powerupFX.update(dt, { x: px, y: py, z: pz }, this.powerups, this.rushStacks);
        }

        // Camera shake
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dt;
            var intensity = this.shakeTimer * 3;
            this.camera.position.x = this.cameraBasePos.x + (Math.random() - 0.5) * intensity;
            this.camera.position.y = this.cameraBasePos.y + (Math.random() - 0.5) * intensity * 0.5;
        } else {
            this.cameraLeanX = calculateCameraLean(this.cameraLeanX, this.targetLane, dt, this.cameraBasePos.x);
            this.camera.position.x = this.cameraLeanX;
            this.camera.position.y = this.cameraBasePos.y;
        }

        // FOV
        var streakVis = getStreakVisualIntensity(this.streak);
        var targetFOV = calculateTargetFOV(this.baseSpeed, currentSpeed * rushMult, this.baseFOV, this.baseFOV + 15 + streakVis.fovBoost, this.rushing);
        updateCameraFOV(this.camera, targetFOV, dt, 2.0);

        // Gates
        if (this.gatesActive) {
            this.gateZ += move;
            for (var gi = 0; gi < this.gateMeshes.length; gi++) {
                this.gateMeshes[gi].position.z = this.gateZ;
                var approachProgress = 1.0 - Math.max(0, -this.gateZ) / 60;
                var gateScale = 1.0 + approachProgress * 0.08;
                this.gateMeshes[gi].scale.set(gateScale, gateScale, gateScale);
                var frame = this.gateMeshes[gi].children[0];
                if (gi === this.currentLane) {
                    frame.material.opacity = 0.6 + approachProgress * 0.3;
                } else {
                    frame.material.opacity = 0.4 - approachProgress * 0.15;
                }
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

        // Coin spawning
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

        // Environment props
        this.envPropSpawnTimer -= dt;
        if (this.envPropSpawnTimer <= 0) {
            spawnEnvProp(this.scene, this.envPropMeshes, storage.get('selectedSubjects'));
            this.envPropSpawnTimer = 1.5 + Math.random() * 2;
        }
        for (var ei = this.envPropMeshes.length - 1; ei >= 0; ei--) {
            var ep = this.envPropMeshes[ei];
            ep.position.z += move * 0.7;
            ep.rotation.y += dt * 0.3;
            if (ep.position.z > 10) {
                removeAndDispose(this.scene, ep);
                this.envPropMeshes.splice(ei, 1);
            }
        }

        // ANIMATED TRACK ELEMENTS
        if (this.trackRefs) {
            if (this.trackRefs.runningLights) {
                updateRunningLights(this.trackRefs.runningLights, this.elapsedTime, currentSpeed * rushMult);
            }
            if (this.trackRefs.particlePool) {
                updateAtmosphericParticles(this.trackRefs.particlePool, this.trackRefs.particleStates, dt, move, this.elapsedTime);
            }
            if (this.trackRefs.scrollLines) {
                updateScrollLines(this.trackRefs.scrollLines, dt, move);
            }
            if (this.trackRefs.wallScrollPanels) {
                updateWallScrollPanels(this.trackRefs.wallScrollPanels, dt, move);
            }
            if (this.trackRefs.wallMarkers) {
                updateWallMarkers(this.trackRefs.wallMarkers, dt, move);
            }
            if (this.trackRefs.skyboxElements) {
                updateSkyboxElements(this.trackRefs.skyboxElements, dt, move, this.elapsedTime);
            }
        }

        // Speed lines
        var speedRatio = this.speed / this.baseSpeed;
        if (speedRatio > 1.3 || this.rushing) {
            this.speedLineTimer -= dt;
            if (this.speedLineTimer <= 0) {
                var lineLen = 2 + Math.random() * 4;
                var lineOpacity = 0.15 + (speedRatio - 1) * 0.1;
                if (this.rushing) lineOpacity = 0.3 + this.rushStacks * 0.1;
                var lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: Math.min(lineOpacity, 0.6) });
                var speedLine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, lineLen), lineMat);
                speedLine.position.set((Math.random() - 0.5) * 12, Math.random() * 6, -30 - Math.random() * 20);
                this.scene.add(speedLine);
                this.speedLines.push(speedLine);
                this.speedLineTimer = this.rushing ? 0.02 / Math.max(this.rushStacks, 1) : 0.1 / Math.max(speedRatio, 1);
            }
        }
        for (var sli = this.speedLines.length - 1; sli >= 0; sli--) {
            var sl = this.speedLines[sli];
            sl.position.z += move * 2.5;
            sl.material.opacity -= dt * 0.5;
            if (sl.position.z > 10 || sl.material.opacity <= 0) {
                sl.geometry.dispose();
                sl.material.dispose();
                this.scene.remove(sl);
                this.speedLines.splice(sli, 1);
            }
        }

        // Obstacles
        for (var oi = this.obstacleMeshes.length - 1; oi >= 0; oi--) {
            var ob = this.obstacleMeshes[oi];
            ob.position.z += move;
            if (ob.position.z > 2) {
                var od = ob.userData;
                if (od.lane === this.currentLane) {
                    var dodged = (od.type === 'high' && this.sliding) || (od.type === 'low' && this.jumping);

                    if (!dodged && !this.rushInvulnerable) {
                        if (this.powerups.shield > 0) {
                            this.powerups.shield = 0;
                            if (this.powerupFX) this.powerupFX.shatterShield(this.playerGroup.position);
                        } else {
                            this.lives--;
                            audio.play('wrong');
                            this.triggerShake();
                            this.stumbleTimer = 0.3;
                            if (this.lives <= 0 && this.mode !== 'study') {
                                var canCont = !this.continued && storage.get('coins') >= CONTINUE_COST;
                                if (canCont && this.onContinuePrompt) {
                                    this.running = false;
                                    this.onContinuePrompt(CONTINUE_COST);
                                } else {
                                    this.endRun();
                                }
                            }
                        }
                    }
                }
                removeAndDispose(this.scene, ob);
                this.obstacleMeshes.splice(oi, 1);
            }
        }

        // Coins, power-ups, and hearts
        for (var ci = this.coinMeshes.length - 1; ci >= 0; ci--) {
            var c = this.coinMeshes[ci];
            c.position.z += move;

            if (c.userData.type === 'coin') {
                c.rotation.y += dt * 3;
            } else if (c.userData.type === 'powerup') {
                c.rotation.y += dt * 2;
                c.position.y = 1.5 + Math.sin(this.elapsedTime * 3 + ci) * 0.3;
            } else if (c.userData.type === 'heart') {
                c.rotation.y += dt * 2;
                var heartPulse = 1.0 + Math.sin(this.elapsedTime * 4) * 0.15;
                c.scale.set(heartPulse, heartPulse, heartPulse);
                c.position.y = 1.5 + Math.sin(this.elapsedTime * 2 + ci) * 0.2;
            }

            if (c.position.z > 3) {
                removeAndDispose(this.scene, c);
                this.coinMeshes.splice(ci, 1);
                continue;
            }

            if (c.position.z > -3 && c.position.z < 2 && !c.userData.collected) {
                var inLane = c.userData.lane === this.currentLane;
                var magnetActive = this.powerups.magnet > 0;
                var closeEnough = Math.abs(LANE_X[this.currentLane] - c.position.x) < 1.8;

                if (magnetActive && !inLane && c.position.z > -5) {
                    var playerXPos = this.playerGroup.position.x;
                    c.position.x += (playerXPos - c.position.x) * dt * 5;
                }

                if (inLane || closeEnough || magnetActive) {
                    c.userData.collected = true;

                    if (c.userData.type === 'powerup') {
                        this.collectPowerup(c.userData.powerupType);
                    } else if (c.userData.type === 'heart') {
                        var maxLives = this.mode === 'study' ? 99 : 3;
                        if (this.lives < maxLives) {
                            this.lives++;
                        }
                        try { audio.play('heart'); } catch (e) { audio.play('powerup'); }
                    } else {
                        var coinValue = this.powerups.scoreFrenzy > 0 ? 5 : 1;
                        this.coins += coinValue;
                        this.runCoinsCollected += coinValue;
                        audio.play('coin', c.userData.lane);
                        if (this.runCoinsCollected <= 100) {
                            storage.incrementQuest('q_50coins');
                        }
                    }
                    removeAndDispose(this.scene, c);
                    this.coinMeshes.splice(ci, 1);
                }
            }
        }

        // Power-up timers
        var timedPowerups = ['double', 'magnet', 'scoreFrenzy'];
        for (var pk = 0; pk < timedPowerups.length; pk++) {
            var key = timedPowerups[pk];
            if (this.powerups[key] > 0) this.powerups[key] -= dt;
        }

        // Feedback timers
        if (this.feedbackTimer > 0) this.feedbackTimer -= dt;
        if (this.teachTimer > 0) this.teachTimer -= dt;

        // Speed progression
        if (this.mode !== 'study') {
            this.speed = Math.min(this.baseSpeed * 2.0, this.baseSpeed + this.encountersDone * 0.3);
        }
        audio.updateSpeedPitch(this.baseSpeed, this.speed);

        // HUD update
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
        if (this.runEnded) return;
        this.runEnded = true;

        this.running = false;
        this.paused = false;
        document.getElementById('pauseOverlay').classList.remove('active');
        document.getElementById('rushEl').classList.remove('show');

        this.camera.position.copy(this.cameraBasePos);
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();

        if (this.playerGroup) {
            this.playerGroup.rotation.z = 0;
            this.playerGroup.rotation.x = 0;
            this.playerGroup.scale.set(1, 1, 1);
        }

        if (this.powerupFX) this.powerupFX.hideAll();

        if (this.examMonster) {
            this.scene.remove(this.examMonster);
            this.examMonster = null;
            this.monsterParts = null;
        }

        this.isNewBest = this.score > storage.get('bestScore');

        storage.addCoins(this.coins);
        if (this.isNewBest) storage.set('bestScore', this.score);
        if (this.bestStreak > storage.get('bestStreak')) storage.set('bestStreak', this.bestStreak);

        if (this.mode === 'daily') {
            storage.set('dailyDone', true);
            var today = new Date().toDateString();
            var lastDaily = storage.get('lastDaily');
            if (lastDaily) {
                var yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                if (lastDaily === yesterday.toDateString()) {
                    storage.set('dailyStreak', storage.get('dailyStreak') + 1);
                } else if (lastDaily !== today) {
                    storage.set('dailyStreak', 1);
                }
            } else {
                storage.set('dailyStreak', 1);
            }
            storage.set('lastDaily', today);
            storage.incrementQuest('q_daily');
        }

        storage.incrementQuest('q_25enc', this.encountersDone);

        try {
            storage.addPlayTime && storage.addPlayTime(Math.round(this.elapsedTime));
            storage.addCardsStudied && storage.addCardsStudied(this.encountersDone);
        } catch (e) {}

        var newAchievements = [];

        if (this.wrong === 0 && this.correct >= 20) {
            if (storage.unlockAchievement('ach_golden_doctor')) {
                newAchievements.push('ach_golden_doctor');
            }
            if (!storage.ownsItem('avatar_golden')) {
                var owned = storage.get('ownedItems').slice();
                owned.push('avatar_golden');
                storage.set('ownedItems', owned);
            }
        }

        var runData = {
            score: this.score,
            perfect: this.wrong === 0 && this.correct > 0,
            speed: this.userSpeed
        };
        var moreAchievements = storage.checkAchievements(runData);
        for (var ai = 0; ai < moreAchievements.length; ai++) {
            newAchievements.push(moreAchievements[ai]);
        }

        if (newAchievements.length > 0 && this.onAchievementUnlocked) {
            this.onAchievementUnlocked(newAchievements);
        }

        this.cleanupObjects();

        if (this.onRunEnd) this.onRunEnd();
    }
}

export var game = new Game();
