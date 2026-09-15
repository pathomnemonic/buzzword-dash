/**
 * main.js — Initialization and wiring
 *
 * All features through Final Phase + all bug fixes + NEW parallel model features:
 * - Button bindings for new HTML structure (.btn-play, .mode-btn)
 * - Collapsible subject toggle
 * - Persistent bottom nav show/hide during gameplay
 * - Home character fullscreen scene using game renderer
 * - Music auto-start on first interaction
 * - First-run onboarding flow
 * - Multiplayer UI wiring with full game integration
 * - All game callbacks wired
 * - Removed duplicate startAmbient call
 * - Multiplayer: sends game state, encounter results, end-run
 * - Multiplayer: displays opponent HUD, match result messages
 *
 * NEW:
 * - Flashcard mode screen wiring
 * - Card browser screen wiring
 * - Profile screen wiring
 * - How to Play section rendering
 * - Exam filter UI wiring
 * - Map transition callback (audio crossfade)
 * - Exam monster callbacks
 * - Heart pickup callbacks
 * - New audio events (heart, monsterClose, monsterConsume, faceplant, etc.)
 * - Countdown fix (1000ms instead of 500ms — handled in ui.js)
 * - Deselect-all fix (empty subjects = all subjects — handled in gates.js)
 * - Play time tracking via storage.addPlayTime() and storage.addCardsStudied()
 * - Multiplayer mode selection UI using MP_MODES
 * - Card reporting (Report Card Issue) wired in post-run
 * - CARDS exported to window for multiplayer seeded card order
 */

import { game } from './game/engine.js';
import { ui } from './ui.js';
import { storage } from './storage.js';
import { audio } from './audio.js';
import { CARDS } from './cards.js';
import { customCards } from './customcards.js';
import { HomeCharacter } from './game/homecharacter.js';
import { FlashcardMode } from './game/flashcardmode.js';

// ===== EXPOSE CARDS FOR MULTIPLAYER SEEDED CARD ORDER =====
// multiplayer.js getSeededCardOrder() needs access to CARDS at runtime
window.__BUZZWORD_CARDS = CARDS;
window.__BUZZWORD_CUSTOM_CARDS = customCards.getAll();

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
        'Why are you reporting this card?\n\n' +
        'Options:\n' +
        '- incorrect info\n' +
        '- ambiguous\n' +
        '- poor distractor\n' +
        '- outdated\n' +
        '- other'
    );
    if (reason) {
        // Use new storage method if available, fallback to flags array
        if (storage.addCardReport) {
            storage.addCardReport(cardId, reason, '');
        } else {
            var flags = storage.get('flags');
            flags.push({ cardId: cardId, reason: reason, date: Date.now() });
            storage.set('flags', flags);
        }
        alert('Card reported \u2014 thank you for helping improve the game!');
    }
};

// ===== HOME CHARACTER =====

var homeCharacter = null;

// ===== FLASHCARD MODE =====

var flashcardMode = null;

// ===== MULTIPLAYER STATE =====

var multiplayerClient = null;
var multiplayerLastStateSend = 0;
var multiplayerMatchStarted = false;
var multiplayerOpponentFinal = null;

// ===== RUN TIMING =====

var runStartTime = 0;

// ===== MULTIPLAYER HELPERS =====

function updateOpponentHud(state) {
    var hud = document.getElementById('opponentHud');
    if (!hud) return;

    hud.style.display = 'flex';

    var score = document.getElementById('opponentScore');
    var streak = document.getElementById('opponentStreak');
    var correct = document.getElementById('opponentCorrect');
    var wrong = document.getElementById('opponentWrong');

    if (score) score.textContent = state.score || 0;
    if (streak) streak.textContent = state.streak || 0;
    if (correct) correct.textContent = state.correct || 0;
    if (wrong) wrong.textContent = state.wrong || 0;
}

