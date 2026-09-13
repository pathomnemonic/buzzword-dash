/**
 * gates.js — Gate spawning, card selection, and encounter resolution
 *
 * All Phases through Final:
 * - Merges built-in cards with user-created custom cards
 * - Weighted adaptive card selection (weakness, recency, difficulty)
 * - Spaced repetition using lastSeen timestamp from storage
 * - Deterministic daily challenge seeding (same cards for everyone on same day)
 * - Answer-leak detection logged to console
 * - Gate 3D mesh creation with theme-colored archways
 * - Gate highlight updates based on current lane
 * - Gate flash on correct/incorrect
 * - Stat recording on encounter resolution
 *
 * The card selection algorithm uses:
 *   weight = base * weaknessMultiplier * recencyModifier * difficultyModifier
 * Cards the player frequently misses get higher weight (appear more often).
 * Cards answered correctly many times get lower weight (appear less).
 * Recently seen cards get lower weight to avoid immediate repetition.
 * The lastSeen timestamp enables true spaced repetition over sessions.
 *
 * Daily challenge uses a date-based seed for deterministic pseudo-random
 * selection so all players see the same 15 cards on the same day.
 */

import * as THREE from 'three';
import { CARDS } from '../cards.js';
import { storage } from '../storage.js';
import { customCards } from '../customcards.js';

var LANE_X = [-3, 0, 3];

// ===== SEEDED RANDOM FOR DAILY CHALLENGES =====

/**
 * Simple seeded pseudo-random number generator (mulberry32).
 * Given the same seed, always produces the same sequence.
 * Used for daily challenge to ensure all players get same cards.
 */
function seededRandom(seed) {
  var t = seed + 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Get a numeric seed from today's date.
 * Same date = same seed = same card sequence.
 */
function getDailySeed() {
  var today = new Date();
  return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

// ===== CARD POOL =====

/**
 * Get all available cards (built-in + custom) filtered by selected subjects.
 */
function getCardPool(subjects) {
  var allCards = CARDS.concat(customCards.getAll());
  return allCards.filter(function (c) {
    return subjects.indexOf(c.subj) >= 0;
  });
}

// ===== ADAPTIVE CARD PICKER =====

/**
 * Pick a card using weighted adaptive selection.
 *
 * Weights are calculated based on:
 * - Weakness: cards with low accuracy get 3× weight
 * - Mastery: cards with high accuracy get 0.3× weight
 * - Recency: recently seen cards get lower weight
 * - Spaced repetition: cards not seen in a long time get boosted
 * - Avoids immediate repetition via recentIds
 *
 * @param {string[]} recentIds - IDs of recently shown cards
 * @param {string} mode - Game mode ('endless', 'study', 'weakness', 'daily')
 * @param {number} dailyIndex - For daily mode, which card number (0-14)
 * @returns {object|null} Selected card or null if pool empty
 */
export function pickCard(recentIds, mode, dailyIndex) {
  var subjects = storage.get('selectedSubjects');
  var pool = getCardPool(subjects);

  // ===== DAILY MODE: deterministic selection =====
  if (mode === 'daily') {
    var seed = getDailySeed();
    // Shuffle pool deterministically using seed
    var dailyPool = pool.slice();
    for (var di = dailyPool.length - 1; di > 0; di--) {
      var dj = Math.floor(seededRandom(seed + di + (dailyIndex || 0) * 100) * (di + 1));
      var temp = dailyPool[di];
      dailyPool[di] = dailyPool[dj];
      dailyPool[dj] = temp;
    }
    // Return the card at dailyIndex position
    var idx = (dailyIndex || 0) % dailyPool.length;
    return dailyPool[idx] || null;
  }

  // ===== WEAKNESS MODE: filter to weak cards =====
  if (mode === 'weakness') {
    var weak = pool.filter(function (c) {
      var s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weak.length >= 3) pool = weak;
  }

  if (!pool.length) return null;

  // ===== WEIGHTED SELECTION =====
  var now = Date.now();

  var weighted = pool.map(function (c) {
    var s = storage.getCardStat(c.id);
    var w = 10; // base weight

    // --- Weakness multiplier ---
    if (s.seen > 0) {
      var accuracy = s.correct / s.seen;
      if (accuracy < 0.3) w *= 4;       // very weak: 4× more likely
      else if (accuracy < 0.5) w *= 3;   // weak: 3× more likely
      else if (accuracy < 0.7) w *= 1.5; // below average: 1.5×
      else if (accuracy > 0.9 && s.seen > 5) w *= 0.2; // mastered: much less likely
      else if (accuracy > 0.8 && s.seen > 3) w *= 0.5; // strong: less likely
    }

    // --- Recency modifier (avoid immediate repetition) ---
    if (recentIds.indexOf(c.id) >= 0) {
      w *= 0.02; // almost never show same card twice in a row
    }

    // --- Spaced repetition: boost cards not seen recently ---
    if (s.lastSeen > 0) {
      var hoursSince = (now - s.lastSeen) / (1000 * 60 * 60);
      if (hoursSince < 0.5) w *= 0.3;        // seen in last 30 min: reduce
      else if (hoursSince < 2) w *= 0.6;      // seen in last 2 hours: slightly reduce
      else if (hoursSince > 24) w *= 1.3;     // not seen in 24h: boost
      else if (hoursSince > 72) w *= 1.8;     // not seen in 3 days: bigger boost
      else if (hoursSince > 168) w *= 2.5;    // not seen in 1 week: significant boost
    } else {
      // Never seen before: moderate boost to introduce new cards
      w *= 1.5;
    }

    // --- Unseen card bonus (ensure new cards get shown) ---
    if (s.seen === 0) {
      w *= 2;
    }

    return { card: c, weight: Math.max(w, 0.01) };
  });

  // --- Weighted random selection ---
  var total = 0;
  for (var i = 0; i < weighted.length; i++) total += weighted[i].weight;
  var r = Math.random() * total;
  for (var j = 0; j < weighted.length; j++) {
    r -= weighted[j].weight;
    if (r <= 0) return weighted[j].card;
  }
  return weighted[weighted.length - 1].card;
}

// ===== GATE 3D MESH CREATION =====

/**
 * Create three gate meshes (one per lane) with themed colors.
 * Gates are plain colored archways — answer text is in the HTML HUD.
 *
 * @param {THREE.Scene} scene
 * @param {object[]} gates - Array of {label, correct} for each lane
 * @param {number} currentLane - Player's current lane (0, 1, or 2)
 * @param {object} theme - Theme color config
 * @returns {THREE.Group[]} Array of 3 gate mesh groups
 */
export function spawnGates(scene, gates, currentLane, theme) {
  var meshes = [];
  for (var j = 0; j < 3; j++) {
    var group = new THREE.Group();

    // Gate frame
    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 3, 0.2),
      new THREE.MeshBasicMaterial({
        color: j === currentLane ? 0x2244aa : 0x111833,
        transparent: true,
        opacity: 0.7
      })
    );
    group.add(frame);

    // Glow bars (top and bottom)
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

    // Side pillars
    for (var sx = -1; sx <= 1; sx += 2) {
      var pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 3, 0.2),
        new THREE.MeshBasicMaterial({
          color: theme.glow || 0x18ffff,
          transparent: true,
          opacity: 0.2
        })
      );
      pillar.position.set(sx * 1.45, 0, 0);
      group.add(pillar);
    }

    group.position.set(LANE_X[j], 1.5, -60);
    scene.add(group);
    meshes.push(group);
  }
  return meshes;
}

