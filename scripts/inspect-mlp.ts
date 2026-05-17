// Throwaway diagnostic: characterize how the MLP AI disagrees with the
// Heuristic teacher across realistic game trajectories. We drive the
// game with the MLP (so the state distribution matches inference time),
// and at every decision point with > 1 legal action we ask Heuristic
// what it would pick in the same state. Disagreements get bucketed by
// phase, category (own action category), and category-mismatch
// (mlp_cat → heur_cat).
//
// Run: tsx scripts/inspect-mlp.ts [seedBase] [count]

import { heuristicAI, mlpAI } from '@/ai';
import type { Action } from '@/engine/actions';
import { categoryOf } from '@/engine/cards';
import { legalActions } from '@/engine/legal';
import { reduce } from '@/engine/reducer';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import type { GameState } from '@/engine/state';
import { activeHazardOnBattle, sumDistance } from '@/engine/tableau-query';
import { toSeatView } from '@/engine/view';

type DecisionRecord = {
  phase: GameState['phase'];
  mlpType: Action['type'];
  heurType: Action['type'];
  mlpCategory: string;
  heurCategory: string;
  ownDistance: number;
  oppDistance: number;
  activeHazard: string;
  handSize: number;
  deckSize: number;
};

function actingSeat(state: GameState): number {
  if (state.phase === 'awaiting-response' && state.awaiting) return state.awaiting.seat;
  return state.currentSeat;
}

function actionCategory(action: Action, hand: ReadonlyArray<{ id: string; type: string }>): string {
  switch (action.type) {
    case 'DRAW':
      return 'draw';
    case 'PASS_COUP_FOURRE':
      return 'pass-cf';
    case 'COUP_FOURRE':
      return 'coup-fourre';
    case 'PLAY': {
      const c = hand.find((h) => h.id === action.cardId);
      if (!c) return 'play-?';
      return `play-${categoryOf(c.type as never)}`;
    }
    case 'DISCARD': {
      const c = hand.find((h) => h.id === action.cardId);
      if (!c) return 'discard-?';
      return `discard-${categoryOf(c.type as never)}`;
    }
  }
}

async function main(): Promise<void> {
  const seedBase = Number(process.argv[2] ?? '50000000');
  const count = Number(process.argv[3] ?? '100');
  const rules = defaultRules();

  const records: DecisionRecord[] = [];
  let totalDecisions = 0;
  let disagreements = 0;
  let mlpWins = 0;
  let heurWins = 0;
  let draws = 0;

  for (let i = 0; i < count; i++) {
    let state = createInitialState({ seats: 2, rules, seed: seedBase + i });
    let steps = 0;
    while (state.phase !== 'ended' && steps < 800) {
      const seat = actingSeat(state);
      const legal = legalActions(state, seat, rules);
      if (legal.length === 0) break;
      const view = toSeatView(state, seat);

      if (legal.length > 1 && seat === 0) {
        // Sample disagreement only for the MLP seat. MLP drives the
        // trajectory; that's the state distribution we care about.
        const mlpPick = await mlpAI.play(view, legal);
        const heurPick = await heuristicAI.play(view, legal);
        totalDecisions++;
        if (mlpPick.type !== heurPick.type || JSON.stringify(mlpPick) !== JSON.stringify(heurPick)) {
          disagreements++;
          records.push({
            phase: state.phase,
            mlpType: mlpPick.type,
            heurType: heurPick.type,
            mlpCategory: actionCategory(mlpPick, view.self.hand),
            heurCategory: actionCategory(heurPick, view.self.hand),
            ownDistance: sumDistance(view.self),
            oppDistance: sumDistance({
              id: view.others[0]!.id,
              hand: [],
              tableau: view.others[0]!.tableau,
            }),
            activeHazard: activeHazardOnBattle(view.self) ?? 'none',
            handSize: view.self.hand.length,
            deckSize: view.deckSize,
          });
        }
        state = reduce(state, mlpPick, rules);
      } else {
        // Other seat plays Heuristic.
        const action = seat === 0
          ? await mlpAI.play(view, legal)
          : await heuristicAI.play(view, legal);
        state = reduce(state, action, rules);
      }
      steps++;
    }
    if (state.phase === 'ended') {
      if (state.winnerSeat === 0) mlpWins++;
      else if (state.winnerSeat === 1) heurWins++;
      else draws++;
    }
  }

  console.log(`\n=== Game outcomes over ${count} seeds (MLP=seat 0, Heuristic=seat 1) ===`);
  console.log(`  MLP wins: ${mlpWins}  Heuristic wins: ${heurWins}  draws: ${draws}`);
  console.log(`  Total MLP decisions: ${totalDecisions}, disagreements: ${disagreements} (${((disagreements / totalDecisions) * 100).toFixed(1)}%)`);

  console.log(`\n=== Disagreement breakdown by category-mismatch ===`);
  const mismatchCounts = new Map<string, number>();
  for (const r of records) {
    const key = `${r.mlpCategory} (mlp) vs ${r.heurCategory} (heur)`;
    mismatchCounts.set(key, (mismatchCounts.get(key) ?? 0) + 1);
  }
  const sorted = [...mismatchCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, n] of sorted.slice(0, 20)) {
    console.log(`  ${n.toString().padStart(5)}  ${key}`);
  }

  console.log(`\n=== Top 5 disagreements by MLP category ===`);
  const mlpCats = new Map<string, number>();
  for (const r of records) mlpCats.set(r.mlpCategory, (mlpCats.get(r.mlpCategory) ?? 0) + 1);
  for (const [k, v] of [...mlpCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${v.toString().padStart(5)}  MLP picked ${k}`);
  }

  console.log(`\n=== Top 5 disagreements by Heuristic preferred category ===`);
  const heurCats = new Map<string, number>();
  for (const r of records) heurCats.set(r.heurCategory, (heurCats.get(r.heurCategory) ?? 0) + 1);
  for (const [k, v] of [...heurCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${v.toString().padStart(5)}  Heur preferred ${k}`);
  }

  console.log(`\n=== Disagreement rate by phase ===`);
  const byPhase = new Map<string, number>();
  for (const r of records) byPhase.set(r.phase, (byPhase.get(r.phase) ?? 0) + 1);
  for (const [k, v] of [...byPhase.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(5)}  phase=${k}`);
  }

  // Sample some specific records to eyeball.
  console.log(`\n=== Sample 10 disagreements (random) ===`);
  for (let i = 0; i < Math.min(10, records.length); i++) {
    const idx = Math.floor((i / 10) * records.length);
    const r = records[idx]!;
    console.log(
      `  seed-rel ${idx}: ${r.mlpCategory} vs ${r.heurCategory} | phase=${r.phase} ownDist=${r.ownDistance} oppDist=${r.oppDistance} hazard=${r.activeHazard} hand=${r.handSize} deck=${r.deckSize}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
