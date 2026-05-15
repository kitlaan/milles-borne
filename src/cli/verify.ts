// CLI verifier: loads a completed GameRecord and replays it.
//
// Usage:
//   tsx src/cli/verify.ts <path-to-record.json>
//
// Reads the JSON file written by `cli:play`, replays the action log from
// the recorded seed + rules, and asserts the replayed final state matches
// the stored finalScores + winnerSeat. Exits 0 on match, 1 on mismatch.
//
// Reads from a file (not IndexedDB) because each `tsx` invocation gets a
// fresh fake-indexeddb; the file dump in play.ts is the persistent artifact.

import { readFileSync } from 'node:fs';
import { reduce } from '@/engine/reducer';
import { rulesFromIds } from '@/engine/rules';
import { computeScores } from '@/engine/score';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import type { SeatScore } from '@/engine/score';
import type { GameRecord } from '@/persistence/records';

function main(): void {
  const argv = process.argv.slice(2);
  const path = argv[0];
  if (!path) {
    console.error('Usage: tsx src/cli/verify.ts <path-to-record.json>');
    process.exit(2);
  }

  const record = JSON.parse(readFileSync(path, 'utf8')) as GameRecord;
  const rules = rulesFromIds(record.engine.rules.map((r) => r.id));
  let state: GameState = createInitialState({
    seats: record.playerConfigs.length || 2,
    rules,
    seed: record.seed,
  });
  for (const action of record.actionLog) {
    state = reduce(state, action, rules);
  }
  const replayedScores = computeScores(state, rules);

  console.log(`Verifying record: ${record.id}`);
  console.log(`  engine: ${record.engine.engineVersion} @ ${record.engine.gitCommit}`);
  console.log(`  rules:  ${record.engine.rules.map((r) => `${r.id}@${r.version}`).join(', ')}`);
  console.log(`  seed:   ${record.seed}`);
  console.log(`  actions: ${record.actionLog.length}`);

  const ok =
    scoresEqual(replayedScores, record.finalScores) &&
    state.winnerSeat === record.winnerSeat;

  if (ok) {
    console.log('OK: replayed final scores match stored record.');
    process.exit(0);
  }
  console.error('MISMATCH:');
  console.error('  stored   :', JSON.stringify(record.finalScores));
  console.error('  replayed :', JSON.stringify(replayedScores));
  console.error(`  winner: stored=${record.winnerSeat} replayed=${state.winnerSeat}`);
  process.exit(1);
}

function scoresEqual(
  a: ReadonlyArray<SeatScore>,
  b: ReadonlyArray<SeatScore>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.seat !== y.seat) return false;
    if (x.total !== y.total) return false;
    if (x.breakdown.length !== y.breakdown.length) return false;
    for (let j = 0; j < x.breakdown.length; j++) {
      const bx = x.breakdown[j]!;
      const by = y.breakdown[j]!;
      if (bx.seat !== by.seat || bx.points !== by.points || bx.reason !== by.reason) return false;
    }
  }
  return true;
}

main();
