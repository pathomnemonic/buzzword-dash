/**
 * main.js — Initialization and wiring
 *
 * Entry point that:
 * 1. Initializes Three.js game engine
 * 2. Initializes UI
 * 3. Wires callbacks between game <-> UI
 * 4. Binds mode-select, pause, resume buttons
 * 5. Provides global functions for dynamic HTML onclick handlers
 * 6. Handles music auto-start and touch prevention
 *
 * All Phase 1-3 features wired:
 * - Custom cards in weakness mode validation
 * - Floating score popups on correct
 * - Streak milestone display
 * - Power-up collection notifications
 * - Card flagging via prompt
 * - Custom card edit/delete via global functions
 */

import { game } from './game/engine.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { CARDS } from './cards.js';
import { customCards } from './customcards.js';

// ===== Global functions for onclick handlers in dynamic HTML =====
// These are needed because innerHTML-generated buttons can't use
// module-scoped references directly.

window.UI_editCard = function (cardId) {
  ui.openCardEditor(cardId);
};

window.UI_deleteCard = function (cardId) {
  if (confirm('Delete this card?')) {
    customCards.remove(cardId);
    ui.renderCustomCardList();
  }
};

window.UI_flagCard = function (cardId) {
  var reason = prompt('Why are you flagging this card?\n\nOptions: incorrect info, ambiguous, poor distractor, outdated, other');
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

// ===== Mode starter =====

function startMode(mode) {
  // Validate daily
  if (mode === 'daily' && storage.get('dailyDone')) {
    alert('Daily round already completed today! Come back tomorrow.');
    return;
  }

  // Validate weakness mode
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

  // Start the game
  game.start(mode);
  ui.hideAll();
  ui.showHud();

  // Countdown then go
  ui.countdown(function () {
    game.go();
  });
}

// ===== Main initialization =====

function init() {
  // Initialize storage
  storage.load();
  storage.checkDailyReset();

  // Initialize Three.js game engine
  game.init();

  // Initialize UI (renders all screens)
  ui.init();

  // ===== Wire game -> UI callbacks =====

  // When a new encounter starts, show buzzwords and answer choices
  game.onEncounterStart = function (card, gates) {
    ui.showBuzzwords(card);
    ui.showAnswerChoices(gates);
  };

  // When an encounter resolves, show feedback
  game.onEncounterResolve = function (card, wasCorrect) {
    ui.showFeedback(card, wasCorrect);
    if (game.mode === 'study' && wasCorrect) {
      ui.showStudyTeaching(card);
    }
  };

  // When a run ends, show post-run review
  game.onRunEnd = function () {
    ui.hideHud();
    ui.hideAnswerChoices();
    ui.showPostRun(game);

    // Bind post-run action buttons
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

  // Floating score popup on correct answer
  game.onScorePopup = function (points) {
    ui.showScorePopup(points);
  };

  // Streak milestone display
  game.onStreakMilestone = function (streak, multiplier) {
    ui.showStreakMilestone(streak, multiplier);
  };

  // Power-up collection notification
  game.onPowerupCollected = function (type) {
    ui.showPowerupNotification(type);
  };

  // When equipment changes in shop, rebuild 3D player model
  ui.onEquipChange = function () {
    game.buildPlayer();
  };

  // ===== Bind mode-select buttons =====
  document.querySelectorAll('.mode-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var mode = this.dataset.mode;
      startMode(mode);
    });
  });

  // ===== Bind pause / resume / end run =====
  document.getElementById('pauseBtn').addEventListener('click', function () {
    game.togglePause();
  });
  document.getElementById('resumeBtn').addEventListener('click', function () {
    game.resume();
  });
  document.getElementById('endRunBtn').addEventListener('click', function () {
    game.endRun();
  });

  // ===== Music auto-start if it was on last session =====
  // Browsers require user gesture to start AudioContext
  if (storage.get('musicOn')) {
    document.addEventListener('click', function startMusicOnce() {
      audio.startMusic();
      document.getElementById('musicToggleBtn').textContent = '🎵 Music: ON';
      document.removeEventListener('click', startMusicOnce);
    }, { once: true });
  }

  // Prevent pull-to-refresh / bounce scrolling during gameplay
  document.addEventListener('touchmove', function (e) {
    if (game.running) e.preventDefault();
  }, { passive: false });
}

// ===== Start everything when DOM is ready =====
window.addEventListener('DOMContentLoaded', init);
