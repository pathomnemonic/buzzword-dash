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
 * - SCROLLING GROUND LINES — pool of horizontal markers rushing toward camera
 * - SCROLLING WALL PANELS — visible rectangular meshes on both walls that
 *   move at game speed, creating the fundamental side-rail motion illusion
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

// Scroll line constants
var SCROLL_LINE_COUNT = 30;
var SCROLL_LINE_SPACING = 2.5;
var SCROLL_LINE_FAR_Z = -80;
var SCROLL_LINE_NEAR_Z = 5;

// Wall scroll panel constants
var WALL_PANEL_COUNT = 24;
var WALL_PANEL_SPACING = 3.5;
var WALL_PANEL_FAR_Z = -85;
var WALL_PANEL_NEAR_Z = 6;

// Wall marker constants
var WALL_MARKER_COUNT = 20;
var WALL_MARKER_SPACING = 4;
var WALL_MARKER_FAR_Z = -80;
var WALL_MARKER_NEAR_Z = 8;

// Skybox element constants
var SKYBOX_ELEMENT_COUNT = 6;
var SKYBOX_FAR_Z = -200;
var SKYBOX_NEAR_Z = 10;
var SKYBOX_SPEED_RATIO = 0.1;

// ===== MAIN TRACK BUILDER =====

export function buildTrack(scene, skin) {
    var trackRefs = {
        runningLights: [],
        particlePool: [],
        particleStates: [],
        scrollLines: [],
        wallScrollPanels: [],
        wallMarkers: [],
        skyboxElements: []
    };

    setupSkinLighting(skin, scene);

    var groundGroup = buildGround(skin);
    scene.add(groundGroup);

    buildWalls(scene, skin);
    buildArches(scene, skin);

    for (var glowSide = -1; glowSide <= 1; glowSide += 2) {
        var glowStrips = buildWallGlowStrips(skin, glowSide);
        scene.add(glowStrips);
    }

    buildRunningLights(scene, skin, trackRefs);
    createParticlePool(scene, skin, trackRefs);
    buildScrollLines(scene, skin, trackRefs);
    buildWallScrollPanels(scene, skin, trackRefs);
    buildWallMarkers(scene, skin, trackRefs);
    buildSkyboxElements(scene, skin, trackRefs);

    return trackRefs;
}

// ===== WALL CONSTRUCTION (static structure) =====

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

function buildScrollLines(scene, skin, trackRefs) {
    var c = skin.colors;
    var lineColor = c.lane || c.wallGlow || 0x18ffff;

    for (var i = 0; i < SCROLL_LINE_COUNT; i++) {
        var z = SCROLL_LINE_FAR_Z + i * SCROLL_LINE_SPACING;

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
        lineMesh.userData = { type: 'scrollLine', baseOpacity: 0.15 };
        scene.add(lineMesh);
        trackRefs.scrollLines.push(lineMesh);

        // Thinner center accent every 3rd line
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
            centerLine.userData = { type: 'scrollLine', baseOpacity: 0.25 };
            scene.add(centerLine);
            trackRefs.scrollLines.push(centerLine);
        }
    }
}

export function updateScrollLines(scrollLines, dt, move) {
    if (!scrollLines || scrollLines.length === 0) return;

    for (var i = 0; i < scrollLines.length; i++) {
        var line = scrollLines[i];
        line.position.z += move;

        if (line.position.z > SCROLL_LINE_NEAR_Z) {
            line.position.z = SCROLL_LINE_FAR_Z + (line.position.z - SCROLL_LINE_NEAR_Z);
        }

        var distRatio = 1.0 - Math.max(0, -line.position.z) / Math.abs(SCROLL_LINE_FAR_Z);
        var baseOp = line.userData.baseOpacity || 0.15;
        line.material.opacity = baseOp * (0.5 + distRatio * 0.5);
    }
}

// ===== SCROLLING WALL PANELS (the critical side-rail motion fix) =====
//
// The static wall segments built by buildWalls() provide structure but
// never move. These scrolling panels are bright, visible rectangular
// meshes placed ON the walls that move toward the camera at game speed.
// They create the fundamental illusion that the walls are rushing past.
// Without these, the side rails appear completely frozen during gameplay.
//
// Each panel is a thin PlaneGeometry oriented to face inward from the wall.
// Panels are placed at multiple heights for visual richness. They recycle
// when they pass the camera, just like ground lines do.

