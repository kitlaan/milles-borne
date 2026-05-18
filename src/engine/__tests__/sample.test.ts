import { describe, expect, it } from 'vitest';
import { STANDARD_DECK_SIZE } from '../deck';
import { defaultRules } from '../rules';
import { seedRng } from '../rng';
import { createInitialState } from '../setup';
import { sampleFullState } from '../sample';
import { toSeatView } from '../view';

function viewOf(seat: number, seed = 42) {
  const state = createInitialState({ seats: 2, rules: defaultRules(), seed });
  return { state, view: toSeatView(state, seat) };
}

describe('sampleFullState', () => {
  it('produces a state with all 106 cards, each exactly once', () => {
    const { view } = viewOf(0);
    const sampled = sampleFullState(view, seedRng(1));

    const ids = new Set<string>();
    for (const s of sampled.seats) {
      for (const c of s.hand) ids.add(c.id);
      for (const c of s.tableau.battle) ids.add(c.id);
      for (const c of s.tableau.speed) ids.add(c.id);
      for (const c of s.tableau.distance) ids.add(c.id);
      for (const e of s.tableau.safeties) ids.add(e.card.id);
    }
    for (const c of sampled.deck) ids.add(c.id);
    for (const c of sampled.discard) ids.add(c.id);
    expect(ids.size).toBe(STANDARD_DECK_SIZE);

    const totalCards =
      sampled.seats.reduce((acc, s) => acc + s.hand.length, 0) +
      sampled.deck.length +
      sampled.discard.length;
    expect(totalCards).toBe(STANDARD_DECK_SIZE);
  });

  it('preserves the viewer seat exactly', () => {
    const { view } = viewOf(0);
    const sampled = sampleFullState(view, seedRng(1));
    expect(sampled.seats[0]).toBe(view.self);
  });

  it('preserves opponent tableau and hand size', () => {
    const { view } = viewOf(0);
    const sampled = sampleFullState(view, seedRng(7));
    const opp = sampled.seats[1]!;
    expect(opp.tableau).toBe(view.others[0]!.tableau);
    expect(opp.hand.length).toBe(view.others[0]!.handSize);
  });

  it('preserves deck size and discard', () => {
    const { view } = viewOf(0);
    const sampled = sampleFullState(view, seedRng(3));
    expect(sampled.deck.length).toBe(view.deckSize);
    expect(sampled.discard).toBe(view.discard);
  });

  it('is deterministic on a fixed seed', () => {
    const { view } = viewOf(0);
    const a = sampleFullState(view, seedRng(99));
    const b = sampleFullState(view, seedRng(99));
    expect(a.seats[1]!.hand.map((c) => c.id)).toEqual(
      b.seats[1]!.hand.map((c) => c.id),
    );
    expect(a.deck.map((c) => c.id)).toEqual(b.deck.map((c) => c.id));
  });

  it('produces different opponent hands for different seeds', () => {
    const { view } = viewOf(0);
    const a = sampleFullState(view, seedRng(1));
    const b = sampleFullState(view, seedRng(2));
    expect(a.seats[1]!.hand.map((c) => c.id)).not.toEqual(
      b.seats[1]!.hand.map((c) => c.id),
    );
  });

  it('throws if the view is internally inconsistent', () => {
    const { view } = viewOf(0);
    const bad = { ...view, deckSize: view.deckSize + 5 };
    expect(() => sampleFullState(bad, seedRng(1))).toThrow(/inconsistent/);
  });

  it('round-trips: a view of the sampled state matches the input view', () => {
    const { view } = viewOf(0);
    const sampled = sampleFullState(view, seedRng(11));
    const viewBack = toSeatView(sampled, 0);
    expect(viewBack.self).toEqual(view.self);
    expect(viewBack.discard).toEqual(view.discard);
    expect(viewBack.deckSize).toBe(view.deckSize);
    expect(viewBack.others[0]!.handSize).toBe(view.others[0]!.handSize);
    expect(viewBack.others[0]!.tableau).toEqual(view.others[0]!.tableau);
  });
});
