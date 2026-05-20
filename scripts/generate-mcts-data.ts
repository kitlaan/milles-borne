// Generate MCTS self-play training data via a worker pool.
//
// Mirrors `scripts/generate-training-data.ts` (Heuristic, serial) but
// runs games in parallel because MCTS at K=8 N=200 is ~14s/game even
// on a 31-worker pool — serial would be days.
//
// Usage:
//   tsx scripts/generate-mcts-data.ts [--manifest path/to/manifest-mcts.json] [--workers N]
//
// The manifest extends the Heuristic manifest with an `mcts: { K, N,
// ucbC }` block. Output goes to `training-data/<name>.jsonl` in the
// same row format as the Heuristic generator: {seed, actionLog} per
// line, sorted by seed for byte-stable output regardless of worker
// dispatch order.

import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Action } from '@/engine/actions';

type Manifest = {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly numGames: number;
  readonly seedBase: number;
  readonly ai: { readonly id: 'mcts'; readonly version: string };
  readonly ruleIds: ReadonlyArray<string>;
  readonly mcts: { readonly K: number; readonly N: number; readonly ucbC: number };
};

type Result = {
  readonly seed: number;
  readonly kind: 'completed' | 'timedout' | 'deadlocked';
  readonly steps: number;
  readonly actionLog: Action[];
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = join(REPO_ROOT, 'training-data', 'manifest-mcts.json');

function parseArgs(argv: ReadonlyArray<string>): {
  manifestPath: string;
  workers: number;
} {
  let manifestPath = DEFAULT_MANIFEST;
  let workers = Math.max(1, availableParallelism() - 1);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest') {
      const v = argv[i + 1];
      if (!v) throw new Error('--manifest requires a path');
      manifestPath = resolve(v);
      i++;
    } else if (argv[i] === '--workers') {
      const v = argv[i + 1];
      if (!v) throw new Error('--workers requires a value');
      workers = Math.max(1, Number(v));
      i++;
    }
  }
  return { manifestPath, workers };
}

function loadManifest(path: string): Manifest {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as Manifest;
  if (parsed.schemaVersion !== 1) throw new Error(`unsupported schemaVersion`);
  if (parsed.ai.id !== 'mcts') throw new Error(`manifest must have ai.id === "mcts"`);
  if (!parsed.mcts || !Number.isFinite(parsed.mcts.K) || !Number.isFinite(parsed.mcts.N)) {
    throw new Error(`manifest.mcts.{K,N} required`);
  }
  return parsed;
}

function spawnWorker(): {
  proc: ChildProcess;
  lines: AsyncIterableIterator<string>;
} {
  const proc = spawn('npx', ['tsx', 'scripts/mcts-data-worker.ts'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  if (!proc.stdout) throw new Error('worker stdout missing');
  const rl = createInterface({ input: proc.stdout });
  return { proc, lines: rl[Symbol.asyncIterator]() };
}

async function main(): Promise<void> {
  const { manifestPath, workers: workerCount } = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(manifestPath);

  const outDir = dirname(manifestPath);
  const outPath = join(outDir, `${manifest.name}.jsonl`);
  const tmpPath = `${outPath}.tmp`;

  console.log(
    `Generating ${manifest.numGames} MCTS(K=${manifest.mcts.K},N=${manifest.mcts.N}) self-play games | ` +
      `seedBase=${manifest.seedBase} | workers=${workerCount}`,
  );
  const start = Date.now();

  const tasks = Array.from({ length: manifest.numGames }, (_, i) => ({
    seed: manifest.seedBase + i,
    K: manifest.mcts.K,
    N: manifest.mcts.N,
    ucbC: manifest.mcts.ucbC,
    // Per-game MCTS seed derived from the game seed so reruns are
    // byte-identical and unrelated games don't share MCTS RNG state.
    mctsSeed: manifest.seedBase + i,
    ruleIds: manifest.ruleIds,
  }));

  const workers = Array.from({ length: workerCount }, () => spawnWorker());

  let next = 0;
  let done = 0;
  let completed = 0;
  let timedout = 0;
  let deadlocked = 0;
  let totalSteps = 0;
  const resultsBySeed = new Map<number, Result>();

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
      resultsBySeed.set(result.seed, result);
      done++;
      totalSteps += result.steps;
      if (result.kind === 'completed') completed++;
      else if (result.kind === 'timedout') timedout++;
      else deadlocked++;
      if (done % 50 === 0 || done === manifest.numGames) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = done / Math.max(elapsed, 0.001);
        const eta = (manifest.numGames - done) / Math.max(rate, 0.001);
        console.log(
          `  ${done}/${manifest.numGames}  completed=${completed} timedout=${timedout} deadlocked=${deadlocked}` +
            `  mean steps ${(totalSteps / done).toFixed(1)}  (${elapsed.toFixed(0)}s elapsed, ` +
            `${rate.toFixed(2)}/s, ETA ${(eta / 60).toFixed(0)}m)`,
        );
      }
    }
  }

  await Promise.all(workers.map((_, i) => runWorker(i)));

  for (const w of workers) {
    w.proc.stdin?.end();
    w.proc.kill();
  }

  // Sort by seed for byte-stable JSONL output.
  const sorted = [...resultsBySeed.values()].sort((a, b) => a.seed - b.seed);
  const lines: string[] = [];
  for (const r of sorted) {
    if (r.kind === 'completed') {
      lines.push(JSON.stringify({ seed: r.seed, actionLog: r.actionLog }));
    } else {
      console.warn(
        `[generate-mcts-data] seed ${r.seed}: ${r.kind} at step ${r.steps} — skipping`,
      );
    }
  }

  writeFileSync(tmpPath, lines.join('\n') + '\n');
  renameSync(tmpPath, outPath);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s | wrote ${lines.length} completed games (skipped ${timedout} timed-out, ${deadlocked} deadlocked) → ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
