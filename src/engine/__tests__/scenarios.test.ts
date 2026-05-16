// End-to-end gameplay scenarios — multi-step sequences that exercise the
// reducer's interactions across hooks (speed limit cycle, hazard-remedy-roll
// chains, hand-end via deck exhaustion, full-safeties scoring).

import { describe, expect, it } from 'vitest';
import type { Card, CardType } from '../cards';
import { legalActions } from '../legal';
import { reduce } from '../reducer';
import { defaultRules } from '../rules';
import { computeScores } from '../score';
import { createInitialState } from '../setup';
import type { GameState, Seat, SafetyEntry } from '../state';
import { sumDistance } from '../tableau-query';

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

function blankSeat(id: number, hand: Card[] = []): Seat {
  return { id, hand, tableau: { battle: [], speed: [], distance: [], safeties: [] } };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
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
    ...overrides,
  };
}

const rules = defaultRules();

describe('Speed Limit cycle', () => {
  it('Speed Limit blocks 75/100/200 but allows 25/50; End of Limit re-enables', () => {
    const roll = makeCard('remedy-roll');
    const limit = makeCard('hazard-speed-limit');
    const filler = makeCard('mile-25', 'filler');

    // Setup: seat 0 rolling and has been speed-limited.
    const m100 = makeCard('mile-100', 'a');
    let state = makeState({
      deck: [filler],
      seats: [
        {
          id: 0,
          hand: [m100],
          tableau: { battle: [roll], speed: [limit], distance: [], safeties: [] },
        },
        blankSeat(1),
      ],
    });
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: m100.id }, rules),
    ).toThrow(/speed limit/);

    // 75 also blocked.
    const m75 = makeCard('mile-75', 'b');
    state = makeState({
      deck: [filler],
      seats: [
        {
          id: 0,
          hand: [m75],
          tableau: { battle: [roll], speed: [limit], distance: [], safeties: [] },
        },
        blankSeat(1),
      ],
    });
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: m75.id }, rules),
    ).toThrow(/speed limit/);

    // 50 is legal.
    const m50 = makeCard('mile-50', 'c');
    state = makeState({
      deck: [filler],
      seats: [
        {
          id: 0,
          hand: [m50],
          tableau: { battle: [roll], speed: [limit], distance: [], safeties: [] },
        },
        blankSeat(1),
      ],
    });
    const afterMile = reduce(state, { seat: 0, type: 'PLAY', cardId: m50.id }, rules);
    expect(sumDistance(afterMile.seats[0]!)).toBe(50);

    // Play End of Limit, then 100 becomes legal again.
    const eol = makeCard('remedy-end-of-limit');
    const m100b = makeCard('mile-100', 'd');
    state = makeState({
      deck: [filler],
      seats: [
        {
          id: 0,
          hand: [eol, m100b],
          tableau: { battle: [roll], speed: [limit], distance: [], safeties: [] },
        },
        blankSeat(1),
      ],
    });
    const afterEol = reduce(state, { seat: 0, type: 'PLAY', cardId: eol.id }, rules);
    // EOL ends seat 0's turn; advance through seat 1 (draw + discard filler) back to seat 0.
    const opp = afterEol.seats[1]!;
    const afterOppDraw = reduce(afterEol, { seat: 1, type: 'DRAW' }, rules);
    const oppHand = afterOppDraw.seats[1]!.hand;
    // Opponent had empty hand + drew filler.
    expect(oppHand.length).toBe(opp.hand.length + 1);
    const afterOppDiscard = reduce(
      afterOppDraw,
      { seat: 1, type: 'DISCARD', cardId: oppHand[0]!.id },
      rules,
    );
    // Seat 0 ready to draw — but deck is empty now. DRAW just advances to action.
    const afterMyDraw = reduce(afterOppDiscard, { seat: 0, type: 'DRAW' }, rules);
    const final = reduce(
      afterMyDraw,
      { seat: 0, type: 'PLAY', cardId: m100b.id },
      rules,
    );
    expect(sumDistance(final.seats[0]!)).toBe(100);
  });
});

describe('Battle pile clearing chain', () => {
  it('Roll → Accident → Repairs → Roll → mile is a legal sequence', () => {
    const roll1 = makeCard('remedy-roll', 'a');
    const accident = makeCard('hazard-accident');
    const repairs = makeCard('remedy-repairs');
    const roll2 = makeCard('remedy-roll', 'b');
    const mile = makeCard('mile-50');
    const filler = makeCard('mile-25', 'filler');

    // State: seat 0 has been Accident'd (battle = [roll, accident]).
    // Seat 0 plays repairs (legal), then roll, then mile.
    let state = makeState({
      deck: [filler, filler, filler, filler, filler, filler],
      seats: [
        {
          id: 0,
          hand: [repairs, roll2, mile],
          tableau: { battle: [roll1, accident], speed: [], distance: [], safeties: [] },
        },
        blankSeat(1),
      ],
    });

    // Play repairs.
    state = reduce(state, { seat: 0, type: 'PLAY', cardId: repairs.id }, rules);
    expect(state.seats[0]!.tableau.battle.at(-1)?.id).toBe(repairs.id);
    expect(state.phase).toBe('draw');
    expect(state.currentSeat).toBe(1);

    // Opponent turn: draw + discard.
    state = reduce(state, { seat: 1, type: 'DRAW' }, rules);
    state = reduce(
      state,
      { seat: 1, type: 'DISCARD', cardId: state.seats[1]!.hand[0]!.id },
      rules,
    );
    // Back to seat 0: draw + play roll.
    state = reduce(state, { seat: 0, type: 'DRAW' }, rules);
    // Cannot play mile yet — top of battle is Repairs (remedy != Roll).
    expect(() =>
      reduce(state, { seat: 0, type: 'PLAY', cardId: mile.id }, rules),
    ).toThrow(/not rolling/);
    state = reduce(state, { seat: 0, type: 'PLAY', cardId: roll2.id }, rules);
    expect(state.seats[0]!.tableau.battle.at(-1)?.id).toBe(roll2.id);

    // Opponent again.
    state = reduce(state, { seat: 1, type: 'DRAW' }, rules);
    state = reduce(
      state,
      { seat: 1, type: 'DISCARD', cardId: state.seats[1]!.hand[0]!.id },
      rules,
    );
    // Now seat 0 draws + plays mile.
    state = reduce(state, { seat: 0, type: 'DRAW' }, rules);
    state = reduce(state, { seat: 0, type: 'PLAY', cardId: mile.id }, rules);
    expect(sumDistance(state.seats[0]!)).toBe(50);
  });
});

