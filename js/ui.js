/**
 * ui.js — All screen rendering, HUD, shop with character preview,
 * settings, stats, quests, achievements, custom cards, post-run review,
 * tutorial, notifications, easter eggs, and track name popup.
 *
 * ZERO Three.js code except for importing CharacterPreview.
 *
 * Features integrated:
 * - Character preview in locker with drag-to-rotate and try-on
 * - Easter egg: tap title 10 times for coin bonus
 * - Konami code: arrow sequence for 1000 coins (one-time)
 * - Track name popup at start of each run
 * - Updated HUD with new power-up types and rush stacks
 * - Achievement notifications
 * - Continue prompt
 * - Share score
 * - Coin burst particles
 * - Power-up screen-edge glow
 * - Daily login reward
 * - Subject mastery badges
 * - All previous features preserved
 */

import { SUBJECTS, CARDS } from './cards.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { customCards } from './customcards.js';
import { SHOP_ITEMS, QUESTS, ACHIEVEMENTS, CONTINUE_COST } from './game/engine.js';
import { CharacterPreview } from './game/preview.js';

class UI {
  constructor() {
    this.characterPreview = null;
    this.titleTapCount = 0;
    this.titleTapTimer = null;
    this.konamiSequence = [];
    this.konamiCode = [38, 38, 40, 40, 37, 39, 37, 39]; // up up down down left right left right

    this.tutorialPage = 0;
    this.tutorialPages = [
      { icon: '\u26A1', title: 'Welcome!', text: 'Buzzword Dash is a fast-paced game that helps you master medical board concepts. See diagnostic buzzwords and run through the correct diagnosis gate!' },
      { icon: '\uD83D\uDC46', title: 'Move Between Lanes', text: 'Swipe left or right to switch lanes. Each lane has a different diagnosis \u2014 pick the one that matches the buzzwords at the top.' },
      { icon: '\u2B06\uFE0F', title: 'Jump Over Obstacles', text: 'Swipe up to jump over gurneys, wheelchairs, and other obstacles on the ground.' },
      { icon: '\u2B07\uFE0F', title: 'Slide Under Obstacles', text: 'Swipe down to slide under IV poles, hospital signs, and MRI tunnels.' },
      { icon: '\uD83D\uDC46\uD83D\uDC46', title: 'Rush for Bonus Points', text: 'Know the answer? Double-tap (or press Shift) to rush! You can stack up to 3 rushes for even more speed and bonus points!' },
      { icon: '\uD83C\uDFCE\uFE0F', title: 'Speed = Points', text: 'Use the speed dial on the home screen to increase game speed. Faster speeds earn more points per correct answer.' },
      { icon: '\uD83D\uDD25', title: 'Build Your Streak', text: 'Correct answers build your streak. Every 5 correct increases your score multiplier up to 8\u00D7!' },
      { icon: '\u2764\uFE0F', title: 'Lives & Continues', text: 'You start with 3 lives. Wrong answers and hitting obstacles cost a life. When you run out, spend coins to continue!' },
      { icon: '\uD83E\uDE99', title: 'Collect & Customize', text: 'Grab coins and glowing power-up orbs as you run! Visit the On-Call Locker to preview and equip avatars, hats, trails, and gear.' },
      { icon: '\uD83C\uDFC6', title: 'Achievements', text: 'Earn badges by reaching milestones \u2014 perfect runs, high streaks, score targets, and more!' },
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
    this.renderAchievements();
    this.setupSpeedDial();
    this.bindNavigation();
    this.bindMusicToggle();
    this.bindSubjectControls();
    this.bindCustomCards();
    this.bindEasterEggs();
    this.checkDailyLoginReward();
  }

  // ===== NAVIGATION =====

  show(screenId) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    document.getElementById(screenId).classList.add('active');
    if (screenId === 'screenHome') this.renderHome();
    if (screenId === 'screenStats') this.renderStats();
    if (screenId === 'screenShop') { this.renderShop(); this.startPreview(); }
    if (screenId === 'screenQuests') this.renderQuests();
    if (screenId === 'screenSettings') this.renderSettings();
    if (screenId === 'screenMyCards') this.renderCustomCardList();
    if (screenId === 'screenAchievements') this.renderAchievements();
    // Stop preview when leaving shop
    if (screenId !== 'screenShop' && this.characterPreview) {
      this.characterPreview.stopAnimation();
    }
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.screen === screenId);
    });
  }

  hideAll() {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    if (this.characterPreview) this.characterPreview.stopAnimation();
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
    document.getElementById('achievementsBtn').addEventListener('click', function () { self.show('screenAchievements'); });
    document.getElementById('myCardsBtn').addEventListener('click', function () { self.show('screenMyCards'); self.renderCustomCardList(); });
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
      btn.textContent = playing ? '\uD83C\uDFB5 Music: ON' : '\uD83C\uDFB5 Music: OFF';
    });
    if (storage.get('musicOn')) btn.textContent = '\uD83C\uDFB5 Music: ON';
  }

  // ===== EASTER EGGS =====

  bindEasterEggs() {
    var self = this;

    // Title tap easter egg: tap "Buzzword Dash" 10 times for coin bonus
    var titleEl = document.querySelector('.home-header h1');
    if (titleEl) {
      titleEl.style.cursor = 'pointer';
      titleEl.addEventListener('click', function () {
        self.titleTapCount++;
        clearTimeout(self.titleTapTimer);
        self.titleTapTimer = setTimeout(function () { self.titleTapCount = 0; }, 2000);
        if (self.titleTapCount >= 10) {
          self.titleTapCount = 0;
          storage.addCoins(500);
          self.showEasterEggReward('Secret found! +500 coins!');
          self.renderHome();
        }
      });
    }

    // Konami code: up up down down left right left right
    document.addEventListener('keydown', function (e) {
      self.konamiSequence.push(e.keyCode);
      if (self.konamiSequence.length > self.konamiCode.length) {
        self.konamiSequence.shift();
      }
      if (self.konamiSequence.length === self.konamiCode.length) {
        var match = true;
        for (var i = 0; i < self.konamiCode.length; i++) {
          if (self.konamiSequence[i] !== self.konamiCode[i]) { match = false; break; }
        }
        if (match && !storage.get('konamiUsed')) {
          storage.set('konamiUsed', true);
          storage.addCoins(1000);
          self.showEasterEggReward('\uD83C\uDFAE Konami Code! +1000 coins!');
          self.renderHome();
          self.konamiSequence = [];
        }
      }
    });
  }

  showEasterEggReward(message) {
    audio.play('achievement');
    var popup = document.createElement('div');
    popup.textContent = message;
    popup.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:900;color:var(--accent-gold);text-shadow:0 0 14px rgba(255,215,64,0.6);pointer-events:none;z-index:30;transition:all 1.2s ease-out;opacity:1;background:rgba(8,12,36,0.9);padding:14px 24px;border-radius:14px;border:2px solid var(--accent-gold);';
    document.body.appendChild(popup);
    requestAnimationFrame(function () { popup.style.top = '25%'; popup.style.opacity = '0'; });
    setTimeout(function () { popup.remove(); }, 1200);
  }

  // ===== DAILY LOGIN REWARD =====

  checkDailyLoginReward() {
    var today = new Date().toDateString();
    var lastLogin = storage.get('lastLoginDate');
    if (lastLogin === today) return; // Already claimed today

    storage.set('lastLoginDate', today);

    // Calculate streak
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var loginStreak = storage.get('loginStreak') || 0;
    if (lastLogin === yesterday.toDateString()) {
      loginStreak++;
    } else if (lastLogin !== today) {
      loginStreak = 1; // Reset streak if not consecutive
    }
    storage.set('loginStreak', loginStreak);

    // Calculate reward based on streak
    var rewards = [10, 20, 30, 50, 75, 100, 150, 200];
    var rewardIndex = Math.min(loginStreak - 1, rewards.length - 1);
    var reward = rewards[Math.max(rewardIndex, 0)];
    storage.addCoins(reward);

    // Show welcome popup
    var self = this;
    setTimeout(function () {
      var popup = document.createElement('div');
      popup.innerHTML = '<div style="font-size:24px;margin-bottom:6px">\uD83D\uDC4B</div>' +
        '<div style="font-size:15px;font-weight:800;color:var(--accent-cyan)">Welcome back!</div>' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">Day ' + loginStreak + ' streak</div>' +
        '<div style="font-size:16px;font-weight:800;color:var(--accent-gold);margin-top:6px">\uD83E\uDE99 +' + reward + ' coins!</div>';
      popup.style.cssText = 'position:fixed;top:30%;left:50%;transform:translateX(-50%);text-align:center;background:rgba(8,12,36,0.95);backdrop-filter:blur(10px);border:2px solid var(--accent-cyan);border-radius:16px;padding:18px 28px;pointer-events:none;z-index:30;transition:all 1.5s ease-out;opacity:1;';
      document.body.appendChild(popup);
      audio.play('coin');
      setTimeout(function () { popup.style.top = '15%'; popup.style.opacity = '0'; }, 2500);
      setTimeout(function () { popup.remove(); self.renderHome(); }, 4000);
    }, 500);
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
    val.textContent = current + '\u00D7';
    dial.addEventListener('input', function () {
      var v = parseFloat(dial.value);
      storage.set('userSpeed', v);
      val.textContent = v + '\u00D7';
    });
  }

  // ===== HOME SCREEN =====

  renderHome() {
    var tc = storage.get('totalCorrect');
    var tw = storage.get('totalWrong');
    var acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;
    var totalCards = CARDS.length + customCards.count();
    var achCount = storage.getAchievementCount();
    document.getElementById('homeStats').innerHTML =
      '<div class="stat-pill"><div class="val">' + storage.get('coins') + '</div><div class="label">Coins</div></div>' +
      '<div class="stat-pill"><div class="val">' + storage.get('bestScore') + '</div><div class="label">Best</div></div>' +
      '<div class="stat-pill"><div class="val">' + acc + '%</div><div class="label">Accuracy</div></div>' +
      '<div class="stat-pill"><div class="val">' + storage.get('dailyStreak') + '</div><div class="label">Daily</div></div>' +
      '<div class="stat-pill"><div class="val">' + achCount + '/' + ACHIEVEMENTS.length + '</div><div class="label">Badges</div></div>';
  }

  // ===== SUBJECTS =====

  renderSubjects() {
    var selected = storage.get('selectedSubjects');
    var container = document.getElementById('subjectScroll');
    var self = this;
    container.innerHTML = SUBJECTS.map(function (s) {
      var sel = selected.indexOf(s) >= 0 ? 'selected' : '';
      // Check for mastery badge
      var ss = storage.getSubjectStat(s);
      var total = ss.correct + ss.wrong;
      var mastered = total >= 50 && (ss.correct / total) >= 0.8;
      var badge = mastered ? ' \u2B50' : '';
      return '<div class="subject-chip ' + sel + '" data-subject="' + s + '">' + s + badge + '</div>';
    }).join('');

    var longPressTimer = null;
    container.querySelectorAll('.subject-chip').forEach(function (chip) {
      var subj = chip.dataset.subject;
      chip.addEventListener('click', function () {
        if (longPressTimer === 'fired') { longPressTimer = null; return; }
        var sel = storage.get('selectedSubjects');
        var idx = sel.indexOf(subj);
        if (idx >= 0) { if (sel.length <= 1) return; sel.splice(idx, 1); }
        else { sel.push(subj); }
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
      chip.addEventListener('pointerup', function () { if (longPressTimer !== 'fired') clearTimeout(longPressTimer); });
      chip.addEventListener('pointerleave', function () { if (longPressTimer !== 'fired') clearTimeout(longPressTimer); });
    });
  }

  // ===== CHARACTER PREVIEW =====

  startPreview() {
    if (!this.characterPreview) {
      this.characterPreview = new CharacterPreview();
      this.characterPreview.init('characterPreviewContainer');
    }
    this.characterPreview.clearPreview();
    this.characterPreview.resize();
    this.characterPreview.startAnimation();
  }

  // ===== SHOP WITH PREVIEW INTEGRATION =====

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
          if (isEquipped) {
            btnHTML = '<span style="color:var(--accent-cyan);font-size:11px;font-weight:700">EQUIPPED</span>';
          } else if (owned) {
            btnHTML = '<button class="btn btn-outline btn-sm" data-equip="' + item.id + '" data-slot="' + type + '">Equip</button>';
          } else {
            btnHTML = '<button class="btn btn-gold btn-sm" data-buy="' + item.id + '" data-price="' + item.price + '">🪙 ' + item.price + '</button>';
          }
          var colorHex = item.color ? '#' + item.color.toString(16).padStart(6, '0') : '#333';
          var iconText = item.icon || '';
          // Add try-on button for previewable items
          var tryOnHTML = '';
          if (type !== 'trail') {
            tryOnHTML = '<button class="btn btn-outline btn-sm" data-preview="' + item.id + '" data-prevslot="' + type + '" style="font-size:10px;padding:4px 8px;margin-left:4px;">\uD83D\uDC41</button>';
          }
          return '<div class="shop-item ' + (isEquipped ? 'equipped' : '') + '">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:' + colorHex + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">' + iconText + '</div>' +
            '<div style="flex:1"><div style="font-size:13px;font-weight:700">' + item.name + '</div></div>' +
            '<div style="display:flex;align-items:center;gap:2px">' + tryOnHTML + btnHTML + '</div></div>';
        }).join('');
    };
    document.getElementById('shopItems').innerHTML =
      renderGroup('skin', '\uD83D\uDC55 Avatars') +
      renderGroup('hat', '\uD83E\uDDE2 Headwear') +
      renderGroup('trail', '\u2728 Trails') +
      renderGroup('gear', '\uD83E\uDE7A Gear');

    // Buy buttons
    document.querySelectorAll('[data-buy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (storage.buyItem(btn.dataset.buy, parseInt(btn.dataset.price))) {
          audio.play('coin');
          self.renderShop();
          if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
        } else { alert('Not enough coins!'); }
      });
    });

    // Equip buttons
    document.querySelectorAll('[data-equip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        storage.equipItem(btn.dataset.equip, btn.dataset.slot);
        self.renderShop();
        if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
        if (self.onEquipChange) self.onEquipChange();
      });
    });

    // Try-on preview buttons
    document.querySelectorAll('[data-preview]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (self.characterPreview) {
          self.characterPreview.previewItem(btn.dataset.preview, btn.dataset.prevslot);
        }
      });
    });
  }

  onEquipChange = null;

