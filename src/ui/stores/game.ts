// Game store: wraps the pure engine reducer with reactive state + IDB
// persistence + identity (human vs AI seats).
//
// Lifecycle:
//   - `init()` is idempotent. On first call, attempts to load `currentGame`
//     from IDB; if absent, creates a fresh game.
//   - `dispatch(action)` runs the reducer, appends to the action log,
//     persists the snapshot, and on hand-end writes a GameRecord.
//   - `newGame(seed?)` clears state + IDB and creates a fresh game.
//
// Rule plugins:
//   `activeRules` is resolved per-game. For a fresh game, rules come from
//   the user's settings (core + opted-in optional rules). For a resumed
//   in-progress game, rules come from the snapshot's stored ruleIds so the
//   game finishes under the rules it was started with — settings changes
//   only affect new games.
//
// `humanSeat` is hardcoded to 0 in phase 2 (solo vs AI). Hot-seat and
// multi-seat AI selection land in later phases.

import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { dumbAI } from '@/ai/dumb';
import type { Action } from '@/engine/actions';
import { buildEngineDescriptor } from '@/engine/descriptor';
import { reduce } from '@/engine/reducer';
import { CORE_RULE_IDS, rulesFromIds } from '@/engine/rules';
import type { RulePlugin } from '@/engine/rules';
import { computeScores } from '@/engine/score';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { toSeatView } from '@/engine/view';
import type { SeatView } from '@/engine/view';
import { useSettings } from '@/ui/composables/useSettings';
import {
  appendCompletedGame,
  clearCurrentGame,
  loadCurrentGame,
  saveCurrentGame,
} from '@/persistence/db';
import { buildGameRecord } from '@/persistence/records';
import type { PlayerConfig } from '@/persistence/records';

const HUMAN_SEAT = 0;
const AI_SEAT = 1;

function defaultPlayerConfigs(): PlayerConfig[] {
  return [
    { seatId: HUMAN_SEAT, kind: 'human', displayName: 'You' },
    {
      seatId: AI_SEAT,
      kind: 'ai',
      displayName: 'Dumb AI',
      ai: { id: dumbAI.id, version: dumbAI.version },
    },
  ];
}

function rulesFromSettings(enabled: ReadonlyArray<string>): RulePlugin[] {
  // Core rules always lead, in their canonical order, followed by any
  // opted-in optional rules.
  return rulesFromIds([...CORE_RULE_IDS, ...enabled]);
}