describe('All-safeties scoring', () => {
  it('credits 100 per safety + CF bonuses correctly', () => {
    // Use a minimal rule set so the per-safety (core) + per-CF (coup-fourre)
    // scoring is tested in isolation, without the bundled hand-end bonuses.
    const minimalRules = rules.filter(
      (r) => r.id === 'core' || r.id === 'coup-fourre',
    );
    const safeties: SafetyEntry[] = [
      { card: makeCard('safety-right-of-way'), coupFourre: false },
      { card: makeCard('safety-driving-ace'), coupFourre: true },
      { card: makeCard('safety-extra-tank'), coupFourre: false },
      { card: makeCard('safety-puncture-proof'), coupFourre: true },
    ];
    const state = makeState({
      phase: 'ended',
      winnerSeat: 0,
      seats: [
        {
          id: 0,
          hand: [],
          tableau: { battle: [], speed: [], distance: [], safeties },
        },
        blankSeat(1),
      ],
    });
    const scores = computeScores(state, minimalRules);
    const s0 = scores.find((s) => s.seat === 0)!;
    // 4 safeties × 100 + 2 coup-fourrés × 300 = 1000
    expect(s0.total).toBe(4 * 100 + 2 * 300);
    const safetyEntries = s0.breakdown.filter((b) => b.reason.startsWith('safety:'));
    expect(safetyEntries.length).toBe(4);
    const cfEntries = s0.breakdown.filter((b) => b.reason === 'coup-fourre');
    expect(cfEntries.length).toBe(2);
  });
});

describe('Hand-end via deck exhaustion', () => {
  it('hand ends with no winner when deck empty and all hands empty', () => {
    const mile = makeCard('mile-25');
    // Both seats have one card; deck has zero. After the play, hand becomes
    // empty AND deck stays empty, so the all-hands-empty branch ends the hand
    // with winnerSeat=null (nobody hit 1000).
    const state = makeState({
      seats: [
        {
          id: 0,
          hand: [mile],
          tableau: { battle: [makeCard('remedy-roll')], speed: [], distance: [], safeties: [] },
        },
        blankSeat(1),
      ],
    });
    const after = reduce(state, { seat: 0, type: 'PLAY', cardId: mile.id }, rules);
    expect(after.phase).toBe('ended');
    expect(after.winnerSeat).toBeNull();
    expect(sumDistance(after.seats[0]!)).toBe(25);
  });

  it('DRAW with empty deck + empty hand advances to next seat instead of deadlocking', () => {
    // Regression: seat 0 used to land in phase 'action' with no hand and
    // no deck, leaving zero legal actions (deadlock). With the fix the
    // engine routes through endTurn so play advances to seat 1.
    const mile = makeCard('mile-25');
    const state = makeState({
      phase: 'draw',
      deck: [],
      seats: [
        {
          id: 0,
          hand: [],
          tableau: { battle: [makeCard('remedy-roll')], speed: [], distance: [], safeties: [] },
        },
        {
          id: 1,
          hand: [mile],
          tableau: { battle: [makeCard('remedy-roll')], speed: [], distance: [], safeties: [] },
        },
      ],
      currentSeat: 0,
    });
    const after = reduce(state, { seat: 0, type: 'DRAW' }, rules);
    expect(after.phase).toBe('draw');
    expect(after.currentSeat).toBe(1);
    expect(legalActions(after, 1, rules)).toEqual([{ seat: 1, type: 'DRAW' }]);
  });

  it('DRAW with empty deck + all hands empty ends the hand instead of deadlocking', () => {
    // Both seats already exhausted, deck empty: a draw from seat 0 should
    // close the hand via the "all hands empty + deck empty" detector
    // rather than entering action phase with no legal moves.
    const state = makeState({
      phase: 'draw',
      deck: [],
      seats: [blankSeat(0), blankSeat(1)],
      currentSeat: 0,
    });
    const after = reduce(state, { seat: 0, type: 'DRAW' }, rules);
    expect(after.phase).toBe('ended');
    expect(after.winnerSeat).toBeNull();
  });

  it('full createInitialState game can be played to ended phase deterministically', () => {
    // Smoke test via the first-legal policy — should always terminate.
    let state = createInitialState({ seats: 2, rules, seed: 1 });
    let i = 0;
    while (state.phase !== 'ended' && i < 600) {
      const seat = state.phase === 'awaiting-response' && state.awaiting
        ? state.awaiting.seat
        : state.currentSeat;
      // pick first legal; legalActions imported via index would be nice but
      // we want zero dep here, so use a tiny inline picker.
      const legal = legalActions(state, seat, rules);
      if (legal.length === 0) break;
      state = reduce(state, legal[0]!, rules);
      i++;
    }
    expect(state.phase).toBe('ended');
  });
});
