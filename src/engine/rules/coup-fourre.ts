// Coup-Fourré rule plugin.
//
// Flow:
//   1. Attacker PLAYs a hazard. core.apply places the hazard on victim's
//      battle pile and advances to the next seat's draw phase.
//   2. Reducer iterates onHazardApplied hooks. This rule checks whether the
//      victim holds the matching safety in their hand and, if so, returns
//      an `await-coup-fourre` intent.
//   3. Reducer reacts to the intent by setting phase='awaiting-response'
//      and storing the awaiting record.
//   4. Victim's legal actions reduce to COUP_FOURRE (with their safety) or
//      PASS_COUP_FOURRE.
//   5. COUP_FOURRE: pop hazard to discard, move safety from hand to safeties
//      with the coupFourre flag, draw a replacement card if deck nonempty,
//      set phase='draw', currentSeat=victim, awaiting=null. Victim takes the
//      next turn normally.
//   6. PASS_COUP_FOURRE: leave hazard in place; phase='draw' for the seat
//      whose turn is next (already set to victim by core's end-of-turn).
//
// Scoring: +300 per Coup-Fourré at hand-end (one per safety entry where
// coupFourre === true).

import type { Action } from '../actions';
import type { Card } from '../cards';
import { HAZARD_TO_SAFETY, SAFETY_HAZARDS, hazardOf, safetyOf } from '../cards';
import type { GameState, SafetyEntry } from '../state';
import { findInHand, replaceSeat } from '../tableau-query';
import type { InterruptIntent, RulePlugin, ScoreEntry, ValidationResult } from './types';

function validate(action: Action, state: GameState): ValidationResult {
  if (action.type === 'COUP_FOURRE') return validateCoupFourre(action, state);
  if (action.type === 'PASS_COUP_FOURRE') return validatePass(action, state);
  return 'legal';
}

function validateCoupFourre(
  action: Action & { type: 'COUP_FOURRE' },
  state: GameState,
): ValidationResult {
  if (state.phase !== 'awaiting-response' || !state.awaiting) {
    return { reject: 'no interrupt active' };
  }
  if (action.seat !== state.awaiting.seat) return { reject: 'not your interrupt' };
  const seat = state.seats[action.seat];
  if (!seat) return { reject: 'seat out of range' };
  const safety = findInHand(seat, action.safetyCardId);
  if (!safety) return { reject: 'safety not in hand' };
  const safetyType = safetyOf(safety.type);
  if (safetyType === null) return { reject: 'not a safety card' };
  const hazType = hazardOf(state.awaiting.hazard.type);
  if (hazType === null) return { reject: 'awaiting hazard malformed' };
  if (!SAFETY_HAZARDS[safetyType].includes(hazType)) {
    return { reject: 'safety does not match hazard' };
  }
  return 'legal';
}

function validatePass(
  action: Action & { type: 'PASS_COUP_FOURRE' },
  state: GameState,
): ValidationResult {
  if (state.phase !== 'awaiting-response' || !state.awaiting) {
    return { reject: 'no interrupt active' };
  }
  if (action.seat !== state.awaiting.seat) return { reject: 'not your interrupt' };
  return 'legal';
}

function apply(action: Action, state: GameState): GameState | null {
  if (action.type === 'COUP_FOURRE') return applyCoupFourre(action, state);
  if (action.type === 'PASS_COUP_FOURRE') return applyPass(action, state);
  return null;
}

function applyCoupFourre(
  action: Action & { type: 'COUP_FOURRE' },
  state: GameState,
): GameState {
  const awaiting = state.awaiting!;
  const seat = state.seats[action.seat]!;
  const safetyCard = findInHand(seat, action.safetyCardId)!;

  // Pop the cancelled hazard from wherever core.apply placed it. Per
  // core's hazard-placement logic, speed-limit hazards land on the
  // speed pile; every other hazard lands on the battle pile. Popping
  // the wrong pile loses an unrelated card AND leaves the hazard
  // duplicated (it would persist on its real pile while also being
  // pushed to discard below).
  const hazType = hazardOf(awaiting.hazard.type);
  let newBattle = seat.tableau.battle;
  let newSpeed = seat.tableau.speed;
  if (hazType === 'speed-limit') {
    newSpeed = seat.tableau.speed.slice(0, -1);
  } else {
    newBattle = seat.tableau.battle.slice(0, -1);
  }
  // Bank the safety with Coup-Fourré flag.
  const newSafeties: ReadonlyArray<SafetyEntry> = [
    ...seat.tableau.safeties,
    { card: safetyCard, coupFourre: true },
  ];
  // Remove safety from hand.
  let newHand: Card[] = seat.hand.filter((c) => c.id !== safetyCard.id);
  // Draw a replacement card if deck nonempty.
  let newDeck: ReadonlyArray<Card> = state.deck;
  if (newDeck.length > 0) {
    const [drawn, ...rest] = newDeck;
    newHand = [...newHand, drawn!];
    newDeck = rest;
  }
  const newDiscard: ReadonlyArray<Card> = [...state.discard, awaiting.hazard];
  const newSeats = replaceSeat(state.seats, action.seat, {
    ...seat,
    hand: newHand,
    tableau: {
      ...seat.tableau,
      battle: newBattle,
      speed: newSpeed,
      safeties: newSafeties,
    },
  });

  return {
    ...state,
    seats: newSeats,
    deck: newDeck,
    discard: newDiscard,
    phase: 'draw',
    currentSeat: action.seat,
    awaiting: null,
  };
}

function applyPass(_action: Action & { type: 'PASS_COUP_FOURRE' }, state: GameState): GameState {
  // currentSeat was already advanced to the victim by core.endTurn when the
  // hazard was placed; we simply clear the interrupt and let normal flow
  // proceed.
  return { ...state, phase: 'draw', awaiting: null };
}

function onHazardApplied(
  hazard: Card,
  victim: number,
  attacker: number,
  state: GameState,
): InterruptIntent {
  const v = state.seats[victim];
  if (!v) return null;
  const hazType = hazardOf(hazard.type);
  if (hazType === null) return null;
  const matchingSafety = HAZARD_TO_SAFETY[hazType];
  const holdsSafety = v.hand.some((c) => safetyOf(c.type) === matchingSafety);
  if (!holdsSafety) return null;
  return { type: 'await-coup-fourre', seat: victim, hazard, attacker };
}

function onHandEnd(state: GameState): ReadonlyArray<ScoreEntry> {
  const entries: ScoreEntry[] = [];
  for (const seat of state.seats) {
    for (const entry of seat.tableau.safeties) {
      if (entry.coupFourre) {
        entries.push({ seat: seat.id, points: 300, reason: 'coup-fourre' });
      }
    }
  }
  return entries;
}

export const coupFourreRule: RulePlugin = {
  id: 'coup-fourre',
  version: '0.1.0',
  hooks: {
    validate,
    apply,
    onHazardApplied,
    onHandEnd,
  },
};