function buildWallScrollPanels(scene, skin, trackRefs) {
    var c = skin.colors;
    var panelColor = c.wallGlow || c.lane || 0x18ffff;
    var panelColorDim = c.wallB || c.wallA || 0x222266;

    for (var i = 0; i < WALL_PANEL_COUNT; i++) {
        var z = WALL_PANEL_FAR_Z + i * WALL_PANEL_SPACING;

        for (var side = -1; side <= 1; side += 2) {
            var x = side * 5.48;

            // Primary bright horizontal stripe — the most visible motion cue
            var stripe = new THREE.Mesh(
                new THREE.PlaneGeometry(0.06, 2.0),
                new THREE.MeshBasicMaterial({
                    color: panelColor,
                    transparent: true,
                    opacity: 0.25
                })
            );
            stripe.position.set(x, 1.5, z);
            stripe.rotation.y = side * (-Math.PI / 2);
            stripe.userData = {
                type: 'wallScrollPanel',
                side: side,
                baseOpacity: 0.25,
                height: 'mid'
            };
            scene.add(stripe);
            trackRefs.wallScrollPanels.push(stripe);

            // Secondary stripe at different height for depth
            var stripe2 = new THREE.Mesh(
                new THREE.PlaneGeometry(0.04, 1.2),
                new THREE.MeshBasicMaterial({
                    color: panelColor,
                    transparent: true,
                    opacity: 0.15
                })
            );
            stripe2.position.set(x, 2.8, z + WALL_PANEL_SPACING * 0.5);
            stripe2.rotation.y = side * (-Math.PI / 2);
            stripe2.userData = {
                type: 'wallScrollPanel',
                side: side,
                baseOpacity: 0.15,
                height: 'high'
            };
            scene.add(stripe2);
            trackRefs.wallScrollPanels.push(stripe2);

            // Bottom edge stripe near the ground for grounding the motion
            var stripe3 = new THREE.Mesh(
                new THREE.PlaneGeometry(0.05, 0.8),
                new THREE.MeshBasicMaterial({
                    color: panelColorDim,
                    transparent: true,
                    opacity: 0.18
                })
            );
            stripe3.position.set(x, 0.4, z + WALL_PANEL_SPACING * 0.3);
            stripe3.rotation.y = side * (-Math.PI / 2);
            stripe3.userData = {
                type: 'wallScrollPanel',
                side: side,
                baseOpacity: 0.18,
                height: 'low'
            };
            scene.add(stripe3);
            trackRefs.wallScrollPanels.push(stripe3);

            // Horizontal panel segment (perpendicular to the vertical stripes)
            // Creates a grid-like pattern on the walls when combined with verticals
            if (i % 2 === 0) {
                var hPanel = new THREE.Mesh(
                    new THREE.PlaneGeometry(2.0, 0.04),
                    new THREE.MeshBasicMaterial({
                        color: panelColor,
                        transparent: true,
                        opacity: 0.12
                    })
                );
                hPanel.position.set(x, 1.5 + (i % 3) * 0.6, z);
                hPanel.rotation.y = side * (-Math.PI / 2);
                hPanel.userData = {
                    type: 'wallScrollPanel',
                    side: side,
                    baseOpacity: 0.12,
                    height: 'mid'
                };
                scene.add(hPanel);
                trackRefs.wallScrollPanels.push(hPanel);
            }
        }
    }
}

export function updateWallScrollPanels(wallScrollPanels, dt, move) {
    if (!wallScrollPanels || wallScrollPanels.length === 0) return;

    for (var i = 0; i < wallScrollPanels.length; i++) {
        var panel = wallScrollPanels[i];

        // Move toward camera at game speed (same as coins/obstacles)
        panel.position.z += move;

        // Recycle when past camera
        if (panel.position.z > WALL_PANEL_NEAR_Z) {
            panel.position.z = WALL_PANEL_FAR_Z + (panel.position.z - WALL_PANEL_NEAR_Z);
        }

        // Distance-based opacity — closer panels are brighter
        var distRatio = 1.0 - Math.max(0, -panel.position.z) / Math.abs(WALL_PANEL_FAR_Z);
        var baseOp = panel.userData.baseOpacity || 0.2;
        panel.material.opacity = baseOp * (0.4 + distRatio * 0.6);
    }
}

