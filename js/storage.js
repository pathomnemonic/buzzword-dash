/**
 * storage.js — LocalStorage persistence layer
 *
 * All features through Final Phase + all bug fixes + Model 7 expansion:
 * - equipped.trail slot for trail effects
 * - equipped.clothing slot for clothing items (NEW)
 * - totalCoins lifetime tracking (separate from spendable coins)
 * - Achievement unlock/check system with checkAchievements(runData)
 * - Card lastSeen timestamp for spaced repetition
 * - Daily login reward tracking (lastLoginDate, loginStreak)
 * - Konami code one-time flag
 * - Deep merge on load to handle new fields added in updates
 * - Safe upgrade handling for old saves
 * - speedTimerEnabled: hidden toggle for speed timer HUD
 * - calendarData: study streak calendar history
 * - firstRunComplete: onboarding flow flag
 * - musicOn defaults to true
 *
 * NEW in Model 7:
 * - selectedExams: exam filter strings for card filtering
 * - disabledCards: card IDs excluded from gameplay
 * - cardReports: user-submitted card issue reports
 * - cardFreshnessWeight: weight for unseen cards (1-10)
 * - Profile system: profileName, profilePicture, profileVisible, selectedBadges
 * - totalPlayTime, totalCardsStudied: lifetime tracking
 * - ankiApiKey: for Anki import AI conversion
 * - questCompletionDates: dates where all quests completed
 * - flashcardSessions/Correct/Wrong: flashcard mode stats
 * - Multiplayer stats: multiplayerGamesPlayed, multiplayerWins
 * - Performance stats: fastestCorrectAnswer, longestSession
 * - musicVolume: independent music volume control
 * - New methods: card management, profile, play time, quest completion
 * - Migration logic for existing saves
 *
 * NEW in Multi-Agent Expansion:
 * - friendsList: array of friend player IDs for leaderboard system
 * - leaderboardPlayerId: unique persistent player ID
 * - Friends helper methods: getFriendsList, addFriend, removeFriend
 * - getLeaderboardPlayerId: auto-generates unique ID on first call
 */

var STORAGE_KEY = 'buzzword_dash_v1';

var DEFAULTS = {
    coins: 100,
    totalCoins: 100,
    bestScore: 0,
    bestStreak: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalEncounters: 0,
    dailyStreak: 0,
    dailyDone: false,
    lastDaily: null,

    selectedSubjects: [
        "Neurology", "Cardiology", "Nephrology",
        "Psychiatry", "Gastroenterology", "Infectious Disease"
    ],

    userSpeed: 1,
    masterVolume: 0.7,
    sfxVolume: 0.8,
    musicOn: true,
    musicVolume: 0.5,       // NEW: independent music volume
    nightMode: false,
    ttsEnabled: false,
    ttsRate: 1.0,
    reducedMotion: false,

    cardStats: {},
    subjectStats: {},

    ownedItems: ["avatar_intern", "hat_none", "trail_none", "gear_none", "cloth_none"],
    equipped: {
        skin: "avatar_intern",
        hat: "hat_none",
        trail: "trail_none",
        gear: "gear_none",
        clothing: "cloth_none"  // NEW: clothing slot
    },

    questProgress: {},
    flags: [],
    achievements: [],
    continuesUsed: 0,

    // Daily login reward
    lastLoginDate: null,
    loginStreak: 0,

    // Easter eggs
    konamiUsed: false,

    // Speed timer hidden feature
    speedTimerEnabled: false,

    // Study streak calendar
    calendarData: {},

    // Onboarding
    firstRunComplete: false,

    // ========== NEW FIELDS (Model 7) ==========

    // Exam filtering
    selectedExams: [],              // Array of exam filter strings (e.g. "step1", "step2", "shelf_im")

    // Card management
    disabledCards: [],              // Array of card IDs that won't appear in gameplay
    cardReports: [],                // Array of {cardId, reason, text, date}
    cardFreshnessWeight: 5,         // Weight multiplier for unseen cards (1-10)

    // Profile system
    profileName: '',                // Display name
    profilePicture: 'avatar_intern', // Skin ID for profile pic
    profileVisible: false,          // Whether profile is public
    selectedBadges: [],             // Achievement IDs to display (max 6)
    totalPlayTime: 0,               // In seconds
    totalCardsStudied: 0,           // Lifetime cards seen

    // Anki integration
    ankiApiKey: '',

    // Quest completion tracking
    questCompletionDates: {},       // { "2024-01-15": true } for dates where all quests completed

    // Flashcard mode stats
    flashcardSessions: 0,
    flashcardCorrect: 0,
    flashcardWrong: 0,

    // Multiplayer stats
    multiplayerGamesPlayed: 0,
    multiplayerWins: 0,

    // Performance stats
    fastestCorrectAnswer: 99999,    // milliseconds
    longestSession: 0,              // seconds

    // Friends / Leaderboard
    friendsList: [],                    // Array of friend player IDs
    leaderboardPlayerId: ''             // Unique player ID for leaderboard
};

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

