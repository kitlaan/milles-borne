// AI player plugin interface.
//
// Async on purpose: a sync AI returns a resolved Promise (zero overhead),
// while ML / Web Worker / network AIs naturally fit. The engine pre-computes
// the legal action set so AIs can't produce illegal moves by construction.

import type { Action } from '@/engine/actions';
import type { SeatView } from '@/engine/view';

export type AIPlayer = (
  view: SeatView,
  legal: ReadonlyArray<Action>,
) => Promise<Action>;

export type AIPlayerInfo = {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly play: AIPlayer;
};
