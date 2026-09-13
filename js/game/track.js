/**
 * track.js — Track with flying environment props
 *
 * All decorations now fly toward the camera instead of being static.
 * Props are managed by the engine via envPropMeshes array.
 * Track includes overhead light arches and pulsing lane lines.
 */

import * as THREE from 'three';
import { PROP_BUILDERS } from './props.js';

export function buildTrack(scene, theme) {
  // Ground
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 400),
    new THREE.MeshStandardMaterial({ color: theme.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -190);
  ground.receiveShadow = true;
  scene.add(ground);

  // Lane dividers (pulsing glow lines)
  var laneMat = new THREE.MeshBasicMaterial({
    color: theme.glow,
    transparent: true,
    opacity: 0.25
  });
  for (var lx = -1; lx <= 1; lx += 2) {
    var line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 400), laneMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(lx * 1.5, 0.02, -190);
    scene.add(line);
  }

  // Side walls
  var wallMat = new THREE.MeshBasicMaterial({ color: theme.wall });
  for (var side = -1; side <= 1; side += 2) {
    var wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.5, 400), wallMat);
    wall.position.set(side * 6, 1.75, -190);
    scene.add(wall);

    // Top glow strip
    var glowStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.12, 400),
      new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.35 })
    );
    glowStrip.position.set(side * 6, 3.55, -190);
    scene.add(glowStrip);

    // Bottom glow strip
    var bottomGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.08, 400),
      new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.2 })
    );
    bottomGlow.position.set(side * 6, 0.04, -190);
    scene.add(bottomGlow);
  }

  // Overhead light arches
  for (var z = -160; z < 20; z += 25) {
    // Arch legs
    for (var archSide = -1; archSide <= 1; archSide += 2) {
      var archLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 5, 6),
        new THREE.MeshBasicMaterial({ color: theme.wall })
      );
      archLeg.position.set(archSide * 5.5, 2.5, z);
      scene.add(archLeg);
    }
    // Arch beam
    var archBeam = new THREE.Mesh(
      new THREE.BoxGeometry(11.2, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.3 })
    );
    archBeam.position.set(0, 5, z);
    scene.add(archBeam);
    // Light on arch
    var archLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: theme.glow })
    );
    archLight.position.set(0, 4.9, z);
    scene.add(archLight);
  }

  // Static pillar lights along walls
  for (var side2 = -1; side2 <= 1; side2 += 2) {
    for (var pz = -160; pz < 20; pz += 18) {
      var pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 3.5, 0.4),
        new THREE.MeshStandardMaterial({ color: theme.wall })
      );
      pillar.position.set(side2 * 5.3, 1.75, pz);
      scene.add(pillar);
      var sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshBasicMaterial({ color: theme.glow })
      );
      sphere.position.set(side2 * 5.3, 3.7, pz);
      scene.add(sphere);
    }
  }
}

// ===== FLYING ENVIRONMENT PROPS =====
// Called by engine.js to spawn props that fly toward the camera

export function spawnEnvProp(scene, envPropMeshes) {
  var builder = PROP_BUILDERS[Math.floor(Math.random() * PROP_BUILDERS.length)];
  var prop = builder();

  // Spawn on left or right side, or overhead
  var placement = Math.random();
  if (placement < 0.4) {
    // Left side
    prop.position.set(-7 - Math.random() * 3, Math.random() * 2, -80);
  } else if (placement < 0.8) {
    // Right side
    prop.position.set(7 + Math.random() * 3, Math.random() * 2, -80);
  } else {
    // Overhead
    prop.position.set((Math.random() - 0.5) * 8, 4 + Math.random() * 3, -80);
  }

  // Random rotation for variety
  prop.rotation.y = Math.random() * Math.PI * 2;

  // Scale variation
  var scale = 0.6 + Math.random() * 0.8;
  prop.scale.set(scale, scale, scale);

  prop.userData = { isEnvProp: true };
  scene.add(prop);
  envPropMeshes.push(prop);
}
