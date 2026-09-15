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
 * Idle animation uses layered subtle movements at different speeds
 * for organic feel [8].
 *
 * UPDATED: Added gesture system with 6 random gestures for locker preview.
 * Character now waves, listens with stethoscope, does jumping jacks, flexes,
 * looks at watch, and gives thumbs up while being viewed.
 * Vehicle avatars skip gestures since they have no humanoid limbs.
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
        this.gestureDelayTimer = 3.0;

        // Base positions for absolute animation (prevents drift)
        this._headBaseY = 0;
        this._headBaseX = 0;
        this._headBaseZ = 0;
        this._leftArmBaseX = 0;
        this._rightArmBaseX = 0;
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
        // Key light from front-right for main illumination
        var keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(3, 4, 5);
        this.scene.add(keyLight);

        // Fill light from front-left to soften shadows
        var fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
        fillLight.position.set(-3, 2, 4);
        this.scene.add(fillLight);

        // Rim light from behind to highlight edges
        var rimLight = new THREE.DirectionalLight(0x4488ff, 0.3);
        rimLight.position.set(0, 3, -3);
        this.scene.add(rimLight);

        // Ambient for base visibility
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
        this.gestureDelayTimer = 2.0 + Math.random() * 2.0;

        // Face the character toward the camera (rotate 180 degrees)
        this.character.rotation.y = this.rotationY;

        this.scene.add(this.character);
    }

    setupInteraction() {
        var self = this;
        var canvas = this.renderer.domElement;

        // Pointer down — start drag
        canvas.addEventListener('pointerdown', function (e) {
            self.isDragging = true;
            self.lastPointerX = e.clientX;
            canvas.setPointerCapture(e.pointerId);
        });

        // Pointer move — rotate character while dragging
        canvas.addEventListener('pointermove', function (e) {
            if (!self.isDragging) return;
            var deltaX = e.clientX - self.lastPointerX;
            self.targetRotationY += deltaX * 0.01;
            self.lastPointerX = e.clientX;
        });

        // Pointer up — stop drag
        canvas.addEventListener('pointerup', function (e) {
            self.isDragging = false;
            canvas.releasePointerCapture(e.pointerId);
        });

        // Pointer leave — stop drag
        canvas.addEventListener('pointerleave', function () {
            self.isDragging = false;
        });

        // Prevent context menu on long press
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    /**
     * Preview a specific item without buying it.
     * Temporarily overrides the equipped item for that slot.
     *
     * @param {string} itemId - The shop item ID to preview
     * @param {string} slot - The equipment slot (skin, hat, trail, gear)
     */
    previewItem(itemId, slot) {
        if (!this.previewOverrides) {
            // Start from current equipped state
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
     * Call this when the locker screen is shown.
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
     * Uses absolute positioning to prevent limb drift.
     * Vehicle avatars skip gestures since they have no humanoid limbs.
     */
    updateIdleAnimation(dt) {
        if (!this.character) return;

        var t = this.time;

        // Base idle layers (always active for all character types)
        var breathe = Math.sin(t * 1.2) * 0.015;
        this.character.position.y = breathe;

        var sway = Math.sin(t * 0.7) * 0.008;
        this.character.position.x = sway;

        var lean = Math.sin(t * 0.9) * 0.003;

        // Skip gestures for vehicles — they have no humanoid limbs
        if (!this.limbs || this.limbs.isVehicle) {
            this.character.rotation.x = lean;
            return;
        }

        // Gesture variables — all default to 0 (no effect)
        var gestureArmL = 0, gestureArmR = 0;
        var gestureHeadTiltZ = 0, gestureHeadTiltX = 0;
        var gestureLeanX = 0;
        var gestureLegL = 0, gestureLegR = 0;

        // Base arm sway (subtle, always active)
        var baseArmL = Math.sin(t * 0.9) * 0.06;
        var baseArmR = Math.sin(t * 1.1 + 0.5) * 0.06;
        var baseLegL = Math.sin(t * 0.7) * 0.03;
        var baseLegR = Math.sin(t * 0.7 + Math.PI) * 0.03;

        if (this.currentGesture === 0) {
            // No active gesture — count down delay before next gesture
            this.gestureDelayTimer -= dt;
            if (this.gestureDelayTimer <= 0) {
                // Pick random gesture 1-6
                this.currentGesture = 1 + Math.floor(Math.random() * 6);
                this.gestureTimer = 0;
                switch (this.currentGesture) {
                    case 1: this.gestureDuration = 2.0; break; // Wave
                    case 2: this.gestureDuration = 1.5; break; // Stethoscope listen
                    case 3: this.gestureDuration = 2.5; break; // Jumping jacks
                    case 4: this.gestureDuration = 2.0; break; // Flexing
                    case 5: this.gestureDuration = 1.8; break; // Looking at watch
                    case 6: this.gestureDuration = 1.5; break; // Thumbs up
                    default: this.gestureDuration = 1.5;
                }
            }
        } else {
            this.gestureTimer += dt;
            this.gestureProgress = Math.min(this.gestureTimer / this.gestureDuration, 1.0);
            var bell = Math.sin(this.gestureProgress * Math.PI); // smooth rise and fall

            switch (this.currentGesture) {
                case 1: // Wave — right arm up, rapid oscillation
                    var wavePhase = this.gestureProgress * Math.PI * 6;
                    gestureArmR = -1.2 * bell + Math.sin(wavePhase) * 0.3 * bell;
                    gestureLeanX = -0.03 * bell;
                    break;

                case 2: // Stethoscope listen — hand to ear, lean forward
                    gestureArmR = -1.3 * bell;
                    gestureHeadTiltZ = 0.1 * bell;
                    gestureLeanX = 0.08 * bell;
                    gestureHeadTiltX = 0.05 * bell;
                    break;

                case 3: // Jumping jacks — arms and legs spread rhythmically
                    var jjPhase = this.gestureProgress * Math.PI * 4;
                    var jjBell = Math.abs(Math.sin(jjPhase));
                    gestureArmL = -1.5 * jjBell;
                    gestureArmR = -1.5 * jjBell;
                    gestureLegL = -0.4 * jjBell;
                    gestureLegR = 0.4 * jjBell;
                    // Small bounce
                    this.character.position.y = breathe + jjBell * 0.08;
                    break;

                case 4: // Flexing — both arms up in bodybuilder pose
                    gestureArmL = -1.8 * bell;
                    gestureArmR = -1.8 * bell;
                    gestureLeanX = -0.02 * bell;
                    break;

                case 5: // Looking at watch — left arm up, head tilted down
                    gestureArmL = -1.0 * bell;
                    gestureHeadTiltX = 0.15 * bell;
                    gestureHeadTiltZ = -0.1 * bell;
                    gestureLegR = Math.sin(this.gestureProgress * Math.PI * 6) * 0.1 * bell;
                    break;

                case 6: // Thumbs up — right arm extends forward
                    gestureArmR = -1.4 * bell;
                    gestureLeanX = -0.03 * bell;
                    break;
            }

            if (this.gestureProgress >= 1.0) {
                this.currentGesture = 0;
                this.gestureTimer = 0;
                this.gestureProgress = 0;
                this.gestureDelayTimer = 2.0 + Math.random() * 4.0;
            }
        }

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

        // Apply lean (base + gesture)
        this.character.rotation.x = lean + gestureLeanX;
    }

    /**
     * Stop the preview animation loop.
     * Call this when the locker screen is hidden.
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
