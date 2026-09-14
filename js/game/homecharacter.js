/**
 * homecharacter.js — Home screen character preview with idle animations
 *
 * Creates a small Three.js renderer on the home screen showing
 * the player character facing forward doing idle animations:
 * - Gentle bounce (breathing)
 * - Occasional clipboard check gesture
 * - Stethoscope adjust
 * - Head tilt
 * - Arm wave
 * - Layered subtle movements at different speeds for organic feel
 *
 * Renders into a DOM container "homeCharacterContainer" placed
 * between the header and stats row on the home screen.
 *
 * Reuses buildPlayer() from player.js for consistent appearance.
 * Completely independent renderer from the game scene.
 *
 * Start animation when home screen is shown, stop when hidden
 * to avoid wasting GPU cycles during gameplay.
 */

import * as THREE from 'three';
import { buildPlayer, getPlayerLimbs } from './player.js';

// ===== GESTURE TYPES =====
var GESTURE_NONE = 0;
var GESTURE_CLIPBOARD = 1;
var GESTURE_STETHOSCOPE = 2;
var GESTURE_HEAD_TILT = 3;
var GESTURE_WAVE = 4;
var GESTURE_COUNT = 5;

export class HomeCharacter {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.character = null;
        this.limbs = null;
        this.container = null;
        this.animFrameId = null;
        this.time = 0;
        this.initialized = false;

