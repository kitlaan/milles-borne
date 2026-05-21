// MCTS rollout policy that drives the leaf state to terminal using an
// MLP for every seat's decisions. Same shape as makeHeuristicRollout
// but the policy is `chooseActionFromModel(weights, ...)` instead of
// the hand-coded heuristic.
//
// Use case: a trained MLP that already outperforms Heuristic (e.g.
// mlp-v3 from Phase 10.B) gives MCTS a strictly stronger rollout
// policy, which should produce sharper leaf evaluations and stronger
// per-decision MCTS play. The expected downstream effect is a
// stronger TEACHER for the next round of distillation.
//
// Cost note: MLP forward pass per call (~50µs) is ~10× the heuristic's
// per-call cost (~5µs). Per rollout (~80 actions) that's ~4ms extra,
// so K=8 N=200 grows from ~640ms/decision to ~3-7s/decision. Budget
// for evals and data gen accordingly.

import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { FastRng, type RngState } from '@/engine/rng';
import type { GameState } from '@/engine/state';
import type { RulePlugin } from '@/engine/rules/types';
import { toSeatView } from '@/engine/view';
import { chooseActionFromModel } from '../ml-mlp/inference';
import type { MlpWeights } from '../ml-mlp/forward';
import { seatToMove } from './node';
import type { RolloutPolicy } from './search';

const DEFAULT_MAX_DEPTH = 240;

export type MlpRolloutOptions = {
  readonly maxDepth?: number;
};

function terminalReward(state: GameState, rootSeat: number): number {
  if (state.phase !== 'ended') return 0;
  if (state.winnerSeat == null) return 0;
  return state.winnerSeat === rootSeat ? 1 : -1;
}

export function makeMlpRollout(
  weights: MlpWeights,
  opts: MlpRolloutOptions = {},
): RolloutPolicy {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  let fastRng: FastRng | null = null;

  return (
    state: GameState,
    rng: RngState,
    rootSeat: number,
    rules: ReadonlyArray<RulePlugin>,
  ): [number, RngState] => {
    if (!fastRng) fastRng = new FastRng(rng);
    const shuffledDeck = fastRng.shuffleInto(state.deck);
    let cur: GameState = { ...state, deck: shuffledDeck };
    let depth = 0;

    while (cur.phase !== 'ended' && depth < maxDepth) {
      const seat = seatToMove(cur);
      const legal = legalActions(cur, seat, rules);
      if (legal.length === 0) {
        return [0, fastRng.state()];
      }
      const view = toSeatView(cur, seat);
      const action = chooseActionFromModel(weights, view, legal);
      cur = reduce(cur, action, rules);
      depth += 1;
    }

    return [terminalReward(cur, rootSeat), fastRng.state()];
  };
}
