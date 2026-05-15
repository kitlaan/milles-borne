// Standard Mille Bornes deck: 106 cards.
//
// Composition per Wikipedia (standard "American" Mille Bornes deck):
//   Remedies:   Roll x14, End of Limit x6, Gasoline x6, Spare Tire x6, Repairs x6
//   Hazards:    Stop x5, Speed Limit x4, Out of Gas x3, Flat Tire x3, Accident x3
//   Mileage:    25 x10, 50 x10, 75 x10, 100 x12, 200 x4
//   Safeties:   Right of Way x1, Driving Ace x1, Extra Tank x1, Puncture-Proof x1
//
// Each card gets a unique id `<type>-<n>` where n is 1..count, so action
// logs can reference specific physical cards (matters for animations,
// debugging, and ML feature extraction).

import type { Card, CardType } from './cards';
import { categoryOf } from './cards';

type Composition = ReadonlyArray<readonly [CardType, number]>;

export const STANDARD_DECK_COMPOSITION: Composition = [
  // Remedies
  ['remedy-roll', 14],
  ['remedy-end-of-limit', 6],
  ['remedy-gasoline', 6],
  ['remedy-spare-tire', 6],
  ['remedy-repairs', 6],
  // Hazards
  ['hazard-stop', 5],
  ['hazard-speed-limit', 4],
  ['hazard-out-of-gas', 3],
  ['hazard-flat-tire', 3],
  ['hazard-accident', 3],
  // Mileage
  ['mile-25', 10],
  ['mile-50', 10],
  ['mile-75', 10],
  ['mile-100', 12],
  ['mile-200', 4],
  // Safeties
  ['safety-right-of-way', 1],
  ['safety-driving-ace', 1],
  ['safety-extra-tank', 1],
  ['safety-puncture-proof', 1],
];

export const STANDARD_DECK_SIZE = 106;

export function buildDeck(composition: Composition = STANDARD_DECK_COMPOSITION): Card[] {
  const cards: Card[] = [];
  for (const [type, count] of composition) {
    const category = categoryOf(type);
    for (let i = 1; i <= count; i++) {
      cards.push({ id: `${type}-${i}`, type, category });
    }
  }
  return cards;
}