// === Part 1 ends here. Part 2 continues with quests, achievements, settings, stats, custom cards ===

  // ===== QUESTS =====

  renderQuests() {
    document.getElementById('questList').innerHTML = QUESTS.map(function (q) {
      var progress = Math.min(storage.getQuestProgress(q.id), q.target);
      var pct = Math.round(progress / q.target * 100);
      return '<div class="quest-item"><div class="quest-title">' + q.title + ': ' + q.desc + '</div><div class="quest-bar"><div class="quest-fill" style="width:' + pct + '%"></div></div><div class="quest-reward">' + progress + '/' + q.target + ' \u2014 \uD83E\uDE99 ' + q.reward + '</div></div>';
    }).join('');
  }

  // ===== ACHIEVEMENTS =====

  renderAchievements() {
    var container = document.getElementById('achievementsList');
    if (!container) return;
    var unlocked = storage.get('achievements');
    container.innerHTML = ACHIEVEMENTS.map(function (ach) {
      var isUnlocked = unlocked.indexOf(ach.id) >= 0;
      return '<div class="achievement-item ' + (isUnlocked ? 'unlocked' : 'locked') + '">' +
        '<div class="achievement-icon">' + (isUnlocked ? ach.icon : '\uD83D\uDD12') + '</div>' +
        '<div class="achievement-info"><div class="achievement-name">' + ach.name + '</div>' +
        '<div class="achievement-desc">' + ach.desc + '</div></div></div>';
    }).join('');
  }

  // ===== SETTINGS =====

  renderSettings() {
    var self = this;
    document.getElementById('settingsContent').innerHTML =
      '<div class="setting-row"><div style="font-size:13px">\uD83C\uDF19 Night Shift</div><div class="toggle ' + (storage.get('nightMode') ? 'on' : '') + '" data-setting="nightMode"></div></div>' +
      '<div class="setting-row"><div style="font-size:13px">\uD83D\uDDE3 Text-to-Speech</div><div class="toggle ' + (storage.get('ttsEnabled') ? 'on' : '') + '" data-setting="ttsEnabled"></div></div>' +
      '<div class="setting-row"><div style="font-size:13px">\uD83D\uDD0A Master Volume</div><input type="range" min="0" max="1" step="0.1" value="' + storage.get('masterVolume') + '" data-range="masterVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>' +
      '<div class="setting-row"><div style="font-size:13px">\uD83C\uDFB5 SFX Volume</div><input type="range" min="0" max="1" step="0.1" value="' + storage.get('sfxVolume') + '" data-range="sfxVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>' +
      '<div style="margin-top:20px"><button class="btn btn-red btn-block" id="resetBtn">\uD83D\uDDD1 Reset All Progress</button></div>';

    document.querySelectorAll('[data-setting]').forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var key = toggle.dataset.setting;
        storage.set(key, !storage.get(key));
        toggle.classList.toggle('on');
        self.applySettings();
        if (key === 'nightMode' && self.onNightModeChange) self.onNightModeChange();
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

  onNightModeChange = null;

  applySettings() {
    document.body.classList.toggle('night-mode', storage.get('nightMode'));
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
      var mastered = total >= 50 && a >= 80;
      var badge = mastered ? ' \u2B50' : '';
      subjectHTML += '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.03)"><span style="font-size:12px">' + s + badge + '</span><span style="font-size:12px;font-weight:700;color:' + color + '">' + a + '% (' + total + ')</span></div>';
    });

    var allCards = CARDS.concat(customCards.getAll());
    var weakCards = allCards.map(function (c) {
      var s = storage.getCardStat(c.id);
      if (s.seen < 2) return null;
      return { card: c, accuracy: s.correct / s.seen, seen: s.seen };
    }).filter(function (x) { return x !== null; }).sort(function (a, b) { return a.accuracy - b.accuracy; }).slice(0, 5);

    var weakHTML = weakCards.length > 0
      ? weakCards.map(function (w) {
        return '<div style="padding:3px 0;font-size:11px"><span style="color:var(--accent-red);font-weight:700">' + Math.round(w.accuracy * 100) + '%</span> \u2014 ' + w.card.ans + ' <span style="color:var(--text-muted)">(' + w.card.subj + ')</span></div>';
      }).join('')
      : '<p style="font-size:11px;color:var(--text-muted)">Play more to see weak areas.</p>';

    document.getElementById('statsContent').innerHTML =
      '<div class="post-stats"><div class="post-stat"><div class="val">' + te + '</div><div class="label">Cards</div></div><div class="post-stat"><div class="val" style="color:var(--accent-green)">' + tc + '</div><div class="label">Correct</div></div><div class="post-stat"><div class="val" style="color:var(--accent-red)">' + tw + '</div><div class="label">Wrong</div></div></div>' +
      '<div class="post-stats" style="grid-template-columns:1fr 1fr"><div class="post-stat"><div class="val">' + acc + '%</div><div class="label">Accuracy</div></div><div class="post-stat"><div class="val">' + storage.get('bestScore') + '</div><div class="label">Best Score</div></div></div>' +
      '<h3 style="margin:14px 0 6px;font-size:14px">\uD83D\uDCCA By Subject</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + (subjectHTML || '<p style="font-size:11px;color:var(--text-muted)">No data yet.</p>') + '</div>' +
      '<h3 style="margin:14px 0 6px;font-size:14px">\uD83C\uDFAF Weakest Concepts</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + weakHTML + '</div>';
  }

  // ===== CUSTOM CARDS =====

  bindCustomCards() {
    var self = this;
    document.getElementById('addCardBtn').addEventListener('click', function () { self.openCardEditor(null); });
    document.getElementById('saveCardBtn').addEventListener('click', function () { self.saveCard(); });
    document.getElementById('cancelCardBtn').addEventListener('click', function () { self.show('screenMyCards'); self.renderCustomCardList(); });
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
        return '<div class="review-card" style="border-left-color:var(--accent-blue)"><h4>' + card.bw.join(' \u2022 ') + '</h4><div><span class="tag tag-correct">' + card.ans + '</span><span class="tag tag-subject">' + card.subj + '</span></div><p style="margin-top:4px">' + card.tp + '</p><div style="display:flex;gap:6px;margin-top:6px"><button class="btn btn-outline btn-sm" onclick="UI_editCard(\'' + card.id + '\')">\u270F\uFE0F Edit</button><button class="btn btn-outline btn-sm" style="border-color:rgba(255,82,82,0.5);color:var(--accent-red)" onclick="UI_deleteCard(\'' + card.id + '\')">\uD83D\uDDD1\uFE0F Delete</button></div></div>';
      }).join('');
  }

  openCardEditor(cardId) {
    var isEdit = !!cardId;
    document.getElementById('cardEditorTitle').textContent = isEdit ? '\u270F\uFE0F Edit Card' : '\uD83D\uDCDD Create Card';
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
    if (editId) { customCards.update(editId, cardData); }
    else { customCards.add(cardData); storage.unlockAchievement('ach_custom_card'); }
    this.show('screenMyCards');
    this.renderCustomCardList();
  }

  showExport() {
    document.getElementById('importExportTitle').textContent = '\uD83D\uDCE4 Export Cards';
    document.getElementById('importExportArea').value = customCards.exportJSON();
    document.getElementById('importExportArea').readOnly = true;
    document.getElementById('importExportMsg').textContent = 'Copy this JSON to share your cards.';
    document.getElementById('importExportAction').textContent = '\uD83D\uDCCB Copy to Clipboard';
    document.getElementById('importExportAction').onclick = function () {
      document.getElementById('importExportArea').select();
      document.execCommand('copy');
      document.getElementById('importExportMsg').textContent = '\u2705 Copied!';
    };
    this.show('screenImportExport');
  }

  showImport() {
    document.getElementById('importExportTitle').textContent = '\uD83D\uDCE5 Import Cards';
    document.getElementById('importExportArea').value = '';
    document.getElementById('importExportArea').readOnly = false;
    document.getElementById('importExportMsg').textContent = 'Paste JSON from someone who shared their cards.';
    document.getElementById('importExportAction').textContent = '\uD83D\uDCE5 Import';
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
    var self = this;
    document.getElementById('tutPage').innerHTML = '<div class="tut-icon">' + p.icon + '</div><h2>' + p.title + '</h2><p>' + p.text + '</p>';
    document.getElementById('tutDots').innerHTML = this.tutorialPages.map(function (_, i) {
      return '<div class="tut-dot ' + (i === self.tutorialPage ? 'active' : '') + '"></div>';
    }).join('');
    document.getElementById('tutNextBtn').textContent = this.tutorialPage === this.tutorialPages.length - 1 ? 'Start Playing! \u2713' : 'Next \u2192';
  }

  tutorialNext() {
    this.tutorialPage++;
    if (this.tutorialPage >= this.tutorialPages.length) {
      document.getElementById('tutorialOverlay').classList.remove('active');
    } else { this.renderTutorialPage(); }
  }

