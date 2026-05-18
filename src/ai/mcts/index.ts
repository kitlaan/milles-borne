// MCTS AI plugin.
//
// Hand-coded determinized MCTS — no machine learning, no weights file.
// Sits in the registry alongside Basic and Heuristic; the picker shows
// "MCTS" and games stamp the plugin id+version into their GameRecord
// just like the other plugins.
//
// Two budgets matter, both exposed via the factory:
//   * Browser / inference: lower K, N → snappier moves
//   * Data generation / eval: tune via CLI; can run with much larger
//     budgets when wall-time per decision isn't user-visible
//
// The factory returns a fresh AIPlayerInfo with its own RNG; production
// callers can omit `seed` (Date.now() used) for nondeterministic play,
// or pass a `seed` for reproducible eval runs.

import type { Action } from '@/engine/actions';
import { defaultRules } from '@/engine/rules';
import { seedRng, type RngState } from '@/engine/rng';
import type { RulePlugin } from '@/engine/rules/types';
import type { SeatView } from '@/engine/view';
import type { AIPlayer, AIPlayerInfo } from '../types';
import { chooseDeterminizedMcts } from './determinize';
import { makeHeuristicRollout } from './rollout';
import type { RolloutPolicy } from './search';

export type MctsAiConfig = {
  readonly K?: number;
  readonly N?: number;
  readonly ucbC?: number;
  readonly maxRolloutDepth?: number;
  readonly rules?: ReadonlyArray<RulePlugin>;
  readonly rolloutPolicy?: RolloutPolicy;
  readonly seed?: number;
  readonly displayName?: string;
};

export const MCTS_DEFAULTS = {
  K: 4,
  N: 100,
  ucbC: Math.SQRT2,
  maxRolloutDepth: 240,
} as const;

export function makeMctsAI(config: MctsAiConfig = {}): AIPlayerInfo {
  const K = config.K ?? MCTS_DEFAULTS.K;
  const N = config.N ?? MCTS_DEFAULTS.N;
  const ucbC = config.ucbC ?? MCTS_DEFAULTS.ucbC;
  const rules = config.rules ?? defaultRules();
  const rolloutPolicy =
    config.rolloutPolicy ??
    makeHeuristicRollout({
      maxDepth: config.maxRolloutDepth ?? MCTS_DEFAULTS.maxRolloutDepth,
    });
  let rng: RngState = seedRng(config.seed ?? Date.now());

  const play: AIPlayer = async (
    view: SeatView,
    legal: ReadonlyArray<Action>,
  ) => {
    const [action, rngAfter] = chooseDeterminizedMcts(view, legal, rng, {
      K,
      N,
      ucbC,
      rules,
      rolloutPolicy,
    });
    rng = rngAfter;
    return action;
  };

  return {
    id: 'mcts',
    displayName: config.displayName ?? 'MCTS',
    version: '0.1.0',
    play,
  };
}

export const mctsAI: AIPlayerInfo = makeMctsAI();
