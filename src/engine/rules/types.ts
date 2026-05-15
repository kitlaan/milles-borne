// Rule plugin shape.
//
// A rule plugin is a *value*: a frozen object with optional hooks. The
// reducer is told the active rules each call (via the engine wrapper that
// pairs state with rule ids). Plugins are pure — no mutable internal
// state, no I/O — so resume just needs to look them up by id.
//
// Hook semantics:
//   - validate    : chained AND. action is legal iff every plugin returns
//                   'legal'. First reject wins (for error messages).
//   - apply       : first non-null wins. Each plugin returns a new state if
//                   it owns this action, or null to pass. Reducer throws
//                   if no plugin handles an action.
//   - onHazardApplied : after the reducer applies a hazard PLAY, plugins
//                   may insert an interrupt window. First non-null wins.
//   - onHandEnd   : on hand termination, plugins return score entries.
//                   All are aggregated.

import type { Action } from '../actions';
import type { Card } from '../cards';
import type { GameState } from '../state';

export type ValidationResult = 'legal' | { readonly reject: string };

export type InterruptIntent =
  | {
      readonly type: 'await-coup-fourre';
      readonly seat: number;
      readonly hazard: Card;
      readonly attacker: number;
    }
  | null;

export type ScoreEntry = {
  readonly seat: number;
  readonly points: number;
  readonly reason: string;
};

export type RulePlugin = {
  readonly id: string;
  readonly version: string;
  readonly hooks: {
    readonly validate?: (action: Action, state: GameState) => ValidationResult;
    readonly apply?: (action: Action, state: GameState) => GameState | null;
    readonly onHazardApplied?: (
      hazard: Card,
      victim: number,
      attacker: number,
      state: GameState,
    ) => InterruptIntent;
    readonly onHandEnd?: (state: GameState) => ReadonlyArray<ScoreEntry>;
  };
};
