/**
 * storage.js — LocalStorage persistence layer
 *
 * All features through Final Phase:
 * - equipped.trail slot for trail effects
 * - totalCoins lifetime tracking (separate from spendable coins)
 * - Achievement unlock/check system with checkAchievements(runData)
 * - Card lastSeen timestamp for spaced repetition
 * - Daily login reward tracking (lastLoginDate, loginStreak)
 * - Konami code one-time flag
 * - Deep merge on load to handle new fields added in updates
 * - Safe upgrade handling for old saves
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
  musicOn: false,
  nightMode: false,
  ttsEnabled: false,
  ttsRate: 1.0,
  reducedMotion: false,

  cardStats: {},
  subjectStats: {},

  ownedItems: ["avatar_intern", "hat_none", "trail_none", "gear_none"],
  equipped: {
    skin: "avatar_intern",
    hat: "hat_none",
    trail: "trail_none",
    gear: "gear_none"
  },

  questProgress: {},
  flags: [],
  achievements: [],
  continuesUsed: 0,

  // Daily login reward
  lastLoginDate: null,
  loginStreak: 0,

  // Easter eggs
  konamiUsed: false
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
        // Ensure equipped has all slots (for upgrades from old saves)
        if (!this.data.equipped.trail) this.data.equipped.trail = 'trail_none';
        if (!this.data.equipped.gear) this.data.equipped.gear = 'gear_none';
        // Ensure totalCoins exists
        if (this.data.totalCoins === undefined) this.data.totalCoins = this.data.coins || 100;
        // Ensure achievements array exists
        if (!Array.isArray(this.data.achievements)) this.data.achievements = [];
        // Ensure login fields exist
        if (this.data.lastLoginDate === undefined) this.data.lastLoginDate = null;
        if (this.data.loginStreak === undefined) this.data.loginStreak = 0;
        if (this.data.konamiUsed === undefined) this.data.konamiUsed = false;
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
    owned.push(itemId);
    this.set('ownedItems', owned);
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

    // Run-specific checks
    if (runData) {
      if (runData.score >= 1000 && this.unlockAchievement('ach_score_1000')) newlyUnlocked.push('ach_score_1000');
      if (runData.score >= 5000 && this.unlockAchievement('ach_score_5000')) newlyUnlocked.push('ach_score_5000');
      if (runData.score >= 10000 && this.unlockAchievement('ach_score_10000')) newlyUnlocked.push('ach_score_10000');
      if (runData.perfect && this.unlockAchievement('ach_perfect_run')) newlyUnlocked.push('ach_perfect_run');
      if (runData.speed >= 10 && this.unlockAchievement('ach_speed_max')) newlyUnlocked.push('ach_speed_max');
    }

    // All subjects touched
    var ss = this.get('subjectStats');
    var subjectCount = 0;
    for (var key in ss) {
      if (ss[key].correct + ss[key].wrong > 0) subjectCount++;
    }
    if (subjectCount >= 15 && this.unlockAchievement('ach_all_subjects')) newlyUnlocked.push('ach_all_subjects');

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

  // --- Full reset ---

  reset() {
    this.data = deepClone(DEFAULTS);
    this.save();
  }
}

export var storage = new Storage();
