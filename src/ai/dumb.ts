// "Dumb" AI baseline.
//
// Priority order (in action phase):
//   1. Play a safety (always; +100 each, denies future hazards).
//   2. Play a remedy that resolves the current battle/speed status.
//   3. Play the highest-value legal mile card.
//   4. Play a hazard against an opponent.
//   5. Discard the lowest-value card (mileage cards by value, then arbitrary).
//
// Other phases:
//   - draw           : only DRAW is legal, pick it.
//   - awaiting-resp. : prefer COUP_FOURRE if available, else PASS.
//
// Not strategic — never holds safeties for Coup-Fourré, never times hazards
// to disrupt opponent late game. Serves as a baseline for replay validation
// and a sparring partner for future heuristic/ML AIs.

import type { Action } from '@/engine/actions';
import type { Card } from '@/engine/cards';
import { mileValueOf } from '@/engine/cards';
import type { AIPlayer, AIPlayerInfo } from './types';

const dumbPlay: AIPlayer = async (view, legal) => {
  if (legal.length === 0) {
    throw new Error('dumb AI: no legal actions available');
  }
  if (legal.length === 1) return legal[0]!;

  // Awaiting-response: prefer COUP_FOURRE, else PASS.
  const cf = legal.find((a) => a.type === 'COUP_FOURRE');
  if (cf) return cf;
  const pass = legal.find((a) => a.type === 'PASS_COUP_FOURRE');
  if (pass) return pass;

  // Draw phase has exactly one DRAW; handled by the single-choice path above.

  // Action phase: ranked-bucket selection.
  const plays = legal.filter((a) => a.type === 'PLAY');
  const handCardById = new Map(view.self.hand.map((c) => [c.id, c] as const));
  const cardOf = (a: Action & { type: 'PLAY' }) => handCardById.get(a.cardId);

  const safetyPlay = plays.find((a) => a.type === 'PLAY' && cardOf(a)?.category === 'safety');
  if (safetyPlay) return safetyPlay;

  const remedyPlay = plays.find((a) => a.type === 'PLAY' && cardOf(a)?.category === 'remedy');
  if (remedyPlay) return remedyPlay;

  const milePlays = plays
    .filter((a): a is Action & { type: 'PLAY' } => a.type === 'PLAY' && cardOf(a)?.category === 'mileage')
    .sort((a, b) => (mileValueOf(cardOf(b)!.type) ?? 0) - (mileValueOf(cardOf(a)!.type) ?? 0));
  if (milePlays.length > 0) return milePlays[0]!;

  const hazardPlay = plays.find((a) => a.type === 'PLAY' && cardOf(a)?.category === 'hazard');
  if (hazardPlay) return hazardPlay;

  // Discard: prefer lowest-value mile, then any.
  const discards = legal.filter(
    (a): a is Action & { type: 'DISCARD' } => a.type === 'DISCARD',
  );
  if (discards.length > 0) {
    const discardWithValue = discards.map((a) => ({
      action: a,
      value: cardValueForDiscard(handCardById.get(a.cardId) ?? null),
    }));
    discardWithValue.sort((x, y) => x.value - y.value);
    return discardWithValue[0]!.action;
  }

  return legal[0]!;
};

// Heuristic value for "what would I rather keep". Lower = first to discard.
function cardValueForDiscard(card: Card | null): number {
  if (!card) return 0;
  switch (card.category) {
    case 'safety':
      return 1000; // never discard
    case 'remedy':
      return card.type === 'remedy-roll' ? 30 : 60;
    case 'mileage':
      return mileValueOf(card.type) ?? 25;
    case 'hazard':
      return 5;
  }
}

export const dumbAI: AIPlayerInfo = {
  id: 'dumb',
  displayName: 'Dumb AI',
  version: '0.1.0',
  play: dumbPlay,
};
