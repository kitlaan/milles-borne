// Rule library: maps rule id → plugin. Use `rulesFromIds()` to resolve a
// list of ids to plugin instances (for resume / replay), or import plugins
// directly for new games.
//
// New rules add themselves here once implemented. There is no global
// mutable registry — this is a frozen lookup table assembled at module
// init.

import { coreRule } from './core';
import { coupFourreRule } from './coup-fourre';
import { memoryModeRule } from './memory-mode';
import { standardBonusesRule } from './standard-bonuses';
import type { RulePlugin } from './types';

export * from './types';

export const RULE_LIBRARY: Readonly<Record<string, RulePlugin>> = Object.freeze({
  [coreRule.id]: coreRule,
  [coupFourreRule.id]: coupFourreRule,
  [standardBonusesRule.id]: standardBonusesRule,
  [memoryModeRule.id]: memoryModeRule,
});

// Rules that always run — required for the game to function correctly.
export const CORE_RULE_IDS: ReadonlyArray<string> = Object.freeze([coreRule.id]);

// Rules a player can opt in / out of via settings.
export const OPTIONAL_RULE_IDS: ReadonlyArray<string> = Object.freeze([
  coupFourreRule.id,
  standardBonusesRule.id,
  memoryModeRule.id,
]);

export function rulesFromIds(ids: ReadonlyArray<string>): RulePlugin[] {
  return ids.map((id) => {
    const r = RULE_LIBRARY[id];
    if (!r) throw new Error(`Unknown rule plugin: ${id}`);
    return r;
  });
}

// Default new-game rule set. Includes core + the optional rules that are
// on by default for a faithful Mille Bornes experience.
export function defaultRules(): RulePlugin[] {
  return [coreRule, coupFourreRule, standardBonusesRule];
}

export function listAvailableRules(): ReadonlyArray<{ id: string; version: string }> {
  return Object.values(RULE_LIBRARY)
    .map((p) => ({ id: p.id, version: p.version }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
