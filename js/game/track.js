/**
 * track.js — Track, walls, pillars, lane dividers, medical decorations
 */

import * as THREE from 'three';
import { PROP_BUILDERS } from './props.js';

export function buildTrack(scene, theme) {
  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 400),
    new THREE.MeshStandardMaterial({ color: theme.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -190;
  ground.receiveShadow = true;
  scene.add(ground);

  // Lane dividers
  [-1.5, 1.5].forEach(x => {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 400),
      new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.2 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.02, -190);
    scene.add(line);
  });

  // Side walls + pillars + glow strips
  [-1, 1].forEach(side => {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 3, 400),
      new THREE.MeshBasicMaterial({ color: theme.wall })
    );
    wall.position.set(side * 6, 1.5, -190);
    scene.add(wall);

    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.1, 400),
      new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.35 })
    );
    glow.position.set(side * 6, 3.05, -190);
    scene.add(glow);

    for (let z = -160; z < 20; z += 16) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 3.5, 0.5),
        new THREE.MeshStandardMaterial({ color: theme.wall })
      );
      pillar.position.set(side * 5.3, 1.75, z);
      scene.add(pillar);

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: theme.glow })
      );
      sphere.position.set(side * 5.3, 3.7, z);
      scene.add(sphere);
    }
  });

  // Scatter medical props along both sides
  for (let z = -150; z < 10; z += 20) {
    for (const side of [-1, 1]) {
      const builder = PROP_BUILDERS[Math.floor(Math.random() * PROP_BUILDERS.length)];
      const prop = builder();
      prop.position.set(side * (7 + Math.random() * 2), 0, z + Math.random() * 8);
      prop.rotation.y = Math.random() * Math.PI * 2;
      scene.add(prop);
    }
  }
}
