// MLP AI variant — small feedforward net distilled from MCTS self-play.
//
// Loads the trained weights JSON (committed alongside this file) at
// module init via Vite's resolveJsonModule import. parseWeights
// validates the shape so a corrupt or stale weights file fails at
// load time rather than producing garbage actions later.
//
// The plugin currently ships v3 weights (trained on MCTS self-play,
// see Phase 10.B). v2 weights (trained on heuristic self-play) stay
// on disk as `weights-v2.json` for reproducibility and side-by-side
// eval; `makeMlpAI({ weights })` builds an AIPlayerInfo around any
// conforming weights JSON for that purpose.

import type { AIPlayer, AIPlayerInfo } from '../types';
import { parseWeights, type MlpWeights } from './forward';
import { chooseActionFromModel } from './inference';
import weightsJson from './weights-v3.json';

const weights = parseWeights(weightsJson);

const mlpPlay: AIPlayer = async (view, legal) =>
  chooseActionFromModel(weights, view, legal);

export const mlpAI: AIPlayerInfo = {
  id: 'mlp',
  // Hardcoded to match the bundled v3 weights (MCTS self-play, Phase 10.B).
  // weights.version is the model arch tag (`mlp-v2`), not the training
  // iteration — picker label tracks the iteration + data source instead,
  // so swapping bundled weights means updating this string.
  displayName: 'MLP (v3: MCTS self-play)',
  version: weights.version,
  play: mlpPlay,
};

// Build an AIPlayerInfo around any parsed-weights blob. Useful for
// head-to-head evals where the registered `mlpAI` is one version and
// the test fixture wants to load a different weights file.
export function makeMlpAI(
  loadedMlpWeights: MlpWeights,
  id: string,
  displayName: string,
): AIPlayerInfo {
  const play: AIPlayer = async (view, legal) =>
    chooseActionFromModel(loadedMlpWeights, view, legal);
  return {
    id,
    displayName,
    version: loadedMlpWeights.version,
    play,
  };
}

export { parseWeights };
export type { MlpWeights };
