/**
 * player.js — Avatar-based player character builder
 *
 * Supports 6 distinct avatar types with unique body proportions,
 * colors, and special features (cape, antenna, wizard hat).
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

  // Body
  var body = new THREE.Mesh(
    new THREE.BoxGeometry(0.65 * s, 1.0 * s, 0.45 * s),
    new THREE.MeshStandardMaterial({ color: avatar.bodyColor })
  );
  body.position.set(0, 0.8 * s, 0);
  body.castShadow = true;
  pg.add(body);

  // Collar
  var collar = new THREE.Mesh(
    new THREE.BoxGeometry(0.5 * s, 0.12 * s, 0.35 * s),
    new THREE.MeshStandardMaterial({ color: 0xeeeeff })
  );
  collar.position.set(0, 1.25 * s, 0);
  pg.add(collar);

  // Head
  var head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28 * s, 12, 12),
    new THREE.MeshStandardMaterial({ color: avatar.skinColor })
  );
  head.position.set(0, 1.6 * s, 0);
  pg.add(head);

  // Hair
  var hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.26 * s, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: avatar.hairColor })
  );
  hair.position.set(0, 1.65 * s, 0);
  pg.add(hair);

  // Eyes
  var eyeMat = new THREE.MeshBasicMaterial({ color: 0x222244 });
  var eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Robot gets glowing eyes
  if (avatar.glowColor) {
    eyeMat = new THREE.MeshBasicMaterial({ color: avatar.glowColor });
  }

  for (var ex = -1; ex <= 1; ex += 2) {
    var eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 6, 6), eyeWhiteMat);
    eyeW.position.set(ex * 0.09 * s, 1.63 * s, -0.22 * s);
    pg.add(eyeW);
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 6, 6), eyeMat);
    eye.position.set(ex * 0.09 * s, 1.63 * s, -0.24 * s);
    pg.add(eye);
  }

  // Smile
  var smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.06 * s, 0.015 * s, 6, 8, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xcc6644 })
  );
  smile.position.set(0, 1.5 * s, -0.25 * s);
  smile.rotation.z = Math.PI;
  pg.add(smile);

  // Legs
  var legMat = new THREE.MeshStandardMaterial({ color: avatar.pantsColor });
  var leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.7 * s, 0.25 * s), legMat);
  leftLeg.position.set(-0.15 * s, 0.15, 0);
  leftLeg.name = 'leftLeg';
  pg.add(leftLeg);

  var rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.7 * s, 0.25 * s), legMat);
  rightLeg.position.set(0.15 * s, 0.15, 0);
  rightLeg.name = 'rightLeg';
  pg.add(rightLeg);

  // Arms
  var armMat = new THREE.MeshStandardMaterial({ color: avatar.bodyColor });
  var leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.55 * s, 0.2 * s), armMat);
  leftArm.position.set(-0.42 * s, 0.85 * s, 0);
  leftArm.name = 'leftArm';
  pg.add(leftArm);

  var rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.55 * s, 0.2 * s), armMat);
  rightArm.position.set(0.42 * s, 0.85 * s, 0);
  rightArm.name = 'rightArm';
  pg.add(rightArm);

  // Shoes
  var shoeMat = new THREE.MeshBasicMaterial({ color: avatar.shoeColor });
  var shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.12 * s, 0.35 * s), shoeMat);
  shoeL.position.set(0, -0.32 * s, -0.05);
  leftLeg.add(shoeL);
  var shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.12 * s, 0.35 * s), shoeMat);
  shoeR.position.set(0, -0.32 * s, -0.05);
  rightLeg.add(shoeR);

  // ===== AVATAR SPECIAL FEATURES =====

  // Cape (Superhero)
  if (avatar.hasCape) {
    var cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8 * s, 1.2 * s),
      new THREE.MeshBasicMaterial({
        color: avatar.capeColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      })
    );
    cape.position.set(0, 0.9 * s, 0.25 * s);
    cape.rotation.x = 0.15;
    cape.name = 'cape';
    pg.add(cape);
  }

  // Antenna (Robot)
  if (avatar.hasAntenna) {
    var antennaPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.4 * s, 6),
      new THREE.MeshBasicMaterial({ color: 0x888899 })
    );
    antennaPole.position.set(0, 1.95 * s, 0);
    pg.add(antennaPole);
    var antennaBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.06 * s, 8, 8),
      new THREE.MeshBasicMaterial({ color: avatar.glowColor || 0x44aaff })
    );
    antennaBall.position.set(0, 2.18 * s, 0);
    pg.add(antennaBall);
  }

  // Wizard Hat
  if (avatar.hasWizardHat) {
    var wizHat = new THREE.Mesh(
      new THREE.ConeGeometry(0.3 * s, 0.6 * s, 8),
      new THREE.MeshStandardMaterial({ color: avatar.hatColor || 0x6622aa })
    );
    wizHat.position.set(0, 2.0 * s, 0);
    pg.add(wizHat);
    // Brim
    var brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 0.04 * s, 12),
      new THREE.MeshStandardMaterial({ color: avatar.hatColor || 0x6622aa })
    );
    brim.position.set(0, 1.78 * s, 0);
    pg.add(brim);
  }

  // ===== EQUIPMENT (on top of avatar) =====

  // Hat (unless avatar has special headwear)
  if (hatItem && hatItem.color && !avatar.hasWizardHat && !avatar.hasAntenna) {
    var hat;
    if (hatItem.id === 'hat_crown') {
      hat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22 * s, 0.28 * s, 0.15 * s, 8),
        new THREE.MeshBasicMaterial({ color: hatItem.color })
      );
      // Crown points
      for (var ci = 0; ci < 5; ci++) {
        var point = new THREE.Mesh(
          new THREE.ConeGeometry(0.04 * s, 0.1 * s, 4),
          new THREE.MeshBasicMaterial({ color: 0xffd700 })
        );
        var angle = (ci / 5) * Math.PI * 2;
        point.position.set(Math.cos(angle) * 0.2 * s, 0.1 * s, Math.sin(angle) * 0.2 * s);
        hat.add(point);
      }
    } else if (hatItem.id === 'hat_halo') {
      hat = new THREE.Mesh(
        new THREE.TorusGeometry(0.3 * s, 0.03 * s, 8, 16),
        new THREE.MeshBasicMaterial({ color: hatItem.color })
      );
      hat.rotation.x = Math.PI / 2;
    } else if (hatItem.id === 'hat_viking') {
      hat = new THREE.Mesh(
        new THREE.SphereGeometry(0.28 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: hatItem.color })
      );
      // Horns
      for (var hx = -1; hx <= 1; hx += 2) {
        var horn = new THREE.Mesh(
          new THREE.ConeGeometry(0.04 * s, 0.25 * s, 6),
          new THREE.MeshStandardMaterial({ color: 0xeeeecc })
        );
        horn.position.set(hx * 0.25 * s, 0.1 * s, 0);
        horn.rotation.z = -hx * 0.4;
        hat.add(horn);
      }
    } else if (hatItem.id === 'hat_party') {
      hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.15 * s, 0.35 * s, 8),
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
        new THREE.CylinderGeometry(0.25 * s, 0.2 * s, 0.3 * s, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      var puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.25 * s, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      puff.position.set(0, 0.2 * s, 0);
      hat.add(puff);
    } else {
      // Default hat (cap, headlamp)
      hat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28 * s, 0.3 * s, 0.12 * s, 8),
        new THREE.MeshStandardMaterial({ color: hatItem.color })
      );
      if (hatItem.id === 'hat_headlamp') {
        var lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.06 * s, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xffffaa })
        );
        lamp.position.set(0, 0.02 * s, -0.28 * s);
        hat.add(lamp);
      }
    }
    hat.position.set(0, 1.85 * s, 0);
    pg.add(hat);
  }

  // Gear
  if (gearItem && gearItem.color) {
    if (gearItem.id === 'gear_steth') {
      var steth = new THREE.Mesh(
        new THREE.TorusGeometry(0.18 * s, 0.025 * s, 6, 12),
        new THREE.MeshStandardMaterial({ color: gearItem.color, metalness: 0.5 })
      );
      steth.position.set(0, 1.2 * s, -0.1 * s);
      steth.rotation.x = Math.PI / 2.5;
      pg.add(steth);
    } else if (gearItem.id === 'gear_clip') {
      var clip = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 * s, 0.3 * s, 0.04 * s),
        new THREE.MeshStandardMaterial({ color: gearItem.color })
      );
      clip.position.set(0.38 * s, 0.7 * s, -0.15 * s);
      pg.add(clip);
      var paper = new THREE.Mesh(
        new THREE.BoxGeometry(0.16 * s, 0.24 * s, 0.01 * s),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      paper.position.set(0.38 * s, 0.7 * s, -0.18 * s);
      pg.add(paper);
    } else if (gearItem.id === 'gear_syringe') {
      var syringe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.5 * s, 8),
        new THREE.MeshBasicMaterial({ color: 0xddddff, transparent: true, opacity: 0.7 })
      );
      syringe.position.set(0.35 * s, 0.9 * s, 0);
      syringe.rotation.z = 0.3;
      pg.add(syringe);
    } else if (gearItem.id === 'gear_defib') {
      for (var dx = -1; dx <= 1; dx += 2) {
        var paddle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1 * s, 0.08 * s, 0.06 * s, 8),
          new THREE.MeshStandardMaterial({ color: gearItem.color })
        );
        paddle.position.set(dx * 0.35 * s, 0.6 * s, -0.2 * s);
        pg.add(paddle);
        var handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.15 * s, 6),
          new THREE.MeshBasicMaterial({ color: 0x333333 })
        );
        handle.position.set(dx * 0.35 * s, 0.7 * s, -0.2 * s);
        pg.add(handle);
      }
    } else if (gearItem.id === 'gear_hammer') {
      var hammerHead = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08 * s, 0.06 * s, 0.12 * s, 8),
        new THREE.MeshStandardMaterial({ color: gearItem.color })
      );
      hammerHead.position.set(0.4 * s, 1.0 * s, 0);
      hammerHead.rotation.z = Math.PI / 2;
      pg.add(hammerHead);
      var hammerStick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.35 * s, 6),
        new THREE.MeshBasicMaterial({ color: 0x333333 })
      );
      hammerStick.position.set(0.4 * s, 0.78 * s, 0);
      pg.add(hammerStick);
    } else if (gearItem.id === 'gear_mask') {
      var mask = new THREE.Mesh(
        new THREE.BoxGeometry(0.3 * s, 0.12 * s, 0.08 * s),
        new THREE.MeshBasicMaterial({ color: gearItem.color })
      );
      mask.position.set(0, 1.48 * s, -0.25 * s);
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
    cape: playerGroup.getObjectByName('cape')
  };
}
