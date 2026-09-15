/**
 * flashcardmode.js — Standalone flashcard study mode
 *
 * Features:
 * - Spaced repetition prioritization (missed cards, unseen cards)
 * - Self-rating: "Got it" or "Missed it"
 * - Per-card stat tracking via storage
 * - Exam filter support
 * - Session summary with accuracy
 * - Review missed cards immediately after session
 */

import { CARDS, SUBJECTS, EXAM_FILTERS } from '../cards.js';
import { storage } from '../storage.js';
import { customCards } from '../customcards.js';

export class FlashcardMode {
    constructor() {
        this.cards = [];
        this.currentIndex = 0;
        this.results = []; // { card, correct }
        this.revealed = false;
        this.sessionActive = false;
        this.totalCards = 0;
    }

    /**
     * Start a flashcard session.
     * @param {string[]} subjects - Selected subjects
     * @param {string[]} examFilters - Selected exam filters (empty = all)
     * @param {number} cardCount - Number of cards in session
     */
    start(subjects, examFilters, cardCount) {
        var allCards = CARDS.concat(customCards.getAll());

        // Filter by subjects
        var pool = allCards;
        if (subjects && subjects.length > 0) {
            pool = pool.filter(function (c) {
                return subjects.indexOf(c.subj) >= 0;
            });
        }

        // Filter by exam tags if provided and cards have them
        if (examFilters && examFilters.length > 0) {
            pool = pool.filter(function (c) {
                if (!c.exams || c.exams.length === 0) return true; // include cards without exam tags
                for (var i = 0; i < examFilters.length; i++) {
                    if (c.exams.indexOf(examFilters[i]) >= 0) return true;
                }
                return false;
            });
        }

        // Filter out disabled cards
        var disabledCards = storage.get('disabledCards') || [];
        pool = pool.filter(function (c) {
            return disabledCards.indexOf(c.id) < 0;
        });

        if (pool.length === 0) {
            this.cards = [];
            this.sessionActive = false;
            return;
        }

        // Prioritize using spaced repetition weighting
        var now = Date.now();
        var weighted = pool.map(function (c) {
            var s = storage.getCardStat(c.id);
            var w = 10;

            // Cards never seen get highest priority
            if (s.seen === 0) {
                w *= 5;
            }

            // Cards with poor accuracy get higher weight
            if (s.seen > 0) {
                var accuracy = s.correct / s.seen;
                if (accuracy < 0.3) w *= 6;
                else if (accuracy < 0.5) w *= 4;
                else if (accuracy < 0.7) w *= 2;
                else if (accuracy > 0.9 && s.seen > 5) w *= 0.3;
            }

            // Spaced repetition: cards not seen recently get priority
            if (s.lastSeen > 0) {
                var hoursSince = (now - s.lastSeen) / (1000 * 60 * 60);
                if (hoursSince < 1) w *= 0.3;
                else if (hoursSince > 168) w *= 3;
                else if (hoursSince > 72) w *= 2;
                else if (hoursSince > 24) w *= 1.5;
            } else {
                w *= 3; // never seen
            }

            return { card: c, weight: Math.max(w, 0.01) };
        });

        // Weighted random selection
        var selected = [];
        var count = Math.min(cardCount || 20, weighted.length);

        for (var pick = 0; pick < count; pick++) {
            var total = 0;
            for (var i = 0; i < weighted.length; i++) total += weighted[i].weight;
            var r = Math.random() * total;
            var chosen = null;
            var chosenIdx = -1;
            for (var j = 0; j < weighted.length; j++) {
                r -= weighted[j].weight;
                if (r <= 0) {
                    chosen = weighted[j];
                    chosenIdx = j;
                    break;
                }
            }
            if (!chosen) {
                chosen = weighted[weighted.length - 1];
                chosenIdx = weighted.length - 1;
            }
            selected.push(chosen.card);
            weighted.splice(chosenIdx, 1);
            if (weighted.length === 0) break;
        }

        this.cards = selected;
        this.totalCards = selected.length;
        this.currentIndex = 0;
        this.results = [];
        this.revealed = false;
        this.sessionActive = true;
    }

    /**
     * Get the current card data for display.
     * @returns {object|null} { card, index, total, revealed }
     */
    getCurrentCard() {
        if (!this.sessionActive || this.currentIndex >= this.cards.length) return null;
        return {
            card: this.cards[this.currentIndex],
            index: this.currentIndex,
            total: this.totalCards,
            revealed: this.revealed
        };
    }

