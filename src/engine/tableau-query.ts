// Pure read helpers over Tableau / Seat. Used by core rule for legality
// checks and by AI / UI to render derived status.
//
// Battle pile semantics:
//   - Empty: not rolling, needs Roll to start.
//   - Top = Roll: rolling.
//   - Top = hazard (Stop / Out of Gas / Flat Tire / Accident): blocked.
//   - Top = remedy other than Roll: hazard cleared but still needs Roll.
//
// Right of Way safety overrides battle status for Stop hazards and grants
// automatic rolling status. Its effect on attacks is handled at validate-time
// by `isImmuneToHazard`; once a hazard is on the pile and the seat later
// acquires the safety (or it was held prior), the safety counts.
//
// Speed pile is separate from battle pile and only tracks Speed Limit /
// End of Limit cards. Speed-limited status restricts mile plays to ≤ 75.

import type { Card, HazardType } from './cards';
import { SAFETY_HAZARDS, hazardOf, mileValueOf, safetyOf } from './cards';
import type { Seat } from './state';

export function topOf(stack: ReadonlyArray<Card>): Card | null {
  return stack.length > 0 ? stack[stack.length - 1]! : null;
}

export function hasSafety(seat: Seat, safety: ReturnType<typeof safetyOf>): boolean {
  if (safety === null) return false;
  return seat.tableau.safeties.some((s) => safetyOf(s.card.type) === safety);
}

export function isImmuneToHazard(seat: Seat, hazard: HazardType): boolean {
  for (const entry of seat.tableau.safeties) {
    const s = safetyOf(entry.card.type);
    if (s !== null && SAFETY_HAZARDS[s].includes(hazard)) return true;
  }
  return false;
}

// True if the seat can play a mile card right now (ignoring speed limit).
export function isRolling(seat: Seat): boolean {
  // Right of Way grants automatic rolling status — but only if no other
  // active hazard (Accident / Flat Tire / Out of Gas) is on the battle pile.
  const top = topOf(seat.tableau.battle);
  if (top === null) {
    return hasSafety(seat, 'right-of-way');
  }
  const haz = hazardOf(top.type);
  if (haz !== null) {
    // A hazard is on top. Right of Way only protects against 'stop' here;
    // other safeties protect against their respective hazards.
    return isImmuneToHazard(seat, haz);
  }
  // Top is a remedy. Only Roll resumes driving.
  if (top.type === 'remedy-roll') return true;
  return hasSafety(seat, 'right-of-way');
}

export function activeHazardOnBattle(seat: Seat): HazardType | null {
  const top = topOf(seat.tableau.battle);
  if (top === null) return null;
  const haz = hazardOf(top.type);
  if (haz === null) return null;
  if (isImmuneToHazard(seat, haz)) return null;
  return haz;
}

export function isSpeedLimited(seat: Seat): boolean {
  if (hasSafety(seat, 'right-of-way')) return false;
  const top = topOf(seat.tableau.speed);
  if (top === null) return false;
  return hazardOf(top.type) === 'speed-limit';
}

export function sumDistance(seat: Seat): number {
  let total = 0;
  for (const c of seat.tableau.distance) {
    total += mileValueOf(c.type) ?? 0;
  }
  return total;
}

export function count200(seat: Seat): number {
  let n = 0;
  for (const c of seat.tableau.distance) if (mileValueOf(c.type) === 200) n++;
  return n;
}

export function findInHand(seat: Seat, cardId: string): Card | null {
  return seat.hand.find((c) => c.id === cardId) ?? null;
}

export function replaceSeat(
  seats: ReadonlyArray<Seat>,
  id: number,
  next: Seat,
): ReadonlyArray<Seat> {
  return seats.map((s) => (s.id === id ? next : s));
}

export function speedLimitOnTop(seat: Seat): boolean {
  const top = topOf(seat.tableau.speed);
  return top !== null && hazardOf(top.type) === 'speed-limit';
}
