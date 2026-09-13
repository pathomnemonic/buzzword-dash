/**
 * main.js — Initialization and wiring
 *
 * All Phase 1 through 3.5 features wired:
 * - Custom cards in weakness validation
 * - Floating score popups + coin burst particles on correct
 * - Streak milestone display
 * - Power-up collection notifications + screen-edge glow
 * - Card flagging via prompt
 * - Custom card edit/delete via global functions
 * - Trail system and flying props managed by engine
 * - TTS speed adaptation managed by audio.js
 * - Camera shake and speed lines managed by engine.js
 */

import { game } from './game/engine.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { CARDS } from './cards.js';
import { customCards } from './customcards.js';

// ===================================================================
// Global functions for onclick handlers in dynamically generated HTML
// ===================================================================

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
    flags.push({
      cardId: cardId,
      reason: reason,
      date: Date.now()
    });
    storage.set('flags', flags);
    alert('Card flagged — thank you for helping improve the game!');
  }
};

// ===================================================================
// Mode starter
// ===================================================================

function startMode(mode) {
  // Validate daily round completion
  if (mode === 'daily' && storage.get('dailyDone')) {
    alert('Daily round already completed today! Come back tomorrow.');
    return;
  }

  // Validate weakness mode has enough weak cards
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

  // Initialize and start
  game.start(mode);
  ui.hideAll();
  ui.showHud();
  ui.countdown(function () {
    game.go();
  });
}

// ===================================================================
// Main initialization
// ===================================================================

function init() {
  // Initialize storage
  storage.load();
  storage.checkDailyReset();

  // Initialize Three.js game engine
  game.init();

  // Initialize UI
  ui.init();

  // ===============================================================
  // Wire game -> UI callbacks
  // ===============================================================

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

  // Streak milestone display at 5, 10, 15, etc.
  game.onStreakMilestone = function (streak, multiplier) {
    ui.showStreakMilestone(streak, multiplier);
  };

  // Power-up collected: notification + screen-edge glow
  game.onPowerupCollected = function (type) {
    ui.showPowerupNotification(type);
    ui.showPowerupGlow(type);
  };

  // Equipment changed in shop: rebuild 3D player model
  ui.onEquipChange = function () {
    game.buildPlayer();
  };

  // ===============================================================
  // Bind mode-select buttons
  // ===============================================================

  document.querySelectorAll('.mode-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var mode = this.dataset.mode;
      startMode(mode);
    });
  });

  // ===============================================================
  // Bind pause / resume / end run
  // ===============================================================

  document.getElementById('pauseBtn').addEventListener('click', function () {
    game.togglePause();
  });

  document.getElementById('resumeBtn').addEventListener('click', function () {
    game.resume();
  });

  document.getElementById('endRunBtn').addEventListener('click', function () {
    game.endRun();
  });

  // ===============================================================
  // Music auto-start if it was on last session
  // ===============================================================

  if (storage.get('musicOn')) {
    document.addEventListener('click', function startMusicOnce() {
      audio.startMusic();
      document.getElementById('musicToggleBtn').textContent = '🎵 Music: ON';
      document.removeEventListener('click', startMusicOnce);
    }, { once: true });
  }

  // ===============================================================
  // Prevent pull-to-refresh during gameplay
  // ===============================================================

  document.addEventListener('touchmove', function (e) {
    if (game.running) e.preventDefault();
  }, { passive: false });
}

// ===================================================================
// Start everything when DOM is ready
// ===================================================================

window.addEventListener('DOMContentLoaded', init);
