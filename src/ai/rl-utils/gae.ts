// Generalized Advantage Estimation (GAE) — pure math, framework-
// agnostic. Extracted from the retired ml-rl PPO trainer so the next
// RL attempt (whatever framework / approach) can reuse it directly.
//
// GAE blends Monte-Carlo and one-step TD advantages via λ ∈ [0, 1]:
//   δ_t = r_t + γ·V(s_{t+1}) - V(s_t)
//   A_t = δ_t + (γλ)·δ_{t+1} + (γλ)²·δ_{t+2} + ...
//
// λ = 0 → pure TD (lowest variance, biased by V's error).
// λ = 1 → pure Monte-Carlo (unbiased, high variance).
// λ = 0.95 → common compromise.
//
// Reference: Schulman et al., "High-Dimensional Continuous Control Using
// Generalized Advantage Estimation", 2015.

// stepRewards[t]    : immediate reward after action t
// values[t]         : V(s_t) at the time the action was taken
// terminalReward    : extra reward delivered after the last step (e.g.
//                     +1 / -1 / 0 win/loss/draw)
// terminalValue     : V(s_T) bootstrap. Use 0 for true terminal states.
// gamma, lambda     : discount + GAE-λ
//
// Returns advantages[t] and bootstrapped returns[t] = A_t + V(s_t),
// suitable as value-head training targets.
export function computeGAE(
  stepRewards: ReadonlyArray<number>,
  values: ReadonlyArray<number>,
  terminalReward: number,
  terminalValue: number,
  gamma: number,
  lambda: number,
): { advantages: number[]; returns: number[] } {
  if (stepRewards.length !== values.length) {
    throw new Error(
      `computeGAE: stepRewards (${stepRewards.length}) and values (${values.length}) must be the same length`,
    );
  }
  const T = stepRewards.length;
  const advantages = new Array<number>(T);
  const returns = new Array<number>(T);
  let nextValue = terminalValue;
  let nextAdv = 0;
  // Fold the terminal reward into the final step's immediate reward —
  // simpler than tracking a separate "after-last" step.
  for (let t = T - 1; t >= 0; t--) {
    const r = t === T - 1 ? stepRewards[t]! + terminalReward : stepRewards[t]!;
    const delta = r + gamma * nextValue - values[t]!;
    nextAdv = delta + gamma * lambda * nextAdv;
    advantages[t] = nextAdv;
    returns[t] = nextAdv + values[t]!;
    nextValue = values[t]!;
  }
  return { advantages, returns };
}
