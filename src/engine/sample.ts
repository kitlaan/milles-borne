// Determinization sampler for hidden-information AI search.
//
// `sampleFullState(view, rng)` returns a plausible `GameState` consistent
// with what a single seat actually sees:
//
//   * own hand, own tableau, all opponents' tableaus, full discard pile,
//     deck size, phase / current-seat / awaiting / turn / hand / target
//     are taken verbatim from the view.
//   * each opponent's hidden hand is filled with a random partition of the
//     unseen cards. Hand size is dictated by `OtherSeatView.handSize`.
//   * remaining unseen cards become the deck, in random order.
//
// MCTS calls this many times per decision (one determinization per tree)
// and aggregates votes across the sampled trees. The sampler doesn't try
// to incorporate prior beliefs about what opponents have likely drawn or
// kept; that would be a refinement (e.g., particle-filter style) on top
// of uniform random partition.

import type { Card } from './cards';
import { buildDeck } from './deck';
import type { RngState } from './rng';
import { shuffle } from './rng';
import type { GameState, Seat, Tableau } from './state';
import type { SeatView } from './view';

function tableauCardIds(t: Tableau): string[] {
  const ids: string[] = [];
  for (const c of t.battle) ids.push(c.id);
  for (const c of t.speed) ids.push(c.id);
  for (const c of t.distance) ids.push(c.id);
  for (const s of t.safeties) ids.push(s.card.id);
  return ids;
}

export function sampleFullState(view: SeatView, rng: RngState): GameState {
  const full = buildDeck();
  const seenIds = new Set<string>();

  for (const c of view.self.hand) seenIds.add(c.id);
  for (const id of tableauCardIds(view.self.tableau)) seenIds.add(id);
  for (const o of view.others) {
    for (const id of tableauCardIds(o.tableau)) seenIds.add(id);
  }
  for (const c of view.discard) seenIds.add(c.id);
  // `view.awaiting?.hazard` is already part of the victim's battle pile by
  // the time phase = 'awaiting-response' (see reducer post-apply pipeline),
  // so it's covered by the tableau scan above. No explicit add needed.

  const hidden = full.filter((c) => !seenIds.has(c.id));

  // Sanity: hidden card count should equal Σ(other.handSize) + view.deckSize.
  // If not, the view is internally inconsistent (engine bug); throw rather
  // than silently produce a malformed state.
  const expectedHidden =
    view.others.reduce((s, o) => s + o.handSize, 0) + view.deckSize;
  if (hidden.length !== expectedHidden) {
    throw new Error(
      `sampleFullState: hidden=${hidden.length} but expected ` +
        `${expectedHidden} (others' hands + deck size). View inconsistent.`,
    );
  }

  const [shuffled, rngAfter] = shuffle(hidden, rng);

  let cursor = 0;
  const otherSeats: Seat[] = view.others.map((o) => {
    const hand = shuffled.slice(cursor, cursor + o.handSize);
    cursor += o.handSize;
    return { id: o.id, hand, tableau: o.tableau };
  });
  const deck: Card[] = shuffled.slice(cursor);

  const seatCount = 1 + view.others.length;
  const seats: Seat[] = new Array(seatCount);
  seats[view.self.id] = view.self;
  for (const s of otherSeats) seats[s.id] = s;
  // If any slot is undefined, view.others' ids don't densely cover [0..n).
  for (let i = 0; i < seatCount; i++) {
    if (!seats[i]) {
      throw new Error(
        `sampleFullState: seat ${i} missing; view.others ids don't cover seats densely.`,
      );
    }
  }

  return {
    phase: view.phase,
    seats,
    deck,
    discard: view.discard,
    currentSeat: view.currentSeat,
    awaiting: view.awaiting,
    rng: rngAfter,
    turnNumber: view.turnNumber,
    handNumber: view.handNumber,
    target: view.target,
    winnerSeat: null,
  };
}
