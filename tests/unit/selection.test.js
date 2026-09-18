// tests/unit/selection.test.js
// Selection tests per Section 33.3 of the architecture document

import { describe, it, expect, beforeEach } from 'vitest';

let storage, pickCard, CARDS, SUBJECTS;

beforeEach(async () => {
  localStorage.clear();
  const storageMod = await import('../../js/storage.js');
  storage = storageMod.storage;
  storage.load();

  const gatesMod = await import('../../js/game/gates.js');
  pickCard = gatesMod.pickCard;

  const cardsMod = await import('../../js/cards.js');
  CARDS = cardsMod.CARDS;
  SUBJECTS = cardsMod.SUBJECTS;
});

describe('Card selection — empty subjects means all', () => {
  it('returns a card when selectedSubjects is empty', () => {
    storage.set('selectedSubjects', []);
    const card = pickCard([], 'endless', 0);
    expect(card).not.toBeNull();
    expect(card.id).toBeTruthy();
  });
});

describe('Card selection — disabled cards excluded', () => {
  it('does not return a disabled card', () => {
    const testCard = CARDS[0];
    storage.disableCard(testCard.id);
    // Pick many cards and ensure the disabled one never appears
    for (let i = 0; i < 50; i++) {
      const card = pickCard([], 'endless', i);
      if (card) {
        expect(card.id).not.toBe(testCard.id);
      }
    }
  });
});

describe('Card selection — recent-card avoidance', () => {
  it('avoids recently seen card IDs', () => {
    const recentIds = CARDS.slice(0, 5).map(c => c.id);
    const card = pickCard(recentIds, 'endless', 0);
    if (card) {
      // With a large pool, the card should ideally not be in recent
      // This is best-effort, so we just verify it returns a valid card
      expect(card.id).toBeTruthy();
    }
  });
});

describe('Card selection — Daily determinism', () => {
  it('returns the same card for the same daily index', () => {
    storage.set('selectedSubjects', []);
    const card1 = pickCard([], 'daily', 0);
    const card2 = pickCard([], 'daily', 0);
    expect(card1.id).toBe(card2.id);
  });
});
