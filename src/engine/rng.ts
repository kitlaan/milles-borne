// Seeded PRNG state, serializable as plain JSON.
//
// We model the PRNG as { seed, stepCount }: replay reconstructs the
// generator from seed and fast-forwards `stepCount` steps to produce the
// next value. This keeps state trivially serializable without exposing the
// generator's internal bits.
//
// Performance: each `nextInt` call is O(stepCount); a full game is roughly
// O(stepCount²). For Mille Bornes (~150 random calls per hand), total cost
// is well under a millisecond. Optimize later if we ever build AI search
// that allocates thousands of states per turn.
//
// Bias: we map a 32-bit pure-rand value into [0, max) via modulo. The bias
// is negligible for our ranges (≤ 106 for shuffle, smaller elsewhere); no
// gameplay-relevant fairness depends on perfect uniformity.

import { xoroshiro128plus } from 'pure-rand';

export type RngState = {
  readonly seed: number;
  readonly stepCount: number;
};

export function seedRng(seed: number): RngState {
  return { seed: seed >>> 0, stepCount: 0 };
}

function valueAtStep(rng: RngState): number {
  const gen = xoroshiro128plus(rng.seed);
  for (let i = 0; i < rng.stepCount; i++) {
    gen.unsafeNext();
  }
  // unsafeNext returns a signed 32-bit integer; coerce to unsigned for modulo.
  return gen.unsafeNext() >>> 0;
}

function advance(rng: RngState, count: number): RngState {
  return { seed: rng.seed, stepCount: rng.stepCount + count };
}

// Integer in [0, max). Throws if max <= 0.
export function nextInt(rng: RngState, max: number): [number, RngState] {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error(`nextInt: max must be a positive integer, got ${max}`);
  }
  const v = valueAtStep(rng);
  return [v % max, advance(rng, 1)];
}

// Immutable Fisher-Yates shuffle. Returns shuffled copy + advanced RNG.
//
// The naive `shuffle` is `nextInt` in a loop, which is O(stepCount) per
// call and O(stepCount²) over the whole shuffle. That was fine for
// once-per-game setup shuffles, but MCTS rollouts can call `shuffle`
// thousands of times per decision against an ever-growing `stepCount`,
// making the rest of the search look 50-100× slower than the underlying
// cost of `reduce`. Here we instantiate the generator once, fast-
// forward it to `stepCount` exactly once, then call `unsafeNext` O(1)
// per swap. The returned `RngState` carries the exact same total
// stepCount as the loop version, so determinism is preserved.
export function shuffle<T>(arr: ReadonlyArray<T>, rng: RngState): [T[], RngState] {
  const result = [...arr];
  if (result.length <= 1) return [result, rng];
  const gen = xoroshiro128plus(rng.seed);
  for (let i = 0; i < rng.stepCount; i++) gen.unsafeNext();
  let stepsUsed = 0;
  for (let i = result.length - 1; i > 0; i--) {
    const v = gen.unsafeNext() >>> 0;
    stepsUsed++;
    const j = v % (i + 1);
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return [result, { seed: rng.seed, stepCount: rng.stepCount + stepsUsed }];
}
