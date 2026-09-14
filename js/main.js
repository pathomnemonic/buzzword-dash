/**
 * main.js — Initialization and wiring
 *
 * All features:
 * - Button bindings for new HTML structure (.btn-play, .mode-btn)
 * - Collapsible subject toggle
 * - Persistent bottom nav show/hide during gameplay
 * - Home character fullscreen scene using game renderer
 * - Music auto-start on first interaction
 * - First-run onboarding flow
 * - Multiplayer UI wiring (PeerJS)
 * - All game callbacks wired
 */

import { game } from './game/engine.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { CARDS } from './cards.js';
import { customCards } from './customcards.js';
import { HomeCharacter } from './game/homecharacter.js';

// ===== GLOBAL FUNCTIONS FOR DYNAMIC HTML ONCLICK =====

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
        flags.push({ cardId: cardId, reason: reason, date: Date.now() });
        storage.set('flags', flags);
        alert('Card flagged \u2014 thank you for helping improve the game!');
    }
};

// ===== HOME CHARACTER =====

var homeCharacter = null;

function initHomeCharacter() {
    homeCharacter = new HomeCharacter();
    homeCharacter.init(game.renderer);
    ui.homeCharacter = homeCharacter;
    homeCharacter.startAnimation();
}

// ===== MODE STARTER =====

function startMode(mode) {
    if (mode === 'daily' && storage.get('dailyDone')) {
        alert('Daily round already completed today! Come back tomorrow.');
        return;
    }
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

    // Stop home scene, hide nav, start game
    if (homeCharacter) homeCharacter.stopAnimation();
    showBottomNav(false);

    game.start(mode);
    ui.hideAll();
    ui.showHud();

    if (game.currentSkin) {
        audio.startAmbient(game.currentSkin.name);
    }

    ui.countdown(function () {
        game.go();
    });
}

// ===== BOTTOM NAV VISIBILITY =====

function showBottomNav(visible) {
    var nav = document.getElementById('bottomNav');
    if (nav) {
        if (visible) {
            nav.classList.remove('hidden');
        } else {
            nav.classList.add('hidden');
        }
    }
}

// ===== COLLAPSIBLE SECTIONS =====

function setupCollapsibles() {
    var subjectToggle = document.getElementById('subjectToggle');
    var subjectBody = document.getElementById('subjectBody');
    var subjectArrow = document.getElementById('subjectArrow');

    if (subjectToggle && subjectBody) {
        subjectToggle.addEventListener('click', function () {
            var isOpen = subjectBody.style.display !== 'none';
            subjectBody.style.display = isOpen ? 'none' : 'block';
            if (subjectArrow) {
                subjectArrow.classList.toggle('open', !isOpen);
            }
        });
    }
}

// ===== FIRST-RUN ONBOARDING =====

function showOnboarding() {
    var overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;
    var pages = [
        { icon: '\u26A1', title: 'Welcome to Buzzword Dash!', text: 'See medical buzzwords, then swipe into the correct diagnosis gate to score points!', hand: '\uD83D\uDC46' },
        { icon: '\uD83D\uDC46', title: 'Swipe to Move', text: 'Swipe left/right to switch lanes. Swipe up to jump, down to slide. Double-tap to rush for bonus points!', hand: '\uD83D\uDC48\uD83D\uDC49' },
        { icon: '\uD83C\uDFC6', title: 'Build Your Streak!', text: 'Correct answers build your streak and multiplier. Collect coins, unlock avatars, and climb the leaderboard!', hand: '' }
    ];
    var currentPage = 0;

    function renderPage() {
        var p = pages[currentPage];
        var icon = document.getElementById('obIcon');
        var title = document.getElementById('obTitle');
        var text = document.getElementById('obText');
        var hand = document.getElementById('obHand');
        var dots = document.getElementById('obDots');
        var btn = document.getElementById('obNextBtn');
        if (icon) icon.textContent = p.icon;
        if (title) title.textContent = p.title;
        if (text) text.textContent = p.text;
        if (hand) { hand.textContent = p.hand; hand.style.display = p.hand ? 'inline-block' : 'none'; }
        if (dots) {
            dots.innerHTML = pages.map(function (_, i) {
                return '<div class="tut-dot ' + (i === currentPage ? 'active' : '') + '"></div>';
            }).join('');
        }
        if (btn) btn.textContent = currentPage === pages.length - 1 ? 'Let\'s Go! \u2713' : 'Next \u2192';
    }

    overlay.classList.add('active');
    renderPage();

    var btn = document.getElementById('obNextBtn');
    if (btn) {
        btn.addEventListener('click', function () {
            currentPage++;
            if (currentPage >= pages.length) {
                overlay.classList.remove('active');
                storage.set('firstRunComplete', true);
            } else {
                renderPage();
            }
        });
    }
}

