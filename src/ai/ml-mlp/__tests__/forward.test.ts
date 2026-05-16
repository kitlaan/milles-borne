import { describe, expect, it } from 'vitest';
import {
  emptyWeights,
  forward,
  parseWeights,
  validateWeights,
  type MlpWeights,
} from '../forward';

describe('mlp forward', () => {
  it('emptyWeights produces validate-clean structure', () => {
    const w = emptyWeights('test', 4, [3, 2], 2);
    expect(() => validateWeights(w)).not.toThrow();
    expect(w.layers).toHaveLength(3); // 4→3, 3→2, 2→2
    expect(w.layers[0]!.weights).toHaveLength(3);
    expect(w.layers[0]!.weights[0]).toHaveLength(4);
    expect(w.layers[2]!.weights).toHaveLength(2);
    expect(w.layers[2]!.weights[0]).toHaveLength(2);
  });

  it('zero weights produce zero output regardless of input', () => {
    const w = emptyWeights('test', 5, [3, 3], 4);
    const out = forward(w, [1, 2, -3, 4, -5]);
    expect(out).toEqual([0, 0, 0, 0]);
  });

  it('forward on a single linear layer matches W·x + b', () => {
    // 3 inputs → 2 outputs, no hidden layers.
    const w: MlpWeights = {
      version: 'test',
      inputDim: 3,
      hiddenDims: [],
      outputDim: 2,
      layers: [
        {
          weights: [
            [1, 2, 3],
            [-1, 0, 1],
          ],
          biases: [10, -10],
        },
      ],
    };
    // y0 = 1*1 + 2*2 + 3*3 + 10 = 24
    // y1 = -1*1 + 0*2 + 1*3 + -10 = -8
    expect(forward(w, [1, 2, 3])).toEqual([24, -8]);
  });

  it('output layer does NOT apply ReLU (negative logits preserved)', () => {
    // Single layer 1 → 1, bias forces negative output.
    const w: MlpWeights = {
      version: 'test',
      inputDim: 1,
      hiddenDims: [],
      outputDim: 1,
      layers: [{ weights: [[1]], biases: [-5] }],
    };
    expect(forward(w, [3])).toEqual([-2]);
  });

  it('hidden layers apply ReLU (negative pre-activation → 0)', () => {
    // Two-layer net: 1→1→1.
    // Hidden layer: y = -1 * x + 0  (negative for any positive x, so ReLU → 0)
    // Output layer: y = 1 * h + 7 → 7 if hidden was 0.
    const w: MlpWeights = {
      version: 'test',
      inputDim: 1,
      hiddenDims: [1],
      outputDim: 1,
      layers: [
        { weights: [[-1]], biases: [0] },
        { weights: [[1]], biases: [7] },
      ],
    };
    expect(forward(w, [5])).toEqual([7]);
    // For negative input the hidden pre-activation is +5, ReLU keeps it,
    // and output = 1*5 + 7 = 12.
    expect(forward(w, [-5])).toEqual([12]);
  });

  it('forward is deterministic for identical inputs', () => {
    const w: MlpWeights = {
      version: 'test',
      inputDim: 3,
      hiddenDims: [2],
      outputDim: 2,
      layers: [
        { weights: [[0.5, 0, 0], [0, 0, 0]], biases: [0, 0] },
        { weights: [[1, 0], [0, 1]], biases: [3, 0] },
      ],
    };
    const x = [1, 2, 3];
    expect(forward(w, x)).toEqual(forward(w, x));
  });

  it('throws when input length mismatches inputDim', () => {
    const w = emptyWeights('test', 4, [2], 3);
    expect(() => forward(w, [1, 2, 3])).toThrow(/input length/);
  });

  it('validateWeights catches layer-count mismatch', () => {
    const w = emptyWeights('test', 3, [2], 2);
    const broken: MlpWeights = { ...w, layers: w.layers.slice(0, 1) };
    expect(() => validateWeights(broken)).toThrow(/layer count/);
  });

  it('validateWeights catches bias-length mismatch', () => {
    const w = emptyWeights('test', 3, [2], 2);
    const broken: MlpWeights = {
      ...w,
      layers: [
        { weights: w.layers[0]!.weights, biases: [0, 0, 0] },
        w.layers[1]!,
      ],
    };
    expect(() => validateWeights(broken)).toThrow(/bias length/);
  });

  it('validateWeights catches row-length mismatch', () => {
    const w = emptyWeights('test', 3, [2], 2);
    const broken: MlpWeights = {
      ...w,
      layers: [
        {
          weights: [
            [1, 2],
            [3, 4],
          ],
          biases: [0, 0],
        },
        w.layers[1]!,
      ],
    };
    expect(() => validateWeights(broken)).toThrow(/row 0 length/);
  });

  it('parseWeights round-trips through JSON', () => {
    const w: MlpWeights = {
      version: 'v1',
      inputDim: 2,
      hiddenDims: [2],
      outputDim: 1,
      layers: [
        { weights: [[1, 0], [0, 1]], biases: [0, 0] },
        { weights: [[1, 1]], biases: [0] },
      ],
    };
    const round = parseWeights(JSON.parse(JSON.stringify(w)));
    expect(round).toEqual(w);
    expect(forward(round, [3, 4])).toEqual([7]);
  });

  it('parseWeights rejects non-objects', () => {
    expect(() => parseWeights(null)).toThrow();
    expect(() => parseWeights('not weights')).toThrow();
  });

  it('parseWeights surfaces shape errors from validateWeights', () => {
    const bad = {
      version: 'v1',
      inputDim: 2,
      hiddenDims: [],
      outputDim: 1,
      layers: [],
    };
    expect(() => parseWeights(bad)).toThrow(/layer count/);
  });
});
