/**
 * storage.js — LocalStorage persistence layer
 * 
 * All game state is saved here: coins, scores, settings,
 * per-card stats, subject selections, equipped cosmetics, etc.
 */

const STORAGE_KEY = 'buzzword_dash_v1';

const DEFAULTS = {
  coins: 100,
  bestScore: 0,
  bestStreak: 0,
  totalCorrect: 0,
  totalWrong: 0,
  totalEncounters: 0,
  dailyStreak: 0,
  dailyDone: false,
  lastDaily: null,

  // Subjects — first 6 selected by default
  selectedSubjects: [
    "Neurology", "Cardiology", "Nephrology",
    "Psychiatry", "Gastroenterology", "Infectious Disease"
  ],

  // Settings
  userSpeed: 1,
  masterVolume: 0.7,
  sfxVolume: 0.8,
  musicOn: false,
  nightMode: false,
  ttsEnabled: false,
  ttsRate: 1.0,
  reducedMotion: false,

  // Per-card stats: { cardId: { seen, correct, wrong } }
  cardStats: {},
  // Per-subject stats: { subject: { correct, wrong } }
  subjectStats: {},

  // Shop
  ownedItems: ["skin_scrubs", "hat_none", "gear_none"],
  equipped: {
    skin: "skin_scrubs",
    hat: "hat_none",
    gear: "gear_none"
  },

  // Quest progress: { questId: count }
  questProgress: {},

  // Flagged cards
  flags: []
};

class Storage {
  constructor() {
    this.data = null;
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.data = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch (e) {
      this.data = { ...DEFAULTS };
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      // localStorage unavailable — fail silently
    }
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

  // --- Card stats ---
  getCardStat(cardId) {
    const stats = this.get('cardStats');
    return stats[cardId] || { seen: 0, correct: 0, wrong: 0 };
  }

  updateCardStat(cardId, wasCorrect) {
    const stats = this.get('cardStats');
    const s = stats[cardId] || { seen: 0, correct: 0, wrong: 0 };
    s.seen++;
    if (wasCorrect) s.correct++;
    else s.wrong++;
    stats[cardId] = s;
    this.set('cardStats', stats);
  }

  // --- Subject stats ---
  getSubjectStat(subject) {
    const stats = this.get('subjectStats');
    return stats[subject] || { correct: 0, wrong: 0 };
  }

  updateSubjectStat(subject, wasCorrect) {
    const stats = this.get('subjectStats');
    const s = stats[subject] || { correct: 0, wrong: 0 };
    if (wasCorrect) s.correct++;
    else s.wrong++;
    stats[subject] = s;
    this.set('subjectStats', stats);
  }

  // --- Shop ---
  ownsItem(itemId) {
    return this.get('ownedItems').includes(itemId);
  }

  buyItem(itemId, price) {
    const coins = this.get('coins');
    if (coins < price) return false;
    this.set('coins', coins - price);
    const owned = this.get('ownedItems');
    owned.push(itemId);
    this.set('ownedItems', owned);
    return true;
  }

  equipItem(itemId, slot) {
    const eq = this.get('equipped');
    eq[slot] = itemId;
    this.set('equipped', eq);
  }

  // --- Quest progress ---
  getQuestProgress(questId) {
    const p = this.get('questProgress');
    return p[questId] || 0;
  }

  incrementQuest(questId, amount) {
    const p = this.get('questProgress');
    p[questId] = (p[questId] || 0) + (amount || 1);
    this.set('questProgress', p);
  }

  // --- Daily check ---
  checkDailyReset() {
    const last = this.get('lastDaily');
    const today = new Date().toDateString();
    if (last !== today) {
      this.set('dailyDone', false);
      this.set('questProgress', {});
    }
  }

  // --- Full reset ---
  reset() {
    this.data = { ...DEFAULTS };
    this.save();
  }
}

// Export singleton
export const storage = new Storage();
