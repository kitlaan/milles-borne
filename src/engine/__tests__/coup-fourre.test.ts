import { describe, expect, it } from 'vitest';
import type { Card, CardType } from '../cards';
import { legalActions } from '../legal';
import { IllegalActionError, reduce } from '../reducer';
import { coreRule } from '../rules/core';
import { coupFourreRule } from '../rules/coup-fourre';
import { computeScores } from '../score';
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

// Use a minimal rule set so score assertions focus on coup-fourré mechanics
// (the +300 bonus from coup-fourre rule + the +100 from core's per-safety)
// without scoring contributions from the bundled hand-end bonus rule.
const rules = [coreRule, coupFourreRule];

describe('Coup-Fourré', () => {
  it('opens an interrupt window when victim holds matching safety', () => {
    const roll = makeCard('remedy-roll');
    const accident = makeCard('hazard-accident');
    const ace = makeCard('safety-driving-ace');
    const filler = makeCard('mile-25', 'filler');
    const state = makeState({
      deck: [filler, filler, filler],
      seats: [
        { id: 0, hand: [accident], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        { id: 1, hand: [ace], tableau: { battle: [roll], speed: [], distance: [], safeties: [] } },
      ],
    });
    const after = reduce(
      state,
      { seat: 0, type: 'PLAY', cardId: accident.id, targetSeat: 1 },
      rules,
    );
    expect(after.phase).toBe('awaiting-response');
    expect(after.awaiting?.seat).toBe(1);
    expect(after.awaiting?.hazard.id).toBe(accident.id);
    expect(after.awaiting?.attacker).toBe(0);
  });

  it('does NOT open an interrupt when victim lacks matching safety', () => {
    const roll = makeCard('remedy-roll');
    const accident = makeCard('hazard-accident');
    const filler = makeCard('mile-25', 'filler');
    const state = makeState({
      deck: [filler],
      seats: [
        { id: 0, hand: [accident], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        { id: 1, hand: [], tableau: { battle: [roll], speed: [], distance: [], safeties: [] } },
      ],
    });
    const after = reduce(
      state,
      { seat: 0, type: 'PLAY', cardId: accident.id, targetSeat: 1 },
      rules,
    );
    expect(after.phase).toBe('draw');
    expect(after.awaiting).toBeNull();
  });

  it('legalActions during interrupt include COUP_FOURRE for matching safety and PASS', () => {
    const roll = makeCard('remedy-roll');
    const accident = makeCard('hazard-accident');
    const ace = makeCard('safety-driving-ace');
    const filler = makeCard('mile-25', 'filler');
    const state = makeState({
      deck: [filler, filler, filler],
      seats: [
        { id: 0, hand: [accident], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        { id: 1, hand: [ace], tableau: { battle: [roll], speed: [], distance: [], safeties: [] } },
      ],
    });
    const after = reduce(
      state,
      { seat: 0, type: 'PLAY', cardId: accident.id, targetSeat: 1 },
      rules,
    );
    const legal = legalActions(after, 1, rules);
    expect(legal).toContainEqual({ seat: 1, type: 'COUP_FOURRE', safetyCardId: ace.id });
    expect(legal).toContainEqual({ seat: 1, type: 'PASS_COUP_FOURRE' });
    expect(legalActions(after, 0, rules)).toEqual([]);
  });

  it('rejects COUP_FOURRE with a safety that does not match the hazard', () => {
    const roll = makeCard('remedy-roll');
    const accident = makeCard('hazard-accident');
    const wrongSafety = makeCard('safety-extra-tank'); // doesn't match accident
    const filler = makeCard('mile-25', 'filler');
    // No interrupt opens (no matching safety), so we manually craft the state.
    const interruptedState = makeState({
      phase: 'awaiting-response',
      deck: [filler],
      currentSeat: 1,
      awaiting: { seat: 1, reason: 'coup-fourre-response', hazard: accident, attacker: 0 },
      seats: [
        { id: 0, hand: [], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        { id: 1, hand: [wrongSafety], tableau: { battle: [roll, accident], speed: [], distance: [], safeties: [] } },
      ],
    });
    expect(() =>
      reduce(interruptedState, { seat: 1, type: 'COUP_FOURRE', safetyCardId: wrongSafety.id }, rules),
    ).toThrow(IllegalActionError);
  });

  it('COUP_FOURRE cancels hazard, banks safety with CF flag, draws replacement, gives interruptor next turn', () => {
    const roll = makeCard('remedy-roll');
    const accident = makeCard('hazard-accident');
    const ace = makeCard('safety-driving-ace');
    const replacement = makeCard('mile-25', 'replace');
    const state = makeState({
      phase: 'awaiting-response',
      deck: [replacement],
      currentSeat: 1,
      awaiting: { seat: 1, reason: 'coup-fourre-response', hazard: accident, attacker: 0 },
      seats: [
        { id: 0, hand: [], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        { id: 1, hand: [ace], tableau: { battle: [roll, accident], speed: [], distance: [], safeties: [] } },
      ],
    });
    const after = reduce(
      state,
      { seat: 1, type: 'COUP_FOURRE', safetyCardId: ace.id },
      rules,
    );
    // hazard cancelled (battle top back to Roll)
    expect(after.seats[1]!.tableau.battle).toEqual([roll]);
    expect(after.discard).toEqual([accident]);
    // safety banked with CF flag
    expect(after.seats[1]!.tableau.safeties.length).toBe(1);
    expect(after.seats[1]!.tableau.safeties[0]!.card.id).toBe(ace.id);
    expect(after.seats[1]!.tableau.safeties[0]!.coupFourre).toBe(true);
    // replacement drawn
    expect(after.seats[1]!.hand).toEqual([replacement]);
    expect(after.deck).toEqual([]);
    // interruptor takes next turn
    expect(after.currentSeat).toBe(1);
    expect(after.phase).toBe('draw');
    expect(after.awaiting).toBeNull();
  });

  it('PASS_COUP_FOURRE leaves hazard in place and victim takes turn normally', () => {
    const roll = makeCard('remedy-roll');
    const accident = makeCard('hazard-accident');
    const ace = makeCard('safety-driving-ace');
    const filler = makeCard('mile-25', 'filler');
    const state = makeState({
      phase: 'awaiting-response',
      deck: [filler],
      currentSeat: 1,
      awaiting: { seat: 1, reason: 'coup-fourre-response', hazard: accident, attacker: 0 },
      seats: [
        { id: 0, hand: [], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        { id: 1, hand: [ace], tableau: { battle: [roll, accident], speed: [], distance: [], safeties: [] } },
      ],
    });
    const after = reduce(state, { seat: 1, type: 'PASS_COUP_FOURRE' }, rules);
    // hazard still on battle pile
    expect(after.seats[1]!.tableau.battle).toEqual([roll, accident]);
    // safety still in hand
    expect(after.seats[1]!.hand).toEqual([ace]);
    // victim now in draw phase
    expect(after.currentSeat).toBe(1);
    expect(after.phase).toBe('draw');
    expect(after.awaiting).toBeNull();
  });

  it('scoring credits +300 per Coup-Fourré safety + 100 for the safety itself', () => {
    const ace = makeCard('safety-driving-ace');
    const state = makeState({
      phase: 'ended',
      winnerSeat: 1,
      seats: [
        blankSeat(0),
        {
          id: 1,
          hand: [],
          tableau: {
            battle: [],
            speed: [],
            distance: [],
            safeties: [{ card: ace, coupFourre: true }],
          },
        },
      ],
    });
    const scores = computeScores(state, rules);
    const seat1 = scores.find((s) => s.seat === 1)!;
    const reasons = seat1.breakdown.map((b) => b.reason);
    expect(reasons).toContain('coup-fourre');
    expect(seat1.total).toBe(100 + 300); // safety + CF bonus
  });

  it('non-awaiting seat cannot act during interrupt', () => {
    const filler = makeCard('mile-25', 'filler');
    const accident = makeCard('hazard-accident');
    const ace = makeCard('safety-driving-ace');
    const state = makeState({
      phase: 'awaiting-response',
      deck: [filler],
      currentSeat: 1,
      awaiting: { seat: 1, reason: 'coup-fourre-response', hazard: accident, attacker: 0 },
      seats: [
        { id: 0, hand: [], tableau: { battle: [], speed: [], distance: [], safeties: [] } },
        { id: 1, hand: [ace], tableau: { battle: [accident], speed: [], distance: [], safeties: [] } },
      ],
    });
    // Seat 0 tries to do anything; not their seat per awaiting.
    expect(() =>
      reduce(state, { seat: 0, type: 'PASS_COUP_FOURRE' }, rules),
    ).toThrow(IllegalActionError);
  });
});
