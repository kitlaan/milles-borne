// CLI driver: plays a full 2-seat Mille Bornes game between two dumb AIs,
// records every action, persists the final GameRecord, and prints scores.
//
// Usage:
//   tsx src/cli/play.ts [--seed N] [--quiet]
//
// Notes:
//   - Seed defaults to Date.now() (current millis). This is non-reproducible
//     across runs unless `--seed` is provided. The seed is recorded in the
//     GameRecord so the verifier can replay any game.
//   - fake-indexeddb is installed via side-effect import so idb-keyval works
//     in Node.

import 'fake-indexeddb/auto';

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { basicAI } from '@/ai';
import { buildEngineDescriptor } from '@/engine/descriptor';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { computeScores } from '@/engine/score';
import { createInitialState } from '@/engine/setup';
import type { Action } from '@/engine/actions';
import type { GameState } from '@/engine/state';
import { sumDistance } from '@/engine/tableau-query';
import { toSeatView } from '@/engine/view';
import { appendCompletedGame, clearCurrentGame, saveCurrentGame } from '@/persistence/db';
import { buildGameRecord } from '@/persistence/records';
import { hasFlag, parseFlag, readEngineVersion, readGitCommit } from './util';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const seedArg = parseFlag(argv, '--seed');
  const seed = seedArg ? Number(seedArg) : Date.now();
  const quiet = hasFlag(argv, '--quiet');

  const rules = defaultRules();
  const engine = buildEngineDescriptor({
    engineVersion: readEngineVersion(),
    gitCommit: readGitCommit(),
    rules,
  });

  const startedAt = new Date().toISOString();
  let state = createInitialState({ seats: 2, rules, seed });
  const actionLog: Action[] = [];

  if (!quiet) {
    console.log(`Starting game | seed=${seed} | engine=${engine.engineVersion} commit=${engine.gitCommit}`);
  }

  let step = 0;
  const MAX_STEPS = 800;
  while (state.phase !== 'ended' && step < MAX_STEPS) {
    const seat = actingSeat(state);
    const view = toSeatView(state, seat);
    const legal = legalActions(state, seat, rules);
    if (legal.length === 0) {
      throw new Error(`stuck: no legal actions for seat ${seat} at step ${step}`);
    }
    const action = await basicAI.play(view, legal);
    actionLog.push(action);
    state = reduce(state, action, rules);
    await saveCurrentGame({
      state,
      actionLog,
      seed,
      ruleIds: rules.map((r) => r.id),
      startedAt,
    });
    step++;
    if (!quiet && step % 25 === 0) {
      const d = state.seats.map((s) => sumDistance(s)).join(' vs ');
      console.log(`  step ${step}: distances ${d} | deck=${state.deck.length}`);
    }
  }

  if (state.phase !== 'ended') {
    throw new Error(`game did not end within ${MAX_STEPS} steps`);
  }

  const finalScores = computeScores(state, rules);
  const endedAt = new Date().toISOString();
  const record = buildGameRecord({
    engine,
    seed,
    playerConfigs: [
      {
        seatId: 0,
        kind: 'ai',
        displayName: 'Basic 0',
        ai: { id: basicAI.id, version: basicAI.version },
      },
      {
        seatId: 1,
        kind: 'ai',
        displayName: 'Basic 1',
        ai: { id: basicAI.id, version: basicAI.version },
      },
    ],
    actionLog,
    finalScores,
    winnerSeat: state.winnerSeat,
    startedAt,
    endedAt,
    finalState: state,
  });
  await appendCompletedGame(record);
  await clearCurrentGame();

  // Also dump the record as JSON so cross-process verification works.
  // fake-indexeddb is per-process; persistent CLI artifact lives on disk.
  const outDir = join(process.cwd(), 'tmp', 'games');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${record.id}.json`);
  writeFileSync(outFile, JSON.stringify(record, null, 2));

  console.log('\n=== Game ended ===');
  console.log(`seed=${seed}`);
  console.log(`winner=${state.winnerSeat === null ? 'none' : `seat ${state.winnerSeat}`}`);
  for (const s of finalScores) {
    console.log(`  seat ${s.seat}: total=${s.total}`);
    for (const entry of s.breakdown) {
      console.log(`    +${entry.points} ${entry.reason}`);
    }
  }
  console.log(`\nrecord id: ${record.id}`);
  console.log(`actions: ${actionLog.length}`);
  console.log(`record file: ${outFile}`);
  console.log(`\nVerify with: npm run cli:verify -- ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
