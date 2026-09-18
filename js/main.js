/**
 * main.js — Initialization and wiring
 */

import { game } from './game/engine.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { CARDS } from './cards.js';

function startMode(mode) {
  if (mode === 'daily' && storage.get('dailyDone')) {
    alert('Daily round already completed today!');
    return;
  }
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
  game.start(mode);
  ui.hideAll();
  ui.showHud();

  game.beginCountdown();
  ui.countdown(function () {
    game.go(); });
}

function init() {
  storage.load();
  storage.checkDailyReset();
  game.init();
  ui.init();

  game.onEncounterStart = function (card, gates) {
    ui.showBuzzwords(card);
    ui.showAnswerChoices(gates);
  };
  game.onEncounterResolve = function (card, wasCorrect) {
    ui.showFeedback(card, wasCorrect);
    if (game.mode === 'study' && wasCorrect) ui.showStudyTeaching(card);
  };
  game.onRunEnd = function () {
    ui.hideHud();
    ui.hideAnswerChoices();
    ui.showPostRun(game);
    var againBtn = document.getElementById('playAgainBtn');
    if (againBtn) againBtn.addEventListener('click', function () { startMode(game.mode); });
    var weakBtn = document.getElementById('weaknessBtn');
    if (weakBtn) weakBtn.addEventListener('click', function () { startMode('weakness'); });
  };
  game.onHudUpdate = function () { ui.updateHud(game); };
  ui.onEquipChange = function () { game.buildPlayer(); };

  document.querySelectorAll('.mode-card').forEach(function (card) {
    card.addEventListener('click', function () { startMode(this.dataset.mode); });
  });
  document.getElementById('pauseBtn').addEventListener('click', function () { game.togglePause(); });
  document.getElementById('resumeBtn').addEventListener('click', function () { game.resume(); });
  document.getElementById('endRunBtn').addEventListener('click', function () { game.endRun(); });

  if (storage.get('musicOn')) {
    document.addEventListener('click', function startMusicOnce() {
      audio.startMusic();
      document.getElementById('musicToggleBtn').textContent = '🎵 Music: ON';
      document.removeEventListener('click', startMusicOnce);
    }, { once: true });
  }
  document.addEventListener('touchmove', function (e) {
    if (game.running) e.preventDefault();
  }, { passive: false });
}

window.addEventListener('DOMContentLoaded', init);