// ===== WALL ACCENT MARKERS =====

function buildWallMarkers(scene, skin, trackRefs) {
    var c = skin.colors;
    var markerColor = c.wallGlow || c.lane || 0x18ffff;

    for (var i = 0; i < WALL_MARKER_COUNT; i++) {
        var z = WALL_MARKER_FAR_Z + i * WALL_MARKER_SPACING;

        for (var side = -1; side <= 1; side += 2) {
            var x = side * 5.45;

            var marker = new THREE.Mesh(
                new THREE.PlaneGeometry(0.08, 0.4),
                new THREE.MeshBasicMaterial({
                    color: markerColor,
                    transparent: true,
                    opacity: 0.35
                })
            );
            marker.position.set(x, 1.0 + (i % 3) * 0.5, z);
            marker.rotation.y = side * (-Math.PI / 2);
            marker.userData = { type: 'wallMarker', side: side };
            scene.add(marker);
            trackRefs.wallMarkers.push(marker);

            // Smaller dot accent at different height
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
                dot.rotation.y = side * (-Math.PI / 2);
                dot.userData = { type: 'wallMarker', side: side };
                scene.add(dot);
                trackRefs.wallMarkers.push(dot);
            }
        }
    }
}

export function updateWallMarkers(wallMarkers, dt, move) {
    if (!wallMarkers || wallMarkers.length === 0) return;

    for (var i = 0; i < wallMarkers.length; i++) {
        var marker = wallMarkers[i];
        marker.position.z += move;

        if (marker.position.z > WALL_MARKER_NEAR_Z) {
            marker.position.z = WALL_MARKER_FAR_Z + (marker.position.z - WALL_MARKER_NEAR_Z);
        }

        var distRatio = 1.0 - Math.max(0, -marker.position.z) / Math.abs(WALL_MARKER_FAR_Z);
        marker.material.opacity = (0.15 + distRatio * 0.25);
    }
}

// ===== DYNAMIC SKYBOX ELEMENTS =====

function buildSkyboxElements(scene, skin, trackRefs) {
    var c = skin.colors;
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

        var side = (i % 2 === 0) ? -1 : 1;
        var x = side * (15 + Math.random() * 10);
        var y = 5 + Math.random() * 10;
        var z = SKYBOX_FAR_Z + (i / SKYBOX_ELEMENT_COUNT) * (Math.abs(SKYBOX_FAR_Z) - 40);

        element.position.set(x, y, z);
        element.rotation.y = Math.random() * Math.PI * 2;

        var scale = 3 + Math.random() * 4;
        element.scale.set(scale, scale, scale);

        element.userData = { type: 'skyboxElement', rotSpeed: (Math.random() - 0.5) * 0.1 };
        scene.add(element);
        trackRefs.skyboxElements.push(element);
    }
}

function buildSkyboxPillCapsule(color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
    var mat2 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.08 });
    var top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    top.position.y = 0.5; g.add(top);
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 8), mat);
    g.add(body);
    var bottom = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat2);
    bottom.position.y = -0.5; g.add(bottom);
    return g;
}

function buildSkyboxDNAHelix(color) {
    var g = new THREE.Group();
    var mat1 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
    var mat2 = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.07 });
    var segments = 16;
    for (var i = 0; i < segments; i++) {
        var t = i / segments;
        var y = t * 3 - 1.5;
        var angle = t * Math.PI * 4;
        var s1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat1);
        s1.position.set(Math.cos(angle) * 0.5, y, Math.sin(angle) * 0.5); g.add(s1);
        var s2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat2);
        s2.position.set(-Math.cos(angle) * 0.5, y, -Math.sin(angle) * 0.5); g.add(s2);
        if (i % 3 === 0) {
            var rung = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 4), mat2);
            rung.position.set(0, y, 0); rung.rotation.z = Math.PI / 2; rung.rotation.y = angle; g.add(rung);
        }
    }
    return g;
}

