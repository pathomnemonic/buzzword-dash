/**
 * obstacles.js — Obstacles, coins, and power-up collectibles
 *
 * Coins spawn continuously in patterns (lines, arcs, zigzags).
 * Power-ups are distinct colored 3D objects on the track.
 * Uses MeshBasicMaterial for guaranteed visibility without lighting.
 */

import * as THREE from 'three';

var LANE_X = [-3, 0, 3];

// ===== OBSTACLES =====

export function spawnObstacle(scene, obstacleMeshes) {
  var lane = Math.floor(Math.random() * 3);
  var type = Math.random() < 0.5 ? 'high' : 'low';
  var g = new THREE.Group();

  if (type === 'high') {
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

    var bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.45, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 })
    );
    bag.position.set(0.5, 2.5, 0);
    g.add(bag);
  } else {
    var bed = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.35, 1.1),
      new THREE.MeshBasicMaterial({ color: 0x44aa66 })
    );
    bed.position.set(0, 0.45, 0);
    g.add(bed);

    for (var wx = -0.6; wx <= 0.6; wx += 1.2) {
      for (var wz = -0.35; wz <= 0.35; wz += 0.7) {
        var wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 0.04, 6),
          new THREE.MeshBasicMaterial({ color: 0x333344 })
        );
        wheel.position.set(wx, 0.1, wz);
        wheel.rotation.z = Math.PI / 2;
        g.add(wheel);
      }
    }
  }

  g.position.set(LANE_X[lane], 0, -50);
  g.userData = { lane: lane, type: type };
  scene.add(g);
  obstacleMeshes.push(g);
}

// ===== SINGLE COIN =====

function makeCoinMesh(lane, z, y) {
  var coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd740 })
  );
  coin.position.set(LANE_X[lane], y || 1.2, z);
  coin.rotation.x = Math.PI / 2;
  coin.userData = { lane: lane, collected: false, type: 'coin' };
  return coin;
}

// ===== COIN PATTERNS =====

function spawnCoinLine(scene, coinMeshes, lane, startZ, count) {
  for (var i = 0; i < count; i++) {
    var coin = makeCoinMesh(lane, startZ - i * 2.5);
    scene.add(coin);
    coinMeshes.push(coin);
  }
}

function spawnCoinArc(scene, coinMeshes, startZ) {
  var centerLane = Math.floor(Math.random() * 3);
  for (var i = 0; i < 6; i++) {
    var lane;
    if (i < 2) lane = Math.max(0, centerLane - 1);
    else if (i > 3) lane = Math.min(2, centerLane + 1);
    else lane = centerLane;
    var yOffset = Math.sin(i / 5 * Math.PI) * 1.5;
    var coin = makeCoinMesh(lane, startZ - i * 2, 1.2 + yOffset);
    scene.add(coin);
    coinMeshes.push(coin);
  }
}

function spawnCoinZigzag(scene, coinMeshes, startZ) {
  for (var i = 0; i < 9; i++) {
    var lane = i % 3;
    var coin = makeCoinMesh(lane, startZ - i * 2);
    scene.add(coin);
    coinMeshes.push(coin);
  }
}

function spawnCoinThreeLane(scene, coinMeshes, startZ) {
  for (var l = 0; l < 3; l++) {
    for (var i = 0; i < 4; i++) {
      var coin = makeCoinMesh(l, startZ - i * 2.5 - l * 1.2);
      scene.add(coin);
      coinMeshes.push(coin);
    }
  }
}

function spawnCoinDiamond(scene, coinMeshes, startZ) {
  var positions = [
    [1, 0], [0, -2], [2, -2], [1, -4],
    [0, -6], [2, -6], [1, -8]
  ];
  for (var i = 0; i < positions.length; i++) {
    var lane = positions[i][0];
    var z = startZ + positions[i][1];
    var coin = makeCoinMesh(lane, z);
    scene.add(coin);
    coinMeshes.push(coin);
  }
}

// Spawn a batch of coins in a random pattern
export function spawnCoinBatch(scene, coinMeshes, startZ) {
  var z = startZ || (-40 - Math.random() * 20);
  var pattern = Math.floor(Math.random() * 5);

  switch (pattern) {
    case 0:
      spawnCoinLine(scene, coinMeshes, Math.floor(Math.random() * 3), z, 6 + Math.floor(Math.random() * 4));
      break;
    case 1:
      spawnCoinArc(scene, coinMeshes, z);
      break;
    case 2:
      spawnCoinZigzag(scene, coinMeshes, z);
      break;
    case 3:
      spawnCoinThreeLane(scene, coinMeshes, z);
      break;
    case 4:
      spawnCoinDiamond(scene, coinMeshes, z);
      break;
  }
}

// ===== POWER-UP COLLECTIBLES =====

var POWERUP_COLORS = {
  shield: 0x4488ff,
  slow: 0x44ffaa,
  double: 0xff44ff,
  magnet: 0xffaa00
};

export function spawnPowerup(scene, coinMeshes) {
  var types = ['shield', 'slow', 'double', 'magnet'];
  var type = types[Math.floor(Math.random() * types.length)];
  var lane = Math.floor(Math.random() * 3);
  var color = POWERUP_COLORS[type];

  var group = new THREE.Group();

  // Outer glow sphere
  var outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 16),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.2 })
  );
  group.add(outer);

  // Middle sphere
  var mid = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 12, 12),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.4 })
  );
  group.add(mid);

  // Inner solid core
  var inner = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 10, 10),
    new THREE.MeshBasicMaterial({ color: color })
  );
  group.add(inner);

  // Rotating diamond on top for visibility
  var diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  diamond.position.set(0, 0.55, 0);
  group.add(diamond);

  // Small ring around it
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.03, 8, 16),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  group.position.set(LANE_X[lane], 1.5, -55);
  group.userData = {
    lane: lane,
    collected: false,
    type: 'powerup',
    powerupType: type
  };

  scene.add(group);
  coinMeshes.push(group);
}
