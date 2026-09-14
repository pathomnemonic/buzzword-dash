/**
 * track.js — Track construction using skin system
 *
 * Builds the complete 3D track environment based on the
 * randomly selected skin from skins.js. Uses geometry builders
 * from skinbuilders.js for walls, arches, ground, and particles.
 *
 * Visual features:
 * - Skin-specific wall geometry
 * - Skin-specific overhead arches
 * - Skin-specific ground patterns
 * - Atmospheric particle pool
 * - Running lights along track edges that sequence forward
 * - Wall glow strips for neon accent lighting
 * - Flying environment props from props.js
 * - SCROLLING GROUND LINES — pool of horizontal markers that rush toward camera
 * - WALL ACCENT MARKERS — small glowing rectangles on walls that flow past
 * - DYNAMIC SKYBOX ELEMENTS — giant distant shapes for deep parallax
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
var DETAIL_DISTANCE = -40;

// Scroll line constants
var SCROLL_LINE_COUNT = 30;
var SCROLL_LINE_SPACING = 2.5;
var SCROLL_LINE_FAR_Z = -80;
var SCROLL_LINE_NEAR_Z = 5;

// Wall marker constants
var WALL_MARKER_COUNT = 20;
var WALL_MARKER_SPACING = 4;
var WALL_MARKER_FAR_Z = -80;
var WALL_MARKER_NEAR_Z = 8;

// Skybox element constants
var SKYBOX_ELEMENT_COUNT = 6;
var SKYBOX_FAR_Z = -200;
var SKYBOX_NEAR_Z = 10;
var SKYBOX_SPEED_RATIO = 0.1; // 10% of game speed for deep parallax

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
        particleStates: [],
        scrollLines: [],
        wallMarkers: [],
        skyboxElements: []
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

    // Build scrolling ground lines (the critical runner illusion)
    buildScrollLines(scene, skin, trackRefs);

    // Build wall accent markers
    buildWallMarkers(scene, skin, trackRefs);

    // Build dynamic skybox elements
    buildSkyboxElements(scene, skin, trackRefs);

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

// ===== SCROLLING GROUND LINES =====

/**
 * Build a pool of horizontal line markers on the ground that scroll
 * toward the camera every frame. This is the fundamental visual cue
 * that creates the "runner" illusion — without these, the ground
 * appears completely stationary.
 *
 * Each line is a thin PlaneGeometry mesh lying flat on the track.
 * They move at game speed (same as coins/obstacles) and recycle
 * when they pass the camera.
 */
function buildScrollLines(scene, skin, trackRefs) {
    var c = skin.colors;

    // Primary color from skin's lane or glow color
    var lineColor = c.lane || c.wallGlow || 0x18ffff;

    for (var i = 0; i < SCROLL_LINE_COUNT; i++) {
        var z = SCROLL_LINE_FAR_Z + i * SCROLL_LINE_SPACING;

        // Main cross-track line
        var lineMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 0.06),
            new THREE.MeshBasicMaterial({
                color: lineColor,
                transparent: true,
                opacity: 0.15
            })
        );
        lineMesh.rotation.x = -Math.PI / 2;
        lineMesh.position.set(0, 0.02, z);

        // Store initial Z for recycling
        lineMesh.userData = {
            type: 'scrollLine',
            baseOpacity: 0.15
        };

        scene.add(lineMesh);
        trackRefs.scrollLines.push(lineMesh);

        // Add a slightly brighter, thinner center line for lane definition
        if (i % 3 === 0) {
            var centerLine = new THREE.Mesh(
                new THREE.PlaneGeometry(3, 0.04),
                new THREE.MeshBasicMaterial({
                    color: lineColor,
                    transparent: true,
                    opacity: 0.25
                })
            );
            centerLine.rotation.x = -Math.PI / 2;
            centerLine.position.set(0, 0.025, z + 1.2);
            centerLine.userData = {
                type: 'scrollLine',
                baseOpacity: 0.25
            };
            scene.add(centerLine);
            trackRefs.scrollLines.push(centerLine);
        }
    }
}

