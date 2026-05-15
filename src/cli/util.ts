// Shared CLI helpers — read engine version + git commit at startup.
//
// CLI scripts must `import 'fake-indexeddb/auto'` themselves at the top of
// the file so persistence works under Node (idb-keyval expects a global
// `indexedDB` to exist).

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readEngineVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/cli/util.ts → repo root is two levels up.
  const pkgPath = join(here, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

// Returns short hash + '-dirty' suffix if the working tree has any tracked
// modifications or untracked files (e.g., 'f5800d1' or 'f5800d1-dirty').
// Falls back to 'dev' when not in a git repo.
//
// We use `git status --porcelain` rather than `git describe --dirty` because
// the latter ignores untracked files. For ML data provenance, "anything
// different from HEAD" is the right definition of dirty — untracked files
// can include engine code that influenced the run.
export function readGitCommit(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const status = execSync('git status --porcelain', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return status.length > 0 ? `${hash}-dirty` : hash;
  } catch {
    return 'dev';
  }
}

export function parseFlag(argv: ReadonlyArray<string>, name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

export function hasFlag(argv: ReadonlyArray<string>, name: string): boolean {
  return argv.includes(name);
}
