// MLP AI variant — supervised imitation of the Heuristic AI.
//
// Loads the trained weights JSON (committed alongside this file) at module
// init via Vite's resolveJsonModule import. parseWeights validates the
// shape so a corrupt or stale weights file fails at load time rather than
// producing garbage actions later.

import type { AIPlayer, AIPlayerInfo } from '../types';
import { parseWeights } from './forward';
import { chooseActionFromModel } from './inference';
import weightsJson from './weights.json';

const weights = parseWeights(weightsJson);

const mlpPlay: AIPlayer = async (view, legal) =>
  chooseActionFromModel(weights, view, legal);

export const mlpAI: AIPlayerInfo = {
  id: 'mlp',
  displayName: 'MLP (Imitation v1)',
  version: weights.version,
  play: mlpPlay,
};
