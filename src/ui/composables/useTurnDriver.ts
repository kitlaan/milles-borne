// Drives action dispatch for non-interactive turn segments.
//
// Triggers (all keyed off the store's actingSeat + phase):
//   - AI seat's turn / response   → asks dumbAI for an action, dispatches
//   - Human seat in 'draw' phase  → auto-dispatches DRAW (no click needed)
//
// Human seat in 'action' or 'awaiting-response' phase is left to the UI to
// handle via button clicks / hand-card clicks / coup-fourré modal.
//
// `pacing.aiDelayMs` adds a small delay between AI dispatches so the player
// can observe what's happening rather than seeing several plays collapse
// into one render frame.
//
// Re-entry: a Vue `watchEffect` only fires when its tracked deps *change*.
// While our async dispatch is in flight, the effect may fire once (and skip
// due to `inFlight`) but it cannot fire again from the same state change
// after we release the lock. We work around this by calling `tryAdvance()`
// manually at the end of every dispatch, so the next ready transition is
// picked up immediately.

import { watchEffect, type Ref } from 'vue';
import { dumbAI } from '@/ai/dumb';
import { legalActions } from '@/engine/legal';
import type { useGameStore } from '@/ui/stores/game';

type Store = ReturnType<typeof useGameStore>;

export type TurnDriverPacing = {
  readonly aiDelayMs: number;
  readonly humanDrawDelayMs: number;
};

const DEFAULT_PACING: TurnDriverPacing = {
  aiDelayMs: 500,
  humanDrawDelayMs: 200,
};

export function useTurnDriver(
  store: Store,
  running: Ref<boolean>,
  pacing: TurnDriverPacing = DEFAULT_PACING,
): void {
  let inFlight = false;

  function tryAdvance(): void {
    if (inFlight) return;
    if (!running.value) return;
    const state = store.state;
    const phase = store.phase;
    const seat = store.actingSeat;
    if (!state || phase === null || seat === null) return;
    if (phase === 'ended') return;

    const isHuman = seat === store.humanSeat;

    if (isHuman && phase === 'draw') {
      inFlight = true;
      void (async () => {
        await sleep(pacing.humanDrawDelayMs);
        try {
          await store.dispatch({ seat, type: 'DRAW' });
        } catch (err) {
          console.error('[turn-driver] human DRAW failed:', err);
        } finally {
          inFlight = false;
          tryAdvance();
        }
      })();
      return;
    }

    if (!isHuman) {
      inFlight = true;
      void (async () => {
        await sleep(pacing.aiDelayMs);
        try {
          if (!store.state) return;
          const view = store.viewFor(seat);
          if (!view) return;
          const legal = legalActions(store.state, seat, store.activeRules);
          if (legal.length === 0) return;
          const action = await dumbAI.play(view, legal);
          await store.dispatch(action);
        } catch (err) {
          console.error('[turn-driver] AI dispatch failed:', err);
        } finally {
          inFlight = false;
          tryAdvance();
        }
      })();
    }
  }

  // Initial run + react to state changes. The manual `tryAdvance()` call in
  // the finally above handles the missed-trigger case where state changes
  // happen during the async dispatch.
  watchEffect(() => {
    // Touch reactive deps so the effect re-runs when any of these change.
    void store.actingSeat;
    void store.phase;
    void store.state;
    void running.value;
    tryAdvance();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
