import { describe, expect, it } from 'vitest';
import { legalActions } from '@/engine/legal';
import { defaultRules } from '@/engine/rules';
import { seedRng, type RngState } from '@/engine/rng';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import type { RulePlugin } from '@/engine/rules/types';
import { toSeatView } from '@/engine/view';
import { chooseDeterminizedMcts } from '../determinize';
import { makeHeuristicRollout } from '../rollout';
import type { RolloutPolicy } from '../search';

const rules = defaultRules();

function initialView(seed = 1) {
  const state = createInitialState({ seats: 2, rules, seed });
  const view = toSeatView(state, state.currentSeat);
  const legal = legalActions(state, state.currentSeat, rules);
  return { view, legal };
}

const zeroRollout: RolloutPolicy =
  (_state: GameState, rng: RngState, _seat: number, _rules: ReadonlyArray<RulePlugin>) =>
    [0, rng];

describe('chooseDeterminizedMcts', () => {
  it('returns a legal action', () => {
    const { view, legal } = initialView();
    const [action] = chooseDeterminizedMcts(view, legal, seedRng(0), {
      K: 4,
      N: 20,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: zeroRollout,
    });
    expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(action))).toBe(
      true,
    );
  });

  it('short-circuits when only one action is legal', () => {
    const { view } = initialView();
    const onlyAction = { type: 'DRAW' as const, seat: 0 };
    const [action, rngAfter] = chooseDeterminizedMcts(
      view,
      [onlyAction],
      seedRng(0),
      {
        K: 4,
        N: 20,
        ucbC: Math.SQRT2,
        rules,
        rolloutPolicy: zeroRollout,
      },
    );
    expect(action).toBe(onlyAction);
    expect(rngAfter).toEqual(seedRng(0));
  });

  it('falls back to first legal action when K=0', () => {
    const { view, legal } = initialView();
    const [action] = chooseDeterminizedMcts(view, legal, seedRng(0), {
      K: 0,
      N: 20,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: zeroRollout,
    });
    expect(action).toBe(legal[0]);
  });

  it('is deterministic on a fixed seed', () => {
    const { view, legal } = initialView();
    const cfg = {
      K: 3,
      N: 30,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: zeroRollout,
    };
    const [a] = chooseDeterminizedMcts(view, legal, seedRng(7), cfg);
    const [b] = chooseDeterminizedMcts(view, legal, seedRng(7), cfg);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces a legal action with the heuristic rollout', () => {
    const { view, legal } = initialView();
    const [action] = chooseDeterminizedMcts(view, legal, seedRng(0), {
      K: 2,
      N: 25,
      ucbC: Math.SQRT2,
      rules,
      rolloutPolicy: makeHeuristicRollout(),
    });
    expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(action))).toBe(
      true,
    );
  });

  it('throws when legal is empty', () => {
    const { view } = initialView();
    expect(() =>
      chooseDeterminizedMcts(view, [], seedRng(0), {
        K: 2,
        N: 10,
        ucbC: Math.SQRT2,
        rules,
        rolloutPolicy: zeroRollout,
      }),
    ).toThrow();
  });
});
