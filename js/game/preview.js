/**
 * preview.js — Character preview renderer for the On-Call Locker
 *
 * Creates a separate Three.js renderer embedded in the shop screen
 * that shows the player character facing forward with all equipped
 * items visible. Supports drag-to-rotate and try-on preview.
 *
 * Uses its own scene, camera, and renderer completely independent
 * from the game scene — multiple Three.js renderers can coexist
 * on the same page without conflict.
 *
 * MAJOR UPDATE: AAA-quality gesture system with 15 gestures including:
 * - Medical themed: stethoscope listen, clipboard review, check watch
 * - Personality: enthusiastic wave, flexing, thumbs up, thinking pose
 * - Athletic: somersault, cartwheel, spin kick, celebratory jump
 * - Fun: air guitar, sneeze, dance move, yawn & stretch
 *
 * All gestures follow Disney's 12 Principles of Animation:
 * - Anticipation before every major action
 * - Follow-through and overlapping action on limbs
 * - Slow in / slow out via bell curves
 * - Secondary action (foot tapping, head bobbing)
 * - Exaggeration for personality
 * - Avoid twinning — arms never at exact same position
 *
 * Users can click/tap the character to trigger a random gesture immediately.
 *
 * Vehicle avatars skip gestures since they have no humanoid limbs.
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { buildPlayer, getPlayerLimbs } from './player.js';

// Gesture constants
var GESTURE_NONE = 0;
var GESTURE_WAVE = 1;
var GESTURE_STETHOSCOPE = 2;
var GESTURE_JUMPING_JACKS = 3;
var GESTURE_FLEXING = 4;
var GESTURE_CHECK_WATCH = 5;
var GESTURE_THUMBS_UP = 6;
var GESTURE_SOMERSAULT = 7;
var GESTURE_CARTWHEEL = 8;
var GESTURE_SPIN_KICK = 9;
var GESTURE_CELEBRATORY_JUMP = 10;
var GESTURE_AIR_GUITAR = 11;
var GESTURE_SNEEZE = 12;
var GESTURE_DANCE_MOVE = 13;
var GESTURE_THINKING_POSE = 14;
var GESTURE_YAWN_STRETCH = 15;
var GESTURE_COUNT = 16; // total including NONE

export class CharacterPreview {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.character = null;
        this.container = null;
        this.animFrameId = null;
        this.time = 0;
        this.initialized = false;

        // Rotation state for drag interaction
        this.rotationY = Math.PI;
        this.targetRotationY = Math.PI;
        this.isDragging = false;
        this.lastPointerX = 0;

        // Temporary preview overrides for try-on
        this.previewOverrides = null;

        // Limbs reference for gesture animation
        this.limbs = null;

        // Gesture system state
        this.currentGesture = GESTURE_NONE;
        this.gestureTimer = 0;
        this.gestureDuration = 0;
        this.gestureProgress = 0;
        this.gestureDelayTimer = 2.5;

        // Track which gestures have played recently to avoid repeats
        this._recentGestures = [];

        // Base positions for absolute animation (prevents drift)
        this._headBaseY = 0;
        this._headBaseX = 0;
        this._headBaseZ = 0;
        this._leftArmBaseX = 0;
        this._rightArmBaseX = 0;

        // Whether user triggered the current gesture via click
        this._userTriggered = false;
    }

    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // Scene with dark background matching the app theme
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0e27);

        // Camera positioned to see full character from front
        this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
        this.camera.position.set(0, 1.2, 4);
        this.camera.lookAt(0, 0.9, 0);

        // Renderer with transparency support
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setClearColor(0x0a0e27, 1);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.resize();

        // Lighting — bright and flattering for character preview
        var keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(3, 4, 5);
        this.scene.add(keyLight);

        var fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
        fillLight.position.set(-3, 2, 4);
        this.scene.add(fillLight);

        var rimLight = new THREE.DirectionalLight(0x4488ff, 0.3);
        rimLight.position.set(0, 3, -3);
        this.scene.add(rimLight);

        var ambient = new THREE.AmbientLight(0x666688, 0.5);
        this.scene.add(ambient);

        // Small ground disc for grounding the character
        var groundDisc = new THREE.Mesh(
            new THREE.CircleGeometry(1.2, 24),
            new THREE.MeshBasicMaterial({ color: 0x111428, transparent: true, opacity: 0.6 })
        );
        groundDisc.rotation.x = -Math.PI / 2;
        groundDisc.position.y = -0.2;
        this.scene.add(groundDisc);

        // Ground ring for visual definition
        var groundRing = new THREE.Mesh(
            new THREE.RingGeometry(1.15, 1.25, 32),
            new THREE.MeshBasicMaterial({ color: 0x18ffff, transparent: true, opacity: 0.15 })
        );
        groundRing.rotation.x = -Math.PI / 2;
        groundRing.position.y = -0.19;
        this.scene.add(groundRing);

        // Build the character
        this.rebuildCharacter();

        // Set up drag-to-rotate and click-to-gesture interaction
        this.setupInteraction();

        this.initialized = true;
    }

    resize() {
        if (!this.container || !this.renderer) return;
        var w = this.container.clientWidth;
        var h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    rebuildCharacter() {
        // Remove old character
        if (this.character) {
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

        // If we have preview overrides, temporarily swap storage values
        var originalEquipped = null;
        if (this.previewOverrides) {
            originalEquipped = JSON.parse(JSON.stringify(storage.get('equipped')));
            var eq = storage.get('equipped');
            for (var key in this.previewOverrides) {
                if (this.previewOverrides[key] !== null && this.previewOverrides[key] !== undefined) {
                    eq[key] = this.previewOverrides[key];
                }
            }
            storage.set('equipped', eq);
        }

        // Build the player using the same function as the game
        this.character = buildPlayer();

        // Restore original equipped if we swapped
        if (originalEquipped) {
            storage.set('equipped', originalEquipped);
        }

        // Get limb references for gesture animation
        this.limbs = getPlayerLimbs(this.character);

        // Store base limb positions for absolute animation (prevents drift)
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

        // Reset gesture state on rebuild
        this.currentGesture = GESTURE_NONE;
        this.gestureTimer = 0;
        this.gestureProgress = 0;
        this.gestureDelayTimer = 1.5 + Math.random() * 2.0;
        this._recentGestures = [];

        // Face the character toward the camera
        this.character.rotation.y = this.rotationY;

        this.scene.add(this.character);
    }

    setupInteraction() {
        var self = this;
        var canvas = this.renderer.domElement;
        var dragDistance = 0;
        var pointerStartX = 0;
        var pointerStartY = 0;

        // Pointer down — start drag
        canvas.addEventListener('pointerdown', function (e) {
            self.isDragging = true;
            self.lastPointerX = e.clientX;
            pointerStartX = e.clientX;
            pointerStartY = e.clientY;
            dragDistance = 0;
            canvas.setPointerCapture(e.pointerId);
        });

        // Pointer move — rotate character while dragging
        canvas.addEventListener('pointermove', function (e) {
            if (!self.isDragging) return;
            var deltaX = e.clientX - self.lastPointerX;
            self.targetRotationY += deltaX * 0.01;
            self.lastPointerX = e.clientX;
            dragDistance += Math.abs(e.clientX - pointerStartX) + Math.abs(e.clientY - pointerStartY);
        });

        // Pointer up — stop drag, check for click (tap)
        canvas.addEventListener('pointerup', function (e) {
            self.isDragging = false;
            canvas.releasePointerCapture(e.pointerId);

            // If the pointer barely moved, treat it as a click → trigger gesture
            if (dragDistance < 10) {
                self.triggerRandomGesture();
            }
        });

        // Pointer leave — stop drag
        canvas.addEventListener('pointerleave', function () {
            self.isDragging = false;
        });

        // Prevent context menu on long press
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    /**
     * Trigger a random gesture immediately (called on user click/tap).
     * Picks from the full pool but avoids repeating the last 3 gestures.
     */
    triggerRandomGesture() {
        if (!this.limbs || this.limbs.isVehicle) return;

        // If already in a gesture, let it finish first
        if (this.currentGesture !== GESTURE_NONE) return;

        var available = [];
        for (var g = 1; g < GESTURE_COUNT; g++) {
            if (this._recentGestures.indexOf(g) < 0) {
                available.push(g);
            }
        }
        if (available.length === 0) {
            // All gestures played recently, reset
            this._recentGestures = [];
            available = [];
            for (var g2 = 1; g2 < GESTURE_COUNT; g2++) available.push(g2);
        }

        var chosen = available[Math.floor(Math.random() * available.length)];
        this._recentGestures.push(chosen);
        if (this._recentGestures.length > 5) this._recentGestures.shift();

        this.currentGesture = chosen;
        this.gestureTimer = 0;
        this.gestureProgress = 0;
        this._userTriggered = true;
        this._setGestureDuration(chosen);
    }

    /**
     * Set the duration for a gesture.
     */
    _setGestureDuration(gesture) {
        switch (gesture) {
            case GESTURE_WAVE: this.gestureDuration = 2.2; break;
            case GESTURE_STETHOSCOPE: this.gestureDuration = 2.0; break;
            case GESTURE_JUMPING_JACKS: this.gestureDuration = 2.8; break;
            case GESTURE_FLEXING: this.gestureDuration = 2.2; break;
            case GESTURE_CHECK_WATCH: this.gestureDuration = 2.0; break;
            case GESTURE_THUMBS_UP: this.gestureDuration = 1.6; break;
            case GESTURE_SOMERSAULT: this.gestureDuration = 2.0; break;
            case GESTURE_CARTWHEEL: this.gestureDuration = 1.8; break;
            case GESTURE_SPIN_KICK: this.gestureDuration = 1.6; break;
            case GESTURE_CELEBRATORY_JUMP: this.gestureDuration = 1.8; break;
            case GESTURE_AIR_GUITAR: this.gestureDuration = 2.5; break;
            case GESTURE_SNEEZE: this.gestureDuration = 1.5; break;
            case GESTURE_DANCE_MOVE: this.gestureDuration = 2.8; break;
            case GESTURE_THINKING_POSE: this.gestureDuration = 2.2; break;
            case GESTURE_YAWN_STRETCH: this.gestureDuration = 2.5; break;
            default: this.gestureDuration = 1.8;
        }
    }

    /**
     * Preview a specific item without buying it.
     */
    previewItem(itemId, slot) {
        if (!this.previewOverrides) {
            this.previewOverrides = {};
        }
        this.previewOverrides[slot] = itemId;
        this.rebuildCharacter();
    }

    /**
     * Clear all preview overrides and show currently equipped items.
     */
    clearPreview() {
        this.previewOverrides = null;
        this.rebuildCharacter();
    }

    /**
     * Start the preview animation loop.
     */
    startAnimation() {
        if (this.animFrameId) return;
        var self = this;
        var lastTime = performance.now();

        function animate(now) {
            self.animFrameId = requestAnimationFrame(animate);

            var dt = (now - lastTime) / 1000;
            lastTime = now;
            if (dt > 0.1) dt = 0.016;

            self.time += dt;

            if (!self.character) return;

            // Smooth rotation toward target
            var rotDiff = self.targetRotationY - self.rotationY;
            self.rotationY += rotDiff * 0.1;

            // Run the gesture-based idle animation
            self.updateIdleAnimation(dt);

            // Render
            self.renderer.render(self.scene, self.camera);
        }

        animate(performance.now());
    }

    /**
     * Utility: ease functions
     */
    _easeOutQuad(t) { return t * (2 - t); }
    _easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    /**
     * Idle animation with AAA-quality gesture system.
     *
     * KEY CONVENTION (matching homecharacter.js):
     * Arms: NEGATIVE rotation.x = forward/upward (toward camera)
     *        POSITIVE rotation.x = backward (behind character)
     * Legs: POSITIVE rotation.x = forward kick
     *        NEGATIVE rotation.x = backward
     * Head tilt: rotation.z = side tilt, rotation.x = up/down nod
     * Character lean: positive rotation.x = forward lean
     */
    updateIdleAnimation(dt) {
        if (!this.character) return;

        var t = this.time;

        // Base idle layers (always active)
        var breathe = Math.sin(t * 1.2) * 0.015;
        var sway = Math.sin(t * 0.7) * 0.008;
        var lean = Math.sin(t * 0.9) * 0.003;

        // Subtle rotation oscillation (like homecharacter.js)
        var rotOsc = Math.sin(t * 0.4) * 0.015;

        // Skip gestures for vehicles
        if (!this.limbs || this.limbs.isVehicle) {
            this.character.position.y = breathe;
            this.character.position.x = sway;
            this.character.rotation.x = lean;
            this.character.rotation.y = this.rotationY + rotOsc;
            return;
        }

        // Gesture output variables — all default to 0
        var gArmL = 0, gArmR = 0;
        var gHeadZ = 0, gHeadX = 0;
        var gLeanX = 0;
        var gLegL = 0, gLegR = 0;
        var gBodyRotX = 0, gBodyRotZ = 0;
        var gBodyPosY = 0;
        var gBodyRotYaw = 0;

        // Base arm/leg sway (subtle, always active, asymmetric to avoid twinning)
        var baseArmL = Math.sin(t * 0.9) * 0.06;
        var baseArmR = Math.sin(t * 1.1 + 0.5) * 0.06;
        var baseLegL = Math.sin(t * 0.7) * 0.03;
        var baseLegR = Math.sin(t * 0.7 + Math.PI) * 0.03;

        if (this.currentGesture === GESTURE_NONE) {
            // No active gesture — count down delay
            this.gestureDelayTimer -= dt;
            if (this.gestureDelayTimer <= 0) {
                // Pick random gesture, avoiding recent ones
                var available = [];
                for (var g = 1; g < GESTURE_COUNT; g++) {
                    if (this._recentGestures.indexOf(g) < 0) available.push(g);
                }
                if (available.length === 0) {
                    this._recentGestures = [];
                    for (var g2 = 1; g2 < GESTURE_COUNT; g2++) available.push(g2);
                }
                var chosen = available[Math.floor(Math.random() * available.length)];
                this._recentGestures.push(chosen);
                if (this._recentGestures.length > 5) this._recentGestures.shift();

                this.currentGesture = chosen;
                this.gestureTimer = 0;
                this._userTriggered = false;
                this._setGestureDuration(chosen);
            }
        } else {
            this.gestureTimer += dt;
            this.gestureProgress = Math.min(this.gestureTimer / this.gestureDuration, 1.0);

            // bell = smooth rise and fall (0→1→0)
            var bell = Math.sin(this.gestureProgress * Math.PI);
            // p = raw progress 0→1
            var p = this.gestureProgress;

            switch (this.currentGesture) {

                case GESTURE_WAVE: {
                    // Enthusiastic wave — right arm up with rapid oscillation
                    // Anticipation: slight body lean away first
                    var wavePhase = p * Math.PI * 8; // fast oscillation
                    gArmR = -1.4 * bell + Math.sin(wavePhase) * 0.35 * bell;
                    // Left arm goes to hip (slight forward)
                    gArmL = -0.2 * bell;
                    gHeadZ = -0.1 * bell; // tilt toward waving side
                    gLeanX = -0.04 * bell; // lean back slightly
                    // Secondary: slight weight shift
                    gLegR = -0.08 * bell;
                    break;
                }

                case GESTURE_STETHOSCOPE: {
                    // Stethoscope listen — right arm forward to chest, lean in
                    gArmR = -1.3 * bell;
                    gArmL = -0.4 * bell; // other hand assists
                    gHeadZ = 0.12 * bell;
                    gHeadX = 0.06 * bell; // nod down as if concentrating
                    gLeanX = 0.1 * bell; // lean forward
                    // Secondary: slight nod after peak
                    if (p > 0.5) {
                        gHeadX += Math.sin((p - 0.5) * Math.PI * 4) * 0.05 * (1 - p);
                    }
                    break;
                }

                case GESTURE_JUMPING_JACKS: {
                    // Jumping jacks — multi-cycle arms up + legs spread
                    var jjPhase = p * Math.PI * 5; // 2.5 full jacks
                    var jjBell = Math.abs(Math.sin(jjPhase));
                    gArmL = -2.0 * jjBell; // arms go UP (negative = forward/up)
                    gArmR = -2.0 * jjBell;
                    gLegL = -0.4 * jjBell; // legs spread
                    gLegR = 0.4 * jjBell;
                    // Bounce: character jumps on each jack
                    gBodyPosY = jjBell * 0.12;
                    // Head bobs with the rhythm
                    gHeadX = -0.05 * jjBell;
                    break;
                }

                case GESTURE_FLEXING: {
                    // Flexing / bodybuilder pose
                    // Anticipation phase 0-0.2: crouch slightly
                    if (p < 0.2) {
                        var crouchP = p / 0.2;
                        gLeanX = 0.04 * crouchP;
                        gBodyPosY = -0.03 * crouchP;
                    } else {
                        var flexP = (p - 0.2) / 0.8;
                        var flexBell = Math.sin(flexP * Math.PI);
                        // Arms up in double bicep pose (asymmetric timing)
                        gArmL = -1.9 * flexBell;
                        gArmR = -1.7 * Math.sin(Math.min(1, flexP * 1.15) * Math.PI);
                        gLeanX = -0.05 * flexBell; // lean back showing off
                        gBodyPosY = 0.04 * flexBell; // chest puffs out slightly
                        // Secondary: slight bounce at peak
                        if (flexP > 0.3 && flexP < 0.7) {
                            gBodyPosY += Math.sin(flexP * Math.PI * 6) * 0.02;
                        }
                        gHeadX = -0.06 * flexBell; // look up proudly
                    }
                    break;
                }

                case GESTURE_CHECK_WATCH: {
                    // Looking at watch — left arm up, impatient foot tap
                    gArmL = -1.1 * bell;
                    gHeadX = 0.18 * bell; // look down at wrist
                    gHeadZ = -0.12 * bell; // tilt toward watch arm
                    // Impatient foot tap — rapid, rhythmic
                    gLegR = Math.sin(p * Math.PI * 10) * 0.15 * bell;
                    // Right arm crosses slightly
                    gArmR = -0.3 * bell;
                    // Secondary: head shake of impatience near end
                    if (p > 0.6) {
                        gHeadZ += Math.sin((p - 0.6) * Math.PI * 6) * 0.08 * (1 - p);
                    }
                    break;
                }

                case GESTURE_THUMBS_UP: {
                    // Thumbs up — right arm extends forward with enthusiasm
                    // Quick anticipation, then snap into pose
                    var thumbT = p < 0.15 ? 0 : Math.sin(((p - 0.15) / 0.85) * Math.PI);
                    gArmR = -1.5 * thumbT;
                    gHeadZ = -0.06 * thumbT;
                    gLeanX = -0.04 * thumbT;
                    // Secondary: slight bounce at the snap point
                    if (p > 0.15 && p < 0.35) {
                        gBodyPosY = 0.03 * Math.sin(((p - 0.15) / 0.2) * Math.PI);
                    }
                    break;
                }

                case GESTURE_SOMERSAULT: {
                    // Forward somersault — crouch → launch → tuck → land
                    if (p < 0.15) {
                        // Crouch: anticipation
                        var cr = p / 0.15;
                        gLegL = 0.5 * cr;
                        gLegR = 0.5 * cr;
                        gArmL = -0.3 * cr;
                        gArmR = -0.3 * cr;
                        gBodyPosY = -0.15 * cr;
                        gLeanX = 0.1 * cr;
                    } else if (p < 0.3) {
                        // Launch upward
                        var launchP = (p - 0.15) / 0.15;
                        gBodyPosY = -0.15 + 0.65 * launchP;
                        gArmL = -0.3 - 1.5 * launchP;
                        gArmR = -0.3 - 1.5 * launchP;
                        gBodyRotX = launchP * Math.PI * 0.3;
                    } else if (p < 0.8) {
                        // Airborne: tuck + full forward rotation
                        var airP = (p - 0.3) / 0.5;
                        var height = Math.sin(airP * Math.PI);
                        gBodyPosY = 0.50 + height * 0.55;
                        gBodyRotX = Math.PI * 0.3 + airP * Math.PI * 1.7;
                        // Tuck
                        var tuck = Math.sin(airP * Math.PI);
                        gLegL = 1.5 * tuck;
                        gLegR = 1.5 * tuck;
                        gArmL = -1.8 + 1.0 * tuck;
                        gArmR = -1.8 + 1.0 * tuck;
                    } else {
                        // Landing: follow-through
                        var landP = (p - 0.8) / 0.2;
                        var easeOut = 1 - (1 - landP) * (1 - landP);
                        gBodyPosY = 0.50 * (1 - easeOut);
                        gBodyRotX = Math.PI * 2.0 * (1 - easeOut * easeOut);
                        gLegL = 0.3 * (1 - easeOut);
                        gLegR = 0.3 * (1 - easeOut);
                        gArmL = -0.8 * (1 - easeOut);
                        gArmR = -0.8 * (1 - easeOut);
                    }
                    break;
                }

                case GESTURE_CARTWHEEL: {
                    // Sideways cartwheel — wind up → 360° Z rotation → land
                    if (p < 0.2) {
                        var windP = p / 0.2;
                        gArmL = -2.0 * windP;
                        gArmR = -2.0 * windP;
                        gBodyRotZ = -0.2 * windP;
                        gBodyPosY = 0.05 * windP;
                    } else if (p < 0.8) {
                        var cartP = (p - 0.2) / 0.6;
                        var cartHeight = Math.sin(cartP * Math.PI);
                        gBodyPosY = 0.05 + cartHeight * 0.65;
                        gBodyRotZ = -0.2 + (-Math.PI * 2 + 0.2) * cartP;
                        gArmL = -2.0;
                        gArmR = -2.0;
                        // Legs spread in V during rotation
                        var legSpread = Math.sin(cartP * Math.PI);
                        gLegL = -0.8 * legSpread;
                        gLegR = 0.8 * legSpread;
                    } else {
                        var cLandP = (p - 0.8) / 0.2;
                        var cEase = cLandP * cLandP * cLandP;
                        gBodyPosY = 0.05 * (1 - cLandP);
                        gBodyRotZ = -Math.PI * 2 * (1 - cEase);
                        gArmL = -2.0 * (1 - cLandP);
                        gArmR = -2.0 * (1 - cLandP);
                    }
                    break;
                }

                case GESTURE_SPIN_KICK: {
                    // 360° yaw spin with leg extended
                    if (p < 0.15) {
                        var skW = p / 0.15;
                        gArmL = -0.5 * skW;
                        gArmR = 0.3 * skW; // wind back
                        gLeanX = 0.05 * skW;
                        gBodyPosY = 0.05 * skW;
                    } else if (p < 0.7) {
                        var spinP = (p - 0.15) / 0.55;
                        gBodyRotYaw = spinP * Math.PI * 2;
                        gBodyPosY = 0.05 + Math.sin(spinP * Math.PI) * 0.4;
                        gLegR = 1.5 * Math.sin(spinP * Math.PI); // kick extends
                        gLegL = 0.3;
                        gArmL = -1.0 * Math.sin(spinP * Math.PI);
                        gArmR = -0.8 * Math.sin(spinP * Math.PI + Math.PI * 0.5);
                        gLeanX = 0.12 * Math.sin(spinP * Math.PI);
                    } else {
                        var skLandP = (p - 0.7) / 0.3;
                        var skEase = 1 - (1 - skLandP) * (1 - skLandP);
                        gBodyRotYaw = Math.PI * 2 * (1 - skEase);
                        gBodyPosY = 0.05 * (1 - skLandP);
                        gArmL = -0.3 * (1 - skLandP);
                        gArmR = -0.3 * (1 - skLandP);
                    }
                    break;
                }

                case GESTURE_CELEBRATORY_JUMP: {
                    // Jump with fist pump and hang time
                    if (p < 0.18) {
                        // Crouch: anticipation
                        var cCr = p / 0.18;
                        gBodyPosY = -0.14 * cCr;
                        gLegL = 0.4 * cCr;
                        gLegR = 0.4 * cCr;
                        gArmL = 0.3 * cCr; // arms swing back (positive = behind)
                        gArmR = 0.3 * cCr;
                    } else if (p < 0.45) {
                        // Launch + arms punch up
                        var cJumpP = (p - 0.18) / 0.27;
                        gBodyPosY = -0.14 + 0.7 * cJumpP;
                        gArmL = 0.3 - 2.8 * cJumpP; // arms swing forward and UP (negative)
                        gArmR = 0.3 - 2.6 * cJumpP; // slight asymmetry
                        gLegL = 0.4 * (1 - cJumpP);
                        gLegR = 0.4 * (1 - cJumpP);
                    } else if (p < 0.68) {
                        // Hang time at peak with fist pump oscillation
                        var peakP = (p - 0.45) / 0.23;
                        gBodyPosY = 0.56;
                        gArmR = -2.3 + Math.sin(peakP * Math.PI * 5) * 0.45;
                        gArmL = -1.6 + Math.sin(peakP * Math.PI * 3.5) * 0.3;
                        // Legs kick out at peak
                        gLegL = -0.35 * Math.sin(peakP * Math.PI);
                        gLegR = 0.35 * Math.sin(peakP * Math.PI);
                        gHeadX = -0.15; // look up
                    } else {
                        // Landing: ease out
                        var ceLandP = (p - 0.68) / 0.32;
                        var ceEase = 1 - (1 - ceLandP) * (1 - ceLandP);
                        gBodyPosY = 0.56 * (1 - ceEase);
                        gArmL = -1.6 * (1 - ceEase);
                        gArmR = -2.3 * (1 - ceEase);
                        gHeadX = -0.15 * (1 - ceEase);
                        // Landing impact: slight knee bend
                        if (ceLandP < 0.3) {
                            gBodyPosY -= 0.06 * Math.sin((ceLandP / 0.3) * Math.PI);
                        }
                    }
                    break;
                }

                case GESTURE_AIR_GUITAR: {
                    // Air guitar — one arm strums, other holds neck, body rocks
                    var rockPhase = p * Math.PI * 6;
                    // Right arm strums low (windmill motion)
                    gArmR = -0.6 * bell + Math.sin(rockPhase) * 0.8 * bell;
                    // Left arm holds neck up high
                    gArmL = -1.6 * bell;
                    // Body rocks back and forth
                    gLeanX = Math.sin(rockPhase * 0.5) * 0.08 * bell;
                    // Legs spread for power stance
                    gLegL = -0.2 * bell;
                    gLegR = 0.2 * bell;
                    // Head bobs with the rhythm
                    gHeadX = Math.sin(rockPhase) * 0.12 * bell;
                    gHeadZ = Math.sin(rockPhase * 0.5) * 0.06 * bell;
                    // Slight bounce
                    gBodyPosY = Math.abs(Math.sin(rockPhase * 0.5)) * 0.04 * bell;
                    break;
                }

                case GESTURE_SNEEZE: {
                    // Sneeze: head tilts back → violent forward snap → recovery
                    if (p < 0.35) {
                        // Anticipation: head tilts back, arms come up
                        var sneezeAnticip = p / 0.35;
                        gHeadX = -0.25 * sneezeAnticip; // look up
                        gArmL = -0.4 * sneezeAnticip;
                        gArmR = -0.4 * sneezeAnticip;
                        gLeanX = -0.06 * sneezeAnticip; // lean back
                    } else if (p < 0.5) {
                        // SNAP forward
                        var snapP = (p - 0.35) / 0.15;
                        gHeadX = -0.25 + 0.5 * snapP; // violent forward snap
                        gArmL = -0.4 - 0.6 * snapP; // arms jolt forward
                        gArmR = -0.4 - 0.6 * snapP;
                        gLeanX = -0.06 + 0.2 * snapP; // body lurches forward
                        gBodyPosY = -0.08 * snapP; // compress downward
                        gLegL = 0.15 * snapP;
                        gLegR = 0.15 * snapP;
                    } else {
                        // Recovery: rebound and straighten
                        var recoverP = (p - 0.5) / 0.5;
                        var recEase = 1 - (1 - recoverP) * (1 - recoverP);
                        gHeadX = 0.25 * (1 - recEase);
                        gArmL = (-1.0 + 0.3 * Math.sin(recoverP * Math.PI * 2)) * (1 - recEase);
                        gArmR = (-1.0) * (1 - recEase);
                        gLeanX = 0.14 * (1 - recEase);
                        gBodyPosY = -0.08 * (1 - recEase);
                        // Wipe nose with forearm
                        if (recoverP > 0.4 && recoverP < 0.8) {
                            gArmR = -0.8 * (1 - recEase);
                        }
                    }
                    break;
                }

                case GESTURE_DANCE_MOVE: {
                    // Dance: weight shifts, arm pumps, hip sway, head bob
                    var dancePhase = p * Math.PI * 5;
                    var danceBell = bell;
                    // Arms pump alternately
                    gArmL = (-0.5 + Math.sin(dancePhase) * 0.9) * danceBell;
                    gArmR = (-0.5 + Math.sin(dancePhase + Math.PI) * 0.9) * danceBell;
                    // Legs shift weight side to side
                    gLegL = Math.sin(dancePhase * 0.5) * 0.25 * danceBell;
                    gLegR = Math.sin(dancePhase * 0.5 + Math.PI) * 0.25 * danceBell;
                    // Head bobs
                    gHeadX = Math.sin(dancePhase) * 0.08 * danceBell;
                    gHeadZ = Math.sin(dancePhase * 0.5) * 0.1 * danceBell;
                    // Body sways
                    gLeanX = Math.sin(dancePhase * 0.5) * 0.06 * danceBell;
                    // Bounce
                    gBodyPosY = Math.abs(Math.sin(dancePhase)) * 0.06 * danceBell;
                    // Finish with a small spin
                    if (p > 0.85) {
                        gBodyRotYaw = ((p - 0.85) / 0.15) * Math.PI * 2 * (1 - ((p - 0.85) / 0.15));
                    }
                    break;
                }

                case GESTURE_THINKING_POSE: {
                    // Thinking: hand to chin, weight shift, eureka moment
                    if (p < 0.65) {
                        // Think phase
                        var thinkP = Math.sin((p / 0.65) * Math.PI);
                        gArmR = -1.1 * thinkP; // hand to chin
                        gArmL = -0.4 * thinkP; // arm crosses body
                        gHeadZ = 0.08 * thinkP; // slight tilt
                        gHeadX = 0.06 * thinkP; // look slightly down
                        gLegL = -0.12 * thinkP; // weight shift
                        gLeanX = 0.03 * thinkP;
                        // Look around while thinking
                        gHeadZ += Math.sin(p * Math.PI * 3) * 0.05 * thinkP;
                    } else {
                        // Eureka! Snap fingers, point forward
                        var eurekaP = (p - 0.65) / 0.35;
                        var eurekaBell = Math.sin(eurekaP * Math.PI);
                        gArmR = -1.6 * eurekaBell; // point forward
                        gArmL = -0.2 * eurekaBell;
                        gHeadX = -0.1 * eurekaBell; // look up
                        gBodyPosY = 0.05 * eurekaBell; // slight bounce of excitement
                        gLeanX = -0.04 * eurekaBell; // lean back from eureka
                    }
                    break;
                }

                case GESTURE_YAWN_STRETCH: {
                    // Yawn: mouth opens, arms rise slowly, body arches, lazy drop
                    if (p < 0.6) {
                        // Rising stretch
                        var stretchP = this._easeInOutCubic(p / 0.6);
                        // Arms rise overhead slowly (asymmetric for realism)
                        gArmL = -2.0 * stretchP;
                        gArmR = -1.7 * stretchP; // one arm stretches more
                        gLeanX = -0.08 * stretchP; // arch backward
                        gHeadX = -0.12 * stretchP; // look up
                        gBodyPosY = 0.04 * stretchP; // rise on toes slightly
                        // Legs straighten
                        gLegL = -0.08 * stretchP;
                        gLegR = -0.05 * stretchP;
                    } else {
                        // Lazy drop
                        var dropP = (p - 0.6) / 0.4;
                        var dropEase = 1 - (1 - dropP) * (1 - dropP);
                        gArmL = -2.0 * (1 - dropEase);
                        gArmR = -1.7 * (1 - dropEase);
                        gLeanX = -0.08 * (1 - dropEase);
                        gHeadX = -0.12 * (1 - dropEase);
                        gBodyPosY = 0.04 * (1 - dropEase);
                        // Head shake to "wake up"
                        if (dropP > 0.5) {
                            gHeadZ = Math.sin((dropP - 0.5) * Math.PI * 6) * 0.08 * (1 - dropP);
                        }
                    }
                    break;
                }
            }

            // Check if gesture is complete
            if (this.gestureProgress >= 1.0) {
                this.currentGesture = GESTURE_NONE;
                this.gestureTimer = 0;
                this.gestureProgress = 0;
                this._userTriggered = false;
                // Longer delay after acrobatic gestures
                var isAcrobatic = (this.currentGesture >= GESTURE_SOMERSAULT && this.currentGesture <= GESTURE_CELEBRATORY_JUMP);
                this.gestureDelayTimer = isAcrobatic ? (3.0 + Math.random() * 4.0) : (2.0 + Math.random() * 3.5);
            }
        }

        // Apply character position (base breathing + gesture height)
        this.character.position.y = breathe + gBodyPosY;
        this.character.position.x = sway;

        // Apply to limbs (all absolute, never cumulative)
        if (this.limbs.leftArm) this.limbs.leftArm.rotation.x = baseArmL + gArmL;
        if (this.limbs.rightArm) this.limbs.rightArm.rotation.x = baseArmR + gArmR;
        if (this.limbs.leftLeg) this.limbs.leftLeg.rotation.x = baseLegL + gLegL;
        if (this.limbs.rightLeg) this.limbs.rightLeg.rotation.x = baseLegR + gLegR;

        // Head — absolute positioning (prevents detach bug)
        if (this.limbs.head) {
            this.limbs.head.position.y = this._headBaseY + Math.sin(t * 1.0) * 0.01;
            this.limbs.head.position.x = this._headBaseX;
            this.limbs.head.position.z = this._headBaseZ;
            this.limbs.head.rotation.z = gHeadZ;
            this.limbs.head.rotation.x = gHeadX;
        }

        // Cape animation
        if (this.limbs.cape) {
            this.limbs.cape.rotation.x = 0.15 + Math.sin(t * 1.2) * 0.05;
        }

        // Mouth animation — subtle smile pulse
        if (this.limbs.mouth) {
            var smileScale = 1.0 + Math.sin(t * 0.5) * 0.05;
            this.limbs.mouth.scale.set(smileScale, smileScale, 1);
        }

        // Coat tail animation
        if (this.limbs.coatTail) {
            this.limbs.coatTail.rotation.x = 0.1 + Math.sin(t * 0.9) * 0.03;
        }

        // Apply whole-body rotations for acrobatic gestures
        this.character.rotation.x = lean + gLeanX + gBodyRotX;
        this.character.rotation.z = gBodyRotZ;

        // Spin kick uses yaw offset — apply additively to the drag rotation
        if (gBodyRotYaw !== 0) {
            this.character.rotation.y = this.rotationY + rotOsc + gBodyRotYaw;
        } else {
            this.character.rotation.y = this.rotationY + rotOsc;
        }
    }

    /**
     * Stop the preview animation loop.
     */
    stopAnimation() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }

    /**
     * Full cleanup — dispose all resources.
     */
    dispose() {
        this.stopAnimation();
        if (this.character) {
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
            this.character = null;
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }
        this.limbs = null;
        this.scene = null;
        this.camera = null;
        this.initialized = false;
    }
}
