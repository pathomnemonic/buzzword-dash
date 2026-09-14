/**
 * main.js — Initialization and wiring
 *
 * All features through Final Phase + new additions:
 * - All game callbacks wired (encounters, achievements, continue,
 *   score popup, streak, powerup, skin name, night mode, equipment)
 * - Easter egg global functions (edit/delete/flag cards)
 * - Konami code handled in ui.js
 * - Title tap easter egg handled in ui.js
 * - Daily login reward handled in ui.js
 * - Music auto-start on first interaction
 * - Skin ambient audio started on run start
 * - Touch prevention during gameplay
 * - Retroactive achievement check on load
 *
 * NEW:
 * - Home character preview (Item 3): creates HomeCharacter instance,
 *   wires it to ui.js, starts/stops with home screen
 * - Home character rebuild on equipment change
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
        alert('Card flagged \u2014 thank you for helping improve the game!');
    }
};

// ===== HOME CHARACTER =====

var homeCharacter = null;

function initHomeCharacter() {
    var container = document.getElementById('homeCharacterContainer');
    if (!container) return;

    homeCharacter = new HomeCharacter();
    homeCharacter.init('homeCharacterContainer');

    // Wire to UI so it can start/stop animation on screen changes
    ui.homeCharacter = homeCharacter;

    // Start animation since we begin on the home screen
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

    game.start(mode);
    ui.hideAll();
    ui.showHud();

    // Stop home character during gameplay to save GPU
    if (homeCharacter) homeCharacter.stopAnimation();

    // Start skin-specific ambient audio
    if (game.currentSkin) {
        audio.startAmbient(game.currentSkin.name);
    }

    ui.countdown(function () {
        game.go();
    });
}

// ===== MAIN INITIALIZATION =====

function init() {
    storage.load();
    storage.checkDailyReset();
    game.init();
    ui.init();

    // Initialize home character preview
    initHomeCharacter();

    // ===== WIRE GAME -> UI CALLBACKS =====

    // New encounter: show buzzwords and answer choices
    game.onEncounterStart = function (card, gates) {
        ui.showBuzzwords(card);
        ui.showAnswerChoices(gates);
    };

    // Encounter resolved: show feedback
    game.onEncounterResolve = function (card, wasCorrect) {
        ui.showFeedback(card, wasCorrect);
        if (game.mode === 'study' && wasCorrect) {
            ui.showStudyTeaching(card);
        }
    };

    // Run ended: show post-run review
    game.onRunEnd = function () {
        ui.hideHud();
        ui.hideAnswerChoices();

        // Stop ambient audio
        audio.stopAmbient();

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

    // HUD update every frame
    game.onHudUpdate = function () {
        ui.updateHud(game);
    };

    // Floating score popup + coin burst on correct answer
    game.onScorePopup = function (points) {
        ui.showScorePopup(points);
        ui.showCoinBurst();
    };

    // Streak milestone display
    game.onStreakMilestone = function (streak, multiplier) {
        ui.showStreakMilestone(streak, multiplier);
    };

    // Power-up collected: notification + screen-edge glow
    game.onPowerupCollected = function (type) {
        ui.showPowerupNotification(type);
        ui.showPowerupGlow(type);
    };

    // Achievement unlocked: banner notification
    game.onAchievementUnlocked = function (achievementIds) {
        ui.showAchievementNotification(achievementIds);
    };

    // Continue prompt: show overlay when player dies but can pay
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

    // Skin selected: show track name popup
    game.onSkinSelected = function (skinName) {
        ui.showTrackName(skinName);
    };

    // Equipment changed in shop: rebuild 3D player model + home character
    ui.onEquipChange = function () {
        game.buildPlayer();
        // Also rebuild home character so it reflects new equipment
        if (homeCharacter) {
            homeCharacter.rebuildCharacter();
        }
    };

    // Night mode toggled: update 3D scene
    ui.onNightModeChange = function () {
        game.updateNightMode();
    };

    // ===== BIND MODE-SELECT BUTTONS =====

    document.querySelectorAll('.mode-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var mode = this.dataset.mode;
            startMode(mode);
        });
    });

    // ===== BIND PAUSE / RESUME / END RUN =====

    document.getElementById('pauseBtn').addEventListener('click', function () {
        game.togglePause();
    });
    document.getElementById('resumeBtn').addEventListener('click', function () {
        game.resume();
    });
    document.getElementById('endRunBtn').addEventListener('click', function () {
        audio.stopAmbient();
        game.endRun();
    });

    // ===== MUSIC AUTO-START =====

    if (storage.get('musicOn')) {
        document.addEventListener('click', function startMusicOnce() {
            audio.startMusic();
            document.getElementById('musicToggleBtn').textContent = '\uD83C\uDFB5 Music: ON';
            document.removeEventListener('click', startMusicOnce);
        }, { once: true });
    }

    // ===== PREVENT PULL-TO-REFRESH =====

    document.addEventListener('touchmove', function (e) {
        if (game.running) e.preventDefault();
    }, { passive: false });

    // ===== RETROACTIVE ACHIEVEMENT CHECK =====

    storage.checkAchievements(null);
}

// ===== START =====

window.addEventListener('DOMContentLoaded', init);
