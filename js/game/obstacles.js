/**
 * obstacles.js — Redesigned obstacles, glowing coins, dramatic power-ups
 *
 * Phase 3.5 visual overhaul:
 * - Jump obstacles: gurney, spilled supplies, wet floor sign, wheelchair
 * - Slide obstacles: IV pole, hospital sign, OR doors, MRI tunnel
 * - Color-coded warnings: red/orange for jump, blue/cyan for slide
 * - Coins with glow rings
 * - Power-ups with layered transparent spheres for glow effect
 *   (no bloom post-processing needed)
 */

import * as THREE from 'three';

var LANE_X = [-3, 0, 3];

// ===== OBSTACLE BUILDERS =====

function buildGurney() {
  var g = new THREE.Group();
  // Bed frame
  var bed = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.12, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x44aa66 })
  );
  bed.position.set(0, 0.55, 0);
  bed.castShadow = true;
  g.add(bed);
  // Mattress
  var matt = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.1, 1.0),
    new THREE.MeshBasicMaterial({ color: 0xeeeeff })
  );
  matt.position.set(0, 0.63, 0);
  g.add(matt);
  // Legs
  for (var lx = -0.8; lx <= 0.8; lx += 1.6) {
    for (var lz = -0.4; lz <= 0.4; lz += 0.8) {
      var leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0x888899 })
      );
      leg.position.set(lx, 0.25, lz);
      g.add(leg);
    }
  }
  // Wheels
  var wMat = new THREE.MeshBasicMaterial({ color: 0x333344 });
  for (var wx = -0.8; wx <= 0.8; wx += 1.6) {
    for (var wz = -0.4; wz <= 0.4; wz += 0.8) {
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), wMat);
      wheel.position.set(wx, 0.05, wz);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
  }
  // Warning glow (orange = jump)
  var warn = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
  );
  warn.position.set(0, 1.2, 0);
  warn.rotation.x = -0.3;
  g.add(warn);
  // Up arrow indicator
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.3, 4),
    new THREE.MeshBasicMaterial({ color: 0xff8800 })
  );
  arrow.position.set(0, 1.5, 0);
  g.add(arrow);
  return g;
}

function buildWetFloorSign() {
  var g = new THREE.Group();
  // A-frame sign
  var sign = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.0, 4),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 })
  );
  sign.position.set(0, 0.5, 0);
  g.add(sign);
  // Exclamation
  var dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  dot.position.set(0, 0.35, -0.25);
  g.add(dot);
  var line = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.2, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  line.position.set(0, 0.55, -0.25);
  g.add(line);
  // Warning arrow
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.25, 4),
    new THREE.MeshBasicMaterial({ color: 0xff8800 })
  );
  arrow.position.set(0, 1.3, 0);
  g.add(arrow);
  return g;
}

function buildWheelchair() {
  var g = new THREE.Group();
  // Seat
  var seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x333344 })
  );
  seat.position.set(0, 0.5, 0);
  g.add(seat);
  // Back
  var back = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.7, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x333344 })
  );
  back.position.set(0, 0.85, 0.32);
  g.add(back);
  // Big wheels
  var bigWMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (var side = -1; side <= 1; side += 2) {
    var bigW = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 16), bigWMat);
    bigW.position.set(side * 0.5, 0.3, 0.1);
    bigW.rotation.y = Math.PI / 2;
    g.add(bigW);
  }
  // Small front wheels
  for (var s2 = -1; s2 <= 1; s2 += 2) {
    var smW = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), bigWMat);
    smW.position.set(s2 * 0.3, 0.08, -0.3);
    g.add(smW);
  }
  // Arrow
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.25, 4),
    new THREE.MeshBasicMaterial({ color: 0xff8800 })
  );
  arrow.position.set(0, 1.5, 0);
  g.add(arrow);
  return g;
}

