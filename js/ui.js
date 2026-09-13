/**
 * ui.js — All screen rendering, HUD updates, shop, quests,
 * settings, post-run review, tutorial, custom cards, and card flagging.
 *
 * ZERO Three.js code — only touches the DOM.
 *
 * Phase 2+3 features included:
 * - Custom card create/edit/delete with validation
 * - Card import/export as JSON
 * - Card flagging in post-run review
 * - Floating score popup text
 * - Streak milestone display
 * - Power-up collection notification
 * - Subject select all / deselect all / long-press for "only this"
 * - Tutorial rewritten for end users with close button
 * - Hidden scrollbars on desktop
 *
 * The SpeechSynthesisUtterance rate property accepts values from
 * 0.1 (lowest) to 10 (highest), with 1 being the default [4].
 * This is a Baseline Widely Available feature since September 2018 [4] [6].
 *
 * localStorage provides at least 5MB per origin, sufficient for
 * thousands of custom cards stored as JSON strings [7].
 */

import { SUBJECTS, CARDS } from './cards.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { customCards } from './customcards.js';
import { SHOP_ITEMS, QUESTS } from './game/engine.js';

class UI {
  constructor() {
    this.tutorialPage = 0;
    this.tutorialPages = [
      { icon: '⚡', title: 'Welcome!', text: 'Buzzword Dash is a fast-paced game that helps you master medical board concepts. See diagnostic buzzwords and run through the correct diagnosis gate!' },
      { icon: '👆', title: 'Move Between Lanes', text: 'Swipe left or right to switch lanes. Each lane has a different diagnosis — pick the one that matches the buzzwords at the top.' },
      { icon: '⬆️', title: 'Jump Over Obstacles', text: 'Swipe up to jump over gurneys and other obstacles on the ground.' },
      { icon: '⬇️', title: 'Slide Under Obstacles', text: 'Swipe down to slide under IV poles and overhead barriers.' },
      { icon: '👆👆', title: 'Rush for Bonus Points', text: 'Know the answer? Double-tap the screen (or press Shift on keyboard) to rush through the gate and earn bonus points!' },
      { icon: '🏎️', title: 'Speed = Points', text: 'Use the speed dial on the home screen to increase game speed. Faster speeds earn more points per correct answer.' },
      { icon: '🔥', title: 'Build Your Streak', text: 'Correct answers build your streak. Every 5 correct increases your score multiplier up to 8×!' },
      { icon: '❤️', title: 'Lives', text: 'You start with 3 lives. Wrong answers and hitting obstacles cost a life. Study Mode has unlimited lives.' },
      { icon: '🪙', title: 'Collect Coins & Power-ups', text: 'Grab coins as you run! Collect glowing orbs for power-ups: Shield, Slow-Mo, 2× Score, and Coin Magnet. Spend coins in the On-Call Locker.' },
    ];
  }

  init() {
    storage.load();
    storage.checkDailyReset();
    this.renderHome();
    this.renderSubjects();
    this.renderSettings();
    this.renderStats();
    this.renderShop();
    this.renderQuests();
    this.setupSpeedDial();
    this.bindNavigation();
    this.bindMusicToggle();
    this.bindSubjectControls();
    this.bindCustomCards();
  }

