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
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { buildPlayer } from './player.js';

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

    function animate() {
      self.animFrameId = requestAnimationFrame(animate);
      self.time += 0.016;

      if (!self.character) return;

      // Smooth rotation toward target
      var rotDiff = self.targetRotationY - self.rotationY;
      self.rotationY += rotDiff * 0.1;
      self.character.rotation.y = self.rotationY;

      // Idle animation — layered subtle movements at different speeds
      // for organic feel [8]

      // Gentle vertical bob (breathing)
      var breathe = Math.sin(self.time * 1.2) * 0.015;
      self.character.position.y = breathe;

      // Very subtle side-to-side sway
      var sway = Math.sin(self.time * 0.7) * 0.008;
      self.character.position.x = sway;

      // Tiny forward-back lean
      var lean = Math.sin(self.time * 0.9) * 0.003;
      self.character.rotation.x = lean;

      // Subtle head tilt (if character has limbs we could animate)
      // The slight rotation creates life without being distracting

      // Render
      self.renderer.render(self.scene, self.camera);
    }

    animate();
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
    this.scene = null;
    this.camera = null;
    this.initialized = false;
  }
}
