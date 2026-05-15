import { describe, expect, it } from 'vitest';
import type { Card, CardType } from '../cards';
import { legalActions } from '../legal';
import { IllegalActionError, reduce } from '../reducer';
import { defaultRules } from '../rules';
import type { GameState, Seat } from '../state';
import { sumDistance, topOf } from '../tableau-query';

// Helpers — construct a minimal state for targeted tests rather than relying
// on dealt hands.

function makeCard(type: CardType, idSuffix = '1'): Card {
  const category = type.startsWith('mile-')
    ? ('mileage' as const)
    : type.startsWith('hazard-')
      ? ('hazard' as const)
      : type.startsWith('remedy-')
        ? ('remedy' as const)
        : ('safety' as const);
  const card: Card = { id: `${type}-${idSuffix}`, type, category };
  return card;
}

function blankSeat(id: number, hand: Card[] = []): Seat {
  return {
    id,
    hand,
    tableau: { battle: [], speed: [], distance: [], safeties: [] },
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  const base: GameState = {
    phase: 'action',
    seats: [blankSeat(0), blankSeat(1)],
    deck: [],
    discard: [],
    currentSeat: 0,
    awaiting: null,
    rng: { seed: 1, stepCount: 0 },
    turnNumber: 0,
    handNumber: 1,
    target: 1000,
    winnerSeat: null,
  };
  return { ...base, ...overrides };
}

const rules = defaultRules();

describe('reducer — DRAW', () => {
  it('moves a card from deck to current seat hand', () => {
    const card = makeCard('mile-25');
    const state = makeState({
      phase: 'draw',
      seats: [blankSeat(0), blankSeat(1)],
      deck: [card],
    });
    const after = reduce(state, { seat: 0, type: 'DRAW' }, rules);
    expect(after.seats[0]!.hand).toEqual([card]);
    expect(after.deck).toEqual([]);
    expect(after.phase).toBe('action');
  });

  it('with empty deck, advances to action phase without drawing', () => {
    const state = makeState({ phase: 'draw', deck: [] });
    const after = reduce(state, { seat: 0, type: 'DRAW' }, rules);
    expect(after.phase).toBe('action');
    expect(after.seats[0]!.hand).toEqual([]);
  });

  it('rejects DRAW when phase is action', () => {
    const state = makeState({ phase: 'action' });
    expect(() => reduce(state, { seat: 0, type: 'DRAW' }, rules)).toThrow(IllegalActionError);
  });

  it('rejects DRAW from non-current seat', () => {
    const state = makeState({ phase: 'draw' });
    expect(() => reduce(state, { seat: 1, type: 'DRAW' }, rules)).toThrow(IllegalActionError);
  });
});

describe('reducer — PLAY mile', () => {
  it('requires the seat to be rolling (Roll on battle pile)', () => {
    const mile = makeCard('mile-25');
    const state = makeState({
      seats: [blankSeat(0, [mile]), blankSeat(1)],
    });
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: mile.id }, rules),
    ).toThrow(/not rolling/);
  });

  it('plays a mile card after Roll, ends turn, advances seat', () => {
    const roll = makeCard('remedy-roll');
    const mile = makeCard('mile-50');
    const filler = makeCard('mile-25', 'filler');
    const state = makeState({
      deck: [filler],
      seats: [
        { id: 0, hand: [mile], tableau: { battle: [roll], speed: [], distance: [], safeties: [] } },
        blankSeat(1),
      ],
    });
    const after = reduce(state, { seat: 0, type: 'PLAY', cardId: mile.id }, rules);
    expect(after.seats[0]!.tableau.distance).toEqual([mile]);
    expect(after.seats[0]!.hand).toEqual([]);
    expect(after.currentSeat).toBe(1);
    expect(after.phase).toBe('draw');
    expect(sumDistance(after.seats[0]!)).toBe(50);
  });

  it('blocks 100/200 mile while speed-limited', () => {
    const roll = makeCard('remedy-roll');
    const speedLimit = makeCard('hazard-speed-limit');
    const m100 = makeCard('mile-100');
    const state = makeState({
      seats: [
        { id: 0, hand: [m100], tableau: { battle: [roll], speed: [speedLimit], distance: [], safeties: [] } },
        blankSeat(1),
      ],
    });
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: m100.id }, rules),
    ).toThrow(/speed limit/);
  });

  it('caps 200-mile plays at 2 per hand', () => {
    const roll = makeCard('remedy-roll');
    const m200a = makeCard('mile-200', 'a');
    const m200b = makeCard('mile-200', 'b');
    const m200c = makeCard('mile-200', 'c');
    const state = makeState({
      seats: [
        {
          id: 0,
          hand: [m200c],
          tableau: { battle: [roll], speed: [], distance: [m200a, m200b], safeties: [] },
        },
        blankSeat(1),
      ],
    });
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: m200c.id }, rules),
    ).toThrow(/200/);
  });

  it('rejects mile that would exceed target', () => {
    const roll = makeCard('remedy-roll');
    const next = makeCard('mile-100', 'next');
    // 950 km already (2x200 + 5x100 + 50); +100 would be 1050 > 1000.
    // Avoids tripping the 200-mile-per-hand cap.
    const distance = [
      makeCard('mile-200', 'a'),
      makeCard('mile-200', 'b'),
      makeCard('mile-100', 'a'),
      makeCard('mile-100', 'b'),
      makeCard('mile-100', 'c'),
      makeCard('mile-100', 'd'),
      makeCard('mile-100', 'e'),
      makeCard('mile-50', 'a'),
    ];
    const state = makeState({
      seats: [
        { id: 0, hand: [next], tableau: { battle: [roll], speed: [], distance, safeties: [] } },
        blankSeat(1),
      ],
    });
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: next.id }, rules),
    ).toThrow(/exceed/);
  });

  it('ends the hand and names winner when target reached', () => {
    const roll = makeCard('remedy-roll');
    const m100 = makeCard('mile-100');
    // Already at 900 with various cards
    const distance: Card[] = [
      makeCard('mile-200', 'a'),
      makeCard('mile-200', 'b'),
      makeCard('mile-200', 'c'),
      makeCard('mile-200', 'd'),
      makeCard('mile-100', 'e'),
    ];
    const state = makeState({
      seats: [
        { id: 0, hand: [m100], tableau: { battle: [roll], speed: [], distance, safeties: [] } },
        blankSeat(1),
      ],
    });
    const after = reduce(state, { seat: 0, type: 'PLAY', cardId: m100.id }, rules);
    expect(after.phase).toBe('ended');
    expect(after.winnerSeat).toBe(0);
    expect(sumDistance(after.seats[0]!)).toBe(1000);
  });
});

