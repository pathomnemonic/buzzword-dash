/**
 * storage.js — LocalStorage persistence layer
 *
 * Updated defaults for Phase 3.5:
 * - equipped.trail slot added
 * - equipped.skin defaults to avatar_intern
 * - ownedItems includes avatar_intern and trail_none
 */

var STORAGE_KEY = 'buzzword_dash_v1';

var DEFAULTS = {
  coins: 100,
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
  flags: []
};

class Storage {
  constructor() {
    this.data = null;
  }

  load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // Merge with defaults to add any new fields
        this.data = {};
        for (var key in DEFAULTS) {
          if (parsed[key] !== undefined) {
            this.data[key] = parsed[key];
          } else {
            this.data[key] = DEFAULTS[key];
          }
        }
        // Ensure equipped has trail slot
        if (!this.data.equipped.trail) {
          this.data.equipped.trail = 'trail_none';
        }
      } else {
        this.data = {};
        for (var k in DEFAULTS) {
          this.data[k] = typeof DEFAULTS[k] === 'object' && DEFAULTS[k] !== null
            ? JSON.parse(JSON.stringify(DEFAULTS[k]))
            : DEFAULTS[k];
        }
      }
    } catch (e) {
      this.data = {};
      for (var d in DEFAULTS) {
        this.data[d] = typeof DEFAULTS[d] === 'object' && DEFAULTS[d] !== null
          ? JSON.parse(JSON.stringify(DEFAULTS[d]))
          : DEFAULTS[d];
      }
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) { /* fail silently */ }
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

  getCardStat(cardId) {
    var stats = this.get('cardStats');
    return stats[cardId] || { seen: 0, correct: 0, wrong: 0 };
  }

  updateCardStat(cardId, wasCorrect) {
    var stats = this.get('cardStats');
    var s = stats[cardId] || { seen: 0, correct: 0, wrong: 0 };
    s.seen++;
    if (wasCorrect) s.correct++;
    else s.wrong++;
    stats[cardId] = s;
    this.set('cardStats', stats);
  }

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
    return true;
  }

  equipItem(itemId, slot) {
    var eq = this.get('equipped');
    eq[slot] = itemId;
    this.set('equipped', eq);
  }

  getQuestProgress(questId) {
    var p = this.get('questProgress');
    return p[questId] || 0;
  }

  incrementQuest(questId, amount) {
    var p = this.get('questProgress');
    p[questId] = (p[questId] || 0) + (amount || 1);
    this.set('questProgress', p);
  }

  checkDailyReset() {
    var last = this.get('lastDaily');
    var today = new Date().toDateString();
    if (last !== today) {
      this.set('dailyDone', false);
      this.set('questProgress', {});
    }
  }

  reset() {
    this.data = {};
    for (var k in DEFAULTS) {
      this.data[k] = typeof DEFAULTS[k] === 'object' && DEFAULTS[k] !== null
        ? JSON.parse(JSON.stringify(DEFAULTS[k]))
        : DEFAULTS[k];
    }
    this.save();
  }
}

export var storage = new Storage();
