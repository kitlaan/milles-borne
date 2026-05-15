// GameRecord — one entry per completed game. Source of truth for ML data,
// high scores, and replay verification.
//
// Record id format: `${startedAt-iso}-${shortRandomFromState}`. Random suffix
// is derived from final state's rng (already deterministic) so the id is
// stable across replays — important so verification can refer back to the
// record by id.

import type { Action } from '@/engine/actions';
import type { EngineDescriptor } from '@/engine/descriptor';
import type { SeatScore } from '@/engine/score';
import type { GameState } from '@/engine/state';

export type SeatKind = 'human' | 'ai';

// AI metadata associated with an ai-controlled seat. Lives on its own so
// future fields (model hash, weights file ref, training timestamp) can be
// added without polluting the top-level PlayerConfig shape.
export type AIDescriptor = {
  readonly id: string;
  readonly version: string;
};

// Discriminated union via `kind`. TypeScript narrowing exposes `ai` only on
// the 'ai' branch, so invariants are enforced at the type level rather than
// by convention.
export type PlayerConfig =
  | {
      readonly seatId: number;
      readonly kind: 'human';
      readonly displayName: string;
    }
  | {
      readonly seatId: number;
      readonly kind: 'ai';
      readonly displayName: string;
      readonly ai: AIDescriptor;
    };

export type GameRecord = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly engine: EngineDescriptor;
  readonly seed: number;
  readonly playerConfigs: ReadonlyArray<PlayerConfig>;
  readonly actionLog: ReadonlyArray<Action>;
  readonly finalScores: ReadonlyArray<SeatScore>;
  readonly winnerSeat: number | null;
  readonly startedAt: string;
  readonly endedAt: string;
};

export type BuildRecordParams = {
  readonly engine: EngineDescriptor;
  readonly seed: number;
  readonly playerConfigs: ReadonlyArray<PlayerConfig>;
  readonly actionLog: ReadonlyArray<Action>;
  readonly finalScores: ReadonlyArray<SeatScore>;
  readonly winnerSeat: number | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly finalState: GameState;
};

export function buildGameRecord(params: BuildRecordParams): GameRecord {
  const id = buildRecordId(params);
  return {
    schemaVersion: 1,
    id,
    engine: params.engine,
    seed: params.seed,
    playerConfigs: params.playerConfigs,
    actionLog: params.actionLog,
    finalScores: params.finalScores,
    winnerSeat: params.winnerSeat,
    startedAt: params.startedAt,
    endedAt: params.endedAt,
  };
}

// Stable id: derived from startedAt + RNG's final stepCount so two replays
// of the same game produce the same id without relying on Math.random.
function buildRecordId(params: BuildRecordParams): string {
  const suffix = (params.finalState.rng.stepCount >>> 0).toString(16).padStart(6, '0');
  return `${params.startedAt.replace(/[:.]/g, '-')}-${suffix}`;
}