function hideOpponentHud() {
    var hud = document.getElementById('opponentHud');
    if (hud) hud.style.display = 'none';
}

function showMultiplayerMessage(message, color) {
    var popup = document.createElement('div');
    popup.textContent = message;
    popup.style.cssText =
        'position:fixed;top:18%;left:50%;transform:translateX(-50%);' +
        'z-index:40;padding:12px 20px;border-radius:14px;' +
        'background:rgba(10,5,30,0.94);border:2px solid ' +
        (color || 'var(--accent-cyan)') + ';color:#fff;' +
        'font-size:14px;font-weight:800;text-align:center;' +
        'pointer-events:none;transition:opacity .4s ease;';

    document.body.appendChild(popup);

    setTimeout(function () {
        popup.style.opacity = '0';
    }, 1800);

    setTimeout(function () {
        popup.remove();
    }, 2300);
}

function scheduleVersusStart(config) {
    if (multiplayerMatchStarted) return;
    multiplayerMatchStarted = true;
    multiplayerOpponentFinal = null;

    var overlay = document.getElementById('multiplayerOverlay');
    if (overlay) overlay.classList.remove('active');

    var delay = Math.max(0, (config.startAt || Date.now()) - Date.now());

    showMultiplayerMessage('Match starting!', 'var(--accent-green)');

    setTimeout(function () {
        var mode = config.mode || 'versus';
        startMode(mode);
    }, delay);
}

function configureMultiplayer(client, content) {
    multiplayerClient = client;
    multiplayerMatchStarted = false;

    client.onConnected = function () {
        content.innerHTML =
            '<div class="mp-status" style="color:var(--accent-green)">' +
            '\u2705 Opponent connected!</div>' +
            '<button class="btn btn-green btn-block" id="mpReadyBtn" ' +
            'style="margin-top:10px">Ready</button>' +
            '<div class="mp-status" id="mpReadyStatus" ' +
            'style="margin-top:8px">Waiting for both players...</div>';

        var readyBtn = document.getElementById('mpReadyBtn');

        readyBtn.addEventListener('click', function () {
            client.sendReady(true);
            readyBtn.disabled = true;
            readyBtn.textContent = '\u2713 READY';
        });
    };

    client.onReadyState = function (state) {
        var status = document.getElementById('mpReadyStatus');
        if (!status) return;

        if (state.localReady && state.opponentReady) {
            if (client.isHost) {
                status.innerHTML =
                    '<span style="color:var(--accent-green)">Both ready!</span>' +
                    '<button class="btn btn-primary btn-block" ' +
                    'id="mpStartMatchBtn" style="margin-top:8px">' +
                    'Start Match</button>';

                var startBtn = document.getElementById('mpStartMatchBtn');

                startBtn.addEventListener('click', function () {
                    var config = client.sendStartMatch({
                        startAt: Date.now() + 1800,
                        seed: Math.floor(Math.random() * 2147483647),
                        subjects: storage.get('selectedSubjects')
                    });

                    scheduleVersusStart(config);
                });
            } else {
                status.textContent = 'Both ready \u2014 waiting for host to start.';
            }
        } else if (state.localReady) {
            status.textContent = 'You are ready. Waiting for opponent...';
        } else if (state.opponentReady) {
            status.textContent = 'Opponent is ready.';
        }
    };

    client.onMatchStart = function (config) {
        scheduleVersusStart(config);
    };

    client.onOpponentUpdate = function (state) {
        updateOpponentHud(state);
    };

    client.onEncounterResult = function (result) {
        if (result.correct) {
            showMultiplayerMessage(
                'Rival answered correctly!',
                'var(--accent-pink)'
            );
        }
    };

    client.onEndRun = function (result) {
        multiplayerOpponentFinal = result;

        var message;

        if (!game.running) {
            if (game.score > result.score) {
                message = '\uD83C\uDFC6 You won! ' + game.score + '\u2013' + result.score;
            } else if (game.score < result.score) {
                message = 'Rival won ' + result.score + '\u2013' + game.score;
            } else {
                message = '\uD83E\uDD1D Tie game: ' + game.score;
            }
        } else {
            message = 'Rival finished with ' + result.score + ' points';
        }

        showMultiplayerMessage(message, 'var(--accent-gold)');

        // Track multiplayer stats
        if (storage.recordMultiplayerGame) {
            var won = !game.running && game.score > result.score;
            storage.recordMultiplayerGame(won);
        }
    };

    // NEW: Handle elimination (sudden death mode)
    if (client.onEliminated !== undefined) {
        client.onEliminated = function (data) {
            showMultiplayerMessage(
                '\uD83D\uDC80 Rival eliminated!',
                'var(--accent-green)'
            );
        };
    }

    // NEW: Handle race finish
    if (client.onRaceFinished !== undefined) {
        client.onRaceFinished = function (data) {
            showMultiplayerMessage(
                '\uD83C\uDFC1 Rival finished the race! ' + data.correctCount + ' correct in ' + Math.round(data.totalTime / 1000) + 's',
                'var(--accent-gold)'
            );
        };
    }

    client.onDisconnected = function (reason) {
        hideOpponentHud();
        multiplayerMatchStarted = false;
        showMultiplayerMessage(
            reason || 'Opponent disconnected.',
            'var(--accent-red)'
        );
    };

    client.onError = function (error) {
        content.innerHTML = '';
        var errorEl = document.createElement('div');
        errorEl.className = 'mp-status';
        errorEl.style.color = 'var(--accent-red)';
        errorEl.textContent = '\u274C ' + error;
        content.appendChild(errorEl);
    };
}

