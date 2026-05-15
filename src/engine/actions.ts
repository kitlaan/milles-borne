// All player-driven state transitions. Each action is a plain JSON-serializable
// object so action logs replay cleanly across runs.
//
// Field order: `seat` first, then `type`, then action-specific fields. Reads
// subject-verb-object in serialized logs (e.g., "seat 1 DISCARD card X")
// rather than verb-subject. JSON.parse / reducer don't care about order,
// but log diffs read more naturally.
//
// - DRAW              : draw one card from the deck (start of turn)
// - PLAY              : play a card from hand. `targetSeat` is required for
//                       hazards (target opponent); ignored for own-tableau plays
// - DISCARD           : discard a card from hand (when no legal play, or
//                       chosen instead of playing)
// - COUP_FOURRE       : interrupt response — play a matching safety from hand
//                       to cancel the hazard just played against you
// - PASS_COUP_FOURRE  : interrupt response — decline to interrupt; the hazard
//                       resolves normally
export type Action =
  | { readonly seat: number; readonly type: 'DRAW' }
  | { readonly seat: number; readonly type: 'PLAY'; readonly cardId: string; readonly targetSeat?: number }
  | { readonly seat: number; readonly type: 'DISCARD'; readonly cardId: string }
  | { readonly seat: number; readonly type: 'COUP_FOURRE'; readonly safetyCardId: string }
  | { readonly seat: number; readonly type: 'PASS_COUP_FOURRE' };

export type ActionType = Action['type'];
