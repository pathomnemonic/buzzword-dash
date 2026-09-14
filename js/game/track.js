/**
 * track.js — Track construction using skin system
 *
 * Builds the complete 3D track environment based on the
 * randomly selected skin from skins.js. Uses geometry builders
 * from skinbuilders.js for walls, arches, ground, and particles.
 *
 * Visual features:
 * - Skin-specific wall geometry (organic tubes, artery walls, bone pillars, etc.)
 * - Skin-specific overhead arches (synapses, ribs, capillaries, etc.)
 * - Skin-specific ground patterns (myelin sheaths, endothelium, tiles, etc.)
 * - Atmospheric particle pool (blood cells, sparks, vesicles, etc.)
 * - Running lights along track edges that sequence forward
 * - Wall glow strips for neon accent lighting
 * - Flying environment props from props.js
 *
 * Performance approach:
 * - MeshBasicMaterial for all decorative elements [8]
 * - Pre-created particle pool reused via visibility toggling [8]
 * - Distance-based detail reduction on wall segments
 * - Simple geometry primitives for fast rendering
 *
 * Architecture:
 * - buildTrack() constructs the static track elements
 * - spawnEnvProp() creates flying medical props (called by engine.js)
 * - createParticlePool() pre-creates atmospheric particles
 * - updateAtmosphericParticles() animates the pool each frame
 * - updateRunningLights() animates edge lights each frame
 */

import * as THREE from 'three';
import { buildWallSegment, buildArch, buildGround, buildAtmosphericParticle, setupSkinLighting, buildWallGlowStrips } from './skinbuilders.js';
import { PROP_BUILDERS, getSpecialtyProps } from './props.js';

// ===== CONSTANTS =====
var TRACK_LENGTH = 400;
var WALL_SEGMENT_SPACING = 4;
var ARCH_SPACING = 22;
var RUNNING_LIGHT_SPACING = 3;
var PARTICLE_POOL_SIZE = 40;
var DETAIL_DISTANCE = -40; // wall segments beyond this z skip decorative details

// ===== MAIN TRACK BUILDER =====

/**
 * Build the complete track environment for a given skin.
 * Called once at the start of each run.
 *
 * @param {THREE.Scene} scene
 * @param {object} skin - Skin definition from skins.js
 * @returns {object} References to animated elements for engine.js to update
 */
export function buildTrack(scene, skin) {
  var trackRefs = {
    runningLights: [],
    particlePool: [],
    particleStates: []
  };

  // Set up skin-specific lighting
  setupSkinLighting(skin, scene);

  // Build ground with skin-specific patterns
  var groundGroup = buildGround(skin);
  scene.add(groundGroup);

  // Build wall segments along both sides
  buildWalls(scene, skin);

  // Build overhead arches
  buildArches(scene, skin);

  // Build wall glow strips
  for (var glowSide = -1; glowSide <= 1; glowSide += 2) {
    var glowStrips = buildWallGlowStrips(skin, glowSide);
    scene.add(glowStrips);
  }

  // Build running lights along track edges
  buildRunningLights(scene, skin, trackRefs);

  // Create atmospheric particle pool
  createParticlePool(scene, skin, trackRefs);

  return trackRefs;
}

// ===== WALL CONSTRUCTION =====

function buildWalls(scene, skin) {
  for (var side = -1; side <= 1; side += 2) {
    for (var z = -160; z < 20; z += WALL_SEGMENT_SPACING) {
      var segment = buildWallSegment(skin, side, z, 3.5);
      scene.add(segment);
    }
  }
}

// ===== ARCH CONSTRUCTION =====

function buildArches(scene, skin) {
  for (var z = -155; z < 15; z += ARCH_SPACING) {
    var arch = buildArch(skin, z);
    scene.add(arch);

    // Arch support legs on each side
    for (var legSide = -1; legSide <= 1; legSide += 2) {
      var leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 5, 6),
        new THREE.MeshBasicMaterial({ color: skin.colors.archMain })
      );
      leg.position.set(legSide * 5.5, 2.5, z);
      scene.add(leg);
    }
  }
}

// ===== RUNNING LIGHTS =====

/**
 * Build sequencing lights along track edges.
 * These animate forward like runway landing lights,
 * reinforcing the sense of speed and direction.
 */
function buildRunningLights(scene, skin, trackRefs) {
  var c = skin.colors;

  for (var side = -1; side <= 1; side += 2) {
    for (var z = -160; z < 20; z += RUNNING_LIGHT_SPACING) {
      var light = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({
          color: c.wallGlow,
          transparent: true,
          opacity: 0.15
        })
      );
      light.position.set(side * 4.5, 0.06, z);
      light.userData = {
        baseZ: z,
        side: side,
        baseOpacity: 0.15,
        maxOpacity: 0.7
      };
      scene.add(light);
      trackRefs.runningLights.push(light);
    }
  }
}

