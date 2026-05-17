// Action vocabulary for the MLP variant.
//
// The model outputs one logit per slot. Slot layout is pinned:
//   0..N-1  : PLAY card-type-i      (N = CARD_TYPES.length)
//   N..2N-1 : DISCARD card-type-i
//   2N      : DRAW
//   2N+1    : COUP_FOURRE
//   2N+2    : PASS_COUP_FOURRE
//
// Hazard targeting is implicit in 2-seat games (target = the one
// opponent). Multi-seat variants will need a different vocab + retrain.
//
// Card-instance vs card-type: we encode by *type* — two mile-200 cards
// are interchangeable for an imitation-learning prototype. Decoding
// picks the first legal action with the matching card type.

import type { Action } from '@/engine/actions';
import type { Card } from '@/engine/cards';
import type { SeatView } from '@/engine/view';
import { CARD_TYPES } from './features';

const N_CARD_TYPES = CARD_TYPES.length;
const PLAY_BASE = 0;
const DISCARD_BASE = PLAY_BASE + N_CARD_TYPES;
const DRAW_INDEX = DISCARD_BASE + N_CARD_TYPES;
const COUP_FOURRE_INDEX = DRAW_INDEX + 1;
const PASS_COUP_FOURRE_INDEX = DRAW_INDEX + 2;

export const ACTION_VOCAB_SIZE = PASS_COUP_FOURRE_INDEX + 1;

// Named offsets for tests / verify-weights drift detection.
export const ACTION_VOCAB_LAYOUT = {
  playBase: PLAY_BASE,
  discardBase: DISCARD_BASE,
  drawIndex: DRAW_INDEX,
  coupFourreIndex: COUP_FOURRE_INDEX,
  passCoupFourreIndex: PASS_COUP_FOURRE_INDEX,
  nCardTypes: N_CARD_TYPES,
} as const;

function cardOf(hand: ReadonlyArray<Card>, id: string): Card | null {
  return hand.find((c) => c.id === id) ?? null;
}

// Given an action and the actor's hand, return the vocab slot index it
// occupies. Returns null if the action's cardId can't be resolved against
// the supplied hand — a missing-card situation means the action is
// inconsistent with the state we're encoding from, which is a caller bug.
export function encodeActionSlot(
  action: Action,
  selfHand: ReadonlyArray<Card>,
): number | null {
  switch (action.type) {
    case 'DRAW':
      return DRAW_INDEX;
    case 'COUP_FOURRE':
      return COUP_FOURRE_INDEX;
    case 'PASS_COUP_FOURRE':
      return PASS_COUP_FOURRE_INDEX;
    case 'PLAY': {
      const c = cardOf(selfHand, action.cardId);
      if (!c) return null;
      const idx = CARD_TYPES.indexOf(c.type);
      return idx === -1 ? null : PLAY_BASE + idx;
    }
    case 'DISCARD': {
      const c = cardOf(selfHand, action.cardId);
      if (!c) return null;
      const idx = CARD_TYPES.indexOf(c.type);
      return idx === -1 ? null : DISCARD_BASE + idx;
    }
  }
}

// Map a vocab slot back to a concrete legal Action. Returns null when no
// legal action fits the slot (model picked an illegal slot — caller must
// fall back).
export function decodeActionFromSlot(
  slot: number,
  view: SeatView,
  legal: ReadonlyArray<Action>,
): Action | null {
  if (slot === DRAW_INDEX) {
    return legal.find((a) => a.type === 'DRAW') ?? null;
  }
  if (slot === COUP_FOURRE_INDEX) {
    return legal.find((a) => a.type === 'COUP_FOURRE') ?? null;
  }
  if (slot === PASS_COUP_FOURRE_INDEX) {
    return legal.find((a) => a.type === 'PASS_COUP_FOURRE') ?? null;
  }
  if (slot >= PLAY_BASE && slot < DISCARD_BASE) {
    const ct = CARD_TYPES[slot - PLAY_BASE]!;
    return (
      legal.find(
        (a) => a.type === 'PLAY' && cardOf(view.self.hand, a.cardId)?.type === ct,
      ) ?? null
    );
  }
  if (slot >= DISCARD_BASE && slot < DRAW_INDEX) {
    const ct = CARD_TYPES[slot - DISCARD_BASE]!;
    return (
      legal.find(
        (a) => a.type === 'DISCARD' && cardOf(view.self.hand, a.cardId)?.type === ct,
      ) ?? null
    );
  }
  return null;
}

// Boolean mask of length ACTION_VOCAB_SIZE: true means at least one
// legal action maps to this slot. Used by inference (to mask logits
// before argmax) and by training (action-agreement metrics).
export function legalActionMask(
  view: SeatView,
  legal: ReadonlyArray<Action>,
): boolean[] {
  const mask = new Array<boolean>(ACTION_VOCAB_SIZE).fill(false);
  for (const a of legal) {
    const slot = encodeActionSlot(a, view.self.hand);
    if (slot !== null) mask[slot] = true;
  }
  return mask;
}
