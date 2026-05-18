// Diagnostic: drive a game forward to a known disagreement step,
// then dump MCTS root-stats (per-action visits + avg reward) and
// the heuristic's choice for comparison. Helps figure out why MCTS
// picks worse than heuristic when budget is comfortable.

import { basicAI } from '@/ai/basic';
import { heuristicAI, chooseHeuristicAction } from '@/ai/heuristic';
import { sampleFullState } from '@/engine/sample';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { seedRng } from '@/engine/rng';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import { runSearch } from '@/ai/mcts/search';
import { makeHeuristicRollout } from '@/ai/mcts/rollout';
import type { GameState } from '@/engine/state';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

async function main() {
  const rules = defaultRules();
  const rollout = makeHeuristicRollout();
  let state = createInitialState({ seats: 2, rules, seed: 1 });

  // Drive forward with heuristic-vs-basic until step 13 (where MCTS chose DISCARD remedy).
  // We'll dump MCTS root stats at this point.
  const targetStep = 13;
  for (let i = 0; i < targetStep; i++) {
    const seat = actingSeat(state);
    const view = toSeatView(state, seat);
    const legal = legalActions(state, seat, rules);
    const ai = seat === 0 ? heuristicAI : basicAI;
    const action = await ai.play(view, legal);
    state = reduce(state, action, rules);
  }

  // At step 13, dump.
  const seat = actingSeat(state);
  const view = toSeatView(state, seat);
  const legal = legalActions(state, seat, rules);
  console.log('step', targetStep, 'seat', seat, 'phase', state.phase, 'legal', legal.length);
  console.log('hand:', view.self.hand.map(c => c.type).join(', '));
  console.log('legal actions:');
  for (const a of legal) console.log(' ', JSON.stringify(a));
  const heuristicChoice = chooseHeuristicAction(view, legal);
  console.log('heuristic picks:', JSON.stringify(heuristicChoice));

  // Now run MCTS at this state. Sample once, run runSearch with N=400 iter, dump children.
  for (let trial = 0; trial < 3; trial++) {
    const sampled = sampleFullState(view, seedRng(100 + trial));
    const result = runSearch(sampled, view.self.id, seedRng(200 + trial), {
      iterations: 400,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: rollout,
    });
    console.log(`\n=== trial ${trial}: K=1 N=400 from determinization seed ${100 + trial} ===`);
    console.log(`root.visits=${result.root.visits} children=${result.root.children.length}`);
    const sorted = [...result.root.children].sort((a, b) => b.visits - a.visits);
    for (const ch of sorted) {
      const avg = (ch.totalReward / ch.visits).toFixed(3);
      console.log(`  ${JSON.stringify(ch.action).padEnd(80)} visits=${ch.visits} avg=${avg}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
