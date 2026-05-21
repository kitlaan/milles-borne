// Feature encoder v2 for the MLP AI variant (mlp-v4 and later).
//
// Same first 53 dims as `features.ts` (v1), plus four explicit-signal
// extensions ADR 004 calls out as the most likely missing signals:
//
//   selfMinusOppDistance    (1)   own_dist - opp_dist normalized by target.
//                                  Signed; +1 = own at target with opp at 0.
//   deckRemainingByCategory (4)   mileage / hazard / remedy / safety, each
//                                  count divided by DECK_MAX. Inferred from
//                                  full-deck composition minus what's
//                                  visible (own hand + every tableau pile
//                                  + discard); the residual is "opp hand
//                                  + draw pile" by category.
//   oppVulnerableToHazard   (5)   one-hot per hazard type for which the
//                                  opponent does NOT hold the matching
//                                  safety. v1 carries opp safeties (4
//                                  bits) implicitly but the model has to
//                                  learn the hazard→safety relationship;
//                                  v2 just exposes the result directly.
//
// Total v2 dim = 53 + 1 + 4 + 5 = 63.
//
// Pinning rules:
//   - Section order / widths frozen below.
//   - Any change invalidates trained v2 weights — bump featuresVersion
//     and ship a new weights file.

import type { Card, CardType, HazardType, SafetyType } from '@/engine/cards';
import { HAZARD_TO_SAFETY, categoryOf, safetyOf } from '@/engine/cards';
import { STANDARD_DECK_COMPOSITION } from '@/engine/deck';
import type { Seat, Tableau } from '@/engine/state';
import {
  activeHazardOnBattle,
  hasSafety,
  isRolling,
  isSpeedLimited,
  sumDistance,
} from '@/engine/tableau-query';
import type { SeatView } from '@/engine/view';
import {
  CARD_TYPES,
  CATEGORIES_ORDER,
  DECK_MAX,
  DISTANCE_TARGET,
  HAND_MAX,
  HAZARD_TYPES_ORDER,
  PHASES_ORDER,
  SAFETY_TYPES_ORDER,
} from './features';

type LayoutEntry = { readonly offset: number; readonly width: number };
export type FeatureLayoutV2 = Readonly<Record<string, LayoutEntry>>;

export const FEATURE_LAYOUT_V2 = (() => {
  let cursor = 0;
  const e = (width: number): LayoutEntry => {
    const r: LayoutEntry = { offset: cursor, width };
    cursor += width;
    return r;
  };
  return {
    // --- v1 fields preserved verbatim, same widths + order ---
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
    // --- v2 additions ---
    selfMinusOppDistance: e(1),
    deckRemainingByCategory: e(CATEGORIES_ORDER.length),
    oppVulnerableToHazard: e(HAZARD_TYPES_ORDER.length),
  } as const;
})();

export const FEATURE_DIM_V2 =
  FEATURE_LAYOUT_V2.oppVulnerableToHazard.offset +
  FEATURE_LAYOUT_V2.oppVulnerableToHazard.width;

// Total counts per CardType in a standard deck. Used to infer how many
// cards of each category are still hidden (opponent's hand + draw pile).
const DECK_COUNT_BY_TYPE: Readonly<Record<CardType, number>> = (() => {
  const m: Partial<Record<CardType, number>> = {};
  for (const [type, count] of STANDARD_DECK_COMPOSITION) m[type] = count;
  return m as Readonly<Record<CardType, number>>;
})();

function tableauToSeat(id: number, tableau: Tableau): Seat {
  return { id, hand: [], tableau };
}

function bumpType(map: Map<CardType, number>, t: CardType): void {
  map.set(t, (map.get(t) ?? 0) + 1);
}