  // ===== NAVIGATION =====
  show(screenId) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    document.getElementById(screenId).classList.add('active');
    if (screenId === 'screenHome') this.renderHome();
    if (screenId === 'screenStats') this.renderStats();
    if (screenId === 'screenShop') this.renderShop();
    if (screenId === 'screenQuests') this.renderQuests();
    if (screenId === 'screenSettings') this.renderSettings();
    if (screenId === 'screenMyCards') this.renderCustomCardList();
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.screen === screenId);
    });
  }

  hideAll() {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  }

  bindNavigation() {
    var self = this;
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () { self.show(item.dataset.screen); });
    });
    document.querySelectorAll('.back-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { self.show('screenHome'); });
    });
    document.getElementById('settingsBtn').addEventListener('click', function () { self.show('screenSettings'); });
    document.getElementById('shopBtn').addEventListener('click', function () { self.show('screenShop'); });
    document.getElementById('questBtn').addEventListener('click', function () { self.show('screenQuests'); });
    document.getElementById('myCardsBtn').addEventListener('click', function () {
      self.show('screenMyCards');
      self.renderCustomCardList();
    });
    document.getElementById('tutorialBtn').addEventListener('click', function () { self.showTutorial(); });
    document.getElementById('tutNextBtn').addEventListener('click', function () { self.tutorialNext(); });
    document.getElementById('tutCloseBtn').addEventListener('click', function () {
      document.getElementById('tutorialOverlay').classList.remove('active');
    });
  }

  bindMusicToggle() {
    var btn = document.getElementById('musicToggleBtn');
    btn.addEventListener('click', function () {
      var playing = audio.toggleMusic();
      btn.textContent = playing ? '🎵 Music: ON' : '🎵 Music: OFF';
    });
    if (storage.get('musicOn')) btn.textContent = '🎵 Music: ON';
  }

  // ===== SUBJECT CONTROLS =====
  bindSubjectControls() {
    var self = this;
    document.getElementById('selectAllSubjects').addEventListener('click', function () {
      storage.set('selectedSubjects', SUBJECTS.slice());
      self.renderSubjects();
    });
    document.getElementById('deselectAllSubjects').addEventListener('click', function () {
      var current = storage.get('selectedSubjects');
      storage.set('selectedSubjects', current.length > 0 ? [current[0]] : [SUBJECTS[0]]);
      self.renderSubjects();
    });
  }

  // ===== SPEED DIAL =====
  setupSpeedDial() {
    var dial = document.getElementById('speedDial');
    var val = document.getElementById('speedValue');
    var current = storage.get('userSpeed') || 1;
    dial.value = current;
    val.textContent = current + '×';
    dial.addEventListener('input', function () {
      var v = parseFloat(dial.value);
      storage.set('userSpeed', v);
      val.textContent = v + '×';
    });
  }

  // ===== HOME SCREEN =====
  renderHome() {
    var tc = storage.get('totalCorrect');
    var tw = storage.get('totalWrong');
    var acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;
    var totalCards = CARDS.length + customCards.count();
    document.getElementById('homeStats').innerHTML =
      '<div class="stat-pill"><div class="val">' + storage.get('coins') + '</div><div class="label">Coins</div></div>' +
      '<div class="stat-pill"><div class="val">' + storage.get('bestScore') + '</div><div class="label">Best</div></div>' +
      '<div class="stat-pill"><div class="val">' + acc + '%</div><div class="label">Accuracy</div></div>' +
      '<div class="stat-pill"><div class="val">' + storage.get('dailyStreak') + '</div><div class="label">Daily</div></div>' +
      '<div class="stat-pill"><div class="val">' + totalCards + '</div><div class="label">Cards</div></div>';
  }

  // ===== SUBJECTS =====
  renderSubjects() {
    var selected = storage.get('selectedSubjects');
    var container = document.getElementById('subjectScroll');
    var self = this;
    container.innerHTML = SUBJECTS.map(function (s) {
      var sel = selected.indexOf(s) >= 0 ? 'selected' : '';
      return '<div class="subject-chip ' + sel + '" data-subject="' + s + '">' + s + '</div>';
    }).join('');

    var longPressTimer = null;

    container.querySelectorAll('.subject-chip').forEach(function (chip) {
      var subj = chip.dataset.subject;

      chip.addEventListener('click', function () {
        if (longPressTimer === 'fired') { longPressTimer = null; return; }
        var sel = storage.get('selectedSubjects');
        var idx = sel.indexOf(subj);
        if (idx >= 0) {
          if (sel.length <= 1) return;
          sel.splice(idx, 1);
        } else {
          sel.push(subj);
        }
        storage.set('selectedSubjects', sel);
        chip.classList.toggle('selected');
      });

      chip.addEventListener('pointerdown', function () {
        longPressTimer = setTimeout(function () {
          storage.set('selectedSubjects', [subj]);
          longPressTimer = 'fired';
          self.renderSubjects();
        }, 500);
      });
      chip.addEventListener('pointerup', function () {
        if (longPressTimer !== 'fired') clearTimeout(longPressTimer);
      });
      chip.addEventListener('pointerleave', function () {
        if (longPressTimer !== 'fired') clearTimeout(longPressTimer);
      });
    });
  }

  // ===== STATS =====
  renderStats() {
    var tc = storage.get('totalCorrect');
    var tw = storage.get('totalWrong');
    var te = storage.get('totalEncounters');
    var acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;

    var subjectHTML = '';
    SUBJECTS.forEach(function (s) {
      var ss = storage.getSubjectStat(s);
      var total = ss.correct + ss.wrong;
      if (total === 0) return;
      var a = Math.round(ss.correct / total * 100);
      var color = a >= 70 ? 'var(--accent-green)' : 'var(--accent-red)';
      subjectHTML += '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.03)"><span style="font-size:12px">' + s + '</span><span style="font-size:12px;font-weight:700;color:' + color + '">' + a + '% (' + total + ')</span></div>';
    });

    var allCards = CARDS.concat(customCards.getAll());
    var weakCards = allCards.map(function (c) {
      var s = storage.getCardStat(c.id);
      if (s.seen < 2) return null;
      return { card: c, accuracy: s.correct / s.seen, seen: s.seen };
    }).filter(function (x) { return x !== null; }).sort(function (a, b) { return a.accuracy - b.accuracy; }).slice(0, 5);

    var weakHTML = weakCards.length > 0
      ? weakCards.map(function (w) {
        return '<div style="padding:3px 0;font-size:11px"><span style="color:var(--accent-red);font-weight:700">' + Math.round(w.accuracy * 100) + '%</span> — ' + w.card.ans + ' <span style="color:var(--text-muted)">(' + w.card.subj + ')</span></div>';
      }).join('')
      : '<p style="font-size:11px;color:var(--text-muted)">Play more to see weak areas.</p>';

    document.getElementById('statsContent').innerHTML =
      '<div class="post-stats"><div class="post-stat"><div class="val">' + te + '</div><div class="label">Cards</div></div><div class="post-stat"><div class="val" style="color:var(--accent-green)">' + tc + '</div><div class="label">Correct</div></div><div class="post-stat"><div class="val" style="color:var(--accent-red)">' + tw + '</div><div class="label">Wrong</div></div></div>' +
      '<div class="post-stats" style="grid-template-columns:1fr 1fr"><div class="post-stat"><div class="val">' + acc + '%</div><div class="label">Accuracy</div></div><div class="post-stat"><div class="val">' + storage.get('bestScore') + '</div><div class="label">Best Score</div></div></div>' +
      '<h3 style="margin:14px 0 6px;font-size:14px">📊 By Subject</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + (subjectHTML || '<p style="font-size:11px;color:var(--text-muted)">No data yet.</p>') + '</div>' +
      '<h3 style="margin:14px 0 6px;font-size:14px">🎯 Weakest Concepts</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + weakHTML + '</div>';
  }

  // ===== SHOP =====
  renderShop() {
    var self = this;
    document.getElementById('shopCoins').textContent = storage.get('coins');
    var renderGroup = function (type, title) {
      var items = SHOP_ITEMS.filter(function (i) { return i.type === type; });
      var equipped = storage.get('equipped');
      return '<h3 style="margin:12px 0 6px;font-size:14px;color:var(--text-secondary)">' + title + '</h3>' +
        items.map(function (item) {
          var owned = storage.ownsItem(item.id);
          var isEquipped = equipped[type] === item.id;
          var btnHTML;
          if (isEquipped) btnHTML = '<span style="color:var(--accent-cyan);font-size:11px;font-weight:700">EQUIPPED</span>';
          else if (owned) btnHTML = '<button class="btn btn-outline btn-sm" data-equip="' + item.id + '" data-slot="' + type + '">Equip</button>';
          else btnHTML = '<button class="btn btn-gold btn-sm" data-buy="' + item.id + '" data-price="' + item.price + '">🪙 ' + item.price + '</button>';
          var colorHex = item.color ? '#' + item.color.toString(16).padStart(6, '0') : '#333';
          return '<div class="shop-item ' + (isEquipped ? 'equipped' : '') + '"><div style="width:36px;height:36px;border-radius:8px;background:' + colorHex + ';flex-shrink:0"></div><div style="flex:1"><div style="font-size:13px;font-weight:700">' + item.name + '</div></div>' + btnHTML + '</div>';
        }).join('');
    };
    document.getElementById('shopItems').innerHTML =
      renderGroup('skin', '👕 Outfits') + renderGroup('hat', '🧢 Headwear') + renderGroup('gear', '🩺 Gear');

    document.querySelectorAll('[data-buy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (storage.buyItem(btn.dataset.buy, parseInt(btn.dataset.price))) {
          audio.play('coin');
          self.renderShop();
        } else { alert('Not enough coins!'); }
      });
    });
    document.querySelectorAll('[data-equip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        storage.equipItem(btn.dataset.equip, btn.dataset.slot);
        self.renderShop();
        if (self.onEquipChange) self.onEquipChange();
      });
    });
  }

  onEquipChange = null;

  // ===== QUESTS =====
  renderQuests() {
    document.getElementById('questList').innerHTML = QUESTS.map(function (q) {
      var progress = Math.min(storage.getQuestProgress(q.id), q.target);
      var pct = Math.round(progress / q.target * 100);
      return '<div class="quest-item"><div class="quest-title">' + q.title + ': ' + q.desc + '</div><div class="quest-bar"><div class="quest-fill" style="width:' + pct + '%"></div></div><div class="quest-reward">' + progress + '/' + q.target + ' — 🪙 ' + q.reward + '</div></div>';
    }).join('');
  }

  // ===== SETTINGS =====
  renderSettings() {
    var self = this;
    document.getElementById('settingsContent').innerHTML =
      '<div class="setting-row"><div style="font-size:13px">🌙 Night Shift</div><div class="toggle ' + (storage.get('nightMode') ? 'on' : '') + '" data-setting="nightMode"></div></div>' +
      '<div class="setting-row"><div style="font-size:13px">🗣 Text-to-Speech</div><div class="toggle ' + (storage.get('ttsEnabled') ? 'on' : '') + '" data-setting="ttsEnabled"></div></div>' +
      '<div class="setting-row"><div style="font-size:13px">🔊 Master Volume</div><input type="range" min="0" max="1" step="0.1" value="' + storage.get('masterVolume') + '" data-range="masterVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>' +
      '<div class="setting-row"><div style="font-size:13px">🎵 SFX Volume</div><input type="range" min="0" max="1" step="0.1" value="' + storage.get('sfxVolume') + '" data-range="sfxVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>' +
      '<div style="margin-top:20px"><button class="btn btn-red btn-block" id="resetBtn">🗑 Reset All Progress</button></div>';

    document.querySelectorAll('[data-setting]').forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var key = toggle.dataset.setting;
        storage.set(key, !storage.get(key));
        toggle.classList.toggle('on');
        self.applySettings();
      });
    });
    document.querySelectorAll('[data-range]').forEach(function (range) {
      range.addEventListener('input', function () {
        storage.set(range.dataset.range, parseFloat(range.value));
        audio.updateMusicVolume();
      });
    });
    document.getElementById('resetBtn').addEventListener('click', function () {
      if (confirm('Reset ALL progress? This cannot be undone.')) {
        storage.reset();
        self.init();
        alert('Progress reset!');
      }
    });
    this.applySettings();
  }

  applySettings() {
    document.body.classList.toggle('night-mode', storage.get('nightMode'));
  }

  // ===== CUSTOM CARDS =====
  bindCustomCards() {
    var self = this;
    document.getElementById('addCardBtn').addEventListener('click', function () { self.openCardEditor(null); });
    document.getElementById('saveCardBtn').addEventListener('click', function () { self.saveCard(); });
    document.getElementById('cancelCardBtn').addEventListener('click', function () {
      self.show('screenMyCards');
      self.renderCustomCardList();
    });
    document.getElementById('exportCardsBtn').addEventListener('click', function () { self.showExport(); });
    document.getElementById('importCardsBtn').addEventListener('click', function () { self.showImport(); });

    var select = document.getElementById('cardSubject');
    select.innerHTML = SUBJECTS.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
  }

  renderCustomCardList() {
    var cards = customCards.getAll();
    var container = document.getElementById('customCardList');
    if (cards.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No custom cards yet. Tap "Create New Card" to add your own!</div>';
      return;
    }
    container.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">' + cards.length + ' custom card' + (cards.length === 1 ? '' : 's') + '</p>' +
      cards.map(function (card) {
        return '<div class="review-card" style="border-left-color:var(--accent-blue)"><h4>' + card.bw.join(' • ') + '</h4><div><span class="tag tag-correct">' + card.ans + '</span><span class="tag tag-subject">' + card.subj + '</span></div><p style="margin-top:4px">' + card.tp + '</p><div style="display:flex;gap:6px;margin-top:6px"><button class="btn btn-outline btn-sm" onclick="UI_editCard(\'' + card.id + '\')">✏️ Edit</button><button class="btn btn-outline btn-sm" style="border-color:rgba(255,82,82,0.5);color:var(--accent-red)" onclick="UI_deleteCard(\'' + card.id + '\')">🗑️ Delete</button></div></div>';
      }).join('');
  }

  openCardEditor(cardId) {
    var isEdit = !!cardId;
    document.getElementById('cardEditorTitle').textContent = isEdit ? '✏️ Edit Card' : '📝 Create Card';
    document.getElementById('cardEditId').value = cardId || '';
    document.getElementById('cardErrors').textContent = '';
    if (isEdit) {
      var cards = customCards.getAll();
      var card = null;
      for (var i = 0; i < cards.length; i++) { if (cards[i].id === cardId) { card = cards[i]; break; } }
      if (card) {
        document.getElementById('cardSubject').value = card.subj;
        document.getElementById('cardBuzzwords').value = card.bw.join('\n');
        document.getElementById('cardAnswer').value = card.ans;
        document.getElementById('cardDistractor1').value = card.d[0] || '';
        document.getElementById('cardDistractor2').value = card.d[1] || '';
        document.getElementById('cardWhy1').value = (card.ww && card.ww[card.d[0]]) || '';
        document.getElementById('cardWhy2').value = (card.ww && card.ww[card.d[1]]) || '';
        document.getElementById('cardTeaching').value = card.tp;
      }
    } else {
      document.getElementById('cardBuzzwords').value = '';
      document.getElementById('cardAnswer').value = '';
      document.getElementById('cardDistractor1').value = '';
      document.getElementById('cardDistractor2').value = '';
      document.getElementById('cardWhy1').value = '';
      document.getElementById('cardWhy2').value = '';
      document.getElementById('cardTeaching').value = '';
    }
    this.show('screenCardEditor');
  }

  saveCard() {
    var buzzwords = document.getElementById('cardBuzzwords').value.split('\n').map(function (b) { return b.trim(); }).filter(function (b) { return b.length > 0; });
    var cardData = {
      subject: document.getElementById('cardSubject').value,
      buzzwords: buzzwords,
      answer: document.getElementById('cardAnswer').value.trim(),
      distractors: [document.getElementById('cardDistractor1').value.trim(), document.getElementById('cardDistractor2').value.trim()],
      teachingPoint: document.getElementById('cardTeaching').value.trim(),
      whyWrong1: document.getElementById('cardWhy1').value.trim(),
      whyWrong2: document.getElementById('cardWhy2').value.trim()
    };
    var errors = customCards.validate(cardData);
    if (errors.length > 0) {
      document.getElementById('cardErrors').innerHTML = errors.join('<br>');
      return;
    }
    var editId = document.getElementById('cardEditId').value;
    if (editId) customCards.update(editId, cardData);
    else customCards.add(cardData);
    this.show('screenMyCards');
    this.renderCustomCardList();
  }

  showExport() {
    document.getElementById('importExportTitle').textContent = '📤 Export Cards';
    document.getElementById('importExportArea').value = customCards.exportJSON();
    document.getElementById('importExportArea').readOnly = true;
    document.getElementById('importExportMsg').textContent = 'Copy this JSON to share your cards.';
    document.getElementById('importExportAction').textContent = '📋 Copy to Clipboard';
    document.getElementById('importExportAction').onclick = function () {
      document.getElementById('importExportArea').select();
      document.execCommand('copy');
      document.getElementById('importExportMsg').textContent = '✅ Copied!';
    };
    this.show('screenImportExport');
  }

  showImport() {
    document.getElementById('importExportTitle').textContent = '📥 Import Cards';
    document.getElementById('importExportArea').value = '';
    document.getElementById('importExportArea').readOnly = false;
    document.getElementById('importExportMsg').textContent = 'Paste JSON from someone who shared their cards.';
    document.getElementById('importExportAction').textContent = '📥 Import';
    document.getElementById('importExportAction').onclick = function () {
      var result = customCards.importJSON(document.getElementById('importExportArea').value);
      document.getElementById('importExportMsg').innerHTML = result.success
        ? '<span style="color:var(--accent-green)">' + result.message + '</span>'
        : '<span style="color:var(--accent-red)">' + result.message + '</span>';
    };
    this.show('screenImportExport');
  }

  // ===== TUTORIAL =====
  showTutorial() {
    this.tutorialPage = 0;
    this.renderTutorialPage();
    document.getElementById('tutorialOverlay').classList.add('active');
  }

  renderTutorialPage() {
    var p = this.tutorialPages[this.tutorialPage];
    document.getElementById('tutPage').innerHTML = '<div class="tut-icon">' + p.icon + '</div><h2>' + p.title + '</h2><p>' + p.text + '</p>';
    var self = this;
    document.getElementById('tutDots').innerHTML = this.tutorialPages.map(function (_, i) {
      return '<div class="tut-dot ' + (i === self.tutorialPage ? 'active' : '') + '"></div>';
    }).join('');
    document.getElementById('tutNextBtn').textContent = this.tutorialPage === this.tutorialPages.length - 1 ? 'Start Playing! ✓' : 'Next →';
  }

  tutorialNext() {
    this.tutorialPage++;
    if (this.tutorialPage >= this.tutorialPages.length) {
      document.getElementById('tutorialOverlay').classList.remove('active');
    } else {
      this.renderTutorialPage();
    }
  }

  // ===== HUD =====
  showHud() { document.getElementById('hud').classList.remove('off'); }
  hideHud() { document.getElementById('hud').classList.add('off'); }

  updateHud(game) {
    document.getElementById('hudCoins').textContent = game.coins;
    document.getElementById('hudScore').textContent = game.score;
    document.getElementById('hudStreak').textContent = game.streak;
    document.getElementById('hudMulti').textContent = game.multiplier;
    document.getElementById('hudLives').textContent = game.mode === 'study' ? '∞' : game.lives;

    if (game.feedbackTimer <= 0) document.getElementById('feedbackEl').classList.remove('show');
    if (game.teachTimer <= 0) document.getElementById('teachEl').classList.remove('show');

    // Answer choice highlighting
    for (var i = 0; i < 3; i++) {
      document.getElementById('ans' + i).classList.toggle('active', i === game.currentLane);
    }

    // Power-up indicators
    var puHTML = '';
    if (game.powerups.shield > 0) puHTML += '<div class="powerup-tag">🛡️ Shield</div>';
    if (game.powerups.slow > 0) puHTML += '<div class="powerup-tag">💊 ' + Math.ceil(game.powerups.slow) + 's</div>';
    if (game.powerups.double > 0) puHTML += '<div class="powerup-tag">2× ' + Math.ceil(game.powerups.double) + 's</div>';
    if (game.powerups.magnet > 0) puHTML += '<div class="powerup-tag">🧲 ' + Math.ceil(game.powerups.magnet) + 's</div>';
    document.getElementById('powerupRow').innerHTML = puHTML;
  }

  showAnswerChoices(gates) {
    for (var i = 0; i < 3; i++) {
      document.getElementById('ansText' + i).textContent = gates[i].label;
    }
  }

  hideAnswerChoices() {
    for (var i = 0; i < 3; i++) {
      document.getElementById('ansText' + i).textContent = '';
    }
  }

  showBuzzwords(card) {
    document.getElementById('buzzText').textContent = card.bw.join(' • ');
  }

  showFeedback(card, wasCorrect) {
    var fb = document.getElementById('feedbackEl');
    fb.textContent = (wasCorrect ? '✓ ' : '✗ ') + card.ans;
    fb.className = 'show ' + (wasCorrect ? 'ok' : 'bad');
    if (!wasCorrect) {
      var tb = document.getElementById('teachEl');
      tb.textContent = card.tp;
      tb.classList.add('show');
    }
    this.hideAnswerChoices();
  }

  showStudyTeaching(card) {
    var tb = document.getElementById('teachEl');
    tb.textContent = card.tp;
    tb.classList.add('show');
  }

  // ===== FLOATING SCORE POPUP =====
  showScorePopup(points) {
    var popup = document.createElement('div');
    popup.textContent = '+' + points;
    popup.style.cssText = 'position:fixed;top:35%;left:50%;transform:translateX(-50%);font-size:24px;font-weight:900;color:var(--accent-gold);text-shadow:0 0 10px rgba(255,215,64,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () {
      popup.style.top = '20%';
      popup.style.opacity = '0';
    });
    setTimeout(function () { popup.remove(); }, 800);
  }

  // ===== STREAK MILESTONE =====
  showStreakMilestone(streak, multiplier) {
    var popup = document.createElement('div');
    popup.textContent = '🔥 ' + streak + ' STREAK! ×' + multiplier;
    popup.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:900;color:var(--accent-cyan);text-shadow:0 0 12px rgba(24,255,255,0.5);pointer-events:none;z-index:6;transition:all 1s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () {
      popup.style.top = '25%';
      popup.style.opacity = '0';
    });
    setTimeout(function () { popup.remove(); }, 1000);
  }

  // ===== POWER-UP NOTIFICATION =====
  showPowerupNotification(type) {
    var names = { shield: '🛡️ Shield!', slow: '💊 Slow-Mo!', double: '2× Score!', magnet: '🧲 Coin Magnet!' };
    var popup = document.createElement('div');
    popup.textContent = names[type] || type;
    popup.style.cssText = 'position:fixed;top:45%;left:50%;transform:translateX(-50%);font-size:18px;font-weight:900;color:var(--accent-purple);text-shadow:0 0 10px rgba(179,136,255,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () {
      popup.style.top = '30%';
      popup.style.opacity = '0';
    });
    setTimeout(function () { popup.remove(); }, 800);
  }

  // ===== COUNTDOWN =====
  countdown(callback) {
    var ovl = document.getElementById('countdownOverlay');
    var num = document.getElementById('countdownNum');
    ovl.classList.add('active');
    var ct = 3;
    num.textContent = ct;
    audio.play('countdown');
    var iv = setInterval(function () {
      ct--;
      if (ct > 0) { num.textContent = ct; audio.play('countdown'); }
      else {
        clearInterval(iv);
        num.textContent = 'GO!';
        setTimeout(function () { ovl.classList.remove('active'); callback(); }, 300);
      }
    }, 500);
  }

  // ===== POST-RUN REVIEW =====
  showPostRun(game) {
    var total = game.correct + game.wrong;
    var acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
    var missed = game.runCards.filter(function (r) { return !r.ok; });

    var missedHTML = missed.map(function (r) {
      var c = r.card;
      var whyWrong = (c.ww && c.ww[r.choice]) || '';
      return '<div class="review-card"><h4>❌ ' + c.bw.join(' • ') + '</h4><div><span class="tag tag-wrong">You: ' + r.choice + '</span><span class="tag tag-correct">✓ ' + c.ans + '</span><span class="tag tag-subject">' + c.subj + '</span></div><p style="margin-top:5px"><strong>Teaching:</strong> ' + c.tp + '</p>' + (whyWrong ? '<p><strong>Why "' + r.choice + '" is wrong:</strong> ' + whyWrong + '</p>' : '') + '<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="UI_flagCard(\'' + c.id + '\')">🚩 Flag Card</button></div>';
    }).join('');

    var priorities = missed.slice(0, 5).map(function (r, i) {
      return '<div style="padding:3px 0;font-size:12px">' + (i + 1) + '. ' + r.card.ans + ' <span style="color:var(--text-muted)">(' + r.card.subj + ')</span></div>';
    }).join('');

    document.getElementById('postRunContent').innerHTML =
      '<div class="post-header"><h2>📋 Case Review</h2><div class="score-big">' + game.score + '</div><p style="color:var(--text-muted);font-size:12px">Speed: ' + game.userSpeed + '×</p></div>' +
      '<div class="post-stats"><div class="post-stat"><div class="val" style="color:var(--accent-green)">' + acc + '%</div><div class="label">Accuracy</div></div><div class="post-stat"><div class="val" style="color:var(--accent-gold)">🪙 ' + game.coins + '</div><div class="label">Coins</div></div><div class="post-stat"><div class="val">🔥 ' + game.bestStreak + '</div><div class="label">Streak</div></div></div>' +
      '<div class="post-stats" style="grid-template-columns:1fr 1fr"><div class="post-stat"><div class="val" style="color:var(--accent-green)">' + game.correct + '</div><div class="label">Correct</div></div><div class="post-stat"><div class="val" style="color:var(--accent-red)">' + game.wrong + '</div><div class="label">Wrong</div></div></div>' +
      (missed.length > 0 ? '<h3 style="margin:14px 0 6px">❌ Missed Cards (' + missed.length + ')</h3>' + missedHTML : '<h3 style="margin:14px 0 6px;color:var(--accent-green)">🎉 Perfect Run!</h3>') +
      (priorities ? '<h3 style="margin:14px 0 6px">🎯 Review Priority</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + priorities + '</div>' : '') +
      '<div style="display:flex;gap:6px;margin-top:14px"><button class="btn btn-green" style="flex:1" id="playAgainBtn">▶ Again</button><button class="btn btn-primary" style="flex:1" id="goHomeBtn">🏠 Home</button></div>' +
      (missed.length > 0 ? '<button class="btn btn-outline btn-block" style="margin-top:6px" id="weaknessBtn">🎯 Weakness Mode</button>' : '');

    this.show('screenPostRun');
    var self = this;
    document.getElementById('goHomeBtn').addEventListener('click', function () { self.show('screenHome'); });
  }
}

export var ui = new UI();
