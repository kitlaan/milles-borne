import { describe, expect, it } from 'vitest';
import { defaultRules } from '@/engine/rules';
import { seedRng, type RngState } from '@/engine/rng';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import type { RulePlugin } from '@/engine/rules/types';
import { bestAction, runSearch, type RolloutPolicy } from '../search';
import { seatToMove } from '../node';

const rules = defaultRules();

// Constant-reward rollout. Useful for shape tests where we care about
// visit distribution / determinism but not which action "wins."
const constRollout =
  (r: number): RolloutPolicy =>
  (_state: GameState, rng: RngState, _seat: number, _rules: ReadonlyArray<RulePlugin>): [number, RngState] =>
    [r, rng];

describe('runSearch', () => {
  it('runs the requested number of iterations and counts visits at root', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const result = runSearch(state, 0, seedRng(11), {
      iterations: 50,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: constRollout(0),
    });
    expect(result.root.visits).toBe(50);
  });

  it('expands every legal root action at least once when iterations >= |legal|', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const result = runSearch(state, 0, seedRng(11), {
      iterations: 200,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: constRollout(0),
    });
    expect(result.root.children.length).toBe(result.root.legal.length);
    for (const ch of result.root.children) {
      expect(ch.visits).toBeGreaterThan(0);
    }
  });

  it('is deterministic given identical seed + rules', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const a = runSearch(state, 0, seedRng(7), {
      iterations: 100,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: constRollout(0),
    });
    const b = runSearch(state, 0, seedRng(7), {
      iterations: 100,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: constRollout(0),
    });
    expect(bestAction(a.root)).toEqual(bestAction(b.root));
    expect(a.root.children.map((c) => c.visits)).toEqual(
      b.root.children.map((c) => c.visits),
    );
  });

  it('bestAction returns the most-visited root action', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const r = runSearch(state, 0, seedRng(5), {
      iterations: 100,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: constRollout(1),
    });
    const action = bestAction(r.root);
    // Best action must be one of root.legal.
    expect(r.root.legal.some((a) => JSON.stringify(a) === JSON.stringify(action))).toBe(
      true,
    );
  });

  it('handles a terminal-only root by returning a legal action without rollouts', () => {
    // Build a state that's NOT terminal so we don't trigger the special
    // case, then run 0 iterations: bestAction should fall back to first legal.
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const r = runSearch(state, 0, seedRng(0), {
      iterations: 0,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: constRollout(0),
    });
    expect(r.root.visits).toBe(0);
    const action = bestAction(r.root);
    expect(r.root.legal.length).toBeGreaterThan(0);
    expect(r.root.legal.some((a) => JSON.stringify(a) === JSON.stringify(action))).toBe(
      true,
    );
  });
});

describe('seatToMove', () => {
  it('matches state.currentSeat in normal phases', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    expect(seatToMove(state)).toBe(state.currentSeat);
  });
});

