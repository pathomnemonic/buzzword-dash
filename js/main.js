/**
 * main.js — Initialization and wiring
 *
 * All features through Final Phase + all bug fixes:
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

// ===== MULTIPLAYER STATE =====

var multiplayerClient = null;
var multiplayerLastStateSend = 0;
var multiplayerMatchStarted = false;
var multiplayerOpponentFinal = null;

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
    startMode('versus');
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
  };

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

    // Multiplayer: send encounter result
    if (
      multiplayerClient &&
      multiplayerClient.isConnected() &&
      game.mode === 'versus'
    ) {
      multiplayerClient.sendEncounterResult(
        wasCorrect,
        game.score
      );
    }
  };

  game.onRunEnd = function () {
    ui.hideHud();
    ui.hideAnswerChoices();
    audio.stopAmbient();

    // Multiplayer: send final score
    if (
      multiplayerClient &&
      multiplayerClient.isConnected() &&
      game.mode === 'versus'
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
      game.mode === 'versus'
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
}

// ===== START =====

window.addEventListener('DOMContentLoaded', init);