export function encodeFeaturesV2(view: SeatView): number[] {
  if (view.others.length !== 1) {
    throw new Error(
      `mlp-v2 encoder is scoped to 2-seat games (saw ${view.others.length + 1} seats)`,
    );
  }

  const out = new Array<number>(FEATURE_DIM_V2).fill(0);
  const self = view.self;
  const opp = view.others[0]!;
  const oppSeat = tableauToSeat(opp.id, opp.tableau);

  // --- self hand counts ---
  const handCounts = new Map<CardType, number>();
  for (const c of self.hand) bumpType(handCounts, c.type);
  for (let i = 0; i < CARD_TYPES.length; i++) {
    out[FEATURE_LAYOUT_V2.selfHand.offset + i] =
      (handCounts.get(CARD_TYPES[i]!) ?? 0) / HAND_MAX;
  }

  // --- self tableau ---
  const selfHaz = activeHazardOnBattle(self);
  if (selfHaz !== null) {
    out[FEATURE_LAYOUT_V2.selfHazard.offset + HAZARD_TYPES_ORDER.indexOf(selfHaz)] = 1;
  }
  out[FEATURE_LAYOUT_V2.selfRolling.offset] = isRolling(self) ? 1 : 0;
  out[FEATURE_LAYOUT_V2.selfLimited.offset] = isSpeedLimited(self) ? 1 : 0;
  const selfDistance = sumDistance(self);
  out[FEATURE_LAYOUT_V2.selfDistance.offset] = selfDistance / DISTANCE_TARGET;
  for (let i = 0; i < SAFETY_TYPES_ORDER.length; i++) {
    out[FEATURE_LAYOUT_V2.selfSafeties.offset + i] = hasSafety(self, SAFETY_TYPES_ORDER[i]!) ? 1 : 0;
  }

  // --- opp tableau ---
  const oppHaz = activeHazardOnBattle(oppSeat);
  if (oppHaz !== null) {
    out[FEATURE_LAYOUT_V2.oppHazard.offset + HAZARD_TYPES_ORDER.indexOf(oppHaz)] = 1;
  }
  out[FEATURE_LAYOUT_V2.oppRolling.offset] = isRolling(oppSeat) ? 1 : 0;
  out[FEATURE_LAYOUT_V2.oppLimited.offset] = isSpeedLimited(oppSeat) ? 1 : 0;
  const oppDistance = sumDistance(oppSeat);
  out[FEATURE_LAYOUT_V2.oppDistance.offset] = oppDistance / DISTANCE_TARGET;
  for (let i = 0; i < SAFETY_TYPES_ORDER.length; i++) {
    out[FEATURE_LAYOUT_V2.oppSafeties.offset + i] = hasSafety(oppSeat, SAFETY_TYPES_ORDER[i]!) ? 1 : 0;
  }
  out[FEATURE_LAYOUT_V2.oppHandSize.offset] = opp.handSize / HAND_MAX;

  // --- global ---
  out[FEATURE_LAYOUT_V2.deckSize.offset] = view.deckSize / DECK_MAX;
  if (view.discardTop) {
    out[
      FEATURE_LAYOUT_V2.discardCategory.offset +
        CATEGORIES_ORDER.indexOf(categoryOf(view.discardTop.type))
    ] = 1;
  }
  out[FEATURE_LAYOUT_V2.phase.offset + PHASES_ORDER.indexOf(view.phase)] = 1;

  // --- v2: explicit mileage delta ---
  out[FEATURE_LAYOUT_V2.selfMinusOppDistance.offset] =
    (selfDistance - oppDistance) / DISTANCE_TARGET;

  // --- v2: deck composition by category ---
  // Visible-by-type = own hand + every tableau (battle/speed/distance/
  // safeties) on every seat + full discard pile. Everything else is in
  // the opp hand + draw pile and counts as "remaining" for the model.
  const visibleByType = new Map<CardType, number>();
  for (const c of self.hand) bumpType(visibleByType, c.type);
  const addTableau = (t: Tableau): void => {
    for (const c of t.battle) bumpType(visibleByType, c.type);
    for (const c of t.speed) bumpType(visibleByType, c.type);
    for (const c of t.distance) bumpType(visibleByType, c.type);
    for (const s of t.safeties) bumpType(visibleByType, s.card.type);
  };
  addTableau(self.tableau);
  addTableau(opp.tableau);
  for (const c of view.discard as ReadonlyArray<Card>) bumpType(visibleByType, c.type);

  const remainByCategory: Record<string, number> = {
    mileage: 0,
    hazard: 0,
    remedy: 0,
    safety: 0,
  };
  for (const t of CARD_TYPES) {
    const total = DECK_COUNT_BY_TYPE[t];
    const seen = visibleByType.get(t) ?? 0;
    const remaining = Math.max(0, total - seen);
    remainByCategory[categoryOf(t)] = (remainByCategory[categoryOf(t)] ?? 0) + remaining;
  }
  for (let i = 0; i < CATEGORIES_ORDER.length; i++) {
    out[FEATURE_LAYOUT_V2.deckRemainingByCategory.offset + i] =
      (remainByCategory[CATEGORIES_ORDER[i]!] ?? 0) / DECK_MAX;
  }

  // --- v2: opponent vulnerability flags ---
  for (let i = 0; i < HAZARD_TYPES_ORDER.length; i++) {
    const hazType: HazardType = HAZARD_TYPES_ORDER[i]!;
    const matchingSafety: SafetyType = HAZARD_TO_SAFETY[hazType];
    const isVulnerable = !hasSafety(oppSeat, matchingSafety);
    out[FEATURE_LAYOUT_V2.oppVulnerableToHazard.offset + i] = isVulnerable ? 1 : 0;
  }

  // safetyOf is imported but only validates types via inference paths
  // elsewhere; suppress unused warning by referencing it harmlessly.
  void safetyOf;

  return out;
}
