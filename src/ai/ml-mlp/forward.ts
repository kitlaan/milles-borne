// Tiny hand-rolled multi-layer perceptron for the MLP AI variant.
//
// Architecture is a feed-forward stack: input → hidden → ... → output.
// All hidden layers use ReLU activation; the output layer is raw (no
// activation) — the AI plugin can argmax / softmax as needed.
//
// Weights are stored as plain JSON (see MlpWeights) so they round-trip
// through the training script and the bundled static asset without any
// binary format. Every layer is shape [outDim × inDim] for the matrix
// plus [outDim] for the bias — row-major dot products in the forward
// pass.

// Shape: weights[outIdx][inIdx]. biases[outIdx].
export type MlpLayer = {
  readonly weights: ReadonlyArray<ReadonlyArray<number>>;
  readonly biases: ReadonlyArray<number>;
};

export type MlpWeights = {
  readonly version: string;
  readonly inputDim: number;
  readonly hiddenDims: ReadonlyArray<number>;
  readonly outputDim: number;
  readonly layers: ReadonlyArray<MlpLayer>;
};

// Compute the expected layer shapes from an architecture description.
// First layer: [hidden[0] × input]. Each subsequent layer goes
// hidden[i-1] → hidden[i], and the final layer goes hidden[last] →
// output. If hiddenDims is empty, a single layer goes input → output.
function expectedShapes(
  inputDim: number,
  hiddenDims: ReadonlyArray<number>,
  outputDim: number,
): Array<{ outDim: number; inDim: number }> {
  const shapes: Array<{ outDim: number; inDim: number }> = [];
  let prev = inputDim;
  for (const h of hiddenDims) {
    shapes.push({ outDim: h, inDim: prev });
    prev = h;
  }
  shapes.push({ outDim: outputDim, inDim: prev });
  return shapes;
}

export function validateWeights(w: MlpWeights): void {
  if (w.inputDim <= 0) throw new Error(`MLP inputDim must be > 0`);
  if (w.outputDim <= 0) throw new Error(`MLP outputDim must be > 0`);
  for (const h of w.hiddenDims) {
    if (h <= 0) throw new Error(`MLP hiddenDim must be > 0`);
  }
  const shapes = expectedShapes(w.inputDim, w.hiddenDims, w.outputDim);
  if (w.layers.length !== shapes.length) {
    throw new Error(
      `MLP layer count mismatch: expected ${shapes.length}, got ${w.layers.length}`,
    );
  }
  for (let i = 0; i < shapes.length; i++) {
    const want = shapes[i]!;
    const layer = w.layers[i]!;
    if (layer.biases.length !== want.outDim) {
      throw new Error(
        `MLP layer ${i} bias length ${layer.biases.length} ≠ expected ${want.outDim}`,
      );
    }
    if (layer.weights.length !== want.outDim) {
      throw new Error(
        `MLP layer ${i} weights rows ${layer.weights.length} ≠ expected ${want.outDim}`,
      );
    }
    for (let r = 0; r < layer.weights.length; r++) {
      const row = layer.weights[r]!;
      if (row.length !== want.inDim) {
        throw new Error(
          `MLP layer ${i} row ${r} length ${row.length} ≠ expected ${want.inDim}`,
        );
      }
    }
  }
}

function applyLayer(
  layer: MlpLayer,
  input: ReadonlyArray<number>,
  activate: boolean,
): number[] {
  const out = new Array<number>(layer.biases.length);
  for (let j = 0; j < layer.biases.length; j++) {
    let sum = layer.biases[j]!;
    const row = layer.weights[j]!;
    for (let i = 0; i < input.length; i++) {
      sum += row[i]! * input[i]!;
    }
    out[j] = activate && sum < 0 ? 0 : sum;
  }
  return out;
}

// Forward pass: hidden layers use ReLU, output layer returns raw logits.
// Throws if `input.length` mismatches `weights.inputDim`.
export function forward(
  weights: MlpWeights,
  input: ReadonlyArray<number>,
): number[] {
  if (input.length !== weights.inputDim) {
    throw new Error(
      `MLP forward: input length ${input.length} ≠ inputDim ${weights.inputDim}`,
    );
  }
  let x: ReadonlyArray<number> = input;
  const last = weights.layers.length - 1;
  for (let i = 0; i < weights.layers.length; i++) {
    x = applyLayer(weights.layers[i]!, x, i < last);
  }
  return [...x];
}

// Build a zero-initialized weights structure. Useful in tests and as the
// starting point for training before the first weight update.
export function emptyWeights(
  version: string,
  inputDim: number,
  hiddenDims: ReadonlyArray<number>,
  outputDim: number,
): MlpWeights {
  const shapes = expectedShapes(inputDim, hiddenDims, outputDim);
  const layers: MlpLayer[] = shapes.map(({ outDim, inDim }) => ({
    weights: Array.from({ length: outDim }, () =>
      Array.from({ length: inDim }, () => 0),
    ),
    biases: Array.from({ length: outDim }, () => 0),
  }));
  return {
    version,
    inputDim,
    hiddenDims: [...hiddenDims],
    outputDim,
    layers,
  };
}

// Parse JSON-shaped weights and validate. Throws on any shape mismatch
// so a bad weights file fails loudly at load time rather than silently
// producing nonsense outputs.
export function parseWeights(raw: unknown): MlpWeights {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('MLP weights: not an object');
  }
  const w = raw as MlpWeights;
  validateWeights(w);
  return w;
}
