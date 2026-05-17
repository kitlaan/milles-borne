// Train the MLP AI variant via supervised imitation of the Heuristic AI.
//
// Reads `training-data/*.jsonl` (raw seed + actionLog rows from
// generate-training-data), replays each game through the engine, captures
// (features, target-slot) samples at every decision point where the actor
// had more than one legal option, then runs hand-rolled mini-batch SGD
// with momentum to minimize cross-entropy over the action vocabulary.
//
// Outputs:
//   src/ai/ml-mlp/weights.json   — committed, loaded by the AI plugin
//   src/ai/ml-mlp/report.json    — committed, captures quality metrics so
//                                   PR diffs surface drift
//
// Determinism: weight init, sample shuffle, and train/eval split are all
// driven by a single train-seed PRNG. Replays are deterministic from the
// upstream JSONL. Re-running with the same args produces bit-identical
// weights — the contract that `verify-weights` (Phase 8.7) enforces.
//
// Usage:
//   npm run train
//   tsx scripts/train.ts [--manifest ...] [--jsonl ...] [--weights-out ...]
//                        [--report-out ...] [--epochs N] [--batch-size N]
//                        [--lr F] [--momentum F] [--seed N]
//                        [--hidden 64,64] [--eval-games N]

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { xoroshiro128plus } from 'pure-rand';
import { aiOrDefault, heuristicAI } from '@/ai';
import type { Action } from '@/engine/actions';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { rulesFromIds } from '@/engine/rules';
import { computeScores } from '@/engine/score';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { toSeatView } from '@/engine/view';
import {
  ACTION_VOCAB_SIZE,
  encodeActionSlot,
  legalActionMask,
} from '@/ai/ml-mlp/actions';
import { FEATURE_DIM, encodeFeatures } from '@/ai/ml-mlp/features';
import { type MlpLayer, type MlpWeights } from '@/ai/ml-mlp/forward';
import { chooseActionFromModel } from '@/ai/ml-mlp/inference';

type Manifest = {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly numGames: number;
  readonly seedBase: number;
  readonly ai: { readonly id: string; readonly version: string };
  readonly ruleIds: ReadonlyArray<string>;
};

type ReplayRow = { readonly seed: number; readonly actionLog: ReadonlyArray<Action> };

type Sample = {
  readonly features: number[];
  readonly target: number;
  // Boolean mask (Uint8Array of length ACTION_VOCAB_SIZE) — 1 at slots
  // that have a legal action in this state. The training loss uses a
  // masked softmax so capacity is spent on legal-slot competition,
  // not on suppressing always-illegal slots.
  readonly legalMask: Uint8Array;
};

type TrainArgs = {
  manifestPath: string;
  jsonlPath: string | null;
  weightsOut: string;
  reportOut: string;
  epochs: number;
  batchSize: number;
  lr: number;
  momentum: number;
  seed: number;
  hiddenDims: number[];
  evalGames: number;
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv: ReadonlyArray<string>): TrainArgs {
  const args: TrainArgs = {
    manifestPath: join(REPO_ROOT, 'training-data', 'manifest.json'),
    jsonlPath: null,
    weightsOut: join(REPO_ROOT, 'src', 'ai', 'ml-mlp', 'weights.json'),
    reportOut: join(REPO_ROOT, 'src', 'ai', 'ml-mlp', 'report.json'),
    epochs: 15,
    batchSize: 64,
    lr: 0.01,
    momentum: 0.9,
    seed: 20260516,
    hiddenDims: [64, 64],
    evalGames: 100,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    const need = () => {
      if (v === undefined) throw new Error(`${k} requires a value`);
      i++;
      return v;
    };
    switch (k) {
      case '--manifest':
        args.manifestPath = resolve(need());
        break;
      case '--jsonl':
        args.jsonlPath = resolve(need());
        break;
      case '--weights-out':
        args.weightsOut = resolve(need());
        break;
      case '--report-out':
        args.reportOut = resolve(need());
        break;
      case '--epochs':
        args.epochs = Number(need());
        break;
      case '--batch-size':
        args.batchSize = Number(need());
        break;
      case '--lr':
        args.lr = Number(need());
        break;
      case '--momentum':
        args.momentum = Number(need());
        break;
      case '--seed':
        args.seed = Number(need());
        break;
      case '--hidden':
        args.hiddenDims = need()
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);
        break;
      case '--eval-games':
        args.evalGames = Number(need());
        break;
      default:
        throw new Error(`unknown argument: ${k}`);
    }
  }
  return args;
}

