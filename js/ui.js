/**
 * ui.js — All screen rendering, HUD updates, shop, quests,
 * settings, post-run review, tutorial, and card flagging.
 *
 * ZERO Three.js code — only touches the DOM.
 */

import { SUBJECTS, CARDS } from './cards.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { SHOP_ITEMS, QUESTS } from './game.js';

class UI {
  constructor() {
    this.tutorialPage = 0;
    this.tutorialPages = [
      { icon: '⚡', title: 'Welcome!', text: 'Buzzword Dash is a fast-paced game that helps you master medical board concepts. You\'ll see diagnostic buzzwords and run through the correct diagnosis gate!' },
      { icon: '👆', title: 'Move Between Lanes', text: 'Swipe left or right to switch lanes. Each lane has a different diagnosis — pick the one that matches the buzzwords shown at the top.' },
      { icon: '⬆️', title: 'Jump Over Obstacles', text: 'Swipe up to jump over gurneys and other obstacles blocking the ground.' },
      { icon: '⬇️', title: 'Slide Under Obstacles', text: 'Swipe down to slide under IV poles and overhead barriers.' },
      { icon: '👆👆', title: 'Rush for Bonus Points', text: 'If you know the answer right away, double-tap the screen (or press Shift on keyboard) to rush through the gate and earn bonus points!' },
      { icon: '🏎️', title: 'Speed = Points', text: 'Use the speed dial on the home screen to increase game speed. Faster speeds earn more points per correct answer.' },
      { icon: '🔥', title: 'Build Your Streak', text: 'Get answers right in a row to build a streak. Every 5 correct answers increases your score multiplier up to 8×!' },
      { icon: '❤️', title: 'Lives', text: 'You start with 3 lives. Wrong answers and hitting obstacles cost a life. In Study Mode, you have unlimited lives.' },
      { icon: '🪙', title: 'Collect Coins', text: 'Grab coins as you run! Spend them in the On-Call Locker to customize your character.' },
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
  }

  // ===== NAVIGATION =====
  show(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    if (screenId === 'screenHome') this.renderHome();
    if (screenId === 'screenStats') this.renderStats();
    if (screenId === 'screenShop') this.renderShop();
    if (screenId === 'screenQuests') this.renderQuests();
    if (screenId === 'screenSettings') this.renderSettings();
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.screen === screenId);
    });
  }

  hideAll() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  }

  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => this.show(item.dataset.screen));
    });
    document.querySelectorAll('.back-btn').forEach(btn => {
      btn.addEventListener('click', () => this.show('screenHome'));
    });
    document.getElementById('settingsBtn').addEventListener('click', () => this.show('screenSettings'));
    document.getElementById('shopBtn').addEventListener('click', () => this.show('screenShop'));
    document.getElementById('questBtn').addEventListener('click', () => this.show('screenQuests'));
    document.getElementById('tutorialBtn').addEventListener('click', () => this.showTutorial());
    document.getElementById('tutNextBtn').addEventListener('click', () => this.tutorialNext());
    document.getElementById('tutCloseBtn').addEventListener('click', () => {
      document.getElementById('tutorialOverlay').classList.remove('active');
    });
  }

  bindMusicToggle() {
    const btn = document.getElementById('musicToggleBtn');
    btn.addEventListener('click', () => {
      const playing = audio.toggleMusic();
      btn.textContent = playing ? '🎵 Music: ON' : '🎵 Music: OFF';
    });
    if (storage.get('musicOn')) btn.textContent = '🎵 Music: ON';
  }

  // ===== SUBJECT CONTROLS =====
  bindSubjectControls() {
    document.getElementById('selectAllSubjects').addEventListener('click', () => {
      storage.set('selectedSubjects', [...SUBJECTS]);
      this.renderSubjects();
    });
    document.getElementById('deselectAllSubjects').addEventListener('click', () => {
      // Keep at least one — keep the first currently selected
      const current = storage.get('selectedSubjects');
      storage.set('selectedSubjects', current.length > 0 ? [current[0]] : [SUBJECTS[0]]);
      this.renderSubjects();
    });
  }

  // ===== SPEED DIAL =====
  setupSpeedDial() {
    const dial = document.getElementById('speedDial');
    const val = document.getElementById('speedValue');
    const current = storage.get('userSpeed') || 1;
    dial.value = current;
    val.textContent = current + '×';
    dial.addEventListener('input', () => {
      const v = parseFloat(dial.value);
      storage.set('userSpeed', v);
      val.textContent = v + '×';
    });
  }

  // ===== HOME SCREEN =====
  renderHome() {
    const tc = storage.get('totalCorrect');
    const tw = storage.get('totalWrong');
    const acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;
    document.getElementById('homeStats').innerHTML = `
      <div class="stat-pill"><div class="val">${storage.get('coins')}</div><div class="label">Coins</div></div>
      <div class="stat-pill"><div class="val">${storage.get('bestScore')}</div><div class="label">Best</div></div>
      <div class="stat-pill"><div class="val">${acc}%</div><div class="label">Accuracy</div></div>
      <div class="stat-pill"><div class="val">${storage.get('dailyStreak')}</div><div class="label">Daily</div></div>
    `;
  }

  // ===== SUBJECTS =====
  renderSubjects() {
    const selected = storage.get('selectedSubjects');
    const container = document.getElementById('subjectScroll');
    container.innerHTML = SUBJECTS.map(s => {
      const sel = selected.includes(s) ? 'selected' : '';
      return `<div class="subject-chip ${sel}" data-subject="${s}">${s}</div>`;
    }).join('');

    let longPressTimer = null;

    container.querySelectorAll('.subject-chip').forEach(chip => {
      const subj = chip.dataset.subject;

      // Regular tap = toggle
      chip.addEventListener('click', (e) => {
        if (longPressTimer === 'fired') { longPressTimer = null; return; }
        const sel = storage.get('selectedSubjects');
        const idx = sel.indexOf(subj);
        if (idx >= 0) {
          if (sel.length <= 1) return; // keep at least 1
          sel.splice(idx, 1);
        } else {
          sel.push(subj);
        }
        storage.set('selectedSubjects', sel);
        chip.classList.toggle('selected');
      });

      // Long press = select ONLY this subject
      chip.addEventListener('pointerdown', () => {
        longPressTimer = setTimeout(() => {
          storage.set('selectedSubjects', [subj]);
          longPressTimer = 'fired';
          this.renderSubjects();
        }, 500);
      });
      chip.addEventListener('pointerup', () => {
        if (longPressTimer !== 'fired') clearTimeout(longPressTimer);
      });
      chip.addEventListener('pointerleave', () => {
        if (longPressTimer !== 'fired') clearTimeout(longPressTimer);
      });
    });
  }

  // ===== STATS =====
  renderStats() {
    const tc = storage.get('totalCorrect');
    const tw = storage.get('totalWrong');
    const te = storage.get('totalEncounters');
    const acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;

    let subjectHTML = '';
    SUBJECTS.forEach(s => {
      const ss = storage.getSubjectStat(s);
      const total = ss.correct + ss.wrong;
      if (total === 0) return;
      const a = Math.round(ss.correct / total * 100);
      const color = a >= 70 ? 'var(--accent-green)' : 'var(--accent-red)';
      subjectHTML += `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.03)"><span style="font-size:12px">${s}</span><span style="font-size:12px;font-weight:700;color:${color}">${a}% (${total})</span></div>`;
    });

    let weakCards = CARDS.map(c => {
      const s = storage.getCardStat(c.id);
      if (s.seen < 2) return null;
      return { card: c, accuracy: s.correct / s.seen, seen: s.seen };
    }).filter(x => x !== null).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);

    let weakHTML = weakCards.length > 0
      ? weakCards.map(w => `<div style="padding:3px 0;font-size:11px"><span style="color:var(--accent-red);font-weight:700">${Math.round(w.accuracy * 100)}%</span> — ${w.card.ans} <span style="color:var(--text-muted)">(${w.card.subj})</span></div>`).join('')
      : '<p style="font-size:11px;color:var(--text-muted)">Play more to see weak areas.</p>';

    document.getElementById('statsContent').innerHTML = `
      <div class="post-stats">
        <div class="post-stat"><div class="val">${te}</div><div class="label">Cards</div></div>
        <div class="post-stat"><div class="val" style="color:var(--accent-green)">${tc}</div><div class="label">Correct</div></div>
        <div class="post-stat"><div class="val" style="color:var(--accent-red)">${tw}</div><div class="label">Wrong</div></div>
      </div>
      <div class="post-stats" style="grid-template-columns:1fr 1fr">
        <div class="post-stat"><div class="val">${acc}%</div><div class="label">Accuracy</div></div>
        <div class="post-stat"><div class="val">${storage.get('bestScore')}</div><div class="label">Best Score</div></div>
      </div>
      <h3 style="margin:14px 0 6px;font-size:14px">📊 By Subject</h3>
      <div style="background:var(--bg-card);border-radius:10px;padding:10px">${subjectHTML || '<p style="font-size:11px;color:var(--text-muted)">No data yet.</p>'}</div>
      <h3 style="margin:14px 0 6px;font-size:14px">🎯 Weakest Concepts</h3>
      <div style="background:var(--bg-card);border-radius:10px;padding:10px">${weakHTML}</div>
    `;
  }

  // ===== SHOP =====
  renderShop() {
    document.getElementById('shopCoins').textContent = storage.get('coins');
    const renderGroup = (type, title) => {
      const items = SHOP_ITEMS.filter(i => i.type === type);
      const equipped = storage.get('equipped');
      return `<h3 style="margin:12px 0 6px;font-size:14px;color:var(--text-secondary)">${title}</h3>` +
        items.map(item => {
          const owned = storage.ownsItem(item.id);
          const isEquipped = equipped[type] === item.id;
          let btnHTML;
          if (isEquipped) btnHTML = '<span style="color:var(--accent-cyan);font-size:11px;font-weight:700">EQUIPPED</span>';
          else if (owned) btnHTML = `<button class="btn btn-outline btn-sm" data-equip="${item.id}" data-slot="${type}">Equip</button>`;
          else btnHTML = `<button class="btn btn-gold btn-sm" data-buy="${item.id}" data-price="${item.price}">🪙 ${item.price}</button>`;
          const colorHex = item.color ? '#' + item.color.toString(16).padStart(6, '0') : '#333';
          return `<div class="shop-item ${isEquipped ? 'equipped' : ''}"><div style="width:36px;height:36px;border-radius:8px;background:${colorHex};flex-shrink:0"></div><div style="flex:1"><div style="font-size:13px;font-weight:700">${item.name}</div></div>${btnHTML}</div>`;
        }).join('');
    };
    document.getElementById('shopItems').innerHTML =
      renderGroup('skin', '👕 Outfits') + renderGroup('hat', '🧢 Headwear') + renderGroup('gear', '🩺 Gear');

    document.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (storage.buyItem(btn.dataset.buy, parseInt(btn.dataset.price))) {
          audio.play('coin');
          this.renderShop();
        } else { alert('Not enough coins!'); }
      });
    });
    document.querySelectorAll('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        storage.equipItem(btn.dataset.equip, btn.dataset.slot);
        this.renderShop();
        if (this.onEquipChange) this.onEquipChange();
      });
    });
  }

  onEquipChange = null;

  // ===== QUESTS =====
  renderQuests() {
    document.getElementById('questList').innerHTML = QUESTS.map(q => {
      const progress = Math.min(storage.getQuestProgress(q.id), q.target);
      const pct = Math.round(progress / q.target * 100);
      return `<div class="quest-item"><div class="quest-title">${q.title}: ${q.desc}</div><div class="quest-bar"><div class="quest-fill" style="width:${pct}%"></div></div><div class="quest-reward">${progress}/${q.target} — 🪙 ${q.reward}</div></div>`;
    }).join('');
  }

  // ===== SETTINGS =====
  renderSettings() {
    document.getElementById('settingsContent').innerHTML = `
      <div class="setting-row"><div style="font-size:13px">🌙 Night Shift</div><div class="toggle ${storage.get('nightMode') ? 'on' : ''}" data-setting="nightMode"></div></div>
      <div class="setting-row"><div style="font-size:13px">🗣 Text-to-Speech</div><div class="toggle ${storage.get('ttsEnabled') ? 'on' : ''}" data-setting="ttsEnabled"></div></div>
      <div class="setting-row"><div style="font-size:13px">TTS Speed</div><input type="range" min="0.5" max="2" step="0.1" value="${storage.get('ttsRate')}" data-range="ttsRate" style="width:100px;accent-color:var(--accent-cyan)"></div>
      <div class="setting-row"><div style="font-size:13px">🔊 Master Volume</div><input type="range" min="0" max="1" step="0.1" value="${storage.get('masterVolume')}" data-range="masterVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>
      <div class="setting-row"><div style="font-size:13px">🎵 SFX Volume</div><input type="range" min="0" max="1" step="0.1" value="${storage.get('sfxVolume')}" data-range="sfxVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>
      <div class="setting-row"><div style="font-size:13px">♿ Reduced Motion</div><div class="toggle ${storage.get('reducedMotion') ? 'on' : ''}" data-setting="reducedMotion"></div></div>
      <div style="margin-top:20px"><button class="btn btn-red btn-block" id="resetBtn">🗑 Reset All Progress</button></div>
    `;
    document.querySelectorAll('[data-setting]').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const key = toggle.dataset.setting;
        storage.set(key, !storage.get(key));
        toggle.classList.toggle('on');
        this.applySettings();
      });
    });
    document.querySelectorAll('[data-range]').forEach(range => {
      range.addEventListener('input', () => {
        storage.set(range.dataset.range, parseFloat(range.value));
        audio.updateMusicVolume();
      });
    });
    document.getElementById('resetBtn').addEventListener('click', () => {
      if (confirm('Reset ALL progress? This cannot be undone.')) {
        storage.reset();
        this.init();
        alert('Progress reset!');
      }
    });
    this.applySettings();
  }

  applySettings() {
    document.body.classList.toggle('night-mode', storage.get('nightMode'));
  }

  // ===== TUTORIAL (rewritten for end users) =====
  showTutorial() {
    this.tutorialPage = 0;
    this.renderTutorialPage();
    document.getElementById('tutorialOverlay').classList.add('active');
  }

  renderTutorialPage() {
    const p = this.tutorialPages[this.tutorialPage];
    document.getElementById('tutPage').innerHTML = `<div class="tut-icon">${p.icon}</div><h2>${p.title}</h2><p>${p.text}</p>`;
    document.getElementById('tutDots').innerHTML = this.tutorialPages.map((_, i) =>
      `<div class="tut-dot ${i === this.tutorialPage ? 'active' : ''}"></div>`
    ).join('');
    document.getElementById('tutNextBtn').textContent =
      this.tutorialPage === this.tutorialPages.length - 1 ? 'Start Playing! ✓' : 'Next →';
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

    // Update answer choice highlight based on current lane
    for (let i = 0; i < 3; i++) {
      document.getElementById('ans' + i).classList.toggle('active', i === game.currentLane);
    }

    let puHTML = '';
    if (game.powerups.shield > 0) puHTML += '<div class="powerup-tag">🛡️ Shield</div>';
    if (game.powerups.slow > 0) puHTML += `<div class="powerup-tag">💊 ${Math.ceil(game.powerups.slow)}s</div>`;
    if (game.powerups.double > 0) puHTML += `<div class="powerup-tag">2× ${Math.ceil(game.powerups.double)}s</div>`;
    if (game.powerups.magnet > 0) puHTML += `<div class="powerup-tag">🧲 ${Math.ceil(game.powerups.magnet)}s</div>`;
    document.getElementById('powerupRow').innerHTML = puHTML;
  }

  // Show answer choices in HTML overlay (not on 3D gates)
  showAnswerChoices(gates) {
    for (let i = 0; i < 3; i++) {
      document.getElementById('ansText' + i).textContent = gates[i].label;
    }
  }

  hideAnswerChoices() {
    for (let i = 0; i < 3; i++) {
      document.getElementById('ansText' + i).textContent = '';
    }
  }

  showBuzzwords(card) {
    document.getElementById('buzzText').textContent = card.bw.join(' • ');
  }

  showFeedback(card, wasCorrect) {
    const fb = document.getElementById('feedbackEl');
    fb.textContent = (wasCorrect ? '✓ ' : '✗ ') + card.ans;
    fb.className = 'show ' + (wasCorrect ? 'ok' : 'bad');
    if (!wasCorrect) {
      const tb = document.getElementById('teachEl');
      tb.textContent = card.tp;
      tb.classList.add('show');
    }
    this.hideAnswerChoices();
  }

  showStudyTeaching(card) {
    const tb = document.getElementById('teachEl');
    tb.textContent = card.tp;
    tb.classList.add('show');
  }

  // ===== COUNTDOWN =====
  countdown(callback) {
    const ovl = document.getElementById('countdownOverlay');
    const num = document.getElementById('countdownNum');
    ovl.classList.add('active');
    let ct = 3;
    num.textContent = ct;
    audio.play('countdown');
    const iv = setInterval(() => {
      ct--;
      if (ct > 0) { num.textContent = ct; audio.play('countdown'); }
      else {
        clearInterval(iv);
        num.textContent = 'GO!';
        setTimeout(() => { ovl.classList.remove('active'); callback(); }, 300);
      }
    }, 500);
  }

  // ===== POST-RUN REVIEW =====
  showPostRun(game) {
    const total = game.correct + game.wrong;
    const acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
    const missed = game.runCards.filter(r => !r.ok);
    let missedHTML = missed.map(r => {
      const c = r.card;
      const whyWrong = (c.ww && c.ww[r.choice]) || '';
      return `<div class="review-card"><h4>❌ ${c.bw.join(' • ')}</h4><div><span class="tag tag-wrong">You: ${r.choice}</span><span class="tag tag-correct">✓ ${c.ans}</span><span class="tag tag-subject">${c.subj}</span></div><p style="margin-top:5px"><strong>Teaching:</strong> ${c.tp}</p>${whyWrong ? `<p><strong>Why "${r.choice}" is wrong:</strong> ${whyWrong}</p>` : ''}</div>`;
    }).join('');
    let priorities = missed.slice(0, 5).map((r, i) =>
      `<div style="padding:3px 0;font-size:12px">${i + 1}. ${r.card.ans} <span style="color:var(--text-muted)">(${r.card.subj})</span></div>`
    ).join('');

    document.getElementById('postRunContent').innerHTML = `
      <div class="post-header"><h2>📋 Case Review</h2><div class="score-big">${game.score}</div><p style="color:var(--text-muted);font-size:12px">Speed: ${game.userSpeed}×</p></div>
      <div class="post-stats"><div class="post-stat"><div class="val" style="color:var(--accent-green)">${acc}%</div><div class="label">Accuracy</div></div><div class="post-stat"><div class="val" style="color:var(--accent-gold)">🪙 ${game.coins}</div><div class="label">Coins</div></div><div class="post-stat"><div class="val">🔥 ${game.bestStreak}</div><div class="label">Streak</div></div></div>
      <div class="post-stats" style="grid-template-columns:1fr 1fr"><div class="post-stat"><div class="val" style="color:var(--accent-green)">${game.correct}</div><div class="label">Correct</div></div><div class="post-stat"><div class="val" style="color:var(--accent-red)">${game.wrong}</div><div class="label">Wrong</div></div></div>
      ${missed.length > 0 ? `<h3 style="margin:14px 0 6px">❌ Missed Cards (${missed.length})</h3>${missedHTML}` : '<h3 style="margin:14px 0 6px;color:var(--accent-green)">🎉 Perfect Run!</h3>'}
      ${priorities ? `<h3 style="margin:14px 0 6px">🎯 Review Priority</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">${priorities}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:14px"><button class="btn btn-green" style="flex:1" id="playAgainBtn">▶ Again</button><button class="btn btn-primary" style="flex:1" id="goHomeBtn">🏠 Home</button></div>
      ${missed.length > 0 ? '<button class="btn btn-outline btn-block" style="margin-top:6px" id="weaknessBtn">🎯 Weakness Mode</button>' : ''}
    `;
    this.show('screenPostRun');
    document.getElementById('goHomeBtn').addEventListener('click', () => this.show('screenHome'));
  }
}

export const ui = new UI();
