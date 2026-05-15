import { describe, expect, it } from 'vitest';
import { buildEngineDescriptor, compatibilityKey } from '../descriptor';
import type { RulePlugin } from '../rules/types';

function fakeRule(id: string, version: string): RulePlugin {
  return { id, version, hooks: {} };
}

describe('engine descriptor', () => {
  it('captures engineVersion, gitCommit, schemaVersion', () => {
    const d = buildEngineDescriptor({
      engineVersion: '1.2.3',
      gitCommit: 'abcdef0',
      rules: [],
    });
    expect(d.engineVersion).toBe('1.2.3');
    expect(d.gitCommit).toBe('abcdef0');
    expect(d.schemaVersion).toBe(1);
  });

  it('sorts rules by id for stability across construction order', () => {
    const d = buildEngineDescriptor({
      engineVersion: '1.0.0',
      gitCommit: 'x',
      rules: [fakeRule('zebra', '1'), fakeRule('alpha', '2'), fakeRule('mid', '3')],
    });
    expect(d.rules.map((r) => r.id)).toEqual(['alpha', 'mid', 'zebra']);
  });

  it('compatibilityKey is identical for descriptors with same engineVersion + rules', () => {
    const a = buildEngineDescriptor({
      engineVersion: '1.0.0',
      gitCommit: 'aaa',
      rules: [fakeRule('core', '1.0'), fakeRule('cf', '2.0')],
    });
    const b = buildEngineDescriptor({
      engineVersion: '1.0.0',
      gitCommit: 'bbb', // different commit
      rules: [fakeRule('core', '1.0'), fakeRule('cf', '2.0')],
    });
    expect(compatibilityKey(a)).toBe(compatibilityKey(b));
  });

  it('compatibilityKey differs when rule versions diverge', () => {
    const a = buildEngineDescriptor({
      engineVersion: '1.0.0', gitCommit: 'x',
      rules: [fakeRule('core', '1.0')],
    });
    const b = buildEngineDescriptor({
      engineVersion: '1.0.0', gitCommit: 'x',
      rules: [fakeRule('core', '1.1')],
    });
    expect(compatibilityKey(a)).not.toBe(compatibilityKey(b));
  });

  it('compatibilityKey differs when engineVersion changes', () => {
    const a = buildEngineDescriptor({
      engineVersion: '1.0.0', gitCommit: 'x',
      rules: [fakeRule('core', '1.0')],
    });
    const b = buildEngineDescriptor({
      engineVersion: '1.0.1', gitCommit: 'x',
      rules: [fakeRule('core', '1.0')],
    });
    expect(compatibilityKey(a)).not.toBe(compatibilityKey(b));
  });

  it('descriptor is serializable to JSON', () => {
    const d = buildEngineDescriptor({
      engineVersion: '1.0.0', gitCommit: 'x',
      rules: [fakeRule('core', '1.0'), fakeRule('cf', '2.0')],
    });
    const round = JSON.parse(JSON.stringify(d));
    expect(round).toEqual(d);
  });
});
