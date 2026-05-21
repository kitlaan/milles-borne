# ADR 004 — RL experiments summary + retirement of hand-rolled ml-rl

**Status:** accepted
**Date:** 2026-05-17
**Supersedes:** none

## Context

Between Phase 9.1 and Phase 9.6, the project ran four progressively more
sophisticated training methods on top of the supervised `mlp-v2`
baseline (53→64→64→41 MLP, masked cross-entropy imitation of the
Heuristic AI). The goal was to break past the supervised win rate vs
Heuristic and produce a strictly stronger AI.

The result: **all four flavors plateaued at the supervised baseline**.
The training infrastructure works correctly; the policy doesn't get
better. This document captures *what was learned* before the
experimental code is removed, so the next attempt (likely on top of
richer features or a real ML framework) starts from the evidence rather
than re-discovering it.

## Experiment scoreboard

Win rate vs Heuristic, same-seed 200-game evals (both seat positions):

| approach | win rate | notes |
|---|---|---|
| `mlp-v2` (supervised, masked CE) | **47%** | baseline |
| `rl-v2` (REINFORCE + fixed opp + entropy) | 48% | within noise |
| `ppo-v1` (clipped PPO, no value head) | 46% | within noise |
| `ppo-v2` (PPO + value head + GAE) | 47% | within noise |

±3.5 percentage points binomial noise at n=200. None of the RL flavors
escape this band.

## What we learned (transferable knowledge)

These findings are independent of the specific training code that's
being removed. They constrain the next attempt.

### 1. Architecture / feature representation is the ceiling, not the algorithm

Four algorithms (CE-supervised, REINFORCE, PPO-clip, PPO-AC-GAE) all
converged on roughly the same policy quality. Algorithm sophistication
didn't help. The 53-dim feature vector + 64×64 MLP captures roughly the
strategy depth Heuristic encodes, and no training-method improvement
breaks through that.

Implication for next attempt: change the model size and/or the feature
encoder *before* spending effort on more sophisticated algorithms.

### 2. Imitation has a hard ceiling at teacher quality

Even a perfect Heuristic clone would win ~50% against Heuristic (self-
play equilibrium). We're at 47% — already close to the imitation
ceiling. Pursuing past it requires either (a) features that let the
model encode strategy the teacher uses but we can't currently express,
or (b) a paradigm that doesn't depend on the teacher (real RL with
exploration, MCTS planning, etc.).

### 3. Action-agreement is a misleading metric on its own

`mlp-v2` reported 88-91% action agreement on held-out games, which
sounded like a near-perfect imitation. Actual win rate told a different
story (initially much weaker). The disagreements were the
strategically important decisions; the agreements were the easy "play
the mile, draw the card" moves. Always evaluate AI quality by
head-to-head win rate, not by per-step agreement.

### 4. Distribution shift is real and measurable

`scripts/inspect-mlp.ts` showed 11% disagreement at train-time (states
drawn from Heuristic-vs-Heuristic) → 21% at inference-time (states
driven by MLP itself). When the model makes a small mistake it lands
in states the teacher never visited, where the model is even less
reliable. Classic imitation-learning failure mode.

Mitigations to consider next attempt: DAgger-style re-query of teacher
on the model's own state distribution, or RL from richer features
(which captures more of the state so generalization is easier).

### 5. Eval methodology: n ≥ 200 same-seed games is the minimum

- eval-50 has ~±7% binomial noise. Differences smaller than that are
  meaningless.
- eval-100 still ±5%.
- 200 same-seed games (100 with each seat assignment) is the minimum
  to discriminate models that differ by ≤5 percentage points.

PPO returns oscillate substantially within a single training run, so
single-eval snapshots are also noisy. Use eval averages over a window
or the best-checkpoint-by-eval policy.

### 6. Best-checkpoint selection matters

PPO win rate degrades after a peak in training; last-iter weights are
not best weights. Always track and ship the highest-eval snapshot, not
the final iteration's output. (`scripts/train-ppo*.ts` did this; future
trainers should too.)

### 7. Self-play stagnates; fixed opponent is cleaner

REINFORCE against the same policy was a moving target — the model and
its opponent change together, so "win rate" provides no clean gradient
signal. Training against a fixed Heuristic with the policy seat
alternated per game produced more stable updates.

If/when we revisit self-play, it should be against a pool of past
checkpoints (poker / AlphaZero pattern) rather than the current
weights.

### 8. Mille Bornes characteristics that make RL hard

- Hidden information (opponent hand) makes value estimation noisy
- Long episodes (~80 decisions per hand) make credit assignment hard
- Tiny outcome differentiation (±1 over many actions) gives weak
  policy-gradient signal
- Decisions are highly state-conditional (the right play depends on
  exact mile-count, safety availability, recent hazards) — coarse
  features lose strategic content

