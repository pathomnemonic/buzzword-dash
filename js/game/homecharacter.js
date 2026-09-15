/**
 * homecharacter.js — Fullscreen home scene with flying 3D medical props
 *
 * REDESIGNED: Instead of a small character preview box, this creates
 * a fullscreen 3D scene that renders into the main #gameContainer
 * canvas. The HTML screens float on top with transparent/glassmorphism
 * backgrounds, so the 3D scene is visible behind all menu screens.
 *
 * Features:
 * - Player character centered and facing camera with idle animations
 * - 14 flying medical props from props.js constantly drifting past
 * - Rich gradient skybox background (deep purple → blue → teal)
 * - Floating glowing particles for ambient motion
 * - Gentle camera sway for constant subtle movement
 * - Props recycle when they drift off-screen
 * - Performance: stops animation when game is running
 *
 * FIX: Head detach bug — all limb animations use absolute positioning
 * with stored base values, never accumulative += on position.
 *
 * VISIBILITY OVERHAUL:
 * - Prop count increased from 10 to 14
 * - Prop scale increased from 0.15-0.4 to 0.25-0.6
 * - Prop opacity increased from 0.5-0.8 to 0.7-0.95
 * - Fog density reduced from 0.025 to 0.015
 *
 * UPDATED: Added new gestures:
 * - GESTURE_STETHOSCOPE_LISTEN: puts hand to ear, leans forward
 * - GESTURE_JUMPING_JACKS: arms and legs spread rhythmically
 * - GESTURE_FLEXING: flexes both arms like bodybuilder
 * - GESTURE_LOOKING_AT_WATCH: looks at wrist impatiently
 * - GESTURE_THUMBS_UP: right arm extends forward
 *
 * Vehicle avatars skip humanoid animation (no limbs to animate).
 */

import * as THREE from 'three';
import { buildPlayer, getPlayerLimbs } from './player.js';
import { PROP_BUILDERS } from './props.js';

// ===== CONFIGURATION =====
var FLYING_PROP_COUNT = 14;
var AMBIENT_PARTICLE_COUNT = 30;
var PROP_SPEED_MIN = 0.5;
var PROP_SPEED_MAX = 1.5;
var PROP_SPAWN_X_RANGE = 14;
var PROP_SPAWN_Y_MIN = -2;
var PROP_SPAWN_Y_MAX = 6;
var PROP_SPAWN_Z_MIN = -20;
var PROP_SPAWN_Z_MAX = -5;
var PROP_RECYCLE_Z = 8;

// Gesture types for idle animation — expanded set
var GESTURE_NONE = 0;
var GESTURE_CLIPBOARD = 1;
var GESTURE_STETHOSCOPE = 2;
var GESTURE_HEAD_TILT = 3;
var GESTURE_WAVE = 4;
var GESTURE_STETHOSCOPE_LISTEN = 5;
var GESTURE_JUMPING_JACKS = 6;
var GESTURE_FLEXING = 7;
var GESTURE_LOOKING_AT_WATCH = 8;
var GESTURE_THUMBS_UP = 9;
var GESTURE_COUNT = 10;

export class HomeCharacter {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.character = null;
        this.limbs = null;
        this.animFrameId = null;
        this.time = 0;
        this.initialized = false;

        // Flying props
        this.flyingProps = [];

        // Ambient particles
        this.ambientParticles = [];

        // Gesture system
        this.currentGesture = GESTURE_NONE;
        this.gestureTimer = 0;
        this.gestureDuration = 0;
        this.gestureProgress = 0;
        this.gestureDelayTimer = 2.0;

        // Stored base positions for limbs (FIX for head detach bug)
        this._headBaseY = 0;
        this._headBaseX = 0;
        this._headBaseZ = 0;
        this._leftArmBaseX = 0;
        this._rightArmBaseX = 0;

