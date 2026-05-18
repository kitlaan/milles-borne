// Offline play-strength evaluation for mctsAI, parallelized across a
// pool of subprocess workers.
//
// Usage:
//   npx tsx scripts/eval-mcts.ts <opponent> <K> <N> [games] [seed-offset] [workers]
//
//   opponent     basic | heuristic | mlp
//   K            number of determinizations per MCTS decision
//   N            rollouts per determinization
//   games        total games (default 50). Half are played with MCTS as
//                seat 0, half as seat 1, to neutralize seat-order bias.
//   seed-offset  base game seed (default 1)
//   workers      pool size (default os.availableParallelism() - 1)
//
// Each worker is a long-lived tsx subprocess (`scripts/eval-worker.ts`)
// that consumes one task per line of stdin and writes one result per
// line of stdout. The parent feeds tasks round-robin; workers are
// re-fed as soon as they emit a result.

import { spawn, type ChildProcess } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { createInterface } from 'node:readline';

type Opponent = 'basic' | 'heuristic' | 'mlp';

type Task = {
  readonly seed: number;
  readonly mctsSeat: 0 | 1;
  readonly K: number;
  readonly N: number;
  readonly opponent: Opponent;
  readonly mctsSeed: number;
};

type Result = {
  readonly seed: number;
  readonly winnerSeat: number | null;
  readonly phase: string;
};

function spawnWorker(): { proc: ChildProcess; lines: AsyncIterableIterator<string> } {
  const proc = spawn('npx', ['tsx', 'scripts/eval-worker.ts'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  if (!proc.stdout) throw new Error('worker stdout missing');
  const rl = createInterface({ input: proc.stdout });
  return { proc, lines: rl[Symbol.asyncIterator]() };
}

async function main() {
  const [opponentName, kStr, nStr, gamesStr, seedStr, workersStr] = process.argv.slice(2);
  if (!opponentName || !kStr || !nStr) {
    console.error('usage: eval-mcts.ts <basic|heuristic|mlp> <K> <N> [games] [seed-offset] [workers]');
    process.exit(2);
  }
  const opponent = opponentName as Opponent;
  if (!['basic', 'heuristic', 'mlp'].includes(opponent)) {
    console.error(`unknown opponent: ${opponentName}`);
    process.exit(2);
  }
  const K = Number(kStr);
  const N = Number(nStr);
  const totalGames = Number(gamesStr ?? '50');
  const seedOffset = Number(seedStr ?? '1');
  const workerCount = Math.max(
    1,
    Number(workersStr ?? Math.max(1, availableParallelism() - 1)),
  );

  // Build task list: half games with MCTS as seat 0, half as seat 1.
  const halfGames = Math.floor(totalGames / 2);
  const tasks: Task[] = [];
  for (let i = 0; i < halfGames; i++) {
    tasks.push({ seed: seedOffset + i, mctsSeat: 0, K, N, opponent, mctsSeed: seedOffset + i });
  }
  for (let i = 0; i < totalGames - halfGames; i++) {
    tasks.push({
      seed: seedOffset + halfGames + i,
      mctsSeat: 1,
      K,
      N,
      opponent,
      mctsSeed: seedOffset + halfGames + i,
    });
  }

  const t0 = Date.now();
  console.log(
    `eval mcts(K=${K},N=${N}) vs ${opponent}: ${totalGames} games, ${workerCount} workers`,
  );

  // Spawn workers.
  const workers = Array.from({ length: workerCount }, () => spawnWorker());

  let next = 0;
  let done = 0;
  let mctsWins = 0, oppWins = 0, draws = 0, timeouts = 0;

  async function runWorker(idx: number) {
    const w = workers[idx]!;
    // Seed with one task each.
    if (!w.proc.stdin) throw new Error(`worker ${idx} stdin missing`);
    while (next < tasks.length) {
      const task = tasks[next++]!;
      w.proc.stdin.write(JSON.stringify(task) + '\n');
      const { value: line, done: closed } = await w.lines.next();
      if (closed || !line) {
        console.error(`worker ${idx} closed stdout unexpectedly`);
        return;
      }
      const result = JSON.parse(line) as Result;
      done++;
      if (result.phase !== 'ended') {
        timeouts++;
      } else if (result.winnerSeat === null) {
        draws++;
      } else if (result.winnerSeat === task.mctsSeat) {
        mctsWins++;
      } else {
        oppWins++;
      }
      if (done % 10 === 0 || done === totalGames) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = done / Math.max(elapsed, 0.001);
        console.log(
          `  ${done}/${totalGames}  mcts=${mctsWins} opp=${oppWins} draws=${draws} timeouts=${timeouts}  (${elapsed.toFixed(0)}s, ${rate.toFixed(2)}/s)`,
        );
      }
    }
  }

  await Promise.all(workers.map((_, i) => runWorker(i)));

  // Tear down workers.
  for (const w of workers) {
    w.proc.stdin?.end();
    w.proc.kill();
  }

  const decided = mctsWins + oppWins;
  const winPct = decided > 0 ? (mctsWins / decided) * 100 : 0;
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`\n=== mcts(K=${K},N=${N}) vs ${opponent}, ${totalGames} games (${elapsed.toFixed(0)}s wall) ===`);
  console.log(`mcts wins:    ${mctsWins}`);
  console.log(`opp wins:     ${oppWins}`);
  console.log(`draws:        ${draws}`);
  console.log(`timeouts:     ${timeouts}`);
  console.log(`win rate (of decided): ${winPct.toFixed(1)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