function loadManifest(path: string): Manifest {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`manifest schemaVersion ${parsed.schemaVersion} not supported`);
  }
  return parsed;
}

function loadJsonl(path: string): ReplayRow[] {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').map((line) => JSON.parse(line) as ReplayRow);
}

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) {
    return state.awaiting.seat;
  }
  return state.currentSeat;
}

// Replay a single game and collect training samples at every decision
// point where the actor had a real choice (legal.length > 1). Forced
// moves contain no learning signal.
function extractSamples(
  row: ReplayRow,
  rules: ReturnType<typeof rulesFromIds>,
): Sample[] {
  let state = createInitialState({ seats: 2, rules, seed: row.seed });
  const samples: Sample[] = [];
  for (const action of row.actionLog) {
    const seat = actingSeat(state);
    const legal = legalActions(state, seat, rules);
    if (legal.length > 1) {
      const view = toSeatView(state, seat);
      const slot = encodeActionSlot(action, view.self.hand);
      if (slot !== null) {
        const legalMask = new Uint8Array(ACTION_VOCAB_SIZE);
        for (const a of legal) {
          const s = encodeActionSlot(a, view.self.hand);
          if (s !== null) legalMask[s] = 1;
        }
        samples.push({ features: encodeFeatures(view), target: slot, legalMask });
      }
    }
    state = reduce(state, action, rules);
  }
  return samples;
}

