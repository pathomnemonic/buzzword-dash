/**
 * props.js — Procedural medical 3D decoration builders
 * All built from Three.js primitives — no external models needed.
 */

import * as THREE from 'three';

export function buildAmbulance() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }));
  body.position.y = 1.0; body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.3), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  cab.position.set(-1.5, 0.85, 0); g.add(cab);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 1.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  stripe.position.y = 1.1; g.add(stripe);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  crossH.position.set(0, 1.5, 0.72); g.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.3), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  crossV.position.set(0, 1.5, 0.72); g.add(crossV);
  const wGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.15, 12);
  const wMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  [[-0.8,0.25,0.7],[-0.8,0.25,-0.7],[0.8,0.25,0.7],[0.8,0.25,-0.7]].forEach(p => {
    const w = new THREE.Mesh(wGeo, wMat); w.position.set(p[0],p[1],p[2]); w.rotation.x = Math.PI/2; g.add(w);
  });
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.15,0.2), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  l1.position.set(-0.3, 1.68, 0); g.add(l1);
  const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.15,0.2), new THREE.MeshBasicMaterial({ color: 0x4444ff }));
  l2.position.set(0.3, 1.68, 0); g.add(l2);
  return g;
}

export function buildHospital() {
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 2.5), new THREE.MeshStandardMaterial({ color: 0xe8e0d8 }));
  main.position.y = 2; main.castShadow = true; g.add(main);
  const winMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.05), winMat);
      win.position.set(-0.9 + col * 0.6, 1.2 + row * 1.1, 1.28); g.add(win);
    }
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.05), new THREE.MeshBasicMaterial({ color: 0x336699 }));
  door.position.set(0, 0.45, 1.28); g.add(door);
  const cH = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  cH.position.set(0, 3.8, 1.28); g.add(cH);
  const cV = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  cV.position.set(0, 3.8, 1.28); g.add(cV);
  return g;
}

export function buildDNAHelix() {
  const g = new THREE.Group();
  const mat1 = new THREE.MeshBasicMaterial({ color: 0x4488ff });
  const mat2 = new THREE.MeshBasicMaterial({ color: 0xff4488 });
  const rungMat = new THREE.MeshBasicMaterial({ color: 0x44ff88 });
  const height = 5, radius = 0.4, turns = 3, segments = 40;
  for (let i = 0; i < segments; i++) {
    const t = i / segments, y = t * height, angle = t * turns * Math.PI * 2;
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mat1);
    s1.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius); g.add(s1);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mat2);
    s2.position.set(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius); g.add(s2);
    if (i % 4 === 0) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, radius * 2, 6), rungMat);
      rung.position.set(0, y, 0); rung.rotation.z = Math.PI / 2; rung.rotation.y = angle; g.add(rung);
    }
  }
  return g;
}

export function buildPillBottle() {
  const g = new THREE.Group();
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,1.0,12), new THREE.MeshStandardMaterial({ color: 0xff8833 })), { position: new THREE.Vector3(0,0.5,0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.2,12), new THREE.MeshStandardMaterial({ color: 0xeeeeee })), { position: new THREE.Vector3(0,1.1,0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.31,0.31,0.4,12,1,true), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })), { position: new THREE.Vector3(0,0.5,0) }));
  return g;
}

export function buildHeartMonitor() {
  const g = new THREE.Group();
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1.2,0.8,0.1), new THREE.MeshBasicMaterial({ color: 0x001a00 })), { position: new THREE.Vector3(0,2.5,0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1.3,0.9,0.08), new THREE.MeshStandardMaterial({ color: 0x888888 })), { position: new THREE.Vector3(0,2.5,0.02) }));
  const points = [];
  for (let i = 0; i < 20; i++) {
    let x = -0.5 + i * 0.05, y = 2.5;
    if (i === 8) y += 0.15; if (i === 9) y -= 0.2; if (i === 10) y += 0.3; if (i === 11) y -= 0.1;
    points.push(new THREE.Vector3(x, y, -0.06));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x00ff00 })));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,2,8), new THREE.MeshStandardMaterial({ color: 0x666666 })), { position: new THREE.Vector3(0,1,0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.5,0.1,12), new THREE.MeshStandardMaterial({ color: 0x555555 })), { position: new THREE.Vector3(0,0.05,0) }));
  return g;
}

export function buildSyringe() {
  const g = new THREE.Group();
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,1.2,12), new THREE.MeshStandardMaterial({ color: 0xddddff, transparent: true, opacity: 0.7 })), { position: new THREE.Vector3(0,0.6,0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.5,12), new THREE.MeshStandardMaterial({ color: 0x888888 })), { position: new THREE.Vector3(0,1.0,0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.04,12), new THREE.MeshStandardMaterial({ color: 0x666666 })), { position: new THREE.Vector3(0,1.25,0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.005,0.4,6), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 })), { position: new THREE.Vector3(0,-0.2,0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.4,12), new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 })), { position: new THREE.Vector3(0,0.3,0) }));
  g.scale.set(2, 2, 2);
  return g;
}

export function buildMedicalCross() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.1), mat), { position: new THREE.Vector3(0, 2.5, 0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.1), mat), { position: new THREE.Vector3(0, 2.5, 0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 8), new THREE.MeshStandardMaterial({ color: 0x888888 })), { position: new THREE.Vector3(0, 1, 0) }));
  return g;
}

// All available prop builders
export const PROP_BUILDERS = [
  buildAmbulance,
  buildHospital,
  buildDNAHelix,
  buildPillBottle,
  buildHeartMonitor,
  buildSyringe,
  buildMedicalCross
];