function buildSkyboxHospital(color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.08 });
    var main = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1.5), mat);
    main.position.y = 1.5; g.add(main);
    var winMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.15 });
    for (var row = 0; row < 4; row++) {
        for (var col = 0; col < 3; col++) {
            var win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), winMat);
            win.position.set(-0.5 + col * 0.5, 0.8 + row * 0.7, 0.76); g.add(win);
        }
    }
    return g;
}

function buildSkyboxCross(color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.1), mat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.1), mat));
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
    var segments = [
        { x: -1.5, y: 0, w: 0.6, h: 0.04 }, { x: -0.8, y: 0.2, w: 0.04, h: 0.4 },
        { x: -0.5, y: -0.3, w: 0.04, h: 0.6 }, { x: -0.2, y: 0.5, w: 0.04, h: 1.0 },
        { x: 0.1, y: -0.2, w: 0.04, h: 0.4 }, { x: 0.4, y: 0, w: 0.8, h: 0.04 },
        { x: 1.2, y: 0, w: 0.6, h: 0.04 }
    ];
    for (var i = 0; i < segments.length; i++) {
        var s = segments[i];
        var seg = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 0.04), mat);
        seg.position.set(s.x, s.y, 0); g.add(seg);
    }
    return g;
}

function buildSkyboxMolecule(color) {
    var g = new THREE.Group();
    var atomMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.1 });
    var bondMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.06 });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), atomMat));
    var positions = [[1, 0.5, 0], [-0.8, 0.7, 0.3], [0.3, -1, 0.2], [-0.5, -0.3, -0.8], [0.7, 0.2, -0.6]];
    for (var i = 0; i < positions.length; i++) {
        var p = positions[i];
        var atom = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), atomMat);
        atom.position.set(p[0], p[1], p[2]); g.add(atom);
        var len = Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]);
        var bond = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 4), bondMat);
        bond.position.set(p[0]/2, p[1]/2, p[2]/2);
        bond.lookAt(new THREE.Vector3(p[0], p[1], p[2]));
        bond.rotateX(Math.PI / 2); g.add(bond);
    }
    return g;
}

export function updateSkyboxElements(skyboxElements, dt, move, time) {
    if (!skyboxElements || skyboxElements.length === 0) return;
    var skyboxMove = move * SKYBOX_SPEED_RATIO;

    for (var i = 0; i < skyboxElements.length; i++) {
        var el = skyboxElements[i];
        el.position.z += skyboxMove;
        if (el.userData.rotSpeed) el.rotation.y += el.userData.rotSpeed * dt;
        if (el.position.z > SKYBOX_NEAR_Z) {
            el.position.z = SKYBOX_FAR_Z + (el.position.z - SKYBOX_NEAR_Z);
            var side = (Math.random() > 0.5) ? 1 : -1;
            el.position.x = side * (15 + Math.random() * 10);
            el.position.y = 5 + Math.random() * 10;
        }
    }
}

// ===== RUNNING LIGHTS =====

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
            light.userData = { baseZ: z, side: side, baseOpacity: 0.15, maxOpacity: 0.7 };
            scene.add(light);
            trackRefs.runningLights.push(light);
        }
    }
}

export function updateRunningLights(runningLights, time, speed) {
    if (!runningLights || runningLights.length === 0) return;
    var waveSpeed = speed * 0.3;
    var waveLength = 20;

    for (var i = 0; i < runningLights.length; i++) {
        var light = runningLights[i];
        var d = light.userData;
        var phase = (d.baseZ + time * waveSpeed) / waveLength;
        var wave = (Math.sin(phase * Math.PI * 2) + 1) * 0.5;
        light.material.opacity = d.baseOpacity + wave * (d.maxOpacity - d.baseOpacity);
    }
}

// ===== ATMOSPHERIC PARTICLE POOL =====

