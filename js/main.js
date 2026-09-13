/**
 * main.js — Initialization and wiring
 *
 * Entry point that:
 * 1. Initializes the game engine (Three.js)
 * 2. Initializes the UI
 * 3. Wires callbacks between game ↔ UI
 * 4. Binds mode-select buttons and pause/resume
 */

import { game } from './game.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { CARDS } from './cards.js';

function startMode(mode) {
  // Validate daily
  if (mode === 'daily' && storage.get('dailyDone')) {
    alert('Daily round already completed today! Come back tomorrow.');
    return;
  }

  // Validate weakness mode has enough weak cards
  if (mode === 'weakness') {
    const subjects = storage.get('selectedSubjects');
    const weakCards = CARDS.filter(c => {
      if (!subjects.includes(c.subj)) return false;
      const s = storage.getCardStat(c.id);
      return s.wrong > 0 || (s.seen > 0 && s.correct / s.seen < 0.7);
    });
    if (weakCards.length < 3) {
      alert('Not enough missed cards yet. Play more rounds first!');
      return;
    }
  }

  // Initialize game state for this mode
  game.start(mode);

  // Hide all UI screens, show HUD
  ui.hideAll();
  ui.showHud();

  // Countdown then start the run
  ui.countdown(function () {
    game.go();
  });
}

function init() {
  // Initialize storage
  storage.load();
  storage.checkDailyReset();

  // Initialize Three.js game engine
  game.init();

  // Initialize UI (renders all screens)
  ui.init();

  // ===== Wire game → UI callbacks =====

  game.onEncounterStart = function (card) {
    ui.showBuzzwords(card);
  };

  game.onEncounterResolve = function (card, wasCorrect) {
    ui.showFeedback(card, wasCorrect);
    if (game.mode === 'study' && wasCorrect) {
      ui.showStudyTeaching(card);
    }
  };

  game.onRunEnd = function () {
    ui.hideHud();
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

  game.onHudUpdate = function () {
    ui.updateHud(game);
  };

  // When cosmetics change in shop, rebuild the 3D player model
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
  // Browsers require user gesture to start AudioContext,
  // so we start on first click if musicOn was saved
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