// ===== HOME CHARACTER INIT =====

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
            if (subjects.length > 0 && subjects.indexOf(c.subj) < 0) return false;
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

    // Track run start time for play time tracking
    runStartTime = Date.now();

    game.start(mode);
    ui.hideAll();
    ui.showHud();

    // NOTE: startAmbient is called inside game.go() now, not here
    // This fixes the duplicate ambient audio start bug

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

// ===== FLASHCARD MODE HELPERS =====

function startFlashcardMode() {
    flashcardMode = new FlashcardMode();
    var subjects = storage.get('selectedSubjects');
    var examFilters = storage.getSelectedExams ? storage.getSelectedExams() : [];
    flashcardMode.start(subjects, examFilters, 20);

    if (!flashcardMode.sessionActive) {
        alert('No cards available for the selected subjects and filters.');
        return;
    }

    renderFlashcardUI();
    ui.show('screenFlashcard');
}

function renderFlashcardUI() {
    var container = document.getElementById('flashcardContent');
    if (!container || !flashcardMode || !flashcardMode.sessionActive) return;

    if (flashcardMode.isComplete()) {
        var summary = flashcardMode.getSummary();
        container.innerHTML =
            '<div style="text-align:center;padding:20px 0">' +
            '<h3>\uD83C\uDF89 Session Complete!</h3>' +
            '<div class="post-stats" style="margin:14px 0">' +
            '<div class="post-stat"><div class="val" style="color:var(--accent-green)">' + summary.correct + '</div><div class="label">Correct</div></div>' +
            '<div class="post-stat"><div class="val" style="color:var(--accent-red)">' + summary.wrong + '</div><div class="label">Wrong</div></div>' +
            '<div class="post-stat"><div class="val">' + summary.accuracy + '%</div><div class="label">Accuracy</div></div>' +
            '</div>' +
            (summary.wrong > 0 ? '<button class="btn btn-primary btn-block" id="fcReviewMissed" style="margin-top:10px">\uD83D\uDD04 Review Missed Cards</button>' : '') +
            '<button class="btn btn-green btn-block" id="fcNewSession" style="margin-top:8px">\u25B6 New Session</button>' +
            '<button class="btn btn-outline btn-block" id="fcGoHome" style="margin-top:6px">\uD83C\uDFE0 Home</button>' +
            '</div>';

        var reviewBtn = document.getElementById('fcReviewMissed');
        if (reviewBtn) {
            reviewBtn.addEventListener('click', function () {
                flashcardMode.reviewMissed();
                renderFlashcardUI();
            });
        }
        var newBtn = document.getElementById('fcNewSession');
        if (newBtn) {
            newBtn.addEventListener('click', function () {
                startFlashcardMode();
            });
        }
        var homeBtn = document.getElementById('fcGoHome');
        if (homeBtn) {
            homeBtn.addEventListener('click', function () {
                flashcardMode.end();
                ui.show('screenHome');
            });
        }
        return;
    }

    var progress = flashcardMode.getProgress();
    var cardHTML = flashcardMode.showCard();

    container.innerHTML =
        '<div style="text-align:center;font-size:11px;color:var(--text-muted);margin-bottom:8px">' +
        'Card ' + progress.current + ' of ' + progress.total +
        ' | \u2705 ' + progress.correctSoFar + ' | \u274C ' + progress.wrongSoFar +
        '</div>' +
        '<div style="background:var(--bg-card);border-radius:var(--radius-lg);padding:20px;border:var(--border-card)">' +
        cardHTML +
        '<div id="fcAnswerArea" style="margin-top:14px"></div>' +
        '<div id="fcButtons" style="margin-top:14px">' +
        '<button class="btn btn-primary btn-block" id="fcRevealBtn">\uD83D\uDC41 Show Answer</button>' +
        '</div>' +
        '</div>';

    document.getElementById('fcRevealBtn').addEventListener('click', function () {
        var answerHTML = flashcardMode.revealAnswer();
        document.getElementById('fcAnswerArea').innerHTML = answerHTML;
        document.getElementById('fcButtons').innerHTML =
            '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-green" id="fcGotIt" style="flex:1">\u2705 Got It</button>' +
            '<button class="btn btn-red" id="fcMissed" style="flex:1">\u274C Missed It</button>' +
            '</div>';

        document.getElementById('fcGotIt').addEventListener('click', function () {
            flashcardMode.markCorrect();
            renderFlashcardUI();
        });
        document.getElementById('fcMissed').addEventListener('click', function () {
            flashcardMode.markIncorrect();
            renderFlashcardUI();
        });
    });
}