function buildIVPole() {
  var g = new THREE.Group();
  // Pole
  var pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 3.5, 6),
    new THREE.MeshBasicMaterial({ color: 0x999999 })
  );
  pole.position.set(0, 1.75, 0);
  g.add(pole);
  // Crossbar (the part you slide under)
  var bar = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.15, 0.15),
    new THREE.MeshBasicMaterial({ color: 0x4488ff })
  );
  bar.position.set(0, 2.8, 0);
  g.add(bar);
  // IV bag
  var bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.4, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 })
  );
  bag.position.set(0.4, 3.1, 0);
  g.add(bag);
  // Tubing
  var tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4),
    new THREE.MeshBasicMaterial({ color: 0xaaddff })
  );
  tube.position.set(0.4, 2.65, 0);
  g.add(tube);
  // Base
  var base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.3, 0.08, 8),
    new THREE.MeshBasicMaterial({ color: 0x777788 })
  );
  base.position.set(0, 0.04, 0);
  g.add(base);
  // Down arrow (slide)
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.25, 4),
    new THREE.MeshBasicMaterial({ color: 0x4488ff })
  );
  arrow.position.set(0, 2.2, 0);
  arrow.rotation.z = Math.PI; // point down
  g.add(arrow);
  return g;
}

function buildHospitalSign() {
  var g = new THREE.Group();
  // Two poles
  for (var sx = -1; sx <= 1; sx += 2) {
    var pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6),
      new THREE.MeshBasicMaterial({ color: 0x888899 })
    );
    pole.position.set(sx * 1.0, 1.6, 0);
    g.add(pole);
  }
  // Sign board
  var sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.6, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x2266aa })
  );
  sign.position.set(0, 2.8, 0);
  g.add(sign);
  // Cross on sign
  var cH = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.08, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  cH.position.set(-0.6, 2.8, -0.06);
  g.add(cH);
  var cV = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.3, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  cV.position.set(-0.6, 2.8, -0.06);
  g.add(cV);
  // Arrow text "ER →" approximation
  var arrowSign = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.2, 3),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  arrowSign.position.set(0.5, 2.8, -0.06);
  arrowSign.rotation.z = -Math.PI / 2;
  g.add(arrowSign);
  // Down arrow indicator
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.25, 4),
    new THREE.MeshBasicMaterial({ color: 0x4488ff })
  );
  arrow.position.set(0, 2.2, 0);
  arrow.rotation.z = Math.PI;
  g.add(arrow);
  return g;
}

function buildORDoors() {
  var g = new THREE.Group();
  // Door frame
  for (var sx = -1; sx <= 1; sx += 2) {
    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 3.2, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x888899 })
    );
    frame.position.set(sx * 1.2, 1.6, 0);
    g.add(frame);
  }
  // Top bar
  var top = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.1, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x888899 })
  );
  top.position.set(0, 3.0, 0);
  g.add(top);
  // Doors (swing panels) — the overhead part you slide under
  for (var dx = -1; dx <= 1; dx += 2) {
    var door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.2, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x66aa88, transparent: true, opacity: 0.85 })
    );
    door.position.set(dx * 0.55, 2.6, 0);
    g.add(door);
    // Window on door
    var win = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xaaddcc, transparent: true, opacity: 0.5 })
    );
    win.position.set(dx * 0.55, 2.7, -0.05);
    g.add(win);
  }
  // Down arrow
  var arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.25, 4),
    new THREE.MeshBasicMaterial({ color: 0x4488ff })
  );
  arrow.position.set(0, 2.0, 0);
  arrow.rotation.z = Math.PI;
  g.add(arrow);
  return g;
}

// ===== OBSTACLE SPAWNER =====

var jumpBuilders = [buildGurney, buildWetFloorSign, buildWheelchair];
var slideBuilders = [buildIVPole, buildHospitalSign, buildORDoors];

export function spawnObstacle(scene, obstacleMeshes) {
  var lane = Math.floor(Math.random() * 3);
  var isSlide = Math.random() < 0.5;
  var builders = isSlide ? slideBuilders : jumpBuilders;
  var builder = builders[Math.floor(Math.random() * builders.length)];
  var obs = builder();
  obs.position.set(LANE_X[lane], 0, -50);
  obs.userData = { lane: lane, type: isSlide ? 'high' : 'low' };
  scene.add(obs);
  obstacleMeshes.push(obs);
}

// ===== COINS WITH GLOW =====

function makeCoinMesh(lane, z, y) {
  var group = new THREE.Group();
  // Core coin
  var coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd740 })
  );
  coin.rotation.x = Math.PI / 2;
  group.add(coin);
  // Glow ring
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.04, 6, 16),
    new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.3 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  group.position.set(LANE_X[lane], y || 1.2, z);
  group.userData = { lane: lane, collected: false, type: 'coin' };
  return group;
}

