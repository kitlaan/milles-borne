// Generic head-to-head eval. Plays N games between two AIs with seat
// swap, runs them in a subprocess pool, reports win/loss/draw of the
// "eval" AI vs the "opponent" AI.
//
// Usage:
//   tsx scripts/eval-head-to-head.ts <eval> <opponent> [games] [seed-offset] [workers]
//
// AI spec accepted (see eval-head-to-head-worker.ts):
//   basic | heuristic | mlp | mlp-v2 | mcts:K:N[:seed]
//
// Half the games are played with the eval-AI as seat 0, half as
// seat 1, to neutralize seat-order bias.

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { createInterface } from 'node:readline';

type Task = {
  readonly seed: number;
  readonly ai0Spec: string;
  readonly ai1Spec: string;
  readonly evalSeat: 0 | 1;
};

type Result = {
  readonly seed: number;
  readonly winnerSeat: number | null;
  readonly phase: string;
  readonly evalSeat: 0 | 1;
};

function spawnWorker() {
  const proc = spawn('npx', ['tsx', 'scripts/eval-head-to-head-worker.ts'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  if (!proc.stdout) throw new Error('worker stdout missing');
  const rl = createInterface({ input: proc.stdout });
  return { proc, lines: rl[Symbol.asyncIterator]() };
}

async function main() {
  const [evalSpec, oppSpec, gamesStr, seedStr, workersStr] = process.argv.slice(2);
  if (!evalSpec || !oppSpec) {
    console.error('usage: eval-head-to-head.ts <eval> <opponent> [games] [seed-offset] [workers]');
    process.exit(2);
  }
  const totalGames = Number(gamesStr ?? '200');
  const seedOffset = Number(seedStr ?? '1');
  const workerCount = Math.max(
    1,
    Number(workersStr ?? Math.max(1, availableParallelism() - 1)),
  );

  const halfGames = Math.floor(totalGames / 2);
  const tasks: Task[] = [];
  for (let i = 0; i < halfGames; i++) {
    tasks.push({
      seed: seedOffset + i,
      ai0Spec: evalSpec,
      ai1Spec: oppSpec,
      evalSeat: 0,
    });
  }
  for (let i = 0; i < totalGames - halfGames; i++) {
    tasks.push({
      seed: seedOffset + halfGames + i,
      ai0Spec: oppSpec,
      ai1Spec: evalSpec,
      evalSeat: 1,
    });
  }

  console.log(
    `eval ${evalSpec} vs ${oppSpec}: ${totalGames} games (${halfGames} each seat), ${workerCount} workers`,
  );
  const t0 = Date.now();
  const workers: ReturnType<typeof spawnWorker>[] = [];
  for (let i = 0; i < workerCount; i++) workers.push(spawnWorker());

  let next = 0;
  let done = 0;
  let evalWins = 0, oppWins = 0, draws = 0, timeouts = 0;

  async function runWorker(idx: number) {
    const w = workers[idx]!;
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
      if (result.phase !== 'ended') timeouts++;
      else if (result.winnerSeat === null) draws++;
      else if (result.winnerSeat === result.evalSeat) evalWins++;
      else oppWins++;
      if (done % 10 === 0 || done === totalGames) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = done / Math.max(elapsed, 0.001);
        console.log(
          `  ${done}/${totalGames}  eval=${evalWins} opp=${oppWins} draws=${draws} timeouts=${timeouts}  (${elapsed.toFixed(0)}s, ${rate.toFixed(2)}/s)`,
        );
      }
    }
  }

  await Promise.all(workers.map((_, i) => runWorker(i)));

  for (const w of workers) {
    w.proc.stdin?.end();
    w.proc.kill();
  }

  const decided = evalWins + oppWins;
  const winPct = decided > 0 ? (evalWins / decided) * 100 : 0;
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`\n=== ${evalSpec} vs ${oppSpec}, ${totalGames} games (${elapsed.toFixed(0)}s) ===`);
  console.log(`eval wins:    ${evalWins}`);
  console.log(`opp wins:     ${oppWins}`);
  console.log(`draws:        ${draws}`);
  console.log(`timeouts:     ${timeouts}`);
  console.log(`win rate (of decided): ${winPct.toFixed(1)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