// ===== HOW TO PLAY SECTION =====

function renderHowToPlay() {
    var container = document.getElementById('howToPlaySection');
    if (!container) return;

    var sections = [
        { icon: '\uD83C\uDFAE', title: 'Controls', text: 'Swipe left/right to switch lanes. Swipe up to jump over obstacles, down to slide under them. Use arrow keys or WASD on desktop.' },
        { icon: '\u26A1', title: 'Rush Mode', text: 'Double-tap or press Shift to RUSH through gates! Rush makes you invulnerable to obstacles and pushes you through in 0.5 seconds. Stack up to 3 rushes for bonus points!' },
        { icon: '\u2764\uFE0F', title: 'Lives & Hearts', text: 'You start with 3 lives. Wrong answers and hitting obstacles cost a life. When you\'re down to 1 life, look for heart pickups on the track!' },
        { icon: '\uD83E\uDE99', title: 'Coins & Power-ups', text: 'Collect coins as you run. Power-ups include: Shield (\uD83D\uDEE1), Magnet (\uD83E\uDDF2), Double Score (2\u00D7), Auto-Pilot (\uD83E\uDD16), and Score Frenzy (\uD83D\uDC8E).' },
        { icon: '\uD83D\uDCCA', title: 'Scoring', text: 'Correct answers build your streak. Every 5 correct increases your multiplier up to 8\u00D7. Rush through gates for bonus points!' },
        { icon: '\uD83D\uDC79', title: 'The Exam Monster', text: 'Beware! An exam monster chases you. It gets closer when you miss questions and falls back when you answer correctly.' },
        { icon: '\uD83C\uDFAF', title: 'Game Modes', text: 'Endless: play until you run out of lives. Study: infinite lives with teaching points. Weakness: focus on missed cards. Daily: 15-card challenge. Versus: multiplayer!' },
        { icon: '\uD83D\uDCDD', title: 'Custom Cards & Flashcards', text: 'Create your own cards in My Cards. Use Flashcard mode to study without the runner game. Import Anki cards for AI-converted questions.' }
    ];

    var html = '<div style="margin-top:4px">' +
        '<h4 style="font-size:13px;font-weight:800;color:var(--text-secondary);margin-bottom:6px">\uD83D\uDCD6 How to Play</h4>';

    sections.forEach(function (s) {
        html += '<details style="margin-bottom:4px;background:var(--bg-card);border-radius:var(--radius-sm);padding:8px 12px;border:var(--border-card)">' +
            '<summary style="font-size:12px;font-weight:700;cursor:pointer">' + s.icon + ' ' + s.title + '</summary>' +
            '<p style="font-size:11px;color:var(--text-secondary);margin-top:6px;line-height:1.5">' + s.text + '</p>' +
            '</details>';
    });

    html += '</div>';
    container.innerHTML = html;
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

    // Render How to Play section on home screen
    renderHowToPlay();

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

        // Multiplayer: send encounter result
        if (
            multiplayerClient &&
            multiplayerClient.isConnected() &&
            (game.mode === 'versus' || game.mode === 'mp_highscore' || game.mode === 'mp_suddendeath' || game.mode === 'mp_race')
        ) {
            multiplayerClient.sendEncounterResult(
                wasCorrect,
                game.score,
                card.id
            );
        }
    };

    game.onRunEnd = function () {
        ui.hideHud();
        ui.hideAnswerChoices();
        audio.stopAmbient();

        // Track play time
        if (runStartTime > 0 && storage.addPlayTime) {
            var sessionSeconds = Math.round((Date.now() - runStartTime) / 1000);
            storage.addPlayTime(sessionSeconds);
            runStartTime = 0;
        }

        // Track cards studied
        if (storage.addCardsStudied && game.encountersDone > 0) {
            storage.addCardsStudied(game.encountersDone);
        }

        // Multiplayer: send final score
        if (
            multiplayerClient &&
            multiplayerClient.isConnected() &&
            (game.mode === 'versus' || game.mode === 'mp_highscore' || game.mode === 'mp_suddendeath' || game.mode === 'mp_race')
        ) {
            multiplayerClient.sendEndRun({
                score: game.score,
                correct: game.correct,
                wrong: game.wrong,
                bestStreak: game.bestStreak,
                coins: game.coins
            });
        }

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

        // Hide opponent HUD after a delay so result is visible
        setTimeout(function () {
            hideOpponentHud();
            multiplayerMatchStarted = false;
        }, 5000);
    };

    game.onHudUpdate = function () {
        ui.updateHud(game);

        // Multiplayer: send live state (throttled to every 100ms)
        if (
            multiplayerClient &&
            multiplayerClient.isConnected() &&
            (game.mode === 'versus' || game.mode === 'mp_highscore' || game.mode === 'mp_suddendeath' || game.mode === 'mp_race')
        ) {
            var now = performance.now();

            if (now - multiplayerLastStateSend >= 100) {
                multiplayerLastStateSend = now;

                multiplayerClient.sendGameState({
                    lane: game.currentLane,
                    score: game.score,
                    streak: game.streak,
                    correct: game.correct,
                    wrong: game.wrong,
                    lives: game.lives,
                    rushing: game.rushing,
                    rushStacks: game.rushStacks,
                    running: game.running
                });
            }
        }
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

    // NEW: Map transition callback — crossfade music
    if (game.onMapTransition !== undefined) {
        game.onMapTransition = function (newSkinName) {
            audio.crossfadeMusic(newSkinName, 3.0);
            audio.play('mapTransition');
            ui.showTrackName(newSkinName);
        };
    }

    // NEW: Faceplant callback
    if (game.onPlayerFaceplant !== undefined) {
        game.onPlayerFaceplant = function () {
            audio.play('faceplant');
        };
    }

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

    // ===== NEW: FLASHCARD MODE BUTTON =====

    var flashcardBtn = document.getElementById('flashcardBtn');
    if (flashcardBtn) {
        flashcardBtn.addEventListener('click', function () {
            startFlashcardMode();
        });
    }

    // ===== NEW: CARD BROWSER BUTTON =====

    var cardBrowserBtn = document.getElementById('cardBrowserBtn');
    if (cardBrowserBtn) {
        cardBrowserBtn.addEventListener('click', function () {
            if (ui.renderCardBrowser) {
                ui.renderCardBrowser();
            }
            ui.show('screenCardBrowser');
        });
    }

    // ===== NEW: PROFILE BUTTON =====

    var profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', function () {
            if (ui.renderProfile) {
                ui.renderProfile();
            }
            ui.show('screenProfile');
        });
    }

    // ===== MULTIPLAYER BUTTON =====

    var mpBtn = document.getElementById('multiplayerBtn');
    if (mpBtn) {
        mpBtn.addEventListener('click', async function () {
            var overlay = document.getElementById('multiplayerOverlay');
            var content = document.getElementById('mpContent');
            if (!overlay || !content) return;

            overlay.classList.add('active');

            content.innerHTML =
                '<button class="btn btn-green btn-block" id="mpHostBtn">' +
                '\uD83C\uDFAE Host Game</button>' +
                '<div style="text-align:center;margin:8px 0;' +
                'color:var(--text-muted)">\u2014 or \u2014</div>' +
                '<input type="text" id="mpJoinCode" maxlength="5" ' +
                'placeholder="ROOM CODE" style="width:100%;padding:10px;' +
                'border-radius:12px;background:rgba(30,15,70,.8);' +
                'color:#fff;border:1px solid rgba(187,102,255,.3);' +
                'font-size:18px;text-align:center;letter-spacing:4px;' +
                'margin-bottom:8px;text-transform:uppercase">' +
                '<button class="btn btn-primary btn-block" id="mpJoinBtn">' +
                'Join Game</button>';

            var module;

            try {
                module = await import('./multiplayer.js');
                await module.multiplayer.init();
            } catch (error) {
                content.textContent = 'Could not load multiplayer: ' + error.message;
                return;
            }

            document.getElementById('mpHostBtn')
                .addEventListener('click', function () {
                    configureMultiplayer(module.multiplayer, content);

                    content.innerHTML =
                        '<div class="mp-status">Creating room...</div>';

                    module.multiplayer.hostGame(function (code) {
                        content.innerHTML =
                            '<div class="mp-status">Waiting for opponent...</div>' +
                            '<div class="mp-room-code">' + code + '</div>' +
                            '<div class="mp-status">Share this code with a friend.</div>';
                    });
                });

            document.getElementById('mpJoinBtn')
                .addEventListener('click', function () {
                    var input = document.getElementById('mpJoinCode');
                    var code = input.value.trim().toUpperCase();

                    if (code.length !== 5) {
                        alert('Enter a five-character room code.');
                        return;
                    }

                    configureMultiplayer(module.multiplayer, content);

                    content.innerHTML =
                        '<div class="mp-status">Connecting to ' + code + '...</div>';

                    module.multiplayer.joinGame(code);
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

    // ===== UPDATE CUSTOM CARDS REFERENCE FOR MULTIPLAYER =====
    // Keep the window reference updated when custom cards change
    window.__BUZZWORD_CUSTOM_CARDS = customCards.getAll();
}

// ===== START =====

window.addEventListener('DOMContentLoaded', init);