// ===== COIN PATTERNS =====

function spawnCoinLine(scene, coinMeshes, lane, startZ, count) {
  for (var i = 0; i < count; i++) {
    var c = makeCoinMesh(lane, startZ - i * 2.5);
    scene.add(c); coinMeshes.push(c);
  }
}

function spawnCoinArc(scene, coinMeshes, startZ) {
  var centerLane = Math.floor(Math.random() * 3);
  for (var i = 0; i < 6; i++) {
    var lane = i < 2 ? Math.max(0, centerLane - 1) : i > 3 ? Math.min(2, centerLane + 1) : centerLane;
    var yOff = Math.sin(i / 5 * Math.PI) * 1.5;
    var c = makeCoinMesh(lane, startZ - i * 2, 1.2 + yOff);
    scene.add(c); coinMeshes.push(c);
  }
}

function spawnCoinZigzag(scene, coinMeshes, startZ) {
  for (var i = 0; i < 9; i++) {
    var c = makeCoinMesh(i % 3, startZ - i * 2);
    scene.add(c); coinMeshes.push(c);
  }
}

function spawnCoinThreeLane(scene, coinMeshes, startZ) {
  for (var l = 0; l < 3; l++) {
    for (var i = 0; i < 4; i++) {
      var c = makeCoinMesh(l, startZ - i * 2.5 - l * 1.2);
      scene.add(c); coinMeshes.push(c);
    }
  }
}

function spawnCoinDiamond(scene, coinMeshes, startZ) {
  var pos = [[1,0],[0,-2],[2,-2],[1,-4],[0,-6],[2,-6],[1,-8]];
  for (var i = 0; i < pos.length; i++) {
    var c = makeCoinMesh(pos[i][0], startZ + pos[i][1]);
    scene.add(c); coinMeshes.push(c);
  }
}

export function spawnCoinBatch(scene, coinMeshes, startZ) {
  var z = startZ || (-40 - Math.random() * 20);
  var p = Math.floor(Math.random() * 5);
  switch (p) {
    case 0: spawnCoinLine(scene, coinMeshes, Math.floor(Math.random() * 3), z, 6 + Math.floor(Math.random() * 4)); break;
    case 1: spawnCoinArc(scene, coinMeshes, z); break;
    case 2: spawnCoinZigzag(scene, coinMeshes, z); break;
    case 3: spawnCoinThreeLane(scene, coinMeshes, z); break;
    case 4: spawnCoinDiamond(scene, coinMeshes, z); break;
  }
}

// ===== POWER-UPS (dramatic layered glow) =====

var PU_COLORS = {
  shield: 0x4488ff,
  slow: 0x44ffaa,
  double: 0xff44ff,
  magnet: 0xffaa00
};

export function spawnPowerup(scene, coinMeshes) {
  var types = ['shield', 'slow', 'double', 'magnet'];
  var type = types[Math.floor(Math.random() * types.length)];
  var lane = Math.floor(Math.random() * 3);
  var color = PU_COLORS[type];
  var group = new THREE.Group();

  // Outer glow (large, very transparent)
  var outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 16, 16),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.12 })
  );
  group.add(outer);

  // Mid glow
  var mid = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 14, 14),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.25 })
  );
  group.add(mid);

  // Inner core
  var inner = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshBasicMaterial({ color: color })
  );
  group.add(inner);

  // Icon shape on top
  var icon;
  if (type === 'shield') {
    icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  } else if (type === 'slow') {
    icon = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  } else if (type === 'double') {
    icon = new THREE.Mesh(new THREE.TetrahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  } else {
    icon = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  }
  icon.position.set(0, 0.6, 0);
  group.add(icon);

  // Rotating ring
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.03, 8, 24),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Second ring (perpendicular)
  var ring2 = ring.clone();
  ring2.rotation.x = 0;
  ring2.rotation.y = Math.PI / 2;
  group.add(ring2);

  group.position.set(LANE_X[lane], 1.5, -55);
  group.userData = { lane: lane, collected: false, type: 'powerup', powerupType: type };
  scene.add(group);
  coinMeshes.push(group);
}
