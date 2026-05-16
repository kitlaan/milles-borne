import { describe, expect, it } from 'vitest';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { toSeatView } from '@/engine/view';
import { basicAI } from '../basic';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

describe('basic AI', () => {
  const rules = defaultRules();

  it('always returns a legal action when one exists', async () => {
    const seeds = [1, 7, 42, 99, 2024];
    for (const seed of seeds) {
      let state = createInitialState({ seats: 2, rules, seed });
      for (let i = 0; i < 400 && state.phase !== 'ended'; i++) {
        const seat = actingSeat(state);
        const view = toSeatView(state, seat);
        const legal = legalActions(state, seat, rules);
        const picked = await basicAI.play(view, legal);
        expect(legal, `seed ${seed} step ${i}`).toContainEqual(picked);
        state = reduce(state, picked, rules);
      }
    }
  });

  it('drives at least some seeds to ended phase', async () => {
    let ended = 0;
    for (const seed of Array.from({ length: 10 }, (_, i) => i + 1)) {
      let state = createInitialState({ seats: 2, rules, seed });
      for (let i = 0; i < 600 && state.phase !== 'ended'; i++) {
        const seat = actingSeat(state);
        const view = toSeatView(state, seat);
        const legal = legalActions(state, seat, rules);
        const picked = await basicAI.play(view, legal);
        state = reduce(state, picked, rules);
      }
      if (state.phase === 'ended') ended++;
    }
    expect(ended).toBeGreaterThan(0);
  });
});
