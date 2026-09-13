/**
 * obstacles.js — Obstacles, coins, and power-up collectibles
 *
 * Coins spawn continuously along the track in patterns.
 * Power-ups spawn as distinct colored 3D objects.
 */

import * as THREE from 'three';

const LANE_X = [-3, 0, 3];

// ===== OBSTACLES =====

export function spawnObstacle(scene, obstacleMeshes, theme) {
  var lane = Math.floor(Math.random() * 3);
  var type = Math.random() < 0.5 ? 'high' : 'low';
  var g = new THREE.Group();

  if (type === 'high') {
    // IV Pole — slide under
    var pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6),
      new THREE.MeshBasicMaterial({ color: 0x888899 })
    );
    pole.position.set(0, 1.6, 0);
    g.add(pole);

    var bar = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.18, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    bar.position.set(0, 3, 0);
    g.add(bar);
  } else {
    // Gurney — jump over
    var bed = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.35, 1.1),
      new THREE.MeshBasicMaterial({ color: 0x44aa66 })
    );
    bed.position.set(0, 0.45, 0);
    g.add(bed);
  }

  g.position.set(LANE_X[lane], 0, -50);
  g.userData = { lane: lane, type: type };
  scene.add(g);
  obstacleMeshes.push(g);
}

// ===== COINS =====

export function spawnCoin(scene, coinMeshes, zPos) {
  var lane = Math.floor(Math.random() * 3);
  var z = zPos !== undefined ? zPos : (-30 - Math.random() * 25);

  var coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd740 })
  );
  coin.position.set(LANE_X[lane], 1.2, z);
  coin.rotation.x = Math.PI / 2;
  coin.userData = { lane: lane, collected: false, type: 'coin' };
  scene.add(coin);
  coinMeshes.push(coin);
}

// Spawn a line of coins along one lane
export function spawnCoinLine(scene, coinMeshes, lane, startZ, count) {
  for (var i = 0; i < count; i++) {
    var coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd740 })
    );
    coin.position.set(LANE_X[lane], 1.2, startZ - i * 2.5);
    coin.rotation.x = Math.PI / 2;
    coin.userData = { lane: lane, collected: false, type: 'coin' };
    scene.add(coin);
    coinMeshes.push(coin);
  }
}

// Spawn an arc of coins across lanes
export function spawnCoinArc(scene, coinMeshes, startZ) {
  var centerLane = Math.floor(Math.random() * 3);
  for (var i = 0; i < 5; i++) {
    var lane = Math.max(0, Math.min(2, centerLane + (i < 2 ? -1 : i > 2 ? 1 : 0)));
    var yOffset = Math.sin(i / 4 * Math.PI) * 1.5;
    var coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd740 })
    );
    coin.position.set(LANE_X[lane], 1.2 + yOffset, startZ - i * 2);
    coin.rotation.x = Math.PI / 2;
    coin.userData = { lane: lane, collected: false, type: 'coin' };
    scene.add(coin);
    coinMeshes.push(coin);
  }
}

// Spawn a big batch of coins in various patterns
export function spawnCoinBatch(scene, coinMeshes, startZ) {
  var pattern = Math.floor(Math.random() * 4);
  var lane = Math.floor(Math.random() * 3);

  if (pattern === 0) {
    // Single lane line
    spawnCoinLine(scene, coinMeshes, lane, startZ, 6 + Math.floor(Math.random() * 4));
  } else if (pattern === 1) {
    // Arc pattern
    spawnCoinArc(scene, coinMeshes, startZ);
  } else if (pattern === 2) {
    // All three lanes
    for (var l = 0; l < 3; l++) {
      spawnCoinLine(scene, coinMeshes, l, startZ - l * 1.5, 4);
    }
  } else {
    // Zigzag across lanes
    for (var i = 0; i < 8; i++) {
      var zigLane = i % 3;
      var coin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd740 })
      );
      coin.position.set(LANE_X[zigLane], 1.2, startZ - i * 2);
      coin.rotation.x = Math.PI / 2;
      coin.userData = { lane: zigLane, collected: false, type: 'coin' };
      scene.add(coin);
      coinMeshes.push(coin);
    }
  }
}

// ===== POWER-UPS (physical 3D collectibles) =====

var POWERUP_COLORS = {
  shield: 0x4488ff,
  slow: 0x44ffaa,
  double: 0xff44ff,
  magnet: 0xffaa00
};

var POWERUP_LABELS = {
  shield: '🛡️',
  slow: '💊',
  double: '2×',
  magnet: '🧲'
};

export function spawnPowerup(scene, coinMeshes) {
  var types = ['shield', 'slow', 'double', 'magnet'];
  var type = types[Math.floor(Math.random() * types.length)];
  var lane = Math.floor(Math.random() * 3);
  var color = POWERUP_COLORS[type];

  var group = new THREE.Group();

  // Outer glowing sphere
  var outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3
    })
  );
  group.add(outer);

  // Inner solid sphere
  var inner = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 12),
    new THREE.MeshBasicMaterial({ color: color })
  );
  group.add(inner);

  // Diamond shape on top for visibility
  var diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  diamond.position.set(0, 0.5, 0);
  group.add(diamond);

  group.position.set(LANE_X[lane], 1.5, -55);
  group.userData = {
    lane: lane,
    collected: false,
    type: 'powerup',
    powerupType: type
  };

  scene.add(group);
  coinMeshes.push(group); // goes into same array as coins for collision checking
}
