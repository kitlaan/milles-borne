import { describe, expect, it } from 'vitest';
import { nextInt, seedRng, shuffle } from '../rng';

describe('rng', () => {
  it('same seed produces identical nextInt sequence', () => {
    const a = seedRng(42);
    const b = seedRng(42);
    const seqA: number[] = [];
    const seqB: number[] = [];
    let stateA = a;
    let stateB = b;
    for (let i = 0; i < 20; i++) {
      const [vA, nextA] = nextInt(stateA, 100);
      const [vB, nextB] = nextInt(stateB, 100);
      seqA.push(vA);
      seqB.push(vB);
      stateA = nextA;
      stateB = nextB;
    }
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    let a = seedRng(1);
    let b = seedRng(2);
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 20; i++) {
      const [vA, nextA] = nextInt(a, 1000);
      const [vB, nextB] = nextInt(b, 1000);
      seqA.push(vA);
      seqB.push(vB);
      a = nextA;
      b = nextB;
    }
    expect(seqA).not.toEqual(seqB);
  });

  it('shuffle is deterministic given the same seed', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const [shuffledA] = shuffle(items, seedRng(7));
    const [shuffledB] = shuffle(items, seedRng(7));
    expect(shuffledA).toEqual(shuffledB);
  });

  it('shuffle preserves elements (permutation)', () => {
    const items = Array.from({ length: 106 }, (_, i) => i);
    const [shuffled] = shuffle(items, seedRng(123));
    expect(shuffled.length).toBe(items.length);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
  });

  it('shuffle generally reorders the input', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const [shuffled] = shuffle(items, seedRng(42));
    expect(shuffled).not.toEqual(items);
  });

  it('nextInt returns values within [0, max)', () => {
    let state = seedRng(99);
    for (let i = 0; i < 200; i++) {
      const [v, next] = nextInt(state, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      state = next;
    }
  });

  it('stepCount advances by one per nextInt call', () => {
    let state = seedRng(1);
    expect(state.stepCount).toBe(0);
    [, state] = nextInt(state, 10);
    expect(state.stepCount).toBe(1);
    [, state] = nextInt(state, 10);
    expect(state.stepCount).toBe(2);
  });

  it('RngState is plain JSON-serializable', () => {
    const state = seedRng(5);
    const [, advanced] = nextInt(state, 10);
    const serialized = JSON.stringify(advanced);
    const restored = JSON.parse(serialized);
    expect(restored).toEqual(advanced);
  });

  it('shuffle of a singleton or empty array is a no-op for elements', () => {
    expect(shuffle([], seedRng(1))[0]).toEqual([]);
    expect(shuffle([42], seedRng(1))[0]).toEqual([42]);
  });
});
