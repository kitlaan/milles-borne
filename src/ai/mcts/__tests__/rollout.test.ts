import { describe, expect, it } from 'vitest';
import { defaultRules } from '@/engine/rules';
import { seedRng } from '@/engine/rng';
import { createInitialState } from '@/engine/setup';
import { makeHeuristicRollout } from '../rollout';

const rules = defaultRules();

describe('makeHeuristicRollout', () => {
  it('terminates and returns a reward in {-1, 0, +1}', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const rollout = makeHeuristicRollout();
    const [reward] = rollout(state, seedRng(0), 0, rules);
    expect([-1, 0, 1]).toContain(reward);
  });

  it('returns opposite-sign reward when viewed from the other seat', () => {
    // Build two fresh rollouts so each gets its own FastRng seeded from
    // the same starting point — the rollouts then trace the same game
    // and the per-seat rewards must mirror.
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const r0Rollout = makeHeuristicRollout();
    const r1Rollout = makeHeuristicRollout();
    const [r0] = r0Rollout(state, seedRng(0), 0, rules);
    const [r1] = r1Rollout(state, seedRng(0), 1, rules);
    if (r0 === 0) {
      expect(r1).toBe(0);
    } else {
      expect(r1).toBe(-r0);
    }
  });

  it('is deterministic across factory instances given identical seed', () => {
    // FastRng is lazy-initialized on the first call and intentionally
    // advances across subsequent calls (that's the point — variance per
    // rollout). Determinism is preserved across separate factory
    // instances: same seed in → same first-call result out.
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const rolloutA = makeHeuristicRollout();
    const rolloutB = makeHeuristicRollout();
    const [a] = rolloutA(state, seedRng(0), 0, rules);
    const [b] = rolloutB(state, seedRng(0), 0, rules);
    expect(a).toBe(b);
  });

  it('produces variance across calls within a factory (FastRng advances)', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const rollout = makeHeuristicRollout();
    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      const [r] = rollout(state, seedRng(0), 0, rules);
      results.push(r);
    }
    const distinct = new Set(results);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('respects maxDepth and returns 0 on a too-shallow cap', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const rollout = makeHeuristicRollout({ maxDepth: 5 });
    const [r] = rollout(state, seedRng(0), 0, rules);
    expect(r).toBe(0);
  });

  it('treats an already-ended state as terminal without further play', () => {
    // Synthesize an ended state via type cast — we only need the shape
    // the rollout reads (`phase`, `winnerSeat`).
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const ended = { ...state, phase: 'ended' as const, winnerSeat: 0 };
    const rollout = makeHeuristicRollout();
    const [r0] = rollout(ended, seedRng(0), 0, rules);
    const [r1] = rollout(ended, seedRng(0), 1, rules);
    expect(r0).toBe(1);
    expect(r1).toBe(-1);
  });
});
