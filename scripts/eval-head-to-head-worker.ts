// Generic head-to-head worker. Parent specifies the two AI specs in
// the task; worker constructs them and plays one game.
//
// AI spec strings:
//   basic            → basicAI
//   heuristic        → heuristicAI
//   mlp              → mlpAI (the registered version, currently v3)
//   mlp-v2           → MLP loaded from src/ai/ml-mlp/weights-v2.json
//   mcts:K:N[:seed]  → freshly-constructed mctsAI with that config
//
// Each worker constructs ai0 / ai1 once per task; for mcts specs that
// means a fresh FastRng stream per task (which is what we want for
// reproducibility — game seed + mcts seed are both deterministic).
//
// Protocol (parent → worker):
//   { seed: number, ai0Spec: string, ai1Spec: string, evalSeat: 0|1 }
// Protocol (worker → parent):
//   { seed, winnerSeat, phase, evalSeat }

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { basicAI } from '@/ai/basic';
import { heuristicAI } from '@/ai/heuristic';
import { makeMctsAI } from '@/ai/mcts';
import { makeMlpAI, mlpAI, parseWeights } from '@/ai/ml-mlp';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import type { GameState } from '@/engine/state';
import type { AIPlayerInfo } from '@/ai/types';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Task = {
  readonly seed: number;
  readonly ai0Spec: string;
  readonly ai1Spec: string;
  readonly evalSeat: 0 | 1;
};

function loadMlpV2(): AIPlayerInfo {
  const path = join(REPO_ROOT, 'src', 'ai', 'ml-mlp', 'weights-v2.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const weights = parseWeights(raw);
  return makeMlpAI(weights, 'mlp-v2', `MLP v2 (${weights.version})`);
}

let mlpV2: AIPlayerInfo | null = null;

function resolveAi(spec: string): AIPlayerInfo {
  if (spec === 'basic') return basicAI;
  if (spec === 'heuristic') return heuristicAI;
  if (spec === 'mlp') return mlpAI;
  if (spec === 'mlp-v2') {
    if (!mlpV2) mlpV2 = loadMlpV2();
    return mlpV2;
  }
  if (spec.startsWith('mcts:')) {
    const parts = spec.split(':');
    const K = Number(parts[1]);
    const N = Number(parts[2]);
    if (parts[3] !== undefined) {
      return makeMctsAI({ K, N, seed: Number(parts[3]) });
    }
    return makeMctsAI({ K, N });
  }
  throw new Error(`unknown AI spec: ${spec}`);
}

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

async function playOne(task: Task) {
  const rules = defaultRules();
  const ai0 = resolveAi(task.ai0Spec);
  const ai1 = resolveAi(task.ai1Spec);
  const perSeat: AIPlayerInfo[] = [ai0, ai1];
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
  return { seed: task.seed, winnerSeat: state.winnerSeat, phase: state.phase, evalSeat: task.evalSeat };
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const task = JSON.parse(line) as Task;
    const result = await playOne(task);
    process.stdout.write(JSON.stringify(result) + '\n');
  }
}

main().catch((e) => {
  console.error('eval-head-to-head-worker error:', e);
  process.exit(1);
});
