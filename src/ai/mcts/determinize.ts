// Determinized MCTS: ISMCTS-style aggregation across K independent
// determinizations.
//
// Hidden-information games can't be searched directly because the AI
// doesn't know the opponent's hand or the deck order. We sample K
// plausible full states ("determinizations") from the seat's view,
// run an independent MCTS tree on each (N iterations apiece), then
// aggregate visit counts per action across the K root distributions.
// The action with the highest summed visits wins.
//
// Why sum-of-visits rather than average-of-win-rate: visits already
// encode confidence (UCB1 explores promising actions more), so summing
// gives more weight to actions that survived deeper search in the
// trees that explored them. Averaging win-rates would weight a
// shallowly-visited branch equally to a deeply-confirmed one.

import type { Action } from '@/engine/actions';
import { sampleFullState } from '@/engine/sample';
import type { RngState } from '@/engine/rng';
import type { RulePlugin } from '@/engine/rules/types';
import type { SeatView } from '@/engine/view';
import { runSearch, type RolloutPolicy } from './search';

// Strip strictly-dominated discard actions before MCTS searches over
// them. Safeties carry an unconditional +100 at hand end, a possible
// +300 Coup-Fourré bonus, and permanent immunity to their matching
// hazard — there is no game state in which discarding one is the
// right play. With heuristic rollouts those long-tail rewards rarely
// materialize, so the search doesn't see the difference between
// "discard safety" and "discard hazard"; with this pre-filter the
// search budget isn't spent on actions a competent player would
// never consider, and observed in-game pathological choices (e.g.
// discarding Puncture-Proof) stop occurring.
function prefilterLegal(view: SeatView, legal: ReadonlyArray<Action>): Action[] {
  const safetyIds = new Set<string>();
  for (const c of view.self.hand) {
    if (c.category === 'safety') safetyIds.add(c.id);
  }
  if (safetyIds.size === 0) return [...legal];
  const filtered = legal.filter(
    (a) => !(a.type === 'DISCARD' && safetyIds.has(a.cardId)),
  );
  // Always-safe: every seat has at least one non-safety discard (or a
  // PLAY) available when DISCARD is legal at all, so filtering never
  // empties the set.
  return filtered.length > 0 ? filtered : [...legal];
}

export type DeterminizedConfig = {
  readonly K: number;
  readonly N: number;
  readonly ucbC: number;
  readonly rules: ReadonlyArray<RulePlugin>;
  readonly rolloutPolicy: RolloutPolicy;
};

export function chooseDeterminizedMcts(
  view: SeatView,
  legalRaw: ReadonlyArray<Action>,
  rng: RngState,
  config: DeterminizedConfig,
): [Action, RngState] {
  if (legalRaw.length === 0) {
    throw new Error('mcts: no legal actions available');
  }
  const legal = prefilterLegal(view, legalRaw);
  if (legal.length === 1) return [legal[0]!, rng];
  if (config.K <= 0 || config.N <= 0) {
    return [legal[0]!, rng];
  }

  // visits aggregated across K trees, keyed by stable JSON serialization
  // of the action. We also map back to the first Action instance we saw
  // for a given key, since structurally-equal action objects from
  // different trees are interchangeable.
  const visitsByKey = new Map<string, number>();
  const actionByKey = new Map<string, Action>();

  let curRng = rng;
  for (let k = 0; k < config.K; k++) {
    const sampled = sampleFullState(view, curRng);
    curRng = sampled.rng;
    const result = runSearch(sampled, view.self.id, curRng, {
      iterations: config.N,
      ucbC: config.ucbC,
      rules: config.rules,
      rolloutPolicy: config.rolloutPolicy,
    });
    curRng = result.rng;
    for (const child of result.root.children) {
      if (!child.action) continue;
      const key = JSON.stringify(child.action);
      visitsByKey.set(key, (visitsByKey.get(key) ?? 0) + child.visits);
      if (!actionByKey.has(key)) actionByKey.set(key, child.action);
    }
  }

  if (visitsByKey.size === 0) {
    // No iterations recorded any visits (shouldn't happen if K>0,N>0).
    return [legal[0]!, curRng];
  }

  // Pick max visits. Tie-break stably by `legal` order so identical
  // configurations always pick the same action.
  let bestKey: string | null = null;
  let bestVisits = -1;
  for (const a of legal) {
    const key = JSON.stringify(a);
    const v = visitsByKey.get(key) ?? 0;
    if (v > bestVisits) {
      bestVisits = v;
      bestKey = key;
    }
  }
  const action = bestKey ? actionByKey.get(bestKey) ?? legal[0]! : legal[0]!;
  return [action, curRng];
}
