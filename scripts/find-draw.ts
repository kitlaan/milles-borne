// Find seeds where MCTS vs heuristic draws, and dump trace details.
//
// Usage:
//   npx tsx scripts/find-draw.ts <K> <N> <seed-start> <count>
//
// Plays each game sequentially in this process (no worker pool) so we
// can attach in-process diagnostics if needed. Stop on first draw and
// print per-step actions + late-game state for that game.

import { heuristicAI } from '@/ai/heuristic';
import { makeMctsAI } from '@/ai/mcts';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import type { GameState } from '@/engine/state';
import type { AIPlayerInfo } from '@/ai/types';

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

function distanceOf(state: GameState, seatId: number): number {
  const s = state.seats[seatId]!;
  return s.tableau.distance.reduce((sum, c) => {
    const v = c.type.startsWith('mile-') ? Number(c.type.slice(5)) : 0;
    return sum + v;
  }, 0);
}

async function playWithTrace(seed: number, mctsSeat: 0 | 1, K: number, N: number, trace: boolean) {
  const rules = defaultRules();
  const mcts = makeMctsAI({ K, N, seed });
  const perSeat: AIPlayerInfo[] = mctsSeat === 0 ? [mcts, heuristicAI] : [heuristicAI, mcts];
  let state = createInitialState({ seats: 2, rules, seed });
  const log: string[] = [];
  for (let i = 0; i < 800 && state.phase !== 'ended'; i++) {
    const seat = actingSeat(state);
    const ai = perSeat[seat]!;
    const view = toSeatView(state, seat);
    const legal = legalActions(state, seat, rules);
    if (legal.length === 0) break;
    const action = await ai.play(view, legal);
    if (trace && legal.length > 1) {
      const d0 = distanceOf(state, 0);
      const d1 = distanceOf(state, 1);
      const handSizes = state.seats.map((s) => s.hand.length).join('/');
      log.push(
        `step ${i} seat ${seat} (${ai.displayName}) phase=${state.phase} hand=${handSizes} deck=${state.deck.length} d0=${d0} d1=${d1} legal=${legal.length} chose=${JSON.stringify(action)}`,
      );
    }
    state = reduce(state, action, rules);
  }
  return { state, log };
}

async function main() {
  const [kStr, nStr, startStr, countStr] = process.argv.slice(2);
  const K = Number(kStr ?? '8');
  const N = Number(nStr ?? '200');
  const start = Number(startStr ?? '1');
  const count = Number(countStr ?? '30');

  let firstDrawSeed: number | null = null;
  let firstDrawMctsSeat: 0 | 1 = 0;
  const summary: Array<{ seed: number; mctsSeat: 0 | 1; outcome: string; turns: number; deck: number; d0: number; d1: number }> = [];
  for (let seed = start; seed < start + count; seed++) {
    for (const mctsSeat of [0, 1] as const) {
      const { state } = await playWithTrace(seed, mctsSeat, K, N, false);
      const outcome = state.phase !== 'ended'
        ? 'timeout'
        : state.winnerSeat === null
          ? 'draw'
          : state.winnerSeat === mctsSeat ? 'mcts' : 'opp';
      const row = {
        seed, mctsSeat, outcome,
        turns: state.turnNumber, deck: state.deck.length,
        d0: distanceOf(state, 0), d1: distanceOf(state, 1),
      };
      summary.push(row);
      console.log(`seed=${seed} mctsSeat=${mctsSeat} outcome=${outcome.padEnd(7)} turns=${row.turns} deck=${row.deck} d0=${row.d0} d1=${row.d1}`);
      if (outcome === 'draw' && firstDrawSeed === null) {
        firstDrawSeed = seed;
        firstDrawMctsSeat = mctsSeat;
      }
    }
  }
  const drawCount = summary.filter((r) => r.outcome === 'draw').length;
  const totalGames = summary.length;
  console.log(`\n${drawCount}/${totalGames} draws (${((drawCount / totalGames) * 100).toFixed(0)}%)`);
  console.log(`avg turns in draws: ${(summary.filter(r => r.outcome === 'draw').reduce((s, r) => s + r.turns, 0) / Math.max(drawCount, 1)).toFixed(0)}`);
  console.log(`avg turns in decided: ${(summary.filter(r => r.outcome === 'mcts' || r.outcome === 'opp').reduce((s, r) => s + r.turns, 0) / Math.max(totalGames - drawCount, 1)).toFixed(0)}`);

  if (firstDrawSeed !== null) {
    console.log(`\n=== TRACE: seed=${firstDrawSeed} mctsSeat=${firstDrawMctsSeat} ===`);
    const { log, state } = await playWithTrace(firstDrawSeed, firstDrawMctsSeat, K, N, true);
    for (const line of log) console.log(line);
    console.log(`\nfinal phase=${state.phase} winner=${state.winnerSeat} d0=${distanceOf(state, 0)} d1=${distanceOf(state, 1)} deck=${state.deck.length}`);
    // Last 15 actions visualization
    console.log(`\nfinal hands:`);
    for (const s of state.seats) {
      console.log(`  seat ${s.id}: ${s.hand.map(c => c.type).join(', ')}`);
      console.log(`    tableau battle: ${s.tableau.battle.map(c => c.type).join(', ') || '(empty)'}`);
      console.log(`    tableau speed:  ${s.tableau.speed.map(c => c.type).join(', ') || '(empty)'}`);
      console.log(`    safeties: ${s.tableau.safeties.map(e => e.card.type + (e.coupFourre ? ' CF' : '')).join(', ') || '(none)'}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
