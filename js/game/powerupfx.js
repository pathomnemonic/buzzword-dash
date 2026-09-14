/**
 * powerupfx.js — Power-up visual effects on the player character
 *
 * Each active power-up gets a distinct visual effect attached to
 * or surrounding the player model. Effects are created once and
 * toggled on/off based on power-up state.
 *
 * FIX APPLIED: Effect group positions are now explicitly set every
 * frame using group.position.set(px, py, pz) instead of
 * group.position.copy() which can fail for certain object types.
 * All effect groups are added to the scene (not to the player group)
 * so they must be repositioned every frame.
 *
 * Visual design principles:
 * - Each effect must be instantly recognizable at a glance
 * - Effects should not obscure the player or track
 * - Stacking effects (Rush Boost) must visually intensify
 * - All effects use MeshBasicMaterial for performance
 * - Effects are updated every frame for animation
 */

import * as THREE from 'three';

export class PowerUpFX {
    constructor(scene) {
        this.scene = scene;
        this.effects = {};
        this.time = 0;

        this.createShieldEffect();
        this.createMagnetEffect();
        this.createDoubleEffect();
        this.createRushBoostEffect();
        this.createAutoPilotEffect();
        this.createScoreFrenzyEffect();

        // Hide all initially
        this.hideAll();
    }

    // ===== SHIELD (Code Blue) =====
    // Translucent blue bubble sphere around player