// === Part 2 ends here. Part 3 continues with HUD, buzzwords, feedback, popups, notifications, track name ===


  // ===== HUD =====

  showHud() { document.getElementById('hud').classList.remove('off'); }
  hideHud() { document.getElementById('hud').classList.add('off'); }

  updateHud(game) {
    document.getElementById('hudCoins').textContent = game.coins;
    document.getElementById('hudScore').textContent = game.score;
    document.getElementById('hudStreak').textContent = game.streak;
    document.getElementById('hudMulti').textContent = game.multiplier;
    document.getElementById('hudLives').textContent = game.mode === 'study' ? '\u221E' : game.lives;

    if (game.feedbackTimer <= 0) document.getElementById('feedbackEl').classList.remove('show');
    if (game.teachTimer <= 0) document.getElementById('teachEl').classList.remove('show');

    // Answer choice highlighting
    for (var i = 0; i < 3; i++) {
      document.getElementById('ans' + i).classList.toggle('active', i === game.currentLane);
    }

    // Power-up indicators with new types
    var puHTML = '';
    if (game.powerups.shield > 0) puHTML += '<div class="powerup-tag">\uD83D\uDEE1\uFE0F Shield</div>';
    if (game.powerups.magnet > 0) puHTML += '<div class="powerup-tag">\uD83E\uDDF2 ' + Math.ceil(game.powerups.magnet) + 's</div>';
    if (game.powerups.double > 0) puHTML += '<div class="powerup-tag">2\u00D7 ' + Math.ceil(game.powerups.double) + 's</div>';
    if (game.powerups.autoPilot > 0) puHTML += '<div class="powerup-tag">\uD83E\uDD16 ' + game.autoPilotGatesLeft + ' gates</div>';
    if (game.powerups.scoreFrenzy > 0) puHTML += '<div class="powerup-tag">\uD83D\uDC8E ' + Math.ceil(game.powerups.scoreFrenzy) + 's</div>';
    if (game.rushStacks > 0) puHTML += '<div class="powerup-tag" style="color:var(--accent-orange);border-color:rgba(255,136,0,0.4)">\u26A1 Rush \u00D7' + game.rushStacks + '</div>';
    document.getElementById('powerupRow').innerHTML = puHTML;
  }

  // ===== ANSWER CHOICES =====

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

  // ===== BUZZWORDS =====

  showBuzzwords(card) {
    document.getElementById('buzzText').textContent = card.bw.join(' \u2022 ');
  }

  // ===== FEEDBACK =====

  showFeedback(card, wasCorrect) {
    var fb = document.getElementById('feedbackEl');
    fb.textContent = (wasCorrect ? '\u2713 ' : '\u2717 ') + card.ans;
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

  // ===== TRACK NAME POPUP =====

  showTrackName(skinName) {
    var overlay = document.getElementById('trackNameOverlay');
    if (!overlay) return;
    var nameEl = document.getElementById('trackNameText');
    if (nameEl) nameEl.textContent = skinName;
    overlay.classList.add('show');
    setTimeout(function () { overlay.classList.remove('show'); }, 2500);
  }

  // ===== FLOATING SCORE POPUP =====

  showScorePopup(points) {
    var popup = document.createElement('div');
    popup.textContent = '+' + points;
    popup.style.cssText = 'position:fixed;top:35%;left:50%;transform:translateX(-50%);font-size:24px;font-weight:900;color:var(--accent-gold);text-shadow:0 0 10px rgba(255,215,64,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () { popup.style.top = '20%'; popup.style.opacity = '0'; });
    setTimeout(function () { popup.remove(); }, 800);
  }

  // ===== COIN COLLECTION BURST =====

  showCoinBurst() {
    for (var i = 0; i < 6; i++) {
      var particle = document.createElement('div');
      var angle = (i / 6) * Math.PI * 2;
      var dist = 30 + Math.random() * 20;
      particle.textContent = '\u2726';
      particle.style.cssText = 'position:fixed;top:50%;left:50%;font-size:14px;color:var(--accent-gold);pointer-events:none;z-index:6;transition:all 0.4s ease-out;opacity:1;transform:translate(-50%,-50%);';
      document.body.appendChild(particle);
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist;
      (function (el, ddx, ddy) {
        requestAnimationFrame(function () {
          el.style.transform = 'translate(calc(-50% + ' + ddx + 'px), calc(-50% + ' + ddy + 'px))';
          el.style.opacity = '0';
        });
        setTimeout(function () { el.remove(); }, 400);
      })(particle, dx, dy);
    }
  }

  // ===== STREAK MILESTONE =====

  showStreakMilestone(streak, multiplier) {
    var popup = document.createElement('div');
    popup.textContent = '\uD83D\uDD25 ' + streak + ' STREAK! \u00D7' + multiplier;
    popup.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:900;color:var(--accent-cyan);text-shadow:0 0 12px rgba(24,255,255,0.5);pointer-events:none;z-index:6;transition:all 1s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () { popup.style.top = '25%'; popup.style.opacity = '0'; });
    setTimeout(function () { popup.remove(); }, 1000);
  }

  // ===== POWER-UP NOTIFICATION =====

  showPowerupNotification(type) {
    var names = {
      shield: '\uD83D\uDEE1\uFE0F Shield!',
      magnet: '\uD83E\uDDF2 Coin Magnet!',
      double: '2\u00D7 Score!',
      autoPilot: '\uD83E\uDD16 Auto-Pilot!',
      scoreFrenzy: '\uD83D\uDC8E Score Frenzy!'
    };
    var popup = document.createElement('div');
    popup.textContent = names[type] || type;
    popup.style.cssText = 'position:fixed;top:45%;left:50%;transform:translateX(-50%);font-size:18px;font-weight:900;color:var(--accent-purple);text-shadow:0 0 10px rgba(179,136,255,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
    document.body.appendChild(popup);
    requestAnimationFrame(function () { popup.style.top = '30%'; popup.style.opacity = '0'; });
    setTimeout(function () { popup.remove(); }, 800);
  }

  // ===== POWER-UP SCREEN EDGE GLOW =====

  showPowerupGlow(type) {
    var colors = {
      shield: 'rgba(68, 136, 255, 0.3)',
      magnet: 'rgba(255, 170, 0, 0.3)',
      double: 'rgba(170, 68, 255, 0.3)',
      autoPilot: 'rgba(0, 238, 102, 0.3)',
      scoreFrenzy: 'rgba(255, 68, 136, 0.3)'
    };
    var color = colors[type] || 'rgba(255, 255, 255, 0.2)';
    var glow = document.createElement('div');
    glow.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;transition:opacity 0.8s ease-out;opacity:1;box-shadow:inset 0 0 60px 20px ' + color + ';';
    document.body.appendChild(glow);
    requestAnimationFrame(function () { glow.style.opacity = '0'; });
    setTimeout(function () { glow.remove(); }, 800);
  }

  // ===== ACHIEVEMENT NOTIFICATION =====

  showAchievementNotification(achievementIds) {
    var delay = 0;
    achievementIds.forEach(function (achId) {
      var ach = null;
      for (var i = 0; i < ACHIEVEMENTS.length; i++) {
        if (ACHIEVEMENTS[i].id === achId) { ach = ACHIEVEMENTS[i]; break; }
      }
      if (!ach) return;

      setTimeout(function () {
        audio.play('achievement');
        var popup = document.createElement('div');
        popup.innerHTML = '<div style="font-size:28px;margin-bottom:4px">' + ach.icon + '</div>' +
          '<div style="font-size:14px;font-weight:800;color:var(--accent-gold)">Achievement Unlocked!</div>' +
          '<div style="font-size:16px;font-weight:700;margin-top:2px">' + ach.name + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">' + ach.desc + '</div>';
        popup.style.cssText = 'position:fixed;top:15%;left:50%;transform:translateX(-50%);text-align:center;background:rgba(8,12,36,0.95);backdrop-filter:blur(10px);border:2px solid var(--accent-gold);border-radius:16px;padding:16px 24px;pointer-events:none;z-index:20;transition:all 1.5s ease-out;opacity:1;';
        document.body.appendChild(popup);
        setTimeout(function () { popup.style.top = '5%'; popup.style.opacity = '0'; }, 2000);
        setTimeout(function () { popup.remove(); }, 3500);
      }, delay);

      delay += 2000;
    });
  }

  // ===== CONTINUE PROMPT =====

  showContinuePrompt(cost, onContinue, onDecline) {
    var overlay = document.getElementById('continueOverlay');
    var costEl = document.getElementById('continueCost');
    var currentCoins = document.getElementById('continueCoins');
    var continueBtn = document.getElementById('continueYesBtn');
    var declineBtn = document.getElementById('continueNoBtn');

    costEl.textContent = cost;
    currentCoins.textContent = storage.get('coins');
    overlay.classList.add('active');

    // Clone buttons to remove old listeners
    var newContinueBtn = continueBtn.cloneNode(true);
    continueBtn.parentNode.replaceChild(newContinueBtn, continueBtn);
    var newDeclineBtn = declineBtn.cloneNode(true);
    declineBtn.parentNode.replaceChild(newDeclineBtn, declineBtn);

    newContinueBtn.addEventListener('click', function () {
      overlay.classList.remove('active');
      if (onContinue) onContinue();
    });
    newDeclineBtn.addEventListener('click', function () {
      overlay.classList.remove('active');
      if (onDecline) onDecline();
    });
  }

  hideContinuePrompt() {
    document.getElementById('continueOverlay').classList.remove('active');
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

// === Part 3 ends here. Part 4 continues with post-run review, share score, and export ===


  // ===== POST-RUN REVIEW =====

  showPostRun(game) {
    var total = game.correct + game.wrong;
    var acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
    var missed = game.runCards.filter(function (r) { return !r.ok; });

    var missedHTML = missed.map(function (r) {
      var c = r.card;
      var whyWrong = (c.ww && c.ww[r.choice]) || '';
      var exceptionHTML = '';
      if (c.exception) {
        exceptionHTML = '<p style="margin-top:4px"><strong>\u26A0\uFE0F Exception:</strong> ' + c.exception + '</p>';
      }
      return '<div class="review-card"><h4>\u274C ' + c.bw.join(' \u2022 ') + '</h4>' +
        '<div><span class="tag tag-wrong">You: ' + r.choice + '</span>' +
        '<span class="tag tag-correct">\u2713 ' + c.ans + '</span>' +
        '<span class="tag tag-subject">' + c.subj + '</span></div>' +
        '<p style="margin-top:5px"><strong>\uD83D\uDCD6 Rule:</strong> ' + c.tp + '</p>' +
        exceptionHTML +
        (whyWrong ? '<p style="margin-top:4px"><strong>Why "' + r.choice + '" is wrong:</strong> ' + whyWrong + '</p>' : '') +
        '<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="UI_flagCard(\'' + c.id + '\')">\uD83D\uDEA9 Flag Card</button>' +
        '</div>';
    }).join('');

    var correctSample = game.runCards.filter(function (r) { return r.ok; }).slice(0, 5).map(function (r) {
      var c = r.card;
      var exceptionHTML = '';
      if (c.exception) {
        exceptionHTML = '<p style="margin-top:4px;font-size:10px"><strong>\u26A0\uFE0F Exception:</strong> ' + c.exception + '</p>';
      }
      return '<div class="review-card" style="border-left-color:var(--accent-green)"><h4>\u2713 ' + c.bw.join(' \u2022 ') + '</h4>' +
        '<div><span class="tag tag-correct">' + c.ans + '</span><span class="tag tag-subject">' + c.subj + '</span></div>' +
        '<p style="margin-top:4px;font-size:10px;color:var(--text-muted)">' + c.tp + '</p>' +
        exceptionHTML + '</div>';
    }).join('');

    var priorities = missed.slice(0, 5).map(function (r, i) {
      return '<div style="padding:3px 0;font-size:12px">' + (i + 1) + '. ' + r.card.ans + ' <span style="color:var(--text-muted)">(' + r.card.subj + ')</span></div>';
    }).join('');

    var skinInfo = game.currentSkin ? ' \u2022 Track: ' + game.currentSkin.name : '';
    var continuedInfo = game.continued ? ' (continued)' : '';

    document.getElementById('postRunContent').innerHTML =
      '<div class="post-header"><h2>\uD83D\uDCCB Case Review</h2><div class="score-big">' + game.score + '</div>' +
      '<p style="color:var(--text-muted);font-size:12px">Speed: ' + game.userSpeed + '\u00D7' + skinInfo + continuedInfo + '</p></div>' +
      '<div class="post-stats">' +
      '<div class="post-stat"><div class="val" style="color:var(--accent-green)">' + acc + '%</div><div class="label">Accuracy</div></div>' +
      '<div class="post-stat"><div class="val" style="color:var(--accent-gold)">\uD83E\uDE99 ' + game.coins + '</div><div class="label">Coins</div></div>' +
      '<div class="post-stat"><div class="val">\uD83D\uDD25 ' + game.bestStreak + '</div><div class="label">Streak</div></div>' +
      '</div>' +
      '<div class="post-stats" style="grid-template-columns:1fr 1fr">' +
      '<div class="post-stat"><div class="val" style="color:var(--accent-green)">' + game.correct + '</div><div class="label">Correct</div></div>' +
      '<div class="post-stat"><div class="val" style="color:var(--accent-red)">' + game.wrong + '</div><div class="label">Wrong</div></div>' +
      '</div>' +
      (missed.length > 0 ? '<h3 style="margin:14px 0 6px">\u274C Missed Cards (' + missed.length + ')</h3>' + missedHTML : '<h3 style="margin:14px 0 6px;color:var(--accent-green)">\uD83C\uDF89 Perfect Run!</h3>') +
      (priorities ? '<h3 style="margin:14px 0 6px">\uD83C\uDFAF Review Priority</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + priorities + '</div>' : '') +
      (correctSample ? '<h3 style="margin:14px 0 6px">\u2705 Correct Answers (sample)</h3>' + correctSample : '') +
      '<div style="display:flex;gap:6px;margin-top:14px">' +
      '<button class="btn btn-green" style="flex:1" id="playAgainBtn">\u25B6 Again</button>' +
      '<button class="btn btn-primary" style="flex:1" id="goHomeBtn">\uD83C\uDFE0 Home</button>' +
      '</div>' +
      (missed.length > 0 ? '<button class="btn btn-outline btn-block" style="margin-top:6px" id="weaknessBtn">\uD83C\uDFAF Weakness Mode</button>' : '') +
      '<button class="btn btn-outline btn-block" style="margin-top:6px" id="shareBtn">\uD83D\uDCE4 Share Score</button>';

    this.show('screenPostRun');

    var self = this;
    document.getElementById('goHomeBtn').addEventListener('click', function () { self.show('screenHome'); });

    var shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () { self.shareScore(game); });
    }
  }

  // ===== SHARE SCORE =====

  shareScore(game) {
    var total = game.correct + game.wrong;
    var acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
    var skinName = game.currentSkin ? game.currentSkin.name : 'Unknown';
    var text = '\u26A1 Buzzword Dash \u26A1\n' +
      '\uD83C\uDFC6 Score: ' + game.score + '\n' +
      '\u2705 Accuracy: ' + acc + '%\n' +
      '\uD83D\uDD25 Streak: ' + game.bestStreak + '\n' +
      '\uD83E\uDE99 Coins: ' + game.coins + '\n' +
      '\uD83D\uDC8A Speed: ' + game.userSpeed + '\u00D7\n' +
      '\uD83C\uDF0D Track: ' + skinName + '\n' +
      '\nCan you beat my score? Play at:\n' +
      window.location.href;

    if (navigator.share) {
      navigator.share({ title: 'Buzzword Dash Score', text: text }).catch(function () {
        copyToClipboard(text);
      });
    } else {
      copyToClipboard(text);
    }
  }
}

// ===== CLIPBOARD HELPERS =====

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      alert('Score copied to clipboard! Paste it anywhere to share.');
    }).catch(function () { fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    alert('Score copied to clipboard!');
  } catch (e) {
    alert('Could not copy. Your score:\n\n' + text);
  }
  document.body.removeChild(textarea);
}

export var ui = new UI();
