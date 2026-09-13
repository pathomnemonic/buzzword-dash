/**
 * shopdata.js — Shop items and quest definitions
 */

export const SHOP_ITEMS = [
  { id: "skin_scrubs", name: "Blue Scrubs", price: 0, type: "skin", color: 0x2288dd },
  { id: "skin_gold", name: "Gold Scrubs", price: 500, type: "skin", color: 0xffd740 },
  { id: "skin_white", name: "White Coat", price: 300, type: "skin", color: 0xe8e8f0 },
  { id: "skin_green", name: "Surgical Green", price: 400, type: "skin", color: 0x22aa66 },
  { id: "skin_red", name: "Emergency Red", price: 450, type: "skin", color: 0xdd3333 },
  { id: "hat_none", name: "No Hat", price: 0, type: "hat", color: null },
  { id: "hat_cap", name: "Scrub Cap", price: 150, type: "hat", color: 0x40c4ff },
  { id: "hat_mirror", name: "Head Mirror", price: 250, type: "hat", color: 0xffd740 },
  { id: "gear_none", name: "No Gear", price: 0, type: "gear", color: null },
  { id: "gear_steth", name: "Stethoscope", price: 200, type: "gear", color: 0x888888 },
  { id: "gear_clip", name: "Clipboard", price: 175, type: "gear", color: 0x8d6e3f },
];

export const QUESTS = [
  { id: "q_streak8", title: "Hot Streak", desc: "8 correct in one run", target: 8, reward: 75 },
  { id: "q_25enc", title: "Marathon", desc: "25 total encounters", target: 25, reward: 80 },
  { id: "q_daily", title: "Daily Rounds", desc: "Complete a daily round", target: 1, reward: 100 },
  { id: "q_10correct", title: "Sharp Mind", desc: "10 correct answers", target: 10, reward: 50 },
  { id: "q_50coins", title: "Coin Collector", desc: "Collect 50 coins in one run", target: 50, reward: 60 },
];