class Storage {
    constructor() {
        this.data = null;
    }

    load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                this.data = {};
                // Deep merge with defaults so new fields are always present
                for (var key in DEFAULTS) {
                    if (parsed[key] !== undefined) {
                        this.data[key] = parsed[key];
                    } else {
                        this.data[key] = typeof DEFAULTS[key] === 'object' && DEFAULTS[key] !== null
                            ? deepClone(DEFAULTS[key])
                            : DEFAULTS[key];
                    }
                }

                // ========== MIGRATION FOR EXISTING SAVES ==========

                // Ensure equipped has all slots (for upgrades from old saves)
                if (!this.data.equipped.trail) this.data.equipped.trail = 'trail_none';
                if (!this.data.equipped.gear) this.data.equipped.gear = 'gear_none';
                if (!this.data.equipped.clothing) this.data.equipped.clothing = 'cloth_none';

                // Ensure totalCoins exists
                if (this.data.totalCoins === undefined) this.data.totalCoins = this.data.coins || 100;

                // Ensure achievements array exists
                if (!Array.isArray(this.data.achievements)) this.data.achievements = [];

                // Ensure login fields exist
                if (this.data.lastLoginDate === undefined) this.data.lastLoginDate = null;
                if (this.data.loginStreak === undefined) this.data.loginStreak = 0;
                if (this.data.konamiUsed === undefined) this.data.konamiUsed = false;

                // Ensure speedTimerEnabled exists
                if (this.data.speedTimerEnabled === undefined) this.data.speedTimerEnabled = false;

                // Ensure calendarData exists
                if (this.data.calendarData === undefined) this.data.calendarData = {};

                // Ensure firstRunComplete exists
                if (this.data.firstRunComplete === undefined) this.data.firstRunComplete = false;

                // Ensure musicOn defaults correctly for old saves
                if (this.data.musicOn === undefined) this.data.musicOn = true;

                // ========== NEW FIELD MIGRATIONS ==========

                // Music volume (independent from master)
                if (this.data.musicVolume === undefined) this.data.musicVolume = 0.5;

                // Exam filtering
                if (!Array.isArray(this.data.selectedExams)) this.data.selectedExams = [];

                // Card management
                if (!Array.isArray(this.data.disabledCards)) this.data.disabledCards = [];
                if (!Array.isArray(this.data.cardReports)) this.data.cardReports = [];
                if (this.data.cardFreshnessWeight === undefined) this.data.cardFreshnessWeight = 5;

                // Profile system
                if (this.data.profileName === undefined) this.data.profileName = '';
                if (this.data.profilePicture === undefined) this.data.profilePicture = 'avatar_intern';
                if (this.data.profileVisible === undefined) this.data.profileVisible = false;
                if (!Array.isArray(this.data.selectedBadges)) this.data.selectedBadges = [];
                if (this.data.totalPlayTime === undefined) this.data.totalPlayTime = 0;
                if (this.data.totalCardsStudied === undefined) this.data.totalCardsStudied = 0;

