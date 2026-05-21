import { describe, expect, it } from 'vitest';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { toSeatView } from '@/engine/view';
import { mlpAI } from '../index';

const rules = defaultRules();

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

describe('mlpAI', () => {
  it('id, displayName, and version are set', () => {
    expect(mlpAI.id).toBe('mlp');
    // displayName is hardcoded per bundled weights in the form
    // `MLP (v<N>: <data source>)` (see src/ai/ml-mlp/index.ts). Assert
    // the shape so iteration bumps / data-source swaps don't churn this
    // test. version still tracks the weights.version arch tag.
    expect(mlpAI.displayName).toMatch(/^MLP \(v\d+: .+\)$/);
    expect(mlpAI.version).toMatch(/^mlp-v\d+$/);
  });

  it('always returns a legal action across multiple seeds', async () => {
    for (const seed of [1, 7, 42, 99, 2024]) {
      let state = createInitialState({ seats: 2, rules, seed });
      for (let i = 0; i < 300 && state.phase !== 'ended'; i++) {
        const seat = actingSeat(state);
        const view = toSeatView(state, seat);
        const legal = legalActions(state, seat, rules);
        if (legal.length === 0) break;
        const picked = await mlpAI.play(view, legal);
        expect(legal, `seed ${seed} step ${i}`).toContainEqual(picked);
        state = reduce(state, picked, rules);
      }
    }
  });

  it('drives games to completion in self-play', async () => {
    let ended = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      let state = createInitialState({ seats: 2, rules, seed });
      for (let i = 0; i < 600 && state.phase !== 'ended'; i++) {
        const seat = actingSeat(state);
        const view = toSeatView(state, seat);
        const legal = legalActions(state, seat, rules);
        if (legal.length === 0) break;
        const action = await mlpAI.play(view, legal);
        state = reduce(state, action, rules);
      }
      if (state.phase === 'ended') ended++;
    }
    // Even the imitation model should drive most games to completion;
    // the lone-legal short-circuit handles forced-move chains.
    expect(ended).toBeGreaterThanOrEqual(8);
  });
});