// ===== MAIN INITIALIZATION =====

function init() {
    storage.load();
    storage.checkDailyReset();
    game.init();
    ui.init();

    // Initialize home character (uses game's renderer for fullscreen background)
    initHomeCharacter();

    // Setup collapsible sections
    setupCollapsibles();

    // First-run onboarding
    if (!storage.get('firstRunComplete')) {
        showOnboarding();
    }

    // ===== WIRE GAME -> UI CALLBACKS =====

    game.onEncounterStart = function (card, gates) {
        ui.showBuzzwords(card);
        ui.showAnswerChoices(gates);
    };

    game.onEncounterResolve = function (card, wasCorrect) {
        ui.showFeedback(card, wasCorrect);
        if (game.mode === 'study' && wasCorrect) {
            ui.showStudyTeaching(card);
        }
    };

    game.onRunEnd = function () {
        ui.hideHud();
        ui.hideAnswerChoices();
        audio.stopAmbient();

        // Show bottom nav again
        showBottomNav(true);

        // Restart home character background
        if (homeCharacter) homeCharacter.startAnimation();

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

    game.onHudUpdate = function () {
        ui.updateHud(game);
    };

    game.onScorePopup = function (points) {
        ui.showScorePopup(points);
        ui.showCoinBurst();
    };

    game.onStreakMilestone = function (streak, multiplier) {
        ui.showStreakMilestone(streak, multiplier);
    };

    game.onPowerupCollected = function (type) {
        ui.showPowerupNotification(type);
        ui.showPowerupGlow(type);
    };

    game.onAchievementUnlocked = function (achievementIds) {
        ui.showAchievementNotification(achievementIds);
    };

    game.onContinuePrompt = function (cost) {
        ui.showContinuePrompt(
            cost,
            function () {
                var success = game.doContinue();
                if (success) {
                    ui.showHud();
                } else {
                    game.endRun();
                }
            },
            function () {
                game.endRun();
            }
        );
    };

    game.onSkinSelected = function (skinName) {
        ui.showTrackName(skinName);
    };

    // Equipment changed: rebuild game player + home character
    ui.onEquipChange = function () {
        game.buildPlayer();
        if (homeCharacter) homeCharacter.rebuildCharacter();
    };

    ui.onNightModeChange = function () {
        game.updateNightMode();
    };

    // ===== BIND PLAY BUTTON (the big green one) =====

    var playBtn = document.querySelector('.btn-play');
    if (playBtn) {
        playBtn.addEventListener('click', function () {
            var mode = this.dataset.mode || 'endless';
            startMode(mode);
        });
    }

    // ===== BIND SECONDARY MODE BUTTONS =====

    document.querySelectorAll('.mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var mode = this.dataset.mode;
            if (mode) startMode(mode);
        });
    });

    // ===== ALSO BIND OLD .mode-card FOR BACKWARD COMPAT =====

    document.querySelectorAll('.mode-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var mode = this.dataset.mode;
            if (mode) startMode(mode);
        });
    });

    // ===== MULTIPLAYER BUTTON =====

    var mpBtn = document.getElementById('multiplayerBtn');
    if (mpBtn) {
        mpBtn.addEventListener('click', function () {
            var overlay = document.getElementById('multiplayerOverlay');
            var content = document.getElementById('mpContent');
            if (!overlay || !content) return;
            overlay.classList.add('active');
            content.innerHTML =
                '<button class="btn btn-green btn-block" id="mpHostBtn">\uD83C\uDFAE Host Game</button>' +
                '<div style="text-align:center;margin:8px 0;color:var(--text-muted)">\u2014 or \u2014</div>' +
                '<input type="text" id="mpJoinCode" placeholder="Enter room code" style="width:100%;padding:10px;border-radius:var(--radius-sm);background:rgba(30,15,70,0.6);color:#fff;border:1px solid rgba(187,102,255,0.15);font-size:16px;text-align:center;letter-spacing:4px;margin-bottom:8px;text-transform:uppercase">' +
                '<button class="btn btn-primary btn-block" id="mpJoinBtn">Join Game</button>';

            document.getElementById('mpHostBtn').addEventListener('click', async function () {
                var mp = await import('./multiplayer.js');
                await mp.multiplayer.init();
                content.innerHTML = '<div class="mp-status">Creating room...</div>';
                mp.multiplayer.hostGame(function (code) {
                    content.innerHTML =
                        '<div class="mp-status">Waiting for opponent...</div>' +
                        '<div class="mp-room-code">' + code + '</div>' +
                        '<div class="mp-status">Share this code with a friend</div>';
                });
                mp.multiplayer.onConnected = function () {
                    content.innerHTML = '<div class="mp-status" style="color:var(--accent-green)">\u2705 Opponent connected!</div>' +
                        '<div class="mp-status">Start a run to begin the match.</div>';
                };
                mp.multiplayer.onError = function (err) {
                    content.innerHTML = '<div class="mp-status" style="color:var(--accent-red)">\u274C ' + err + '</div>' +
                        '<button class="btn btn-outline btn-block" onclick="document.getElementById(\'multiplayerOverlay\').classList.remove(\'active\')">Close</button>';
                };
            });

            document.getElementById('mpJoinBtn').addEventListener('click', async function () {
                var code = document.getElementById('mpJoinCode').value.trim();
                if (!code || code.length < 4) { alert('Enter a valid room code'); return; }
                var mp = await import('./multiplayer.js');
                await mp.multiplayer.init();
                content.innerHTML = '<div class="mp-status">Connecting to ' + code.toUpperCase() + '...</div>';
                mp.multiplayer.joinGame(code, function () {
                    // Connection attempt started
                });
                mp.multiplayer.onConnected = function () {
                    content.innerHTML = '<div class="mp-status" style="color:var(--accent-green)">\u2705 Connected!</div>' +
                        '<div class="mp-status">Start a run to begin the match.</div>';
                };
                mp.multiplayer.onError = function (err) {
                    content.innerHTML = '<div class="mp-status" style="color:var(--accent-red)">\u274C ' + err + '</div>' +
                        '<button class="btn btn-outline btn-block" onclick="document.getElementById(\'multiplayerOverlay\').classList.remove(\'active\')">Close</button>';
                };
            });
        });
    }
    var mpCloseBtn = document.getElementById('mpCloseBtn');
    if (mpCloseBtn) {
        mpCloseBtn.addEventListener('click', function () {
            var overlay = document.getElementById('multiplayerOverlay');
            if (overlay) overlay.classList.remove('active');
        });
    }

    // ===== BIND PAUSE / RESUME / END RUN =====

    document.getElementById('pauseBtn').addEventListener('click', function () {
        game.togglePause();
    });
    document.getElementById('resumeBtn').addEventListener('click', function () {
        game.resume();
    });
    document.getElementById('endRunBtn').addEventListener('click', function () {
        audio.stopAmbient();
        showBottomNav(true);
        if (homeCharacter) homeCharacter.startAnimation();
        game.endRun();
    });

    // ===== MUSIC AUTO-START (now on by default) =====

    document.addEventListener('click', function startMusicOnce() {
        if (storage.get('musicOn')) {
            audio.startMusic();
        }
        document.removeEventListener('click', startMusicOnce);
    }, { once: true });

    // ===== PREVENT PULL-TO-REFRESH =====

    document.addEventListener('touchmove', function (e) {
        if (game.running) e.preventDefault();
    }, { passive: false });

    // ===== RETROACTIVE ACHIEVEMENT CHECK =====

    storage.checkAchievements(null);
}

// ===== START =====

window.addEventListener('DOMContentLoaded', init);
