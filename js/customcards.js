/**
 * customcards.js — User-created custom cards
 *
 * Stores custom cards in localStorage separately from save data.
 * Custom cards use the same schema as built-in cards so they
 * seamlessly enter the card selection pool during gameplay.
 *
 * Design follows the established pattern of storing user-created
 * content in localStorage for zero-server-infrastructure operation.
 */

import { SUBJECTS } from './cards.js';
import { storage } from './storage.js';

var CUSTOM_CARDS_KEY = 'buzzword_dash_custom_cards';

export var customCards = {

  // Get all custom cards
  getAll: function () {
    try {
      var raw = localStorage.getItem(CUSTOM_CARDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  // Save all custom cards
  saveAll: function (cards) {
    try {
      localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(cards));
    } catch (e) {
      console.warn('Could not save custom cards');
    }
  },

  // Add a new custom card
  add: function (cardData) {
    var cards = this.getAll();
    var card = {
      id: 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      subj: cardData.subject,
      bw: cardData.buzzwords,
      ans: cardData.answer,
      d: cardData.distractors,
      tp: cardData.teachingPoint,
      ww: {},
      isCustom: true,
      createdAt: Date.now()
    };

    // Build why-wrong if provided
    if (cardData.whyWrong1) card.ww[cardData.distractors[0]] = cardData.whyWrong1;
    if (cardData.whyWrong2) card.ww[cardData.distractors[1]] = cardData.whyWrong2;

    cards.push(card);
    this.saveAll(cards);
    return card;
  },

  // Update an existing custom card
  update: function (cardId, cardData) {
    var cards = this.getAll();
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id === cardId) {
        cards[i].subj = cardData.subject;
        cards[i].bw = cardData.buzzwords;
        cards[i].ans = cardData.answer;
        cards[i].d = cardData.distractors;
        cards[i].tp = cardData.teachingPoint;
        cards[i].ww = {};
        if (cardData.whyWrong1) cards[i].ww[cardData.distractors[0]] = cardData.whyWrong1;
        if (cardData.whyWrong2) cards[i].ww[cardData.distractors[1]] = cardData.whyWrong2;
        cards[i].updatedAt = Date.now();
        break;
      }
    }
    this.saveAll(cards);
  },

  // Delete a custom card
  remove: function (cardId) {
    var cards = this.getAll();
    var filtered = cards.filter(function (c) { return c.id !== cardId; });
    this.saveAll(filtered);
  },

  // Get count
  count: function () {
    return this.getAll().length;
  },

  // Validate a card before saving
  validate: function (cardData) {
    var errors = [];
    if (!cardData.subject || SUBJECTS.indexOf(cardData.subject) < 0) {
      errors.push('Please select a valid subject.');
    }
    if (!cardData.buzzwords || cardData.buzzwords.length < 1 || cardData.buzzwords[0].trim() === '') {
      errors.push('At least one buzzword is required.');
    }
    if (!cardData.answer || cardData.answer.trim() === '') {
      errors.push('Correct answer is required.');
    }
    if (!cardData.distractors || cardData.distractors.length < 2 ||
        cardData.distractors[0].trim() === '' || cardData.distractors[1].trim() === '') {
      errors.push('Two distractors (wrong answers) are required.');
    }
    if (!cardData.teachingPoint || cardData.teachingPoint.trim() === '') {
      errors.push('A teaching point is required.');
    }

    // Check for answer leaking in buzzwords
    if (cardData.answer && cardData.buzzwords) {
      var ansWords = cardData.answer.toLowerCase().split(/[\s\-\/\(\)]+/).filter(function (w) {
        return w.length > 4;
      });
      for (var b = 0; b < cardData.buzzwords.length; b++) {
        var bwLower = cardData.buzzwords[b].toLowerCase();
        for (var w = 0; w < ansWords.length; w++) {
          if (bwLower.indexOf(ansWords[w]) >= 0) {
            errors.push('Warning: Buzzword "' + cardData.buzzwords[b] + '" contains the answer word "' + ansWords[w] + '". Consider rephrasing.');
            break;
          }
        }
      }
    }

    return errors;
  },

  // Export all custom cards as JSON string (for sharing/backup)
  exportJSON: function () {
    return JSON.stringify(this.getAll(), null, 2);
  },

  // Import cards from JSON string
  importJSON: function (jsonString) {
    try {
      var imported = JSON.parse(jsonString);
      if (!Array.isArray(imported)) return { success: false, message: 'Invalid format — expected an array.' };
      var existing = this.getAll();
      var count = 0;
      for (var i = 0; i < imported.length; i++) {
        var card = imported[i];
        // Assign new ID to avoid conflicts
        card.id = 'custom_' + Date.now() + '_' + i;
        card.isCustom = true;
        card.importedAt = Date.now();
        existing.push(card);
        count++;
      }
      this.saveAll(existing);
      return { success: true, message: 'Imported ' + count + ' cards.' };
    } catch (e) {
      return { success: false, message: 'Invalid JSON: ' + e.message };
    }
  }
};