// ===== GATE HIGHLIGHT UPDATES =====

/**
 * Update gate colors to highlight the player's current lane.
 * Called every frame by engine.js during active gate approach.
 *
 * @param {THREE.Group[]} gateMeshes
 * @param {number} currentLane
 */
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

// ===== GATE FLASH ON RESULT =====

/**
 * Flash gate colors green (correct) or red (wrong) after encounter resolves.
 *
 * @param {THREE.Group[]} gateMeshes
 * @param {object[]} gates - Array of {label, correct}
 * @param {number} currentLane - Which lane the player was in
 */
export function flashGateResult(gateMeshes, gates, currentLane) {
  for (var i = 0; i < gateMeshes.length; i++) {
    if (gates[i].correct) {
      gateMeshes[i].children[0].material.color.setHex(0x00cc55);
    } else if (i === currentLane) {
      gateMeshes[i].children[0].material.color.setHex(0xcc0000);
    }
  }
}

// ===== STAT RECORDING =====

/**
 * Record encounter stats to storage.
 * Called by engine.js after each encounter resolves.
 *
 * @param {object} card - The card that was just answered
 * @param {boolean} wasCorrect - Whether the player answered correctly
 */
export function resolveStats(card, wasCorrect) {
  storage.updateCardStat(card.id, wasCorrect);
  storage.updateSubjectStat(card.subj, wasCorrect);
  if (wasCorrect) {
    storage.set('totalCorrect', storage.get('totalCorrect') + 1);
  } else {
    storage.set('totalWrong', storage.get('totalWrong') + 1);
  }
  storage.set('totalEncounters', storage.get('totalEncounters') + 1);
}

// ===== ANSWER LEAK DETECTION =====

/**
 * Check if any buzzword contains a distinctive word from the correct answer
 * that doesn't also appear in a distractor. If so, the buzzword "leaks"
 * the answer and the card should be flagged for review.
 *
 * @param {object} card - Card to validate
 * @param {object[]} gates - Gate configuration
 * @returns {boolean} true if card is clean, false if answer leaks
 */
export function validateCardNoLeak(card, gates) {
  var ansLabel = '';
  for (var g = 0; g < gates.length; g++) {
    if (gates[g].correct) {
      ansLabel = gates[g].label;
      break;
    }
  }

  var ansWords = ansLabel.toLowerCase().split(/[\s\-\/\(\)]+/).filter(function (w) {
    return w.length > 4; // only check words longer than 4 chars
  });

  for (var b = 0; b < card.bw.length; b++) {
    var bwLower = card.bw[b].toLowerCase();
    for (var w = 0; w < ansWords.length; w++) {
      if (bwLower.indexOf(ansWords[w]) >= 0) {
        // Check if this word also appears in a distractor
        var alsoInDistractor = false;
        for (var d = 0; d < card.d.length; d++) {
          if (card.d[d].toLowerCase().indexOf(ansWords[w]) >= 0) {
            alsoInDistractor = true;
            break;
          }
        }
        if (!alsoInDistractor) {
          console.warn('Answer-leak detected:', card.id, '"' + card.bw[b] + '" contains "' + ansWords[w] + '" from answer "' + ansLabel + '"');
          return false;
        }
      }
    }
  }

  return true;
}