        // Gesture system
        this.currentGesture = GESTURE_NONE;
        this.gestureTimer = 0;
        this.gestureDuration = 0;
        this.gestureProgress = 0;
        this.nextGestureDelay = 2.0; // seconds until next gesture
        this.gestureDelayTimer = 2.0;
    }

    /**
     * Initialize the home character renderer.
     * Call once after the DOM is ready.
     *
     * @param {string} containerId - DOM element ID for the renderer
     */
    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // Don't double-init
        if (this.initialized) {
            this.rebuildCharacter();
            return;
        }

        // Scene with dark background matching app theme
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050816);

        // Camera — positioned to frame the character nicely
        this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
        this.camera.position.set(0, 1.3, 4.5);
        this.camera.lookAt(0, 0.95, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setClearColor(0x050816, 1);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.resize();

        // ===== LIGHTING =====

        // Key light from front-right
        var keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
        keyLight.position.set(3, 4, 5);
        this.scene.add(keyLight);

        // Fill light from front-left (subtle blue tint)
        var fillLight = new THREE.DirectionalLight(0x8888ff, 0.35);
        fillLight.position.set(-3, 2, 4);
        this.scene.add(fillLight);

        // Rim light from behind (cyan accent)
        var rimLight = new THREE.DirectionalLight(0x18ffff, 0.25);
        rimLight.position.set(0, 3, -3);
        this.scene.add(rimLight);

        // Ambient for base visibility
        var ambient = new THREE.AmbientLight(0x666688, 0.5);
        this.scene.add(ambient);

        // ===== GROUND ELEMENTS =====

        // Small ground disc
        var groundDisc = new THREE.Mesh(
            new THREE.CircleGeometry(1.0, 24),
            new THREE.MeshBasicMaterial({
                color: 0x111428,
                transparent: true,
                opacity: 0.5
            })
        );
        groundDisc.rotation.x = -Math.PI / 2;
        groundDisc.position.y = -0.2;
        this.scene.add(groundDisc);

        // Ground ring (cyan accent)
        var groundRing = new THREE.Mesh(
            new THREE.RingGeometry(0.95, 1.05, 32),
            new THREE.MeshBasicMaterial({
                color: 0x18ffff,
                transparent: true,
                opacity: 0.12
            })
        );
        groundRing.rotation.x = -Math.PI / 2;
        groundRing.position.y = -0.19;
        this.scene.add(groundRing);

        // Subtle floating particles behind character for ambiance
        this.bgParticles = [];
        var particleMat = new THREE.MeshBasicMaterial({
            color: 0x18ffff,
            transparent: true,
            opacity: 0.15
        });
        for (var i = 0; i < 8; i++) {
            var p = new THREE.Mesh(
                new THREE.SphereGeometry(0.03, 4, 4),
                particleMat.clone()
            );
            p.position.set(
                (Math.random() - 0.5) * 3,
                0.5 + Math.random() * 2.5,
                1 + Math.random() * 2
            );
            p.userData = {
                baseX: p.position.x,
                baseY: p.position.y,
                phaseX: Math.random() * Math.PI * 2,
                phaseY: Math.random() * Math.PI * 2,
                speedX: 0.3 + Math.random() * 0.4,
                speedY: 0.5 + Math.random() * 0.3
            };
            this.scene.add(p);
            this.bgParticles.push(p);
        }

        // Build the character
        this.rebuildCharacter();

        // Handle container resize
        var self = this;
        this._resizeObserver = null;
        if (window.ResizeObserver) {
            this._resizeObserver = new ResizeObserver(function () {
                self.resize();
            });
            this._resizeObserver.observe(this.container);
        }

        this.initialized = true;
    }

    /**
     * Resize renderer to match container dimensions.
     */
    resize() {
        if (!this.container || !this.renderer) return;
        var w = this.container.clientWidth;
        var h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    /**
     * Rebuild the character mesh (call when equipment changes).
     */
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

        // Build fresh character using same function as the game
        this.character = buildPlayer();
        this.limbs = getPlayerLimbs(this.character);

        // Face toward camera
        this.character.rotation.y = Math.PI;

        this.scene.add(this.character);
    }

    /**
     * Start the animation loop.
     * Call when the home screen becomes visible.
     */
    startAnimation() {
        if (this.animFrameId) return; // already running
        if (!this.initialized) return;

        var self = this;
        var lastTime = performance.now();

        function animate(now) {
            self.animFrameId = requestAnimationFrame(animate);

            var dt = (now - lastTime) / 1000;
            lastTime = now;
            // Clamp delta to avoid huge jumps when tab was hidden
            if (dt > 0.1) dt = 0.016;

            self.time += dt;
            self.updateAnimation(dt);
            self.renderer.render(self.scene, self.camera);
        }

        this.animFrameId = requestAnimationFrame(animate);
    }

    /**
     * Stop the animation loop.
     * Call when navigating away from the home screen.
     */
    stopAnimation() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }

    /**
     * Main animation update — layered subtle movements at different
     * speeds for organic feel. Occasional gesture animations play
     * on top of the base idle.
     *
     * @param {number} dt - Delta time in seconds
     */
    updateAnimation(dt) {
        if (!this.character || !this.limbs) return;

        var t = this.time;

        // ===== BASE IDLE LAYERS =====

        // Layer 1: Gentle breathing bounce (slow, primary)
        var breathe = Math.sin(t * 1.3) * 0.012;
        this.character.position.y = breathe;

        // Layer 2: Very subtle side-to-side weight shift (slower)
        var sway = Math.sin(t * 0.6) * 0.006;
        this.character.position.x = sway;

        // Layer 3: Tiny forward-back lean (different frequency)
        var lean = Math.sin(t * 0.8) * 0.004;
        this.character.rotation.x = lean;

        // Layer 4: Very slight rotation oscillation (slowest)
        var rotOsc = Math.sin(t * 0.4) * 0.015;
        this.character.rotation.y = Math.PI + rotOsc;

        // ===== ARM IDLE SWAY =====
        // Arms gently swing at different rates (not gesture-controlled)
        var baseArmSwingL = Math.sin(t * 0.9) * 0.06;
        var baseArmSwingR = Math.sin(t * 1.1 + 0.5) * 0.06;

        // ===== LEG IDLE SWAY =====
        var baseLegSwingL = Math.sin(t * 0.7) * 0.03;
        var baseLegSwingR = Math.sin(t * 0.7 + Math.PI) * 0.03;

        // ===== HEAD IDLE BOB =====
        var headBob = 0;
        if (this.limbs.head) {
            headBob = Math.sin(t * 1.0) * 0.01;
        }

        // ===== GESTURE SYSTEM =====

        // Gesture delay countdown
        var gestureArmL = 0;
        var gestureArmR = 0;
        var gestureHeadTilt = 0;
        var gestureLeanX = 0;

        if (this.currentGesture === GESTURE_NONE) {
            this.gestureDelayTimer -= dt;
            if (this.gestureDelayTimer <= 0) {
                // Pick a random gesture
                this.currentGesture = 1 + Math.floor(Math.random() * (GESTURE_COUNT - 1));
                this.gestureTimer = 0;

                // Set duration based on gesture type
                switch (this.currentGesture) {
                    case GESTURE_CLIPBOARD:
                        this.gestureDuration = 1.8;
                        break;
                    case GESTURE_STETHOSCOPE:
                        this.gestureDuration = 1.5;
                        break;
                    case GESTURE_HEAD_TILT:
                        this.gestureDuration = 1.2;
                        break;
                    case GESTURE_WAVE:
                        this.gestureDuration = 2.0;
                        break;
                    default:
                        this.gestureDuration = 1.5;
                }
            }
        } else {
            this.gestureTimer += dt;
            this.gestureProgress = Math.min(this.gestureTimer / this.gestureDuration, 1.0);

            // Smooth ease-in-out curve
            var ease = this.gestureProgress < 0.5
                ? 2 * this.gestureProgress * this.gestureProgress
                : 1 - Math.pow(-2 * this.gestureProgress + 2, 2) / 2;

            // Bell curve for gesture intensity (peaks at 50%, fades at start/end)
            var bell = Math.sin(this.gestureProgress * Math.PI);

            switch (this.currentGesture) {

                case GESTURE_CLIPBOARD:
                    // Right arm comes forward and down (checking clipboard)
                    // Left arm holds clipboard
                    gestureArmR = -0.8 * bell;
                    gestureArmL = -0.5 * bell;
                    // Slight head tilt down to "read"
                    gestureHeadTilt = 0.12 * bell;
                    // Lean forward slightly
                    gestureLeanX = 0.04 * bell;
                    break;

                case GESTURE_STETHOSCOPE:
                    // Right arm reaches up to ear/neck
                    gestureArmR = -1.0 * bell;
                    // Left arm slight movement
                    gestureArmL = -0.2 * bell;
                    // Head tilts to side
                    gestureHeadTilt = -0.08 * bell;
                    break;

                case GESTURE_HEAD_TILT:
                    // Just a curious head tilt side to side
                    var tiltPhase = this.gestureProgress * Math.PI * 2;
                    gestureHeadTilt = Math.sin(tiltPhase) * 0.15;
                    // Slight arm adjustment
                    gestureArmR = 0.1 * bell;
                    break;

                case GESTURE_WAVE:
                    // Right arm waves enthusiastically
                    var wavePhase = this.gestureProgress * Math.PI * 6; // 3 wave cycles
                    gestureArmR = -1.2 * bell + Math.sin(wavePhase) * 0.3 * bell;
                    // Body leans slightly toward the wave
                    gestureLeanX = -0.03 * bell;
                    break;
            }

            // Gesture complete
            if (this.gestureProgress >= 1.0) {
                this.currentGesture = GESTURE_NONE;
                this.gestureTimer = 0;
                this.gestureProgress = 0;
                // Random delay before next gesture (2-5 seconds)
                this.gestureDelayTimer = 2.0 + Math.random() * 3.0;
            }
        }

        // ===== APPLY TO LIMBS =====

        if (this.limbs.leftArm) {
            this.limbs.leftArm.rotation.x = baseArmSwingL + gestureArmL;
        }
        if (this.limbs.rightArm) {
            this.limbs.rightArm.rotation.x = baseArmSwingR + gestureArmR;
        }
        if (this.limbs.leftLeg) {
            this.limbs.leftLeg.rotation.x = baseLegSwingL;
        }
        if (this.limbs.rightLeg) {
            this.limbs.rightLeg.rotation.x = baseLegSwingR;
        }

        // Head tilt (rotation.z for side tilt, rotation.x for nod)
        if (this.limbs.head) {
            this.limbs.head.rotation.z = gestureHeadTilt;
            this.limbs.head.position.y += headBob;
        }

        // Apply gesture lean on top of base lean
        this.character.rotation.x = lean + gestureLeanX;

        // ===== MOUTH ANIMATION =====
        // Subtle smile scale pulsing
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

        // ===== BACKGROUND PARTICLES =====
        for (var i = 0; i < this.bgParticles.length; i++) {
            var p = this.bgParticles[i];
            var pd = p.userData;
            p.position.x = pd.baseX + Math.sin(t * pd.speedX + pd.phaseX) * 0.3;
            p.position.y = pd.baseY + Math.sin(t * pd.speedY + pd.phaseY) * 0.2;
            p.material.opacity = 0.08 + Math.sin(t * 0.8 + i) * 0.06;
        }
    }

    /**
     * Full cleanup — dispose all GPU resources.
     */
    dispose() {
        this.stopAnimation();

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

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

        // Dispose background particles
        if (this.bgParticles) {
            for (var i = 0; i < this.bgParticles.length; i++) {
                this.scene.remove(this.bgParticles[i]);
                this.bgParticles[i].geometry.dispose();
                this.bgParticles[i].material.dispose();
            }
            this.bgParticles = [];
        }

        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer = null;
        }

        this.scene = null;
        this.camera = null;
        this.limbs = null;
        this.initialized = false;
    }
}
