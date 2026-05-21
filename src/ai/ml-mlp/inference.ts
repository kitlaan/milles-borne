// Model-based action picker. Used by both the AI plugin at runtime and the
// training script for win-rate eval — keeping a single implementation here
// means train-time and play-time can't drift apart silently.

import type { Action } from '@/engine/actions';
import type { SeatView } from '@/engine/view';
import { decodeActionFromSlot, legalActionMask } from './actions';
import { encodeFeatures } from './features';
import { encodeFeaturesV2 } from './features-v2';
import { forward, type MlpWeights } from './forward';

function encode(weights: MlpWeights, view: SeatView): number[] {
  return weights.featuresVersion === 2
    ? encodeFeaturesV2(view)
    : encodeFeatures(view);
}

export function chooseActionFromModel(
  weights: MlpWeights,
  view: SeatView,
  legal: ReadonlyArray<Action>,
): Action {
  if (legal.length === 0) {
    throw new Error('chooseActionFromModel: no legal actions available');
  }
  if (legal.length === 1) return legal[0]!;

  const features = encode(weights, view);
  const logits = forward(weights, features);
  const mask = legalActionMask(view, legal);

  let bestSlot = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < logits.length; i++) {
    if (!mask[i]) continue;
    if (logits[i]! > bestScore) {
      bestScore = logits[i]!;
      bestSlot = i;
    }
  }

  if (bestSlot >= 0) {
    const a = decodeActionFromSlot(bestSlot, view, legal);
    if (a) return a;
  }
  // Defensive: mask was built from legal[], so at least one slot must be
  // selectable. Falling back to legal[0] keeps the AI alive in the
  // never-should-happen case.
  return legal[0]!;
}
