import { describe, expect, it } from 'vitest';
import { mileValueOf } from '../cards';
import { STANDARD_DECK_SIZE, buildDeck } from '../deck';

describe('deck', () => {
  const deck = buildDeck();

  it('contains 106 cards', () => {
    expect(deck.length).toBe(STANDARD_DECK_SIZE);
  });

  it('all card ids are unique', () => {
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });

  it('mile value derivable from type for mileage cards, null otherwise', () => {
    for (const c of deck) {
      if (c.category === 'mileage') {
        const v = mileValueOf(c.type);
        expect(v).toBeTypeOf('number');
        expect(c.type).toBe(`mile-${v}`);
      } else {
        expect(mileValueOf(c.type)).toBeNull();
      }
    }
  });

  it('composition matches the standard deck', () => {
    const counts = new Map<string, number>();
    for (const c of deck) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
    const expected: Record<string, number> = {
      'remedy-roll': 14,
      'remedy-end-of-limit': 6,
      'remedy-gasoline': 6,
      'remedy-spare-tire': 6,
      'remedy-repairs': 6,
      'hazard-stop': 5,
      'hazard-speed-limit': 4,
      'hazard-out-of-gas': 3,
      'hazard-flat-tire': 3,
      'hazard-accident': 3,
      'mile-25': 10,
      'mile-50': 10,
      'mile-75': 10,
      'mile-100': 12,
      'mile-200': 4,
      'safety-right-of-way': 1,
      'safety-driving-ace': 1,
      'safety-extra-tank': 1,
      'safety-puncture-proof': 1,
    };
    for (const [type, count] of Object.entries(expected)) {
      expect(counts.get(type), type).toBe(count);
    }
    const sum = Object.values(expected).reduce((a, b) => a + b, 0);
    expect(sum).toBe(STANDARD_DECK_SIZE);
  });

  it('categories are assigned correctly', () => {
    for (const c of deck) {
      if (c.type.startsWith('mile-')) expect(c.category).toBe('mileage');
      else if (c.type.startsWith('hazard-')) expect(c.category).toBe('hazard');
      else if (c.type.startsWith('remedy-')) expect(c.category).toBe('remedy');
      else if (c.type.startsWith('safety-')) expect(c.category).toBe('safety');
    }
  });
});
