// Store-level integration: every dispatched action persists; reload-from-
// scratch restores the same state; an entire game drives end-to-end through
// the store.

import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { legalActions } from '@/engine/legal';
import { defaultRules } from '@/engine/rules';
import {
  clearCurrentGame,
  listCompletedGameIds,
  loadCurrentGame,
  resetStoresForTesting,
} from '@/persistence/db';
import { useGameStore } from '../game';

const rules = defaultRules();

async function freshStore() {
  setActivePinia(createPinia());
  resetStoresForTesting();
  await clearCurrentGame();
  // Drain any completed games left over from a previous test.
  // (idb-keyval doesn't expose a clear-store helper through our wrapper, but
  //  since each `freshStore` call resets the internal store handles, the
  //  in-memory fake-indexeddb DB is the only persistence and tests work
  //  hermetically when we reset the handles.)
  return useGameStore();
}

describe('useGameStore', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    resetStoresForTesting();
    await clearCurrentGame();
  });

  it('init() with no saved game starts a fresh game', async () => {
    const store = await freshStore();
    await store.init();
    expect(store.state).not.toBeNull();
    expect(store.phase).toBe('draw');
    expect(store.actionLog.length).toBe(0);
    expect(store.actingSeat).toBe(0);
  });

  it('dispatch persists the snapshot to IDB after each action', async () => {
    const store = await freshStore();
    await store.newGame(42);
    expect(store.state).not.toBeNull();
    await store.dispatch({ seat: 0, type: 'DRAW' });
    const saved = await loadCurrentGame();
    expect(saved).not.toBeUndefined();
    expect(saved!.actionLog.length).toBe(1);
    expect(saved!.actionLog[0]).toEqual({ seat: 0, type: 'DRAW' });
    expect(saved!.seed).toBe(42);
  });

  it('a second store init() resumes the prior game', async () => {
    const storeA = await freshStore();
    await storeA.newGame(123);
    await storeA.dispatch({ seat: 0, type: 'DRAW' });
    const handAfterDraw = storeA.state!.seats[0]!.hand.length;
    const logLen = storeA.actionLog.length;

    // Simulate page reload: new pinia, new store, same IDB.
    setActivePinia(createPinia());
    const storeB = useGameStore();
    await storeB.init();
    expect(storeB.state!.seats[0]!.hand.length).toBe(handAfterDraw);
    expect(storeB.actionLog.length).toBe(logLen);
    expect(storeB.seed).toBe(123);
  });

  it('drives a full game through the store and writes a completed record', async () => {
    const store = await freshStore();
    await store.newGame(7);

    let step = 0;
    while (store.state && store.state.phase !== 'ended' && step < 800) {
      const seat = store.actingSeat;
      if (seat === null) break;
      const legal = legalActions(store.state, seat, rules);
      if (legal.length === 0) break;
      await store.dispatch(legal[0]!);
      step++;
    }
    expect(store.state!.phase).toBe('ended');
    const ids = await listCompletedGameIds();
    expect(ids.length).toBeGreaterThanOrEqual(1);
    // After end-of-hand, the current-game key was cleared.
    const current = await loadCurrentGame();
    expect(current).toBeUndefined();
  });

  it('newGame() resets state and clears IDB current game', async () => {
    const store = await freshStore();
    await store.newGame(1);
    await store.dispatch({ seat: 0, type: 'DRAW' });
    expect(store.actionLog.length).toBe(1);
    await store.newGame(2);
    expect(store.actionLog.length).toBe(0);
    expect(store.seed).toBe(2);
  });
});
