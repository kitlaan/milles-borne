// Core Mille Bornes rule plugin.
//
// Handles: DRAW, PLAY, DISCARD. Validates legality per standard rules.
// Implements turn flow (draw → action → next seat) and hand-end detection
// when a seat reaches the km target or all hands empty after deck exhaustion.
//
// Scoring at hand-end (core only):
//   - Distance: 1 pt per km of mile cards played
//   - Per safety played: 100 pts (Coup-Fourré flag is ignored by core; the
//     +300 bonus is added by the coup-fourre rule plugin)
//
// Trip Completed, Safe Trip, Shut-Out, Delayed Action, Extension, and match
// play to 5000 are deferred to later rule plugins.

import type { Action } from '../actions';
import type { Card, HazardType, RemedyType } from '../cards';
import { categoryOf, hazardOf, mileValueOf, remedyOf, safetyOf } from '../cards';
import type { GameState, SafetyEntry, Seat, Tableau } from '../state';
import {
  activeHazardOnBattle,
  count200,
  findInHand,
  isImmuneToHazard,
  isRolling,
  isSpeedLimited,
  replaceSeat,
  speedLimitOnTop,
  sumDistance,
  topOf,
} from '../tableau-query';
import type { RulePlugin, ScoreEntry, ValidationResult } from './types';

// ---------- validate ----------

function validate(action: Action, state: GameState): ValidationResult {
  if (state.phase === 'ended') return { reject: 'hand already ended' };

  if (state.phase === 'awaiting-response') {
    // Core has no opinion on coup-fourré responses; coup-fourre rule validates.
    return 'legal';
  }

  if (action.seat !== state.currentSeat) {
    return { reject: `not seat ${action.seat}'s turn` };
  }

  if (state.phase === 'draw') {
    if (action.type !== 'DRAW') return { reject: 'must draw first' };
    return 'legal';
  }

  // phase === 'action'
  if (action.type === 'DRAW') return { reject: 'already drew this turn' };

  const seat = state.seats[action.seat];
  if (!seat) return { reject: 'seat out of range' };

  if (action.type === 'DISCARD') {
    if (!findInHand(seat, action.cardId)) return { reject: 'card not in hand' };
    return 'legal';
  }

  if (action.type === 'PLAY') {
    const card = findInHand(seat, action.cardId);
    if (!card) return { reject: 'card not in hand' };
    return validatePlay(card, action, state, seat);
  }

  // COUP_FOURRE / PASS_COUP_FOURRE outside awaiting-response phase
  return { reject: 'no interrupt active' };
}

function validatePlay(
  card: Card,
  action: Action & { type: 'PLAY' },
  state: GameState,
  seat: Seat,
): ValidationResult {
  switch (card.category) {
    case 'mileage':
      return validateMile(card, seat, state);
    case 'hazard':
      return validateHazard(card, action, state);
    case 'remedy':
      return validateRemedy(card, seat);
    case 'safety':
      // Safeties may be played at any time on own turn (Coup-Fourré is the
      // only off-turn safety play, handled by the coup-fourre rule).
      return 'legal';
  }
}

function validateMile(card: Card, seat: Seat, state: GameState): ValidationResult {
  const val = mileValueOf(card.type);
  if (val === null) return { reject: 'not a mile card' };
  if (!isRolling(seat)) return { reject: 'cannot drive: not rolling' };
  // Per standard rules, Speed Limit restricts the affected player to 25- and
  // 50-mile cards. 75/100/200 are all blocked.
  if (isSpeedLimited(seat) && val > 50) {
    return { reject: 'speed limit forbids cards over 50 miles' };
  }
  if (val === 200 && count200(seat) >= 2) {
    return { reject: 'at most two 200-mile cards per hand' };
  }
  if (sumDistance(seat) + val > state.target) {
    return { reject: `would exceed target ${state.target}` };
  }
  return 'legal';
}