        // Camera sway
        this._cameraBaseX = 0;
        this._cameraBaseY = 3.5;
        this._cameraBaseZ = 9;
    }

    /**
     * Initialize the home scene.
     * Uses the existing game renderer if provided, or creates its own.
     *
     * @param {THREE.WebGLRenderer} existingRenderer - The game's renderer from engine.js
     */
    init(existingRenderer) {
        if (this.initialized) {
            this.rebuildCharacter();
            return;
        }

        // Use the existing game renderer (renders into #gameContainer)
        if (existingRenderer) {
            this.renderer = existingRenderer;
        }

        // Create our own scene (separate from the game scene)
        this.scene = new THREE.Scene();

        // Rich gradient background — deep purple/blue
        this.scene.background = new THREE.Color(0x120828);

        // Fog for depth — reduced density for better prop visibility
        this.scene.fog = new THREE.FogExp2(0x120828, 0.015);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.set(this._cameraBaseX, this._cameraBaseY, this._cameraBaseZ);
        this.camera.lookAt(0, 1.2, 0);

        // ===== LIGHTING =====

        // Ambient — base illumination with purple tint
        var ambient = new THREE.AmbientLight(0x665588, 0.6);
        this.scene.add(ambient);

        // Hemisphere — sky purple, ground deep blue
        var hemi = new THREE.HemisphereLight(0x8866cc, 0x112244, 0.5);
        this.scene.add(hemi);

        // Key light — front-right, warm white
        var keyLight = new THREE.DirectionalLight(0xffeedd, 0.8);
        keyLight.position.set(5, 8, 10);
        this.scene.add(keyLight);

        // Fill light — front-left, cool blue
        var fillLight = new THREE.DirectionalLight(0x6688ff, 0.3);
        fillLight.position.set(-5, 4, 8);
        this.scene.add(fillLight);

        // Rim light — behind, cyan accent
        var rimLight = new THREE.DirectionalLight(0x00eeff, 0.25);
        rimLight.position.set(0, 5, -5);
        this.scene.add(rimLight);

        // ===== GROUND PLATFORM =====

        // Glowing circular platform beneath character
        var platformGeo = new THREE.CircleGeometry(2.0, 32);
        var platformMat = new THREE.MeshBasicMaterial({
            color: 0x1a0a40,
            transparent: true,
            opacity: 0.4
        });
        var platform = new THREE.Mesh(platformGeo, platformMat);
        platform.rotation.x = -Math.PI / 2;
        platform.position.y = -0.3;
        this.scene.add(platform);

        // Platform glow ring
        var ringGeo = new THREE.RingGeometry(1.9, 2.1, 48);
        var ringMat = new THREE.MeshBasicMaterial({
            color: 0xbb66ff,
            transparent: true,
            opacity: 0.15
        });
        var ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.29;
        this.scene.add(ring);

        // Second ring — cyan
        var ring2Geo = new THREE.RingGeometry(2.3, 2.4, 48);
        var ring2Mat = new THREE.MeshBasicMaterial({
            color: 0x00eeff,
            transparent: true,
            opacity: 0.08
        });
        var ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.rotation.x = -Math.PI / 2;
        ring2.position.y = -0.29;
        this.scene.add(ring2);

        // ===== BUILD CHARACTER =====
        this.rebuildCharacter();

        // ===== SPAWN FLYING PROPS =====
        this.spawnFlyingProps();

        // ===== SPAWN AMBIENT PARTICLES =====
        this.spawnAmbientParticles();

        // ===== BACKGROUND STARS / DOTS =====
        this.createBackgroundStars();

        // Handle window resize
        var self = this;
        this._resizeHandler = function () {
            if (self.camera && self.renderer) {
                self.camera.aspect = window.innerWidth / window.innerHeight;
                self.camera.updateProjectionMatrix();
            }
        };
        window.addEventListener('resize', this._resizeHandler);

        this.initialized = true;
    }

    /**
     * Rebuild the character mesh (call when equipment changes).
     */
    rebuildCharacter() {
        if (this.character && this.scene) {
            this.scene.remove(this.character);
            this.character.traverse(function (child) {
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

        this.character = buildPlayer();
        this.limbs = getPlayerLimbs(this.character);

        // Face toward camera
        this.character.rotation.y = Math.PI;

        this.scene.add(this.character);

        // ===== FIX: Store base positions for all animated limbs =====
        // This prevents the accumulative position.y += bug that caused
        // the head to float away into space
        if (this.limbs && this.limbs.head) {
            this._headBaseY = this.limbs.head.position.y;
            this._headBaseX = this.limbs.head.position.x;
            this._headBaseZ = this.limbs.head.position.z;
        }
        if (this.limbs && this.limbs.leftArm) {
            this._leftArmBaseX = this.limbs.leftArm.position.x;
        }
        if (this.limbs && this.limbs.rightArm) {
            this._rightArmBaseX = this.limbs.rightArm.position.x;
        }
    }

    /**
     * Spawn flying 3D medical props that drift across the scene.
     * Uses the same prop builders from props.js that the game uses.
     */
    spawnFlyingProps() {
        for (var i = 0; i < FLYING_PROP_COUNT; i++) {
            this._spawnOneProp(true);
        }
    }

    _spawnOneProp(randomizeZ) {
        var builderIndex = Math.floor(Math.random() * PROP_BUILDERS.length);
        var builder = PROP_BUILDERS[builderIndex];
        var prop = builder();

        // Random position spread around the scene
        var side = Math.random() > 0.5 ? 1 : -1;
        var x = side * (3 + Math.random() * PROP_SPAWN_X_RANGE * 0.5);
        var y = PROP_SPAWN_Y_MIN + Math.random() * (PROP_SPAWN_Y_MAX - PROP_SPAWN_Y_MIN);
        var z = randomizeZ
            ? PROP_SPAWN_Z_MIN + Math.random() * (PROP_SPAWN_Z_MAX - PROP_SPAWN_Z_MIN + PROP_RECYCLE_Z)
            : PROP_SPAWN_Z_MIN - Math.random() * 5;

        prop.position.set(x, y, z);

        // Random rotation
        prop.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 0.5
        );

        // Scale — increased for better visibility
        var scale = 0.25 + Math.random() * 0.35;
        prop.scale.set(scale, scale, scale);

        // Make semi-transparent — higher opacity for better visibility
        prop.traverse(function (child) {
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(function (m) {
                        m.transparent = true;
                        m.opacity = Math.min(m.opacity || 1, 0.7 + Math.random() * 0.25);
                    });
                } else {
                    child.material.transparent = true;
                    child.material.opacity = Math.min(child.material.opacity || 1, 0.7 + Math.random() * 0.25);
                }
            }
        });

        // Store movement data
        prop.userData = {
            speedZ: PROP_SPEED_MIN + Math.random() * (PROP_SPEED_MAX - PROP_SPEED_MIN),
            speedX: (Math.random() - 0.5) * 0.3,
            rotSpeedX: (Math.random() - 0.5) * 0.3,
            rotSpeedY: (Math.random() - 0.5) * 0.5,
            rotSpeedZ: (Math.random() - 0.5) * 0.2,
            bobPhase: Math.random() * Math.PI * 2,
            bobSpeed: 0.3 + Math.random() * 0.4,
            bobAmount: 0.1 + Math.random() * 0.2,
            baseY: y
        };

        this.scene.add(prop);
        this.flyingProps.push(prop);
    }

    /**
     * Spawn small glowing ambient particles that float around.
     */
    spawnAmbientParticles() {
        var colors = [0xbb66ff, 0x00eeff, 0xff44aa, 0xffcc00, 0x44aaff, 0x00ff88];

        for (var i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
            var color = colors[i % colors.length];
            var particle = new THREE.Mesh(
                new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 6, 6),
                new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.2 + Math.random() * 0.3
                })
            );

            particle.position.set(
                (Math.random() - 0.5) * 20,
                Math.random() * 8 - 1,
                (Math.random() - 0.5) * 25
            );

            particle.userData = {
                baseX: particle.position.x,
                baseY: particle.position.y,
                baseZ: particle.position.z,
                phaseX: Math.random() * Math.PI * 2,
                phaseY: Math.random() * Math.PI * 2,
                phaseZ: Math.random() * Math.PI * 2,
                speedX: 0.2 + Math.random() * 0.3,
                speedY: 0.3 + Math.random() * 0.4,
                speedZ: 0.1 + Math.random() * 0.2,
                driftX: 0.5 + Math.random() * 1.0,
                driftY: 0.3 + Math.random() * 0.5,
                driftZ: 0.4 + Math.random() * 0.8
            };

            this.scene.add(particle);
            this.ambientParticles.push(particle);
        }
    }

    /**
     * Create distant background dots for star field effect.
     */
    createBackgroundStars() {
        var starMat = new THREE.MeshBasicMaterial({
            color: 0xaaaaff,
            transparent: true,
            opacity: 0.15
        });

        for (var i = 0; i < 60; i++) {
            var star = new THREE.Mesh(
                new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 4, 4),
                starMat.clone()
            );

            // Spread far and wide
            star.position.set(
                (Math.random() - 0.5) * 40,
                Math.random() * 15 - 3,
                -10 - Math.random() * 30
            );

            star.material.opacity = 0.05 + Math.random() * 0.15;
            this.scene.add(star);
        }
    }

    /**
     * Start the animation loop.
     */
    startAnimation() {
        if (this.animFrameId) return;
        if (!this.initialized) return;

        var self = this;
        var lastTime = performance.now();

        function animate(now) {
            self.animFrameId = requestAnimationFrame(animate);

            var dt = (now - lastTime) / 1000;
            lastTime = now;
            if (dt > 0.1) dt = 0.016;

            self.time += dt;
            self.updateCharacterAnimation(dt);
            self.updateFlyingProps(dt);
            self.updateAmbientParticles(dt);
            self.updateCamera(dt);

            if (self.renderer && self.scene && self.camera) {
                self.renderer.render(self.scene, self.camera);
            }
        }

        this.animFrameId = requestAnimationFrame(animate);
    }

    /**
     * Stop the animation loop.
     */
    stopAnimation() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }

    /**
     * Update flying props — drift toward camera, rotate, bob, recycle.
     */
    updateFlyingProps(dt) {
        for (var i = 0; i < this.flyingProps.length; i++) {
            var prop = this.flyingProps[i];
            var d = prop.userData;

            // Move toward camera
            prop.position.z += d.speedZ * dt;
            prop.position.x += d.speedX * dt;

            // Gentle bob
            prop.position.y = d.baseY + Math.sin(this.time * d.bobSpeed + d.bobPhase) * d.bobAmount;

            // Rotate
            prop.rotation.x += d.rotSpeedX * dt;
            prop.rotation.y += d.rotSpeedY * dt;
            prop.rotation.z += d.rotSpeedZ * dt;

            // Recycle when past camera
            if (prop.position.z > PROP_RECYCLE_Z) {
                // Remove and replace with a new random prop
                this.scene.remove(prop);
                prop.traverse(function (child) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(function (m) { m.dispose(); });
                        } else {
                            child.material.dispose();
                        }
                    }
                });
                this.flyingProps.splice(i, 1);
                i--;

                // Spawn replacement
                this._spawnOneProp(false);
            }
        }
    }

    /**
     * Update ambient particles — drift and pulse.
     */
    updateAmbientParticles(dt) {
        for (var i = 0; i < this.ambientParticles.length; i++) {
            var p = this.ambientParticles[i];
            var d = p.userData;
            var t = this.time;

            p.position.x = d.baseX + Math.sin(t * d.speedX + d.phaseX) * d.driftX;
            p.position.y = d.baseY + Math.sin(t * d.speedY + d.phaseY) * d.driftY;
            p.position.z = d.baseZ + Math.sin(t * d.speedZ + d.phaseZ) * d.driftZ;

            // Pulse opacity
            p.material.opacity = 0.15 + Math.sin(t * 0.8 + i * 0.5) * 0.1;
        }
    }

    /**
     * Gentle camera sway for constant subtle movement.
     */
    updateCamera(dt) {
        if (!this.camera) return;
        var t = this.time;

        this.camera.position.x = this._cameraBaseX + Math.sin(t * 0.15) * 0.3;
        this.camera.position.y = this._cameraBaseY + Math.sin(t * 0.2) * 0.15;

        // Look at character with slight drift
        this.camera.lookAt(
            Math.sin(t * 0.1) * 0.1,
            1.2 + Math.sin(t * 0.25) * 0.05,
            0
        );
    }

    /**
     * Character idle animation with gesture system.
     * FIX: All position modifications use ABSOLUTE values with stored bases,
     * never accumulative += which caused the head to detach.
     *
     * Vehicle avatars are skipped entirely since they have no humanoid limbs.
     */
    updateCharacterAnimation(dt) {
        if (!this.character || !this.limbs) return;

        // Skip animation for vehicle avatars — they have no humanoid limbs
        if (this.limbs.isVehicle) return;

        var t = this.time;

        // ===== BASE IDLE LAYERS =====

        // Layer 1: Gentle breathing bounce
        var breathe = Math.sin(t * 1.3) * 0.012;
        this.character.position.y = breathe;

        // Layer 2: Subtle weight shift
        var sway = Math.sin(t * 0.6) * 0.006;
        this.character.position.x = sway;

        // Layer 3: Tiny forward-back lean
        var lean = Math.sin(t * 0.8) * 0.004;

        // Layer 4: Subtle rotation oscillation
        var rotOsc = Math.sin(t * 0.4) * 0.015;
        this.character.rotation.y = Math.PI + rotOsc;

        // ===== ARM IDLE SWAY =====
        var baseArmSwingL = Math.sin(t * 0.9) * 0.06;
        var baseArmSwingR = Math.sin(t * 1.1 + 0.5) * 0.06;

        // ===== LEG IDLE SWAY =====
        var baseLegSwingL = Math.sin(t * 0.7) * 0.03;
        var baseLegSwingR = Math.sin(t * 0.7 + Math.PI) * 0.03;

        // ===== HEAD IDLE BOB =====
        var headBob = Math.sin(t * 1.0) * 0.01;

        // ===== GESTURE SYSTEM =====
        var gestureArmL = 0;
        var gestureArmR = 0;
        var gestureHeadTiltZ = 0;
        var gestureHeadTiltX = 0;
        var gestureLeanX = 0;
        var gestureLegL = 0;
        var gestureLegR = 0;

        if (this.currentGesture === GESTURE_NONE) {
            this.gestureDelayTimer -= dt;
            if (this.gestureDelayTimer <= 0) {
                this.currentGesture = 1 + Math.floor(Math.random() * (GESTURE_COUNT - 1));
                this.gestureTimer = 0;

                switch (this.currentGesture) {
                    case GESTURE_CLIPBOARD: this.gestureDuration = 1.8; break;
                    case GESTURE_STETHOSCOPE: this.gestureDuration = 1.5; break;
                    case GESTURE_HEAD_TILT: this.gestureDuration = 1.2; break;
                    case GESTURE_WAVE: this.gestureDuration = 2.0; break;
                    case GESTURE_STETHOSCOPE_LISTEN: this.gestureDuration = 2.0; break;
                    case GESTURE_JUMPING_JACKS: this.gestureDuration = 2.5; break;
                    case GESTURE_FLEXING: this.gestureDuration = 2.0; break;
                    case GESTURE_LOOKING_AT_WATCH: this.gestureDuration = 1.8; break;
                    case GESTURE_THUMBS_UP: this.gestureDuration = 1.5; break;
                    default: this.gestureDuration = 1.5;
                }
            }
        } else {
            this.gestureTimer += dt;
            this.gestureProgress = Math.min(this.gestureTimer / this.gestureDuration, 1.0);

            // Bell curve for gesture intensity
            var bell = Math.sin(this.gestureProgress * Math.PI);

            switch (this.currentGesture) {
                case GESTURE_CLIPBOARD:
                    // Looking down at clipboard: both arms forward, head tilted down
                    gestureArmR = -0.8 * bell;
                    gestureArmL = -0.5 * bell;
                    gestureHeadTiltX = 0.12 * bell;
                    gestureLeanX = 0.04 * bell;
                    break;

                case GESTURE_STETHOSCOPE:
                    // Holding stethoscope: right arm forward to chest, slight head tilt
                    gestureArmR = -1.0 * bell;
                    gestureArmL = -0.2 * bell;
                    gestureHeadTiltZ = -0.08 * bell;
                    break;

                case GESTURE_HEAD_TILT:
                    // Curious head tilt side to side
                    var tiltPhase = this.gestureProgress * Math.PI * 2;
                    gestureHeadTiltZ = Math.sin(tiltPhase) * 0.15;
                    gestureArmR = 0.1 * bell;
                    break;

                case GESTURE_WAVE:
                    // Enthusiastic wave: right arm up with rapid back-and-forth
                    var wavePhase = this.gestureProgress * Math.PI * 6;
                    gestureArmR = -1.2 * bell + Math.sin(wavePhase) * 0.3 * bell;
                    gestureLeanX = -0.03 * bell;
                    break;

                case GESTURE_STETHOSCOPE_LISTEN:
                    // Hand to ear, lean forward as if listening carefully
                    gestureArmR = -1.3 * bell;
                    gestureHeadTiltZ = 0.1 * bell;
                    gestureLeanX = 0.08 * bell;
                    gestureHeadTiltX = 0.05 * bell;
                    break;

                case GESTURE_JUMPING_JACKS:
                    // Arms and legs spread rhythmically
                    var jjPhase = this.gestureProgress * Math.PI * 4;
                    var jjBell = Math.abs(Math.sin(jjPhase));
                    gestureArmL = -1.5 * jjBell;
                    gestureArmR = -1.5 * jjBell;
                    gestureLegL = -0.4 * jjBell;
                    gestureLegR = 0.4 * jjBell;
                    break;

                case GESTURE_FLEXING:
                    // Both arms up in flexing / bodybuilder pose
                    gestureArmL = -1.8 * bell;
                    gestureArmR = -1.8 * bell;
                    gestureLeanX = -0.02 * bell;
                    break;

                case GESTURE_LOOKING_AT_WATCH:
                    // Left arm up looking at wrist, head tilted down
                    gestureArmL = -1.0 * bell;
                    gestureHeadTiltX = 0.15 * bell;
                    gestureHeadTiltZ = -0.1 * bell;
                    // Slight impatient foot tap
                    gestureLegR = Math.sin(this.gestureProgress * Math.PI * 6) * 0.1 * bell;
                    break;

                case GESTURE_THUMBS_UP:
                    // Right arm extends forward with a thumbs up
                    gestureArmR = -1.4 * bell;
                    gestureLeanX = -0.03 * bell;
                    break;
            }

            if (this.gestureProgress >= 1.0) {
                this.currentGesture = GESTURE_NONE;
                this.gestureTimer = 0;
                this.gestureProgress = 0;
                this.gestureDelayTimer = 2.0 + Math.random() * 3.0;
            }
        }

        // ===== APPLY TO LIMBS (all absolute, never accumulative) =====

        if (this.limbs.leftArm) {
            this.limbs.leftArm.rotation.x = baseArmSwingL + gestureArmL;
        }
        if (this.limbs.rightArm) {
            this.limbs.rightArm.rotation.x = baseArmSwingR + gestureArmR;
        }
        if (this.limbs.leftLeg) {
            this.limbs.leftLeg.rotation.x = baseLegSwingL + gestureLegL;
        }
        if (this.limbs.rightLeg) {
            this.limbs.rightLeg.rotation.x = baseLegSwingR + gestureLegR;
        }

        // ===== HEAD — ABSOLUTE positioning (FIX for detach bug) =====
        if (this.limbs.head) {
            this.limbs.head.position.y = this._headBaseY + headBob;
            this.limbs.head.position.x = this._headBaseX;
            this.limbs.head.position.z = this._headBaseZ;
            this.limbs.head.rotation.z = gestureHeadTiltZ;
            this.limbs.head.rotation.x = gestureHeadTiltX;
        }

        // Apply gesture lean on top of base lean (absolute)
        this.character.rotation.x = lean + gestureLeanX;

        // ===== MOUTH ANIMATION =====
        if (this.limbs.mouth) {
            var smileScale = 1.0 + Math.sin(t * 0.5) * 0.05;
            this.limbs.mouth.scale.set(smileScale, smileScale, 1);
        }

        // ===== CAPE ANIMATION =====
        if (this.limbs.cape) {
            this.limbs.cape.rotation.x = 0.15 + Math.sin(t * 1.2) * 0.05;
        }

        // ===== COAT TAIL ANIMATION =====
        if (this.limbs.coatTail) {
            this.limbs.coatTail.rotation.x = 0.1 + Math.sin(t * 0.9) * 0.03;
        }
    }

    /**
     * Full cleanup — dispose all GPU resources.
     */
    dispose() {
        this.stopAnimation();

        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }

        if (this.scene) {
            // Dispose everything in the scene
            var toDispose = [];
            this.scene.traverse(function (child) {
                toDispose.push(child);
            });
            for (var i = 0; i < toDispose.length; i++) {
                var child = toDispose[i];
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(function (m) { m.dispose(); });
                    } else {
                        child.material.dispose();
                    }
                }
            }
        }

        this.character = null;
        this.limbs = null;
        this.flyingProps = [];
        this.ambientParticles = [];
        this.scene = null;
        this.camera = null;
        // Don't dispose renderer — it belongs to engine.js
        this.renderer = null;
        this.initialized = false;
    }
}
