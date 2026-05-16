// Generate training data for the ML AI variants by running Heuristic
// self-play. Reads `training-data/manifest.json`, plays N games with
// deterministic per-game seeds, and writes one JSONL row per game:
//
//   {"seed": <number>, "actionLog": [...]}
//
// Output goes to `training-data/<name>.jsonl` (gitignored). The action log
// + seed pair is enough to replay the game from scratch through the engine,
// so training scripts can materialize whatever features they need without
// re-running this script.
//
// Usage:
//   npm run generate-training-data
//   tsx scripts/generate-training-data.ts [--manifest path/to/manifest.json]

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiOrDefault } from '@/ai';
import type { Action } from '@/engine/actions';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { rulesFromIds } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { toSeatView } from '@/engine/view';

type Manifest = {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly numGames: number;
  readonly seedBase: number;
  readonly ai: { readonly id: string; readonly version: string };
  readonly ruleIds: ReadonlyArray<string>;
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = join(REPO_ROOT, 'training-data', 'manifest.json');
const MAX_STEPS_PER_GAME = 800;

function parseArgs(argv: ReadonlyArray<string>): { manifestPath: string } {
  let manifestPath = DEFAULT_MANIFEST;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest') {
      const v = argv[i + 1];
      if (!v) throw new Error('--manifest requires a path');
      manifestPath = resolve(v);
      i++;
    }
  }
  return { manifestPath };
}

function loadManifest(path: string): Manifest {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as Manifest;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`manifest schemaVersion ${parsed.schemaVersion} not supported (expected 1)`);
  }
  if (!Number.isInteger(parsed.numGames) || parsed.numGames <= 0) {
    throw new Error(`manifest numGames must be a positive integer`);
  }
  if (!Number.isInteger(parsed.seedBase)) {
    throw new Error(`manifest seedBase must be an integer`);
  }
  return parsed;
}

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

async function playOneGame(
  seed: number,
  rules: ReturnType<typeof rulesFromIds>,
  ai: ReturnType<typeof aiOrDefault>,
): Promise<{ actionLog: Action[]; completed: boolean; steps: number }> {
  let state = createInitialState({ seats: 2, rules, seed });
  const actionLog: Action[] = [];
  let steps = 0;
  while (state.phase !== 'ended' && steps < MAX_STEPS_PER_GAME) {
    const seat = actingSeat(state);
    const view = toSeatView(state, seat);
    const legal = legalActions(state, seat, rules);
    if (legal.length === 0) {
      // Engine should never produce a deadlock; surface loudly.
      throw new Error(`generator deadlock: seat ${seat} has no legal actions at step ${steps} (seed ${seed})`);
    }
    const action = await ai.play(view, legal);
    actionLog.push(action);
    state = reduce(state, action, rules);
    steps++;
  }
  return { actionLog, completed: state.phase === 'ended', steps };
}

async function main(): Promise<void> {
  const { manifestPath } = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(manifestPath);

  const ai = aiOrDefault(manifest.ai.id);
  if (ai.id !== manifest.ai.id) {
    throw new Error(
      `manifest pins AI id "${manifest.ai.id}" but the registry resolved "${ai.id}" — unknown AI?`,
    );
  }
  if (ai.version !== manifest.ai.version) {
    console.warn(
      `[generate-training-data] WARNING: manifest pins ai.version=${manifest.ai.version} ` +
        `but code has ${ai.version}. Data will reflect the code, not the manifest.`,
    );
  }

  const rules = rulesFromIds(manifest.ruleIds);

  const outDir = dirname(manifestPath);
  const outPath = join(outDir, `${manifest.name}.jsonl`);
  const tmpPath = `${outPath}.tmp`;

  const start = Date.now();
  console.log(
    `Generating ${manifest.numGames} games | seedBase=${manifest.seedBase} | ai=${ai.id}@${ai.version} | rules=${manifest.ruleIds.join(',')}`,
  );

  const lines: string[] = [];
  let completed = 0;
  let totalSteps = 0;

  for (let i = 0; i < manifest.numGames; i++) {
    const seed = manifest.seedBase + i;
    const { actionLog, completed: ok, steps } = await playOneGame(seed, rules, ai);
    if (ok) completed++;
    totalSteps += steps;
    lines.push(JSON.stringify({ seed, actionLog }));
    if ((i + 1) % 100 === 0) {
      const pct = ((i + 1) / manifest.numGames) * 100;
      console.log(
        `  ${i + 1}/${manifest.numGames} games (${pct.toFixed(1)}%) | mean steps ${(totalSteps / (i + 1)).toFixed(1)}`,
      );
    }
  }

  // Atomic write: tmp + rename so a Ctrl-C mid-write doesn't leave a
  // partially-written .jsonl that downstream scripts would happily read.
  writeFileSync(tmpPath, lines.join('\n') + '\n');
  renameSync(tmpPath, outPath);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s | wrote ${manifest.numGames} games (${completed} completed, ${manifest.numGames - completed} timed out) → ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
