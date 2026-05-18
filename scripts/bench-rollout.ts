// Benchmark MCTS hot path: where does rollout time go?
import { chooseHeuristicAction } from '@/ai/heuristic';
import { makeHeuristicRollout } from '@/ai/mcts/rollout';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { seedRng } from '@/engine/rng';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import type { GameState } from '@/engine/state';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

async function main() {
  const rules = defaultRules();
  const rollout = makeHeuristicRollout();
  const state = createInitialState({ seats: 2, rules, seed: 1 });
  const ITERS = 200;

  // Full rollout time.
  let t0 = Date.now();
  for (let i = 0; i < ITERS; i++) {
    rollout(state, seedRng(i), 0, rules);
  }
  const fullMs = Date.now() - t0;
  console.log(`Full rollout: ${ITERS} iters in ${fullMs}ms = ${(fullMs / ITERS).toFixed(2)}ms/rollout`);

  // Decompose: legalActions alone, toSeatView alone, chooseHeuristicAction alone, reduce alone.
  // Build a representative action sequence first.
  let cur = state;
  const sequence: GameState[] = [];
  for (let i = 0; i < 80 && cur.phase !== 'ended'; i++) {
    sequence.push(cur);
    const seat = actingSeat(cur);
    const legal = legalActions(cur, seat, rules);
    if (legal.length === 0) break;
    const view = toSeatView(cur, seat);
    const action = chooseHeuristicAction(view, legal);
    cur = reduce(cur, action, rules);
  }
  console.log(`Sequence has ${sequence.length} states`);

  // Measure each step component over 100x the sequence.
  const REPS = 100;
  t0 = Date.now();
  for (let r = 0; r < REPS; r++) {
    for (const s of sequence) {
      const seat = actingSeat(s);
      legalActions(s, seat, rules);
    }
  }
  console.log(`legalActions: ${REPS * sequence.length} calls in ${Date.now() - t0}ms`);

  t0 = Date.now();
  for (let r = 0; r < REPS; r++) {
    for (const s of sequence) {
      const seat = actingSeat(s);
      toSeatView(s, seat);
    }
  }
  console.log(`toSeatView:   ${REPS * sequence.length} calls in ${Date.now() - t0}ms`);

  const legalPrecomp: Array<ReturnType<typeof legalActions>> = sequence.map(s => legalActions(s, actingSeat(s), rules));
  const viewPrecomp = sequence.map(s => toSeatView(s, actingSeat(s)));
  t0 = Date.now();
  for (let r = 0; r < REPS; r++) {
    for (let i = 0; i < sequence.length; i++) {
      chooseHeuristicAction(viewPrecomp[i]!, legalPrecomp[i]!);
    }
  }
  console.log(`chooseHeur:   ${REPS * sequence.length} calls in ${Date.now() - t0}ms`);

  t0 = Date.now();
  for (let r = 0; r < REPS; r++) {
    for (let i = 0; i < sequence.length; i++) {
      const s = sequence[i]!;
      const action = chooseHeuristicAction(viewPrecomp[i]!, legalPrecomp[i]!);
      reduce(s, action, rules);
    }
  }
  console.log(`reduce+heur:  ${REPS * sequence.length} calls in ${Date.now() - t0}ms`);

  // Find a state with several legal actions (real decision point).
  let interestingIdx = sequence.findIndex((_, i) => legalPrecomp[i]!.length >= 5);
  if (interestingIdx < 0) interestingIdx = 0;
  const view = viewPrecomp[interestingIdx]!;
  const legal = legalPrecomp[interestingIdx]!;
  console.log(`benchmark decision: ${legal.length} legal actions`);

  const { makeMctsAI } = await import('@/ai/mcts');
  const mctsK4N100 = makeMctsAI({ K: 4, N: 100, seed: 1 });
  t0 = Date.now();
  const DEC = 20;
  for (let i = 0; i < DEC; i++) {
    await mctsK4N100.play(view, legal);
  }
  const k4n100Ms = Date.now() - t0;
  console.log(`mcts K=4 N=100: ${DEC} decisions in ${k4n100Ms}ms = ${(k4n100Ms / DEC).toFixed(1)}ms/decision`);

  const mctsK8N200 = makeMctsAI({ K: 8, N: 200, seed: 1 });
  t0 = Date.now();
  for (let i = 0; i < DEC; i++) {
    await mctsK8N200.play(view, legal);
  }
  const k8n200Ms = Date.now() - t0;
  console.log(`mcts K=8 N=200: ${DEC} decisions in ${k8n200Ms}ms = ${(k8n200Ms / DEC).toFixed(1)}ms/decision`);
}

main().catch(e => { console.error(e); process.exit(1); });
