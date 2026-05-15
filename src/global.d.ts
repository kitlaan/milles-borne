// __GIT_COMMIT__ is injected at build time:
//   - Vite production: short commit hash (e.g., "a1b2c3d")
//   - Vite dev with no git: "dev"
//   - Vitest: "test" (set in vitest.config.ts define)
//   - tsx CLI: not injected by tsx itself — the CLI helper reads commit via
//     child_process at startup and threads it explicitly into engine config.
declare const __GIT_COMMIT__: string;

// __ENGINE_VERSION__ is the engine semver from package.json, injected by
// Vite at build time. Vitest sets it to 'test' via vitest.config.ts.
declare const __ENGINE_VERSION__: string;

// Vue SFC modules — TS needs an ambient declaration to import .vue files
// as components. Returned shape is the generic Vue component type. The
// `{}` and `any` are the standard Vue shim; we silence the lint nags here.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
  const component: DefineComponent<{}, {}, any>;
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
  export default component;
}
