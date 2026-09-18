/**
 * ui.js — All screen rendering, HUD, shop, settings, stats, quests,
 * achievements, custom cards, post-run, tutorial, notifications,
 * easter eggs, track name popup, confetti, quick review, calendar,
 * flashcard mode, card browser, profile, how-to-play, end screen fixes.
 *
 * FIXES & NEW FEATURES:
 * - Calendar uses hasOwnProperty for 0% accuracy display
 * - Calendar uses local date keys (not UTC)
 * - Calendar day-of-week alignment fix with placeholder divs
 * - Quest streak indicator below calendar
 * - All-quests-complete date tracking
 * - Anki import container mount point in settings
 * - Confetti triggered on personal best
 * - Speed timer shows live ms during encounter
 * - Speed timer hidden when disabled
 * - Settings reset uses window.location.reload()
 * - Rush vignette has stack-dependent intensity
 * - NEW: Flashcard study mode integration
 * - NEW: Card browser with search/filter/disable
 * - NEW: Profile screen
 * - NEW: How to Play section on home screen
 * - NEW: End screen fixes (report card, collapsed correct answers)
 * - NEW: Countdown fix (1000ms intervals)
 * - NEW: Deselect all fix
 * - NEW: Quest completion indicator on calendar
 * - NEW: Anki import stub
 * - NEW: Card report export
 * - NEW: Exam filter UI
 */
import { SUBJECTS, CARDS, EXAM_FILTERS } from './cards.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { customCards } from './customcards.js';
import { SHOP_ITEMS, QUESTS, ACHIEVEMENTS, CONTINUE_COST } from './game/shopdata.js';
import { CharacterPreview } from './game/preview.js';
import { FlashcardMode } from './game/flashcardmode.js';

function localDateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

class UI {
    constructor() {
        this.characterPreview = null;
        this.titleTapCount = 0;
        this.titleTapTimer = null;
        this.konamiSequence = [];
        this.konamiCode = [38, 38, 40, 40, 37, 39, 37, 39];

        this.tutorialPage = 0;
        this.tutorialPages = [
            { icon: '⚡', title: 'Welcome!', text: 'Buzzword Dash is a fast-paced game that helps you master medical board concepts. See diagnostic buzzwords and run through the correct diagnosis gate!' },
            { icon: '👆', title: 'Move Between Lanes', text: 'Swipe left or right to switch lanes. Each lane has a different diagnosis — pick the one that matches the buzzwords at the top.' },
            { icon: '⬆️', title: 'Jump Over Obstacles', text: 'Swipe up to jump over gurneys, wheelchairs, and other obstacles on the ground.' },
            { icon: '⬇️', title: 'Slide Under Obstacles', text: 'Swipe down to slide under overhead obstacles like MRI tunnels and OR doors.' },
            { icon: '👆👆', title: 'Rush for Bonus Points', text: 'Know the answer? Double-tap (or press Shift) to rush! You\'re propelled through the gate in 0.5s and invulnerable to obstacles during rush!' },
            { icon: '🏎️', title: 'Speed = Points', text: 'Use the speed dial on the home screen to increase game speed. Faster speeds earn more points per correct answer.' },
            { icon: '🔥', title: 'Build Your Streak', text: 'Correct answers build your streak. Every 5 correct increases your score multiplier up to 8×!' },
            { icon: '❤️', title: 'Lives & Hearts', text: 'You start with 3 lives. Wrong answers and hitting obstacles cost a life. When at 1 life, look for heart pickups on the track!' },
            { icon: '🪙', title: 'Collect & Customize', text: 'Grab coins and glowing power-up orbs as you run! Visit the On-Call Locker to preview and equip avatars, hats, trails, clothing, and gear.' },
            { icon: '🏆', title: 'Achievements', text: 'Earn badges by reaching milestones — perfect runs, high streaks, score targets, and more!' },
        ];

        this.homeCharacter = null;
        this.speedDialTapCount = 0;
        this.speedDialTapTimer = null;
        this.vignetteEl = null;

        // NEW: Flashcard mode instance
        this.flashcardMode = new FlashcardMode();

        // NEW: Card browser state
        this.cardBrowserSearch = '';
        this.cardBrowserSubject = '';
        this.cardBrowserExam = '';
        this.cardBrowserFilter = 'all'; // 'all', 'seen', 'unseen', 'disabled'
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
        this.createVignetteOverlay();
        this.renderCalendar();
        // NEW: Render how-to-play section
        this.renderHowToPlay();
        // NEW: Render exam filter
        this.renderExamFilter();
    }

    createVignetteOverlay() {
        this.vignetteEl = document.getElementById('rushVignette');
        if (!this.vignetteEl) {
            this.vignetteEl = document.createElement('div');
            this.vignetteEl.id = 'rushVignette';
            this.vignetteEl.className = 'rush-vignette';
            document.body.appendChild(this.vignetteEl);
        }
    }

    updateRushVignette(rushStacks) {
        if (!this.vignetteEl) return;
        if (rushStacks > 0) {
            this.vignetteEl.classList.add('active');
            var intensity = Math.min(rushStacks, 3);
            var spread = 120 - intensity * 20;
            var alpha = 0.3 + intensity * 0.15;
            this.vignetteEl.style.boxShadow =
                'inset 0 0 ' + spread + 'px ' + (spread / 2) + 'px rgba(255, 100, 0, ' + alpha + ')';
        } else {
            this.vignetteEl.classList.remove('active');
            this.vignetteEl.style.boxShadow = 'none';
        }
    }

    showCoinTrail() {
        var coinCounter = document.getElementById('hudCoins');
        if (!coinCounter) return;
        var dot = document.createElement('div');
        dot.className = 'coin-trail-dot';
        var startX = window.innerWidth / 2;
        var startY = window.innerHeight / 2;
        dot.style.left = startX + 'px';
        dot.style.top = startY + 'px';
        document.body.appendChild(dot);
        var rect = coinCounter.getBoundingClientRect();
        var targetX = rect.left + rect.width / 2;
        var targetY = rect.top + rect.height / 2;
        requestAnimationFrame(function () {
            dot.style.left = targetX + 'px';
            dot.style.top = targetY + 'px';
            dot.style.opacity = '0';
            dot.style.transform = 'translate(-50%, -50%) scale(0.3)';
        });
        setTimeout(function () {
            if (dot.parentNode) dot.parentNode.removeChild(dot);
        }, 350);
    }

    updateSpeedTimer(game) {
        var timerEl = document.getElementById('hudSpeedTimer');
        if (!timerEl) return;
        if (!storage.get('speedTimerEnabled')) {
            timerEl.style.display = 'none';
            return;
        }
        var elapsed = 0;
        if (game.gatesActive && game.encounterStartTime > 0) {
            elapsed = performance.now() - game.encounterStartTime;
        } else {
            elapsed = game.lastEncounterTime || 0;
        }
        timerEl.textContent = '⏱ ' + Math.round(elapsed) + ' ms';
        timerEl.style.display = 'inline-flex';
    }

    // NAVIGATION
    show(screenId) {
        document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
        var el = document.getElementById(screenId);
        if (el) el.classList.add('active');

        if (screenId === 'screenHome') {
            this.renderHome();
            if (this.homeCharacter) this.homeCharacter.startAnimation();
        }
        if (screenId === 'screenStats') this.renderStats();
        if (screenId === 'screenShop') { this.renderShop(); this.startPreview(); }
        if (screenId === 'screenQuests') this.renderQuests();
        if (screenId === 'screenSettings') this.renderSettings();
        if (screenId === 'screenMyCards') this.renderCustomCardList();
        if (screenId === 'screenAchievements') this.renderAchievements();
        // NEW: screens
        if (screenId === 'screenProfile') this.renderProfile();
        if (screenId === 'screenCardBrowser') this.renderCardBrowser();
        if (screenId === 'screenFlashcard') this.renderFlashcardScreen();

        if (screenId !== 'screenShop' && this.characterPreview) {
            this.characterPreview.stopAnimation();
        }
        if (screenId !== 'screenHome' && this.homeCharacter) {
            this.homeCharacter.stopAnimation();
        }
        document.querySelectorAll('.nav-item').forEach(function (n) {
            n.classList.toggle('active', n.dataset.screen === screenId);
        });
    }

    hideAll() {
        document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
        if (this.characterPreview) this.characterPreview.stopAnimation();
        if (this.homeCharacter) this.homeCharacter.stopAnimation();
    }