    createShieldEffect() {
        var group = new THREE.Group();

        // Outer bubble
        var outerBubble = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.2, 2),
            new THREE.MeshBasicMaterial({
                color: 0x4488ff,
                transparent: true,
                opacity: 0.12,
                wireframe: false,
                side: THREE.DoubleSide
            })
        );
        group.add(outerBubble);

        // Wireframe overlay for hexagonal pattern
        var wireframe = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.22, 1),
            new THREE.MeshBasicMaterial({
                color: 0x66aaff,
                transparent: true,
                opacity: 0.2,
                wireframe: true
            })
        );
        group.add(wireframe);

        // Inner glow
        var innerGlow = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.0, 2),
            new THREE.MeshBasicMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.06
            })
        );
        group.add(innerGlow);

        group.visible = false;
        this.scene.add(group);
        this.effects.shield = {
            group: group,
            outer: outerBubble,
            wireframe: wireframe,
            inner: innerGlow
        };
    }

    // ===== COIN MAGNET =====
    // Golden glow aura + orbiting ring + orbiting spheres

    createMagnetEffect() {
        var group = new THREE.Group();

        // Golden aura sphere
        var aura = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 12, 12),
            new THREE.MeshBasicMaterial({
                color: 0xffaa00,
                transparent: true,
                opacity: 0.08
            })
        );
        group.add(aura);

        // Orbiting ring at waist level
        var ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.9, 0.04, 8, 24),
            new THREE.MeshBasicMaterial({
                color: 0xffd740,
                transparent: true,
                opacity: 0.5
            })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.8;
        group.add(ring);

        // Second ring slightly tilted
        var ring2 = new THREE.Mesh(
            new THREE.TorusGeometry(0.85, 0.03, 8, 24),
            new THREE.MeshBasicMaterial({
                color: 0xffcc00,
                transparent: true,
                opacity: 0.3
            })
        );
        ring2.rotation.x = Math.PI / 2.5;
        ring2.position.y = 0.8;
        group.add(ring2);

        // Small orbiting golden spheres
        for (var i = 0; i < 4; i++) {
            var orb = new THREE.Mesh(
                new THREE.SphereGeometry(0.06, 6, 6),
                new THREE.MeshBasicMaterial({ color: 0xffd740 })
            );
            orb.userData.orbitAngle = (i / 4) * Math.PI * 2;
            orb.userData.orbitRadius = 0.95;
            orb.userData.orbitSpeed = 2;
            group.add(orb);
        }

        group.visible = false;
        this.scene.add(group);
        this.effects.magnet = {
            group: group,
            ring: ring,
            ring2: ring2,
            aura: aura
        };
    }

    // ===== DOUBLE SCORE (2×) =====
    // Purple energy rings pulsing outward from player

    createDoubleEffect() {
        var group = new THREE.Group();

        // Persistent purple tint aura
        var aura = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 10, 10),
            new THREE.MeshBasicMaterial({
                color: 0xaa44ff,
                transparent: true,
                opacity: 0.06
            })
        );
        group.add(aura);

        // Pulse rings (3 rings at different stages of expansion)
        var rings = [];
        for (var i = 0; i < 3; i++) {
            var ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.5 + i * 0.3, 0.02, 6, 20),
                new THREE.MeshBasicMaterial({
                    color: 0xcc66ff,
                    transparent: true,
                    opacity: 0.4 - i * 0.12
                })
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.8;
            ring.userData.pulsePhase = i / 3;
            rings.push(ring);
            group.add(ring);
        }

        // Star shapes orbiting
        for (var s = 0; s < 3; s++) {
            var star = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.08, 0),
                new THREE.MeshBasicMaterial({ color: 0xdd88ff })
            );
            star.userData.orbitAngle = (s / 3) * Math.PI * 2;
            group.add(star);
        }

        group.visible = false;
        this.scene.add(group);
        this.effects.double = {
            group: group,
            rings: rings,
            aura: aura
        };
    }

    // ===== RUSH BOOST =====
    // Orange/red flames that intensify with stacks (1-3)

    createRushBoostEffect() {
        var group = new THREE.Group();

        // Layer 1: small flames (always visible when active)
        var flameSmall = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 8, 8),
            new THREE.MeshBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 0.1
            })
        );
        flameSmall.position.y = 0.3;
        group.add(flameSmall);

        // Layer 2: medium flames (2+ stacks)
        var flameMed = new THREE.Mesh(
            new THREE.SphereGeometry(0.85, 8, 8),
            new THREE.MeshBasicMaterial({
                color: 0xff4400,
                transparent: true,
                opacity: 0
            })
        );
        flameMed.position.y = 0.5;
        group.add(flameMed);

        // Layer 3: large flames (3 stacks — full inferno)
        var flameLarge = new THREE.Mesh(
            new THREE.SphereGeometry(1.1, 10, 10),
            new THREE.MeshBasicMaterial({
                color: 0xff2200,
                transparent: true,
                opacity: 0
            })
        );
        flameLarge.position.y = 0.7;
        group.add(flameLarge);

        // Flame particles (small spheres that rise)
        var particles = [];
        for (var p = 0; p < 8; p++) {
            var particle = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 4, 4),
                new THREE.MeshBasicMaterial({
                    color: p % 2 === 0 ? 0xff8800 : 0xffcc00,
                    transparent: true,
                    opacity: 0.6
                })
            );
            particle.userData.phase = (p / 8) * Math.PI * 2;
            particle.userData.speed = 1 + Math.random() * 0.5;
            particle.userData.radius = 0.3 + Math.random() * 0.3;
            particles.push(particle);
            group.add(particle);
        }

        // Fire ring at feet
        var fireRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.7, 0.05, 6, 16),
            new THREE.MeshBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 0
            })
        );
        fireRing.rotation.x = Math.PI / 2;
        fireRing.position.y = 0.05;
        group.add(fireRing);

        group.visible = false;
        this.scene.add(group);
        this.effects.rushBoost = {
            group: group,
            flameSmall: flameSmall,
            flameMed: flameMed,
            flameLarge: flameLarge,
            particles: particles,
            fireRing: fireRing,
            stacks: 0
        };
    }

    // ===== AUTO-PILOT (Epinephrine) =====
    // Green medical cross above head + green outline glow

    createAutoPilotEffect() {
        var group = new THREE.Group();

        // Green aura around player
        var aura = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 10, 10),
            new THREE.MeshBasicMaterial({
                color: 0x00ee66,
                transparent: true,
                opacity: 0.08
            })
        );
        group.add(aura);

        // Medical cross above head
        var crossH = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.12, 0.08),
            new THREE.MeshBasicMaterial({ color: 0x00ff66 })
        );
        crossH.position.y = 2.3;
        group.add(crossH);

        var crossV = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.4, 0.08),
            new THREE.MeshBasicMaterial({ color: 0x00ff66 })
        );
        crossV.position.y = 2.3;
        group.add(crossV);

        // Outer glow ring around cross
        var crossGlow = new THREE.Mesh(
            new THREE.TorusGeometry(0.3, 0.03, 6, 12),
            new THREE.MeshBasicMaterial({
                color: 0x44ff88,
                transparent: true,
                opacity: 0.3
            })
        );
        crossGlow.position.y = 2.3;
        group.add(crossGlow);

        // Green ring at feet
        var footRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.8, 0.03, 6, 16),
            new THREE.MeshBasicMaterial({
                color: 0x00ff66,
                transparent: true,
                opacity: 0.3
            })
        );
        footRing.rotation.x = Math.PI / 2;
        footRing.position.y = 0.05;
        group.add(footRing);

        group.visible = false;
        this.scene.add(group);
        this.effects.autoPilot = {
            group: group,
            crossH: crossH,
            crossV: crossV,
            crossGlow: crossGlow,
            aura: aura,
            footRing: footRing
        };
    }

    // ===== SCORE FRENZY =====
    // Pink/magenta energy burst with diamond particles

    createScoreFrenzyEffect() {
        var group = new THREE.Group();

        // Pink aura
        var aura = new THREE.Mesh(
            new THREE.SphereGeometry(0.75, 10, 10),
            new THREE.MeshBasicMaterial({
                color: 0xff4488,
                transparent: true,
                opacity: 0.07
            })
        );
        group.add(aura);

        // Orbiting diamonds
        var diamonds = [];
        for (var d = 0; d < 5; d++) {
            var diamond = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.1, 0),
                new THREE.MeshBasicMaterial({
                    color: 0xff66aa,
                    transparent: true,
                    opacity: 0.7
                })
            );
            diamond.userData.orbitAngle = (d / 5) * Math.PI * 2;
            diamond.userData.orbitSpeed = 1.8 + d * 0.2;
            diamond.userData.orbitRadius = 0.9;
            diamond.userData.heightOffset = d * 0.3;
            diamonds.push(diamond);
            group.add(diamond);
        }

        // Pulsing ring
        var ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.85, 0.03, 6, 20),
            new THREE.MeshBasicMaterial({
                color: 0xff4488,
                transparent: true,
                opacity: 0.4
            })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 1.0;
        group.add(ring);

        group.visible = false;
        this.scene.add(group);
        this.effects.scoreFrenzy = {
            group: group,
            aura: aura,
            diamonds: diamonds,
            ring: ring
        };
    }

    // ===== UPDATE (called every frame) =====
    //
    // CRITICAL FIX: Each effect group's position is explicitly set
    // using group.position.set(px, py, pz) every frame.
    // This ensures effects follow the player regardless of how
    // the player position is represented (Vector3, plain object, etc.)
    //
    // Previously, group.position.copy(playerPos) could fail if
    // playerPos was a plain {x, y, z} object rather than a Vector3.

    update(dt, playerPos, powerups, rushBoostStacks) {
        this.time += dt;

        // Extract player position as plain numbers for maximum compatibility
        var px = playerPos.x || 0;
        var py = playerPos.y || 0;
        var pz = playerPos.z || 0;

        // ===== POSITION ALL EFFECT GROUPS AT PLAYER =====
        // Use explicit .set() — NOT .copy() — for safety
        for (var key in this.effects) {
            if (this.effects[key] && this.effects[key].group) {
                this.effects[key].group.position.set(px, py, pz);
            }
        }

        // --- Shield ---
        var shieldActive = powerups.shield > 0;
        if (this.effects.shield) {
            this.effects.shield.group.visible = shieldActive;
            if (shieldActive) {
                this.effects.shield.wireframe.rotation.y += dt * 0.5;
                this.effects.shield.wireframe.rotation.x += dt * 0.3;
                this.effects.shield.outer.material.opacity = 0.1 + Math.sin(this.time * 2) * 0.03;
                // Subtle pulse on inner glow
                this.effects.shield.inner.material.opacity = 0.04 + Math.sin(this.time * 3) * 0.02;
            }
        }

        // --- Magnet ---
        var magnetActive = powerups.magnet > 0;
        if (this.effects.magnet) {
            this.effects.magnet.group.visible = magnetActive;
            if (magnetActive) {
                this.effects.magnet.ring.rotation.z += dt * 1.5;
                this.effects.magnet.ring2.rotation.z -= dt * 1.0;
                // Orbit golden spheres
                var children = this.effects.magnet.group.children;
                for (var mi = 0; mi < children.length; mi++) {
                    if (children[mi].userData.orbitAngle !== undefined) {
                        children[mi].userData.orbitAngle += dt * children[mi].userData.orbitSpeed;
                        var a = children[mi].userData.orbitAngle;
                        var r = children[mi].userData.orbitRadius;
                        children[mi].position.set(
                            Math.cos(a) * r,
                            0.8 + Math.sin(this.time * 3 + mi) * 0.1,
                            Math.sin(a) * r
                        );
                    }
                }
            }
        }

        // --- Double Score ---
        var doubleActive = powerups.double > 0;
        if (this.effects.double) {
            this.effects.double.group.visible = doubleActive;
            if (doubleActive) {
                // Pulse rings expand and fade
                for (var di = 0; di < this.effects.double.rings.length; di++) {
                    var ring = this.effects.double.rings[di];
                    var phase = (this.time * 0.8 + ring.userData.pulsePhase) % 1;
                    var scale = 1 + phase * 1.5;
                    ring.scale.set(scale, scale, scale);
                    ring.material.opacity = (1 - phase) * 0.3;
                }
                // Orbit stars
                var dChildren = this.effects.double.group.children;
                for (var dci = 0; dci < dChildren.length; dci++) {
                    if (dChildren[dci].userData.orbitAngle !== undefined) {
                        dChildren[dci].userData.orbitAngle += dt * 1.5;
                        var da = dChildren[dci].userData.orbitAngle;
                        dChildren[dci].position.set(
                            Math.cos(da) * 1.0,
                            1.2 + Math.sin(this.time * 2 + dci) * 0.2,
                            Math.sin(da) * 1.0
                        );
                        dChildren[dci].rotation.y += dt * 3;
                    }
                }
            }
        }

        // --- Rush Boost (stackable) ---
        var rushActive = rushBoostStacks > 0;
        if (this.effects.rushBoost) {
            this.effects.rushBoost.group.visible = rushActive;
            if (rushActive) {
                var stacks = Math.min(rushBoostStacks, 3);

                // Scale flame layers based on stacks
                this.effects.rushBoost.flameSmall.material.opacity = 0.1 + stacks * 0.03;
                this.effects.rushBoost.flameSmall.scale.set(
                    1 + Math.sin(this.time * 8) * 0.1,
                    1 + Math.sin(this.time * 6) * 0.15,
                    1 + Math.sin(this.time * 7) * 0.1
                );

                this.effects.rushBoost.flameMed.material.opacity = stacks >= 2 ? 0.08 : 0;
                this.effects.rushBoost.flameMed.scale.set(
                    1 + Math.sin(this.time * 7) * 0.12,
                    1 + Math.sin(this.time * 5) * 0.18,
                    1 + Math.sin(this.time * 6) * 0.12
                );

                this.effects.rushBoost.flameLarge.material.opacity = stacks >= 3 ? 0.06 : 0;
                this.effects.rushBoost.flameLarge.scale.set(
                    1 + Math.sin(this.time * 6) * 0.15,
                    1 + Math.sin(this.time * 4) * 0.2,
                    1 + Math.sin(this.time * 5) * 0.15
                );

                // Fire ring visibility
                this.effects.rushBoost.fireRing.material.opacity = stacks * 0.15;
                this.effects.rushBoost.fireRing.rotation.z += dt * (2 + stacks);

                // Flame particles rise and cycle
                for (var fp = 0; fp < this.effects.rushBoost.particles.length; fp++) {
                    var fpart = this.effects.rushBoost.particles[fp];
                    // Only show particles proportional to stacks
                    fpart.visible = fp < stacks * 3;
                    if (fpart.visible) {
                        var fPhase = (this.time * fpart.userData.speed + fpart.userData.phase) % 1;
                        fpart.position.set(
                            Math.cos(this.time * 3 + fpart.userData.phase) * fpart.userData.radius,
                            fPhase * 2.0,
                            Math.sin(this.time * 3 + fpart.userData.phase) * fpart.userData.radius
                        );
                        fpart.material.opacity = (1 - fPhase) * 0.6;
                        var fScale = (1 - fPhase) * 0.8 + 0.2;
                        fpart.scale.set(fScale, fScale, fScale);
                    }
                }
            }
        }

        // --- Auto-Pilot ---
        var autoActive = powerups.autoPilot > 0;
        if (this.effects.autoPilot) {
            this.effects.autoPilot.group.visible = autoActive;
            if (autoActive) {
                // Cross rotates slowly
                this.effects.autoPilot.crossH.rotation.y += dt * 1.0;
                this.effects.autoPilot.crossV.rotation.y += dt * 1.0;
                this.effects.autoPilot.crossGlow.rotation.y += dt * 1.0;
                // Cross bobs up and down
                var bobY = 2.3 + Math.sin(this.time * 2) * 0.1;
                this.effects.autoPilot.crossH.position.y = bobY;
                this.effects.autoPilot.crossV.position.y = bobY;
                this.effects.autoPilot.crossGlow.position.y = bobY;
                // Foot ring pulses
                this.effects.autoPilot.footRing.material.opacity = 0.2 + Math.sin(this.time * 3) * 0.1;
            }
        }

        // --- Score Frenzy ---
        var frenzyActive = powerups.scoreFrenzy > 0;
        if (this.effects.scoreFrenzy) {
            this.effects.scoreFrenzy.group.visible = frenzyActive;
            if (frenzyActive) {
                // Aura pulse
                this.effects.scoreFrenzy.aura.material.opacity = 0.05 + Math.sin(this.time * 4) * 0.03;

                // Ring pulse
                var ringPhase = (this.time * 1.2) % 1;
                var ringScale = 1 + ringPhase * 0.5;
                this.effects.scoreFrenzy.ring.scale.set(ringScale, ringScale, ringScale);
                this.effects.scoreFrenzy.ring.material.opacity = (1 - ringPhase) * 0.4;

                // Orbiting diamonds
                for (var fi = 0; fi < this.effects.scoreFrenzy.diamonds.length; fi++) {
                    var dm = this.effects.scoreFrenzy.diamonds[fi];
                    dm.userData.orbitAngle += dt * dm.userData.orbitSpeed;
                    var fa = dm.userData.orbitAngle;
                    var fr = dm.userData.orbitRadius;
                    dm.position.set(
                        Math.cos(fa) * fr,
                        0.5 + dm.userData.heightOffset + Math.sin(this.time * 2 + fi) * 0.15,
                        Math.sin(fa) * fr
                    );
                    dm.rotation.y += dt * 4;
                    dm.rotation.x += dt * 2;
                }
            }
        }
    }

    // ===== SHIELD SHATTER EFFECT =====
    // Called when shield is consumed — burst of blue particles

    shatterShield(playerPos) {
        // Extract position safely
        var spx = playerPos.x || 0;
        var spy = (playerPos.y || 0) + 0.8;
        var spz = playerPos.z || 0;

        // Create temporary burst particles
        for (var i = 0; i < 12; i++) {
            var shard = new THREE.Mesh(
                new THREE.TetrahedronGeometry(0.08, 0),
                new THREE.MeshBasicMaterial({
                    color: 0x4488ff,
                    transparent: true,
                    opacity: 0.7
                })
            );
            shard.position.set(spx, spy, spz);

            var angle = (i / 12) * Math.PI * 2;
            var velX = Math.cos(angle) * 3;
            var velY = 1 + Math.random() * 2;
            var velZ = Math.sin(angle) * 3;

            this.scene.add(shard);

            // Animate and clean up
            var scene = this.scene;
            (function(s, vx, vy, vz, sc) {
                var startTime = Date.now();
                function animateShard() {
                    var elapsed = (Date.now() - startTime) / 1000;
                    if (elapsed > 0.5) {
                        sc.remove(s);
                        s.geometry.dispose();
                        s.material.dispose();
                        return;
                    }
                    s.position.x += vx * 0.016;
                    s.position.y += vy * 0.016;
                    s.position.z += vz * 0.016;
                    vy -= 9.8 * 0.016;
                    s.material.opacity = (1 - elapsed / 0.5) * 0.7;
                    s.rotation.x += 0.1;
                    s.rotation.y += 0.15;
                    requestAnimationFrame(animateShard);
                }
                animateShard();
            })(shard, velX, velY, velZ, scene);
        }
    }

    hideAll() {
        for (var key in this.effects) {
            if (this.effects[key] && this.effects[key].group) {
                this.effects[key].group.visible = false;
            }
        }
    }

    dispose() {
        for (var key in this.effects) {
            if (this.effects[key] && this.effects[key].group) {
                this.scene.remove(this.effects[key].group);
                this.effects[key].group.traverse(function(child) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            }
        }
        this.effects = {};
    }
}
