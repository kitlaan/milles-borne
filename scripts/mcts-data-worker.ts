// Worker for parallel MCTS self-play training-data generation.
//
// Protocol (parent → worker, one task per line of stdin):
//   { seed: number, K: number, N: number, ucbC: number, mctsSeed: number }
//
// Protocol (worker → parent, one result per line of stdout):
//   { seed: number, kind: 'completed' | 'timedout' | 'deadlocked',
//     steps: number, actionLog: Action[] }
//
// Each task plays one full game with MCTS at BOTH seats. The two MCTS
// instances are constructed with independent rng seeds so their
// determinizations don't drift in lockstep. The full action log is
// shipped back to the parent for writing into the dataset.

import readline from 'node:readline';
import { makeMctsAI } from '@/ai/mcts';
import type { Action } from '@/engine/actions';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { rulesFromIds } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { toSeatView } from '@/engine/view';

const MAX_STEPS_PER_GAME = 800;

type Task = {
  readonly seed: number;
  readonly K: number;
  readonly N: number;
  readonly ucbC: number;
  readonly mctsSeed: number;
  readonly ruleIds: ReadonlyArray<string>;
};

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

async function playOne(task: Task): Promise<{
  kind: 'completed' | 'timedout' | 'deadlocked';
  steps: number;
  actionLog: Action[];
}> {
  const rules = rulesFromIds(task.ruleIds);
  // Independent seeds for each seat's MCTS instance so the two players'
  // determinization streams don't collapse to identical samples.
  const ai0 = makeMctsAI({ K: task.K, N: task.N, ucbC: task.ucbC, seed: task.mctsSeed });
  const ai1 = makeMctsAI({ K: task.K, N: task.N, ucbC: task.ucbC, seed: task.mctsSeed + 1_000_000 });
  let state = createInitialState({ seats: 2, rules, seed: task.seed });
  const actionLog: Action[] = [];
  let steps = 0;
  while (state.phase !== 'ended' && steps < MAX_STEPS_PER_GAME) {
    const seat = actingSeat(state);
    const view = toSeatView(state, seat);
    const legal = legalActions(state, seat, rules);
    if (legal.length === 0) {
      return { kind: 'deadlocked', steps, actionLog };
    }
    const ai = seat === 0 ? ai0 : ai1;
    const action = await ai.play(view, legal);
    actionLog.push(action);
    state = reduce(state, action, rules);
    steps++;
  }
  return {
    kind: state.phase === 'ended' ? 'completed' : 'timedout',
    steps,
    actionLog,
  };
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const task = JSON.parse(line) as Task;
    const result = await playOne(task);
    process.stdout.write(JSON.stringify({ seed: task.seed, ...result }) + '\n');
  }
}

main().catch((e) => {
  console.error('mcts-data-worker error:', e);
  process.exit(1);
});