/**
 * Update scrolling ground lines each frame.
 * Lines move toward the camera at game speed. When they pass
 * the near threshold, they recycle to the far end.
 *
 * Called every frame by engine.js.
 *
 * @param {THREE.Mesh[]} scrollLines - Array of line meshes
 * @param {number} dt - Delta time
 * @param {number} move - Movement distance this frame
 */
export function updateScrollLines(scrollLines, dt, move) {
    if (!scrollLines || scrollLines.length === 0) return;

    for (var i = 0; i < scrollLines.length; i++) {
        var line = scrollLines[i];

        // Move toward camera at game speed
        line.position.z += move;

        // Recycle when past camera
        if (line.position.z > SCROLL_LINE_NEAR_Z) {
            line.position.z = SCROLL_LINE_FAR_Z + (line.position.z - SCROLL_LINE_NEAR_Z);
        }

        // Fade based on distance — lines closer to camera are slightly brighter
        var distRatio = 1.0 - Math.max(0, -line.position.z) / Math.abs(SCROLL_LINE_FAR_Z);
        var baseOp = line.userData.baseOpacity || 0.15;
        line.material.opacity = baseOp * (0.5 + distRatio * 0.5);
    }
}

// ===== WALL ACCENT MARKERS =====

/**
 * Build small glowing rectangular markers on both walls that flow
 * past at game speed. These reinforce the sense of motion on the
 * walls, complementing the ground lines.
 */
function buildWallMarkers(scene, skin, trackRefs) {
    var c = skin.colors;
    var markerColor = c.wallGlow || c.lane || 0x18ffff;

    for (var i = 0; i < WALL_MARKER_COUNT; i++) {
        var z = WALL_MARKER_FAR_Z + i * WALL_MARKER_SPACING;

        for (var side = -1; side <= 1; side += 2) {
            var x = side * 5.45;

            // Main accent rectangle
            var marker = new THREE.Mesh(
                new THREE.PlaneGeometry(0.08, 0.4),
                new THREE.MeshBasicMaterial({
                    color: markerColor,
                    transparent: true,
                    opacity: 0.35
                })
            );
            // Orient to face inward
            marker.position.set(x, 1.0 + (i % 3) * 0.5, z);
            marker.rotation.y = side * Math.PI / 2;

            marker.userData = {
                type: 'wallMarker',
                side: side,
                baseY: 1.0 + (i % 3) * 0.5
            };

            scene.add(marker);
            trackRefs.wallMarkers.push(marker);

            // Add a smaller dot marker at different height for variety
            if (i % 2 === 0) {
                var dot = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.12, 0.12),
                    new THREE.MeshBasicMaterial({
                        color: markerColor,
                        transparent: true,
                        opacity: 0.2
                    })
                );
                dot.position.set(x, 2.5 + (i % 4) * 0.3, z + 2);
                dot.rotation.y = side * Math.PI / 2;
                dot.userData = {
                    type: 'wallMarker',
                    side: side,
                    baseY: 2.5 + (i % 4) * 0.3
                };
                scene.add(dot);
                trackRefs.wallMarkers.push(dot);
            }
        }
    }
}

/**
 * Update wall accent markers each frame.
 * Markers flow past at game speed and recycle when past camera.
 *
 * @param {THREE.Mesh[]} wallMarkers - Array of marker meshes
 * @param {number} dt - Delta time
 * @param {number} move - Movement distance this frame
 */
