import { describe, expect, it } from 'vitest';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { computeScores } from '@/engine/score';
import { createInitialState } from '@/engine/setup';
import { buildEngineDescriptor } from '@/engine/descriptor';
import type { Action } from '@/engine/actions';
import type { GameState } from '@/engine/state';
import {
  appendCompletedGame,
  clearCurrentGame,
  getCompletedGame,
  listCompletedGameIds,
  loadCurrentGame,
  resetStoresForTesting,
  saveCurrentGame,
} from '../db';
import { buildGameRecord } from '../records';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

async function playFullGame(seed: number) {
  const rules = defaultRules();
  let state = createInitialState({ seats: 2, rules, seed });
  const log: Action[] = [];
  for (let i = 0; i < 600 && state.phase !== 'ended'; i++) {
    const legal = legalActions(state, actingSeat(state), rules);
    if (legal.length === 0) break;
    const pick = legal[0]!;
    log.push(pick);
    state = reduce(state, pick, rules);
  }
  return { state, log };
}

describe('persistence', () => {
  // Tests should be hermetic. fake-indexeddb is installed via test-setup.ts.

  it('saves and loads current game snapshot', async () => {
    resetStoresForTesting();
    const rules = defaultRules();
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const snapshot = {
      state,
      actionLog: [],
      seed: 1,
      ruleIds: rules.map((r) => r.id),
      startedAt: '2026-05-14T00:00:00.000Z',
    };
    await saveCurrentGame(snapshot);
    const back = await loadCurrentGame();
    expect(back).toEqual(snapshot);
    await clearCurrentGame();
    expect(await loadCurrentGame()).toBeUndefined();
  });

  it('round-trips a completed game record', async () => {
    resetStoresForTesting();
    const rules = defaultRules();
    const seed = 4242;
    const { state, log } = await playFullGame(seed);
    const engine = buildEngineDescriptor({
      engineVersion: '0.1.0-test',
      gitCommit: 'test',
      rules,
    });
    const scores = computeScores(state, rules);
    const record = buildGameRecord({
      engine,
      seed,
      playerConfigs: [
        {
          seatId: 0,
          kind: 'ai',
          displayName: 'Dumb 0',
          ai: { id: 'dumb', version: '0.1.0' },
        },
        {
          seatId: 1,
          kind: 'ai',
          displayName: 'Dumb 1',
          ai: { id: 'dumb', version: '0.1.0' },
        },
      ],
      actionLog: log,
      finalScores: scores,
      winnerSeat: state.winnerSeat,
      startedAt: '2026-05-14T00:00:00.000Z',
      endedAt: '2026-05-14T00:01:00.000Z',
      finalState: state,
    });
    await appendCompletedGame(record);
    const back = await getCompletedGame(record.id);
    expect(back).toEqual(record);
    const ids = await listCompletedGameIds();
    expect(ids).toContain(record.id);
  });

  it('produces a stable record id for the same seed', async () => {
    const rules = defaultRules();
    const seed = 777;
    const engine = buildEngineDescriptor({
      engineVersion: '0.1.0-test',
      gitCommit: 'test',
      rules,
    });
    const startedAt = '2026-05-14T00:00:00.000Z';
    const endedAt = '2026-05-14T00:01:00.000Z';
    const playA = await playFullGame(seed);
    const playB = await playFullGame(seed);
    const scoresA = computeScores(playA.state, rules);
    const scoresB = computeScores(playB.state, rules);
    const recA = buildGameRecord({
      engine, seed, playerConfigs: [],
      actionLog: playA.log, finalScores: scoresA,
      winnerSeat: playA.state.winnerSeat,
      startedAt, endedAt, finalState: playA.state,
    });
    const recB = buildGameRecord({
      engine, seed, playerConfigs: [],
      actionLog: playB.log, finalScores: scoresB,
      winnerSeat: playB.state.winnerSeat,
      startedAt, endedAt, finalState: playB.state,
    });
    expect(recA.id).toBe(recB.id);
  });
});
