/**
 * main.js — Initialization and wiring
 *
 * FIXED: Button bindings updated to match new index.html structure
 * - .btn-play and .mode-btn instead of .mode-card
 * - Collapsible subject toggle
 * - Persistent bottom nav show/hide during gameplay
 * - Home character fullscreen scene using game renderer
 * - Music auto-start on first interaction (moved toggle to settings)
 * - Onboarding flow for first run
 */

import { game } from './game/engine.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { CARDS } from './cards.js';
import { customCards } from './customcards.js';
import { HomeCharacter } from './game/homecharacter.js';

// ===== GLOBAL FUNCTIONS FOR DYNAMIC HTML ONCLICK =====

window.UI_editCard = function (cardId) {
    ui.openCardEditor(cardId);
};

window.UI_deleteCard = function (cardId) {
    if (confirm('Delete this card? This cannot be undone.')) {
        customCards.remove(cardId);
        ui.renderCustomCardList();
    }
};

window.UI_flagCard = function (cardId) {
    var reason = prompt(
        'Why are you flagging this card?\n\n' +
        'Options:\n' +
        '- incorrect info\n' +
        '- ambiguous\n' +
        '- poor distractor\n' +
        '- outdated\n' +
        '- other'
    );
    if (reason) {
        var flags = storage.get('flags');
        flags.push({ cardId: cardId, reason: reason, date: Date.now() });
        storage.set('flags', flags);
        alert('Card flagged — thank you for helping improve the game!');
    }
};

// ===== HOME CHARACTER =====

var homeCharacter = null;

function initHomeCharacter() {
    homeCharacter = new HomeCharacter();
    homeCharacter.init(game.renderer);
    ui.homeCharacter = homeCharacter;
    homeCharacter.startAnimation();
}

// ===== MODE STARTER =====

function startMode(mode) {
    if (mode === 'daily' && storage.get('dailyDone')) {
        alert('Daily round already completed today! Come back tomorrow.');
        return;
    }
    if (mode === 'weakness') {
        var subjects = storage.get('selectedSubjects');
        var allCards = CARDS.concat(customCards.getAll());
        var weakCards = allCards.filter(function (c) {
            if (subjects.indexOf(c.subj) < 0) return false;
            var s = storage.getCardStat(c.id);
            return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
        });
        if (weakCards.length < 3) {
            alert('Not enough missed cards yet. Play more rounds first!');
            return;
        }
    }

    // Stop home scene, hide nav, start game
    if (homeCharacter) homeCharacter.stopAnimation();
    showBottomNav(false);

    game.start(mode);
    ui.hideAll();
    ui.showHud();

    if (game.currentSkin) {
        audio.startAmbient(game.currentSkin.name);
    }

    ui.countdown(function () {
        game.go();
    });
}

// ===== BOTTOM NAV VISIBILITY =====

function showBottomNav(visible) {
    var nav = document.getElementById('bottomNav');
    if (nav) {
        if (visible) {
            nav.classList.remove('hidden');
        } else {
            nav.classList.add('hidden');
        }
    }
}

// ===== COLLAPSIBLE SECTIONS =====

function setupCollapsibles() {
    var subjectToggle = document.getElementById('subjectToggle');
    var subjectBody = document.getElementById('subjectBody');
    var subjectArrow = document.getElementById('subjectArrow');

    if (subjectToggle && subjectBody) {
        subjectToggle.addEventListener('click', function () {
            var isOpen = subjectBody.style.display !== 'none';
            subjectBody.style.display = isOpen ? 'none' : 'block';
            if (subjectArrow) {
                subjectArrow.classList.toggle('open', !isOpen);
            }
        });
    }
}

// ===== MAIN INITIALIZATION =====

