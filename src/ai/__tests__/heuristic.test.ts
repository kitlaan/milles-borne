import { describe, expect, it } from 'vitest';
import { basicAI } from '../basic';
import { heuristicAI } from '../heuristic';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { computeScores } from '@/engine/score';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { toSeatView } from '@/engine/view';
import type { AIPlayerInfo } from '../types';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
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

describe('heuristic AI', () => {
  const rules = defaultRules();

  it('always returns a legal action', async () => {
    for (const seed of [1, 7, 42, 99, 2024]) {
      let state = createInitialState({ seats: 2, rules, seed });
      for (let i = 0; i < 400 && state.phase !== 'ended'; i++) {
        const seat = actingSeat(state);
        const view = toSeatView(state, seat);
        const legal = legalActions(state, seat, rules);
        const picked = await heuristicAI.play(view, legal);
        expect(legal, `seed ${seed} step ${i}`).toContainEqual(picked);
        state = reduce(state, picked, rules);
      }
    }
  });

  it('drives games to completion against itself', async () => {
    let ended = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const final = await playGame(seed, [heuristicAI, heuristicAI]);
      if (final.phase === 'ended') ended++;
    }
    expect(ended).toBeGreaterThanOrEqual(7); // most should finish
  });

  it('outperforms Basic in head-to-head (Heuristic seat 0 vs Basic seat 1)', async () => {
    let heuristicScore = 0;
    let basicScore = 0;
    for (const seed of Array.from({ length: 20 }, (_, i) => i + 1)) {
      const final = await playGame(seed, [heuristicAI, basicAI]);
      if (final.phase !== 'ended') continue;
      const scores = computeScores(final, rules);
      heuristicScore += scores.find((s) => s.seat === 0)?.total ?? 0;
      basicScore += scores.find((s) => s.seat === 1)?.total ?? 0;
    }
    expect(heuristicScore).toBeGreaterThan(basicScore);
  });
});
