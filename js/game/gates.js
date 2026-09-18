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
 *
 * MULTI-AGENT EXPANSION:
 * - NEW: Question type filtering via storage.get('selectedQuestionTypes')
 * - NEW: Source discipline filtering via storage.get('selectedSources')
 * - NEW: Year filtering via storage.get('selectedYears')
 * - NEW: High-yield only filtering via storage.get('highYieldOnly')
 * - NEW: baseDifficulty scaling during a run (prefer easy early, harder later)
 * - NEW: Question type variety enforcement (avoid 3+ same type in a row)
 * - NEW: Subject rotation (avoid 3+ same subject in a row)
 * - REMOVED: validateCardNoLeak() — now handled at import time by hub cleanCards()
 * - REMOVED: Local EXAM_FILTERS fallback — now imported from cards.js hub
 */

import * as THREE from 'three';
import { CARDS, SUBJECTS } from '../cards.js';
import { storage } from '../storage.js';
import { customCards } from '../customcards.js';

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

/**
 * Patch missing new-schema fields onto a card so downstream code
 * (UI display, filtering) never sees undefined.
 * This is primarily needed for custom cards which bypass the hub's cleanCards().
 */
function patchCardDefaults(c) {
    if (c.exams === undefined) c.exams = [];
    if (c.baseDifficulty === undefined) c.baseDifficulty = 2;
    if (c.questionType === undefined) c.questionType = 'buzzword_dx';
    if (c.source === undefined) c.source = 'clinical_medicine';
    if (c.tags === undefined) c.tags = c.subj ? [c.subj.toLowerCase()] : [];
    if (c.hx === undefined) c.hx = false;
    if (c.yr === undefined) c.yr = 2;
    if (c.pearls === undefined) c.pearls = c.tp ? [c.tp.split('.')[0]] : [];
    return c;
}

function getCardPool(subjects) {
    // Hub CARDS are already cleaned; custom cards need patching
    var customs = customCards.getAll().map(patchCardDefaults);
    var allCards = CARDS.concat(customs);

    // If subjects array is empty, use ALL subjects
    if (!subjects || subjects.length === 0) {
        subjects = SUBJECTS.slice();
    }

    var filtered = allCards.filter(function (c) {
        return subjects.indexOf(c.subj) >= 0;
    });

    // ── Exam filter ──
    var selectedExams = null;
    try { selectedExams = storage.get('selectedExams'); } catch (e) {}

    if (selectedExams && Array.isArray(selectedExams) && selectedExams.length > 0) {
        filtered = filtered.filter(function (c) {
            if (!c.exams || !Array.isArray(c.exams) || c.exams.length === 0) return true;
            for (var i = 0; i < selectedExams.length; i++) {
                if (c.exams.indexOf(selectedExams[i]) >= 0) return true;
            }
            return false;
        });
    }

    // ── Question type filter ──
    var selectedQuestionTypes = null;
    try { selectedQuestionTypes = storage.get('selectedQuestionTypes'); } catch (e) {}

    if (selectedQuestionTypes && Array.isArray(selectedQuestionTypes) && selectedQuestionTypes.length > 0) {
        filtered = filtered.filter(function (c) {
            if (!c.questionType) return true;
            return selectedQuestionTypes.indexOf(c.questionType) >= 0;
        });
    }

    // ── Source discipline filter ──
    var selectedSources = null;
    try { selectedSources = storage.get('selectedSources'); } catch (e) {}

    if (selectedSources && Array.isArray(selectedSources) && selectedSources.length > 0) {
        filtered = filtered.filter(function (c) {
            if (!c.source) return true;
            return selectedSources.indexOf(c.source) >= 0;
        });
    }

    // ── Year filter ──
    var selectedYears = null;
    try { selectedYears = storage.get('selectedYears'); } catch (e) {}

    if (selectedYears && Array.isArray(selectedYears) && selectedYears.length > 0) {
        filtered = filtered.filter(function (c) {
            if (!c.yr) return true;
            return selectedYears.indexOf(c.yr) >= 0;
        });
    }

    // ── High-yield only filter ──
    var highYieldOnly = false;
    try { highYieldOnly = storage.get('highYieldOnly'); } catch (e) {}

    if (highYieldOnly) {
        filtered = filtered.filter(function (c) {
            return c.hx === true;
        });
    }

    // ── Disabled cards filter ──
    try {
        if (storage.isCardDisabled) {
            filtered = filtered.filter(function (c) {
                return !storage.isCardDisabled(c.id);
            });
        }
    } catch (e) {}

    // ── Fallback: if all filters result in empty pool, warn and use unfiltered ──
    if (filtered.length === 0) {
        console.warn('[Buzzword Dash] All filters resulted in empty card pool — falling back to unfiltered.');
        filtered = allCards.filter(function (c) {
            return subjects.indexOf(c.subj) >= 0;
        });
        // Still remove disabled
        try {
            if (storage.isCardDisabled) {
                filtered = filtered.filter(function (c) {
                    return !storage.isCardDisabled(c.id);
                });
            }
        } catch (e) {}
    }

    return filtered;
}

