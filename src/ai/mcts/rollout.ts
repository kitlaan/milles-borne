// MCTS rollout policy that plays out a hand using the Heuristic AI for
// every seat to terminal, then returns a reward in {-1, 0, +1} from
// `rootSeat`'s perspective.
//
// Heuristic-vs-Heuristic terminates in ~80 actions and is fast (no
// allocations beyond engine state copies). `maxDepth` is a belt-and-
// suspenders cap against engine livelock — a pre-existing bug
// fixed in Phase 8.2, but rollouts touch many novel state combinations
// so it's worth keeping the cap in case a new pathological case
// surfaces.

import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { shuffle, type RngState } from '@/engine/rng';
import type { GameState } from '@/engine/state';
import type { RulePlugin } from '@/engine/rules/types';
import { toSeatView } from '@/engine/view';
import { chooseHeuristicAction } from '../heuristic';
import { seatToMove } from './node';
import type { RolloutPolicy } from './search';

const DEFAULT_MAX_DEPTH = 240;

export type HeuristicRolloutOptions = {
  readonly maxDepth?: number;
};

// Walks `state` to phase = 'ended' using the heuristic policy for every
// seat. Returns the rootSeat-perspective reward.
//
// Per-rollout deck reshuffle: the engine's reducer never consumes
// `state.rng` during action play (rng is only used at setup), so a
// determinized leaf state's future is fully deterministic. Without
// reshuffling, every rollout through a given root child collapses to
// the same outcome and MCTS sees no signal across actions. Reshuffling
// `state.deck` per rollout — using the external `rng` parameter —
// gives each rollout a fresh future draw order while keeping the
// known visible state intact.
//
// `maxDepth` is a belt-and-suspenders cap against engine livelock.
export function makeHeuristicRollout(
  opts: HeuristicRolloutOptions = {},
): RolloutPolicy {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;

  return (
    state: GameState,
    rng: RngState,
    rootSeat: number,
    rules: ReadonlyArray<RulePlugin>,
  ): [number, RngState] => {
    const [shuffledDeck, rngAfter] = shuffle(state.deck, rng);
    let cur: GameState = { ...state, deck: shuffledDeck };
    let curRng = rngAfter;
    let depth = 0;

    while (cur.phase !== 'ended' && depth < maxDepth) {
      const seat = seatToMove(cur);
      const legal = legalActions(cur, seat, rules);
      if (legal.length === 0) {
        return [0, curRng];
      }
      const view = toSeatView(cur, seat);
      const action = chooseHeuristicAction(view, legal);
      cur = reduce(cur, action, rules);
      depth += 1;
    }

    return [terminalReward(cur, rootSeat), curRng];
  };
}

// Reward extraction from a (probably) terminal state. A maxDepth
// cap-hit, or a non-decisive end (deck-exhaust with no winner), counts
// as a draw — reward 0.
//
// Distance-differential shaping for draws was tested in three flavors
// (scale 0.25, 0.5, 1.0). At n=30 sample, none beat the no-shape
// baseline cleanly within ±9% binomial noise, so we keep the simpler
// reward function. The 35% draw rate at K=8 N=200 vs heuristic is a
// genuine game-property artifact (player ahead at deck-exhaust still
// counts as a draw per engine scoring rules), not an MCTS bug.
function terminalReward(state: GameState, rootSeat: number): number {
  if (state.phase !== 'ended') return 0;
  if (state.winnerSeat == null) return 0;
  return state.winnerSeat === rootSeat ? 1 : -1;
}