/**
 * Update running lights to create forward-sequencing animation.
 * Called every frame by engine.js.
 *
 * @param {object[]} runningLights - Array of light meshes
 * @param {number} time - Current time for animation
 * @param {number} speed - Current game speed for animation rate
 */
export function updateRunningLights(runningLights, time, speed) {
  if (!runningLights || runningLights.length === 0) return;

  var waveSpeed = speed * 0.3;
  var waveLength = 20;

  for (var i = 0; i < runningLights.length; i++) {
    var light = runningLights[i];
    var d = light.userData;

    // Create a forward-traveling wave pattern
    var phase = (d.baseZ + time * waveSpeed) / waveLength;
    var wave = (Math.sin(phase * Math.PI * 2) + 1) * 0.5;

    // Lights brighten as the wave passes through them
    light.material.opacity = d.baseOpacity + wave * (d.maxOpacity - d.baseOpacity);
  }
}

// ===== ATMOSPHERIC PARTICLE POOL =====

/**
 * Create a pool of atmospheric particles.
 * Pre-creating and reusing particles is faster than
 * creating and destroying them, because "it makes memory
 * allocation simpler and removes dynamic memory allocation
 * overhead and Garbage Collection" [8].
 */
function createParticlePool(scene, skin, trackRefs) {
  for (var i = 0; i < PARTICLE_POOL_SIZE; i++) {
    var particle = buildAtmosphericParticle(skin);

    // Random initial position in the track volume
    var px = (Math.random() - 0.5) * 10;
    var py = 0.5 + Math.random() * 4;
    var pz = -150 + Math.random() * 170;

    if (particle.isGroup) {
      particle.position.set(px, py, pz);
    } else {
      particle.position.set(px, py, pz);
    }

    // Random rotation for variety
    particle.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    scene.add(particle);
    trackRefs.particlePool.push(particle);
    trackRefs.particleStates.push({
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.1 + 0.05,
      vz: 0,
      rotSpeed: (Math.random() - 0.5) * 0.5,
      driftPhase: Math.random() * Math.PI * 2,
      baseY: py
    });
  }
}

/**
 * Update atmospheric particles each frame.
 * Particles drift, rotate, and bob gently.
 * When they pass the camera, they're repositioned far ahead
 * (object pooling pattern) [8].
 *
 * @param {object[]} particlePool - Array of particle meshes
 * @param {object[]} particleStates - Animation state per particle
 * @param {number} dt - Delta time
 * @param {number} move - Movement distance this frame (from engine speed)
 * @param {number} time - Current elapsed time
 */
export function updateAtmosphericParticles(particlePool, particleStates, dt, move, time) {
  if (!particlePool || particlePool.length === 0) return;

  for (var i = 0; i < particlePool.length; i++) {
    var p = particlePool[i];
    var s = particleStates[i];

    // Move toward camera with the track (same as other objects)
    p.position.z += move * 0.5; // Slower than track for parallax depth

    // Gentle drift
    p.position.x += s.vx * dt;
    p.position.y = s.baseY + Math.sin(time * 0.5 + s.driftPhase) * 0.3;

    // Slow rotation for visual interest
    p.rotation.y += s.rotSpeed * dt;
    p.rotation.x += s.rotSpeed * dt * 0.3;

    // When particle passes camera, recycle it far ahead
    if (p.position.z > 8) {
      p.position.z = -150 - Math.random() * 30;
      p.position.x = (Math.random() - 0.5) * 10;
      s.baseY = 0.5 + Math.random() * 4;
      p.position.y = s.baseY;
      s.vx = (Math.random() - 0.5) * 0.3;
      s.driftPhase = Math.random() * Math.PI * 2;
    }

    // Keep particles within track boundaries
    if (p.position.x > 5) { p.position.x = 5; s.vx *= -1; }
    if (p.position.x < -5) { p.position.x = -5; s.vx *= -1; }
  }
}


// ===== FLYING ENVIRONMENT PROPS =====

/**
 * Spawn a flying medical prop that moves toward the camera.
 * Props are specialty-themed using getSpecialtyProps() from props.js.
 * Called periodically by engine.js (every 1-3 seconds).
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Mesh[]} envPropMeshes - Array to track spawned props
 * @param {string[]} selectedSubjects - Currently selected subjects for theming
 */
