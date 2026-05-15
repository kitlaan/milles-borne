// Engine reducer. Pure: (state, action, rules) → state.
//
// Pipeline:
//   1. Validate. Every rule's `validate` hook runs. Action is legal only if
//      all return 'legal'; first reject throws.
//   2. Apply. First rule whose `apply` returns non-null wins. If none
//      handle the action, throws.
//   3. Post-apply (hazard interrupts). When a PLAY of a hazard card resolves,
//      every rule's `onHazardApplied` runs; the first non-null intent
//      overrides phase to 'awaiting-response' and stores the awaiting
//      record. core has already advanced currentSeat to the next seat
//      (the victim in 2P); the awaiting record carries victim + attacker
//      so the interrupt logic is unambiguous in any seat count.
//
// Engine purity: no I/O, no clocks, no Math.random. All randomness flows
// through state.rng, advanced by reducers that consume it.

import type { Action } from './actions';
import type { Card } from './cards';
import type { GameState } from './state';
import type { InterruptIntent, RulePlugin } from './rules/types';

export class IllegalActionError extends Error {
  readonly action: Action;
  readonly reason: string;
  readonly ruleId: string;
  constructor(action: Action, ruleId: string, reason: string) {
    super(`Illegal ${action.type} (by ${ruleId}): ${reason}`);
    this.name = 'IllegalActionError';
    this.action = action;
    this.reason = reason;
    this.ruleId = ruleId;
  }
}

export class UnhandledActionError extends Error {
  readonly action: Action;
  constructor(action: Action) {
    super(`No rule plugin handled action: ${action.type}`);
    this.name = 'UnhandledActionError';
    this.action = action;
  }
}

export function reduce(
  state: GameState,
  action: Action,
  rules: ReadonlyArray<RulePlugin>,
): GameState {
  validateOrThrow(state, action, rules);
  const after = applyOrThrow(state, action, rules);
  return applyPostHooks(state, after, action, rules);
}

function validateOrThrow(
  state: GameState,
  action: Action,
  rules: ReadonlyArray<RulePlugin>,
): void {
  for (const rule of rules) {
    const v = rule.hooks.validate?.(action, state);
    if (v && v !== 'legal') {
      throw new IllegalActionError(action, rule.id, v.reject);
    }
  }
}

function applyOrThrow(
  state: GameState,
  action: Action,
  rules: ReadonlyArray<RulePlugin>,
): GameState {
  for (const rule of rules) {
    const r = rule.hooks.apply?.(action, state);
    if (r !== null && r !== undefined) return r;
  }
  throw new UnhandledActionError(action);
}

// After `apply` runs, if the action was a hazard PLAY, give every rule a
// chance to insert an interrupt window. We use the *pre-apply* state to
// look up the played card (it was in the attacker's hand before apply
// removed it).
function applyPostHooks(
  pre: GameState,
  post: GameState,
  action: Action,
  rules: ReadonlyArray<RulePlugin>,
): GameState {
  if (action.type !== 'PLAY') return post;
  if (action.targetSeat === undefined) return post;
  const playedCard = findCardInState(pre, action.seat, action.cardId);
  if (!playedCard || playedCard.category !== 'hazard') return post;
  return triggerHazardInterrupts(playedCard, action.targetSeat, action.seat, post, rules);
}

function triggerHazardInterrupts(
  hazard: Card,
  victim: number,
  attacker: number,
  state: GameState,
  rules: ReadonlyArray<RulePlugin>,
): GameState {
  for (const rule of rules) {
    const intent: InterruptIntent =
      rule.hooks.onHazardApplied?.(hazard, victim, attacker, state) ?? null;
    if (intent !== null) {
      return {
        ...state,
        phase: 'awaiting-response',
        awaiting: {
          seat: intent.seat,
          reason: 'coup-fourre-response',
          hazard: intent.hazard,
          attacker: intent.attacker,
        },
      };
    }
  }
  return state;
}

function findCardInState(state: GameState, seatId: number, cardId: string): Card | null {
  const seat = state.seats[seatId];
  if (!seat) return null;
  return seat.hand.find((c) => c.id === cardId) ?? null;
}
