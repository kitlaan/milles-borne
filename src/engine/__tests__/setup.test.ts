import { describe, expect, it } from 'vitest';
import { defaultRules } from '../rules';
import { STARTING_HAND_SIZE, createInitialState } from '../setup';
import { STANDARD_DECK_SIZE } from '../deck';

describe('createInitialState', () => {
  const rules = defaultRules();

  it('deals 6 cards to each of 2 seats', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    expect(state.seats.length).toBe(2);
    for (const seat of state.seats) {
      expect(seat.hand.length).toBe(STARTING_HAND_SIZE);
      expect(seat.tableau.battle).toEqual([]);
      expect(seat.tableau.speed).toEqual([]);
      expect(seat.tableau.distance).toEqual([]);
      expect(seat.tableau.safeties).toEqual([]);
    }
  });

  it('deck contains the remaining cards after dealing', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const dealt = STARTING_HAND_SIZE * state.seats.length;
    expect(state.deck.length).toBe(STANDARD_DECK_SIZE - dealt);
  });

  it('same seed produces identical initial state', () => {
    const a = createInitialState({ seats: 2, rules, seed: 42 });
    const b = createInitialState({ seats: 2, rules, seed: 42 });
    expect(a).toEqual(b);
  });

  it('different seeds produce different deals', () => {
    const a = createInitialState({ seats: 2, rules, seed: 1 });
    const b = createInitialState({ seats: 2, rules, seed: 2 });
    expect(a.seats[0]!.hand).not.toEqual(b.seats[0]!.hand);
  });

  it('starts in draw phase with seat 0 to act', () => {
    const state = createInitialState({ seats: 2, rules, seed: 5 });
    expect(state.phase).toBe('draw');
    expect(state.currentSeat).toBe(0);
    expect(state.awaiting).toBeNull();
    expect(state.winnerSeat).toBeNull();
    expect(state.target).toBe(1000);
    expect(state.handNumber).toBe(1);
    expect(state.turnNumber).toBe(0);
  });

  it('rejects fewer than 2 seats', () => {
    expect(() => createInitialState({ seats: 1, rules, seed: 1 })).toThrow();
  });
});
