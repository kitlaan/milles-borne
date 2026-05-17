// Reward / return helpers for any RL approach over the Mille Bornes
// engine. Framework-agnostic — pure TS, no dependency on a particular
// training stack. Previously lived under src/ai/ml-rl/ when the
// hand-rolled REINFORCE / PPO scripts shipped; kept here as a neutral
// home now that those scripts have been retired pending a richer
// feature representation / framework decision (see plans/004).
//
// Three pure helpers:
//   - shapeStepReward(action, view): per-step dense reward for the
//     action just taken (small mileage-progress signal, zero otherwise).
//   - terminalReward(seat, finalState): episode-end outcome (+1 / -1 / 0).
//   - computeReturns(stepRewards, terminal, gamma): backward discounted
//     accumulation. G_t = step_t + γ · G_{t+1}, with G_T = terminal.
//
// Reward shape rationale: sparse outcome (+1 / -1) is the long-term
// objective, but with ~80 decisions per game pure sparsity makes credit
// assignment slow. A small mileage-progress shaping term (mile value /
// target × coefficient) gives the model dense feedback during the game
// without dominating the outcome signal. The coefficient is chosen so
// that even an optimal 1000-km game accumulates ~0.1 in shaping, well
// below the ±1 outcome.

import type { Action } from '@/engine/actions';
import { mileValueOf } from '@/engine/cards';
import type { GameState } from '@/engine/state';
import type { SeatView } from '@/engine/view';

export const SHAPING_COEFF = 0.1;
export const DEFAULT_GAMMA = 0.99;

// Immediate reward for the action a seat just took, given the pre-action
// view. Only mile plays get a non-zero shaping signal; everything else
// is zero (terminal outcome carries those).
export function shapeStepReward(action: Action, view: SeatView): number {
  if (action.type !== 'PLAY') return 0;
  const card = view.self.hand.find((c) => c.id === action.cardId);
  if (!card || card.category !== 'mileage') return 0;
  const val = mileValueOf(card.type) ?? 0;
  return (val / 1000) * SHAPING_COEFF;
}

// Episode-end outcome reward. +1 win, -1 loss, 0 draw / unfinished. The
// engine sets winnerSeat === null for "all hands empty + deck empty"
// hand-ends, which we treat as a draw.
export function terminalReward(seat: number, finalState: GameState): number {
  if (finalState.phase !== 'ended') return 0;
  if (finalState.winnerSeat === null) return 0;
  return finalState.winnerSeat === seat ? 1 : -1;
}

// Discounted returns from a per-step reward sequence + a terminal reward
// received after the last step. Returns[t] is the return-from-time-t,
// suitable for use as the policy-gradient weight in REINFORCE.
export function computeReturns(
  stepRewards: ReadonlyArray<number>,
  terminal: number,
  gamma: number = DEFAULT_GAMMA,
): number[] {
  const T = stepRewards.length;
  const returns = new Array<number>(T);
  let G = terminal;
  for (let t = T - 1; t >= 0; t--) {
    G = stepRewards[t]! + gamma * G;
    returns[t] = G;
  }
  return returns;
}