export function spawnEnvProp(scene, envPropMeshes, selectedSubjects) {
  var builders = selectedSubjects ? getSpecialtyProps(selectedSubjects) : PROP_BUILDERS;
  var builder = builders[Math.floor(Math.random() * builders.length)];
  var prop = builder();

  // Decide placement: left, right, overhead, or dramatic close pass
  var placement = Math.random();
  if (placement < 0.35) {
    // Left side
    prop.position.set(
      -7 - Math.random() * 4,
      Math.random() * 3,
      -80 - Math.random() * 20
    );
  } else if (placement < 0.7) {
    // Right side
    prop.position.set(
      7 + Math.random() * 4,
      Math.random() * 3,
      -80 - Math.random() * 20
    );
  } else if (placement < 0.9) {
    // Overhead
    prop.position.set(
      (Math.random() - 0.5) * 10,
      4 + Math.random() * 4,
      -80 - Math.random() * 20
    );
  } else {
    // Dramatic close pass
    prop.position.set(
      (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 2),
      1 + Math.random() * 2,
      -90 - Math.random() * 10
    );
  }

  prop.rotation.y = Math.random() * Math.PI * 2;
  prop.rotation.x = (Math.random() - 0.5) * 0.3;

  var scale = 0.5 + Math.random() * 1.0;
  prop.scale.set(scale, scale, scale);

  prop.userData = { isEnvProp: true };
  scene.add(prop);
  envPropMeshes.push(prop);
}

// ===== CAMERA FOV ANIMATION =====

/**
 * Calculate the target camera FOV based on current game speed.
 * Higher speeds widen the FOV for a tunnel-vision effect,
 * which is a standard technique in racing and runner games.
 *
 * Uses linear interpolation between a base FOV and max FOV
 * based on the ratio of current speed to base speed.
 * The camera.fov should be smoothly lerped toward this target
 * in the engine update loop to prevent jarring changes.
 *
 * @param {number} baseSpeed - The starting speed for this run
 * @param {number} currentSpeed - Current game speed
 * @param {number} baseFOV - Default camera FOV (e.g., 70)
 * @param {number} maxFOV - Maximum FOV at high speed (e.g., 85)
 * @param {boolean} isRushing - Whether player is currently rushing
 * @returns {number} Target FOV value
 */
export function calculateTargetFOV(baseSpeed, currentSpeed, baseFOV, maxFOV, isRushing) {
  if (!baseFOV) baseFOV = 70;
  if (!maxFOV) maxFOV = 85;

  var speedRatio = currentSpeed / Math.max(baseSpeed, 0.01);
  var normalizedSpeed = Math.min(Math.max((speedRatio - 1) / 1.5, 0), 1);

  var targetFOV = baseFOV + normalizedSpeed * (maxFOV - baseFOV);

  // Rush adds extra FOV burst
  if (isRushing) {
    targetFOV = Math.min(targetFOV + 5, maxFOV + 5);
  }

  return targetFOV;
}

/**
 * Smoothly interpolate the camera FOV toward target.
 * Call this every frame in engine.js update loop.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} targetFOV
 * @param {number} dt - Delta time
 * @param {number} lerpSpeed - How fast to interpolate (default 2.0)
 */
export function updateCameraFOV(camera, targetFOV, dt, lerpSpeed) {
  if (!lerpSpeed) lerpSpeed = 2.0;

  var diff = targetFOV - camera.fov;
  if (Math.abs(diff) > 0.01) {
    camera.fov += diff * Math.min(1, lerpSpeed * dt);
    camera.updateProjectionMatrix();
  }
}

// ===== CAMERA LANE LEAN =====

/**
 * Calculate camera X offset for lane-change lean effect.
 * When the player switches lanes, the camera tilts slightly
 * in the direction of movement for a more dynamic feel.
 *
 * @param {number} currentCameraX - Current camera X position
 * @param {number} targetLane - Target lane (0, 1, or 2)
 * @param {number} dt - Delta time
 * @param {number} baseCameraX - Default camera X (usually 0)
 * @returns {number} New camera X position
 */
export function calculateCameraLean(currentCameraX, targetLane, dt, baseCameraX) {
  if (baseCameraX === undefined) baseCameraX = 0;

  // Lean toward the target lane, but subtly
  var laneOffset = (targetLane - 1) * 0.5; // -0.5, 0, +0.5
  var targetX = baseCameraX + laneOffset;
  var diff = targetX - currentCameraX;

  return currentCameraX + diff * Math.min(1, 4 * dt);
}

// ===== STREAK VISUAL ENHANCEMENT =====

/**
 * Calculate visual intensity multiplier based on streak count.
 * Higher streaks make glow effects brighter and particles denser.
 * Used by engine.js to scale visual effects during gameplay.
 *
 * @param {number} streak - Current streak count
 * @returns {object} Visual intensity parameters
 */
export function getStreakVisualIntensity(streak) {
  return {
    glowMultiplier: 1.0 + Math.min(streak * 0.02, 0.5),
    particleDensity: 1.0 + Math.min(streak * 0.05, 1.5),
    fovBoost: Math.min(streak * 0.1, 2.0),
    colorShift: Math.min(streak * 0.01, 0.3)
  };
}
