// Theme shape: each theme provides a complete set of card-face SVGs
// (keyed by CardType), one back SVG, and a palette of CSS variables that
// the SVGs reference via `var(--theme-*)`.
//
// All SVG strings are inlined (typically from `?raw` imports or generated
// programmatically). The Card component renders them via `v-html` inside
// its own outline / lift wrapper.

import type { CardType } from '@/engine/cards';

export type ThemeId = string;

export type Theme = {
  readonly id: ThemeId;
  readonly name: string;
  readonly cards: Readonly<Record<CardType, string>>;
  readonly back: string;
  // Applied to document.documentElement on theme activation. Keys should
  // be CSS variable names (e.g. '--card-bg'). Theme SVGs reference these.
  readonly cssVars: Readonly<Record<string, string>>;
};

// CardBackId picker value: 'theme' = use whichever theme's back is currently
// active; otherwise a specific themeId means "use that theme's back".
export type CardBackId = 'theme' | ThemeId;

export type ThemeRegistryEntry = {
  readonly id: ThemeId;
  readonly name: string;
};