// Seeded uniform / Gaussian PRNG using pure-rand for reproducibility.
function makeRng(seed: number) {
  const gen = xoroshiro128plus(seed);
  const nextUnit = (): number => (gen.unsafeNext() >>> 0) / 0x100000000;
  return {
    next: nextUnit,
    gaussian(): number {
      const u1 = Math.max(1e-12, nextUnit());
      const u2 = nextUnit();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

// He / Kaiming initialization (good fit for ReLU): biases zero, weights
// drawn from N(0, sqrt(2 / fan_in)).
function initWeights(
  version: string,
  inputDim: number,
  hiddenDims: ReadonlyArray<number>,
  outputDim: number,
  seed: number,
): MlpWeights {
  const rng = makeRng(seed);
  const dims: number[] = [inputDim, ...hiddenDims, outputDim];
  const layers: MlpLayer[] = [];
  for (let li = 1; li < dims.length; li++) {
    const fanIn = dims[li - 1]!;
    const out = dims[li]!;
    const scale = Math.sqrt(2 / fanIn);
    const weights: number[][] = new Array(out);
    for (let j = 0; j < out; j++) {
      const row: number[] = new Array(fanIn);
      for (let i = 0; i < fanIn; i++) row[i] = rng.gaussian() * scale;
      weights[j] = row;
    }
    layers.push({ weights, biases: new Array<number>(out).fill(0) });
  }
  return { version, inputDim, hiddenDims: [...hiddenDims], outputDim, layers };
}

// In-place Fisher-Yates with the seeded RNG.
function shuffleInPlace<T>(arr: T[], rng: ReturnType<typeof makeRng>): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// Stable masked softmax: only legal slots (mask[i] !== 0) participate
// in the normalization. Illegal slots receive probability 0, so the
// downstream backprop step `dz = probs - one_hot(target)` zeroes their
// gradient — capacity flows only into the legal-slot competition,
// which is what inference will see.
function maskedSoftmax(
  logits: ReadonlyArray<number>,
  mask: Uint8Array,
): number[] {
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < logits.length; i++) {
    if (mask[i] && logits[i]! > max) max = logits[i]!;
  }
  const out = new Array<number>(logits.length).fill(0);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    if (mask[i]) {
      const e = Math.exp(logits[i]! - max);
      out[i] = e;
      sum += e;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / sum;
  return out;
}

type MutableLayer = { weights: number[][]; biases: number[] };

// One forward+backward over a single sample. Accumulates gradients into
// `gradsAcc`. Returns the per-sample cross-entropy loss.
function forwardBackwardOne(
  layers: ReadonlyArray<MutableLayer>,
  sample: Sample,
  gradsAcc: MutableLayer[],
): number {
  const L = layers.length;
  const pre: number[][] = new Array(L); // z_l (pre-activation)
  const act: number[][] = new Array(L + 1); // h_l (post-activation); act[0] = input
  act[0] = sample.features;

  // Forward.
  for (let l = 0; l < L; l++) {
    const layer = layers[l]!;
    const z = new Array<number>(layer.biases.length);
    for (let j = 0; j < layer.biases.length; j++) {
      let s = layer.biases[j]!;
      const row = layer.weights[j]!;
      const aPrev = act[l]!;
      for (let i = 0; i < row.length; i++) s += row[i]! * aPrev[i]!;
      z[j] = s;
    }
    pre[l] = z;
    if (l === L - 1) {
      act[l + 1] = z; // last layer: raw logits
    } else {
      const a = new Array<number>(z.length);
      for (let j = 0; j < z.length; j++) a[j] = z[j]! > 0 ? z[j]! : 0;
      act[l + 1] = a;
    }
  }

  // Loss: cross-entropy of *masked* softmax over last-layer logits.
  // Only legal slots contribute to the normalization; illegal slots
  // get probability 0 and therefore zero gradient.
  const probs = maskedSoftmax(act[L]!, sample.legalMask);
  const target = sample.target;
  const loss = -Math.log(Math.max(1e-12, probs[target]!));

  // Backprop.
  // dz_L = probs - one_hot(target)
  let dz: number[] = new Array(probs.length);
  for (let j = 0; j < probs.length; j++) dz[j] = probs[j]! - (j === target ? 1 : 0);

  for (let l = L - 1; l >= 0; l--) {
    const layer = layers[l]!;
    const aPrev = act[l]!;
    const gAcc = gradsAcc[l]!;
    // Accumulate dW, db.
    for (let j = 0; j < layer.biases.length; j++) {
      gAcc.biases[j] = gAcc.biases[j]! + dz[j]!;
      const row = gAcc.weights[j]!;
      const dzj = dz[j]!;
      for (let i = 0; i < aPrev.length; i++) row[i] = row[i]! + dzj * aPrev[i]!;
    }
    if (l === 0) break;
    // Propagate to previous layer: da_{l-1} = W_l^T @ dz_l, then mask by ReLU.
    const inDim = aPrev.length;
    const next = new Array<number>(inDim).fill(0);
    for (let j = 0; j < layer.biases.length; j++) {
      const row = layer.weights[j]!;
      const dzj = dz[j]!;
      for (let i = 0; i < inDim; i++) next[i] = next[i]! + row[i]! * dzj;
    }
    const zPrev = pre[l - 1]!;
    for (let i = 0; i < inDim; i++) {
      if (zPrev[i]! <= 0) next[i] = 0;
    }
    dz = next;
  }

  return loss;
}

function zeroGrads(layers: ReadonlyArray<MutableLayer>): MutableLayer[] {
  return layers.map((l) => ({
    weights: l.weights.map((row) => row.map(() => 0)),
    biases: l.biases.map(() => 0),
  }));
}

function zeroVelocity(layers: ReadonlyArray<MutableLayer>): MutableLayer[] {
  return zeroGrads(layers);
}

// Apply SGD-with-momentum update from accumulated batch gradients.
function applyUpdate(
  layers: MutableLayer[],
  grads: MutableLayer[],
  velocity: MutableLayer[],
  batch: number,
  lr: number,
  momentum: number,
): void {
  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l]!;
    const g = grads[l]!;
    const v = velocity[l]!;
    for (let j = 0; j < layer.biases.length; j++) {
      const gb = g.biases[j]! / batch;
      v.biases[j] = momentum * v.biases[j]! + gb;
      layer.biases[j] = layer.biases[j]! - lr * v.biases[j]!;
      const row = layer.weights[j]!;
      const gRow = g.weights[j]!;
      const vRow = v.weights[j]!;
      for (let i = 0; i < row.length; i++) {
        const gw = gRow[i]! / batch;
        vRow[i] = momentum * vRow[i]! + gw;
        row[i] = row[i]! - lr * vRow[i]!;
      }
    }
  }
}

// Train for N epochs. Returns the final epoch's mean loss.
function train(
  weights: MlpWeights,
  samples: Sample[],
  epochs: number,
  batchSize: number,
  lr: number,
  momentum: number,
  rng: ReturnType<typeof makeRng>,
): { finalLoss: number; perEpochLoss: number[] } {
  const layers = weights.layers as MutableLayer[];
  const velocity = zeroVelocity(layers);
  const perEpochLoss: number[] = [];
  for (let epoch = 0; epoch < epochs; epoch++) {
    shuffleInPlace(samples, rng);
    let total = 0;
    for (let bStart = 0; bStart < samples.length; bStart += batchSize) {
      const bEnd = Math.min(samples.length, bStart + batchSize);
      const grads = zeroGrads(layers);
      let batchLoss = 0;
      for (let i = bStart; i < bEnd; i++) {
        batchLoss += forwardBackwardOne(layers, samples[i]!, grads);
      }
      total += batchLoss;
      applyUpdate(layers, grads, velocity, bEnd - bStart, lr, momentum);
    }
    const mean = total / samples.length;
    perEpochLoss.push(mean);
    console.log(`  epoch ${epoch + 1}/${epochs} | mean loss ${mean.toFixed(4)}`);
  }
  return { finalLoss: perEpochLoss[perEpochLoss.length - 1] ?? NaN, perEpochLoss };
}

// Action-agreement on a held-out set: fraction of samples where the
// model's argmax over legal slots matches the labeled target. (We can
// re-derive the legal mask from the original state by re-replaying.)
function evalActionAgreement(
  weights: MlpWeights,
  evalReplays: ReadonlyArray<ReplayRow>,
  rules: ReturnType<typeof rulesFromIds>,
): { agreement: number; n: number } {
  let total = 0;
  let agree = 0;
  for (const row of evalReplays) {
    let state = createInitialState({ seats: 2, rules, seed: row.seed });
    for (const action of row.actionLog) {
      const seat = actingSeat(state);
      const legal = legalActions(state, seat, rules);
      if (legal.length > 1) {
        const view = toSeatView(state, seat);
        const target = encodeActionSlot(action, view.self.hand);
        const picked = chooseActionFromModel(weights, view, legal);
        const pickedSlot = encodeActionSlot(picked, view.self.hand);
        if (target !== null && pickedSlot !== null) {
          total++;
          if (pickedSlot === target) agree++;
        }
        // Sanity: mask should contain target.
        const mask = legalActionMask(view, legal);
        if (target !== null && !mask[target]) {
          throw new Error(`eval: target slot ${target} not in legal mask`);
        }
      }
      state = reduce(state, action, rules);
    }
  }
  return { agreement: total === 0 ? 0 : agree / total, n: total };
}

// Head-to-head: model (seat 0) vs heuristic (seat 1) over a fixed seed
// set. Returns model win-rate.
async function evalWinRate(
  weights: MlpWeights,
  rules: ReturnType<typeof rulesFromIds>,
  seedBase: number,
  count: number,
): Promise<{ winRate: number; completed: number; modelScore: number; heurScore: number }> {
  let modelWins = 0;
  let completed = 0;
  let modelScore = 0;
  let heurScore = 0;
  for (let i = 0; i < count; i++) {
    const seed = seedBase + i;
    let state = createInitialState({ seats: 2, rules, seed });
    let steps = 0;
    while (state.phase !== 'ended' && steps < 800) {
      const seat = actingSeat(state);
      const view = toSeatView(state, seat);
      const legal = legalActions(state, seat, rules);
      if (legal.length === 0) break;
      const action =
        seat === 0
          ? chooseActionFromModel(weights, view, legal)
          : await heuristicAI.play(view, legal);
      state = reduce(state, action, rules);
      steps++;
    }
    if (state.phase === 'ended') {
      completed++;
      if (state.winnerSeat === 0) modelWins++;
      const scores = computeScores(state, rules);
      modelScore += scores.find((s) => s.seat === 0)?.total ?? 0;
      heurScore += scores.find((s) => s.seat === 1)?.total ?? 0;
    }
  }
  const winRate = completed === 0 ? 0 : modelWins / completed;
  return { winRate, completed, modelScore, heurScore };
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifestPath);

  const jsonlPath =
    args.jsonlPath ?? join(dirname(args.manifestPath), `${manifest.name}.jsonl`);
  console.log(`Loading replays from ${jsonlPath}`);
  const replays = loadJsonl(jsonlPath);
  if (replays.length === 0) {
    throw new Error(`no replays in ${jsonlPath} — run generate-training-data first`);
  }
  console.log(`  ${replays.length} games loaded`);

  // Sanity-check that the replay data was produced by the expected AI.
  const expectedAi = aiOrDefault(manifest.ai.id);
  if (expectedAi.id !== manifest.ai.id) {
    throw new Error(`manifest AI id "${manifest.ai.id}" not in the registry`);
  }

  const rules = rulesFromIds(manifest.ruleIds);

  // Replays + samples are deterministic from the JSONL; sample order is
  // also deterministic until the train RNG shuffles it below.
  const rng = makeRng(args.seed);

  console.log('Extracting samples...');
  let samples: Sample[] = [];
  for (const r of replays) {
    samples.push(...extractSamples(r, rules));
  }
  console.log(`  ${samples.length} samples (decision points with > 1 legal action)`);

  // Held-out split: 10% of *games* for replay-based action-agreement
  // eval. Splitting by game (not by sample) prevents data leakage where
  // an in-game decision and its near-duplicate next-turn decision land
  // on opposite sides.
  shuffleInPlace(replays as ReplayRow[], rng);
  const evalCount = Math.max(1, Math.floor(replays.length * 0.1));
  const evalReplays = (replays as ReplayRow[]).slice(0, evalCount);
  const trainReplays = (replays as ReplayRow[]).slice(evalCount);
  samples = [];
  for (const r of trainReplays) samples.push(...extractSamples(r, rules));
  console.log(
    `  train: ${trainReplays.length} games (${samples.length} samples) | eval: ${evalReplays.length} games`,
  );

  console.log(
    `Initializing weights | input=${FEATURE_DIM} hidden=[${args.hiddenDims.join(',')}] output=${ACTION_VOCAB_SIZE}`,
  );
  const weights = initWeights(
    'mlp-v2',
    FEATURE_DIM,
    args.hiddenDims,
    ACTION_VOCAB_SIZE,
    args.seed,
  );

  console.log(
    `Training | epochs=${args.epochs} batchSize=${args.batchSize} lr=${args.lr} momentum=${args.momentum} seed=${args.seed}`,
  );
  const t0 = Date.now();
  const { finalLoss, perEpochLoss } = train(
    weights,
    samples,
    args.epochs,
    args.batchSize,
    args.lr,
    args.momentum,
    rng,
  );
  const trainSec = (Date.now() - t0) / 1000;
  console.log(`Training done in ${trainSec.toFixed(1)}s | final loss ${finalLoss.toFixed(4)}`);

  console.log(`Evaluating action agreement on ${evalReplays.length} held-out games...`);
  const { agreement, n } = evalActionAgreement(weights, evalReplays, rules);
  console.log(`  agreement: ${(agreement * 100).toFixed(2)}% (n=${n})`);

  console.log(`Evaluating win rate vs Heuristic over ${args.evalGames} seeds...`);
  const winRateSeed = args.seed + 1_000_000; // disjoint from training seeds
  const { winRate, completed, modelScore, heurScore } = await evalWinRate(
    weights,
    rules,
    winRateSeed,
    args.evalGames,
  );
  console.log(
    `  win rate: ${(winRate * 100).toFixed(1)}% over ${completed}/${args.evalGames} completed (model total ${modelScore}, heur total ${heurScore})`,
  );

  writeJsonAtomic(args.weightsOut, weights);
  console.log(`Wrote ${args.weightsOut}`);

  const report = {
    schemaVersion: 1,
    generated: {
      modelVersion: weights.version,
      featureDim: FEATURE_DIM,
      hiddenDims: args.hiddenDims,
      actionVocabSize: ACTION_VOCAB_SIZE,
    },
    training: {
      // Repo-relative so the committed report.json is portable across
      // contributor machines (otherwise a path containing /home/$USER
      // would diff in every PR).
      manifestPath: relative(REPO_ROOT, args.manifestPath),
      jsonlPath: relative(REPO_ROOT, jsonlPath),
      trainReplays: trainReplays.length,
      trainSamples: samples.length,
      epochs: args.epochs,
      batchSize: args.batchSize,
      lr: args.lr,
      momentum: args.momentum,
      seed: args.seed,
      perEpochLoss,
      finalLoss,
      trainSeconds: trainSec,
    },
    eval: {
      heldOutReplays: evalReplays.length,
      actionAgreement: agreement,
      actionAgreementN: n,
      winRateGames: args.evalGames,
      winRate,
      winRateCompleted: completed,
      modelScoreSum: modelScore,
      heuristicScoreSum: heurScore,
    },
  };
  writeJsonAtomic(args.reportOut, report);
  console.log(`Wrote ${args.reportOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
