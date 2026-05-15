// __GIT_COMMIT__ is injected at build time:
//   - Vite production: short commit hash (e.g., "a1b2c3d")
//   - Vite dev with no git: "dev"
//   - Vitest: "test" (set in vitest.config.ts define)
//   - tsx CLI: not injected by tsx itself — the CLI helper reads commit via
//     child_process at startup and threads it explicitly into engine config.
declare const __GIT_COMMIT__: string;