export function updateWallMarkers(wallMarkers, dt, move) {
    if (!wallMarkers || wallMarkers.length === 0) return;

    for (var i = 0; i < wallMarkers.length; i++) {
        var marker = wallMarkers[i];

        // Move toward camera
        marker.position.z += move;

        // Recycle
        if (marker.position.z > WALL_MARKER_NEAR_Z) {
            marker.position.z = WALL_MARKER_FAR_Z + (marker.position.z - WALL_MARKER_NEAR_Z);
        }

        // Distance-based opacity
        var distRatio = 1.0 - Math.max(0, -marker.position.z) / Math.abs(WALL_MARKER_FAR_Z);
        marker.material.opacity = (0.15 + distRatio * 0.25);
    }
}

// ===== DYNAMIC SKYBOX ELEMENTS =====

/**
 * Build giant, distant background shapes behind the walls.
 * These move very slowly toward the camera (10% of game speed)
 * creating a deep parallax effect that adds visual depth.
 *
 * Shapes include giant pill capsules, massive DNA helixes,
 * huge hospital building silhouettes.
 */
function buildSkyboxElements(scene, skin, trackRefs) {
    var c = skin.colors;
    // Use a dimmed version of the skin's accent color
    var skyColor = c.archGlow || c.wallGlow || 0x18ffff;

    var builders = [
        buildSkyboxPillCapsule,
        buildSkyboxDNAHelix,
        buildSkyboxHospital,
        buildSkyboxCross,
        buildSkyboxHeartbeat,
        buildSkyboxMolecule
    ];

    for (var i = 0; i < SKYBOX_ELEMENT_COUNT; i++) {
        var builder = builders[i % builders.length];
        var element = builder(skyColor);

        // Position: far back, off to the sides, elevated
        var side = (i % 2 === 0) ? -1 : 1;
        var x = side * (15 + Math.random() * 10);
        var y = 5 + Math.random() * 10;
        var z = SKYBOX_FAR_Z + (i / SKYBOX_ELEMENT_COUNT) * (Math.abs(SKYBOX_FAR_Z) - 40);

        element.position.set(x, y, z);
        element.rotation.y = Math.random() * Math.PI * 2;

        var scale = 3 + Math.random() * 4;
        element.scale.set(scale, scale, scale);

        element.userData = {
            type: 'skyboxElement',
            rotSpeed: (Math.random() - 0.5) * 0.1
        };

        scene.add(element);
        trackRefs.skyboxElements.push(element);
    }
}

function buildSkyboxPillCapsule(color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
    var mat2 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.08 });

    var top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    top.position.y = 0.5;
    g.add(top);

    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 8), mat);
    g.add(body);

    var bottom = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat2);
    bottom.position.y = -0.5;
    g.add(bottom);

    return g;
}

function buildSkyboxDNAHelix(color) {
    var g = new THREE.Group();
    var mat1 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
    var mat2 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.07 });

    var segments = 16;
    var height = 3;
    var radius = 0.5;

    for (var i = 0; i < segments; i++) {
        var t = i / segments;
        var y = t * height - height / 2;
        var angle = t * Math.PI * 4;

        var s1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat1);
        s1.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        g.add(s1);

        var s2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat2);
        s2.position.set(-Math.cos(angle) * radius, y, -Math.sin(angle) * radius);
        g.add(s2);

        if (i % 3 === 0) {
            var rung = new THREE.Mesh(
                new THREE.CylinderGeometry(0.015, 0.015, radius * 2, 4),
                mat2
            );
            rung.position.set(0, y, 0);
            rung.rotation.z = Math.PI / 2;
            rung.rotation.y = angle;
            g.add(rung);
        }
    }
    return g;
}

function buildSkyboxHospital(color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.08 });

    // Main building
    var main = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1.5), mat);
    main.position.y = 1.5;
    g.add(main);

    // Windows (brighter dots)
    var winMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15 });
    for (var row = 0; row < 4; row++) {
        for (var col = 0; col < 3; col++) {
            var win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), winMat);
            win.position.set(-0.5 + col * 0.5, 0.8 + row * 0.7, 0.76);
            g.add(win);
        }
    }

    // Cross on top
    var crossMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.12 });
    var cH = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), crossMat);
    cH.position.set(0, 3.2, 0.76);
    g.add(cH);
    var cV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.05), crossMat);
    cV.position.set(0, 3.2, 0.76);
    g.add(cV);

    return g;
}

