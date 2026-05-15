// Automated check that the engine-purity ESLint guard actually fires on
// the forbidden globals. If someone weakens or removes the engine guard in
// eslint.config.js, this test fails — guarding the guard.
//
// Linting is slow (~1-2s spin-up); single test exercises all forbidden
// patterns at once via one ESLint invocation per snippet.

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({
  overrideConfigFile: 'eslint.config.js',
  cwd: process.cwd(),
});

async function lintEngineSnippet(code: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath: 'src/engine/__guard_canary.ts' });
  const messages = results[0]?.messages ?? [];
  return messages.map((m) => m.ruleId ?? '<unknown>');
}

describe('engine ESLint purity guard', () => {
  it('rejects Math.random in src/engine', async () => {
    const rules = await lintEngineSnippet('const v = Math.random(); export { v };\n');
    expect(rules).toContain('no-restricted-properties');
  });

  it('rejects Date.now in src/engine', async () => {
    const rules = await lintEngineSnippet('const t = Date.now(); export { t };\n');
    expect(rules).toContain('no-restricted-properties');
  });

  it('rejects new Date() in src/engine', async () => {
    const rules = await lintEngineSnippet('const d = new Date(); export { d };\n');
    expect(rules).toContain('no-restricted-syntax');
  });

  it('rejects vue import in src/engine', async () => {
    const rules = await lintEngineSnippet("import { ref } from 'vue';\nexport { ref };\n");
    expect(rules).toContain('no-restricted-imports');
  });

  it('rejects idb-keyval import in src/engine', async () => {
    const rules = await lintEngineSnippet(
      "import { get } from 'idb-keyval';\nexport { get };\n",
    );
    expect(rules).toContain('no-restricted-imports');
  });

  it('allows pure code in src/engine', async () => {
    const rules = await lintEngineSnippet(
      'export function add(a: number, b: number): number { return a + b; }\n',
    );
    expect(rules).not.toContain('no-restricted-properties');
    expect(rules).not.toContain('no-restricted-syntax');
    expect(rules).not.toContain('no-restricted-imports');
  });
});
