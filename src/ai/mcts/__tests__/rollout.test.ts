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
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const rollout = makeHeuristicRollout();
    const [r0] = rollout(state, seedRng(0), 0, rules);
    const [r1] = rollout(state, seedRng(0), 1, rules);
    if (r0 === 0) {
      expect(r1).toBe(0);
    } else {
      expect(r1).toBe(-r0);
    }
  });

  it('is deterministic given identical initial state', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const rollout = makeHeuristicRollout();
    const [a] = rollout(state, seedRng(0), 0, rules);
    const [b] = rollout(state, seedRng(0), 0, rules);
    expect(a).toBe(b);
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
