# Mille Bornes

A browser-based implementation of the [Mille Bornes](https://en.wikipedia.org/wiki/Mille_Bornes) card game. Client-only — Vue 3 + Vite + TypeScript, hosted as static files. Save / resume, high scores, pluggable AI engines (hand-rolled MLP trained on Heuristic self-play; determinized Monte Carlo Tree Search), pluggable rule variants, themeable cards.

## Stack

- Vue 3 + Vite + TypeScript
- Pinia (UI state container)
- Vitest (tests)
- `pure-rand` (xoroshiro128+ for seeded RNG; engine is deterministic)
- `idb-keyval` (IndexedDB persistence for in-progress + completed games)
- `tsx` (run CLI scripts)
- Zero ML dependencies — the MLP variant is hand-rolled forward / backward pass

## Quick start

```sh
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Script                          | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                   | Vite dev server                                                |
| `npm run build`                 | Production build to `dist/`                                    |
| `npm run preview`               | Preview the production build                                   |
| `npm test`                      | Vitest run                                                     |
| `npm run test:watch`            | Vitest watch mode                                              |
| `npm run lint`                  | ESLint over `src/` + `scripts/`                                |
| `npm run typecheck`             | `tsc --noEmit`                                                 |
| `npm run cli:play`              | Headless AI-vs-AI game (writes a JSON GameRecord)              |
| `npm run cli:verify`            | Replay a GameRecord and check the final state matches          |
| `npm run generate-training-data`| Generate Heuristic-self-play JSONL into `training-data/`       |
| `npm run train`                 | Train the MLP AI; writes `weights.json` + `report.json`        |
| `npm run verify-weights`        | Drift check: re-generate + re-train, byte-compare weights      |

## Architecture

The project is engine-first: the rules engine in `src/engine/` is a pure-TS reducer (`(state, action) → state`), portable to Node, Workers, or future servers. All randomness is sourced from a serialized `RngState`, so games replay deterministically from `seed + actionLog`. ESLint guards in `src/engine/` forbid Vue/Pinia/Vite/storage imports and globals like `Math.random` or `Date.now`.

Layers, top to bottom:

```
  src/ui/                Vue + Pinia. UI is the only place that touches IDB.
  src/ai/                AI plugins. Each is an AIPlayerInfo: id, displayName,
                         version, async play(view, legal) → Action.
  src/engine/            Pure reducer + legal-action generator + rule plugins.
  src/persistence/       GameRecord codec + idb-keyval wrappers.
  src/cli/, scripts/     Node entry points (tsx).
```

For the full design + phasing, see [`plans/00-master-plan.md`](plans/00-master-plan.md). ADRs in `plans/NNN-*.md` capture decisions that evolved out of the master plan.

## Adding a theme

Themes live in `src/ui/themes/`. Two patterns are supported:

- **File-based** (`classic/`): drop one `<card-type>.svg` per card into `cards/`. `import.meta.glob` auto-collects. Best for designers — no code change to add new card art.
- **Programmatic** (`minimal/`): export a `Record<CardType, string>` of SVG strings. Best when card art is generated from a small palette + a layout function.

Each theme exports a `Theme` (see `src/ui/themes/types.ts`). Register it in `src/ui/themes/index.ts` and it appears in the Settings → Theme picker automatically.

## Adding a rule variant

Rule plugins live in `src/engine/rules/`. A `RulePlugin` exposes optional hooks: `validate`, `apply`, `onHazardApplied`, `onHandEnd`. See `core.ts` (the always-on baseline), `coup-fourre.ts` (interrupt mechanic), `standard-bonuses.ts` (hand-end bonuses), and `memory-mode.ts` (marker-only — UI reads it to hide the discard pile).

Add a new rule:

1. Implement the plugin in `src/engine/rules/<name>.ts`.
2. Register in `src/engine/rules/index.ts`. If the rule is opt-in, add its id to `OPTIONAL_RULE_IDS`.
3. Update `src/ui/composables/useSettings.ts::defaultEnabledRuleIds()` if you want it on by default.

Settings → Optional Rules picks up new entries automatically.

## Adding an AI

AI plugins live in `src/ai/`. Four exist today:

| AI         | id          | Approach                                                       |
| ---------- | ----------- | -------------------------------------------------------------- |
| Basic      | `basic`     | Priority list (safety → remedy → highest mile → hazard → discard) |
| Heuristic  | `heuristic` | Smarter: winning-move detection, mile timing, CF holding logic  |
| MLP        | `mlp`       | 53→64→64→41 MLP, trained via supervised imitation of Heuristic  |
| MCTS       | `mcts`      | Determinized Monte Carlo Tree Search; Heuristic as rollout policy, K samples × N rollouts per decision |

To add a new AI:

1. Implement an `AIPlayerInfo` (see `src/ai/types.ts`). The `play` function gets a `SeatView` (no opponent hand visibility) and a pre-computed `legal[]` from the engine.
2. Register in `src/ai/index.ts` (one line: add to `AI_LIBRARY`).
3. Settings → AI Opponent picks it up automatically. `GameRecord.engineDescriptor` stamps `id + version` per seat on completed games for replay provenance.

### ML pipeline (the MLP AI)

The MLP variant is a thin example of how an ML-trained AI plugs in. The training pipeline is reproducible end-to-end from committed inputs:

```
training-data/manifest.json   (committed — numGames, seedBase, ai, ruleIds)
        │
        │ npm run generate-training-data
        ▼
training-data/heuristic-selfplay.jsonl  (gitignored — Heuristic self-play replays)
        │
        │ npm run train
        ▼
src/ai/ml-mlp/weights.json    (committed — ~324 KB, ships with the bundle)
src/ai/ml-mlp/report.json     (committed — train loss curve + eval metrics)
```

To verify the committed weights still derive from the committed inputs + current code:

```sh
npm run verify-weights
```

This regenerates the training data + weights from scratch and byte-compares against the committed file. If it fails (engine, heuristic, feature encoder, or action vocab drifted), the script prints the exact `cp` commands to accept the new weights.

The MLP is intentionally hand-rolled (no TF.js / ONNX): the forward pass is ~50 LOC of matrix-multiply + ReLU, the training script's backprop + SGD-with-momentum is straightforward to read. If the model grows beyond a tiny MLP, a real ML library makes sense — until then, every line of the inference path is auditable.

### MCTS (the search AI)

Hand-rolled determinized Monte Carlo Tree Search. No training, no weights file — purely runtime search.

- `src/engine/sample.ts` — given a `SeatView`, samples a plausible full `GameState` (random partition of unseen cards into opponents' hidden hands + deck).
- `src/ai/mcts/search.ts` — UCB1 tree search; forced single-action chains (DRAW phases) are collapsed into the parent decision via `fastForward`, so iterations land on real choices.
- `src/ai/mcts/rollout.ts` — heuristic-vs-heuristic rollout to terminal as the leaf evaluator. The state's deck is reshuffled per rollout (the engine reducer doesn't consume `state.rng` during play, so without reshuffling all rollouts from a sampled leaf collapse to the same outcome).
- `src/ai/mcts/determinize.ts` — K independent trees, one per sampled determinization, with visit counts summed across them. Discarding a safety is strictly dominated, so those actions are pre-filtered before the search sees them.

Tuning knobs via `makeMctsAI({ K, N, ucbC, maxRolloutDepth, seed })`. Defaults (K=4, N=100) are calibrated for snappy browser play. Strength evaluation uses `scripts/eval-mcts.ts` (subprocess worker pool, scales to `availableParallelism() - 1`). Reference numbers from this branch:

| Config          | vs Heuristic, n=200 same-seed                  |
| --------------- | ---------------------------------------------- |
| K=8, N=200      | 86W / 47L / 67D — 64.7% of decided (≥ ADR 004 target of 60%) |

The 67 draws are hands where the deck empties before anyone hits 1000; engine scoring counts those as no-winner regardless of who is ahead.

## ADRs

- [ADR 001 — PlayerConfig as discriminated union](plans/001-player-config-discriminated-union.md)
- [ADR 002 — Drop `Card.value`; derive from type](plans/002-drop-card-value-field.md)
- [ADR 004 — RL experiments summary + retirement of hand-rolled ml-rl](plans/004-rl-experiments-summary.md)
- [Master plan](plans/00-master-plan.md) (immutable; ADRs supersede where they conflict)
