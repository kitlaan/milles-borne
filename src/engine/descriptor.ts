// EngineDescriptor identifies the engine + rules used to play a game,
// stamped on every GameRecord. At load time, comparing descriptors detects
// replay drift (e.g., engine semver bumped, rule plugin version changed).
//
// The engine module accepts engineVersion + gitCommit as parameters rather
// than reading them directly: keeps the engine portable (Node, Worker, CLI
// via tsx, browser via Vite all source these strings differently).

import type { RulePlugin } from './rules/types';

export type EngineDescriptor = {
  readonly engineVersion: string;
  readonly gitCommit: string;
  readonly schemaVersion: 1;
  readonly rules: ReadonlyArray<{ readonly id: string; readonly version: string }>;
};

export type BuildDescriptorParams = {
  readonly engineVersion: string;
  readonly gitCommit: string;
  readonly rules: ReadonlyArray<RulePlugin>;
};

export function buildEngineDescriptor(params: BuildDescriptorParams): EngineDescriptor {
  return {
    engineVersion: params.engineVersion,
    gitCommit: params.gitCommit,
    schemaVersion: 1,
    rules: params.rules
      .map((r) => ({ id: r.id, version: r.version }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

// Human-readable compatibility key for bucketing records. Two records share
// a compatibility key only if both engineVersion and the full sorted rule
// list (id@version) match. gitCommit differences are not compat-breaking by
// default (a non-functional change can land on the same engineVersion).
export function compatibilityKey(d: EngineDescriptor): string {
  const rules = d.rules.map((r) => `${r.id}@${r.version}`).join(',');
  return `${d.engineVersion}|${rules}`;
}