function validateHazard(
  card: Card,
  action: Action & { type: 'PLAY' },
  state: GameState,
): ValidationResult {
  const haz = hazardOf(card.type);
  if (haz === null) return { reject: 'not a hazard' };
  if (action.targetSeat === undefined) return { reject: 'hazard requires targetSeat' };
  if (action.targetSeat === action.seat) return { reject: 'cannot target self' };
  const victim = state.seats[action.targetSeat];
  if (!victim) return { reject: 'targetSeat out of range' };
  if (isImmuneToHazard(victim, haz)) return { reject: 'target is immune' };

  if (haz === 'speed-limit') {
    if (speedLimitOnTop(victim)) return { reject: 'target already speed-limited' };
    return 'legal';
  }

  // Stop / Accident / Flat Tire / Out of Gas: target must be currently rolling.
  if (!isRolling(victim)) {
    return { reject: 'target not rolling' };
  }
  if (activeHazardOnBattle(victim) !== null) {
    return { reject: 'target already has an active hazard' };
  }
  return 'legal';
}

function validateRemedy(card: Card, seat: Seat): ValidationResult {
  const rem = remedyOf(card.type);
  if (rem === null) return { reject: 'not a remedy' };
  if (rem === 'end-of-limit') {
    return speedLimitOnTop(seat) ? 'legal' : { reject: 'no speed limit to end' };
  }
  if (rem === 'roll') {
    const top = topOf(seat.tableau.battle);
    if (top === null) return 'legal';
    if (top.type === 'hazard-stop' && !isImmuneToHazard(seat, 'stop')) return 'legal';
    if (categoryOf(top.type) === 'remedy' && top.type !== 'remedy-roll') return 'legal';
    return { reject: 'cannot play Roll now' };
  }
  // gasoline / spare-tire / repairs
  const haz = HAZARD_FOR_REMEDY[rem];
  if (!haz) return { reject: 'unknown remedy' };
  const top = topOf(seat.tableau.battle);
  if (!top || hazardOf(top.type) !== haz) return { reject: 'no matching hazard' };
  return 'legal';
}

const HAZARD_FOR_REMEDY: Readonly<Partial<Record<RemedyType, HazardType>>> = {
  gasoline: 'out-of-gas',
  'spare-tire': 'flat-tire',
  repairs: 'accident',
};

// ---------- apply ----------

function apply(action: Action, state: GameState): GameState | null {
  switch (action.type) {
    case 'DRAW':
      return applyDraw(action, state);
    case 'PLAY':
      return applyPlay(action, state);
    case 'DISCARD':
      return applyDiscard(action, state);
    default:
      return null; // COUP_FOURRE / PASS_COUP_FOURRE handled by other plugin
  }
}

function applyDraw(action: Action & { type: 'DRAW' }, state: GameState): GameState {
  const seat = state.seats[action.seat]!;
  // If deck empty, just advance to action phase without drawing.
  if (state.deck.length === 0) {
    return { ...state, phase: 'action' };
  }
  const [drawn, ...restDeck] = state.deck;
  const newSeats = replaceSeat(state.seats, action.seat, {
    ...seat,
    hand: [...seat.hand, drawn!],
  });
  return { ...state, seats: newSeats, deck: restDeck, phase: 'action' };
}

function applyDiscard(
  action: Action & { type: 'DISCARD' },
  state: GameState,
): GameState | null {
  const seat = state.seats[action.seat]!;
  const card = findInHand(seat, action.cardId);
  if (!card) return null;
  const newHand = seat.hand.filter((c) => c.id !== action.cardId);
  const newSeats = replaceSeat(state.seats, action.seat, { ...seat, hand: newHand });
  return endTurn({
    ...state,
    seats: newSeats,
    discard: [...state.discard, card],
  });
}

