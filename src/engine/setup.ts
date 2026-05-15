// Construct the initial GameState for a new hand.
//
// Uses the seeded RNG to shuffle the deck deterministically, deals 6 cards
// to each seat, and primes the first seat to draw.

import { buildDeck } from './deck';
import { seedRng, shuffle } from './rng';
import type { GameState, Seat } from './state';
import type { RulePlugin } from './rules/types';

export const STARTING_HAND_SIZE = 6;
export const DEFAULT_TARGET = 1000;

export type CreateGameConfig = {
  readonly seats: number;
  readonly rules: ReadonlyArray<RulePlugin>;
  readonly seed: number;
  readonly target?: number;
};

export function createInitialState(config: CreateGameConfig): GameState {
  if (config.seats < 2) throw new Error('need at least 2 seats');
  const deck0 = buildDeck();
  const rng0 = seedRng(config.seed);
  const [shuffled, rng1] = shuffle(deck0, rng0);
  const deck: typeof shuffled = [...shuffled];
  const seats: Seat[] = [];
  for (let i = 0; i < config.seats; i++) {
    const hand = deck.splice(0, STARTING_HAND_SIZE);
    seats.push({
      id: i,
      hand,
      tableau: { battle: [], speed: [], distance: [], safeties: [] },
    });
  }
  return {
    phase: 'draw',
    seats,
    deck,
    discard: [],
    currentSeat: 0,
    awaiting: null,
    rng: rng1,
    turnNumber: 0,
    handNumber: 1,
    target: config.target ?? DEFAULT_TARGET,
    winnerSeat: null,
  };
}