function init() {
    storage.load();
    storage.checkDailyReset();
    game.init();
    ui.init();

    // Initialize home character (uses game's renderer for fullscreen background)
    initHomeCharacter();

    // Setup collapsible sections
    setupCollapsibles();

    // ===== WIRE GAME -> UI CALLBACKS =====

    game.onEncounterStart = function (card, gates) {
        ui.showBuzzwords(card);
        ui.showAnswerChoices(gates);
    };

    game.onEncounterResolve = function (card, wasCorrect) {
        ui.showFeedback(card, wasCorrect);
        if (game.mode === 'study' && wasCorrect) {
            ui.showStudyTeaching(card);
        }
    };

    game.onRunEnd = function () {
        ui.hideHud();
        ui.hideAnswerChoices();
        audio.stopAmbient();

        // Show bottom nav again
        showBottomNav(true);

        // Restart home character background
        if (homeCharacter) homeCharacter.startAnimation();

        ui.showPostRun(game);

        var againBtn = document.getElementById('playAgainBtn');
        if (againBtn) {
            againBtn.addEventListener('click', function () {
                startMode(game.mode);
            });
        }
        var weakBtn = document.getElementById('weaknessBtn');
        if (weakBtn) {
            weakBtn.addEventListener('click', function () {
                startMode('weakness');
            });
        }
    };

    game.onHudUpdate = function () {
        ui.updateHud(game);
    };

    game.onScorePopup = function (points) {
        ui.showScorePopup(points);
        ui.showCoinBurst();
    };

    game.onStreakMilestone = function (streak, multiplier) {
        ui.showStreakMilestone(streak, multiplier);
    };

    game.onPowerupCollected = function (type) {
        ui.showPowerupNotification(type);
        ui.showPowerupGlow(type);
    };

    game.onAchievementUnlocked = function (achievementIds) {
        ui.showAchievementNotification(achievementIds);
    };

    game.onContinuePrompt = function (cost) {
        ui.showContinuePrompt(
            cost,
            function () {
                var success = game.doContinue();
                if (success) {
                    ui.showHud();
                } else {
                    game.endRun();
                }
            },
            function () {
                game.endRun();
            }
        );
    };

    game.onSkinSelected = function (skinName) {
        ui.showTrackName(skinName);
    };

    // Equipment changed: rebuild game player + home character
    ui.onEquipChange = function () {
        game.buildPlayer();
        if (homeCharacter) homeCharacter.rebuildCharacter();
    };

    ui.onNightModeChange = function () {
        game.updateNightMode();
    };

    // ===== BIND PLAY BUTTON (the big green one) =====

    var playBtn = document.querySelector('.btn-play');
    if (playBtn) {
        playBtn.addEventListener('click', function () {
            var mode = this.dataset.mode || 'endless';
            startMode(mode);
        });
    }

    // ===== BIND SECONDARY MODE BUTTONS =====

    document.querySelectorAll('.mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var mode = this.dataset.mode;
            if (mode) startMode(mode);
        });
    });

    // ===== ALSO BIND OLD .mode-card FOR BACKWARD COMPAT =====

    document.querySelectorAll('.mode-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var mode = this.dataset.mode;
            if (mode) startMode(mode);
        });
    });

    // ===== BIND MULTIPLAYER BUTTON =====

    var mpBtn = document.getElementById('multiplayerBtn');
    if (mpBtn) {
        mpBtn.addEventListener('click', function () {
            var overlay = document.getElementById('multiplayerOverlay');
            if (overlay) overlay.classList.add('active');
        });
    }
    var mpCloseBtn = document.getElementById('mpCloseBtn');
    if (mpCloseBtn) {
        mpCloseBtn.addEventListener('click', function () {
            var overlay = document.getElementById('multiplayerOverlay');
            if (overlay) overlay.classList.remove('active');
        });
    }

    // ===== BIND PAUSE / RESUME / END RUN =====

    document.getElementById('pauseBtn').addEventListener('click', function () {
        game.togglePause();
    });
    document.getElementById('resumeBtn').addEventListener('click', function () {
        game.resume();
    });
    document.getElementById('endRunBtn').addEventListener('click', function () {
        audio.stopAmbient();
        showBottomNav(true);
        if (homeCharacter) homeCharacter.startAnimation();
        game.endRun();
    });

    // ===== MUSIC AUTO-START (now on by default) =====

    document.addEventListener('click', function startMusicOnce() {
        if (storage.get('musicOn')) {
            audio.startMusic();
        }
        document.removeEventListener('click', startMusicOnce);
    }, { once: true });

    // ===== PREVENT PULL-TO-REFRESH =====

    document.addEventListener('touchmove', function (e) {
        if (game.running) e.preventDefault();
    }, { passive: false });

    // ===== RETROACTIVE ACHIEVEMENT CHECK =====

    storage.checkAchievements(null);
}

// ===== START =====

window.addEventListener('DOMContentLoaded', init);