describe('reducer — PLAY hazard / remedy', () => {
  it('hazard targeting a rolling opponent goes on their battle pile', () => {
    const roll = makeCard('remedy-roll');
    const hazard = makeCard('hazard-accident');
    const filler = makeCard('mile-25', 'filler');
    const state = makeState({
      // non-empty deck so endTurn doesn't trigger end-of-hand on empty hands
      deck: [filler],
      seats: [
        { id: 0, hand: [hazard], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        { id: 1, hand: [], tableau: { battle: [roll], speed: [], distance: [], safeties: [] } },
      ],
    });
    const after = reduce(
      state,
      { seat: 0, type: 'PLAY', cardId: hazard.id, targetSeat: 1 },
      rules,
    );
    expect(topOf(after.seats[1]!.tableau.battle)?.id).toBe(hazard.id);
    expect(after.phase).toBe('draw');
    expect(after.currentSeat).toBe(1);
  });

  it('hazard against a non-rolling opponent is illegal', () => {
    const hazard = makeCard('hazard-accident');
    const state = makeState({
      seats: [
        { id: 0, hand: [hazard], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        blankSeat(1),
      ],
    });
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: hazard.id, targetSeat: 1 }, rules),
    ).toThrow(/not rolling/);
  });

  it('remedy plays only against matching hazard', () => {
    const accident = makeCard('hazard-accident');
    const repairs = makeCard('remedy-repairs');
    const state = makeState({
      seats: [
        {
          id: 0,
          hand: [repairs],
          tableau: { battle: [accident], speed: [], distance: [], safeties: [] },
        },
        blankSeat(1),
      ],
    });
    const after = reduce(state, { seat: 0, type: 'PLAY', cardId: repairs.id }, rules);
    expect(topOf(after.seats[0]!.tableau.battle)?.id).toBe(repairs.id);
  });

  it('end-of-limit goes on speed pile, not battle pile', () => {
    const speedLimit = makeCard('hazard-speed-limit');
    const endOfLimit = makeCard('remedy-end-of-limit');
    const state = makeState({
      seats: [
        {
          id: 0,
          hand: [endOfLimit],
          tableau: { battle: [], speed: [speedLimit], distance: [], safeties: [] },
        },
        blankSeat(1),
      ],
    });
    const after = reduce(state, { seat: 0, type: 'PLAY', cardId: endOfLimit.id }, rules);
    expect(topOf(after.seats[0]!.tableau.speed)?.id).toBe(endOfLimit.id);
    expect(after.seats[0]!.tableau.battle).toEqual([]);
  });

  it('immune target rejects matching hazard play', () => {
    const safety = makeCard('safety-driving-ace');
    const accident = makeCard('hazard-accident');
    const state = makeState({
      seats: [
        { id: 0, hand: [accident], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        {
          id: 1,
          hand: [],
          tableau: {
            battle: [],
            speed: [],
            distance: [],
            safeties: [{ card: safety, coupFourre: false }],
          },
        },
      ],
    });
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: accident.id, targetSeat: 1 }, rules),
    ).toThrow(/immune/);
  });
});

