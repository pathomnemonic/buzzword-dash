/**
 * player.js — Avatar-based player character builder
 *
 * REDESIGNED with:
 * - CapsuleGeometry / rounded shapes for body (not flat boxes)
 * - Chibi/cartoon proportions (head:body ≈ 1:2.5 instead of 1:4)
 * - Bigger, more expressive eyes (larger white spheres + colored pupils)
 * - Rounder limbs (CylinderGeometry with hemispherical caps)
 * - Visible mouth/smile (TorusGeometry arc)
 * - More vibrant default colors (brighter blue scrubs, redder shoes)
 * - More exaggerated running animation (wider leg swing, body bounce)
 * - All 6 avatar variants use the new rounder proportions
 *
 * Equipment (hat, gear) applies on top of the avatar base.
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { SHOP_ITEMS, AVATARS } from './shopdata.js';

export function getAvatarConfig() {
    var equipped = storage.get('equipped');
    var skinId = equipped.skin || 'avatar_intern';
    for (var i = 0; i < AVATARS.length; i++) {
        if (AVATARS[i].id === skinId) return AVATARS[i];
    }
    return AVATARS[0];
}

// ===== HELPER: rounded limb (cylinder with sphere caps) =====
function buildRoundedLimb(radius, length, color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: color });

    // Main cylinder
    var cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, length, 8),
        mat
    );
    g.add(cyl);

    // Top cap
    var topCap = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 6),
        mat
    );
    topCap.position.y = length / 2;
    g.add(topCap);

    // Bottom cap
    var botCap = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 6),
        mat
    );
    botCap.position.y = -length / 2;
    g.add(botCap);

    return g;
}

// ===== HELPER: build a capsule-shaped body =====
function buildCapsuleBody(radiusTop, radiusBottom, length, color) {
    var g = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({ color: color });

    // Try CapsuleGeometry if available (Three.js r142+), fallback to cylinder + spheres
    try {
        var capsule = new THREE.Mesh(
            new THREE.CapsuleGeometry(radiusTop, length, 8, 12),
            mat
        );
        g.add(capsule);
    } catch (e) {
        // Fallback: cylinder with sphere caps
        var cyl = new THREE.Mesh(
            new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 10),
            mat
        );
        g.add(cyl);
        var top = new THREE.Mesh(new THREE.SphereGeometry(radiusTop, 10, 8), mat);
        top.position.y = length / 2;
        g.add(top);
        var bot = new THREE.Mesh(new THREE.SphereGeometry(radiusBottom, 10, 8), mat);
        bot.position.y = -length / 2;
        g.add(bot);
    }

    return g;
}

export function buildPlayer() {
    var pg = new THREE.Group();
    var avatar = getAvatarConfig();
    var equipped = storage.get('equipped');
    var hatItem = null;
    var gearItem = null;

    // Find hat and gear
    for (var si = 0; si < SHOP_ITEMS.length; si++) {
        if (SHOP_ITEMS[si].id === equipped.hat) hatItem = SHOP_ITEMS[si];
        if (SHOP_ITEMS[si].id === equipped.gear) gearItem = SHOP_ITEMS[si];
    }

    var s = avatar.scale || 1.0;

    // ===== CHIBI PROPORTIONS =====
    // Head:body ratio ~1:2.5 (head is ~40% of body height visually)
    // Total character height ~2.0 units
    // Head center at ~1.7, body center at ~0.95

    // ===== BODY (rounded capsule) =====
    var bodyGroup = buildCapsuleBody(0.32 * s, 0.30 * s, 0.75 * s, avatar.bodyColor);
    bodyGroup.position.set(0, 0.95 * s, 0);
    bodyGroup.castShadow = true;
    pg.add(bodyGroup);

    // Collar / neckline (torus for roundness)
    var collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.25 * s, 0.05 * s, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xeeeeff })
    );
    collar.position.set(0, 1.30 * s, 0);
    collar.rotation.x = Math.PI / 2;
    pg.add(collar);

    // ===== HEAD (large sphere — chibi proportions) =====
    var headRadius = 0.38 * s; // much bigger relative to body
    var head = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius, 14, 14),
        new THREE.MeshStandardMaterial({ color: avatar.skinColor })
    );
    head.position.set(0, 1.68 * s, 0);
    head.name = 'head';
    pg.add(head);

    // ===== HAIR (larger, rounder) =====
    var hair = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius * 0.95, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: avatar.hairColor })
    );
    hair.position.set(0, 1.75 * s, 0);
    pg.add(hair);

    // Hair back (gives volume)
    var hairBack = new THREE.Mesh(
        new THREE.SphereGeometry(headRadius * 0.88, 10, 8, 0, Math.PI * 2, 0.3, Math.PI * 0.5),
        new THREE.MeshStandardMaterial({ color: avatar.hairColor })
    );
    hairBack.position.set(0, 1.72 * s, 0.08 * s);
    pg.add(hairBack);

    // ===== EYES (much bigger and more expressive) =====
    var eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var eyeColorMat = new THREE.MeshBasicMaterial({ color: 0x222244 });
    var eyeHighlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Robot gets glowing eyes
    if (avatar.glowColor) {
        eyeColorMat = new THREE.MeshBasicMaterial({ color: avatar.glowColor });
    }

    for (var ex = -1; ex <= 1; ex += 2) {
        // Eye white (large sphere for expressiveness)
        var eyeW = new THREE.Mesh(
            new THREE.SphereGeometry(0.10 * s, 8, 8),
            eyeWhiteMat
        );
        eyeW.position.set(ex * 0.13 * s, 1.72 * s, -0.30 * s);
        eyeW.scale.set(1, 1.1, 0.7); // slightly oval, flattened front-back
        pg.add(eyeW);

        // Iris/pupil (colored, large)
        var eyeIris = new THREE.Mesh(
            new THREE.SphereGeometry(0.065 * s, 8, 8),
            eyeColorMat
        );
        eyeIris.position.set(ex * 0.13 * s, 1.72 * s, -0.35 * s);
        pg.add(eyeIris);

        // Pupil (dark center)
        var pupil = new THREE.Mesh(
            new THREE.SphereGeometry(0.035 * s, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        pupil.position.set(ex * 0.13 * s, 1.72 * s, -0.38 * s);
        pg.add(pupil);

        // Eye highlight (small white dot for life)
        var highlight = new THREE.Mesh(
            new THREE.SphereGeometry(0.02 * s, 4, 4),
            eyeHighlightMat
        );
        highlight.position.set(ex * 0.11 * s, 1.75 * s, -0.39 * s);
        pg.add(highlight);
    }

    // ===== EYEBROWS (small arcs above eyes) =====
    for (var bx = -1; bx <= 1; bx += 2) {
        var brow = new THREE.Mesh(
            new THREE.TorusGeometry(0.06 * s, 0.015 * s, 4, 8, Math.PI * 0.8),
            new THREE.MeshBasicMaterial({ color: avatar.hairColor })
        );
        brow.position.set(bx * 0.13 * s, 1.82 * s, -0.32 * s);
        brow.rotation.x = -0.2;
        brow.rotation.z = bx * 0.15;
        pg.add(brow);
    }

    // ===== MOUTH / SMILE (torus arc) =====
    var smile = new THREE.Mesh(
        new THREE.TorusGeometry(0.07 * s, 0.018 * s, 6, 10, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0xdd5544 })
    );
    smile.position.set(0, 1.58 * s, -0.33 * s);
    smile.rotation.z = Math.PI; // upside down arc = smile
    smile.name = 'mouth';
    pg.add(smile);

    // ===== CHEEK BLUSH (subtle pink circles) =====
    var blushMat = new THREE.MeshBasicMaterial({ color: 0xff8888, transparent: true, opacity: 0.25 });
    for (var cx = -1; cx <= 1; cx += 2) {
        var blush = new THREE.Mesh(
            new THREE.CircleGeometry(0.05 * s, 8),
            blushMat
        );
        blush.position.set(cx * 0.22 * s, 1.63 * s, -0.34 * s);
        pg.add(blush);
    }

    // ===== NOSE (tiny sphere) =====
    var nose = new THREE.Mesh(
        new THREE.SphereGeometry(0.025 * s, 6, 6),
        new THREE.MeshStandardMaterial({ color: avatar.skinColor })
    );
    nose.position.set(0, 1.65 * s, -0.37 * s);
    pg.add(nose);

    // ===== LEGS (rounded cylinders) =====
    var leftLegGroup = buildRoundedLimb(0.10 * s, 0.50 * s, avatar.pantsColor);
    leftLegGroup.position.set(-0.14 * s, 0.30 * s, 0);
    leftLegGroup.name = 'leftLeg';
    pg.add(leftLegGroup);

    var rightLegGroup = buildRoundedLimb(0.10 * s, 0.50 * s, avatar.pantsColor);
    rightLegGroup.position.set(0.14 * s, 0.30 * s, 0);
    rightLegGroup.name = 'rightLeg';
    pg.add(rightLegGroup);

    // ===== SHOES (bright, rounded) =====
    var shoeColor = avatar.shoeColor || 0xff3333;
    var shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor });

    var shoeL = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 * s, 8, 6),
        shoeMat
    );
    shoeL.scale.set(1.0, 0.55, 1.4); // flattened, elongated forward
    shoeL.position.set(0, -0.28 * s, -0.03 * s);
    leftLegGroup.add(shoeL);

    var shoeR = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 * s, 8, 6),
        shoeMat
    );
    shoeR.scale.set(1.0, 0.55, 1.4);
    shoeR.position.set(0, -0.28 * s, -0.03 * s);
    rightLegGroup.add(shoeR);

    // ===== ARMS (rounded cylinders) =====
    var armColor = avatar.bodyColor;
    var leftArmGroup = buildRoundedLimb(0.08 * s, 0.40 * s, armColor);
    leftArmGroup.position.set(-0.38 * s, 0.95 * s, 0);
    leftArmGroup.name = 'leftArm';
    pg.add(leftArmGroup);

    var rightArmGroup = buildRoundedLimb(0.08 * s, 0.40 * s, armColor);
    rightArmGroup.position.set(0.38 * s, 0.95 * s, 0);
    rightArmGroup.name = 'rightArm';
    pg.add(rightArmGroup);

    // ===== HANDS (small spheres at arm tips) =====
    var handMat = new THREE.MeshStandardMaterial({ color: avatar.skinColor });
    var handL = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 6, 6), handMat);
    handL.position.set(0, -0.24 * s, 0);
    leftArmGroup.add(handL);

    var handR = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 6, 6), handMat);
    handR.position.set(0, -0.24 * s, 0);
    rightArmGroup.add(handR);

    // ===== AVATAR SPECIAL FEATURES =====

    // Cape (Superhero)
    if (avatar.hasCape) {
        var cape = new THREE.Mesh(
            new THREE.PlaneGeometry(0.75 * s, 1.0 * s),
            new THREE.MeshBasicMaterial({
                color: avatar.capeColor,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85
            })
        );
        cape.position.set(0, 0.95 * s, 0.22 * s);
        cape.rotation.x = 0.15;
        cape.name = 'cape';
        pg.add(cape);
    }

    // Antenna (Robot)
    if (avatar.hasAntenna) {
        var antennaPole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.35 * s, 6),
            new THREE.MeshBasicMaterial({ color: 0x888899 })
        );
        antennaPole.position.set(0, 2.05 * s, 0);
        pg.add(antennaPole);

        var antennaBall = new THREE.Mesh(
            new THREE.SphereGeometry(0.07 * s, 8, 8),
            new THREE.MeshBasicMaterial({ color: avatar.glowColor || 0x44aaff })
        );
        antennaBall.position.set(0, 2.25 * s, 0);
        pg.add(antennaBall);
    }

    // Wizard Hat
    if (avatar.hasWizardHat) {
        var wizHat = new THREE.Mesh(
            new THREE.ConeGeometry(0.32 * s, 0.55 * s, 8),
            new THREE.MeshStandardMaterial({ color: avatar.hatColor || 0x6622aa })
        );
        wizHat.position.set(0, 2.10 * s, 0);
        pg.add(wizHat);

        // Brim
        var brim = new THREE.Mesh(
            new THREE.TorusGeometry(0.38 * s, 0.04 * s, 4, 14),
            new THREE.MeshStandardMaterial({ color: avatar.hatColor || 0x6622aa })
        );
        brim.position.set(0, 1.88 * s, 0);
        brim.rotation.x = Math.PI / 2;
        pg.add(brim);

        // Stars on wizard hat
        var starMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
        for (var ws = 0; ws < 3; ws++) {
            var star = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.03 * s, 0),
                starMat
            );
            var wsAngle = (ws / 3) * Math.PI * 2;
            star.position.set(
                Math.cos(wsAngle) * 0.25 * s,
                2.0 * s + ws * 0.12 * s,
                Math.sin(wsAngle) * 0.25 * s
            );
            pg.add(star);
        }
    }

    // ===== ZOMBIE special: ragged appearance =====
    if (avatar.id === 'avatar_zombie') {
        // Dark circles under eyes
        var darkCircleMat = new THREE.MeshBasicMaterial({ color: 0x335533, transparent: true, opacity: 0.5 });
        for (var zx = -1; zx <= 1; zx += 2) {
            var darkCircle = new THREE.Mesh(
                new THREE.CircleGeometry(0.06 * s, 6),
                darkCircleMat
            );
            darkCircle.position.set(zx * 0.13 * s, 1.67 * s, -0.32 * s);
            pg.add(darkCircle);
        }
    }

    // ===== ATTENDING special: white coat tails =====
    if (avatar.id === 'avatar_attending') {
        var coatTail = new THREE.Mesh(
            new THREE.PlaneGeometry(0.55 * s, 0.5 * s),
            new THREE.MeshStandardMaterial({
                color: avatar.bodyColor,
                side: THREE.DoubleSide
            })
        );
        coatTail.position.set(0, 0.55 * s, 0.18 * s);
        coatTail.rotation.x = 0.1;
        coatTail.name = 'coatTail';
        pg.add(coatTail);
    }

    // ===== EQUIPMENT: HAT =====
    if (hatItem && hatItem.color && !avatar.hasWizardHat && !avatar.hasAntenna) {
        var hat;
        var hatY = 2.0 * s;

        if (hatItem.id === 'hat_crown') {
            hat = new THREE.Mesh(
                new THREE.CylinderGeometry(0.24 * s, 0.30 * s, 0.15 * s, 8),
                new THREE.MeshBasicMaterial({ color: hatItem.color })
            );
            // Crown points
            for (var ci = 0; ci < 5; ci++) {
                var point = new THREE.Mesh(
                    new THREE.ConeGeometry(0.04 * s, 0.1 * s, 4),
                    new THREE.MeshBasicMaterial({ color: 0xffd700 })
                );
                var cAngle = (ci / 5) * Math.PI * 2;
                point.position.set(Math.cos(cAngle) * 0.22 * s, 0.1 * s, Math.sin(cAngle) * 0.22 * s);
                hat.add(point);
            }
        } else if (hatItem.id === 'hat_halo') {
            hat = new THREE.Mesh(
                new THREE.TorusGeometry(0.32 * s, 0.035 * s, 8, 16),
                new THREE.MeshBasicMaterial({ color: hatItem.color })
            );
            hat.rotation.x = Math.PI / 2;
            hatY = 2.12 * s;
        } else if (hatItem.id === 'hat_viking') {
            hat = new THREE.Mesh(
                new THREE.SphereGeometry(0.30 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: hatItem.color })
            );
            // Horns
            for (var hx = -1; hx <= 1; hx += 2) {
                var horn = new THREE.Mesh(
                    new THREE.ConeGeometry(0.05 * s, 0.28 * s, 6),
                    new THREE.MeshStandardMaterial({ color: 0xeeeecc })
                );
                horn.position.set(hx * 0.28 * s, 0.1 * s, 0);
                horn.rotation.z = -hx * 0.4;
                hat.add(horn);
            }
        } else if (hatItem.id === 'hat_party') {
            hat = new THREE.Mesh(
                new THREE.ConeGeometry(0.16 * s, 0.35 * s, 8),
                new THREE.MeshBasicMaterial({ color: hatItem.color })
            );
            var pom = new THREE.Mesh(
                new THREE.SphereGeometry(0.05 * s, 6, 6),
                new THREE.MeshBasicMaterial({ color: 0xffff00 })
            );
            pom.position.set(0, 0.2 * s, 0);
            hat.add(pom);
        } else if (hatItem.id === 'hat_chef') {
            hat = new THREE.Mesh(
                new THREE.CylinderGeometry(0.26 * s, 0.22 * s, 0.25 * s, 10),
                new THREE.MeshStandardMaterial({ color: 0xffffff })
            );
            var puff = new THREE.Mesh(
                new THREE.SphereGeometry(0.28 * s, 10, 10),
                new THREE.MeshStandardMaterial({ color: 0xffffff })
            );
            puff.position.set(0, 0.18 * s, 0);
            hat.add(puff);
        } else {
            // Default hat (cap, headlamp)
            hat = new THREE.Mesh(
                new THREE.CylinderGeometry(0.30 * s, 0.32 * s, 0.12 * s, 8),
                new THREE.MeshStandardMaterial({ color: hatItem.color })
            );
            if (hatItem.id === 'hat_headlamp') {
                var lamp = new THREE.Mesh(
                    new THREE.SphereGeometry(0.06 * s, 6, 6),
                    new THREE.MeshBasicMaterial({ color: 0xffffaa })
                );
                lamp.position.set(0, 0.02 * s, -0.30 * s);
                hat.add(lamp);
            }
        }
        hat.position.set(0, hatY, 0);
        pg.add(hat);
    }

    // ===== EQUIPMENT: GEAR =====
    if (gearItem && gearItem.color) {
        if (gearItem.id === 'gear_steth') {
            var steth = new THREE.Mesh(
                new THREE.TorusGeometry(0.18 * s, 0.025 * s, 6, 12),
                new THREE.MeshStandardMaterial({ color: gearItem.color, metalness: 0.5 })
            );
            steth.position.set(0, 1.20 * s, -0.10 * s);
            steth.rotation.x = Math.PI / 2.5;
            pg.add(steth);
            // Chest piece
            var chestPiece = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04 * s, 0.03 * s, 0.03 * s, 8),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 })
            );
            chestPiece.position.set(0, 1.05 * s, -0.20 * s);
            pg.add(chestPiece);
        } else if (gearItem.id === 'gear_clip') {
            var clip = new THREE.Mesh(
                new THREE.BoxGeometry(0.20 * s, 0.28 * s, 0.04 * s),
                new THREE.MeshStandardMaterial({ color: gearItem.color })
            );
            clip.position.set(0.36 * s, 0.80 * s, -0.12 * s);
            pg.add(clip);
            var paper = new THREE.Mesh(
                new THREE.BoxGeometry(0.16 * s, 0.22 * s, 0.01 * s),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            paper.position.set(0.36 * s, 0.78 * s, -0.15 * s);
            pg.add(paper);
        } else if (gearItem.id === 'gear_syringe') {
            var syringe = new THREE.Mesh(
                new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.45 * s, 8),
                new THREE.MeshBasicMaterial({ color: 0xddddff, transparent: true, opacity: 0.7 })
            );
            syringe.position.set(0.33 * s, 0.95 * s, 0);
            syringe.rotation.z = 0.3;
            pg.add(syringe);
            // Needle tip
            var needleTip = new THREE.Mesh(
                new THREE.ConeGeometry(0.01 * s, 0.1 * s, 4),
                new THREE.MeshBasicMaterial({ color: 0xcccccc })
            );
            needleTip.position.set(0.27 * s, 0.72 * s, 0);
            needleTip.rotation.z = 0.3;
            pg.add(needleTip);
        } else if (gearItem.id === 'gear_defib') {
            for (var dx = -1; dx <= 1; dx += 2) {
                var paddle = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.10 * s, 0.08 * s, 0.06 * s, 8),
                    new THREE.MeshStandardMaterial({ color: gearItem.color })
                );
                paddle.position.set(dx * 0.33 * s, 0.70 * s, -0.18 * s);
                pg.add(paddle);
                var handle = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.15 * s, 6),
                    new THREE.MeshBasicMaterial({ color: 0x333333 })
                );
                handle.position.set(dx * 0.33 * s, 0.80 * s, -0.18 * s);
                pg.add(handle);
            }
        } else if (gearItem.id === 'gear_hammer') {
            var hammerHead = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08 * s, 0.06 * s, 0.12 * s, 8),
                new THREE.MeshStandardMaterial({ color: gearItem.color })
            );
            hammerHead.position.set(0.38 * s, 1.05 * s, 0);
            hammerHead.rotation.z = Math.PI / 2;
            pg.add(hammerHead);
            var hammerStick = new THREE.Mesh(
                new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.30 * s, 6),
                new THREE.MeshBasicMaterial({ color: 0x333333 })
            );
            hammerStick.position.set(0.38 * s, 0.85 * s, 0);
            pg.add(hammerStick);
        } else if (gearItem.id === 'gear_mask') {
            // Rounded surgical mask
            var mask = new THREE.Mesh(
                new THREE.SphereGeometry(0.18 * s, 8, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.3),
                new THREE.MeshBasicMaterial({ color: gearItem.color, side: THREE.DoubleSide })
            );
            mask.position.set(0, 1.58 * s, -0.15 * s);
            mask.rotation.x = Math.PI;
            pg.add(mask);
        }
    }

    return pg;
}

export function getPlayerLimbs(playerGroup) {
    return {
        leftLeg: playerGroup.getObjectByName('leftLeg'),
        rightLeg: playerGroup.getObjectByName('rightLeg'),
        leftArm: playerGroup.getObjectByName('leftArm'),
        rightArm: playerGroup.getObjectByName('rightArm'),
        cape: playerGroup.getObjectByName('cape'),
        head: playerGroup.getObjectByName('head'),
        mouth: playerGroup.getObjectByName('mouth'),
        coatTail: playerGroup.getObjectByName('coatTail')
    };
}
