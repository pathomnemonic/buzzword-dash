/**
 * shopdata.js — Shop items, quests, avatar definitions, and achievements
 *
 * All Phases through Final:
 * - 6 avatars with unique features (cape, antenna, wizard hat)
 * - 30+ shop items across skins, hats, trails, and gear
 * - Rebalanced prices for abundant coin economy
 * - 6 quests with scaled rewards
 * - 20 achievement badge definitions
 * - Continue cost constant
 *
 * Performance note: InstancedMesh can render 1,000 repeated objects
 * in a single draw call [2]. For our coin system, we use individual
 * meshes since coins have different positions and collection states,
 * but the object pooling pattern is recommended for frequently
 * created/destroyed objects to avoid allocation overhead and GC
 * pauses [2].
 */

// ===== AVATARS =====
export var AVATARS = [
  {
    id: "avatar_intern",
    name: "Intern",
    desc: "Eager and ready to learn",
    price: 0,
    bodyColor: 0x2288dd,
    pantsColor: 0x1a5599,
    shoeColor: 0xff4444,
    skinColor: 0xffccaa,
    hairColor: 0x332211,
    scale: 1.0,
    legSpeed: 1.0,
    armSwing: 1.0,
    icon: "🩺"
  },
  {
    id: "avatar_attending",
    name: "Attending",
    desc: "White coat authority",
    price: 1500,
    bodyColor: 0xe8e8f0,
    pantsColor: 0x334455,
    shoeColor: 0x222222,
    skinColor: 0xffccaa,
    hairColor: 0x221100,
    scale: 1.05,
    legSpeed: 0.9,
    armSwing: 0.8,
    icon: "👨‍⚕️"
  },
  {
    id: "avatar_superhero",
    name: "Superhero Doc",
    desc: "Saves lives AND the world",
    price: 3000,
    bodyColor: 0xdd2222,
    pantsColor: 0x1a1a88,
    shoeColor: 0xffcc00,
    skinColor: 0xffccaa,
    hairColor: 0x111111,
    scale: 1.1,
    legSpeed: 1.2,
    armSwing: 1.3,
    hasCape: true,
    capeColor: 0xdd2222,
    icon: "🦸"
  },
  {
    id: "avatar_robot",
    name: "Robot Medic",
    desc: "Beep boop. Diagnosing...",
    price: 4000,
    bodyColor: 0x888899,
    pantsColor: 0x666677,
    shoeColor: 0x44aaff,
    skinColor: 0xccccdd,
    hairColor: 0x555566,
    scale: 1.0,
    legSpeed: 1.1,
    armSwing: 0.7,
    hasAntenna: true,
    glowColor: 0x44aaff,
    icon: "🤖"
  },
  {
    id: "avatar_wizard",
    name: "Wizard Healer",
    desc: "Ancient medical arts",
    price: 5000,
    bodyColor: 0x6622aa,
    pantsColor: 0x441188,
    shoeColor: 0x886633,
    skinColor: 0xffccaa,
    hairColor: 0xcccccc,
    scale: 1.0,
    legSpeed: 0.85,
    armSwing: 1.1,
    hasWizardHat: true,
    hatColor: 0x6622aa,
    icon: "🧙"
  },
  {
    id: "avatar_zombie",
    name: "Zombie Resident",
    desc: "36 hours on call...",
    price: 2500,
    bodyColor: 0x448844,
    pantsColor: 0x336633,
    shoeColor: 0x554433,
    skinColor: 0x88bb88,
    hairColor: 0x333322,
    scale: 1.0,
    legSpeed: 1.3,
    armSwing: 1.4,
    icon: "🧟"
  }
];

// ===== SHOP ITEMS =====
export var SHOP_ITEMS = [
  // --- Skins (avatars) ---
  { id: "avatar_intern", name: "Intern", price: 0, type: "skin", color: 0x2288dd, icon: "🩺" },
  { id: "avatar_attending", name: "Attending", price: 1500, type: "skin", color: 0xe8e8f0, icon: "👨‍⚕️" },
  { id: "avatar_superhero", name: "Superhero Doc", price: 3000, type: "skin", color: 0xdd2222, icon: "🦸" },
  { id: "avatar_robot", name: "Robot Medic", price: 4000, type: "skin", color: 0x888899, icon: "🤖" },
  { id: "avatar_wizard", name: "Wizard Healer", price: 5000, type: "skin", color: 0x6622aa, icon: "🧙" },
  { id: "avatar_zombie", name: "Zombie Resident", price: 2500, type: "skin", color: 0x448844, icon: "🧟" },

  // --- Hats ---
  { id: "hat_none", name: "No Hat", price: 0, type: "hat", color: null },
  { id: "hat_cap", name: "Scrub Cap", price: 800, type: "hat", color: 0x40c4ff },
  { id: "hat_headlamp", name: "Headlamp", price: 1200, type: "hat", color: 0xffd740 },
  { id: "hat_crown", name: "Golden Crown", price: 5000, type: "hat", color: 0xffd700 },
  { id: "hat_halo", name: "Halo", price: 3500, type: "hat", color: 0xffffaa },
  { id: "hat_viking", name: "Viking Helmet", price: 2500, type: "hat", color: 0x886644 },
  { id: "hat_party", name: "Party Hat", price: 1000, type: "hat", color: 0xff44aa },
  { id: "hat_chef", name: "Chef Hat", price: 1500, type: "hat", color: 0xffffff },

  // --- Trails ---
  { id: "trail_none", name: "No Trail", price: 0, type: "trail", color: null },
  { id: "trail_ekg", name: "EKG Line", price: 2000, type: "trail", color: 0x00ff44 },
  { id: "trail_neural", name: "Neural Sparks", price: 2500, type: "trail", color: 0xaa44ff },
  { id: "trail_blood", name: "Blood Cells", price: 2000, type: "trail", color: 0xff2222 },
  { id: "trail_dna", name: "DNA Helix", price: 3000, type: "trail", color: 0x4488ff },
  { id: "trail_fire", name: "Fire Trail", price: 3500, type: "trail", color: 0xff8800 },
  { id: "trail_rainbow", name: "Rainbow", price: 4000, type: "trail", color: 0xff44ff },

  // --- Gear ---
  { id: "gear_none", name: "No Gear", price: 0, type: "gear", color: null },
  { id: "gear_steth", name: "Stethoscope", price: 1000, type: "gear", color: 0x888888 },
  { id: "gear_clip", name: "Clipboard", price: 800, type: "gear", color: 0x8d6e3f },
  { id: "gear_syringe", name: "Syringe", price: 1200, type: "gear", color: 0x44aaff },
  { id: "gear_defib", name: "Defib Paddles", price: 2500, type: "gear", color: 0xff4444 },
  { id: "gear_hammer", name: "Reflex Hammer", price: 1500, type: "gear", color: 0xcc6622 },
  { id: "gear_mask", name: "Surgical Mask", price: 600, type: "gear", color: 0x88ccdd },
];

