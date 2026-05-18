// MCTS search loop.
//
// One iteration =
//   1. Selection: walk from root via UCB1 until we hit a node that is
//      either terminal or not fully expanded.
//   2. Expansion: if non-terminal, pop one untried action and add a
//      child reached by applying that action.
//   3. Rollout: from the new node (or the terminal node directly),
//      simulate to end-of-hand using `rolloutPolicy` and produce a
//      reward in {-1, 0, +1} from `rootSeat`'s perspective.
//   4. Backprop: propagate reward + visit count up to root.
//
// The rollout policy is injected, not implemented here — this keeps
// search.ts independent from the heuristic-AI rollout choice and makes
// the loop testable with a deterministic stub policy.

import type { Action } from '@/engine/actions';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import type { RngState } from '@/engine/rng';
import type { GameState } from '@/engine/state';
import type { RulePlugin } from '@/engine/rules/types';
import { backprop, makeNode, type Node, selectBestChild, seatToMove } from './node';

export type RolloutPolicy = (
  state: GameState,
  rng: RngState,
  rootSeat: number,
  rules: ReadonlyArray<RulePlugin>,
) => [number, RngState];

export type SearchConfig = {
  readonly iterations: number;
  readonly ucbC: number;
  readonly rules: ReadonlyArray<RulePlugin>;
  readonly rolloutPolicy: RolloutPolicy;
};

export type SearchResult = {
  readonly root: Node;
  readonly rng: RngState;
};

function legalAt(state: GameState, rules: ReadonlyArray<RulePlugin>): Action[] {
  if (state.phase === 'ended') return [];
  return legalActions(state, seatToMove(state), rules);
}

// Mille Bornes alternates forced DRAW phases with real decisions, so
// after an action the engine commonly lands in a state with exactly
// one legal action (DRAW). Inlining those into the parent's child
// keeps the tree to *decision* points only — every Node represents a
// state where the search has something to choose. This roughly halves
// the iterations wasted on forced moves before the search budget is
// spent on rollouts.
function fastForward(
  state: GameState,
  rules: ReadonlyArray<RulePlugin>,
): GameState {
  let cur = state;
  while (cur.phase !== 'ended') {
    const legal = legalAt(cur, rules);
    if (legal.length !== 1) break;
    cur = reduce(cur, legal[0]!, rules);
  }
  return cur;
}

function expand(node: Node, rules: ReadonlyArray<RulePlugin>): Node {
  // Caller guarantees node.untried.length > 0 and !node.terminal.
  const action = node.untried.pop()!;
  const immediate = reduce(node.state, action, rules);
  const childState = fastForward(immediate, rules);
  const childLegal = legalAt(childState, rules);
  const child = makeNode(childState, node, action, childLegal);
  node.children.push(child);
  return child;
}

// Walk to a node that is terminal OR not fully expanded.
function select(node: Node, rootSeat: number, c: number): Node {
  let cur = node;
  while (!cur.terminal && cur.untried.length === 0 && cur.children.length > 0) {
    cur = selectBestChild(cur, rootSeat, c);
  }
  return cur;
}

export function runSearch(
  rootState: GameState,
  rootSeat: number,
  initialRng: RngState,
  config: SearchConfig,
): SearchResult {
  const rootLegal = legalAt(rootState, config.rules);
  const root = makeNode(rootState, null, null, rootLegal);
  let rng = initialRng;

  for (let i = 0; i < config.iterations; i++) {
    const leaf = select(root, rootSeat, config.ucbC);
    let evalNode: Node = leaf;
    if (!leaf.terminal && leaf.untried.length > 0) {
      evalNode = expand(leaf, config.rules);
    }
    const [reward, rngAfter] = config.rolloutPolicy(
      evalNode.state,
      rng,
      rootSeat,
      config.rules,
    );
    rng = rngAfter;
    backprop(evalNode, reward);
  }

  return { root, rng };
}

// Pick the action with the most visits at the root. Ties broken by the
// order of children (stable: children are appended in expansion order,
// which mirrors the `legal` array order at root construction).
export function bestAction(root: Node): Action {
  if (root.children.length === 0) {
    if (root.legal.length === 0) {
      throw new Error('bestAction: root has no legal actions');
    }
    // No iterations were run; fall back to first legal action.
    return root.legal[0]!;
  }
  let best = root.children[0]!;
  for (let i = 1; i < root.children.length; i++) {
    const ch = root.children[i]!;
    if (ch.visits > best.visits) best = ch;
  }
  if (!best.action) {
    throw new Error('bestAction: root child has no action');
  }
  return best.action;
}