describe('reducer — DISCARD', () => {
  it('moves card from hand to discard and ends turn', () => {
    const card = makeCard('hazard-stop');
    const filler = makeCard('mile-25', 'filler');
    const state = makeState({
      // non-empty deck prevents end-of-hand detection on empty hands
      deck: [filler],
      seats: [
        { id: 0, hand: [card], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        blankSeat(1),
      ],
    });
    const after = reduce(state, { seat: 0, type: 'DISCARD', cardId: card.id }, rules);
    expect(after.seats[0]!.hand).toEqual([]);
    expect(after.discard).toEqual([card]);
    expect(after.currentSeat).toBe(1);
    expect(after.phase).toBe('draw');
  });
});

describe('legalActions', () => {
  it('only DRAW in draw phase', () => {
    const state = makeState({ phase: 'draw', deck: [makeCard('mile-25')] });
    expect(legalActions(state, 0, rules)).toEqual([{ seat: 0, type: 'DRAW' }]);
    expect(legalActions(state, 1, rules)).toEqual([]);
  });

  it('returns empty when game ended', () => {
    const state = makeState({ phase: 'ended', winnerSeat: 0 });
    expect(legalActions(state, 0, rules)).toEqual([]);
  });

  it('discard always legal in action phase if card in hand', () => {
    const card = makeCard('hazard-stop');
    const state = makeState({
      seats: [{ id: 0, hand: [card], tableau: { battle: [], speed: [], distance: [], safeties: [] } }, blankSeat(1)],
    });
    const legal = legalActions(state, 0, rules);
    expect(legal).toContainEqual({ seat: 0, type: 'DISCARD', cardId: card.id });
  });

  it('does not propose hazard against immune opponent', () => {
    const safety = makeCard('safety-driving-ace');
    const accident = makeCard('hazard-accident');
    const state = makeState({
      seats: [
        { id: 0, hand: [accident], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        {
          id: 1,
          hand: [],
          tableau: {
            battle: [],
            speed: [],
            distance: [],
            safeties: [{ card: safety, coupFourre: false }],
          },
        },
      ],
    });
    const legal = legalActions(state, 0, rules);
    const offensive = legal.filter((a) => a.type === 'PLAY' && a.cardId === accident.id);
    expect(offensive).toEqual([]);
  });
});