function createParticlePool(scene, skin, trackRefs) {
    for (var i = 0; i < PARTICLE_POOL_SIZE; i++) {
        var particle = buildAtmosphericParticle(skin);
        var px = (Math.random() - 0.5) * 10;
        var py = 0.5 + Math.random() * 4;
        var pz = -150 + Math.random() * 170;
        particle.position.set(px, py, pz);
        particle.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
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

export function updateAtmosphericParticles(particlePool, particleStates, dt, move, time) {
    if (!particlePool || particlePool.length === 0) return;

    for (var i = 0; i < particlePool.length; i++) {
        var p = particlePool[i];
        var s = particleStates[i];
        p.position.z += move * 0.5;
        p.position.x += s.vx * dt;
        p.position.y = s.baseY + Math.sin(time * 0.5 + s.driftPhase) * 0.3;
        p.rotation.y += s.rotSpeed * dt;
        p.rotation.x += s.rotSpeed * dt * 0.3;
        if (p.position.z > 8) {
            p.position.z = -150 - Math.random() * 30;
            p.position.x = (Math.random() - 0.5) * 10;
            s.baseY = 0.5 + Math.random() * 4;
            p.position.y = s.baseY;
            s.vx = (Math.random() - 0.5) * 0.3;
            s.driftPhase = Math.random() * Math.PI * 2;
        }
        if (p.position.x > 5) { p.position.x = 5; s.vx *= -1; }
        if (p.position.x < -5) { p.position.x = -5; s.vx *= -1; }
    }
}

// ===== FLYING ENVIRONMENT PROPS =====

export function spawnEnvProp(scene, envPropMeshes, selectedSubjects) {
    var builders = selectedSubjects ? getSpecialtyProps(selectedSubjects) : PROP_BUILDERS;
    var builder = builders[Math.floor(Math.random() * builders.length)];
    var prop = builder();

    var placement = Math.random();
    if (placement < 0.35) {
        prop.position.set(-7 - Math.random() * 4, Math.random() * 3, -80 - Math.random() * 20);
    } else if (placement < 0.7) {
        prop.position.set(7 + Math.random() * 4, Math.random() * 3, -80 - Math.random() * 20);
    } else if (placement < 0.9) {
        prop.position.set((Math.random() - 0.5) * 10, 4 + Math.random() * 4, -80 - Math.random() * 20);
    } else {
        prop.position.set((Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 2), 1 + Math.random() * 2, -90 - Math.random() * 10);
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

export function calculateTargetFOV(baseSpeed, currentSpeed, baseFOV, maxFOV, isRushing) {
    if (!baseFOV) baseFOV = 70;
    if (!maxFOV) maxFOV = 85;
    var speedRatio = currentSpeed / Math.max(baseSpeed, 0.01);
    var normalizedSpeed = Math.min(Math.max((speedRatio - 1) / 1.5, 0), 1);
    var targetFOV = baseFOV + normalizedSpeed * (maxFOV - baseFOV);
    if (isRushing) targetFOV = Math.min(targetFOV + 5, maxFOV + 5);
    return targetFOV;
}

export function updateCameraFOV(camera, targetFOV, dt, lerpSpeed) {
    if (!lerpSpeed) lerpSpeed = 2.0;
    var diff = targetFOV - camera.fov;
    if (Math.abs(diff) > 0.01) {
        camera.fov += diff * Math.min(1, lerpSpeed * dt);
        camera.updateProjectionMatrix();
    }
}

// ===== CAMERA LANE LEAN =====

export function calculateCameraLean(currentCameraX, targetLane, dt, baseCameraX) {
    if (baseCameraX === undefined) baseCameraX = 0;
    var laneOffset = (targetLane - 1) * 0.5;
    var targetX = baseCameraX + laneOffset;
    var diff = targetX - currentCameraX;
    return currentCameraX + diff * Math.min(1, 4 * dt);
}

// ===== STREAK VISUAL ENHANCEMENT =====

export function getStreakVisualIntensity(streak) {
    return {
        glowMultiplier: 1.0 + Math.min(streak * 0.02, 0.5),
        particleDensity: 1.0 + Math.min(streak * 0.05, 1.5),
        fovBoost: Math.min(streak * 0.1, 2.0),
        colorShift: Math.min(streak * 0.01, 0.3)
    };
}
