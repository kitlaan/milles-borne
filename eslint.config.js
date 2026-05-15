import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        __GIT_COMMIT__: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Engine purity guard: forbid impure globals and UI/build-tool imports
  // inside src/engine/. Engine must be portable to Node, Worker, future server.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['vue', 'vue/*'], message: 'Engine must not import Vue.' },
          { group: ['pinia', 'pinia/*'], message: 'Engine must not import Pinia.' },
          { group: ['vite', 'vite/*'], message: 'Engine must not import Vite.' },
          { group: ['idb-keyval', 'idb-keyval/*'], message: 'Engine must not touch storage.' },
          { group: ['@/ui/*', '@/themes/*'], message: 'Engine must not import UI/themes.' },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'localStorage', message: 'Engine must be pure: no storage.' },
        { name: 'sessionStorage', message: 'Engine must be pure: no storage.' },
        { name: 'fetch', message: 'Engine must be pure: no I/O.' },
        { name: 'XMLHttpRequest', message: 'Engine must be pure: no I/O.' },
        { name: 'document', message: 'Engine must be pure: no DOM.' },
        { name: 'window', message: 'Engine must be pure: no DOM.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Engine must use state.rng.' },
        { object: 'Date', property: 'now', message: 'Engine must be pure: take time from outside.' },
        { object: 'crypto', property: 'getRandomValues', message: 'Engine must use state.rng.' },
        { object: 'crypto', property: 'randomUUID', message: 'Engine must use state.rng.' },
      ],
      'no-restricted-syntax': ['error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Engine must be pure: take time from outside.',
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