    bindNavigation() {
        var self = this;
        document.querySelectorAll('.nav-item').forEach(function (item) {
            item.addEventListener('click', function () { self.show(item.dataset.screen); });
        });
        document.querySelectorAll('.back-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { self.show('screenHome'); });
        });
        var settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) settingsBtn.addEventListener('click', function () { self.show('screenSettings'); });
        var shopBtn = document.getElementById('shopBtn');
        if (shopBtn) shopBtn.addEventListener('click', function () { self.show('screenShop'); });
        var questBtn = document.getElementById('questBtn');
        if (questBtn) questBtn.addEventListener('click', function () { self.show('screenQuests'); });
        var achievementsBtn = document.getElementById('achievementsBtn');
        if (achievementsBtn) achievementsBtn.addEventListener('click', function () { self.show('screenAchievements'); });
        var myCardsBtn = document.getElementById('myCardsBtn');
        if (myCardsBtn) myCardsBtn.addEventListener('click', function () { self.show('screenMyCards'); self.renderCustomCardList(); });

        // NEW: Profile button
        var profileBtn = document.getElementById('profileBtn');
        if (profileBtn) profileBtn.addEventListener('click', function () { self.show('screenProfile'); });

        // NEW: Card Browser button
        var cardBrowserBtn = document.getElementById('cardBrowserBtn');
        if (cardBrowserBtn) cardBrowserBtn.addEventListener('click', function () { self.show('screenCardBrowser'); });

        // NEW: Flashcard button
        var flashcardBtn = document.getElementById('flashcardBtn');
        if (flashcardBtn) flashcardBtn.addEventListener('click', function () { self.startFlashcardSession(); });

        var tutorialBtn = document.getElementById('tutorialBtn');
        if (tutorialBtn) tutorialBtn.addEventListener('click', function () { self.showTutorial(); });
        var howToPlayBtn = document.getElementById('howToPlayBtn');
        if (howToPlayBtn) howToPlayBtn.addEventListener('click', function () { self.showTutorial(); });
        var tutNextBtn = document.getElementById('tutNextBtn');
        if (tutNextBtn) tutNextBtn.addEventListener('click', function () { self.tutorialNext(); });
        var tutCloseBtn = document.getElementById('tutCloseBtn');
        if (tutCloseBtn) tutCloseBtn.addEventListener('click', function () {
            document.getElementById('tutorialOverlay').classList.remove('active');
        });
    }

    bindMusicToggle() {
        var btn = document.getElementById('musicToggleBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var playing = audio.toggleMusic();
            btn.textContent = playing ? '🎵 Music: ON' : '🎵 Music: OFF';
        });
        if (storage.get('musicOn')) btn.textContent = '🎵 Music: ON';
    }

    bindEasterEggs() {
        var self = this;
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
                    self.showEasterEggReward('🎮 Konami Code! +1000 coins!');
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

    checkDailyLoginReward() {
        var today = new Date().toDateString();
        var lastLogin = storage.get('lastLoginDate');
        if (lastLogin === today) return;
        storage.set('lastLoginDate', today);
        var yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        var loginStreak = storage.get('loginStreak') || 0;
        if (lastLogin === yesterday.toDateString()) {
            loginStreak++;
        } else if (lastLogin !== today) {
            loginStreak = 1;
        }
        storage.set('loginStreak', loginStreak);
        var rewards = [10, 20, 30, 50, 75, 100, 150, 200];
        var rewardIndex = Math.min(loginStreak - 1, rewards.length - 1);
        var reward = rewards[Math.max(rewardIndex, 0)];
        storage.addCoins(reward);
        var self = this;
        setTimeout(function () {
            var popup = document.createElement('div');
            popup.innerHTML = '<div style="font-size:24px;margin-bottom:6px">👋</div>' +
                '<div style="font-size:15px;font-weight:800;color:var(--accent-cyan)">Welcome back!</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">Day ' + loginStreak + ' streak</div>' +
                '<div style="font-size:16px;font-weight:800;color:var(--accent-gold);margin-top:6px">🪙 +' + reward + ' coins!</div>';
            popup.style.cssText = 'position:fixed;top:30%;left:50%;transform:translateX(-50%);text-align:center;background:rgba(8,12,36,0.95);backdrop-filter:blur(10px);border:2px solid var(--accent-cyan);border-radius:16px;padding:18px 28px;pointer-events:none;z-index:30;transition:all 1.5s ease-out;opacity:1;';
            document.body.appendChild(popup);
            audio.play('coin');
            setTimeout(function () { popup.style.top = '15%'; popup.style.opacity = '0'; }, 2500);
            setTimeout(function () { popup.remove(); self.renderHome(); }, 4000);
        }, 500);
    }

    // CHANGED: Deselect all fix - set to empty array, show note
    bindSubjectControls() {
        var self = this;
        document.getElementById('selectAllSubjects').addEventListener('click', function () {
            storage.set('selectedSubjects', SUBJECTS.slice());
            self.renderSubjects();
        });
        document.getElementById('deselectAllSubjects').addEventListener('click', function () {
            storage.set('selectedSubjects', []);
            self.renderSubjects();
        });
    }

    setupSpeedDial() {
        var dial = document.getElementById('speedDial');
        var val = document.getElementById('speedValue');
        var current = storage.get('userSpeed') || 1;
        dial.value = current;
        val.textContent = current + '×';
        var self = this;
        dial.addEventListener('input', function () {
            var v = parseFloat(dial.value);
            storage.set('userSpeed', v);
            val.textContent = v + '×';
        });
        val.style.cursor = 'pointer';
        val.addEventListener('click', function () {
            self.speedDialTapCount++;
            clearTimeout(self.speedDialTapTimer);
            self.speedDialTapTimer = setTimeout(function () { self.speedDialTapCount = 0; }, 800);
            if (self.speedDialTapCount >= 3) {
                self.speedDialTapCount = 0;
                var enabled = !storage.get('speedTimerEnabled');
                storage.set('speedTimerEnabled', enabled);
                self.showEasterEggReward(enabled ? '⏱ Speed Timer: ON' : '⏱ Speed Timer: OFF');
            }
        });
    }

    renderHome() {
        var homeCoins = document.getElementById('homeCoins');
        var homeBest = document.getElementById('homeBest');
        if (homeCoins) homeCoins.textContent = storage.get('coins');
        if (homeBest) homeBest.textContent = storage.get('bestScore');
        this.renderCalendar();
    }

    // NEW: Render exam filter UI
    renderExamFilter() {
        var container = document.getElementById('examFilterContainer');
        if (!container) return;
        var selectedExams = storage.get('selectedExams') || [];
        var filters = typeof EXAM_FILTERS !== 'undefined' ? EXAM_FILTERS : [];
        if (filters.length === 0) {
            container.innerHTML = '';
            return;
        }
        var self = this;
        var html = '<div class="collapsible-section" style="margin-top:6px">' +
            '<button class="collapsible-toggle" id="examFilterToggle">🎯 Exam Filter <span class="collapse-arrow" id="examFilterArrow">▸</span></button>' +
            '<div class="collapsible-body" id="examFilterBody" style="display:none">' +
            '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">Leave empty for all exams</div>' +
            '<div class="subject-scroll" id="examFilterScroll">' +
            filters.map(function (ex) {
                var sel = selectedExams.indexOf(ex) >= 0 ? 'selected' : '';
                return '<div class="subject-chip ' + sel + '" data-exam="' + ex + '">' + ex + '</div>';
            }).join('') +
            '</div></div></div>';
        container.innerHTML = html;

        var toggle = document.getElementById('examFilterToggle');
        var body = document.getElementById('examFilterBody');
        var arrow = document.getElementById('examFilterArrow');
        if (toggle && body) {
            toggle.addEventListener('click', function () {
                var isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                if (arrow) arrow.classList.toggle('open', !isOpen);
            });
        }

        container.querySelectorAll('[data-exam]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var exams = storage.get('selectedExams') || [];
                var ex = chip.dataset.exam;
                var idx = exams.indexOf(ex);
                if (idx >= 0) exams.splice(idx, 1);
                else exams.push(ex);
                storage.set('selectedExams', exams);
                chip.classList.toggle('selected');
            });
        });
    }
    
    renderAdvancedFilters() {
        var container = document.getElementById('advancedFilterContainer');
        if (!container) return;
        var self = this;

        var QUESTION_TYPES = [
            { id: "buzzword_dx", label: "🩺 Dx" },
            { id: "dx_to_tx", label: "💊 Tx" },
            { id: "dx_to_workup", label: "🔬 Workup" },
            { id: "mechanism", label: "⚙️ Mechanism" },
            { id: "side_effect", label: "⚠️ Side Effect" },
            { id: "lab_dx", label: "🧪 Lab" },
            { id: "pharm", label: "💉 Pharm" },
            { id: "prevention", label: "🛡️ Prevention" },
            { id: "management", label: "📋 Mgmt" }
        ];

        var YEARS = [
            { id: 1, label: "M1" },
            { id: 2, label: "M2" },
            { id: 3, label: "M3" },
            { id: 4, label: "M4" }
        ];

        var selectedTypes = storage.get('selectedQuestionTypes') || [];
        var selectedYears = storage.get('selectedYears') || [];
        var highYieldOnly = storage.get('highYieldOnly') || false;

        var activeCount = selectedTypes.length + selectedYears.length + (highYieldOnly ? 1 : 0);

        var html = '<div class="collapsible-section" style="margin-top:6px">' +
            '<button class="collapsible-toggle" id="advFilterToggle">🔍 Filters ' +
            '<span id="activeFilterCount" style="font-size:10px;color:var(--accent-orange)">' + (activeCount > 0 ? '(' + activeCount + ' active)' : '') + '</span>' +
            ' <span class="collapse-arrow" id="advFilterArrow">▸</span></button>' +
            '<div class="collapsible-body" id="advFilterBody" style="display:none">' +

            '<label style="font-size:11px;font-weight:700;margin-top:8px;display:block">❓ Question Type</label>' +
            '<div style="font-size:9px;color:var(--text-muted);margin-bottom:4px">Leave empty for all types</div>' +
            '<div class="subject-scroll" id="questionTypeScroll">' +
            QUESTION_TYPES.map(function (qt) {
                var sel = selectedTypes.indexOf(qt.id) >= 0 ? 'selected' : '';
                return '<div class="subject-chip ' + sel + '" data-qtype="' + qt.id + '">' + qt.label + '</div>';
            }).join('') +
            '</div>' +

            '<label style="font-size:11px;font-weight:700;margin-top:8px;display:block">🎓 Year</label>' +
            '<div class="subject-scroll" id="yearFilterScroll">' +
            YEARS.map(function (yr) {
                var sel = selectedYears.indexOf(yr.id) >= 0 ? 'selected' : '';
                return '<div class="subject-chip ' + sel + '" data-year="' + yr.id + '">' + yr.label + '</div>';
            }).join('') +
            '</div>' +

            '<div class="setting-row" style="padding:8px 0">' +
            '<div style="font-size:12px">🔥 High-Yield Only</div>' +
            '<div class="toggle ' + (highYieldOnly ? 'on' : '') + '" id="highYieldToggle"></div>' +
            '</div>' +

            '<button class="btn btn-outline btn-sm" id="resetFiltersBtn" style="margin-top:4px;font-size:10px">Reset All Filters</button>' +

            '</div></div>';

        container.innerHTML = html;

        var toggle = document.getElementById('advFilterToggle');
        var body = document.getElementById('advFilterBody');
        var arrow = document.getElementById('advFilterArrow');
        if (toggle && body) {
            toggle.addEventListener('click', function () {
                var isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                if (arrow) arrow.classList.toggle('open', !isOpen);
            });
        }

        container.querySelectorAll('[data-qtype]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                if (storage.toggleQuestionTypeFilter) {
                    storage.toggleQuestionTypeFilter(chip.dataset.qtype);
                } else {
                    storage.toggleArrayItem('selectedQuestionTypes', chip.dataset.qtype);
                }
                chip.classList.toggle('selected');
                self._updateFilterCount();
            });
        });

        container.querySelectorAll('[data-year]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var yearNum = parseInt(chip.dataset.year);
                if (storage.toggleYearFilter) {
                    storage.toggleYearFilter(yearNum);
                } else {
                    storage.toggleArrayItem('selectedYears', yearNum);
                }
                chip.classList.toggle('selected');
                self._updateFilterCount();
            });
        });

        var hyToggle = document.getElementById('highYieldToggle');
        if (hyToggle) {
            hyToggle.addEventListener('click', function () {
                var newVal = !storage.get('highYieldOnly');
                storage.set('highYieldOnly', newVal);
                hyToggle.classList.toggle('on');
                self._updateFilterCount();
            });
        }

        var resetBtn = document.getElementById('resetFiltersBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                storage.set('selectedQuestionTypes', []);
                storage.set('selectedYears', []);
                storage.set('highYieldOnly', false);
                storage.set('selectedExams', []);
                self.renderExamFilter();
                self.renderAdvancedFilters();
            });
        }
    }

    _updateFilterCount() {
        var selectedTypes = storage.get('selectedQuestionTypes') || [];
        var selectedYears = storage.get('selectedYears') || [];
        var highYieldOnly = storage.get('highYieldOnly') || false;
        var activeCount = selectedTypes.length + selectedYears.length + (highYieldOnly ? 1 : 0);
        var countEl = document.getElementById('activeFilterCount');
        if (countEl) {
            countEl.textContent = activeCount > 0 ? '(' + activeCount + ' active)' : '';
        }
    }
    renderSubjects() {
        var selected = storage.get('selectedSubjects');
        var container = document.getElementById('subjectScroll');
        var self = this;

        // CHANGED: Show note when empty (all active)
        var noteEl = document.getElementById('subjectNote');
        if (noteEl) {
            if (selected.length === 0) {
                noteEl.textContent = 'All subjects active (none specifically selected)';
                noteEl.style.display = 'block';
            } else {
                noteEl.style.display = 'none';
            }
        }

        container.innerHTML = SUBJECTS.map(function (s) {
            var sel = selected.indexOf(s) >= 0 ? 'selected' : '';
            // If empty array, show all as visually selected
            if (selected.length === 0) sel = 'selected';
            var ss = storage.getSubjectStat(s);
            var total = ss.correct + ss.wrong;
            var mastered = total >= 50 && (ss.correct / total) >= 0.8;
            var badge = mastered ? ' ⭐' : '';
            return '<div class="subject-chip ' + sel + '" data-subject="' + s + '">' + s + badge + '</div>';
        }).join('');

        var longPressTimer = null;
        container.querySelectorAll('.subject-chip').forEach(function (chip) {
            var subj = chip.dataset.subject;
            chip.addEventListener('click', function () {
                if (longPressTimer === 'fired') { longPressTimer = null; return; }
                var sel = storage.get('selectedSubjects');
                var idx = sel.indexOf(subj);
                if (idx >= 0) {
                    sel.splice(idx, 1);
                } else {
                    sel.push(subj);
                }
                storage.set('selectedSubjects', sel);
                self.renderSubjects();
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

    startPreview() {
        if (!this.characterPreview) {
            this.characterPreview = new CharacterPreview();
            this.characterPreview.init('characterPreviewContainer');
        }
        this.characterPreview.clearPreview();
        this.characterPreview.resize();
        this.characterPreview.startAnimation();
    }

    renderShop() {
        var self = this;
        document.getElementById('shopCoins').textContent = storage.get('coins');
        var renderGroup = function (type, title) {
            var items = SHOP_ITEMS.filter(function (i) { return i.type === type; });
            if (type === 'skin') {
                items = items.filter(function (i) {
                    if (i.id === 'avatar_golden' && !storage.hasAchievement('ach_golden_doctor')) return false;
                    return true;
                });
            }
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
                    var tryOnHTML = '';
                    if (type !== 'trail') {
                        tryOnHTML = '<button class="btn btn-outline btn-sm" data-preview="' + item.id + '" data-prevslot="' + type + '" style="font-size:10px;padding:4px 8px;margin-left:4px;">👁</button>';
                    }
                    return '<div class="shop-item ' + (isEquipped ? 'equipped' : '') + '">' +
                        '<div style="width:36px;height:36px;border-radius:8px;background:' + colorHex + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">' + iconText + '</div>' +
                        '<div style="flex:1"><div style="font-size:13px;font-weight:700">' + item.name + '</div></div>' +
                        '<div style="display:flex;align-items:center;gap:2px">' + tryOnHTML + btnHTML + '</div></div>';
                }).join('');
        };
        document.getElementById('shopItems').innerHTML =
            renderGroup('skin', '👕 Avatars') +
            renderGroup('clothing', '🥼 Clothing') +
            renderGroup('hat', '🧢 Headwear') +
            renderGroup('trail', '✨ Trails') +
            renderGroup('gear', '🩺 Gear');

        document.querySelectorAll('[data-buy]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (storage.buyItem(btn.dataset.buy, parseInt(btn.dataset.price))) {
                    audio.play('coin');
                    self.renderShop();
                    if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
                } else { alert('Not enough coins!'); }
            });
        });
        document.querySelectorAll('[data-equip]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                storage.equipItem(btn.dataset.equip, btn.dataset.slot);
                self.renderShop();
                if (self.characterPreview) { self.characterPreview.clearPreview(); self.characterPreview.rebuildCharacter(); }
                if (self.onEquipChange) self.onEquipChange();
            });
        });
        document.querySelectorAll('[data-preview]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (self.characterPreview) {
                    self.characterPreview.previewItem(btn.dataset.preview, btn.dataset.prevslot);
                }
            });
        });
    }

    onEquipChange = null;

    // CHANGE 2: renderQuests now checks if all quests are complete
    renderQuests() {
        document.getElementById('questList').innerHTML = QUESTS.map(function (q) {
            var progress = Math.min(storage.getQuestProgress(q.id), q.target);
            var pct = Math.round(progress / q.target * 100);
            return '<div class="quest-item"><div class="quest-title">' + q.title + ': ' + q.desc + '</div><div class="quest-bar"><div class="quest-fill" style="width:' + pct + '%"></div></div><div class="quest-reward">' + progress + '/' + q.target + ' — 🪙 ' + q.reward + '</div></div>';
        }).join('');

        // Check if ALL quests are complete today and mark the date
        var allComplete = true;
        for (var qi = 0; qi < QUESTS.length; qi++) {
            var qProgress = storage.getQuestProgress(QUESTS[qi].id);
            if (qProgress < QUESTS[qi].target) {
                allComplete = false;
                break;
            }
        }
        if (allComplete && storage.markQuestsComplete) {
            storage.markQuestsComplete(localDateKey(new Date()));
        }
    }

    renderAchievements() {
        var container = document.getElementById('achievementsList');
        if (!container) return;
        var unlocked = storage.get('achievements');
        container.innerHTML = ACHIEVEMENTS.map(function (ach) {
            var isUnlocked = unlocked.indexOf(ach.id) >= 0;
            return '<div class="achievement-item ' + (isUnlocked ? 'unlocked' : 'locked') + '">' +
                '<div class="achievement-icon">' + (isUnlocked ? ach.icon : '🔒') + '</div>' +
                '<div class="achievement-info"><div class="achievement-name">' + ach.name + '</div>' +
                '<div class="achievement-desc">' + ach.desc + '</div></div></div>';
        }).join('');
    }

    // CHANGE 3: renderSettings now includes ankiImportContainer mount point
    renderSettings() {
        var self = this;
        document.getElementById('settingsContent').innerHTML =
            '<div class="setting-row"><div style="font-size:13px">🎵 Music</div><div class="toggle ' + (storage.get('musicOn') ? 'on' : '') + '" data-setting="musicOn"></div></div>' +
            '<div class="setting-row"><div style="font-size:13px">🌙 Night Shift</div><div class="toggle ' + (storage.get('nightMode') ? 'on' : '') + '" data-setting="nightMode"></div></div>' +
            '<div class="setting-row"><div style="font-size:13px">🗣 Text-to-Speech</div><div class="toggle ' + (storage.get('ttsEnabled') ? 'on' : '') + '" data-setting="ttsEnabled"></div></div>' +
            '<div class="setting-row"><div style="font-size:13px">🔊 Master Volume</div><input type="range" min="0" max="1" step="0.1" value="' + storage.get('masterVolume') + '" data-range="masterVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>' +
            '<div class="setting-row"><div style="font-size:13px">🎵 SFX Volume</div><input type="range" min="0" max="1" step="0.1" value="' + storage.get('sfxVolume') + '" data-range="sfxVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>' +
            '<div class="setting-row"><div style="font-size:13px">🎵 Music Volume</div><input type="range" min="0" max="1" step="0.1" value="' + (storage.get('musicVolume') || 0.5) + '" data-range="musicVolume" style="width:100px;accent-color:var(--accent-cyan)"></div>' +
            '<div class="setting-row"><div style="font-size:13px">🔄 Card Freshness Weight</div><input type="range" min="1" max="10" step="1" value="' + (storage.get('cardFreshnessWeight') || 5) + '" data-range="cardFreshnessWeight" style="width:100px;accent-color:var(--accent-cyan)"><span id="freshnessVal" style="font-size:12px;color:var(--accent-gold);min-width:24px;text-align:center">' + (storage.get('cardFreshnessWeight') || 5) + '</span></div>' +
            '<div class="setting-row"><div style="font-size:13px">❓ How to Play</div><button class="btn btn-outline btn-sm" id="settingsTutorialBtn">Tutorial</button></div>' +
            // Card report export
            '<div class="setting-row"><div style="font-size:13px">📤 Export Card Reports</div><button class="btn btn-outline btn-sm" id="exportReportsBtn">Export</button></div>' +
            // CHANGE 3: Anki import container mount point
            '<div id="ankiImportContainer"></div>' +
            '<div style="margin-top:20px"><button class="btn btn-red btn-block" id="resetBtn">🗑 Reset All Progress</button></div>';

        document.querySelectorAll('[data-setting]').forEach(function (toggle) {
            toggle.addEventListener('click', function () {
                var key = toggle.dataset.setting;
                var newVal = !storage.get(key);
                storage.set(key, newVal);
                toggle.classList.toggle('on');
                if (key === 'nightMode') {
                    self.applySettings();
                    if (self.onNightModeChange) self.onNightModeChange();
                }
                if (key === 'musicOn') {
                    if (newVal) { audio.startMusic(); } else { audio.stopMusic(); }
                }
            });
        });
        document.querySelectorAll('[data-range]').forEach(function (range) {
            range.addEventListener('input', function () {
                var key = range.dataset.range;
                var val = parseFloat(range.value);
                storage.set(key, val);
                if (key === 'masterVolume' || key === 'sfxVolume' || key === 'musicVolume') {
                    audio.updateMusicVolume();
                }
                if (key === 'cardFreshnessWeight') {
                    var valEl = document.getElementById('freshnessVal');
                    if (valEl) valEl.textContent = val;
                }
            });
        });

        var resetBtn = document.getElementById('resetBtn');
        if (resetBtn) resetBtn.addEventListener('click', function () {
            if (confirm('Reset ALL progress? This cannot be undone.')) {
                storage.reset();
                window.location.reload();
            }
        });
        var settingsTutBtn = document.getElementById('settingsTutorialBtn');
        if (settingsTutBtn) settingsTutBtn.addEventListener('click', function () { self.showTutorial(); });

        // Export card reports
        var exportReportsBtn = document.getElementById('exportReportsBtn');
        if (exportReportsBtn) exportReportsBtn.addEventListener('click', function () {
            self.exportCardReports();
        });

        this.applySettings();
    }

    // Export card reports as JSON download
    exportCardReports() {
        var reports = storage.get('cardReports') || [];
        if (reports.length === 0) {
            alert('No card reports to export.');
            return;
        }
        // Enrich with card content
        var allCards = CARDS.concat(customCards.getAll());
        var enriched = reports.map(function (r) {
            var card = null;
            for (var i = 0; i < allCards.length; i++) {
                if (allCards[i].id === r.cardId) { card = allCards[i]; break; }
            }
            return {
                cardId: r.cardId,
                cardContent: card ? { buzzwords: card.bw, answer: card.ans, subject: card.subj } : null,
                reason: r.reason,
                text: r.text,
                date: r.date
            };
        });
        var json = JSON.stringify(enriched, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'buzzword-dash-card-reports.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    onNightModeChange = null;

    applySettings() {
        document.body.classList.toggle('night-mode', storage.get('nightMode'));
    }

    renderStats() {
        var tc = storage.get('totalCorrect');
        var tw = storage.get('totalWrong');
        var te = storage.get('totalEncounters');
        var acc = (tc + tw) > 0 ? Math.round(tc / (tc + tw) * 100) : 0;

        var subjectHTML = '';
        var self = this;
        SUBJECTS.forEach(function (s) {
            var ss = storage.getSubjectStat(s);
            var total = ss.correct + ss.wrong;
            if (total === 0) return;
            var a = Math.round(ss.correct / total * 100);
            var color = a >= 70 ? 'var(--accent-green)' : 'var(--accent-red)';
            var mastered = total >= 50 && a >= 80;
            var badge = mastered ? ' ⭐' : '';
            subjectHTML += '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.03);cursor:pointer" data-stat-subject="' + s + '"><span style="font-size:12px">' + s + badge + '</span><span style="font-size:12px;font-weight:700;color:' + color + '">' + a + '% (' + total + ')</span></div>';
        });

        var allCards = CARDS.concat(customCards.getAll());
        var weakCards = allCards.map(function (c) {
            var s = storage.getCardStat(c.id);
            if (s.seen < 2) return null;
            return { card: c, accuracy: s.correct / s.seen, seen: s.seen };
        }).filter(function (x) { return x !== null; }).sort(function (a, b) { return a.accuracy - b.accuracy; }).slice(0, 5);

        var weakHTML = weakCards.length > 0
            ? weakCards.map(function (w) {
                return '<div style="padding:3px 0;font-size:11px;cursor:pointer" data-weak-card="' + w.card.id + '"><span style="color:var(--accent-red);font-weight:700">' + Math.round(w.accuracy * 100) + '%</span> — ' + w.card.ans + ' <span style="color:var(--text-muted)">(' + w.card.subj + ')</span></div>';
            }).join('')
            : '<p style="font-size:11px;color:var(--text-muted)">Play more to see weak areas.</p>';

        document.getElementById('statsContent').innerHTML =
            '<div class="post-stats"><div class="post-stat"><div class="val">' + te + '</div><div class="label">Cards</div></div><div class="post-stat"><div class="val" style="color:var(--accent-green)">' + tc + '</div><div class="label">Correct</div></div><div class="post-stat"><div class="val" style="color:var(--accent-red)">' + tw + '</div><div class="label">Wrong</div></div></div>' +
            '<div class="post-stats" style="grid-template-columns:1fr 1fr"><div class="post-stat"><div class="val">' + acc + '%</div><div class="label">Accuracy</div></div><div class="post-stat"><div class="val">' + storage.get('bestScore') + '</div><div class="label">Best Score</div></div></div>' +
            '<h3 style="margin:14px 0 6px;font-size:14px">📊 By Subject</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + (subjectHTML || '<p style="font-size:11px;color:var(--text-muted)">No data yet.</p>') + '</div>' +
            '<h3 style="margin:14px 0 6px;font-size:14px">🎯 Weakest Concepts</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + weakHTML + '</div>';

        // Bind click handlers for subject stats
        document.querySelectorAll('[data-stat-subject]').forEach(function (el) {
            el.addEventListener('click', function () {
                var subj = el.dataset.statSubject;
                self.startFlashcardSession([subj]);
            });
        });
    }

    // =============================================
    // Flashcard Mode
    // =============================================

    startFlashcardSession(subjects) {
        var subjs = subjects || storage.get('selectedSubjects');
        if (!subjs || subjs.length === 0) subjs = SUBJECTS.slice();
        var examFilters = storage.get('selectedExams') || [];
        this.flashcardMode.start(subjs, examFilters, 20);
        if (!this.flashcardMode.sessionActive) {
            alert('No cards available for the selected filters.');
            return;
        }
        this.show('screenFlashcard');
        this.renderFlashcardScreen();
    }

    renderFlashcardScreen() {
        var container = document.getElementById('flashcardContent');
        if (!container) return;
        var self = this;
        var fm = this.flashcardMode;

        if (!fm.sessionActive) {
            container.innerHTML = '<div style="text-align:center;padding:30px"><p style="color:var(--text-muted)">No active flashcard session.</p>' +
                '<button class="btn btn-green btn-block" id="fcStartBtn" style="margin-top:12px">📖 Start Flashcard Session</button>' +
                '<button class="btn btn-outline btn-block" id="fcBackBtn" style="margin-top:6px">🏠 Back to Home</button></div>';
            var startBtn = document.getElementById('fcStartBtn');
            if (startBtn) startBtn.addEventListener('click', function () { self.startFlashcardSession(); });
            var backBtn = document.getElementById('fcBackBtn');
            if (backBtn) backBtn.addEventListener('click', function () { self.show('screenHome'); });
            return;
        }

        if (fm.isComplete()) {
            this.renderFlashcardSummary();
            return;
        }

        var progress = fm.getProgress();
        var cardData = fm.getCurrentCard();
        var cardHTML = fm.showCard();

        var html = '<div style="text-align:center;margin-bottom:10px">' +
            '<div style="font-size:11px;color:var(--text-muted)">Card ' + progress.current + ' of ' + progress.total + '</div>' +
            '<div class="quest-bar" style="margin:6px 0"><div class="quest-fill" style="width:' + Math.round((progress.current - 1) / progress.total * 100) + '%"></div></div>' +
            '<div style="font-size:10px;color:var(--text-muted)">✅ ' + progress.correctSoFar + ' | ❌ ' + progress.wrongSoFar + '</div>' +
            '</div>' +
            '<div style="background:var(--bg-card-solid);border-radius:var(--radius-lg);padding:20px;text-align:center;border:var(--border-glow)">' +
            cardHTML;

        if (!fm.revealed) {
            html += '<button class="btn btn-primary btn-block" id="fcRevealBtn" style="margin-top:16px">Show Answer</button>';
        } else {
            html += '<div style="margin-top:12px">' + fm.revealAnswer() + '</div>' +
                '<div style="display:flex;gap:8px;margin-top:16px">' +
                '<button class="btn btn-green" id="fcGotItBtn" style="flex:1">✅ Got it</button>' +
                '<button class="btn btn-red" id="fcMissedBtn" style="flex:1">❌ Missed it</button>' +
                '</div>';
        }

        html += '</div>' +
            '<button class="btn btn-outline btn-block" id="fcEndBtn" style="margin-top:10px">✕ End Session</button>';

        container.innerHTML = html;

        if (!fm.revealed) {
            var revealBtn = document.getElementById('fcRevealBtn');
            if (revealBtn) revealBtn.addEventListener('click', function () {
                fm.revealAnswer();
                self.renderFlashcardScreen();
            });
        } else {
            var gotItBtn = document.getElementById('fcGotItBtn');
            if (gotItBtn) gotItBtn.addEventListener('click', function () {
                fm.markCorrect();
                self.renderFlashcardScreen();
            });
            var missedBtn = document.getElementById('fcMissedBtn');
            if (missedBtn) missedBtn.addEventListener('click', function () {
                fm.markIncorrect();
                self.renderFlashcardScreen();
            });
        }

        var endBtn = document.getElementById('fcEndBtn');
        if (endBtn) endBtn.addEventListener('click', function () {
            fm.end();
            self.show('screenHome');
        });
    }

    renderFlashcardSummary() {
        var container = document.getElementById('flashcardContent');
        if (!container) return;
        var self = this;
        var fm = this.flashcardMode;
        var summary = fm.getSummary();
        var missed = fm.getMissedCards();

        var missedHTML = missed.length > 0 ? missed.map(function (r) {
            return '<div class="review-card"><h4>❌ ' + r.card.bw.join(' • ') + '</h4>' +
                '<div><span class="tag tag-correct">✓ ' + r.card.ans + '</span><span class="tag tag-subject">' + r.card.subj + '</span></div>' +
                '<p style="margin-top:4px;font-size:11px;color:var(--text-secondary)">' + r.card.tp + '</p></div>';
        }).join('') : '';

        container.innerHTML = '<div style="text-align:center;padding:16px 0"><h2>📋 Session Complete</h2>' +
            '<div class="post-stats" style="margin:10px 0">' +
            '<div class="post-stat"><div class="val" style="color:var(--accent-green)">' + summary.correct + '</div><div class="label">Correct</div></div>' +
            '<div class="post-stat"><div class="val" style="color:var(--accent-red)">' + summary.wrong + '</div><div class="label">Missed</div></div>' +
            '<div class="post-stat"><div class="val">' + summary.accuracy + '%</div><div class="label">Accuracy</div></div>' +
            '</div></div>' +
            (missedHTML ? '<h3 style="margin:10px 0 6px">❌ Missed Cards</h3>' + missedHTML : '<h3 style="margin:10px 0;color:var(--accent-green)">🎉 Perfect Session!</h3>') +
            '<div style="display:flex;gap:6px;margin-top:14px">' +
            (missed.length > 0 ? '<button class="btn btn-primary" id="fcReviewMissedBtn" style="flex:1">🔄 Review Missed</button>' : '') +
            '<button class="btn btn-green" id="fcNewSessionBtn" style="flex:1">📖 New Session</button>' +
            '</div>' +
            '<button class="btn btn-outline btn-block" id="fcHomeBtn" style="margin-top:6px">🏠 Home</button>';

        if (missed.length > 0) {
            var reviewBtn = document.getElementById('fcReviewMissedBtn');
            if (reviewBtn) reviewBtn.addEventListener('click', function () {
                fm.reviewMissed();
                self.renderFlashcardScreen();
            });
        }
        var newBtn = document.getElementById('fcNewSessionBtn');
        if (newBtn) newBtn.addEventListener('click', function () {
            fm.end();
            self.startFlashcardSession();
        });
        var homeBtn = document.getElementById('fcHomeBtn');
        if (homeBtn) homeBtn.addEventListener('click', function () {
            fm.end();
            self.show('screenHome');
        });
    }

    // =============================================
    // Card Browser
    // =============================================

    renderCardBrowser() {
        var container = document.getElementById('cardBrowserContent');
        if (!container) return;
        var self = this;
        var allCards = CARDS.concat(customCards.getAll());
        var disabledCards = storage.get('disabledCards') || [];

        // Build filter UI
        var filterHTML = '<div style="margin-bottom:10px">' +
            '<input type="text" id="cbSearch" placeholder="🔍 Search buzzwords, answers, teaching points..." style="width:100%;padding:10px;border-radius:var(--radius-sm);background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:13px;margin-bottom:6px" value="' + (this.cardBrowserSearch || '') + '">' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">' +
            '<select id="cbSubjectFilter" style="padding:6px;border-radius:8px;background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:11px">' +
            '<option value="">All Subjects</option>' +
            SUBJECTS.map(function (s) { return '<option value="' + s + '"' + (self.cardBrowserSubject === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
            '</select>' +
            '<select id="cbStatusFilter" style="padding:6px;border-radius:8px;background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:11px">' +
            '<option value="all"' + (self.cardBrowserFilter === 'all' ? ' selected' : '') + '>All Cards</option>' +
            '<option value="seen"' + (self.cardBrowserFilter === 'seen' ? ' selected' : '') + '>Seen</option>' +
            '<option value="unseen"' + (self.cardBrowserFilter === 'unseen' ? ' selected' : '') + '>Unseen</option>' +
            '<option value="disabled"' + (self.cardBrowserFilter === 'disabled' ? ' selected' : '') + '>Disabled</option>' +
            '</select>' +
            '</div></div>';

        // Apply filters
        var filtered = allCards;
        if (this.cardBrowserSubject) {
            filtered = filtered.filter(function (c) { return c.subj === self.cardBrowserSubject; });
        }
        if (this.cardBrowserSearch) {
            var q = this.cardBrowserSearch.toLowerCase();
            filtered = filtered.filter(function (c) {
                var text = (c.bw.join(' ') + ' ' + c.ans + ' ' + c.tp).toLowerCase();
                return text.indexOf(q) >= 0;
            });
        }
        if (this.cardBrowserFilter === 'seen') {
            filtered = filtered.filter(function (c) { return storage.getCardStat(c.id).seen > 0; });
        } else if (this.cardBrowserFilter === 'unseen') {
            filtered = filtered.filter(function (c) { return storage.getCardStat(c.id).seen === 0; });
        } else if (this.cardBrowserFilter === 'disabled') {
            filtered = filtered.filter(function (c) { return disabledCards.indexOf(c.id) >= 0; });
        }

        // Limit display for performance
        var displayCards = filtered.slice(0, 50);

        var cardsHTML = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Showing ' + displayCards.length + ' of ' + filtered.length + ' cards</div>';
        cardsHTML += displayCards.map(function (c) {
            var stat = storage.getCardStat(c.id);
            var isDisabled = disabledCards.indexOf(c.id) >= 0;
            var accuracy = stat.seen > 0 ? Math.round(stat.correct / stat.seen * 100) : -1;
            var accColor = accuracy >= 70 ? 'var(--accent-green)' : accuracy >= 0 ? 'var(--accent-red)' : 'var(--text-muted)';
            var missedFreq = stat.wrong > 2;
            var diffStars = '';
            if (c.baseDifficulty) {
                for (var i = 0; i < c.baseDifficulty; i++) diffStars += '⭐';
            }

            return '<div class="review-card" style="border-left-color:' + (isDisabled ? 'var(--text-muted)' : missedFreq ? 'var(--accent-red)' : 'var(--accent-blue)') + ';opacity:' + (isDisabled ? '0.5' : '1') + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:start">' +
                '<div style="flex:1"><h4 style="font-size:12px">' + c.bw.join(' • ') + '</h4>' +
                '<div><span class="tag tag-correct">' + c.ans + '</span><span class="tag tag-subject">' + c.subj + '</span>' +
                (diffStars ? '<span style="font-size:9px;margin-left:4px">' + diffStars + '</span>' : '') +
                '</div>' +
                (c.exams ? '<div style="margin-top:2px">' + c.exams.map(function (e) { return '<span style="font-size:8px;color:var(--text-muted);margin-right:3px">' + e + '</span>'; }).join('') + '</div>' : '') +
                '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' +
                (accuracy >= 0 ? '<span style="color:' + accColor + '">' + accuracy + '% (' + stat.seen + ' seen)</span>' : 'Not seen yet') +
                '</div></div>' +
                '<button class="btn btn-outline btn-sm" data-toggle-card="' + c.id + '" style="font-size:9px;padding:4px 8px">' + (isDisabled ? '✅ Enable' : '🚫 Disable') + '</button>' +
                '</div></div>';
        }).join('');

        container.innerHTML = filterHTML + cardsHTML;

        // Bind search/filter
        var searchInput = document.getElementById('cbSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                self.cardBrowserSearch = searchInput.value;
                self.renderCardBrowser();
            });
        }
        var subjectSelect = document.getElementById('cbSubjectFilter');
        if (subjectSelect) {
            subjectSelect.addEventListener('change', function () {
                self.cardBrowserSubject = subjectSelect.value;
                self.renderCardBrowser();
            });
        }
        var statusSelect = document.getElementById('cbStatusFilter');
        if (statusSelect) {
            statusSelect.addEventListener('change', function () {
                self.cardBrowserFilter = statusSelect.value;
                self.renderCardBrowser();
            });
        }

        // Bind toggle buttons
        document.querySelectorAll('[data-toggle-card]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var cardId = btn.dataset.toggleCard;
                if (storage.isCardDisabled) {
                    storage.toggleCardDisabled(cardId);
                } else {
                    var disabled = storage.get('disabledCards') || [];
                    var idx = disabled.indexOf(cardId);
                    if (idx >= 0) disabled.splice(idx, 1);
                    else disabled.push(cardId);
                    storage.set('disabledCards', disabled);
                }
                self.renderCardBrowser();
            });
        });
    }

    // =============================================
    // Profile Screen
    // =============================================

    renderProfile() {
        var container = document.getElementById('profileContent');
        if (!container) return;
        var self = this;

        var profileName = storage.get('profileName') || '';
        var profilePicture = storage.get('profilePicture') || 'avatar_intern';
        var profileVisible = storage.get('profileVisible') || false;
        var selectedBadges = storage.get('selectedBadges') || [];
        var totalCards = storage.get('totalCardsStudied') || 0;
        var totalCorrect = storage.get('totalCorrect') || 0;
        var totalWrong = storage.get('totalWrong') || 0;
        var bestScore = storage.get('bestScore') || 0;
        var bestStreak = storage.get('bestStreak') || 0;
        var totalPlayTime = storage.get('totalPlayTime') || 0;
        var dailyStreak = storage.get('dailyStreak') || 0;
        var achievements = storage.get('achievements') || [];
        var totalAcc = (totalCorrect + totalWrong) > 0 ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0;
        var playTimeMin = Math.round(totalPlayTime / 60);

        var badgeHTML = '';
        if (achievements.length > 0) {
            badgeHTML = '<h4 style="font-size:12px;color:var(--text-secondary);margin:10px 0 6px">Selected Badges (tap to toggle, max 6)</h4>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px">';
            for (var i = 0; i < ACHIEVEMENTS.length; i++) {
                var ach = ACHIEVEMENTS[i];
                if (achievements.indexOf(ach.id) < 0) continue;
                var isSelected = selectedBadges.indexOf(ach.id) >= 0;
                badgeHTML += '<div class="subject-chip ' + (isSelected ? 'selected' : '') + '" data-badge="' + ach.id + '" style="cursor:pointer">' + ach.icon + ' ' + ach.name + '</div>';
            }
            badgeHTML += '</div>';
        }

        container.innerHTML =
            '<div style="text-align:center;margin-bottom:14px">' +
            '<div style="font-size:48px;margin-bottom:6px">👤</div>' +
            '<input type="text" id="profileNameInput" placeholder="Enter display name" value="' + profileName + '" style="width:80%;max-width:250px;padding:8px;border-radius:var(--radius-sm);background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:14px;text-align:center">' +
            '</div>' +
            '<div class="post-stats" style="grid-template-columns:1fr 1fr 1fr">' +
            '<div class="post-stat"><div class="val">' + totalCards + '</div><div class="label">Cards Studied</div></div>' +
            '<div class="post-stat"><div class="val">' + totalAcc + '%</div><div class="label">Accuracy</div></div>' +
            '<div class="post-stat"><div class="val">' + bestScore + '</div><div class="label">Best Score</div></div>' +
            '</div>' +
            '<div class="post-stats" style="grid-template-columns:1fr 1fr 1fr">' +
            '<div class="post-stat"><div class="val">🔥 ' + bestStreak + '</div><div class="label">Best Streak</div></div>' +
            '<div class="post-stat"><div class="val">' + playTimeMin + 'm</div><div class="label">Play Time</div></div>' +
            '<div class="post-stat"><div class="val">📅 ' + dailyStreak + '</div><div class="label">Daily Streak</div></div>' +
            '</div>' +
            badgeHTML +
            '<div class="setting-row" style="margin-top:14px"><div style="font-size:13px">👁 Profile Visible</div><div class="toggle ' + (profileVisible ? 'on' : '') + '" id="profileVisibleToggle"></div></div>' +
            '<button class="btn btn-primary btn-block" id="profileSaveBtn" style="margin-top:10px">💾 Save Profile</button>';

        // Bind name save
        var saveBtn = document.getElementById('profileSaveBtn');
        if (saveBtn) saveBtn.addEventListener('click', function () {
            var name = document.getElementById('profileNameInput').value.trim();
            storage.set('profileName', name);
            self.showEasterEggReward('Profile saved!');
        });

        // Bind visibility toggle
        var visToggle = document.getElementById('profileVisibleToggle');
        if (visToggle) visToggle.addEventListener('click', function () {
            var newVal = !storage.get('profileVisible');
            storage.set('profileVisible', newVal);
            visToggle.classList.toggle('on');
        });

        // Bind badge selection
        document.querySelectorAll('[data-badge]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var badgeId = chip.dataset.badge;
                var badges = storage.get('selectedBadges') || [];
                var idx = badges.indexOf(badgeId);
                if (idx >= 0) {
                    badges.splice(idx, 1);
                } else {
                    if (badges.length >= 6) {
                        alert('Maximum 6 badges. Remove one first.');
                        return;
                    }
                    badges.push(badgeId);
                }
                storage.set('selectedBadges', badges);
                chip.classList.toggle('selected');
            });
        });
    }

    // =============================================
    // How to Play Section
    // =============================================

    renderHowToPlay() {
        var container = document.getElementById('howToPlaySection');
        if (!container) return;
        // How to Play is now a button in the quick action grid
        // that calls showTutorial(). This section is kept empty.
        container.innerHTML = '';
    }

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
        if (editId) { customCards.update(editId, cardData); }
        else { customCards.add(cardData); storage.unlockAchievement('ach_custom_card'); }
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
        document.getElementById('tutNextBtn').textContent = this.tutorialPage === this.tutorialPages.length - 1 ? 'Start Playing! ✓' : 'Next →';
    }

    tutorialNext() {
        this.tutorialPage++;
        if (this.tutorialPage >= this.tutorialPages.length) {
            document.getElementById('tutorialOverlay').classList.remove('active');
        } else { this.renderTutorialPage(); }
    }

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

        for (var i = 0; i < 3; i++) {
            document.getElementById('ans' + i).classList.toggle('active', i === game.currentLane);
        }

        var puHTML = '';
        if (game.powerups.shield > 0) puHTML += '<div class="powerup-tag">🛡️ Shield</div>';
        if (game.powerups.magnet > 0) puHTML += '<div class="powerup-tag">🧲 ' + Math.ceil(game.powerups.magnet) + 's</div>';
        if (game.powerups.double > 0) puHTML += '<div class="powerup-tag">2× ' + Math.ceil(game.powerups.double) + 's</div>';
        if (game.powerups.autoPilot > 0) puHTML += '<div class="powerup-tag">🤖 ' + game.autoPilotGatesLeft + ' gates</div>';
        if (game.powerups.scoreFrenzy > 0) puHTML += '<div class="powerup-tag">💎 ' + Math.ceil(game.powerups.scoreFrenzy) + 's</div>';
        if (game.rushStacks > 0) puHTML += '<div class="powerup-tag" style="color:var(--accent-orange);border-color:rgba(255,136,0,0.4)">⚡ Rush ×' + game.rushStacks + '</div>';
        document.getElementById('powerupRow').innerHTML = puHTML;

        this.updateRushVignette(game.rushStacks);
        this.updateSpeedTimer(game);
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
        // Show revenge card banner if applicable
        var banner = document.getElementById('revengeCardBanner');
        if (banner) {
            var stat = storage.getCardStat(card.id);
            if (stat.wrong > 0 && stat.wrong > stat.correct) {
                banner.classList.add('show');
                setTimeout(function () { banner.classList.remove('show'); }, 2000);
            }
        }
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

    showTrackName(skinName) {
        var overlay = document.getElementById('trackNameOverlay');
        if (!overlay) return;
        var nameEl = document.getElementById('trackNameText');
        if (nameEl) nameEl.textContent = skinName;
        overlay.classList.add('show');
        setTimeout(function () { overlay.classList.remove('show'); }, 2500);
    }

    showScorePopup(points) {
        var popup = document.createElement('div');
        popup.textContent = '+' + points;
        popup.style.cssText = 'position:fixed;top:35%;left:50%;transform:translateX(-50%);font-size:24px;font-weight:900;color:var(--accent-gold);text-shadow:0 0 10px rgba(255,215,64,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
        document.body.appendChild(popup);
        requestAnimationFrame(function () { popup.style.top = '20%'; popup.style.opacity = '0'; });
        setTimeout(function () { popup.remove(); }, 800);
    }

    showCoinBurst() {
        for (var i = 0; i < 6; i++) {
            var particle = document.createElement('div');
            var angle = (i / 6) * Math.PI * 2;
            var dist = 30 + Math.random() * 20;
            particle.textContent = '✦';
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
        this.showCoinTrail();
    }

    showStreakMilestone(streak, multiplier) {
        var popup = document.createElement('div');
        popup.textContent = '🔥 ' + streak + ' STREAK! ×' + multiplier;
        popup.style.cssText = 'position:fixed;top:40%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:900;color:var(--accent-cyan);text-shadow:0 0 12px rgba(24,255,255,0.5);pointer-events:none;z-index:6;transition:all 1s ease-out;opacity:1;';
        document.body.appendChild(popup);
        requestAnimationFrame(function () { popup.style.top = '25%'; popup.style.opacity = '0'; });
        setTimeout(function () { popup.remove(); }, 1000);
    }

    showPowerupNotification(type) {
        var names = {
            shield: '🛡️ Shield!',
            magnet: '🧲 Coin Magnet!',
            double: '2× Score!',
            autoPilot: '🤖 Auto-Pilot!',
            scoreFrenzy: '💎 Score Frenzy!'
        };
        var popup = document.createElement('div');
        popup.textContent = names[type] || type;
        popup.style.cssText = 'position:fixed;top:45%;left:50%;transform:translateX(-50%);font-size:18px;font-weight:900;color:var(--accent-purple);text-shadow:0 0 10px rgba(179,136,255,0.5);pointer-events:none;z-index:6;transition:all 0.8s ease-out;opacity:1;';
        document.body.appendChild(popup);
        requestAnimationFrame(function () { popup.style.top = '30%'; popup.style.opacity = '0'; });
        setTimeout(function () { popup.remove(); }, 800);
    }

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

    showContinuePrompt(cost, onContinue, onDecline) {
        var overlay = document.getElementById('continueOverlay');
        var costEl = document.getElementById('continueCost');
        var currentCoins = document.getElementById('continueCoins');
        var continueBtn = document.getElementById('continueYesBtn');
        var declineBtn = document.getElementById('continueNoBtn');
        costEl.textContent = cost;
        currentCoins.textContent = storage.get('coins');
        overlay.classList.add('active');
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

    // CHANGED: Countdown uses 1000ms intervals (actual seconds)
    countdown(callback) {
        var ovl = document.getElementById('countdownOverlay');
        var num = document.getElementById('countdownNum');
        var tip = document.getElementById('countdownTip');
        ovl.classList.add('active');
        var ct = 3;
        num.textContent = ct;
        audio.play('countdown');

        if (tip) {
            var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            tip.textContent = isTouch
                ? '💡 Know the answer? Double-tap to RUSH through! ⚡ Faster = more points'
                : '💡 Know the answer? Press SHIFT or SPACE to RUSH! ⚡ Faster = more points';
            tip.style.opacity = '1';
        }

        var iv = setInterval(function () {
            ct--;
            if (ct > 0) { num.textContent = ct; audio.play('countdown'); }
            else {
                clearInterval(iv);
                num.textContent = 'GO!';
                if (tip) tip.style.opacity = '0';
                setTimeout(function () { ovl.classList.remove('active'); callback(); }, 500);
            }
        }, 1000);
    }

    showPostRun(game) {
        var total = game.correct + game.wrong;
        var acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
        var missed = game.runCards.filter(function (r) { return !r.ok; });

        var missedHTML = missed.map(function (r) {
            var c = r.card;
            var whyWrong = (c.ww && c.ww[r.choice]) || '';
            var exceptionHTML = '';
            if (c.exception) {
                exceptionHTML = '<p style="margin-top:4px"><strong>⚠️ Exception:</strong> ' + c.exception + '</p>';
            }
            return '<div class="review-card"><h4>❌ ' + c.bw.join(' • ') + '</h4>' +
                '<div><span class="tag tag-wrong">You: ' + r.choice + '</span>' +
                '<span class="tag tag-correct">✓ ' + c.ans + '</span>' +
                '<span class="tag tag-subject">' + c.subj + '</span></div>' +
                '<p style="margin-top:5px"><strong>📖 Rule:</strong> ' + c.tp + '</p>' +
                exceptionHTML +
                (whyWrong ? '<p style="margin-top:4px"><strong>Why "' + r.choice + '" is wrong:</strong> ' + whyWrong + '</p>' : '') +
                '<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="UI_reportCard(\'' + c.id + '\')">📋 Report Card Issue</button>' +
                '</div>';
        }).join('');

        // Correct answers section collapsed by default
        var correctAll = game.runCards.filter(function (r) { return r.ok; });
        var correctSample = correctAll.slice(0, 5).map(function (r) {
            var c = r.card;
            var exceptionHTML = '';
            if (c.exception) {
                exceptionHTML = '<p style="margin-top:4px;font-size:10px"><strong>⚠️ Exception:</strong> ' + c.exception + '</p>';
            }
            return '<div class="review-card" style="border-left-color:var(--accent-green)"><h4>✓ ' + c.bw.join(' • ') + '</h4>' +
                '<div><span class="tag tag-correct">' + c.ans + '</span><span class="tag tag-subject">' + c.subj + '</span></div>' +
                '<p style="margin-top:4px;font-size:10px;color:var(--text-muted)">' + c.tp + '</p>' +
                exceptionHTML + '</div>';
        }).join('');

        var priorities = missed.slice(0, 5).map(function (r, i) {
            return '<div style="padding:3px 0;font-size:12px">' + (i + 1) + '. ' + r.card.ans + ' <span style="color:var(--text-muted)">(' + r.card.subj + ')</span></div>';
        }).join('');

        var skinInfo = game.currentSkin ? ' • Track: ' + game.currentSkin.name : '';
        var continuedInfo = game.continued ? ' (continued)' : '';

        var goldenNotice = '';
        if (game.wrong === 0 && game.correct >= 20 && storage.hasAchievement('ach_golden_doctor')) {
            goldenNotice = '<div style="text-align:center;padding:12px;margin:10px 0;background:linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,170,0,0.1));border:2px solid var(--accent-gold);border-radius:12px"><div style="font-size:24px">🏆</div><div style="font-size:14px;font-weight:800;color:var(--accent-gold)">Golden Doctor Unlocked!</div><div style="font-size:11px;color:var(--text-secondary)">Perfect run with 20+ correct! Check the Locker.</div></div>';
        }

        document.getElementById('postRunContent').innerHTML =
            '<div class="post-header"><h2>📋 Case Review</h2><div class="score-big">' + game.score + '</div>' +
            '<p style="color:var(--text-muted);font-size:12px">Speed: ' + game.userSpeed + '×' + skinInfo + continuedInfo + '</p></div>' +
            goldenNotice +
            '<div class="post-stats">' +
            '<div class="post-stat"><div class="val" style="color:var(--accent-green)">' + acc + '%</div><div class="label">Accuracy</div></div>' +
            '<div class="post-stat"><div class="val" style="color:var(--accent-gold)">🪙 ' + game.coins + '</div><div class="label">Coins</div></div>' +
            '<div class="post-stat"><div class="val">🔥 ' + game.bestStreak + '</div><div class="label">Streak</div></div>' +
            '</div>' +
            '<div class="post-stats" style="grid-template-columns:1fr 1fr">' +
            '<div class="post-stat"><div class="val" style="color:var(--accent-green)">' + game.correct + '</div><div class="label">Correct</div></div>' +
            '<div class="post-stat"><div class="val" style="color:var(--accent-red)">' + game.wrong + '</div><div class="label">Wrong</div></div>' +
            '</div>' +
            (missed.length > 0 ? '<h3 style="margin:14px 0 6px">❌ Missed Cards (' + missed.length + ')</h3>' + missedHTML : '<h3 style="margin:14px 0 6px;color:var(--accent-green)">🎉 Perfect Run!</h3>') +
            (priorities ? '<h3 style="margin:14px 0 6px">🎯 Review Priority</h3><div style="background:var(--bg-card);border-radius:10px;padding:10px">' + priorities + '</div>' : '') +
            // Correct answers collapsed by default
            (correctSample ? '<div class="collapsible-section" style="margin:14px 0 6px"><button class="collapsible-toggle" id="correctToggle" style="font-size:13px">✅ Correct Answers (' + correctAll.length + ') <span class="collapse-arrow" id="correctArrow">▸</span></button><div id="correctBody" style="display:none">' + correctSample + '</div></div>' : '') +
            '<div style="display:flex;gap:6px;margin-top:14px">' +
            '<button class="btn btn-green" style="flex:1" id="playAgainBtn">▶ Again</button>' +
            '<button class="btn btn-primary" style="flex:1" id="goHomeBtn">🏠 Home</button>' +
            '</div>' +
            (missed.length > 0 ? '<button class="btn btn-outline btn-block" style="margin-top:6px" id="weaknessBtn">🎯 Weakness Mode</button>' : '') +
            (missed.length > 0 ? '<button class="btn btn-outline btn-block" style="margin-top:6px" id="quickReviewBtn">📝 Quick Review</button>' : '') +
            '<button class="btn btn-outline btn-block" style="margin-top:6px" id="shareBtn">📤 Share Score</button>';

        this.show('screenPostRun');

        // Bind correct answers toggle
        var correctToggle = document.getElementById('correctToggle');
        var correctBody = document.getElementById('correctBody');
        var correctArrow = document.getElementById('correctArrow');
        if (correctToggle && correctBody) {
            correctToggle.addEventListener('click', function () {
                var isOpen = correctBody.style.display !== 'none';
                correctBody.style.display = isOpen ? 'none' : 'block';
                if (correctArrow) correctArrow.classList.toggle('open', !isOpen);
            });
        }

        var timerEl = document.getElementById('hudSpeedTimer');
        if (timerEl) timerEl.style.display = 'none';

        if (game.isNewBest) {
            this.showConfetti();
        }

        var self = this;
        document.getElementById('goHomeBtn').addEventListener('click', function () { self.show('screenHome'); });

        var shareBtn = document.getElementById('shareBtn');
        if (shareBtn) {
            shareBtn.addEventListener('click', function () { self.shareScore(game); });
        }

        var qrBtn = document.getElementById('quickReviewBtn');
        if (qrBtn) {
            var missedForReview = game.runCards.filter(function (r) { return !r.ok; });
            var uiRef = this;
            qrBtn.addEventListener('click', function () { uiRef.showQuickReview(missedForReview); });
        }

        var totalForCal = game.correct + game.wrong;
        if (totalForCal > 0) {
            var calData = storage.get('calendarData') || {};
            var todayKey = localDateKey(new Date());
            calData[todayKey] = Math.round(game.correct / totalForCal * 100);
            storage.set('calendarData', calData);
        }

        this.updateRushVignette(0);
    }

    showConfetti() {
        var colors = ['#ff3355', '#00ff88', '#ffcc00', '#44aaff', '#bb66ff', '#ff44aa'];
        for (var i = 0; i < 40; i++) {
            var piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = (10 + Math.random() * 80) + '%';
            piece.style.top = '-10px';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = (Math.random() * 0.5) + 's';
            piece.style.animationDuration = (1 + Math.random() * 1) + 's';
            document.body.appendChild(piece);
            setTimeout(function (el) { if (el.parentNode) el.parentNode.removeChild(el); }, 2500, piece);
        }
        var banner = document.createElement('div');
        banner.className = 'new-best-banner';
        banner.textContent = '🏆 NEW BEST!';
        document.body.appendChild(banner);
        setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 2500);
    }

    showQuickReview(missedCards) {
        if (!missedCards || missedCards.length === 0) return;
        var overlay = document.getElementById('quickReviewOverlay');
        if (!overlay) return;
        var idx = 0;
        var cards = missedCards;
        function showCard() {
            var qrCounter = document.getElementById('qrCounter');
            var qrBuzz = document.getElementById('qrBuzzwords');
            var qrAnswer = document.getElementById('qrAnswer');
            var qrTeaching = document.getElementById('qrTeaching');
            var qrDivider = document.getElementById('qrDivider');
            var qrReveal = document.getElementById('qrRevealBtn');
            var qrNext = document.getElementById('qrNextBtn');
            if (!qrCounter || !qrBuzz) return;
            var r = cards[idx];
            qrCounter.textContent = (idx + 1) + ' / ' + cards.length;
            qrBuzz.textContent = r.card.bw.join(' • ');
            if (qrAnswer) qrAnswer.textContent = '✓ ' + r.card.ans;
            if (qrTeaching) qrTeaching.textContent = r.card.tp;
            if (qrDivider) qrDivider.style.display = 'none';
            if (qrReveal) qrReveal.style.display = 'inline-flex';
            if (qrNext) qrNext.style.display = 'none';
        }
        overlay.classList.add('active');
        showCard();
        var revealBtn = document.getElementById('qrRevealBtn');
        var nextBtn = document.getElementById('qrNextBtn');
        var closeBtn = document.getElementById('qrCloseBtn');
        if (revealBtn) {
            revealBtn.onclick = function () {
                var qrDivider = document.getElementById('qrDivider');
                if (qrDivider) qrDivider.style.display = 'block';
                revealBtn.style.display = 'none';
                if (nextBtn) nextBtn.style.display = 'inline-flex';
            };
        }
        if (nextBtn) {
            nextBtn.onclick = function () {
                idx++;
                if (idx >= cards.length) { overlay.classList.remove('active'); }
                else { showCard(); }
            };
        }
        if (closeBtn) {
            closeBtn.onclick = function () { overlay.classList.remove('active'); };
        }
    }

    // CHANGE 1: Calendar with day-of-week alignment fix + quest streak summary
    renderCalendar() {
        var grid = document.getElementById('calendarGrid');
        if (!grid) return;
        var calData = storage.get('calendarData') || {};
        var questDates = storage.get('questCompletionDates') || {};
        var today = new Date();
        var startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 27);
        grid.innerHTML = '';

        // Add empty placeholder divs to align with day-of-week headers (S M T W T F S)
        var startDayOfWeek = startDate.getDay(); // 0=Sun, 1=Mon, etc.
        for (var p = 0; p < startDayOfWeek; p++) {
            var placeholder = document.createElement('div');
            placeholder.className = 'calendar-day';
            placeholder.style.opacity = '0';
            placeholder.style.pointerEvents = 'none';
            grid.appendChild(placeholder);
        }

        for (var i = 0; i < 28; i++) {
            var d = new Date(startDate);
            d.setDate(d.getDate() + i);
            var key = localDateKey(d);
            var day = document.createElement('div');
            day.className = 'calendar-day';
            if (Object.prototype.hasOwnProperty.call(calData, key)) {
                if (calData[key] >= 70) day.classList.add('played-great');
                else if (calData[key] >= 40) day.classList.add('played-ok');
                else day.classList.add('played-bad');
            }
            // Quest completion star
            if (questDates[key]) {
                day.textContent = '⭐';
                day.style.fontSize = '8px';
                day.style.display = 'flex';
                day.style.alignItems = 'center';
                day.style.justifyContent = 'center';
            }
            if (localDateKey(d) === localDateKey(today)) day.classList.add('today');
            grid.appendChild(day);
        }

        // Quest streak summary below calendar
        var streakContainer = document.getElementById('questStreakSummary');
        if (!streakContainer) {
            streakContainer = document.createElement('div');
            streakContainer.id = 'questStreakSummary';
            streakContainer.style.cssText = 'font-size:11px;color:var(--accent-gold);text-align:center;margin-top:6px;font-weight:700;';
            grid.parentNode.appendChild(streakContainer);
        }

        // Calculate consecutive quest completion streak ending today
        var questStreak = 0;
        var checkDate = new Date(today);
        for (var qs = 0; qs < 365; qs++) {
            var qKey = localDateKey(checkDate);
            if (questDates[qKey]) {
                questStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        if (questStreak > 0) {
            streakContainer.textContent = '🌟 Quest Streak: ' + questStreak + ' day' + (questStreak !== 1 ? 's' : '') + '!';
            streakContainer.style.display = 'block';
        } else {
            streakContainer.style.display = 'none';
        }
    }

    shareScore(game) {
        var total = game.correct + game.wrong;
        var acc = total > 0 ? Math.round(game.correct / total * 100) : 0;
        var skinName = game.currentSkin ? game.currentSkin.name : 'Unknown';
        var text = '⚡ Buzzword Dash ⚡\n' +
            '🏆 Score: ' + game.score + '\n' +
            '✅ Accuracy: ' + acc + '%\n' +
            '🔥 Streak: ' + game.bestStreak + '\n' +
            '🪙 Coins: ' + game.coins + '\n' +
            '💊 Speed: ' + game.userSpeed + '×\n' +
            '🌍 Track: ' + skinName + '\n' +
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

// Global function for card reporting (replaces flagging)
window.UI_reportCard = function (cardId) {
    var reasons = ['incorrect info', 'ambiguous', 'outdated', 'poor distractor', 'other'];
    var reason = prompt(
        'Why are you reporting this card?\n\n' +
        'Options:\n' +
        reasons.map(function (r, i) { return '- ' + r; }).join('\n')
    );
    if (reason) {
        var text = prompt('Additional details (optional):') || '';
        if (storage.addCardReport) {
            storage.addCardReport(cardId, reason, text);
        } else {
            var reports = storage.get('cardReports') || [];
            reports.push({ cardId: cardId, reason: reason, text: text, date: Date.now() });
            storage.set('cardReports', reports);
        }
        alert('Card reported — thank you for helping improve the game!');
    }
};

export var ui = new UI();
