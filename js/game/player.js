/**
 * player.js — Player character builder
 */

import * as THREE from 'three';
import { storage } from '../storage.js';
import { SHOP_ITEMS } from './shopdata.js';

export function buildPlayer() {
  const pg = new THREE.Group();
  const equipped = storage.get('equipped');
  const skinItem = SHOP_ITEMS.find(s => s.id === equipped.skin) || SHOP_ITEMS[0];
  const hatItem = SHOP_ITEMS.find(s => s.id === equipped.hat);
  const gearItem = SHOP_ITEMS.find(s => s.id === equipped.gear);

  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 1, 0.45),
    new THREE.MeshStandardMaterial({ color: skinItem.color })
  );
  body.position.y = 0.8; body.castShadow = true;
  pg.add(body);

  // Collar
  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xeeeeff })
  );
  collar.position.y = 1.25;
  pg.add(collar);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffccaa })
  );
  head.position.y = 1.6;
  pg.add(head);

  // Hair
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x332211 })
  );
  hair.position.y = 1.65;
  pg.add(hair);

  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222244 });
  [-0.09, 0.09].forEach(x => {
    const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eyeW.position.set(x, 1.63, -0.22); pg.add(eyeW);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
    eye.position.set(x, 1.63, -0.24); pg.add(eye);
  });

  // Smile
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.015, 6, 8, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xcc6644 })
  );
  smile.position.set(0, 1.5, -0.25); smile.rotation.z = Math.PI;
  pg.add(smile);

  // Legs
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1a5599 });
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.25), legMat);
  leftLeg.position.set(-0.15, 0.15, 0); leftLeg.name = 'leftLeg'; pg.add(leftLeg);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.25), legMat);
  rightLeg.position.set(0.15, 0.15, 0); rightLeg.name = 'rightLeg'; pg.add(rightLeg);

  // Arms
  const armMat = new THREE.MeshStandardMaterial({ color: skinItem.color });
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), armMat);
  leftArm.position.set(-0.42, 0.85, 0); leftArm.name = 'leftArm'; pg.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), armMat);
  rightArm.position.set(0.42, 0.85, 0); rightArm.name = 'rightArm'; pg.add(rightArm);

  // Shoes
  const shoeMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  leftLeg.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.35), shoeMat), { position: new THREE.Vector3(0, -0.32, -0.05) }));
  rightLeg.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.35), shoeMat), { position: new THREE.Vector3(0, -0.32, -0.05) }));

  // Hat
  if (hatItem && hatItem.color) {
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: hatItem.color })
    );
    hat.position.y = 1.88; pg.add(hat);
  }

  // Gear
  if (gearItem && gearItem.color && gearItem.id === 'gear_steth') {
    const steth = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.025, 6, 12),
      new THREE.MeshStandardMaterial({ color: gearItem.color, metalness: 0.5 })
    );
    steth.position.set(0, 1.2, -0.1); steth.rotation.x = Math.PI / 2.5; pg.add(steth);
  }

  return pg;
}

export function getPlayerLimbs(playerGroup) {
  return {
    leftLeg: playerGroup.getObjectByName('leftLeg'),
    rightLeg: playerGroup.getObjectByName('rightLeg'),
    leftArm: playerGroup.getObjectByName('leftArm'),
    rightArm: playerGroup.getObjectByName('rightArm')
  };
}
