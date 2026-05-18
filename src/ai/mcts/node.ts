// MCTS tree node + UCB1 selection.
//
// `totalReward` is stored from the perspective of `rootSeat` (the seat
// whose decision the tree is exploring). UCB1 selection flips sign at
// opponent nodes — that way visits and rewards remain in a single,
// consistent frame across the whole tree.
//
// `untried` shrinks as children are spawned. A node is "fully expanded"
// when `untried.length === 0`. The next selection step from a fully-
// expanded node uses UCB1; from a non-fully-expanded node, expansion
// happens first.

import type { Action } from '@/engine/actions';
import type { GameState } from '@/engine/state';

export type Node = {
  state: GameState;
  parent: Node | null;
  action: Action | null;
  toMove: number;
  legal: Action[];
  untried: Action[];
  children: Node[];
  visits: number;
  totalReward: number;
  terminal: boolean;
};

export function seatToMove(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) {
    return state.awaiting.seat;
  }
  return state.currentSeat;
}

export function isTerminal(state: GameState): boolean {
  return state.phase === 'ended';
}

export function makeNode(
  state: GameState,
  parent: Node | null,
  action: Action | null,
  legal: Action[],
): Node {
  return {
    state,
    parent,
    action,
    toMove: seatToMove(state),
    legal,
    untried: [...legal],
    children: [],
    visits: 0,
    totalReward: 0,
    terminal: isTerminal(state),
  };
}

// UCB1 score for a child, evaluated from `parentToMove`'s perspective.
//
// `child.totalReward` is from `rootSeat`'s perspective; if the parent
// is choosing for the opponent, the value to that chooser is the
// negative. The exploration term is independent of perspective.
export function ucbScore(
  child: Node,
  parentVisits: number,
  parentToMove: number,
  rootSeat: number,
  c: number,
): number {
  const sign = parentToMove === rootSeat ? 1 : -1;
  const exploit = (sign * child.totalReward) / child.visits;
  const explore = c * Math.sqrt(Math.log(parentVisits) / child.visits);
  return exploit + explore;
}

// Pick the child of `node` that maximizes UCB1. Caller guarantees
// `node.children.length > 0`.
export function selectBestChild(node: Node, rootSeat: number, c: number): Node {
  let best = node.children[0]!;
  let bestScore = ucbScore(best, node.visits, node.toMove, rootSeat, c);
  for (let i = 1; i < node.children.length; i++) {
    const ch = node.children[i]!;
    const s = ucbScore(ch, node.visits, node.toMove, rootSeat, c);
    if (s > bestScore) {
      best = ch;
      bestScore = s;
    }
  }
  return best;
}

export function backprop(leaf: Node, rewardForRoot: number): void {
  let cur: Node | null = leaf;
  while (cur) {
    cur.visits += 1;
    cur.totalReward += rewardForRoot;
    cur = cur.parent;
  }
}
