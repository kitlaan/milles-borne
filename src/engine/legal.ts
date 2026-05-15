// Enumerate legal actions for a seat in the current state.
//
// Strategy: build candidate actions per phase, then filter via rule.validate
// hooks. This is convenient (rules own legality definitions) but is O(|hand|
// × |seats|) candidates per call. Fine for hands of ≤ 8 and small seat
// counts; if AI search ever needs faster legality, add per-action validate
// shortcuts.

import type { Action } from './actions';
import { HAZARD_TO_SAFETY, hazardOf, safetyOf } from './cards';
import type { GameState } from './state';
import type { RulePlugin } from './rules/types';

export function legalActions(
  state: GameState,
  seat: number,
  rules: ReadonlyArray<RulePlugin>,
): Action[] {
  if (state.phase === 'ended') return [];
  const candidates = candidateActions(state, seat);
  return candidates.filter((a) => isLegal(state, a, rules));
}

function isLegal(
  state: GameState,
  action: Action,
  rules: ReadonlyArray<RulePlugin>,
): boolean {
  for (const rule of rules) {
    const v = rule.hooks.validate?.(action, state);
    if (v && v !== 'legal') return false;
  }
  return true;
}

function candidateActions(state: GameState, seat: number): Action[] {
  if (state.phase === 'awaiting-response') {
    if (!state.awaiting || state.awaiting.seat !== seat) return [];
    return coupFourreCandidates(state, seat);
  }
  if (state.currentSeat !== seat) return [];

  if (state.phase === 'draw') {
    return [{ seat, type: 'DRAW' }];
  }
  // phase === 'action'
  return actionPhaseCandidates(state, seat);
}

function coupFourreCandidates(state: GameState, seat: number): Action[] {
  const awaiting = state.awaiting!;
  const s = state.seats[seat]!;
  const haz = hazardOf(awaiting.hazard.type);
  const out: Action[] = [];
  if (haz !== null) {
    const matchingSafety = HAZARD_TO_SAFETY[haz];
    for (const c of s.hand) {
      if (safetyOf(c.type) === matchingSafety) {
        out.push({ seat, type: 'COUP_FOURRE', safetyCardId: c.id });
      }
    }
  }
  out.push({ seat, type: 'PASS_COUP_FOURRE' });
  return out;
}

function actionPhaseCandidates(state: GameState, seat: number): Action[] {
  const s = state.seats[seat]!;
  const out: Action[] = [];
  for (const c of s.hand) {
    // discard always a candidate
    out.push({ seat, type: 'DISCARD', cardId: c.id });
    if (c.category === 'hazard') {
      for (const other of state.seats) {
        if (other.id !== seat) {
          out.push({ seat, type: 'PLAY', cardId: c.id, targetSeat: other.id });
        }
      }
    } else {
      out.push({ seat, type: 'PLAY', cardId: c.id });
    }
  }
  return out;
}
