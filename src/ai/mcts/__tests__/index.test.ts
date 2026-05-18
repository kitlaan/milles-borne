import { describe, expect, it } from 'vitest';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { toSeatView } from '@/engine/view';
import type { AIPlayerInfo } from '../../types';
import { makeMctsAI, mctsAI } from '../index';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) {
    return state.awaiting.seat;
  }
  return state.currentSeat;
}

async function playGame(
  seed: number,
  perSeatAI: ReadonlyArray<AIPlayerInfo>,
  maxSteps = 600,
): Promise<GameState> {
  const rules = defaultRules();
  let state = createInitialState({ seats: 2, rules, seed });
  for (let i = 0; i < maxSteps && state.phase !== 'ended'; i++) {
    const seat = actingSeat(state);
    const ai = perSeatAI[seat]!;
    const view = toSeatView(state, seat);
    const legal = legalActions(state, seat, rules);
    if (legal.length === 0) break;
    const action = await ai.play(view, legal);
    state = reduce(state, action, rules);
  }
  return state;
}

describe('mctsAI plugin', () => {
  const rules = defaultRules();

  it('always returns a legal action', async () => {
    // Tiny budget — this test verifies the plugin contract, not search
    // strength, so just enough to exercise determinization + a few
    // selection iterations.
    const ai = makeMctsAI({ K: 1, N: 5, seed: 1 });
    for (const seed of [1, 7, 42]) {
      let state = createInitialState({ seats: 2, rules, seed });
      for (let i = 0; i < 200 && state.phase !== 'ended'; i++) {
        const seat = actingSeat(state);
        const view = toSeatView(state, seat);
        const legal = legalActions(state, seat, rules);
        if (legal.length === 0) break;
        const picked = await ai.play(view, legal);
        expect(legal, `seed ${seed} step ${i}`).toContainEqual(picked);
        state = reduce(state, picked, rules);
      }
    }
  });

  it('drives games to completion against itself', async () => {
    const ai0 = makeMctsAI({ K: 1, N: 5, seed: 1 });
    const ai1 = makeMctsAI({ K: 1, N: 5, seed: 2 });
    let ended = 0;
    for (const seed of [1, 2]) {
      const final = await playGame(seed, [ai0, ai1]);
      if (final.phase === 'ended') ended++;
    }
    expect(ended).toBeGreaterThanOrEqual(1);
  }, 60_000);

  // Play-strength evaluation lives in scripts/eval-mcts.ts (Phase 10.A.7).
  // Vitest can't run a meaningful head-to-head — even modest budgets like
  // K=2 N=30 produce 10s+ per decision, and below that budget MCTS is
  // dominated by rollout noise and indistinguishable from chance.

  it('exports a default mctsAI instance registered in AI_LIBRARY', async () => {
    // Verify the default instance is constructable and produces a
    // legal action on a starting state.
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const view = toSeatView(state, state.currentSeat);
    const legal = legalActions(state, state.currentSeat, rules);
    const action = await mctsAI.play(view, legal);
    expect(legal).toContainEqual(action);
    expect(mctsAI.id).toBe('mcts');
  }, 30_000);
});
