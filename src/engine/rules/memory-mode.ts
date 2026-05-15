// "Memory mode" house rule: forbid players from looking through the
// discard pile. The engine has no mechanical effect for this rule — the
// public discard is a UI-side affordance. The plugin exists so the rule:
//
//   1. shows up in the active-rules list (Rules modal, settings)
//   2. is stamped on the GameRecord descriptor (data for any future
//      analysis that wants to filter by "this game played in memory mode")
//   3. is queryable from UI components via `store.hasRule('memory-mode')`
//
// UI integration lives in Board.vue: when memory-mode is active, the
// discard pile is rendered as non-inspectable so clicking it doesn't open
// the inspector modal.

import type { RulePlugin } from './types';

export const memoryModeRule: RulePlugin = {
  id: 'memory-mode',
  version: '0.1.0',
  hooks: {},
};