export const useGameStore = defineStore('game', () => {
  const { settings } = useSettings();

  // Engine state is stored via shallowRef so Vue doesn't deep-watch the
  // entire frozen tree — the reducer returns a new top-level object each
  // dispatch, which is the granularity reactivity actually needs.
  //
  // actionLog and playerConfigs are also shallowRef because (a) we always
  // reassign with new arrays (deep tracking is wasted work), and (b) IDB's
  // structured-clone algorithm can't serialize reactive Proxy objects, so
  // ref<Array> would throw DataCloneError on persist.
  const state = shallowRef<GameState | null>(null);
  const actionLog = shallowRef<Action[]>([]);
  const seed = ref<number>(0);
  const startedAt = ref<string>('');
  const playerConfigs = shallowRef<PlayerConfig[]>(defaultPlayerConfigs());
  const initialized = ref(false);
  // Rules in force for the *current* game. Resolved on init / newGame.
  const activeRules = shallowRef<RulePlugin[]>(
    rulesFromSettings(settings.value.enabledRuleIds),
  );

  const humanSeat = computed(() => HUMAN_SEAT);

  const phase = computed(() => state.value?.phase ?? null);
  const awaiting = computed(() => state.value?.awaiting ?? null);

  // The seat whose turn / response is pending right now. In awaiting-response
  // it is the responder, not the original turn-holder.
  const actingSeat = computed<number | null>(() => {
    const s = state.value;
    if (!s) return null;
    if (s.phase === 'awaiting-response' && s.awaiting) return s.awaiting.seat;
    return s.currentSeat;
  });

  // Reactive helper for UI: is `id` in the current game's rule set?
  function hasRule(id: string): boolean {
    return activeRules.value.some((r) => r.id === id);
  }

  function viewFor(seat: number): SeatView | null {
    return state.value ? toSeatView(state.value, seat) : null;
  }

  function configFor(seat: number): PlayerConfig | undefined {
    return playerConfigs.value.find((p) => p.seatId === seat);
  }

  async function init(): Promise<void> {
    if (initialized.value) return;
    const snapshot = await loadCurrentGame();
    if (snapshot) {
      // Resume previous game using the rules it was started under, so a
      // settings change between hands doesn't change the rules of the
      // in-progress game.
      try {
        const resumed = rulesFromIds(snapshot.ruleIds);
        activeRules.value = resumed;
        state.value = snapshot.state;
        actionLog.value = [...snapshot.actionLog];
        seed.value = snapshot.seed;
        startedAt.value = snapshot.startedAt;
        initialized.value = true;
        return;
      } catch (err) {
        // Snapshot referenced unknown rule ids (probably a version drift).
        // Fall through to a fresh game.
        console.warn('[game-store] cannot resume — discarding snapshot:', err);
        await clearCurrentGame();
      }
    }
    await newGame();
    initialized.value = true;
  }

  async function newGame(explicitSeed?: number): Promise<void> {
    await clearCurrentGame();
    activeRules.value = rulesFromSettings(settings.value.enabledRuleIds);
    const newSeed = explicitSeed ?? Date.now();
    const fresh = createInitialState({
      seats: 2,
      rules: activeRules.value,
      seed: newSeed,
    });
    state.value = fresh;
    actionLog.value = [];
    seed.value = newSeed;
    startedAt.value = new Date().toISOString();
    playerConfigs.value = defaultPlayerConfigs();
    await persistSnapshot();
  }

  async function dispatch(action: Action): Promise<void> {
    if (!state.value) throw new Error('store not initialized');
    const next = reduce(state.value, action, activeRules.value);
    state.value = next;
    actionLog.value = [...actionLog.value, action];
    await persistSnapshot();
    if (next.phase === 'ended') {
      await recordCompletedGame();
    }
  }

  async function persistSnapshot(): Promise<void> {
    if (!state.value) return;
    try {
      await saveCurrentGame({
        state: state.value,
        actionLog: actionLog.value,
        seed: seed.value,
        ruleIds: activeRules.value.map((r) => r.id),
        startedAt: startedAt.value,
      });
    } catch (err) {
      // Quota, private mode, IDB unavailable: log but don't reject dispatch.
      // Game continues in memory; user just won't get resume on reload.
      console.warn('[game-store] persist failed:', err);
    }
  }

  async function recordCompletedGame(): Promise<void> {
    if (!state.value) return;
    const engine = buildEngineDescriptor({
      engineVersion: __ENGINE_VERSION__,
      gitCommit: __GIT_COMMIT__,
      rules: activeRules.value,
    });
    const scores = computeScores(state.value, activeRules.value);
    const record = buildGameRecord({
      engine,
      seed: seed.value,
      playerConfigs: playerConfigs.value,
      actionLog: actionLog.value,
      finalScores: scores,
      winnerSeat: state.value.winnerSeat,
      startedAt: startedAt.value,
      endedAt: new Date().toISOString(),
      finalState: state.value,
    });
    try {
      await appendCompletedGame(record);
      await clearCurrentGame();
    } catch (err) {
      console.warn('[game-store] could not persist completed game:', err);
    }
  }

  return {
    state,
    actionLog,
    seed,
    startedAt,
    playerConfigs,
    activeRules,
    humanSeat,
    phase,
    awaiting,
    actingSeat,
    hasRule,
    viewFor,
    configFor,
    init,
    newGame,
    dispatch,
  };
});
