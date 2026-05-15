import { describe, expect, it } from 'vitest';
import type { Card, CardType } from '../cards';
import { computeScores } from '../score';
import { coreRule } from '../rules/core';
import { standardBonusesRule } from '../rules/standard-bonuses';
import type { GameState, Seat } from '../state';

function makeCard(type: CardType, idSuffix = '1'): Card {
  const category = type.startsWith('mile-')
    ? ('mileage' as const)
    : type.startsWith('hazard-')
      ? ('hazard' as const)
      : type.startsWith('remedy-')
        ? ('remedy' as const)
        : ('safety' as const);
  return { id: `${type}-${idSuffix}`, type, category };
}

function blankSeat(id: number, distance: Card[] = []): Seat {
  return {
    id,
    hand: [],
    tableau: { battle: [], speed: [], distance, safeties: [] },
  };
}

function makeEndedState(overrides: Partial<GameState> & { winnerSeat: number | null }): GameState {
  return {
    phase: 'ended',
    seats: [blankSeat(0), blankSeat(1)],
    deck: [],
    discard: [],
    currentSeat: 0,
    awaiting: null,
    rng: { seed: 1, stepCount: 0 },
    turnNumber: 100,
    handNumber: 1,
    target: 1000,
    ...overrides,
  } as GameState;
}

// Use [core, standard-bonuses] so we observe combined scoring entries.
const rules = [coreRule, standardBonusesRule];

describe('standard-bonuses', () => {
  it('awards Trip Completed (400) to the winner', () => {
    const distance = Array.from({ length: 10 }, (_, i) => makeCard('mile-100', `${i}`));
    const state = makeEndedState({
      winnerSeat: 0,
      seats: [
        blankSeat(0, distance),
        blankSeat(1, []),
      ],
      deck: [makeCard('mile-25', 'leftover')], // deck non-empty → no Delayed Action
    });
    const scores = computeScores(state, rules);
    const s0 = scores.find((s) => s.seat === 0)!;
    expect(s0.breakdown.map((b) => b.reason)).toContain('trip-completed');
    expect(s0.breakdown.find((b) => b.reason === 'trip-completed')?.points).toBe(400);
  });

  it('awards Delayed Action (300) when deck is empty at hand-end', () => {
    const distance = Array.from({ length: 10 }, (_, i) => makeCard('mile-100', `${i}`));
    const state = makeEndedState({
      winnerSeat: 0,
      seats: [blankSeat(0, distance), blankSeat(1, [])],
      deck: [],
    });
    const scores = computeScores(state, rules);
    const s0 = scores.find((s) => s.seat === 0)!;
    const delayedAction = s0.breakdown.find((b) => b.reason === 'delayed-action');
    expect(delayedAction).toBeDefined();
    expect(delayedAction?.points).toBe(300);
  });

  it('does NOT award Delayed Action when deck still has cards', () => {
    const distance = Array.from({ length: 10 }, (_, i) => makeCard('mile-100', `${i}`));
    const state = makeEndedState({
      winnerSeat: 0,
      seats: [blankSeat(0, distance), blankSeat(1, [])],
      deck: [makeCard('mile-25', 'leftover'), makeCard('mile-50', 'leftover2')],
    });
    const scores = computeScores(state, rules);
    const s0 = scores.find((s) => s.seat === 0)!;
    expect(s0.breakdown.find((b) => b.reason === 'delayed-action')).toBeUndefined();
  });

  it('awards Safe Trip (300) when winner played no 200-mile cards', () => {
    // 10×100 = 1000 km, no 200s
    const distance = Array.from({ length: 10 }, (_, i) => makeCard('mile-100', `${i}`));
    const state = makeEndedState({
      winnerSeat: 0,
      seats: [blankSeat(0, distance), blankSeat(1, [])],
      deck: [makeCard('mile-25', 'x')],
    });
    const scores = computeScores(state, rules);
    const s0 = scores.find((s) => s.seat === 0)!;
    const safeTrip = s0.breakdown.find((b) => b.reason === 'safe-trip');
    expect(safeTrip).toBeDefined();
    expect(safeTrip?.points).toBe(300);
  });

  it('does NOT award Safe Trip when winner played a 200-mile card', () => {
    const distance = [
      makeCard('mile-200', 'a'),
      makeCard('mile-200', 'b'),
      ...Array.from({ length: 6 }, (_, i) => makeCard('mile-100', `${i}`)),
    ];
    const state = makeEndedState({
      winnerSeat: 0,
      seats: [blankSeat(0, distance), blankSeat(1, [])],
      deck: [makeCard('mile-25', 'x')],
    });
    const scores = computeScores(state, rules);
    const s0 = scores.find((s) => s.seat === 0)!;
    expect(s0.breakdown.find((b) => b.reason === 'safe-trip')).toBeUndefined();
  });

  it('awards Shut-Out (500) when every opponent is at 0 km', () => {
    const distance = Array.from({ length: 10 }, (_, i) => makeCard('mile-100', `${i}`));
    const state = makeEndedState({
      winnerSeat: 0,
      seats: [blankSeat(0, distance), blankSeat(1, [])],
      deck: [makeCard('mile-25', 'x')],
    });
    const scores = computeScores(state, rules);
    const s0 = scores.find((s) => s.seat === 0)!;
    const shutOut = s0.breakdown.find((b) => b.reason === 'shut-out');
    expect(shutOut).toBeDefined();
    expect(shutOut?.points).toBe(500);
  });

  it('does NOT award Shut-Out when an opponent has > 0 km', () => {
    const distance = Array.from({ length: 10 }, (_, i) => makeCard('mile-100', `${i}`));
    const oppDistance = [makeCard('mile-25', 'opp')];
    const state = makeEndedState({
      winnerSeat: 0,
      seats: [blankSeat(0, distance), blankSeat(1, oppDistance)],
      deck: [makeCard('mile-25', 'x')],
    });
    const scores = computeScores(state, rules);
    const s0 = scores.find((s) => s.seat === 0)!;
    expect(s0.breakdown.find((b) => b.reason === 'shut-out')).toBeUndefined();
  });

  it('awards nothing when hand ends without a winner', () => {
    const distance = [makeCard('mile-100', 'a')];
    const state = makeEndedState({
      winnerSeat: null,
      seats: [blankSeat(0, distance), blankSeat(1, [])],
      deck: [],
    });
    const scores = computeScores(state, rules);
    for (const s of scores) {
      const reasons = s.breakdown.map((b) => b.reason);
      expect(reasons).not.toContain('trip-completed');
      expect(reasons).not.toContain('delayed-action');
      expect(reasons).not.toContain('safe-trip');
      expect(reasons).not.toContain('shut-out');
    }
  });
});
