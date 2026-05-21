# ADR 005 — Phase 10: search-based AI + distilled MLP (mctsAI + mlp-v3)

**Status:** accepted
**Date:** 2026-05-21
**Supersedes:** none

## Context

ADR 004 retired the hand-rolled ml-rl experiments after four flavors
of policy-gradient training (REINFORCE, REINFORCE + entropy, PPO-clip,
PPO + value head + GAE) all plateaued at the supervised `mlp-v2`
baseline (47% vs Heuristic). The ADR pointed at two unexplored
attacks: a richer feature encoder, or a paradigm that doesn't depend
on the teacher (real RL, MCTS planning, etc.).

Phase 10 took the search path first. The plan: build a hand-coded MCTS
AI strong enough to be a useful teacher, then distill it into a small
MLP that recovers MCTS strength at MLP inference cost. After that,
explore extensions (MCTS-with-MLP-rollouts, richer features) to see if
the new ceiling could be pushed further.

The first two phases worked. The follow-up explorations did not — both
hit ceilings explained by the new evidence rather than re-discovered
through failure.

## Experiment scoreboard

Win rate vs Heuristic, 200-game same-seed evals with seat swap,
"of decided" (wins + losses, excludes draws):

| approach                                       | win rate | n   | notes |
|------------------------------------------------|----------|-----|-------|
| `mlp-v2` (supervised, Heuristic teacher)       | **47%**  | 200 | ADR 004 baseline, unchanged |
| `mctsAI` (K=8 N=200, Heuristic rollouts)       | **64.7%** | 200 | Phase 10.A; first AI strictly stronger than `mlp-v2` |
| `mlp-v3` (supervised, MCTS teacher)            | **75.8%** | 200 | Phase 10.B; student beats teacher |
| `mcts-mlp` (MCTS with mlp-v3 rollouts, K=8 N=200) | 66.2% | 100 | Phase 10.C; barely above vanilla mctsAI |
| `mlp-v4` (supervised, features-v2 encoder)     | 76.9%    | 200 | Phase 10.D; identical to v3 within noise |

Head-to-heads worth noting:

| matchup                          | W   | L  | D  | of decided |
|----------------------------------|-----|----|----|-----------|
| `mlp-v3` vs `mlp-v2`             | 123 | 39 | 38 | 75.9%      |
| `mlp-v3` vs `mctsAI(K=8,N=200)`  | 94  | 47 | 59 | 66.7%      |
| `mcts-mlp:8:200` vs `mcts:8:200` | 40  | 27 | 33 | 59.7%      |
| `mlp-v4` vs `mlp-v3`             | 72  | 75 | 53 | 49.0%      |

## What we learned (transferable knowledge)

### 1. Determinized MCTS is a strong baseline for hidden-info card games

`mctsAI` is hand-coded determinized MCTS with K=8 samples × N=200
rollouts per decision, Heuristic-vs-Heuristic rollouts to terminal,
UCB1 selection with c = √2. 64.7% vs Heuristic over 200 games clears
the 60% bar ADR 004 set without any neural network or feature
engineering — just standard ISMCTS with a competent rollout policy.

The non-obvious bits were:

- **Per-rollout deck reshuffle.** The engine's reducer never consumes
  `state.rng` during play (rng advances only at setup), so a
  determinized leaf state is fully deterministic. Without reshuffling
  the deck before each rollout, every rollout from a given root child
  collapses to the same outcome and MCTS sees no signal across
  candidate actions. With reshuffle, each rollout draws a fresh
  shuffled future.
- **`fastForward` past single-action chains.** Mille Bornes
  interleaves a forced DRAW between every real decision, so without
  collapsing them roughly half of MCTS iterations get spent on
  forced-single-child UCB selection and rollout startup. Collapsing
  forced moves into the parent's child made the effective iteration
  budget land on real choices.
- **Pre-filter strictly-dominated discards.** Discarding a safety is
  never the right play (+100 inherent, +300 possible CF, permanent
  hazard immunity, irreplaceable), but with heuristic rollouts that
  rarely materialize a safety's value at small budgets MCTS would
  occasionally pick it. Stripping `DISCARD <safety>` from the legal
  set before search eliminated the pathology without measurable cost.

### 2. Distilling a stronger teacher works; the student can exceed the teacher

`mlp-v3` is the same 53→64→64→41 MLP as `mlp-v2`, same masked-CE
training pipeline, same architecture — only the labels changed
(MCTS-vs-MCTS self-play at K=8 N=200 instead of Heuristic
self-play). 75.8% vs Heuristic over 200 games is +29 percentage
points over `mlp-v2`'s 47%, the largest single-step gain of the
project.

The student outperforms its own teacher (mlp-v3 66.7% vs mctsAI 200g).
The most plausible explanation: MCTS at this budget is noisy — per-
game determinizations sometimes happen to favor a wrong action; the
MLP averages over the systematic part of MCTS's policy without
inheriting per-determinization variance.

