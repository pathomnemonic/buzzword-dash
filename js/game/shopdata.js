/**
 * shopdata.js — Shop items, quests, avatar definitions, and achievements
 *
 * MASSIVELY EXPANDED:
 * - 13 avatars (6 original + Golden Doctor + 3 vehicles + 3 new characters)
 * - 60+ shop items across skins, hats, trails, gear, and NEW clothing slot
 * - Rebalanced prices for abundant coin economy
 * - 12 quests with scaled rewards
 * - 50+ achievement badge definitions
 * - Continue cost constant
 *
 * Vehicle avatars have isVehicle: true and vehicleType for player.js
 * Clothing items have type: "clothing" for the new equipment slot
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
        shoeColor: 0xff3333,
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
    },
    // ===== Golden Doctor — secret unlock =====
    {
        id: "avatar_golden",
        name: "Golden Doctor",
        desc: "Flawless diagnostician — 0 wrong, 20+ correct",
        price: 0,
        bodyColor: 0xffd700,
        pantsColor: 0xdaa520,
        shoeColor: 0xff8c00,
        skinColor: 0xffe4b5,
        hairColor: 0xb8860b,
        scale: 1.08,
        legSpeed: 1.0,
        armSwing: 1.0,
        icon: "🏆",
        hidden: true
    },
    // ===== NEW: Vehicle Avatars =====
    {
        id: "avatar_ambulance",
        name: "Ambulance",
        desc: "Wee-woo wee-woo! Rush to the rescue",
        price: 6000,
        isVehicle: true,
        vehicleType: "ambulance",
        bodyColor: 0xf0f0f0,
        pantsColor: 0xdddddd,
        shoeColor: 0x333333,
        skinColor: 0xf0f0f0,
        hairColor: 0xff2222,
        scale: 1.3,
        legSpeed: 1.0,
        armSwing: 0.0,
        icon: "🚑"
    },
    {
        id: "avatar_racecar",
        name: "Race Car",
        desc: "Speed through your boards!",
        price: 7000,
        isVehicle: true,
        vehicleType: "racecar",
        bodyColor: 0xdd2222,
        pantsColor: 0x222222,
        shoeColor: 0x333333,
        skinColor: 0xdd2222,
        hairColor: 0xffffff,
        scale: 1.2,
        legSpeed: 1.0,
        armSwing: 0.0,
        icon: "🏎️"
    },
    {
        id: "avatar_hearse",
        name: "Hearse",
        desc: "For when the boards go wrong...",
        price: 8000,
        isVehicle: true,
        vehicleType: "hearse",
        bodyColor: 0x222222,
        pantsColor: 0x111111,
        shoeColor: 0x333333,
        skinColor: 0x222222,
        hairColor: 0x6622aa,
        scale: 1.3,
        legSpeed: 0.8,
        armSwing: 0.0,
        glowColor: 0x8844cc,
        icon: "⚰️"
    },
    // ===== NEW: Character Avatars =====
    {
        id: "avatar_nurse",
        name: "Nurse",
        desc: "The backbone of healthcare",
        price: 2000,
        bodyColor: 0xffffff,
        pantsColor: 0xffffff,
        shoeColor: 0xffffff,
        skinColor: 0xffccaa,
        hairColor: 0x553322,
        scale: 1.0,
        legSpeed: 1.0,
        armSwing: 1.0,
        icon: "👩‍⚕️"
    },
    {
        id: "avatar_surgeon",
        name: "Surgeon",
        desc: "Scrubbed in and ready",
        price: 3500,
        bodyColor: 0x338855,
        pantsColor: 0x226644,
        shoeColor: 0x44aa66,
        skinColor: 0xffccaa,
        hairColor: 0x221100,
        scale: 1.0,
        legSpeed: 0.95,
        armSwing: 0.9,
        icon: "🔪"
    },
    {
        id: "avatar_skeleton",
        name: "Skeleton",
        desc: "Study anatomy from the inside",
        price: 4000,
        bodyColor: 0xeeeedd,
        pantsColor: 0xddddcc,
        shoeColor: 0xccccbb,
        skinColor: 0xeeeedd,
        hairColor: 0xeeeedd,
        scale: 0.95,
        legSpeed: 1.1,
        armSwing: 1.2,
        icon: "💀"
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
    { id: "avatar_golden", name: "Golden Doctor", price: 0, type: "skin", color: 0xffd700, icon: "🏆", hidden: true },
    // NEW vehicle skins
    { id: "avatar_ambulance", name: "Ambulance", price: 6000, type: "skin", color: 0xf0f0f0, icon: "🚑" },
    { id: "avatar_racecar", name: "Race Car", price: 7000, type: "skin", color: 0xdd2222, icon: "🏎️" },
    { id: "avatar_hearse", name: "Hearse", price: 8000, type: "skin", color: 0x222222, icon: "⚰️" },
    // NEW character skins
    { id: "avatar_nurse", name: "Nurse", price: 2000, type: "skin", color: 0xffffff, icon: "👩‍⚕️" },
    { id: "avatar_surgeon", name: "Surgeon", price: 3500, type: "skin", color: 0x338855, icon: "🔪" },
    { id: "avatar_skeleton", name: "Skeleton", price: 4000, type: "skin", color: 0xeeeedd, icon: "💀" },

    // --- Hats ---
    { id: "hat_none", name: "No Hat", price: 0, type: "hat", color: null },
    { id: "hat_cap", name: "Scrub Cap", price: 800, type: "hat", color: 0x40c4ff },
    { id: "hat_headlamp", name: "Headlamp", price: 1200, type: "hat", color: 0xffd740 },
    { id: "hat_crown", name: "Golden Crown", price: 5000, type: "hat", color: 0xffd700 },
    { id: "hat_halo", name: "Halo", price: 3500, type: "hat", color: 0xffffaa },
    { id: "hat_viking", name: "Viking Helmet", price: 2500, type: "hat", color: 0x886644 },
    { id: "hat_party", name: "Party Hat", price: 1000, type: "hat", color: 0xff44aa },
    { id: "hat_chef", name: "Chef Hat", price: 1500, type: "hat", color: 0xffffff },
    // NEW hats
    { id: "hat_graduation", name: "Graduation Cap", price: 2000, type: "hat", color: 0x111111 },
    { id: "hat_headmirror", name: "Head Mirror", price: 1000, type: "hat", color: 0xcccccc },
    { id: "hat_bandana", name: "Bandana", price: 600, type: "hat", color: 0xff4444 },
    { id: "hat_tophat", name: "Top Hat", price: 3000, type: "hat", color: 0x111111 },
    { id: "hat_beanie", name: "Beanie", price: 400, type: "hat", color: 0x4466aa },
    { id: "hat_cowboy", name: "Cowboy Hat", price: 1500, type: "hat", color: 0x886644 },
    { id: "hat_tiara", name: "Tiara", price: 4000, type: "hat", color: 0xffd700 },
    { id: "hat_propeller", name: "Propeller Hat", price: 800, type: "hat", color: 0xff4488 },

    // --- Trails ---
    { id: "trail_none", name: "No Trail", price: 0, type: "trail", color: null },
    { id: "trail_ekg", name: "EKG Line", price: 2000, type: "trail", color: 0x00ff44 },
    { id: "trail_neural", name: "Neural Sparks", price: 2500, type: "trail", color: 0xaa44ff },
    { id: "trail_blood", name: "Blood Cells", price: 2000, type: "trail", color: 0xff2222 },
    { id: "trail_dna", name: "DNA Helix", price: 3000, type: "trail", color: 0x4488ff },
    { id: "trail_fire", name: "Fire Trail", price: 3500, type: "trail", color: 0xff8800 },
    { id: "trail_rainbow", name: "Rainbow", price: 4000, type: "trail", color: 0xff44ff },
    // NEW trails
    { id: "trail_confetti", name: "Confetti", price: 3000, type: "trail", color: 0xff4444 },
    { id: "trail_hearts", name: "Hearts", price: 2500, type: "trail", color: 0xff4488 },
    { id: "trail_lightning", name: "Lightning", price: 3500, type: "trail", color: 0xffff44 },
    { id: "trail_bubbles", name: "Bubbles", price: 2000, type: "trail", color: 0x88ddff },
    { id: "trail_music", name: "Music Notes", price: 2500, type: "trail", color: 0xff88ff },
    { id: "trail_pills", name: "Pill Trail", price: 1500, type: "trail", color: 0xff4444 },

    // --- Gear ---
    { id: "gear_none", name: "No Gear", price: 0, type: "gear", color: null },
    { id: "gear_steth", name: "Stethoscope", price: 1000, type: "gear", color: 0x888888 },
    { id: "gear_clip", name: "Clipboard", price: 800, type: "gear", color: 0x8d6e3f },
    { id: "gear_syringe", name: "Syringe", price: 1200, type: "gear", color: 0x44aaff },
    { id: "gear_defib", name: "Defib Paddles", price: 2500, type: "gear", color: 0xff4444 },
    { id: "gear_hammer", name: "Reflex Hammer", price: 1500, type: "gear", color: 0xcc6622 },
    { id: "gear_mask", name: "Surgical Mask", price: 600, type: "gear", color: 0x88ccdd },
    // NEW gear
    { id: "gear_coffee", name: "Coffee Cup", price: 500, type: "gear", color: 0x8B4513 },
    { id: "gear_textbook", name: "Medical Textbook", price: 700, type: "gear", color: 0x2255aa },
    { id: "gear_badge", name: "Hospital Badge", price: 300, type: "gear", color: 0xffffff },
    { id: "gear_wings", name: "Angel Wings", price: 5000, type: "gear", color: 0xffffff },
    { id: "gear_backpack", name: "Backpack", price: 1500, type: "gear", color: 0x44aa44 },
    { id: "gear_shield_item", name: "Shield", price: 2500, type: "gear", color: 0x4488ff },
    { id: "gear_katana", name: "Bone Saw", price: 3000, type: "gear", color: 0xcccccc },

    // --- NEW: Clothing ---
    { id: "cloth_none", name: "No Clothing", price: 0, type: "clothing", color: null },
    { id: "cloth_scrubs", name: "Medical Scrubs", price: 500, type: "clothing", color: 0x4488cc },
    { id: "cloth_labcoat", name: "Lab Coat", price: 1000, type: "clothing", color: 0xffffff },
    { id: "cloth_surgical_gown", name: "Surgical Gown", price: 800, type: "clothing", color: 0x44aa77 },
    { id: "cloth_hawaiian", name: "Hawaiian Shirt", price: 1500, type: "clothing", color: 0xff6644 },
    { id: "cloth_tuxedo", name: "Tuxedo", price: 3000, type: "clothing", color: 0x111111 },
    { id: "cloth_jersey", name: "Sports Jersey", price: 1200, type: "clothing", color: 0xff2222 },
    { id: "cloth_armor", name: "Body Armor", price: 4000, type: "clothing", color: 0x666677 },
    { id: "cloth_cape_red", name: "Red Cape", price: 2000, type: "clothing", color: 0xdd2222 },
    { id: "cloth_cape_rainbow", name: "Rainbow Cape", price: 5000, type: "clothing", color: 0xff44ff },
];

// ===== QUESTS =====
export var QUESTS = [
    { id: "q_streak8", title: "Hot Streak", desc: "8 correct in one run", target: 8, reward: 500 },
    { id: "q_25enc", title: "Marathon", desc: "25 total encounters", target: 25, reward: 600 },
    { id: "q_daily", title: "Daily Rounds", desc: "Complete a daily round", target: 1, reward: 800 },
    { id: "q_10correct", title: "Sharp Mind", desc: "10 correct answers", target: 10, reward: 400 },
    { id: "q_50coins", title: "Coin Collector", desc: "Collect 100 coins in one run", target: 100, reward: 500 },
    { id: "q_3powerups", title: "Powered Up", desc: "Collect 3 power-ups in one run", target: 3, reward: 700 },
    // NEW quests
    { id: "q_perfect5", title: "Perfect Five", desc: "Get 5 correct in a row without mistakes", target: 5, reward: 400 },
    { id: "q_speed3", title: "Speed Round", desc: "Answer 3 cards in under 2 seconds each", target: 3, reward: 600 },
    { id: "q_allsubjects", title: "Well-Rounded", desc: "Answer cards from 5 different subjects", target: 5, reward: 800 },
    { id: "q_jump5", title: "Parkour Pro", desc: "Jump over 5 obstacles in one run", target: 5, reward: 300 },
    { id: "q_slide5", title: "Limbo Master", desc: "Slide under 5 obstacles in one run", target: 5, reward: 300 },
    { id: "q_rush3", title: "Rush Hour", desc: "Rush through 3 gates in one run", target: 3, reward: 500 },
];

// ===== ACHIEVEMENTS =====
export var ACHIEVEMENTS = [
    // --- First steps ---
    { id: "ach_first_run", name: "First Steps", desc: "Complete your first run", icon: "🏃", condition: "totalEncounters >= 1" },
    { id: "ach_perfect_run", name: "Perfect Run", desc: "Complete a run with 100% accuracy", icon: "💯", condition: "perfectRun" },

    // --- Streak milestones ---
    { id: "ach_streak_10", name: "On Fire", desc: "Get a 10-card streak", icon: "🔥", condition: "bestStreak >= 10" },
    { id: "ach_streak_25", name: "Unstoppable", desc: "Get a 25-card streak", icon: "⚡", condition: "bestStreak >= 25" },
    { id: "ach_streak_50", name: "Legendary", desc: "Get a 50-card streak", icon: "👑", condition: "bestStreak >= 50" },
    { id: "ach_streak_100", name: "Mythical", desc: "Get a 100-card streak", icon: "🌟", condition: "bestStreak >= 100" },

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
    { id: "ach_golden_doctor", name: "Golden Doctor", desc: "Perfect run with 20+ correct answers", icon: "✨", condition: "wrong === 0 && correct >= 20" },

    // ===== NEW: Subject mastery achievements =====
    { id: "ach_master_neuro", name: "Neuro Master", desc: "80%+ accuracy in Neurology (50+ cards)", icon: "🧠", condition: "subjectMastery_Neurology" },
    { id: "ach_master_cardio", name: "Cardio Master", desc: "80%+ accuracy in Cardiology (50+ cards)", icon: "❤️", condition: "subjectMastery_Cardiology" },
    { id: "ach_master_nephro", name: "Nephro Master", desc: "80%+ accuracy in Nephrology (50+ cards)", icon: "🫘", condition: "subjectMastery_Nephrology" },
    { id: "ach_master_psych", name: "Psych Master", desc: "80%+ accuracy in Psychiatry (50+ cards)", icon: "🧩", condition: "subjectMastery_Psychiatry" },
    { id: "ach_master_gi", name: "GI Master", desc: "80%+ accuracy in Gastroenterology (50+ cards)", icon: "🫁", condition: "subjectMastery_Gastroenterology" },
    { id: "ach_master_pulm", name: "Pulm Master", desc: "80%+ accuracy in Pulmonology (50+ cards)", icon: "💨", condition: "subjectMastery_Pulmonology" },
    { id: "ach_master_id", name: "ID Master", desc: "80%+ accuracy in Infectious Disease (50+ cards)", icon: "🦠", condition: "subjectMastery_InfectiousDisease" },
    { id: "ach_master_endo", name: "Endo Master", desc: "80%+ accuracy in Endocrinology (50+ cards)", icon: "🦋", condition: "subjectMastery_Endocrinology" },
    { id: "ach_master_heme", name: "Heme Master", desc: "80%+ accuracy in Hematology/Oncology (50+ cards)", icon: "🩸", condition: "subjectMastery_HematologyOncology" },
    { id: "ach_master_rheum", name: "Rheum Master", desc: "80%+ accuracy in Rheumatology (50+ cards)", icon: "🦴", condition: "subjectMastery_Rheumatology" },
    { id: "ach_master_obgyn", name: "OB/GYN Master", desc: "80%+ accuracy in Obstetrics/Gynecology (50+ cards)", icon: "👶", condition: "subjectMastery_ObGyn" },
    { id: "ach_master_peds", name: "Peds Master", desc: "80%+ accuracy in Pediatrics (50+ cards)", icon: "🧒", condition: "subjectMastery_Pediatrics" },
    { id: "ach_master_surg", name: "Surgery Master", desc: "80%+ accuracy in Surgery (50+ cards)", icon: "🔪", condition: "subjectMastery_Surgery" },
    { id: "ach_master_em", name: "EM Master", desc: "80%+ accuracy in Emergency Medicine (50+ cards)", icon: "🚨", condition: "subjectMastery_EmergencyMedicine" },
    { id: "ach_master_multi", name: "Multi Master", desc: "80%+ accuracy in Multisystem (50+ cards)", icon: "🔬", condition: "subjectMastery_Multisystem" },

    // ===== NEW: Speed achievements =====
    { id: "ach_fast_500ms", name: "Quick Draw", desc: "Answer a card correctly in under 500ms", icon: "⚡", condition: "fastestAnswer < 500" },
    { id: "ach_fast_300ms", name: "Lightning Reflexes", desc: "Answer a card correctly in under 300ms", icon: "🌩️", condition: "fastestAnswer < 300" },

    // ===== NEW: Collection achievements =====
    { id: "ach_collect_10", name: "Collector", desc: "Own 10 items from the Locker", icon: "🎒", condition: "ownedItems >= 10" },
    { id: "ach_collect_25", name: "Hoarder", desc: "Own 25 items from the Locker", icon: "🏪", condition: "ownedItems >= 25" },
    { id: "ach_collect_all", name: "Completionist", desc: "Own every item in the Locker", icon: "💎", condition: "ownedAll" },

    // ===== NEW: Multiplayer achievements =====
    { id: "ach_mp_first", name: "Challenger", desc: "Play your first multiplayer match", icon: "🎮", condition: "multiplayerGamesPlayed >= 1" },
    { id: "ach_mp_win", name: "Victor", desc: "Win a multiplayer match", icon: "🥇", condition: "multiplayerWins >= 1" },
    { id: "ach_mp_win5", name: "Dominant", desc: "Win 5 multiplayer matches", icon: "🏆", condition: "multiplayerWins >= 5" },

    // ===== NEW: Vehicle achievements =====
    { id: "ach_vehicle_ambulance", name: "First Responder", desc: "Play as the Ambulance", icon: "🚑", condition: "playedAsAmbulance" },
    { id: "ach_vehicle_racecar", name: "Speed Racer", desc: "Play as the Race Car", icon: "🏎️", condition: "playedAsRacecar" },
    { id: "ach_vehicle_hearse", name: "Grim Rider", desc: "Play as the Hearse", icon: "⚰️", condition: "playedAsHearse" },

    // ===== NEW: Endurance achievements =====
    { id: "ach_endurance_30min", name: "Marathon Runner", desc: "Play for 30 minutes total", icon: "⏱️", condition: "totalPlayTime >= 1800" },
    { id: "ach_endurance_1hr", name: "Iron Will", desc: "Play for 1 hour total", icon: "🕐", condition: "totalPlayTime >= 3600" },

    // ===== NEW: Perfect accuracy achievements =====
    { id: "ach_perfect_10", name: "Sharpshooter", desc: "Get 10 perfect (0 wrong) runs", icon: "🎯", condition: "perfectRuns >= 10" },
    { id: "ach_perfect_50", name: "Flawless", desc: "Get 50 perfect runs", icon: "💫", condition: "perfectRuns >= 50" },
];

// ===== CONTINUE COST =====
export var CONTINUE_COST = 50;