Anything that doesn't address at least one of these directly is
unlikely to help.

### 9. Determinism end-to-end is achievable and worth preserving

`generate-training-data → train → eval` is bit-reproducible from a
single seed. `verify-weights` enforces this. Catching drift
(deliberate or accidental) is cheap when this property holds. Future
training scripts should preserve it.

### 10. The engine bug surfaced by Phase 8.2 (commit `4bffde5`) was a
genuine deadlock that pre-existed all this work. Training against
self-play surfaced it because it generated more diverse game endings
than the Heuristic-vs-Heuristic tests covered. **Self-play remains
useful as a fuzz-test for the engine** even if the resulting AI
doesn't outperform supervised.

## What features are likely missing

These are signals Heuristic uses internally but the 53-dim feature
vector doesn't expose:

- **Mileage delta as an explicit dimension** (own_dist - opp_dist
  normalized). Currently both distances are in features but the
  difference — which is what Heuristic actually reasons about — is
  buried.
- **Recent-action history** (last 3-5 actions one-hot, with seat). Lets
  the model detect opponent play patterns (e.g., "opponent just played
  a hazard against me; they're likely playing aggressively").
- **Cards-remaining-in-deck by category or type** (5-19 dims).
  Currently only deck size is in features; not what's in it. Without
  this, the model can't reason about late-game card scarcity.
- **Opponent vulnerability flags** (per-hazard-type: is opponent
  protected by a safety? rolling? speed-limited?). These are derived
  from existing fields but explicit one-hots reduce the burden on the
  trunk.
- **Encoded legal action set as input** (action-mask as a feature).
  Currently the mask is applied to logits but the model doesn't *see*
  what its options are while computing features. Letting it know
  "which actions are even possible" before deciding may help.

A feature-encoder rewrite that adds these is the recommended next
attack. Pin the new schema as `features-v2` and retrain from scratch.

## What's being removed

The reset takes `main` back to commit `609f1ab` (Phase 9.2 — supervised
`mlp-v2` weights). The following files / changes leave history:

- `scripts/train-rl.ts` (REINFORCE)
- `scripts/train-ppo.ts` (clipped PPO)
- `scripts/train-ppo-ac.ts` (PPO + V-head + GAE)
- `src/ai/ml-rl/` (entire directory: reward harness, plugin, weights,
  report)
- `src/ai/index.ts` registration of `rlAI`
- `npm run train-rl`, `train-ppo`, `train-ppo-ac` scripts in
  `package.json`
- `README.md` ml-rl section / row

## What's being kept

- `scripts/inspect-mlp.ts` (Phase 9.1) — universal diagnostic. Works
  on any AI plugin; reusable for the next iteration.
- `src/ai/rl-utils/reward.ts` — `shapeStepReward`, `terminalReward`,
  `computeReturns`. Framework-agnostic; preserved for the next RL
  attempt.
- `src/ai/rl-utils/gae.ts` — `computeGAE` extracted from the PPO-AC
  trainer. Pure math, no framework dependency.
- Engine fix (`4bffde5`) — pre-9.2, preserved automatically.
- Generator tolerance (`25bb323`) — pre-9.2, preserved automatically.
- Vite relative paths (`76a8e91`) — pre-9.2, preserved automatically.
- This ADR.

## Decision

Reset `main` to `609f1ab` and replay (a) the rl-utils extraction and
(b) this ADR as the two follow-up commits.

## Consequences

- Cleaner history: the journey is recorded here, the working tree is
  back to the strongest committed AI (`mlp-v2`).
- The next RL attempt starts from rl-utils + this ADR's "what's
  missing" list. No re-discovery cost.
- Anyone reading the project will see one supervised AI in the picker
  (Basic, Heuristic, MLP) instead of four (RL having been removed
  from the registry). Less confusion, less indecipherable history.
- We lose the ability to "just rerun the old training scripts." If
  we want to reproduce those experiments, we'd need to recreate from
  the git history before the reset (the SHAs are preserved in this
  document's experiment scoreboard section's commit references).

## Reproducing the retired experiments

Pre-reset commit references (now orphan; available via reflog or by
checking out specific SHAs before garbage collection):

| phase | commit | content |
|---|---|---|
| 9.3.1 | `51424ab` | ml-rl reward harness |
| 9.3.2 | `69bee50` | REINFORCE self-play training |
| 9.3.3 | `82d9c15` | ml-rl AI plugin + registry |
| 9.4   | `1d47b07` | REINFORCE + fixed-opp + entropy → rl-v2 |
| 9.5   | `25f34f7` | PPO clipped → ppo-v1 |
| 9.6   | `8374b01` | PPO + V-head + GAE → ppo-v2 |