### 3. Vanilla MCTS + strong policy ≠ stronger AI

The natural follow-up — `mctsAI` with `mlp-v3` as the rollout policy
instead of Heuristic — was supposed to produce a stronger teacher for
a v4 distill. It didn't:

- 66.2% vs Heuristic (vanilla mctsAI was 64.7%)
- 59.7% vs vanilla mctsAI (modest)
- and most tellingly, `mlp-v3` _alone_ is at 75.8%, so adding MCTS on
  top of a strong policy **lowers** play strength.

UCB without a prior treats every action as a fair exploration target.
With a strong base policy that's already confident, UCB pulls visits
away from the confident-best action onto less-confident alternatives;
the additional rollouts don't compensate. AlphaZero solves this with
PUCT (policy-prior-weighted exploration term); vanilla MCTS does not.

If we want a stronger teacher than `mctsAI(heuristic-rollouts)`, the
move is PUCT, not "swap in a stronger rollout policy."

### 4. Explicit features that v1 implicitly encodes don't help

`mlp-v4` is the same architecture as v3 but with 10 extra input dims:
explicit mileage delta, per-category deck composition, per-hazard
opponent vulnerability flags. Trained on the identical 10k MCTS
dataset.

Result: 76.9% vs Heuristic (within noise of v3's 75.8%) and 49% in
head-to-head vs v3. Training loss and held-out agreement matched v3
to four decimal places — the network converged on the same function.

The signals weren't actually new: a 64-wide hidden layer can compute
"selfDistance - oppDistance" or "opp lacks the matching safety" from
v1's existing dims as soon as the gradient pushes it that way. ADR
004 listed these features as the recommended next attack on the
assumption capacity wasn't the bottleneck; that turned out to be only
partly right. Capacity isn't the bottleneck for these specific
derived features; whether it's the bottleneck for some other set of
features remains untested.

Features genuinely worth adding to a v5 are ones that aren't
derivable from the current view at all — recent-action history is the
canonical example (requires extending `SeatView` with a ring buffer
the engine populates).

### 5. RNG hot-path matters more than algorithmic sophistication

`shuffle` in `src/engine/rng.ts` was originally O(stepCount) per call
(generator rebuilt from seed + fast-forwarded each invocation). At
the scale of MCTS rollouts — thousands of shuffles per decision —
this turned a search that should cost ~600 ms into one that cost ~17
seconds. Two layered fixes:

- Materialize the generator once per shuffle and use `unsafeNext` per
  swap (49–72× speedup, immutable API preserved).
- `FastRng` class — stateful wrapper that lazy-inits once per rollout
  factory and advances in place. Bit-identical sequence to threading
  immutable `RngState` forward. Cuts another ~6× for the case
  rollouts hit (K×N shuffles in a tight loop sharing one rng stream).

End-to-end: K=8 N=200 went from 17,000 ms/decision to 641 ms — a
26× wall-time improvement before changing a single line of the search
algorithm. Without it, the Phase 10.B data generation would have
taken weeks instead of 11 hours, and the eval iteration loop wouldn't
have been workable.

### 6. Single-channel evals are too noisy for hyperparameter decisions

100-game same-seed evals have a ~±10pp binomial CI at p≈0.65 — too
loose to distinguish 70% from 75%. Hyperparameter sweeps (K, N,
shape, model size) need n ≥ 200 to make claims worth committing to.
Several early "shape × scale doesn't help" calls in Phase A had to be
retested at the bigger sample before the conclusion was robust.

### 7. Engine bugs surface from new search patterns

The Phase 10.A.2 sampler's card-conservation check (every sampled
state must contain exactly the 106-card deck partition) caught a
pre-existing engine bug in `applyCoupFourre`: it always popped the
victim's battle pile, but speed-limit hazards land on the speed pile.
A Right-of-Way CF against speed-limit left the hazard duplicated
(both in speed pile and in discard) and silently dropped a card off
battle. Reproduces under Heuristic-vs-Basic, seed 7, step 52 — was
just latent until the sampler's invariants ran on every MCTS
decision. Same pattern as the Phase 8.2 deadlock fix.

### 8. Worker-pool eval changes how fast you can iterate

`scripts/eval-mcts.ts` and `scripts/eval-head-to-head.ts` use a
subprocess pool sized to `availableParallelism() - 1`. On the 32-core
dev box, that's a 20–30× throughput multiplier vs serial. The
combination of pool + FastRng turned a 70-hour eval (K=8 N=200 over
200 games, serial, pre-fix) into ~46 minutes. Without that, the
Phase B headline number couldn't have been pinned down.

## What's shipped

On `main` as of this ADR (`c523440` "Switch default to MLP-v3"):

