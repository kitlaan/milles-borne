// Theme registry. New themes append themselves here once authored.
//
// Order in `ALL_THEMES` is the order users see in the picker. The first
// entry is the default theme used when no setting is persisted.

import { classicTheme } from './classic';
import { minimalTheme } from './minimal';
import type { Theme, ThemeId, ThemeRegistryEntry } from './types';

export * from './types';

// Order in this array is the order users see in the picker. The first
// entry is the default theme used when no setting is persisted.
export const ALL_THEMES: ReadonlyArray<Theme> = Object.freeze([
  classicTheme,
  minimalTheme,
]);

export const DEFAULT_THEME_ID: ThemeId = classicTheme.id;

export function getTheme(id: ThemeId): Theme | undefined {
  return ALL_THEMES.find((t) => t.id === id);
}

export function themeOrDefault(id: ThemeId | null | undefined): Theme {
  if (id) {
    const t = getTheme(id);
    if (t) return t;
  }
  return ALL_THEMES[0]!;
}

export function themeRegistry(): ReadonlyArray<ThemeRegistryEntry> {
  return ALL_THEMES.map((t) => ({ id: t.id, name: t.name }));
}