                // Anki
                if (this.data.ankiApiKey === undefined) this.data.ankiApiKey = '';

                // Quest completion dates
                if (this.data.questCompletionDates === undefined || typeof this.data.questCompletionDates !== 'object') {
                    this.data.questCompletionDates = {};
                }

                // Flashcard mode stats
                if (this.data.flashcardSessions === undefined) this.data.flashcardSessions = 0;
                if (this.data.flashcardCorrect === undefined) this.data.flashcardCorrect = 0;
                if (this.data.flashcardWrong === undefined) this.data.flashcardWrong = 0;

                // Multiplayer stats
                if (this.data.multiplayerGamesPlayed === undefined) this.data.multiplayerGamesPlayed = 0;
                if (this.data.multiplayerWins === undefined) this.data.multiplayerWins = 0;

                // Performance stats
                if (this.data.fastestCorrectAnswer === undefined) this.data.fastestCorrectAnswer = 99999;
                if (this.data.longestSession === undefined) this.data.longestSession = 0;

                // Ensure ownedItems includes cloth_none
                if (this.data.ownedItems.indexOf('cloth_none') < 0) {
                    this.data.ownedItems.push('cloth_none');
                }

                // Friends / leaderboard
                if (!Array.isArray(this.data.friendsList)) this.data.friendsList = [];
                if (this.data.leaderboardPlayerId === undefined) this.data.leaderboardPlayerId = '';

            } else {
                this.data = deepClone(DEFAULTS);
            }
        } catch (e) {
            this.data = deepClone(DEFAULTS);
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) { /* localStorage full or unavailable */ }
    }

    get(key) {
        if (!this.data) this.load();
        return this.data[key];
    }

    set(key, value) {
        if (!this.data) this.load();
        this.data[key] = value;
        this.save();
    }

    // --- Card stats with lastSeen for spaced repetition ---

    getCardStat(cardId) {
        var stats = this.get('cardStats');
        return stats[cardId] || { seen: 0, correct: 0, wrong: 0, lastSeen: 0 };
    }

    updateCardStat(cardId, wasCorrect) {
        var stats = this.get('cardStats');
        var s = stats[cardId] || { seen: 0, correct: 0, wrong: 0, lastSeen: 0 };
        s.seen++;
        if (wasCorrect) s.correct++;
        else s.wrong++;
        s.lastSeen = Date.now();
        stats[cardId] = s;
        this.set('cardStats', stats);
    }

    // --- Subject stats ---

    getSubjectStat(subject) {
        var stats = this.get('subjectStats');
        return stats[subject] || { correct: 0, wrong: 0 };
    }

    updateSubjectStat(subject, wasCorrect) {
        var stats = this.get('subjectStats');
        var s = stats[subject] || { correct: 0, wrong: 0 };
        if (wasCorrect) s.correct++;
        else s.wrong++;
        stats[subject] = s;
        this.set('subjectStats', stats);
    }

    // --- Shop ---

    ownsItem(itemId) {
        return this.get('ownedItems').indexOf(itemId) >= 0;
    }

    buyItem(itemId, price) {
        var coins = this.get('coins');
        if (coins < price) return false;
        this.set('coins', coins - price);
        var owned = this.get('ownedItems');
        if (owned.indexOf(itemId) < 0) {
            owned.push(itemId);
            this.set('ownedItems', owned);
        }
        this.unlockAchievement('ach_buy_first');
        return true;
    }

    equipItem(itemId, slot) {
        var eq = this.get('equipped');
        eq[slot] = itemId;
        this.set('equipped', eq);
    }

    // --- Coins with lifetime tracking ---

    addCoins(amount) {
        this.set('coins', this.get('coins') + amount);
        this.set('totalCoins', this.get('totalCoins') + amount);
        var total = this.get('totalCoins');
        if (total >= 500) this.unlockAchievement('ach_coins_500');
        if (total >= 5000) this.unlockAchievement('ach_coins_5000');
    }

    spendCoins(amount) {
        var coins = this.get('coins');
        if (coins < amount) return false;
        this.set('coins', coins - amount);
        return true;
    }

    // --- Quest progress ---

    getQuestProgress(questId) {
        var p = this.get('questProgress');
        return p[questId] || 0;
    }

    incrementQuest(questId, amount) {
        var p = this.get('questProgress');
        p[questId] = (p[questId] || 0) + (amount || 1);
        this.set('questProgress', p);
    }

    // --- Achievements ---

    hasAchievement(achId) {
        return this.get('achievements').indexOf(achId) >= 0;
    }

    unlockAchievement(achId) {
        if (this.hasAchievement(achId)) return false;
        var achs = this.get('achievements');
        achs.push(achId);
        this.set('achievements', achs);
        return true;
    }

    getAchievementCount() {
        return this.get('achievements').length;
    }

    checkAchievements(runData) {
        var newlyUnlocked = [];

        // Total encounters
        var te = this.get('totalEncounters');
        if (te >= 1 && this.unlockAchievement('ach_first_run')) newlyUnlocked.push('ach_first_run');
        if (te >= 100 && this.unlockAchievement('ach_encounters_100')) newlyUnlocked.push('ach_encounters_100');
        if (te >= 500 && this.unlockAchievement('ach_encounters_500')) newlyUnlocked.push('ach_encounters_500');
        if (te >= 1000 && this.unlockAchievement('ach_encounters_1000')) newlyUnlocked.push('ach_encounters_1000');

        // Daily streak
        var ds = this.get('dailyStreak');
        if (ds >= 3 && this.unlockAchievement('ach_daily_3')) newlyUnlocked.push('ach_daily_3');
        if (ds >= 7 && this.unlockAchievement('ach_daily_7')) newlyUnlocked.push('ach_daily_7');
        if (ds >= 30 && this.unlockAchievement('ach_daily_30')) newlyUnlocked.push('ach_daily_30');

        // Best streak
        var bs = this.get('bestStreak');
        if (bs >= 10 && this.unlockAchievement('ach_streak_10')) newlyUnlocked.push('ach_streak_10');
        if (bs >= 25 && this.unlockAchievement('ach_streak_25')) newlyUnlocked.push('ach_streak_25');
        if (bs >= 50 && this.unlockAchievement('ach_streak_50')) newlyUnlocked.push('ach_streak_50');
        if (bs >= 100 && this.unlockAchievement('ach_streak_100')) newlyUnlocked.push('ach_streak_100');

        // Run-specific checks
        if (runData) {
            if (runData.score >= 1000 && this.unlockAchievement('ach_score_1000')) newlyUnlocked.push('ach_score_1000');
            if (runData.score >= 5000 && this.unlockAchievement('ach_score_5000')) newlyUnlocked.push('ach_score_5000');
            if (runData.score >= 10000 && this.unlockAchievement('ach_score_10000')) newlyUnlocked.push('ach_score_10000');
            if (runData.perfect && this.unlockAchievement('ach_perfect_run')) newlyUnlocked.push('ach_perfect_run');
            if (runData.speed >= 10 && this.unlockAchievement('ach_speed_max')) newlyUnlocked.push('ach_speed_max');

            // Speed achievements
            if (runData.fastestAnswer !== undefined) {
                var fastest = this.get('fastestCorrectAnswer');
                if (runData.fastestAnswer < fastest) {
                    this.set('fastestCorrectAnswer', runData.fastestAnswer);
                }
                if (runData.fastestAnswer <= 500 && this.unlockAchievement('ach_speed_500ms')) newlyUnlocked.push('ach_speed_500ms');
                if (runData.fastestAnswer <= 300 && this.unlockAchievement('ach_speed_300ms')) newlyUnlocked.push('ach_speed_300ms');
            }
        }

        // All subjects touched
        var ss = this.get('subjectStats');
        var subjectCount = 0;
        for (var key in ss) {
            if (ss[key].correct + ss[key].wrong > 0) subjectCount++;
        }
        if (subjectCount >= 15 && this.unlockAchievement('ach_all_subjects')) newlyUnlocked.push('ach_all_subjects');

        // Subject mastery achievements (80%+ in each subject with at least 20 cards)
        var masteredCount = 0;
        for (var subjKey in ss) {
            var subjStat = ss[subjKey];
            var subjTotal = subjStat.correct + subjStat.wrong;
            if (subjTotal >= 20 && (subjStat.correct / subjTotal) >= 0.8) {
                masteredCount++;
            }
        }
        if (masteredCount >= 1 && this.unlockAchievement('ach_master_1_subject')) newlyUnlocked.push('ach_master_1_subject');
        if (masteredCount >= 5 && this.unlockAchievement('ach_master_5_subjects')) newlyUnlocked.push('ach_master_5_subjects');
        if (masteredCount >= 10 && this.unlockAchievement('ach_master_10_subjects')) newlyUnlocked.push('ach_master_10_subjects');
        if (masteredCount >= 15 && this.unlockAchievement('ach_master_all_subjects')) newlyUnlocked.push('ach_master_all_subjects');

        // Collection achievements (owned items)
        var ownedCount = this.get('ownedItems').length;
        if (ownedCount >= 10 && this.unlockAchievement('ach_collector_10')) newlyUnlocked.push('ach_collector_10');
        if (ownedCount >= 25 && this.unlockAchievement('ach_collector_25')) newlyUnlocked.push('ach_collector_25');
        if (ownedCount >= 50 && this.unlockAchievement('ach_collector_50')) newlyUnlocked.push('ach_collector_50');

        // Multiplayer achievements
        var mpGames = this.get('multiplayerGamesPlayed');
        var mpWins = this.get('multiplayerWins');
        if (mpGames >= 1 && this.unlockAchievement('ach_mp_first_game')) newlyUnlocked.push('ach_mp_first_game');
        if (mpWins >= 1 && this.unlockAchievement('ach_mp_first_win')) newlyUnlocked.push('ach_mp_first_win');
        if (mpWins >= 10 && this.unlockAchievement('ach_mp_10_wins')) newlyUnlocked.push('ach_mp_10_wins');

        // Play time achievements
        var playTime = this.get('totalPlayTime');
        if (playTime >= 1800 && this.unlockAchievement('ach_playtime_30min')) newlyUnlocked.push('ach_playtime_30min');
        if (playTime >= 3600 && this.unlockAchievement('ach_playtime_1hr')) newlyUnlocked.push('ach_playtime_1hr');

        // Total cards studied
        var totalStudied = this.get('totalCardsStudied');
        if (totalStudied >= 500 && this.unlockAchievement('ach_studied_500')) newlyUnlocked.push('ach_studied_500');
        if (totalStudied >= 1000 && this.unlockAchievement('ach_studied_1000')) newlyUnlocked.push('ach_studied_1000');

        // Perfect accuracy streaks
        var tc = this.get('totalCorrect');
        if (tc >= 10 && runData && runData.perfect && this.unlockAchievement('ach_perfect_10')) newlyUnlocked.push('ach_perfect_10');
        if (tc >= 50 && runData && runData.perfect && this.unlockAchievement('ach_perfect_50')) newlyUnlocked.push('ach_perfect_50');

        // Flashcard session achievements
        var fcSessions = this.get('flashcardSessions');
        if (fcSessions >= 1 && this.unlockAchievement('ach_flashcard_first')) newlyUnlocked.push('ach_flashcard_first');
        if (fcSessions >= 10 && this.unlockAchievement('ach_flashcard_10')) newlyUnlocked.push('ach_flashcard_10');

        return newlyUnlocked;
    }

    // --- Daily check ---

    checkDailyReset() {
        var last = this.get('lastDaily');
        var today = new Date().toDateString();
        if (last !== today) {
            this.set('dailyDone', false);
            this.set('questProgress', {});
        }
    }

    // ========== NEW METHODS (Model 7) ==========

    // --- Card Management ---

    isCardDisabled(cardId) {
        return this.get('disabledCards').indexOf(cardId) >= 0;
    }

    toggleCardDisabled(cardId) {
        var disabled = this.get('disabledCards');
        var idx = disabled.indexOf(cardId);
        if (idx >= 0) {
            disabled.splice(idx, 1);
        } else {
            disabled.push(cardId);
        }
        this.set('disabledCards', disabled);
    }

    enableCard(cardId) {
        var disabled = this.get('disabledCards');
        var idx = disabled.indexOf(cardId);
        if (idx >= 0) {
            disabled.splice(idx, 1);
            this.set('disabledCards', disabled);
        }
    }

    disableCard(cardId) {
        var disabled = this.get('disabledCards');
        if (disabled.indexOf(cardId) < 0) {
            disabled.push(cardId);
            this.set('disabledCards', disabled);
        }
    }

    addCardReport(cardId, reason, text) {
        var reports = this.get('cardReports');
        reports.push({
            cardId: cardId,
            reason: reason || 'other',
            text: text || '',
            date: Date.now()
        });
        this.set('cardReports', reports);
    }

    getCardReports() {
        return this.get('cardReports');
    }

    exportCardReports() {
        return JSON.stringify(this.get('cardReports'), null, 2);
    }

    clearCardReports() {
        this.set('cardReports', []);
    }

    // --- Profile ---

    getProfile() {
        return {
            name: this.get('profileName'),
            picture: this.get('profilePicture'),
            visible: this.get('profileVisible'),
            badges: this.get('selectedBadges'),
            stats: {
                totalCards: this.get('totalCardsStudied'),
                totalCorrect: this.get('totalCorrect'),
                totalWrong: this.get('totalWrong'),
                bestScore: this.get('bestScore'),
                bestStreak: this.get('bestStreak'),
                playTime: this.get('totalPlayTime'),
                dailyStreak: this.get('dailyStreak'),
                achievements: this.get('achievements').length,
                coins: this.get('totalCoins'),
                flashcardSessions: this.get('flashcardSessions'),
                multiplayerWins: this.get('multiplayerWins'),
                fastestAnswer: this.get('fastestCorrectAnswer')
            }
        };
    }

    setProfileName(name) {
        this.set('profileName', String(name || '').slice(0, 30));
    }

    setProfilePicture(skinId) {
        if (this.ownsItem(skinId)) {
            this.set('profilePicture', skinId);
        }
    }

    setProfileVisible(visible) {
        this.set('profileVisible', !!visible);
    }

    setProfileBadges(badgeIds) {
        if (!Array.isArray(badgeIds)) return;
        // Max 6 badges, must be unlocked achievements
        var achievements = this.get('achievements');
        var validBadges = badgeIds.filter(function (id) {
            return achievements.indexOf(id) >= 0;
        }).slice(0, 6);
        this.set('selectedBadges', validBadges);
    }

    // --- Play Time Tracking ---

    addPlayTime(seconds) {
        if (typeof seconds !== 'number' || seconds < 0) return;
        var current = this.get('totalPlayTime') || 0;
        this.set('totalPlayTime', current + Math.round(seconds));

        // Track longest session
        var longest = this.get('longestSession') || 0;
        if (seconds > longest) {
            this.set('longestSession', Math.round(seconds));
        }
    }

    addCardsStudied(count) {
        if (typeof count !== 'number' || count < 0) return;
        var current = this.get('totalCardsStudied') || 0;
        this.set('totalCardsStudied', current + count);
    }

    // --- Quest Completion ---

    markQuestsComplete(dateKey) {
        var dates = this.get('questCompletionDates');
        dates[dateKey] = true;
        this.set('questCompletionDates', dates);
    }

    areQuestsComplete(dateKey) {
        var dates = this.get('questCompletionDates');
        return !!dates[dateKey];
    }

    // --- Flashcard Mode Stats ---

    recordFlashcardSession(correct, wrong) {
        this.set('flashcardSessions', this.get('flashcardSessions') + 1);
        this.set('flashcardCorrect', this.get('flashcardCorrect') + (correct || 0));
        this.set('flashcardWrong', this.get('flashcardWrong') + (wrong || 0));
    }

    getFlashcardStats() {
        return {
            sessions: this.get('flashcardSessions'),
            correct: this.get('flashcardCorrect'),
            wrong: this.get('flashcardWrong'),
            total: this.get('flashcardCorrect') + this.get('flashcardWrong'),
            accuracy: (function (c, w) {
                var t = c + w;
                return t > 0 ? Math.round(c / t * 100) : 0;
            })(this.get('flashcardCorrect'), this.get('flashcardWrong'))
        };
    }

    // --- Multiplayer Stats ---

    recordMultiplayerGame(won) {
        this.set('multiplayerGamesPlayed', this.get('multiplayerGamesPlayed') + 1);
        if (won) {
            this.set('multiplayerWins', this.get('multiplayerWins') + 1);
        }
    }

    getMultiplayerStats() {
        var games = this.get('multiplayerGamesPlayed');
        var wins = this.get('multiplayerWins');
        return {
            gamesPlayed: games,
            wins: wins,
            losses: games - wins,
            winRate: games > 0 ? Math.round(wins / games * 100) : 0
        };
    }

    // --- Fastest Answer Tracking ---

    recordFastestAnswer(ms) {
        if (typeof ms !== 'number' || ms <= 0) return;
        var current = this.get('fastestCorrectAnswer');
        if (ms < current) {
            this.set('fastestCorrectAnswer', Math.round(ms));
        }
    }

    // --- Exam Filter Helpers ---

    getSelectedExams() {
        return this.get('selectedExams') || [];
    }

    setSelectedExams(exams) {
        if (!Array.isArray(exams)) return;
        this.set('selectedExams', exams);
    }

    toggleExamFilter(examId) {
        var exams = this.get('selectedExams');
        var idx = exams.indexOf(examId);
        if (idx >= 0) {
            exams.splice(idx, 1);
        } else {
            exams.push(examId);
        }
        this.set('selectedExams', exams);
    }

    // --- Anki API Key ---

    getAnkiApiKey() {
        return this.get('ankiApiKey') || '';
    }

    setAnkiApiKey(key) {
        this.set('ankiApiKey', String(key || ''));
    }

    // --- Friends ---

    getFriendsList() {
        return this.get('friendsList') || [];
    }

    addFriend(playerId) {
        var friends = this.get('friendsList') || [];
        if (friends.indexOf(playerId) < 0) {
            friends.push(playerId);
            this.set('friendsList', friends);
        }
    }

    removeFriend(playerId) {
        var friends = this.get('friendsList') || [];
        var idx = friends.indexOf(playerId);
        if (idx >= 0) {
            friends.splice(idx, 1);
            this.set('friendsList', friends);
        }
    }

    // --- Leaderboard Player ID ---

    getLeaderboardPlayerId() {
        var id = this.get('leaderboardPlayerId');
        if (!id) {
            // Generate unique player ID
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                id = crypto.randomUUID();
            } else {
                id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            this.set('leaderboardPlayerId', id);
        }
        return id;
    }

    // --- Full reset ---

    reset() {
        this.data = deepClone(DEFAULTS);
        this.save();
    }
}

export var storage = new Storage();
