import type { Card } from './cards';
import type { Awaiting, GameState, Seat, Tableau } from './state';
import type { Phase } from './state';

// A seat's view of the public state of one other seat. Hand contents are
// hidden; only the hand size is visible.
export type OtherSeatView = {
  readonly id: number;
  readonly tableau: Tableau;
  readonly handSize: number;
};

// The information visible to a single seat — what an AI player or a UI
// rendering that seat's perspective should see. Engine code never exposes
// `GameState` directly to AI implementations; it goes through this view.
//
// `discard` is the full discard pile (oldest at index 0, most-recent at
// the end). It is public information per Mille Bornes rules; an AI that
// needs to reason about what cards have been seen (e.g. an MCTS sampler
// reconstructing the unseen-card pool) reads it here. `discardTop` is
// retained as a convenience alias for the most-recent discard.
export type SeatView = {
  readonly self: Seat;
  readonly others: ReadonlyArray<OtherSeatView>;
  readonly discard: ReadonlyArray<Card>;
  readonly discardTop: Card | null;
  readonly deckSize: number;
  readonly phase: Phase;
  readonly currentSeat: number;
  readonly awaiting: Awaiting | null;
  readonly turnNumber: number;
  readonly handNumber: number;
  readonly target: number;
};

export function toSeatView(state: GameState, viewerSeat: number): SeatView {
  const self = state.seats[viewerSeat];
  if (!self) {
    throw new Error(`viewerSeat ${viewerSeat} is out of range`);
  }
  const others: OtherSeatView[] = state.seats
    .filter((s) => s.id !== viewerSeat)
    .map((s) => ({
      id: s.id,
      tableau: s.tableau,
      handSize: s.hand.length,
    }));
  const discard = state.discard;
  const discardTop = discard.length > 0 ? discard[discard.length - 1]! : null;
  return {
    self,
    others,
    discard,
    discardTop,
    deckSize: state.deck.length,
    phase: state.phase,
    currentSeat: state.currentSeat,
    awaiting: state.awaiting,
    turnNumber: state.turnNumber,
    handNumber: state.handNumber,
    target: state.target,
  };
}