function applyPlay(action: Action & { type: 'PLAY' }, state: GameState): GameState | null {
  const seat = state.seats[action.seat]!;
  const card = findInHand(seat, action.cardId);
  if (!card) return null;
  const newHand = seat.hand.filter((c) => c.id !== action.cardId);

  switch (card.category) {
    case 'mileage':
      return endTurnAfterPlay(state, action.seat, newHand, (t) => ({
        ...t,
        distance: [...t.distance, card],
      }));
    case 'hazard': {
      const victim = action.targetSeat!;
      const v = state.seats[victim]!;
      const haz = hazardOf(card.type);
      // Speed-Limit goes on the *speed* pile; all other hazards on battle.
      // Reflects the actual game piles — End of Limit / Right of Way work
      // against the speed pile, while remedies/Roll work against battle.
      const newTableau = haz === 'speed-limit'
        ? { ...v.tableau, speed: [...v.tableau.speed, card] }
        : { ...v.tableau, battle: [...v.tableau.battle, card] };
      const newSeats0 = replaceSeat(state.seats, action.seat, { ...seat, hand: newHand });
      const newSeats = replaceSeat(newSeats0, victim, { ...v, tableau: newTableau });
      // Coup-Fourré detection is the coup-fourre rule's responsibility
      // (post-apply hook). Core just places the hazard and ends the turn.
      return endTurn({ ...state, seats: newSeats });
    }
    case 'remedy': {
      const tableauTransform =
        remedyOf(card.type) === 'end-of-limit'
          ? (t: Tableau) => ({ ...t, speed: [...t.speed, card] })
          : (t: Tableau) => ({ ...t, battle: [...t.battle, card] });
      return endTurnAfterPlay(state, action.seat, newHand, tableauTransform);
    }
    case 'safety':
      return endTurnAfterPlay(state, action.seat, newHand, (t) => ({
        ...t,
        safeties: [...t.safeties, { card, coupFourre: false }] as ReadonlyArray<SafetyEntry>,
      }));
  }
}

// Helper: update seat's hand + apply a tableau transform, then end the turn.
function endTurnAfterPlay(
  state: GameState,
  seatId: number,
  newHand: ReadonlyArray<Card>,
  tableauTransform: (t: Tableau) => Tableau,
): GameState {
  const seat = state.seats[seatId]!;
  const newSeats = replaceSeat(state.seats, seatId, {
    ...seat,
    hand: newHand,
    tableau: tableauTransform(seat.tableau),
  });
  return endTurn({ ...state, seats: newSeats });
}

function endTurn(state: GameState): GameState {
  // Check hand-end conditions first.
  const winner = findWinner(state);
  if (winner !== null) {
    return { ...state, phase: 'ended', winnerSeat: winner };
  }
  // All hands empty + deck empty → end with current scores.
  if (state.deck.length === 0 && state.seats.every((s) => s.hand.length === 0)) {
    return { ...state, phase: 'ended', winnerSeat: null };
  }
  const next = (state.currentSeat + 1) % state.seats.length;
  return {
    ...state,
    currentSeat: next,
    phase: 'draw',
    turnNumber: state.turnNumber + 1,
  };
}

function findWinner(state: GameState): number | null {
  for (const seat of state.seats) {
    if (sumDistance(seat) >= state.target) return seat.id;
  }
  return null;
}

// ---------- onHandEnd: distance + safety scoring ----------

function onHandEnd(state: GameState): ReadonlyArray<ScoreEntry> {
  const entries: ScoreEntry[] = [];
  for (const seat of state.seats) {
    const distance = sumDistance(seat);
    if (distance > 0) {
      entries.push({ seat: seat.id, points: distance, reason: 'distance' });
    }
    for (const entry of seat.tableau.safeties) {
      entries.push({ seat: seat.id, points: 100, reason: `safety: ${safetyOf(entry.card.type)}` });
    }
  }
  return entries;
}

// ---------- plugin export ----------

export const coreRule: RulePlugin = {
  id: 'core',
  version: '0.1.0',
  hooks: {
    validate,
    apply,
    onHandEnd,
  },
};