function buildSkyboxCross(color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });

    var h = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.1), mat);
    g.add(h);
    var v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.1), mat);
    g.add(v);

    // Glow ring
    var ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.0, 0.04, 8, 20),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.06 })
    );
    g.add(ring);

    return g;
}

function buildSkyboxHeartbeat(color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });

    // Simplified ECG line shape using boxes
    var segments = [
        { x: -1.5, y: 0, w: 0.6, h: 0.04 },
        { x: -0.8, y: 0.2, w: 0.04, h: 0.4 },
        { x: -0.5, y: -0.3, w: 0.04, h: 0.6 },
        { x: -0.2, y: 0.5, w: 0.04, h: 1.0 },
        { x: 0.1, y: -0.2, w: 0.04, h: 0.4 },
        { x: 0.4, y: 0, w: 0.8, h: 0.04 },
        { x: 1.2, y: 0, w: 0.6, h: 0.04 }
    ];

    for (var i = 0; i < segments.length; i++) {
        var s = segments[i];
        var seg = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 0.04), mat);
        seg.position.set(s.x, s.y, 0);
        g.add(seg);
    }

    return g;
}

function buildSkyboxMolecule(color) {
    var g = new THREE.Group();
    var atomMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
    var bondMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.06 });

    // Central atom
    var center = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), atomMat);
    g.add(center);

    // Surrounding atoms
    var positions = [
        [1, 0.5, 0], [-0.8, 0.7, 0.3], [0.3, -1, 0.2],
        [-0.5, -0.3, -0.8], [0.7, 0.2, -0.6]
    ];

    for (var i = 0; i < positions.length; i++) {
        var p = positions[i];
        var atom = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), atomMat);
        atom.position.set(p[0], p[1], p[2]);
        g.add(atom);

        // Bond line
        var bond = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]), 4),
            bondMat
        );
        bond.position.set(p[0]/2, p[1]/2, p[2]/2);
        bond.lookAt(new THREE.Vector3(p[0], p[1], p[2]));
        bond.rotateX(Math.PI / 2);
        g.add(bond);
    }

    return g;
}

/**
 * Update dynamic skybox elements each frame.
 * They move very slowly (10% of game speed) for deep parallax.
 * Recycle to far distance when they pass the camera.
 *
 * @param {THREE.Group[]} skyboxElements - Array of skybox element groups
 * @param {number} dt - Delta time
 * @param {number} move - Movement distance this frame (at game speed)
 * @param {number} time - Elapsed time for rotation animation
 */
export function updateSkyboxElements(skyboxElements, dt, move, time) {
    if (!skyboxElements || skyboxElements.length === 0) return;

    var skyboxMove = move * SKYBOX_SPEED_RATIO;

    for (var i = 0; i < skyboxElements.length; i++) {
        var el = skyboxElements[i];

        // Very slow movement toward camera
        el.position.z += skyboxMove;

        // Gentle rotation
        if (el.userData.rotSpeed) {
            el.rotation.y += el.userData.rotSpeed * dt;
        }

        // Recycle when past camera
        if (el.position.z > SKYBOX_NEAR_Z) {
            el.position.z = SKYBOX_FAR_Z + (el.position.z - SKYBOX_NEAR_Z);
            // Randomize position slightly on recycle
            var side = (Math.random() > 0.5) ? 1 : -1;
            el.position.x = side * (15 + Math.random() * 10);
            el.position.y = 5 + Math.random() * 10;
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
 * creating and destroying them.
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
 * (object pooling pattern).
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
 * Higher speeds widen the FOV for a tunnel-vision effect.
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
