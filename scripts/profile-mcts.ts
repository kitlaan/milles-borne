// Per-phase profile of one MCTS decision. Goal: localize the ~85x
// overhead between (rollout cost × iterations) and (observed wall
// time per decision).

import { sampleFullState } from '@/engine/sample';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { seedRng } from '@/engine/rng';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import { backprop, makeNode, selectBestChild, seatToMove } from '@/ai/mcts/node';
import { makeHeuristicRollout } from '@/ai/mcts/rollout';
import type { GameState } from '@/engine/state';
import type { RulePlugin } from '@/engine/rules/types';
import type { Action } from '@/engine/actions';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

async function main() {
  const rules = defaultRules();

  // Build a real mid-game decision state.
  let state = createInitialState({ seats: 2, rules, seed: 1 });
  for (let i = 0; i < 13; i++) {
    const seat = actingSeat(state);
    const view = toSeatView(state, seat);
    const legal = legalActions(state, seat, rules);
    const { chooseHeuristicAction } = await import('@/ai/heuristic');
    state = reduce(state, chooseHeuristicAction(view, legal), rules);
  }
  const seat = actingSeat(state);
  const view = toSeatView(state, seat);
  console.log('decision state: seat', seat, 'legal', legalActions(state, seat, rules).length);

  // Inline a runSearch that times each phase.
  const rolloutPolicy = makeHeuristicRollout();
  const ucbC = Math.SQRT2;

  const N = 100;
  for (const trial of [0, 1]) {
    const sampled = sampleFullState(view, seedRng(7 + trial));
    let rng = seedRng(11 + trial);

    let selectMs = 0, expandMs = 0, rolloutMs = 0, backpropMs = 0;
    let nLegalAtCalls = 0, legalAtMs = 0;
    let nReduceCalls = 0, reduceMs = 0;

    const rootLegal = legalActions(sampled, seatToMove(sampled), rules);
    const root = makeNode(sampled, null, null, rootLegal);

    function legalAt(s: GameState, r: ReadonlyArray<RulePlugin>): Action[] {
      if (s.phase === 'ended') return [];
      const t0 = performance.now();
      const out = legalActions(s, seatToMove(s), r);
      legalAtMs += performance.now() - t0;
      nLegalAtCalls++;
      return out;
    }
    function reduceTimed(s: GameState, a: Action, r: ReadonlyArray<RulePlugin>): GameState {
      const t0 = performance.now();
      const out = reduce(s, a, r);
      reduceMs += performance.now() - t0;
      nReduceCalls++;
      return out;
    }
    function fastForward(s: GameState, r: ReadonlyArray<RulePlugin>): GameState {
      let cur = s;
      while (cur.phase !== 'ended') {
        const legal = legalAt(cur, r);
        if (legal.length !== 1) break;
        cur = reduceTimed(cur, legal[0]!, r);
      }
      return cur;
    }

    const tTotal = performance.now();
    for (let i = 0; i < N; i++) {
      let t0 = performance.now();
      // Selection
      let cur = root;
      while (!cur.terminal && cur.untried.length === 0 && cur.children.length > 0) {
        cur = selectBestChild(cur, view.self.id, ucbC);
      }
      const leaf = cur;
      selectMs += performance.now() - t0;

      // Expansion
      let evalNode = leaf;
      if (!leaf.terminal && leaf.untried.length > 0) {
        t0 = performance.now();
        const action = leaf.untried.pop()!;
        const immediate = reduceTimed(leaf.state, action, rules);
        const childState = fastForward(immediate, rules);
        const childLegal = legalAt(childState, rules);
        const child = makeNode(childState, leaf, action, childLegal);
        leaf.children.push(child);
        evalNode = child;
        expandMs += performance.now() - t0;
      }

      // Rollout
      t0 = performance.now();
      const [reward, rngAfter] = rolloutPolicy(evalNode.state, rng, view.self.id, rules);
      rng = rngAfter;
      rolloutMs += performance.now() - t0;

      // Backprop
      t0 = performance.now();
      backprop(evalNode, reward);
      backpropMs += performance.now() - t0;
    }
    const totalMs = performance.now() - tTotal;
    console.log(`\n=== trial ${trial}: ${N} iters in ${totalMs.toFixed(1)}ms ===`);
    console.log(`  select   ${selectMs.toFixed(1)}ms (${((selectMs / totalMs) * 100).toFixed(1)}%)`);
    console.log(`  expand   ${expandMs.toFixed(1)}ms (${((expandMs / totalMs) * 100).toFixed(1)}%)`);
    console.log(`  rollout  ${rolloutMs.toFixed(1)}ms (${((rolloutMs / totalMs) * 100).toFixed(1)}%)`);
    console.log(`  backprop ${backpropMs.toFixed(1)}ms (${((backpropMs / totalMs) * 100).toFixed(1)}%)`);
    console.log(`  legalAt: ${nLegalAtCalls} calls in ${legalAtMs.toFixed(1)}ms`);
    console.log(`  reduce:  ${nReduceCalls} calls in ${reduceMs.toFixed(1)}ms`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
