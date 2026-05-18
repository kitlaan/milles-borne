// Eval pool worker. Reads tasks as newline-delimited JSON from stdin,
// plays each game to completion with the requested AIs, writes one
// result JSON line per task to stdout. stderr is reserved for human
// messages.
//
// Protocol (parent → worker):
//   { seed: number, mctsSeat: 0|1, K: number, N: number,
//     opponent: 'basic'|'heuristic'|'mlp', mctsSeed: number }
//
// Protocol (worker → parent):
//   { seed, winnerSeat: number|null, phase: string }

import readline from 'node:readline';
import { basicAI } from '@/ai/basic';
import { heuristicAI } from '@/ai/heuristic';
import { makeMctsAI } from '@/ai/mcts';
import { mlpAI } from '@/ai/ml-mlp';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import type { GameState } from '@/engine/state';
import type { AIPlayerInfo } from '@/ai/types';

type Task = {
  readonly seed: number;
  readonly mctsSeat: 0 | 1;
  readonly K: number;
  readonly N: number;
  readonly opponent: 'basic' | 'heuristic' | 'mlp';
  readonly mctsSeed: number;
};

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

function pickOpponent(name: Task['opponent']): AIPlayerInfo {
  switch (name) {
    case 'basic': return basicAI;
    case 'heuristic': return heuristicAI;
    case 'mlp': return mlpAI;
  }
}

async function playGame(task: Task): Promise<{ winnerSeat: number | null; phase: GameState['phase'] }> {
  const rules = defaultRules();
  const opponent = pickOpponent(task.opponent);
  const mcts = makeMctsAI({ K: task.K, N: task.N, seed: task.mctsSeed });
  const perSeat: AIPlayerInfo[] =
    task.mctsSeat === 0 ? [mcts, opponent] : [opponent, mcts];
  let state = createInitialState({ seats: 2, rules, seed: task.seed });
  for (let i = 0; i < 800 && state.phase !== 'ended'; i++) {
    const seat = actingSeat(state);
    const ai = perSeat[seat]!;
    const view = toSeatView(state, seat);
    const legal = legalActions(state, seat, rules);
    if (legal.length === 0) break;
    const action = await ai.play(view, legal);
    state = reduce(state, action, rules);
  }
  return { winnerSeat: state.winnerSeat, phase: state.phase };
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const task = JSON.parse(line) as Task;
    const result = await playGame(task);
    process.stdout.write(JSON.stringify({ seed: task.seed, ...result }) + '\n');
  }
}

main().catch((e) => {
  console.error('worker error:', e);
  process.exit(1);
});
