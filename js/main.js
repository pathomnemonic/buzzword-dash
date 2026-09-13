/**
 * main.js — Initialization and wiring
 *
 * All features through Final Phase:
 *
 * CALLBACKS WIRED:
 * - onEncounterStart: show buzzwords + answer choices
 * - onEncounterResolve: show feedback + teaching point
 * - onRunEnd: show post-run review + check achievements
 * - onHudUpdate: update HUD every frame
 * - onScorePopup: floating +points text + coin burst
 * - onStreakMilestone: "5× STREAK!" display
 * - onPowerupCollected: notification + screen-edge glow
 * - onAchievementUnlocked: achievement banner notifications
 * - onContinuePrompt: show continue-with-coins overlay
 * - onNightModeChange: update 3D scene when night mode toggled
 * - onEquipChange: rebuild 3D player when equipment changes
 *
 * GLOBAL FUNCTIONS:
 * - UI_editCard(id): opens card editor for custom card
 * - UI_deleteCard(id): deletes custom card with confirm
 * - UI_flagCard(id): flags card with reason prompt
 *
 * VALIDATION:
 * - Daily mode: checks if already completed today
 * - Weakness mode: checks if enough weak cards exist
 * - Both check built-in AND custom cards
 *
 * MUSIC:
 * - Auto-starts on first user interaction if was on last session
 * - Browsers require user gesture for AudioContext
 *
 * TOUCH:
 * - Prevents pull-to-refresh during gameplay
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
// dynamic HTML call these global functions which delegate to UI.

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
  // ===============================================================

  // When a new encounter starts, show buzzwords and answer choices
  game.onEncounterStart = function (card, gates) {
    ui.showBuzzwords(card);
    ui.showAnswerChoices(gates);
  };

  // When an encounter resolves, show correct/incorrect feedback
  game.onEncounterResolve = function (card, wasCorrect) {
    ui.showFeedback(card, wasCorrect);
    // In study mode, also show teaching point for correct answers
    if (game.mode === 'study' && wasCorrect) {
      ui.showStudyTeaching(card);
    }
  };

  // When a run ends, show the post-run M&M review screen
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

  // Achievement unlocked: banner notification with fanfare
  game.onAchievementUnlocked = function (achievementIds) {
    ui.showAchievementNotification(achievementIds);
  };

  // Continue prompt: show overlay when player dies but can pay to continue
  game.onContinuePrompt = function (cost) {
    ui.showContinuePrompt(
      cost,
      // On continue: spend coins, resume game
      function () {
        var success = game.doContinue();
        if (success) {
          ui.showHud();
        } else {
          // Shouldn't happen since we checked coins, but handle gracefully
          game.endRun();
        }
      },
      // On decline: end the run
      function () {
        game.endRun();
      }
    );
  };

  // When equipment changes in shop, rebuild the 3D player model
  // so the new hat/gear/skin/trail appears immediately
  ui.onEquipChange = function () {
    game.buildPlayer();
  };

  // When night mode is toggled in settings, update the 3D scene
  ui.onNightModeChange = function () {
    game.updateNightMode();
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
  // On mobile, swiping down during gameplay triggers the browser's
  // pull-to-refresh gesture. This prevents that while game is active.

  document.addEventListener('touchmove', function (e) {
    if (game.running) e.preventDefault();
  }, { passive: false });

  // ===============================================================
  // Check for achievements that may have been earned before
  // this code was added (retroactive check on load)
  // ===============================================================

  var retroAchievements = storage.checkAchievements(null);
  // Don't show notifications for retroactive unlocks — they'll see
  // them in the achievements screen naturally
}

// ===================================================================
// Start everything when DOM is ready
// ===================================================================

window.addEventListener('DOMContentLoaded', init);