| component                                  | what it does                                |
|--------------------------------------------|---------------------------------------------|
| `src/ai/mcts/` (Phase 10.A)                | mctsAI plugin: determinized MCTS, UCB1, K-tree aggregation, Heuristic rollouts, fastForward, discard-safety pre-filter. Default registered budget K=4 N=100 for snappy browser play. |
| `src/ai/ml-mlp/weights-v3.json`            | The model the `mlp` plugin loads. v2 weights kept on disk for reproducibility. v3 is the registered DEFAULT_AI_ID. |
| `scripts/generate-mcts-data.ts` + worker   | Parallel MCTS self-play data generator. Used to produce the 10k-game v3 training set. |
| `scripts/eval-mcts.ts` + worker            | Parallel MCTS-vs-opponent eval. Used for all Phase 10.A reports. |
| `scripts/eval-head-to-head.ts` + worker    | Generic AI-vs-AI eval pool accepting any two specs (`basic | heuristic | mlp | mlp-v2 | mcts:K:N | mcts-mlp:K:N`). Used for Phase 10.B / C / D head-to-heads. |
| `src/engine/rng.ts` `FastRng` + cached shuffle | The two RNG performance fixes. |
| `src/engine/sample.ts`                     | `sampleFullState(view, rng)` — determinization sampler. |
| `src/engine/view.ts` `SeatView.discard`    | Full discard pile, needed by the sampler. |
| `src/engine/rules/coup-fourre.ts`          | Speed-limit-pile fix. |

Also on `main`, from the in-progress phase-10-features-v2 branch when
this ADR lands:

- `src/ai/mcts/rollout-mlp.ts` — `makeMlpRollout(weights, opts)` (kept
  as infrastructure for a future PUCT attempt).
- `src/ai/ml-mlp/features-v2.ts` — 63-dim encoder + tests.
- `src/ai/ml-mlp/forward.ts` — `MlpWeights.featuresVersion?: 1|2`
  optional field; default v1.
- `scripts/train.ts` — `--features-version 1|2` flag.

## What's NOT shipped

- `mlp-v4` weights (features-v2-trained). The model is no better than
  v3 at this budget; shipping it would be a regression with extra
  bytes. The training pipeline is in place; future v5/v6 use it
  directly.
- An AlphaZero-lite implementation. Vanilla MCTS + MLP rollout is the
  Phase 10.C dead end; PUCT is the natural next try but a much bigger
  surface area than this ADR is documenting.

## Decision

Phase 10 closes here. `mlp-v3` is the strongest available AI and the
registered default. `mctsAI` ships alongside it for users who want a
search-based opponent. The infrastructure landed during the C/D
explorations (MLP rollout policy + features-v2 encoder + featuresVersion
plumbing) stays in tree as scaffolding for the next iteration.

## Consequences

- The picker now defaults to MLP (v3); Heuristic and MCTS remain
  selectable.
- The README's MLP pipeline section documents v2 ↔ v3 side-by-side and
  the Phase 10.B win-rate table.
- `verify-weights` stays a v2 ↔ Heuristic-self-play drift check; v3's
  reproduction is the MCTS data-gen plus the train script, not an
  automated byte-for-byte regen (the data gen alone is ~11 hours).
- Future attacks have a clear starting point:
  1. **PUCT MCTS** with v3 as policy prior (the canonical "stronger
     teacher" attempt; would also need a value head on the MLP).
  2. **Action-history features** in `SeatView` (extends engine; the
     features-v2 plumbing in tree handles the encoder side).
  3. **Bigger model on v1 features** (`--hidden 128,128` etc.; cheap
     to try, falsifies the "capacity isn't the bottleneck" claim if
     win rate rises).
- The mlp-v3 win rate of 75.8% is well above the imitation ceiling
  ADR 004 noted for `mlp-v2` (50% self-play equilibrium with
  Heuristic). The next ceiling is roughly the MCTS teacher's strength
  at infinite budget — currently unknown, but probably not far above
  the K=8 N=200 64.7% point.

## Reproducing the experiments

| phase | what                              | how                                              |
|-------|-----------------------------------|--------------------------------------------------|
| 10.A  | `mctsAI` strength                 | `tsx scripts/eval-mcts.ts heuristic 8 200 200 1 31` |
| 10.B  | mcts self-play data → `mlp-v3`    | `tsx scripts/generate-mcts-data.ts && tsx scripts/train.ts --manifest training-data/manifest-mcts.json --jsonl training-data/mcts-selfplay.jsonl` |
| 10.B  | three-way head-to-head            | `tsx scripts/eval-head-to-head.ts mlp heuristic 200 1 31` (plus `mlp-v2`, `mcts:8:200` variants) |
| 10.C  | mcts-with-mlp-rollouts            | `tsx scripts/eval-head-to-head.ts mcts-mlp:8:200 heuristic 100 1 31` |
| 10.D  | features-v2 retrain               | `tsx scripts/train.ts --jsonl training-data/mcts-selfplay.jsonl --features-version 2 --weights-out /tmp/weights-v4.json` |