export function pickCard(recentIds, mode, dailyIndex, seededOrder, encounterCount) {
    var subjects = storage.get('selectedSubjects');

    // If subjects is empty or null, treat as all subjects selected
    if (!subjects || subjects.length === 0) {
        subjects = SUBJECTS.slice();
    }

    var pool = getCardPool(subjects);

    // Multiplayer: use seeded card order if provided
    if (seededOrder && Array.isArray(seededOrder) && seededOrder.length > 0) {
        var allCards = CARDS.concat(customCards.getAll());
        while (seededOrder.length > 0) {
            var nextId = seededOrder.shift();
            for (var si = 0; si < allCards.length; si++) {
                if (allCards[si].id === nextId) {
                    try {
                        if (storage.isCardDisabled && storage.isCardDisabled(nextId)) continue;
                    } catch (e) {}
                    return patchCardDefaults(allCards[si]);
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
    var enc = encounterCount || 0;

    // Configurable card freshness weight
    var freshnessWeight = 5;
    try {
        var storedWeight = storage.get('cardFreshnessWeight');
        if (storedWeight && typeof storedWeight === 'number' && storedWeight > 0) {
            freshnessWeight = storedWeight;
        }
    } catch (e) {}

    // ── Build recent types and subjects for variety enforcement ──
    var recentTypes = [];
    var recentSubjects = [];
    // We track the last few cards via recentIds to derive their types/subjects
    // This requires looking up cards by ID which is O(n) but recentIds is small (≤10)
    if (recentIds && recentIds.length > 0) {
        var allCardsForLookup = CARDS.concat(customCards.getAll());
        var lastFew = recentIds.slice(-3);
        for (var ri = 0; ri < lastFew.length; ri++) {
            for (var rj = 0; rj < allCardsForLookup.length; rj++) {
                if (allCardsForLookup[rj].id === lastFew[ri]) {
                    var rc = allCardsForLookup[rj];
                    if (rc.questionType) recentTypes.push(rc.questionType);
                    if (rc.subj) recentSubjects.push(rc.subj);
                    break;
                }
            }
        }
    }

    // Check if last 3 cards were all the same question type
    var avoidType = null;
    if (recentTypes.length >= 3 && recentTypes[0] === recentTypes[1] && recentTypes[1] === recentTypes[2]) {
        avoidType = recentTypes[0];
    }

    // Check if last 3 cards were all the same subject (only if multiple subjects selected)
    var avoidSubject = null;
    if (subjects.length > 1 && recentSubjects.length >= 3 &&
        recentSubjects[0] === recentSubjects[1] && recentSubjects[1] === recentSubjects[2]) {
        avoidSubject = recentSubjects[0];
    }

    var weighted = pool.map(function (c) {
        var s = storage.getCardStat(c.id);
        var w = 10;

        // ── Accuracy-based weighting ──
        if (s.seen > 0) {
            var accuracy = s.correct / s.seen;
            if (accuracy < 0.3) w *= 4;
            else if (accuracy < 0.5) w *= 3;
            else if (accuracy < 0.7) w *= 1.5;
            else if (accuracy > 0.9 && s.seen > 5) w *= 0.2;
            else if (accuracy > 0.8 && s.seen > 3) w *= 0.5;
        }

        // ── Recent card penalty ──
        if (recentIds.indexOf(c.id) >= 0) {
            w *= 0.02;
        }

        // ── Spaced repetition thresholds (largest first) ──
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

        // ── Unseen card freshness boost ──
        if (s.seen === 0) {
            w *= freshnessWeight;
        }

        // ── baseDifficulty scaling during a run ──
        // Early encounters (0-5): prefer difficulty 1-2
        // Mid encounters (6-15): balanced
        // Late encounters (16+): weight difficulty 3 higher
        if (c.baseDifficulty) {
            if (enc < 6) {
                // Early: boost easy, penalize hard
                if (c.baseDifficulty === 1) w *= 1.5;
                else if (c.baseDifficulty === 3) w *= 0.5;
            } else if (enc >= 16) {
                // Late: boost hard, slight penalty for easy
                if (c.baseDifficulty === 3) w *= 1.8;
                else if (c.baseDifficulty === 1) w *= 0.7;
            }
            // Mid (6-15): no adjustment, all difficulties equally likely
        }

        // ── Question type variety enforcement ──
        if (avoidType && c.questionType === avoidType) {
            w *= 0.3; // Soft penalty, not hard block
        }

        // ── Subject rotation ──
        if (avoidSubject && c.subj === avoidSubject) {
            w *= 0.4;
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
