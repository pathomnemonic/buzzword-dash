/**
 * gates.js — Gate spawning, display, and encounter resolution
 * Now includes custom cards in the selection pool.
 */

import * as THREE from 'three';
import { CARDS } from '../cards.js';
import { storage } from '../storage.js';
import { customCards } from '../customcards.js';

var LANE_X = [-3, 0, 3];

export function pickCard(recentIds, mode) {
  var subjects = storage.get('selectedSubjects');

  // Merge built-in cards with user-created custom cards
  var allCards = CARDS.concat(customCards.getAll());

  var pool = allCards.filter(function (c) {
    return subjects.indexOf(c.subj) >= 0;
  });

  if (mode === 'weakness') {
    var weak = pool.filter(function (c) {
      var s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weak.length >= 3) pool = weak;
  }

  if (!pool.length) return null;

  var weighted = pool.map(function (c) {
    var s = storage.getCardStat(c.id);
    var w = 10;
    if (s.seen > 0) {
      var acc = s.correct / s.seen;
      if (acc < 0.5) w *= 3;
      else if (acc > 0.9 && s.seen > 3) w *= 0.3;
    }
    if (recentIds.indexOf(c.id) >= 0) w *= 0.05;
    return { card: c, weight: Math.max(w, 0.01) };
  });

  var total = 0;
  for (var i = 0; i < weighted.length; i++) total += weighted[i].weight;
  var r = Math.random() * total;
  for (var j = 0; j < weighted.length; j++) {
    r -= weighted[j].weight;
    if (r <= 0) return weighted[j].card;
  }
  return weighted[weighted.length - 1].card;
}

export function spawnGates(scene, gates, currentLane, theme) {
  var meshes = [];
  for (var j = 0; j < 3; j++) {
    var group = new THREE.Group();
    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 3, 0.2),
      new THREE.MeshBasicMaterial({
        color: j === currentLane ? 0x2244aa : 0x111833,
        transparent: true,
        opacity: 0.7
      })
    );
    group.add(frame);
    var glowMat = new THREE.MeshBasicMaterial({
      color: theme.glow || 0x18ffff,
      transparent: true,
      opacity: 0.35
    });
    var topBar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.2), glowMat);
    topBar.position.set(0, 1.55, 0);
    group.add(topBar);
    var botBar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 0.2), glowMat);
    botBar.position.set(0, -1.55, 0);
    group.add(botBar);
    for (var sx = -1; sx <= 1; sx += 2) {
      var p = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 3, 0.2),
        new THREE.MeshBasicMaterial({ color: theme.glow || 0x18ffff, transparent: true, opacity: 0.2 })
      );
      p.position.set(sx * 1.45, 0, 0);
      group.add(p);
    }
    group.position.set(LANE_X[j], 1.5, -60);
    scene.add(group);
    meshes.push(group);
  }
  return meshes;
}

export function updateGateHighlights(gateMeshes, currentLane) {
  for (var i = 0; i < gateMeshes.length; i++) {
    var frame = gateMeshes[i].children[0];
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
  for (var i = 0; i < gateMeshes.length; i++) {
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
