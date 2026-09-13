/**
 * main.js — Initialization and wiring
 *
 * This is the entry point for Buzzword Dash. It:
 *
 * 1. Initializes the Three.js game engine
 * 2. Initializes the UI (renders all screens)
 * 3. Wires callbacks between game <-> UI:
 *    - onEncounterStart: show buzzwords + answer choices
 *    - onEncounterResolve: show feedback + teaching point
 *    - onRunEnd: show post-run review
 *    - onHudUpdate: update HUD every frame
 *    - onScorePopup: floating +points text
 *    - onStreakMilestone: "5x STREAK!" display
 *    - onPowerupCollected: power-up notification
 * 4. Binds mode-select buttons (endless, study, weakness, daily)
 * 5. Binds pause, resume, and end run buttons
 * 6. Provides global functions for dynamic HTML onclick handlers:
 *    - UI_editCard(id): opens card editor for custom card
 *    - UI_deleteCard(id): deletes a custom card with confirm
 *    - UI_flagCard(id): flags a card with reason prompt
 * 7. Handles music auto-start on first user interaction
 * 8. Prevents pull-to-refresh during active gameplay
 *
 * All Phase 1 through 3.5 features are wired here:
 * - Custom cards merged into weakness mode validation
 * - Floating score popups on correct answers
 * - Streak milestone display at 5, 10, 15, etc.
 * - Power-up collection notifications
 * - Card flagging via prompt stored in localStorage
 * - Custom card edit/delete via global window functions
 * - Trail system and flying environment props managed by engine
 * - TTS speed adaptation managed by audio.js
 * - Camera shake managed by engine.js
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
// These are needed because innerHTML-generated buttons cannot use
// module-scoped references directly. The onclick attributes in
// dynamic HTML (e.g., post-run review cards, custom card list)
// call these global functions which then delegate to the UI module.

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
// Mode starter — validates conditions then launches a game mode
// ===================================================================

function startMode(mode) {
  // Validate daily round completion
  if (mode === 'daily' && storage.get('dailyDone')) {
    alert('Daily round already completed today! Come back tomorrow.');
    return;
  }

  // Validate weakness mode has enough weak cards to play
  if (mode === 'weakness') {
    var subjects = storage.get('selectedSubjects');
    // Merge built-in cards with user-created custom cards
    var allCards = CARDS.concat(customCards.getAll());
    var weakCards = allCards.filter(function (c) {
      // Card must be in a selected subject
      if (subjects.indexOf(c.subj) < 0) return false;
      // Card must have been missed or have low accuracy
      var s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weakCards.length < 3) {
      alert('Not enough missed cards yet. Play more rounds first!');
      return;
    }
  }

  // Initialize game state for this mode
  game.start(mode);

  // Hide all UI screens, show the HUD
  ui.hideAll();
  ui.showHud();

  // Countdown 3-2-1-GO then start the run
  ui.countdown(function () {
    game.go();
  });
}

// ===================================================================
// Main initialization — called when DOM is ready
// ===================================================================

function init() {
  // Initialize storage (loads from localStorage or creates defaults)
  storage.load();
  storage.checkDailyReset();

  // Initialize Three.js game engine (creates scene, camera, renderer)
  game.init();

  // Initialize UI (renders all screens, binds navigation)
  ui.init();

  // ===============================================================
  // Wire game -> UI callbacks
  // The game engine calls these at specific moments during gameplay.
  // The UI module updates the DOM in response.
  // ===============================================================

  // When a new encounter starts, show buzzwords and answer choices
  game.onEncounterStart = function (card, gates) {
    ui.showBuzzwords(card);
    ui.showAnswerChoices(gates);
  };

  // When an encounter resolves (player passes through gate),
  // show correct/incorrect feedback
  game.onEncounterResolve = function (card, wasCorrect) {
    ui.showFeedback(card, wasCorrect);
    // In study mode, also show teaching point for correct answers
    if (game.mode === 'study' && wasCorrect) {
      ui.showStudyTeaching(card);
    }
  };

  // When a run ends (lives depleted or daily complete),
  // show the post-run M&M review screen
  game.onRunEnd = function () {
    ui.hideHud();
    ui.hideAnswerChoices();
    ui.showPostRun(game);

    // Bind the post-run action buttons
    // (these are created dynamically by showPostRun)
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

  // HUD update — called every frame by the game engine
  game.onHudUpdate = function () {
    ui.updateHud(game);
  };

  // Floating score popup — called on correct answer
  game.onScorePopup = function (points) {
    ui.showScorePopup(points);
  };

  // Streak milestone — called at 5, 10, 15, etc. correct in a row
  game.onStreakMilestone = function (streak, multiplier) {
    ui.showStreakMilestone(streak, multiplier);
  };

  // Power-up collected — called when player runs through a power-up orb
  game.onPowerupCollected = function (type) {
    ui.showPowerupNotification(type);
  };

  // When equipment changes in shop, rebuild the 3D player model
  // so the new hat/gear/skin/trail appears immediately
  ui.onEquipChange = function () {
    game.buildPlayer();
  };

  // ===============================================================
  // Bind mode-select buttons on the home screen
  // ===============================================================

  document.querySelectorAll('.mode-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var mode = this.dataset.mode;
      startMode(mode);
    });
  });

  // ===============================================================
  // Bind pause / resume / end run buttons
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
  // Browsers require a user gesture to start AudioContext,
  // so we defer music start to the first click event if musicOn
  // was saved as true in the previous session.

  if (storage.get('musicOn')) {
    document.addEventListener('click', function startMusicOnce() {
      audio.startMusic();
      document.getElementById('musicToggleBtn').textContent = '🎵 Music: ON';
      document.removeEventListener('click', startMusicOnce);
    }, { once: true });
  }

  // ===============================================================
  // Prevent pull-to-refresh / bounce scrolling during gameplay
  // ===============================================================
  // On mobile, swiping down during gameplay would trigger the
  // browser's pull-to-refresh gesture. This prevents that.

  document.addEventListener('touchmove', function (e) {
    if (game.running) e.preventDefault();
  }, { passive: false });
}

// ===================================================================
// Start everything when DOM is ready
// ===================================================================

window.addEventListener('DOMContentLoaded', init);
