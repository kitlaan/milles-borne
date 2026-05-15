// Active theme derived from settings + helper to resolve the card back.
//
// The composable is pure — it doesn't touch the DOM. Applying the theme's
// CSS variables to documentElement is App.vue's responsibility (a single
// watchEffect at the root) so the side-effect runs exactly once per app
// instance regardless of how many components call useTheme.

import { computed } from 'vue';
import { getTheme, themeOrDefault } from '@/ui/themes';
import { useSettings } from './useSettings';

export function useTheme() {
  const { settings } = useSettings();

  const activeTheme = computed(() => themeOrDefault(settings.value.themeId));

  const resolvedBack = computed(() => {
    const bid = settings.value.cardBackId;
    if (bid === 'theme') return activeTheme.value.back;
    const fromTheme = getTheme(bid);
    return fromTheme?.back ?? activeTheme.value.back;
  });

  return { activeTheme, resolvedBack };
}

// Helper called by App.vue to apply a theme's CSS variables to the document
// root. Safe to call repeatedly — newer keys overwrite older. Keys not
// present in the new map persist (themes within this project use the same
// key set, so leakage hasn't been a concern yet).
export function applyThemeVars(vars: Readonly<Record<string, string>>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}
