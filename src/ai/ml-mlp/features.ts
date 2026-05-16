// Feature encoder for the MLP AI variant (mlp-v1).
//
// Maps a SeatView → a fixed-length number[] suitable for the model's input
// layer. The layout is intentionally pinned: any change to section widths,
// section order, or the pinned enum orderings below invalidates the trained
// weights. `FEATURE_LAYOUT` exposes the offsets so tests and the verify-
// weights script can detect drift.
//
// Normalization rules:
//   - Hand counts are divided by HAND_MAX (7 = post-draw cap).
//   - Distance is divided by DISTANCE_TARGET (1000 km in v1).
//   - Deck size is divided by DECK_MAX (78 = full deck at deal time).
//   - One-hot fields are 0 or 1.
//
// Scoped to 2-seat games. Multi-opponent variants must extend the layout
// (and retrain) — encodeFeatures throws if a view has more than one
// opponent so the regression is loud rather than silent.

import type { CardType, HazardType, SafetyType } from '@/engine/cards';
import { categoryOf } from '@/engine/cards';
import type { Phase, Seat, Tableau } from '@/engine/state';
import {
  activeHazardOnBattle,
  hasSafety,
  isRolling,
  isSpeedLimited,
  sumDistance,
} from '@/engine/tableau-query';
import type { SeatView } from '@/engine/view';

// Pinned orderings. Renaming, reordering, or adding entries invalidates the
// trained weights — bump the model version and regenerate via verify-weights.
export const CARD_TYPES: ReadonlyArray<CardType> = [
  'mile-25',
  'mile-50',
  'mile-75',
  'mile-100',
  'mile-200',
  'hazard-stop',
  'hazard-speed-limit',
  'hazard-out-of-gas',
  'hazard-flat-tire',
  'hazard-accident',
  'remedy-roll',
  'remedy-end-of-limit',
  'remedy-gasoline',
  'remedy-spare-tire',
  'remedy-repairs',
  'safety-right-of-way',
  'safety-driving-ace',
  'safety-extra-tank',
  'safety-puncture-proof',
];

export const HAZARD_TYPES_ORDER: ReadonlyArray<HazardType> = [
  'stop',
  'speed-limit',
  'out-of-gas',
  'flat-tire',
  'accident',
];

export const SAFETY_TYPES_ORDER: ReadonlyArray<SafetyType> = [
  'right-of-way',
  'driving-ace',
  'extra-tank',
  'puncture-proof',
];

export const PHASES_ORDER: ReadonlyArray<Phase> = [
  'draw',
  'action',
  'awaiting-response',
  'ended',
];

export const CATEGORIES_ORDER = ['mileage', 'hazard', 'remedy', 'safety'] as const;

// Normalization constants.
export const HAND_MAX = 7; // 6 dealt + 1 drawn during a turn
export const DISTANCE_TARGET = 1000;
export const DECK_MAX = 78; // full deck at deal time, pre-deal

type LayoutEntry = { readonly offset: number; readonly width: number };
export type FeatureLayout = Readonly<Record<string, LayoutEntry>>;

export const FEATURE_LAYOUT = (() => {
  let cursor = 0;
  const e = (width: number): LayoutEntry => {
    const r: LayoutEntry = { offset: cursor, width };
    cursor += width;
    return r;
  };
  return {
    selfHand: e(CARD_TYPES.length),
    selfHazard: e(HAZARD_TYPES_ORDER.length),
    selfRolling: e(1),
    selfLimited: e(1),
    selfDistance: e(1),
    selfSafeties: e(SAFETY_TYPES_ORDER.length),
    oppHazard: e(HAZARD_TYPES_ORDER.length),
    oppRolling: e(1),
    oppLimited: e(1),
    oppDistance: e(1),
    oppSafeties: e(SAFETY_TYPES_ORDER.length),
    oppHandSize: e(1),
    deckSize: e(1),
    discardCategory: e(CATEGORIES_ORDER.length),
    phase: e(PHASES_ORDER.length),
  } as const;
})();

export const FEATURE_DIM =
  FEATURE_LAYOUT.phase.offset + FEATURE_LAYOUT.phase.width;

// Tableau-query helpers want a Seat for ergonomic reasons but only read from
// the tableau field. Building a hand-empty stub lets us reuse them for
// opponents without leaking hand visibility into the encoder.
function tableauToSeat(id: number, tableau: Tableau): Seat {
  return { id, hand: [], tableau };
}

export function encodeFeatures(view: SeatView): number[] {
  if (view.others.length !== 1) {
    throw new Error(
      `mlp-v1 encoder is scoped to 2-seat games (saw ${view.others.length + 1} seats)`,
    );
  }

  const out = new Array<number>(FEATURE_DIM).fill(0);
  const self = view.self;
  const opp = view.others[0]!;
  const oppSeat = tableauToSeat(opp.id, opp.tableau);

  // --- self hand counts ---
  const handCounts = new Map<CardType, number>();
  for (const c of self.hand) {
    handCounts.set(c.type, (handCounts.get(c.type) ?? 0) + 1);
  }
  for (let i = 0; i < CARD_TYPES.length; i++) {
    out[FEATURE_LAYOUT.selfHand.offset + i] =
      (handCounts.get(CARD_TYPES[i]!) ?? 0) / HAND_MAX;
  }

  // --- self tableau ---
  const selfHaz = activeHazardOnBattle(self);
  if (selfHaz !== null) {
    out[FEATURE_LAYOUT.selfHazard.offset + HAZARD_TYPES_ORDER.indexOf(selfHaz)] = 1;
  }
  out[FEATURE_LAYOUT.selfRolling.offset] = isRolling(self) ? 1 : 0;
  out[FEATURE_LAYOUT.selfLimited.offset] = isSpeedLimited(self) ? 1 : 0;
  out[FEATURE_LAYOUT.selfDistance.offset] = sumDistance(self) / DISTANCE_TARGET;
  for (let i = 0; i < SAFETY_TYPES_ORDER.length; i++) {
    out[FEATURE_LAYOUT.selfSafeties.offset + i] = hasSafety(self, SAFETY_TYPES_ORDER[i]!) ? 1 : 0;
  }

  // --- opp tableau ---
  const oppHaz = activeHazardOnBattle(oppSeat);
  if (oppHaz !== null) {
    out[FEATURE_LAYOUT.oppHazard.offset + HAZARD_TYPES_ORDER.indexOf(oppHaz)] = 1;
  }
  out[FEATURE_LAYOUT.oppRolling.offset] = isRolling(oppSeat) ? 1 : 0;
  out[FEATURE_LAYOUT.oppLimited.offset] = isSpeedLimited(oppSeat) ? 1 : 0;
  out[FEATURE_LAYOUT.oppDistance.offset] = sumDistance(oppSeat) / DISTANCE_TARGET;
  for (let i = 0; i < SAFETY_TYPES_ORDER.length; i++) {
    out[FEATURE_LAYOUT.oppSafeties.offset + i] = hasSafety(oppSeat, SAFETY_TYPES_ORDER[i]!) ? 1 : 0;
  }
  out[FEATURE_LAYOUT.oppHandSize.offset] = opp.handSize / HAND_MAX;

  // --- global ---
  out[FEATURE_LAYOUT.deckSize.offset] = view.deckSize / DECK_MAX;
  if (view.discardTop) {
    out[
      FEATURE_LAYOUT.discardCategory.offset +
        CATEGORIES_ORDER.indexOf(categoryOf(view.discardTop.type))
    ] = 1;
  }
  out[FEATURE_LAYOUT.phase.offset + PHASES_ORDER.indexOf(view.phase)] = 1;

  return out;
}
