import { describe, expect, it } from 'vitest';
import type { Action } from '@/engine/actions';
import type { Card } from '@/engine/cards';
import type { GameState } from '@/engine/state';
import type { SeatView } from '@/engine/view';
import {
  DEFAULT_GAMMA,
  SHAPING_COEFF,
  computeReturns,
  shapeStepReward,
  terminalReward,
} from '../reward';

function makeHand(cards: ReadonlyArray<Card>): ReadonlyArray<Card> {
  return cards;
}

function makeView(hand: ReadonlyArray<Card>): SeatView {
  return {
    self: { id: 0, hand, tableau: { battle: [], speed: [], distance: [], safeties: [] } },
    others: [],
    discard: [],
    discardTop: null,
    deckSize: 0,
    phase: 'action',
    currentSeat: 0,
    awaiting: null,
    turnNumber: 0,
    handNumber: 1,
    target: 1000,
  };
}

describe('shapeStepReward', () => {
  it('returns 0 for DRAW / DISCARD / COUP_FOURRE / PASS_COUP_FOURRE', () => {
    const view = makeView([]);
    const actions: Action[] = [
      { seat: 0, type: 'DRAW' },
      { seat: 0, type: 'DISCARD', cardId: 'x' },
      { seat: 0, type: 'COUP_FOURRE', safetyCardId: 'y' },
      { seat: 0, type: 'PASS_COUP_FOURRE' },
    ];
    for (const a of actions) {
      expect(shapeStepReward(a, view)).toBe(0);
    }
  });

  it('returns 0 for PLAY on a non-mileage card', () => {
    const safety: Card = { id: 'rofw', type: 'safety-right-of-way', category: 'safety' };
    const view = makeView(makeHand([safety]));
    expect(
      shapeStepReward({ seat: 0, type: 'PLAY', cardId: 'rofw' }, view),
    ).toBe(0);
  });

  it('returns mile/1000 * SHAPING_COEFF for mileage plays', () => {
    const m200: Card = { id: 'm200', type: 'mile-200', category: 'mileage' };
    const m25: Card = { id: 'm25', type: 'mile-25', category: 'mileage' };
    const view = makeView(makeHand([m200, m25]));
    expect(
      shapeStepReward({ seat: 0, type: 'PLAY', cardId: 'm200' }, view),
    ).toBeCloseTo((200 / 1000) * SHAPING_COEFF, 6);
    expect(
      shapeStepReward({ seat: 0, type: 'PLAY', cardId: 'm25' }, view),
    ).toBeCloseTo((25 / 1000) * SHAPING_COEFF, 6);
  });

  it('returns 0 when PLAY refers to a card not in hand', () => {
    const view = makeView([]);
    expect(shapeStepReward({ seat: 0, type: 'PLAY', cardId: 'missing' }, view)).toBe(0);
  });
});

function endedState(winnerSeat: number | null): GameState {
  return {
    phase: 'ended',
    seats: [],
    deck: [],
    discard: [],
    currentSeat: 0,
    awaiting: null,
    rng: { seed: 1, stepCount: 0 },
    turnNumber: 0,
    handNumber: 1,
    target: 1000,
    winnerSeat,
  };
}

describe('terminalReward', () => {
  it('returns +1 for winner, -1 for loser', () => {
    const state = endedState(0);
    expect(terminalReward(0, state)).toBe(1);
    expect(terminalReward(1, state)).toBe(-1);
  });

  it('returns 0 for a draw (no winner)', () => {
    const state = endedState(null);
    expect(terminalReward(0, state)).toBe(0);
    expect(terminalReward(1, state)).toBe(0);
  });

  it('returns 0 when the episode has not ended', () => {
    const state: GameState = { ...endedState(0), phase: 'action' };
    expect(terminalReward(0, state)).toBe(0);
  });
});

describe('computeReturns', () => {
  it('returns an empty array when there are no steps', () => {
    expect(computeReturns([], 1, 0.99)).toEqual([]);
  });

  it('with zero step rewards and gamma=1, every return equals terminal', () => {
    expect(computeReturns([0, 0, 0], 1, 1)).toEqual([1, 1, 1]);
    expect(computeReturns([0, 0, 0], -1, 1)).toEqual([-1, -1, -1]);
  });

  it('discounts terminal reward by gamma^(T - t)', () => {
    // T=3, gamma=0.5, terminal=1, no step rewards: returns[2] = 0.5,
    // returns[1] = 0.25, returns[0] = 0.125
    expect(computeReturns([0, 0, 0], 1, 0.5)).toEqual([0.125, 0.25, 0.5]);
  });

  it('accumulates step rewards forward with discounting', () => {
    // Step rewards [0.1, 0.1, 0.1], terminal 1, gamma 1.
    // G[2] = 0.1 + 1*1 = 1.1
    // G[1] = 0.1 + 1*1.1 = 1.2
    // G[0] = 0.1 + 1*1.2 = 1.3
    const r = computeReturns([0.1, 0.1, 0.1], 1, 1);
    expect(r[0]).toBeCloseTo(1.3, 9);
    expect(r[1]).toBeCloseTo(1.2, 9);
    expect(r[2]).toBeCloseTo(1.1, 9);
  });

  it('default gamma is the public DEFAULT_GAMMA constant', () => {
    const r = computeReturns([0], 1);
    expect(r[0]).toBeCloseTo(DEFAULT_GAMMA, 6);
  });
});
