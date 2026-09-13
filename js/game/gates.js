/**
 * gates.js — Gate spawning, display, and encounter resolution
 */

import * as THREE from 'three';
import { CARDS } from '../cards.js';
import { storage } from '../storage.js';
import { audio } from '../audio.js';

const LANE_X = [-3, 0, 3];

export function pickCard(recentIds, mode) {
  const subjects = storage.get('selectedSubjects');
  let pool = CARDS.filter(c => subjects.includes(c.subj));
  if (mode === 'weakness') {
    const weak = pool.filter(c => {
      const s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weak.length >= 3) pool = weak;
  }
  if (!pool.length) return null;
  let weighted = pool.map(c => {
    const s = storage.getCardStat(c.id);
    let w = 10;
    if (s.seen > 0) {
      const acc = s.correct / s.seen;
      if (acc < 0.5) w *= 3;
      else if (acc > 0.9 && s.seen > 3) w *= 0.3;
    }
    if (recentIds.includes(c.id)) w *= 0.05;
    return { card: c, weight: Math.max(w, 0.01) };
  });
  const total = weighted.reduce((sum, x) => sum + x.weight, 0);
  let r = Math.random() * total;
  for (const x of weighted) { r -= x.weight; if (r <= 0) return x.card; }
  return weighted[weighted.length - 1].card;
}

export function spawnGates(scene, gates, currentLane, theme) {
  const meshes = [];
  for (let j = 0; j < 3; j++) {
    const group = new THREE.Group();
    // Gate frame — no text, just colored archway
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 3, 0.2),
      new THREE.MeshBasicMaterial({
        color: j === currentLane ? 0x2244aa : 0x111833,
        transparent: true, opacity: 0.7
      })
    );
    group.add(frame);
    // Glow bars
    const glowMat = new THREE.MeshBasicMaterial({ color: theme.glow || 0x18ffff, transparent: true, opacity: 0.35 });
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.2), glowMat);
    topBar.position.y = 1.55; group.add(topBar);
    const botBar = topBar.clone(); botBar.position.y = -1.55; group.add(botBar);
    // Side pillars
    for (const sx of [-1.45, 1.45]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3, 0.2),
        new THREE.MeshBasicMaterial({ color: theme.glow || 0x18ffff, transparent: true, opacity: 0.2 }));
      p.position.x = sx; group.add(p);
    }
    group.position.set(LANE_X[j], 1.5, -60);
    scene.add(group);
    meshes.push(group);
  }
  return meshes;
}

export function updateGateHighlights(gateMeshes, currentLane) {
  for (let i = 0; i < gateMeshes.length; i++) {
    const frame = gateMeshes[i].children[0];
    if (i === currentLane) {
      frame.material.color.setHex(0x2244aa);
      frame.material.opacity = 0.8;
    } else {
      frame.material.color.setHex(0x111833);
      frame.material.opacity = 0.5;
    }
  }
}

export function flashGateResult(gateMeshes, gates, currentLane) {
  for (let i = 0; i < gateMeshes.length; i++) {
    if (gates[i].correct) {
      gateMeshes[i].children[0].material.color.setHex(0x00cc55);
    } else if (i === currentLane) {
      gateMeshes[i].children[0].material.color.setHex(0xcc0000);
    }
  }
}

export function resolveStats(card, wasCorrect) {
  storage.updateCardStat(card.id, wasCorrect);
  storage.updateSubjectStat(card.subj, wasCorrect);
  if (wasCorrect) storage.set('totalCorrect', storage.get('totalCorrect') + 1);
  else storage.set('totalWrong', storage.get('totalWrong') + 1);
  storage.set('totalEncounters', storage.get('totalEncounters') + 1);
}