// ===== QUESTS =====
export var QUESTS = [
  { id: "q_streak8", title: "Hot Streak", desc: "8 correct in one run", target: 8, reward: 500 },
  { id: "q_25enc", title: "Marathon", desc: "25 total encounters", target: 25, reward: 600 },
  { id: "q_daily", title: "Daily Rounds", desc: "Complete a daily round", target: 1, reward: 800 },
  { id: "q_10correct", title: "Sharp Mind", desc: "10 correct answers", target: 10, reward: 400 },
  { id: "q_50coins", title: "Coin Collector", desc: "Collect 100 coins in one run", target: 100, reward: 500 },
  { id: "q_3powerups", title: "Powered Up", desc: "Collect 3 power-ups in one run", target: 3, reward: 700 },
];

// ===== ACHIEVEMENTS =====
// Each achievement has a unique id, display name, description, icon,
// and a condition string that describes when it should be unlocked.
// The actual checking logic lives in storage.js checkAchievements().
export var ACHIEVEMENTS = [
  // --- First steps ---
  { id: "ach_first_run", name: "First Steps", desc: "Complete your first run", icon: "🏃", condition: "totalEncounters >= 1" },
  { id: "ach_perfect_run", name: "Perfect Run", desc: "Complete a run with 100% accuracy", icon: "💯", condition: "perfectRun" },

  // --- Streak milestones ---
  { id: "ach_streak_10", name: "On Fire", desc: "Get a 10-card streak", icon: "🔥", condition: "bestStreak >= 10" },
  { id: "ach_streak_25", name: "Unstoppable", desc: "Get a 25-card streak", icon: "⚡", condition: "bestStreak >= 25" },
  { id: "ach_streak_50", name: "Legendary", desc: "Get a 50-card streak", icon: "👑", condition: "bestStreak >= 50" },

  // --- Score milestones ---
  { id: "ach_score_1000", name: "Rising Star", desc: "Score 1,000 points in one run", icon: "⭐", condition: "score >= 1000" },
  { id: "ach_score_5000", name: "High Achiever", desc: "Score 5,000 points in one run", icon: "🌟", condition: "score >= 5000" },
  { id: "ach_score_10000", name: "Board Certified", desc: "Score 10,000 points in one run", icon: "🏆", condition: "score >= 10000" },

  // --- Coin milestones ---
  { id: "ach_coins_500", name: "Piggy Bank", desc: "Accumulate 500 total coins", icon: "🪙", condition: "totalCoins >= 500" },
  { id: "ach_coins_5000", name: "Wealthy Doc", desc: "Accumulate 5,000 total coins", icon: "💰", condition: "totalCoins >= 5000" },

  // --- Encounter milestones ---
  { id: "ach_encounters_100", name: "Seasoned", desc: "Answer 100 total cards", icon: "📚", condition: "totalEncounters >= 100" },
  { id: "ach_encounters_500", name: "Veteran", desc: "Answer 500 total cards", icon: "🎖️", condition: "totalEncounters >= 500" },
  { id: "ach_encounters_1000", name: "Grand Master", desc: "Answer 1,000 total cards", icon: "🏅", condition: "totalEncounters >= 1000" },

  // --- Daily streak milestones ---
  { id: "ach_daily_3", name: "Consistent", desc: "Complete 3 daily rounds", icon: "📅", condition: "dailyStreak >= 3" },
  { id: "ach_daily_7", name: "Dedicated", desc: "Complete 7 daily rounds", icon: "🗓️", condition: "dailyStreak >= 7" },
  { id: "ach_daily_30", name: "Committed", desc: "Complete 30 daily rounds", icon: "💪", condition: "dailyStreak >= 30" },

  // --- Special achievements ---
  { id: "ach_all_subjects", name: "Renaissance Doc", desc: "Answer cards from all 15 subjects", icon: "🌍", condition: "allSubjectsTouched" },
  { id: "ach_custom_card", name: "Card Creator", desc: "Create your first custom card", icon: "📝", condition: "customCardCreated" },
  { id: "ach_speed_max", name: "Speed Demon", desc: "Complete a run at speed 10", icon: "🏎️", condition: "maxSpeedRun" },
  { id: "ach_buy_first", name: "Shopper", desc: "Buy your first item from the Locker", icon: "🛍️", condition: "firstPurchase" },
];

// ===== CONTINUE COST =====
// How many coins it costs to continue after losing all lives
export var CONTINUE_COST = 50;
