// Theme registry. New themes append themselves here once authored.
//
// Order in `ALL_THEMES` is the order users see in the picker. The first
// entry is the default theme used when no setting is persisted.

import { bootstrapTheme } from './bootstrap';
import { classicTheme } from './classic';
import type { Theme, ThemeId, ThemeRegistryEntry } from './types';

export * from './types';

export const ALL_THEMES: ReadonlyArray<Theme> = Object.freeze([
  classicTheme,
  bootstrapTheme,
  // Real themes land here in phase 4b/4c.
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
