import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// `<short-hash>` or `<short-hash>-dirty` when the working tree has any
// tracked modifications or untracked files. Knowing a build came from a
// dirty tree matters for ML data provenance and replay diagnostics.
function readGitCommit(): string {
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

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __GIT_COMMIT__: JSON.stringify(readGitCommit()),
    __ENGINE_VERSION__: JSON.stringify(readEngineVersion()),
  },
});

function readEngineVersion(): string {
  const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}
