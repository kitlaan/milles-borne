// Replay determinism: a saved (seed, actionLog) pair must always reproduce
// the same final state. This is the load-bearing property for ML data
// collection and for the v1 verification CLI.

import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { legalActions } from '../legal';
import { reduce } from '../reducer';
import { defaultRules } from '../rules';
import { createInitialState } from '../setup';
import type { GameState } from '../state';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

// Trivial deterministic policy: always pick the first legal action.
function pickFirstLegal(state: GameState): Action {
  const rules = defaultRules();
  const legal = legalActions(state, actingSeat(state), rules);
  if (legal.length === 0) {
    throw new Error('no legal actions');
  }
  return legal[0]!;
}

// Run a game with the trivial policy until ended or maxSteps reached.
function playGame(seed: number, maxSteps = 600): { final: GameState; log: Action[] } {
  const rules = defaultRules();
  let state = createInitialState({ seats: 2, rules, seed });
  const log: Action[] = [];
  for (let i = 0; i < maxSteps && state.phase !== 'ended'; i++) {
    const action = pickFirstLegal(state);
    log.push(action);
    state = reduce(state, action, rules);
  }
  return { final: state, log };
}

function replay(seed: number, log: ReadonlyArray<Action>): GameState {
  const rules = defaultRules();
  let state = createInitialState({ seats: 2, rules, seed });
  for (const action of log) {
    state = reduce(state, action, rules);
  }
  return state;
}

describe('replay determinism', () => {
  it('replays produce identical final state', () => {
    const seed = 12345;
    const { final, log } = playGame(seed);
    const replayed = replay(seed, log);
    expect(replayed).toEqual(final);
  });

  it('different seeds produce different histories', () => {
    const a = playGame(1);
    const b = playGame(2);
    expect(a.log).not.toEqual(b.log);
  });

  it('replay across multiple seeds is consistent', () => {
    for (const seed of [7, 100, 9999, 42]) {
      const { final, log } = playGame(seed);
      const replayed = replay(seed, log);
      expect(replayed, `seed ${seed}`).toEqual(final);
    }
  });

  it('serializing log to JSON and back preserves replay correctness', () => {
    const seed = 314159;
    const { final, log } = playGame(seed);
    const round = JSON.parse(JSON.stringify(log)) as Action[];
    const replayed = replay(seed, round);
    expect(replayed).toEqual(final);
  });

  it('serializing state to JSON and back preserves equality', () => {
    const seed = 9001;
    const { final } = playGame(seed);
    const round = JSON.parse(JSON.stringify(final)) as GameState;
    expect(round).toEqual(final);
  });
});
