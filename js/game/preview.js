/**
 * preview.js — Character preview renderer for the On-Call Locker
 *
 * Creates a separate Three.js renderer embedded in the shop screen
 * that shows the player character facing forward with all equipped
 * items visible. Supports drag-to-rotate and try-on preview.
 *
 * Uses its own scene, camera, and renderer completely independent
 * from the game scene — multiple Three.js renderers can coexist
 * on the same page without conflict [1].
 *
 * UPDATED: Added gesture system with 10 random gestures for locker preview.
 * Includes exciting acrobatic gestures: somersault, cartwheel, backflip,
 * spin kick, and celebratory jump, in addition to medical-themed gestures.
 * Vehicle avatars skip gestures since they have no humanoid limbs.
 *
 * FIX: Arm rotation direction corrected — positive X rotation = forward/upward.
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { buildPlayer, getPlayerLimbs } from './player.js';

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
        this.currentGesture = 0; // 0 = none
        this.gestureTimer = 0;
        this.gestureDuration = 0;
        this.gestureProgress = 0;
        this.gestureDelayTimer = 2.5;

        // Base positions for absolute animation (prevents drift)
        this._headBaseY = 0;
        this._headBaseX = 0;
        this._headBaseZ = 0;
        this._leftArmBaseX = 0;
        this._rightArmBaseX = 0;
        this._charBaseY = 0;

        // For whole-body acrobatic gestures
        this._wholeBodyRotX = 0;
        this._wholeBodyRotZ = 0;
        this._wholeBodyPosY = 0;
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

        // Set up drag-to-rotate interaction
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
        this.currentGesture = 0;
        this.gestureTimer = 0;
        this.gestureProgress = 0;
        this.gestureDelayTimer = 1.5 + Math.random() * 2.0;
        this._wholeBodyRotX = 0;
        this._wholeBodyRotZ = 0;
        this._wholeBodyPosY = 0;

        // Face the character toward the camera (rotate 180 degrees)
        this.character.rotation.y = this.rotationY;

        this.scene.add(this.character);
    }

    setupInteraction() {
        var self = this;
        var canvas = this.renderer.domElement;

        canvas.addEventListener('pointerdown', function (e) {
            self.isDragging = true;
            self.lastPointerX = e.clientX;
            canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener('pointermove', function (e) {
            if (!self.isDragging) return;
            var deltaX = e.clientX - self.lastPointerX;
            self.targetRotationY += deltaX * 0.01;
            self.lastPointerX = e.clientX;
        });

        canvas.addEventListener('pointerup', function (e) {
            self.isDragging = false;
            canvas.releasePointerCapture(e.pointerId);
        });

        canvas.addEventListener('pointerleave', function () {
            self.isDragging = false;
        });

        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
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
            self.character.rotation.y = self.rotationY;

            // Run the gesture-based idle animation
            self.updateIdleAnimation(dt);

            // Render
            self.renderer.render(self.scene, self.camera);
        }

        animate(performance.now());
    }

    /**
     * Idle animation with gesture system.
     * 
     * GESTURE LIST:
     * 1 = Wave (right arm forward and oscillating)
     * 2 = Stethoscope listen (hand forward to ear, lean)
     * 3 = Jumping jacks (arms + legs spread rhythmically)
     * 4 = Flexing (both arms up in bodybuilder pose)
     * 5 = Looking at watch (left arm forward, head tilt)
     * 6 = Thumbs up (right arm extends forward)
     * 7 = SOMERSAULT (whole body forward flip with tuck)
     * 8 = CARTWHEEL (whole body sideways rotation)
     * 9 = SPIN KICK (360 spin with leg extended)
     * 10 = CELEBRATORY JUMP (jump + fist pump)
     *
     * Arms: positive rotation.x = forward/up, negative = backward
     * Legs: positive rotation.x = forward (kick), negative = backward
     */
    updateIdleAnimation(dt) {
        if (!this.character) return;

        var t = this.time;

        // Base idle layers (always active for all character types)
        var breathe = Math.sin(t * 1.2) * 0.015;
        var sway = Math.sin(t * 0.7) * 0.008;
        var lean = Math.sin(t * 0.9) * 0.003;

        // Skip gestures for vehicles
        if (!this.limbs || this.limbs.isVehicle) {
            this.character.position.y = breathe;
            this.character.position.x = sway;
            this.character.rotation.x = lean;
            return;
        }

        // Gesture output variables — all default to 0
        var gestureArmL = 0, gestureArmR = 0;
        var gestureHeadTiltZ = 0, gestureHeadTiltX = 0;
        var gestureLeanX = 0;
        var gestureLegL = 0, gestureLegR = 0;
        var wholeBodyRotX = 0;
        var wholeBodyRotZ = 0;
        var wholeBodyPosY = 0;
        var wholeBodyRotYaw = 0;

        // Base arm sway (subtle, always active)
        var baseArmL = Math.sin(t * 0.9) * 0.06;
        var baseArmR = Math.sin(t * 1.1 + 0.5) * 0.06;
        var baseLegL = Math.sin(t * 0.7) * 0.03;
        var baseLegR = Math.sin(t * 0.7 + Math.PI) * 0.03;

        var GESTURE_COUNT = 10;

        if (this.currentGesture === 0) {
            // No active gesture — count down delay
            this.gestureDelayTimer -= dt;
            if (this.gestureDelayTimer <= 0) {
                this.currentGesture = 1 + Math.floor(Math.random() * GESTURE_COUNT);
                this.gestureTimer = 0;
                switch (this.currentGesture) {
                    case 1: this.gestureDuration = 2.0; break;  // Wave
                    case 2: this.gestureDuration = 1.5; break;  // Stethoscope listen
                    case 3: this.gestureDuration = 2.5; break;  // Jumping jacks
                    case 4: this.gestureDuration = 2.0; break;  // Flexing
                    case 5: this.gestureDuration = 1.8; break;  // Looking at watch
                    case 6: this.gestureDuration = 1.5; break;  // Thumbs up
                    case 7: this.gestureDuration = 1.8; break;  // SOMERSAULT
                    case 8: this.gestureDuration = 1.6; break;  // CARTWHEEL
                    case 9: this.gestureDuration = 1.4; break;  // SPIN KICK
                    case 10: this.gestureDuration = 1.6; break; // CELEBRATORY JUMP
                    default: this.gestureDuration = 1.5;
                }
            }
        } else {
            this.gestureTimer += dt;
            this.gestureProgress = Math.min(this.gestureTimer / this.gestureDuration, 1.0);
            // bell = smooth rise and fall from 0 to 1 to 0
            var bell = Math.sin(this.gestureProgress * Math.PI);
            // p = raw progress 0→1
            var p = this.gestureProgress;

            switch (this.currentGesture) {

                case 1: // Wave — right arm forward+up, rapid oscillation
                    var wavePhase = p * Math.PI * 6;
                    // Positive = forward/up for arms
                    gestureArmR = 1.4 * bell + Math.sin(wavePhase) * 0.3 * bell;
                    gestureHeadTiltZ = -0.08 * bell; // tilt head toward waving arm
                    break;

                case 2: // Stethoscope listen — right arm forward, lean forward, head tilt
                    gestureArmR = 1.3 * bell;
                    gestureArmL = 0.3 * bell;
                    gestureHeadTiltZ = 0.1 * bell;
                    gestureLeanX = 0.08 * bell;
                    gestureHeadTiltX = 0.05 * bell;
                    break;

                case 3: // Jumping jacks — arms up + legs spread rhythmically
                    var jjPhase = p * Math.PI * 4;
                    var jjBell = Math.abs(Math.sin(jjPhase));
                    gestureArmL = 2.0 * jjBell;  // arms up (positive = forward/above)
                    gestureArmR = 2.0 * jjBell;
                    gestureLegL = -0.4 * jjBell;  // legs spread outward
                    gestureLegR = 0.4 * jjBell;
                    // Small bounce
                    wholeBodyPosY = jjBell * 0.1;
                    break;

                case 4: // Flexing — both arms up in bodybuilder pose
                    gestureArmL = 1.8 * bell;
                    gestureArmR = 1.8 * bell;
                    gestureLeanX = -0.04 * bell; // lean back slightly showing off
                    wholeBodyPosY = 0.03 * bell;
                    break;

                case 5: // Looking at watch — left arm forward, head tilted
                    gestureArmL = 1.2 * bell;
                    gestureHeadTiltX = 0.15 * bell;
                    gestureHeadTiltZ = -0.1 * bell;
                    // Impatient foot tap
                    gestureLegR = Math.sin(p * Math.PI * 8) * 0.15 * bell;
                    break;

                case 6: // Thumbs up — right arm extends forward
                    gestureArmR = 1.4 * bell;
                    gestureHeadTiltZ = -0.05 * bell;
                    break;

                case 7: { // SOMERSAULT — forward flip with tuck
                    // Phase breakdown:
                    // 0.0-0.15: crouch (prepare)
                    // 0.15-0.3: launch upward
                    // 0.3-0.8: airborne + full forward rotation
                    // 0.8-1.0: land and straighten

                    if (p < 0.15) {
                        // Crouch phase
                        var crouchP = p / 0.15;
                        gestureLegL = 0.5 * crouchP;
                        gestureLegR = 0.5 * crouchP;
                        gestureArmL = 0.3 * crouchP;
                        gestureArmR = 0.3 * crouchP;
                        wholeBodyPosY = -0.15 * crouchP;
                        gestureLeanX = 0.1 * crouchP;
                    } else if (p < 0.3) {
                        // Launch phase
                        var launchP = (p - 0.15) / 0.15;
                        wholeBodyPosY = -0.15 + 0.6 * launchP;
                        gestureArmL = 0.3 + 1.5 * launchP;
                        gestureArmR = 0.3 + 1.5 * launchP;
                        wholeBodyRotX = launchP * Math.PI * 0.3;
                    } else if (p < 0.8) {
                        // Airborne tuck + full rotation
                        var airP = (p - 0.3) / 0.5;
                        var height = Math.sin(airP * Math.PI);
                        wholeBodyPosY = 0.45 + height * 0.5;
                        // Full 360° forward rotation
                        wholeBodyRotX = Math.PI * 0.3 + airP * Math.PI * 1.7;
                        // Tuck: legs pulled up, arms wrapped
                        var tuck = Math.sin(airP * Math.PI);
                        gestureLegL = 1.5 * tuck;
                        gestureLegR = 1.5 * tuck;
                        gestureArmL = 1.8 - 1.0 * tuck;
                        gestureArmR = 1.8 - 1.0 * tuck;
                    } else {
                        // Landing phase
                        var landP = (p - 0.8) / 0.2;
                        wholeBodyPosY = 0.45 * (1 - landP);
                        wholeBodyRotX = Math.PI * 2.0 * (1 - landP * landP);
                        gestureLegL = 0.3 * (1 - landP);
                        gestureLegR = 0.3 * (1 - landP);
                        gestureArmL = 0.8 * (1 - landP);
                        gestureArmR = 0.8 * (1 - landP);
                    }
                    break;
                }

                case 8: { // CARTWHEEL — sideways rotation
                    // 0.0-0.2: wind up (lean and lift arms)
                    // 0.2-0.8: sideways flip (rotate around Z axis + height)
                    // 0.8-1.0: land

                    if (p < 0.2) {
                        var windP = p / 0.2;
                        gestureArmL = 2.0 * windP;
                        gestureArmR = 2.0 * windP;
                        wholeBodyRotZ = -0.2 * windP;
                        wholeBodyPosY = 0.05 * windP;
                    } else if (p < 0.8) {
                        var cartP = (p - 0.2) / 0.6;
                        var cartHeight = Math.sin(cartP * Math.PI);
                        wholeBodyPosY = 0.05 + cartHeight * 0.6;
                        // Full 360° sideways rotation
                        wholeBodyRotZ = -0.2 + (-Math.PI * 2 + 0.2) * cartP;
                        // Arms stay extended throughout
                        gestureArmL = 2.0;
                        gestureArmR = 2.0;
                        // Legs spread in a V during the rotation
                        var legSpread = Math.sin(cartP * Math.PI);
                        gestureLegL = -0.8 * legSpread;
                        gestureLegR = 0.8 * legSpread;
                    } else {
                        var cLandP = (p - 0.8) / 0.2;
                        wholeBodyPosY = 0.05 * (1 - cLandP);
                        wholeBodyRotZ = -Math.PI * 2 * (1 - cLandP * cLandP * cLandP);
                        gestureArmL = 2.0 * (1 - cLandP);
                        gestureArmR = 2.0 * (1 - cLandP);
                    }
                    break;
                }

                case 9: { // SPIN KICK — 360° yaw spin with leg extended
                    // 0.0-0.15: wind up
                    // 0.15-0.7: spin + kick
                    // 0.7-1.0: land

                    if (p < 0.15) {
                        var skWindP = p / 0.15;
                        gestureArmL = 0.5 * skWindP;
                        gestureArmR = -0.3 * skWindP;
                        gestureLeanX = 0.05 * skWindP;
                        wholeBodyPosY = 0.05 * skWindP;
                    } else if (p < 0.7) {
                        var spinP = (p - 0.15) / 0.55;
                        // 360° yaw rotation
                        wholeBodyRotYaw = spinP * Math.PI * 2;
                        // Jump height
                        wholeBodyPosY = 0.05 + Math.sin(spinP * Math.PI) * 0.35;
                        // Right leg kicks out (positive = forward)
                        gestureLegR = 1.5 * Math.sin(spinP * Math.PI);
                        // Left leg stays slightly bent
                        gestureLegL = 0.3;
                        // Arms swing with the spin
                        gestureArmL = 1.0 * Math.sin(spinP * Math.PI);
                        gestureArmR = 0.8 * Math.sin(spinP * Math.PI + Math.PI * 0.5);
                        gestureLeanX = 0.1 * Math.sin(spinP * Math.PI);
                    } else {
                        var skLandP = (p - 0.7) / 0.3;
                        wholeBodyRotYaw = Math.PI * 2 * (1 - skLandP);
                        wholeBodyPosY = 0.05 * (1 - skLandP);
                        gestureArmL = 0.3 * (1 - skLandP);
                        gestureArmR = 0.3 * (1 - skLandP);
                    }
                    break;
                }

                case 10: { // CELEBRATORY JUMP — jump with fist pump
                    // 0.0-0.2: crouch
                    // 0.2-0.5: jump up, arms punch up
                    // 0.5-0.7: hang at peak, fist pump
                    // 0.7-1.0: land with style

                    if (p < 0.2) {
                        var cCrouch = p / 0.2;
                        wholeBodyPosY = -0.12 * cCrouch;
                        gestureLegL = 0.4 * cCrouch;
                        gestureLegR = 0.4 * cCrouch;
                        gestureArmL = -0.3 * cCrouch;
                        gestureArmR = -0.3 * cCrouch;
                    } else if (p < 0.5) {
                        var cJumpP = (p - 0.2) / 0.3;
                        wholeBodyPosY = -0.12 + 0.65 * cJumpP;
                        gestureArmL = -0.3 + 2.5 * cJumpP; // Arms punch up high
                        gestureArmR = -0.3 + 2.5 * cJumpP;
                        gestureLegL = 0.4 * (1 - cJumpP);
                        gestureLegR = 0.4 * (1 - cJumpP);
                    } else if (p < 0.7) {
                        var peakP = (p - 0.5) / 0.2;
                        wholeBodyPosY = 0.53;
                        // Fist pump oscillation at peak
                        gestureArmR = 2.2 + Math.sin(peakP * Math.PI * 4) * 0.4;
                        gestureArmL = 1.5 + Math.sin(peakP * Math.PI * 3) * 0.3;
                        // Kick legs out a bit at peak
                        gestureLegL = -0.3 * Math.sin(peakP * Math.PI);
                        gestureLegR = 0.3 * Math.sin(peakP * Math.PI);
                        gestureHeadTiltX = -0.15; // look up
                    } else {
                        var ceLandP = (p - 0.7) / 0.3;
                        var easeOut = 1 - (1 - ceLandP) * (1 - ceLandP);
                        wholeBodyPosY = 0.53 * (1 - easeOut);
                        gestureArmL = (1.5) * (1 - easeOut);
                        gestureArmR = (2.2) * (1 - easeOut);
                        gestureHeadTiltX = -0.15 * (1 - easeOut);
                    }
                    break;
                }
            }

            if (this.gestureProgress >= 1.0) {
                this.currentGesture = 0;
                this.gestureTimer = 0;
                this.gestureProgress = 0;
                // Acrobatic gestures get a longer cooldown so they feel special
                this.gestureDelayTimer = 2.0 + Math.random() * 4.0;
                this._wholeBodyRotX = 0;
                this._wholeBodyRotZ = 0;
                this._wholeBodyPosY = 0;
            }
        }

        // Apply character position (base breathing + gesture height)
        this.character.position.y = breathe + wholeBodyPosY;
        this.character.position.x = sway;

        // Apply to limbs (all absolute, never cumulative)
        if (this.limbs.leftArm) this.limbs.leftArm.rotation.x = baseArmL + gestureArmL;
        if (this.limbs.rightArm) this.limbs.rightArm.rotation.x = baseArmR + gestureArmR;
        if (this.limbs.leftLeg) this.limbs.leftLeg.rotation.x = baseLegL + gestureLegL;
        if (this.limbs.rightLeg) this.limbs.rightLeg.rotation.x = baseLegR + gestureLegR;

        // Head — absolute positioning (prevents detach bug)
        if (this.limbs.head) {
            this.limbs.head.position.y = this._headBaseY + Math.sin(t * 1.0) * 0.01;
            this.limbs.head.position.x = this._headBaseX;
            this.limbs.head.position.z = this._headBaseZ;
            this.limbs.head.rotation.z = gestureHeadTiltZ;
            this.limbs.head.rotation.x = gestureHeadTiltX;
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
        // These are applied to character.rotation which stacks with the yaw rotation
        this.character.rotation.x = lean + gestureLeanX + wholeBodyRotX;
        this.character.rotation.z = wholeBodyRotZ;

        // Spin kick uses yaw offset — apply additively to the drag rotation
        if (wholeBodyRotYaw !== 0) {
            this.character.rotation.y = this.rotationY + wholeBodyRotYaw;
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
