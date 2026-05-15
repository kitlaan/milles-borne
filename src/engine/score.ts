// Aggregate score entries from all rule plugins' onHandEnd hooks.
//
// Returns one record per seat with a per-seat total and the full breakdown.
// Safe to call mid-hand (returns partial scoring with whatever hooks
// produce on the current state); typically called once when phase = 'ended'.

import type { GameState } from './state';
import type { RulePlugin, ScoreEntry } from './rules/types';

export type SeatScore = {
  readonly seat: number;
  readonly total: number;
  readonly breakdown: ReadonlyArray<ScoreEntry>;
};

export function computeScores(
  state: GameState,
  rules: ReadonlyArray<RulePlugin>,
): SeatScore[] {
  const entries: ScoreEntry[] = [];
  for (const rule of rules) {
    const e = rule.hooks.onHandEnd?.(state) ?? [];
    entries.push(...e);
  }
  const grouped = new Map<number, ScoreEntry[]>();
  for (const s of state.seats) grouped.set(s.id, []);
  for (const e of entries) {
    grouped.get(e.seat)?.push(e);
  }
  const out: SeatScore[] = [];
  for (const [seat, breakdown] of grouped) {
    out.push({
      seat,
      total: breakdown.reduce((sum, x) => sum + x.points, 0),
      breakdown,
    });
  }
  out.sort((a, b) => a.seat - b.seat);
  return out;
}
