// "Classic" theme — file-based SVGs auto-collected from `./cards/`.
//
// New cards: drop a `<card-type>.svg` file in cards/. No code change.
// Validation runs at module-init time so missing files fail loudly.

import type { Theme } from '../types';
import { buildCardsRecord } from '../util';
import back from './card-back.svg?raw';

const cards = buildCardsRecord(
  import.meta.glob<string>('./cards/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
);

export const classicTheme: Theme = {
  id: 'classic',
  name: 'Classic',
  cards,
  back,
  cssVars: {
    '--card-bg': '#f9f1e1',
    '--card-fg': '#2c1810',
    '--color-mileage': '#2980b9',
    '--color-hazard': '#c0392b',
    '--color-remedy': '#27ae60',
    '--color-safety': '#c69214',
    '--card-back-a': '#1a3a5c',
    '--card-back-b': '#0d1f33',
    '--card-back-frame': '#c69214',
    '--card-back-fg': '#f9f1e1',
  },
};
