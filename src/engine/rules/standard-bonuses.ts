// Standard hand-end bonuses (per "American" Mille Bornes rules):
//
//   Trip Completed  (400) — for the seat that reaches the km target
//   Delayed Action  (300) — completing the trip after the draw pile is
//                            exhausted
//   Safe Trip       (300) — completing the trip without playing any
//                            200-mile cards
//   Shut-Out        (500) — every opponent finished at 0 km
//
// Bundled as a single plugin: each is a small `onHandEnd` check on the
// final state. Bundling keeps registration trivial; the four bonuses are
// almost always enabled together in conventional play.

import type { Card } from '../cards';
import { mileValueOf } from '../cards';
import type { GameState } from '../state';
import { sumDistance } from '../tableau-query';
import type { RulePlugin, ScoreEntry } from './types';

function hasAny200(distance: ReadonlyArray<Card>): boolean {
  for (const c of distance) {
    if (mileValueOf(c.type) === 200) return true;
  }
  return false;
}

function onHandEnd(state: GameState): ReadonlyArray<ScoreEntry> {
  const winner = state.winnerSeat;
  if (winner === null) return []; // stalemate; no bonuses
  const winnerSeat = state.seats[winner];
  if (!winnerSeat) return [];

  const entries: ScoreEntry[] = [];

  // Trip Completed — awarded to anyone who reached the target.
  entries.push({ seat: winner, points: 400, reason: 'trip-completed' });

  // Delayed Action — completed after the draw pile ran out. We use the
  // simple observation that at hand-end the deck is empty iff the last
  // mile was played without a refresh available afterward; this matches
  // the standard rule for our 2-player setup.
  if (state.deck.length === 0) {
    entries.push({ seat: winner, points: 300, reason: 'delayed-action' });
  }

  // Safe Trip — no 200-mile cards in winner's distance pile.
  if (!hasAny200(winnerSeat.tableau.distance)) {
    entries.push({ seat: winner, points: 300, reason: 'safe-trip' });
  }

  // Shut-Out — every other seat finished at 0 km.
  const opponentsAllZero = state.seats
    .filter((s) => s.id !== winner)
    .every((s) => sumDistance(s) === 0);
  if (opponentsAllZero) {
    entries.push({ seat: winner, points: 500, reason: 'shut-out' });
  }

  return entries;
}

export const standardBonusesRule: RulePlugin = {
  id: 'standard-bonuses',
  version: '0.1.0',
  hooks: { onHandEnd },
};