    /**
     * Get HTML string for the current card (buzzwords only).
     * @returns {string}
     */
    showCard() {
        var data = this.getCurrentCard();
        if (!data) return '<p>No cards available.</p>';
        var c = data.card;
        var diffStars = '';
        if (c.baseDifficulty) {
            for (var i = 0; i < c.baseDifficulty; i++) diffStars += '⭐';
        }
        var examTags = '';
        if (c.exams && c.exams.length > 0) {
            examTags = c.exams.map(function (e) {
                return '<span class="tag tag-subject">' + e + '</span>';
            }).join(' ');
        }
        return '<div class="fc-buzzwords">' + c.bw.join(' • ') + '</div>' +
            '<div class="fc-meta"><span class="tag tag-subject">' + c.subj + '</span> ' +
            (diffStars ? '<span style="font-size:10px">' + diffStars + '</span> ' : '') +
            (examTags ? '<div style="margin-top:4px">' + examTags + '</div>' : '') +
            '</div>';
    }

    /**
     * Reveal the answer for the current card.
     * @returns {string} HTML string with answer, teaching point, why-wrong
     */
    revealAnswer() {
        this.revealed = true;
        var data = this.getCurrentCard();
        if (!data) return '';
        var c = data.card;

        var wwHTML = '';
        if (c.ww) {
            for (var key in c.ww) {
                if (c.ww.hasOwnProperty(key)) {
                    wwHTML += '<div class="fc-ww-item"><strong>Why not "' + key + '":</strong> ' + c.ww[key] + '</div>';
                }
            }
        }

        return '<div class="fc-answer">✅ ' + c.ans + '</div>' +
            '<div class="fc-teaching">' + c.tp + '</div>' +
            (c.d ? '<div class="fc-distractors"><strong>Distractors:</strong> ' + c.d.join(', ') + '</div>' : '') +
            (wwHTML ? '<div class="fc-why-wrong">' + wwHTML + '</div>' : '');
    }

    /**
     * Mark the current card as correct and advance.
     */
    markCorrect() {
        if (!this.sessionActive || this.currentIndex >= this.cards.length) return;
        var card = this.cards[this.currentIndex];
        storage.updateCardStat(card.id, true);
        this.results.push({ card: card, correct: true });
        this.currentIndex++;
        this.revealed = false;

        // Track flashcard stats
        storage.set('flashcardCorrect', (storage.get('flashcardCorrect') || 0) + 1);
    }

    /**
     * Mark the current card as incorrect and advance.
     */
    markIncorrect() {
        if (!this.sessionActive || this.currentIndex >= this.cards.length) return;
        var card = this.cards[this.currentIndex];
        storage.updateCardStat(card.id, false);
        this.results.push({ card: card, correct: false });
        this.currentIndex++;
        this.revealed = false;

        // Track flashcard stats
        storage.set('flashcardWrong', (storage.get('flashcardWrong') || 0) + 1);
    }

    /**
     * Check if the session is complete.
     * @returns {boolean}
     */
    isComplete() {
        return this.currentIndex >= this.cards.length;
    }

    /**
     * Get progress info.
     * @returns {object} { current, total, correctSoFar, wrongSoFar }
     */
    getProgress() {
        var correct = 0;
        var wrong = 0;
        for (var i = 0; i < this.results.length; i++) {
            if (this.results[i].correct) correct++;
            else wrong++;
        }
        return {
            current: this.currentIndex + 1,
            total: this.totalCards,
            correctSoFar: correct,
            wrongSoFar: wrong
        };
    }

    /**
     * Get session summary.
     * @returns {object} { total, correct, wrong, accuracy, cards }
     */
    getSummary() {
        var correct = 0;
        var wrong = 0;
        for (var i = 0; i < this.results.length; i++) {
            if (this.results[i].correct) correct++;
            else wrong++;
        }
        var total = correct + wrong;

        // Update session count
        storage.set('flashcardSessions', (storage.get('flashcardSessions') || 0) + 1);
        storage.addCardsStudied(total);

        return {
            total: total,
            correct: correct,
            wrong: wrong,
            accuracy: total > 0 ? Math.round(correct / total * 100) : 0,
            cards: this.results
        };
    }

    /**
     * Get missed cards from the session.
     * @returns {object[]} Array of { card, correct: false }
     */
    getMissedCards() {
        return this.results.filter(function (r) { return !r.correct; });
    }

    /**
     * Start a review session with only missed cards.
     */
    reviewMissed() {
        var missed = this.getMissedCards();
        if (missed.length === 0) return;

        this.cards = missed.map(function (r) { return r.card; });
        this.totalCards = this.cards.length;
        this.currentIndex = 0;
        this.results = [];
        this.revealed = false;
        this.sessionActive = true;
    }

    /**
     * End the session.
     */
    end() {
        this.sessionActive = false;
        this.cards = [];
        this.currentIndex = 0;
        this.results = [];
        this.revealed = false;
    }
}
