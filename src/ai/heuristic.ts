// "Heuristic" AI — meaningfully smarter than Basic.
//
// Decision priority (action phase):
//   1. Winning move — if a mile card exactly hits the target, play it.
//   2. Active remedy — if a hazard sits on my own battle/speed pile,
//      play the matching remedy.
//   3. Mileage — play a mile, with two tweaks: prefer values that fit
//      `remaining` exactly, and defer 200-mile cards until distance ≥ 600
//      (don't waste a 200 from a standing start).
//   4. Hazard — only play hazards against an opponent who is currently
//      rolling (visible in their tableau) and lacks the matching safety;
//      otherwise hold/discard them since they'd be illegal anyway.
//   5. Safety — hold for Coup-Fourré opportunity in the early/mid game.
//      Play in late game (deck size low) to bank the +100 before time
//      runs out.
//   6. Discard — prefer useless cards: hazards when no opponent is rolling,
//      Roll when already rolling, low-value miles last.
//
// Awaiting-response:
//   - Always play Coup-Fourré if a matching safety is legal (+300 bonus).
//   - Otherwise pass.

import type { Action } from '@/engine/actions';
import type { Card } from '@/engine/cards';
import { mileValueOf } from '@/engine/cards';
import type { SeatView } from '@/engine/view';
import type { AIPlayer, AIPlayerInfo } from './types';

const LATE_GAME_DECK_SIZE = 12;

const heuristicPlay: AIPlayer = async (view, legal) => {
  if (legal.length === 0) {
    throw new Error('heuristic AI: no legal actions available');
  }
  if (legal.length === 1) return legal[0]!;

  // Awaiting-response: always Coup-Fourré if available.
  const cf = legal.find((a) => a.type === 'COUP_FOURRE');
  if (cf) return cf;
  const pass = legal.find((a) => a.type === 'PASS_COUP_FOURRE');
  if (pass) return pass;

  const plays = legal.filter(
    (a): a is Action & { type: 'PLAY' } => a.type === 'PLAY',
  );
  const discards = legal.filter(
    (a): a is Action & { type: 'DISCARD' } => a.type === 'DISCARD',
  );
  const handCardById = new Map(view.self.hand.map((c) => [c.id, c] as const));
  const cardOf = (a: Action & { type: 'PLAY' }) => handCardById.get(a.cardId);

  const myDistance = view.self.tableau.distance.reduce(
    (sum, c) => sum + (mileValueOf(c.type) ?? 0),
    0,
  );
  const remaining = view.target - myDistance;

  // 1. Winning move — mile that hits target exactly.
  for (const a of plays) {
    const card = cardOf(a);
    if (!card) continue;
    if (card.category !== 'mileage') continue;
    if (mileValueOf(card.type) === remaining) return a;
  }

  // 2. Remedy against my active hazard.
  const remedyPlay = plays.find((a) => cardOf(a)?.category === 'remedy');
  if (remedyPlay) return remedyPlay;

  // 3. Mileage — ranked by usefulness.
  const milePlays = plays.filter((a) => cardOf(a)?.category === 'mileage');
  if (milePlays.length > 0) {
    const ranked = milePlays
      .map((a) => ({
        action: a,
        score: mileScore(mileValueOf(cardOf(a)!.type) ?? 0, remaining),
      }))
      .sort((x, y) => y.score - x.score);
    return ranked[0]!.action;
  }

  // 4. Hazard against a vulnerable opponent.
  const hazardPlay = plays.find((a) => cardOf(a)?.category === 'hazard');
  if (hazardPlay) return hazardPlay;

  // 5. Safety: hold for CF in early/mid game; play in late game.
  if (view.deckSize <= LATE_GAME_DECK_SIZE) {
    const safetyPlay = plays.find((a) => cardOf(a)?.category === 'safety');
    if (safetyPlay) return safetyPlay;
  }

  // 6. Discard — rank by what's *least* worth keeping.
  if (discards.length > 0) {
    const ranked = discards
      .map((a) => ({
        action: a,
        keep: keepValue(handCardById.get(a.cardId) ?? null, view, remaining),
      }))
      .sort((x, y) => x.keep - y.keep);
    return ranked[0]!.action;
  }

  return legal[0]!;
};

// Score a mile play. Higher = better. Negative = avoid.
function mileScore(value: number, remaining: number): number {
  if (value > remaining) return -1; // would overshoot
  if (value === remaining) return 10_000; // exact win
  // Defer 200-mile cards when distance is still far from target — saves
  // the big push for late game where it matters more.
  if (value === 200 && remaining > 600) return 100;
  return value;
}

// "Keep value": higher means I'd rather keep this card.
function keepValue(card: Card | null, view: SeatView, remaining: number): number {
  if (!card) return 0;
  switch (card.category) {
    case 'safety':
      return 10_000;
    case 'remedy':
      // Roll is less valuable if already rolling; otherwise standard.
      return card.type === 'remedy-roll' ? 40 : 70;
    case 'mileage': {
      const v = mileValueOf(card.type) ?? 25;
      // Mile that would overshoot is dead weight.
      if (v > remaining) return 10;
      return v;
    }
    case 'hazard': {
      // Hazards are useless if no opponent is currently exposed (rolling
      // and lacking the matching safety). Without legal-action inspection
      // we approximate by checking whether any opponent's battle pile top
      // is Roll (a rough "rolling" signal).
      const anyOpponentRolling = view.others.some((o) => {
        const battleTop = o.tableau.battle.at(-1);
        return battleTop?.type === 'remedy-roll';
      });
      return anyOpponentRolling ? 35 : 5;
    }
  }
}

export const heuristicAI: AIPlayerInfo = {
  id: 'heuristic',
  displayName: 'Heuristic',
  version: '0.1.0',
  play: heuristicPlay,
};
