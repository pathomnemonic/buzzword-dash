/**
 * gates.js — Gate spawning, card selection, and encounter resolution
 *
 * FIXES & UPDATES:
 * - Spaced repetition threshold ordering corrected (>168 before >72 before >24)
 * - Card freshness weighting increased to configurable value (default 5)
 * - Empty subjects array = use all subjects
 * - Exam filter support via storage.get('selectedExams')
 * - Disabled cards support via storage.isCardDisabled()
 * - FIX: Removed illegal top-level await that broke module loading chain
 * - NEW: Seeded card order parameter for multiplayer synchronized card ordering
 */

import * as THREE from 'three';
import { CARDS, SUBJECTS } from '../cards.js';
import { storage } from '../storage.js';
import { customCards } from '../customcards.js';

// EXAM_FILTERS: defined locally as fallback since cards.js may not export it yet.
// When cards.js is updated to export EXAM_FILTERS, this can be replaced with a
// static import: import { CARDS, SUBJECTS, EXAM_FILTERS } from '../cards.js';
var EXAM_FILTERS = [
    "step1", "step2", "step3",
    "comlex1", "comlex2",
    "shelf_im", "shelf_surg", "shelf_peds", "shelf_obgyn",
    "shelf_psych", "shelf_neuro", "shelf_fm"
];

var LANE_X = [-3, 0, 3];

function seededRandom(seed) {
    var t = seed + 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function getDailySeed() {
    var today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

function getCardPool(subjects) {
    var allCards = CARDS.concat(customCards.getAll());

    // NEW: If subjects array is empty, use ALL subjects
    if (!subjects || subjects.length === 0) {
        subjects = SUBJECTS.slice();
    }

    var filtered = allCards.filter(function (c) {
        return subjects.indexOf(c.subj) >= 0;
    });

    // NEW: Filter by exam type if selectedExams is set
    var selectedExams = null;
    try {
        selectedExams = storage.get('selectedExams');
    } catch (e) {}

    if (selectedExams && Array.isArray(selectedExams) && selectedExams.length > 0) {
        filtered = filtered.filter(function (c) {
            // Only filter cards that HAVE exams field
            if (!c.exams || !Array.isArray(c.exams)) return true; // Include cards without exam tags
            // Check if any of the card's exam tags match the selected exams
            for (var i = 0; i < selectedExams.length; i++) {
                if (c.exams.indexOf(selectedExams[i]) >= 0) return true;
            }
            return false;
        });
    }

    // NEW: Filter out disabled cards
    try {
        if (storage.isCardDisabled) {
            filtered = filtered.filter(function (c) {
                return !storage.isCardDisabled(c.id);
            });
        }
    } catch (e) {}

    return filtered;
}

export function pickCard(recentIds, mode, dailyIndex, seededOrder) {
    var subjects = storage.get('selectedSubjects');

    // NEW: If subjects is empty or null, treat as all subjects selected
    if (!subjects || subjects.length === 0) {
        subjects = SUBJECTS.slice();
    }

    var pool = getCardPool(subjects);

    // Multiplayer: use seeded card order if provided
    if (seededOrder && Array.isArray(seededOrder) && seededOrder.length > 0) {
        var allCards = CARDS.concat(customCards.getAll());
        // Try each ID in order until we find a valid, non-disabled card
        while (seededOrder.length > 0) {
            var nextId = seededOrder.shift();
            for (var si = 0; si < allCards.length; si++) {
                if (allCards[si].id === nextId) {
                    // Check if card is disabled
                    try {
                        if (storage.isCardDisabled && storage.isCardDisabled(nextId)) continue;
                    } catch (e) {}
                    return allCards[si];
                }
            }
        }
        // Seeded order exhausted, fall through to normal selection
    }

    if (mode === 'daily') {
        var seed = getDailySeed();
        var dailyPool = pool.slice();
        for (var di = dailyPool.length - 1; di > 0; di--) {
            var dj = Math.floor(seededRandom(seed + di + (dailyIndex || 0) * 100) * (di + 1));
            var temp = dailyPool[di];
            dailyPool[di] = dailyPool[dj];
            dailyPool[dj] = temp;
        }
        var idx = (dailyIndex || 0) % dailyPool.length;
        return dailyPool[idx] || null;
    }

    if (mode === 'weakness') {
        var weak = pool.filter(function (c) {
            var s = storage.getCardStat(c.id);
            return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
        });
        if (weak.length >= 3) pool = weak;
    }

    if (!pool.length) return null;

    var now = Date.now();

    // NEW: Configurable card freshness weight
    var freshnessWeight = 5; // default
    try {
        var storedWeight = storage.get('cardFreshnessWeight');
        if (storedWeight && typeof storedWeight === 'number' && storedWeight > 0) {
            freshnessWeight = storedWeight;
        }
    } catch (e) {}

    var weighted = pool.map(function (c) {
        var s = storage.getCardStat(c.id);
        var w = 10;

        if (s.seen > 0) {
            var accuracy = s.correct / s.seen;
            if (accuracy < 0.3) w *= 4;
            else if (accuracy < 0.5) w *= 3;
            else if (accuracy < 0.7) w *= 1.5;
            else if (accuracy > 0.9 && s.seen > 5) w *= 0.2;
            else if (accuracy > 0.8 && s.seen > 3) w *= 0.5;
        }

        if (recentIds.indexOf(c.id) >= 0) {
            w *= 0.02;
        }

        // FIX: Spaced repetition thresholds in correct order (largest first)
        if (s.lastSeen > 0) {
            var hoursSince = (now - s.lastSeen) / (1000 * 60 * 60);
            if (hoursSince < 0.5) w *= 0.3;
            else if (hoursSince < 2) w *= 0.6;
            else if (hoursSince > 168) w *= 2.5;
            else if (hoursSince > 72) w *= 1.8;
            else if (hoursSince > 24) w *= 1.3;
        } else {
            w *= 1.5;
        }

        // NEW: Heavily weight unseen cards (configurable, default 5x)
        if (s.seen === 0) {
            w *= freshnessWeight;
        }

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
    if (wasCorrect) {
        storage.set('totalCorrect', storage.get('totalCorrect') + 1);
    } else {
        storage.set('totalWrong', storage.get('totalWrong') + 1);
    }
    storage.set('totalEncounters', storage.get('totalEncounters') + 1);
}

export function validateCardNoLeak(card, gates) {
    var ansLabel = '';
    for (var g = 0; g < gates.length; g++) {
        if (gates[g].correct) {
            ansLabel = gates[g].label;
            break;
        }
    }

    var ansWords = ansLabel.toLowerCase().split(/[\s\-\/\(\)]+/).filter(function (w) {
        return w.length > 4;
    });

    for (var b = 0; b < card.bw.length; b++) {
        var bwLower = card.bw[b].toLowerCase();
        for (var w = 0; w < ansWords.length; w++) {
            if (bwLower.indexOf(ansWords[w]) >= 0) {
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
