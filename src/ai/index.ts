// AI registry. Mirrors the rule-plugin registry: a frozen lookup table
// keyed by id, plus a default + a list helper for picker UIs.
//
// New AIs add themselves here once authored. The Theme / Rules patterns
// proved this shape works for end-user discoverability + GameRecord
// stamping (each completed game records the AI id+version per seat).

import { basicAI } from './basic';
import { heuristicAI } from './heuristic';
import { mlpAI } from './ml-mlp';
import type { AIPlayerInfo } from './types';

export * from './types';

export const AI_LIBRARY: Readonly<Record<string, AIPlayerInfo>> = Object.freeze({
  [basicAI.id]: basicAI,
  [heuristicAI.id]: heuristicAI,
  [mlpAI.id]: mlpAI,
});

export const DEFAULT_AI_ID: string = heuristicAI.id;

export function getAI(id: string): AIPlayerInfo | undefined {
  return AI_LIBRARY[id];
}

export function aiOrDefault(id: string | null | undefined): AIPlayerInfo {
  if (id) {
    const a = getAI(id);
    if (a) return a;
  }
  return AI_LIBRARY[DEFAULT_AI_ID]!;
}

export function aiRegistry(): ReadonlyArray<{ id: string; displayName: string; version: string }> {
  return Object.values(AI_LIBRARY).map((a) => ({
    id: a.id,
    displayName: a.displayName,
    version: a.version,
  }));
}

export { basicAI, heuristicAI, mlpAI };
