/**
 * obstacles.js — Obstacle and coin spawning
 */

import * as THREE from 'three';

const LANE_X = [-3, 0, 3];

export function spawnObstacle(scene, obstacleMeshes, theme) {
  const lane = Math.floor(Math.random() * 3);
  const type = Math.random() < 0.5 ? 'high' : 'low';
  const g = new THREE.Group();
  if (type === 'high') {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6),
      new THREE.MeshBasicMaterial({ color: 0x888899 })
    );
    pole.position.y = 1.6; g.add(pole);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.18, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    bar.position.y = 3; g.add(bar);
  } else {
    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.35, 1.1),
      new THREE.MeshBasicMaterial({ color: 0x44aa66 })
    );
    bed.position.y = 0.45; g.add(bed);
  }
  g.position.set(LANE_X[lane], 0, -50);
  g.userData = { lane, type };
  scene.add(g);
  obstacleMeshes.push(g);
}

export function spawnCoin(scene, coinMeshes) {
  const lane = Math.floor(Math.random() * 3);
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd740 })
  );
  coin.position.set(LANE_X[lane], 1.2, -35 - Math.random() * 20);
  coin.rotation.x = Math.PI / 2;
  coin.userData = { lane, collected: false };
  scene.add(coin);
  coinMeshes.push(coin);
}

export function spawnCoinBatch(scene, coinMeshes, count) {
  for (let i = 0; i < count; i++) {
    spawnCoin(scene, coinMeshes);
  }
}
