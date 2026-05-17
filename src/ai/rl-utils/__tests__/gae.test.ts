import { describe, expect, it } from 'vitest';
import { computeGAE } from '../gae';

describe('computeGAE', () => {
  it('returns empty arrays for empty input', () => {
    const r = computeGAE([], [], 1, 0, 0.99, 0.95);
    expect(r.advantages).toEqual([]);
    expect(r.returns).toEqual([]);
  });

  it('throws when stepRewards and values disagree in length', () => {
    expect(() => computeGAE([0, 0], [0], 0, 0, 0.99, 0.95)).toThrow();
  });

  it('λ=1 recovers Monte-Carlo advantage: G_t - V(s_t)', () => {
    // With λ=1 and zero terminal value, A_t = (Σ γ^k r_{t+k}) - V_t
    // Pick values=0 to make returns equal Monte-Carlo returns.
    const stepRewards = [0.1, 0.2, 0.3];
    const values = [0, 0, 0];
    const r = computeGAE(stepRewards, values, 1, 0, 1, 1);
    // terminal=1 added to last step's reward.
    // MC returns: G[2] = 1.3, G[1] = 0.2 + 1.3 = 1.5, G[0] = 0.1 + 1.5 = 1.6
    expect(r.returns[0]).toBeCloseTo(1.6, 9);
    expect(r.returns[1]).toBeCloseTo(1.5, 9);
    expect(r.returns[2]).toBeCloseTo(1.3, 9);
    // Advantages = returns - values (= returns since values are 0).
    expect(r.advantages).toEqual(r.returns);
  });

  it('λ=0 recovers one-step TD: A_t = δ_t = r_t + γV(s_{t+1}) - V(s_t)', () => {
    // stepRewards constant, values constant: δ_t = r + γV - V = r + V(γ - 1).
    const stepRewards = [0.5, 0.5, 0.5];
    const values = [0.2, 0.2, 0.2];
    const gamma = 0.9;
    const r = computeGAE(stepRewards, values, 0, 0, gamma, 0);
    // For t < T-1: δ = 0.5 + 0.9·0.2 - 0.2 = 0.48
    expect(r.advantages[0]).toBeCloseTo(0.48, 9);
    expect(r.advantages[1]).toBeCloseTo(0.48, 9);
    // For t = T-1: terminalValue=0 + terminalReward=0 → δ = 0.5 + 0.9·0 - 0.2 = 0.3
    expect(r.advantages[2]).toBeCloseTo(0.3, 9);
  });

  it('returns = advantages + values (definitional identity)', () => {
    const stepRewards = [0.1, -0.2, 0.4, 0.05];
    const values = [0.3, 0.25, 0.5, 0.1];
    const r = computeGAE(stepRewards, values, 1, 0, 0.99, 0.95);
    for (let t = 0; t < r.advantages.length; t++) {
      expect(r.returns[t]).toBeCloseTo(r.advantages[t]! + values[t]!, 9);
    }
  });

  it('with all zero rewards + values, advantages decay as (γλ)^k * terminal', () => {
    const T = 4;
    const stepRewards = new Array<number>(T).fill(0);
    const values = new Array<number>(T).fill(0);
    const gamma = 0.9;
    const lambda = 0.5;
    const terminal = 1;
    const r = computeGAE(stepRewards, values, terminal, 0, gamma, lambda);
    // A[T-1] = δ_{T-1} = terminal = 1
    // A[T-2] = γλ · 1 = 0.45
    // A[T-3] = (γλ)^2 = 0.2025
    // A[T-4] = (γλ)^3 = 0.091125
    expect(r.advantages[3]).toBeCloseTo(1, 9);
    expect(r.advantages[2]).toBeCloseTo(0.45, 9);
    expect(r.advantages[1]).toBeCloseTo(0.2025, 9);
    expect(r.advantages[0]).toBeCloseTo(0.091125, 9);
  });
});
