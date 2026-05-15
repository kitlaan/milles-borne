import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    // CLI / test runs don't go through Vite's bundler-time define for browser
    // code, but Vitest still needs these constants resolved for modules that
    // reference them.
    __GIT_COMMIT__: JSON.stringify('test'),
    __ENGINE_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
