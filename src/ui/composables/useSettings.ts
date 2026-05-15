// User-level settings persisted in localStorage. Read synchronously at
// module-init so the initial render uses the chosen theme without flash.
// Writes are async via a `watch` side-effect.
//
// Schema versioned for forward compatibility — bump `schemaVersion` and add
// a migration when new required fields land.

import { ref, watch } from 'vue';
import { DEFAULT_THEME_ID } from '@/ui/themes';
import type { CardBackId, ThemeId } from '@/ui/themes/types';

const STORAGE_KEY = 'mille-bornes-settings';

export type ColorMode = 'light' | 'dark' | 'auto';

export type Settings = {
  readonly schemaVersion: 1;
  readonly themeId: ThemeId;
  readonly cardBackId: CardBackId;
  readonly colorMode: ColorMode;
};

function defaults(): Settings {
  return {
    schemaVersion: 1,
    themeId: DEFAULT_THEME_ID,
    cardBackId: 'theme',
    colorMode: 'auto',
  };
}

function loadInitial(): Settings {
  if (typeof localStorage === 'undefined') return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.schemaVersion !== 1) return defaults();
    return {
      schemaVersion: 1,
      themeId: parsed.themeId ?? DEFAULT_THEME_ID,
      cardBackId: parsed.cardBackId ?? 'theme',
      colorMode: parsed.colorMode ?? 'auto',
    };
  } catch {
    return defaults();
  }
}

// Module-level singleton ref. All callers see the same value.
const settings = ref<Settings>(loadInitial());

// Persist on change. Non-blocking; failures (quota / private mode) log but
// don't disrupt the UI.
watch(
  settings,
  (s) => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (err) {
      console.warn('[settings] persist failed:', err);
    }
  },
  { deep: true },
);

export function useSettings() {
  return {
    settings,
    setTheme(id: ThemeId): void {
      settings.value = { ...settings.value, themeId: id };
    },
    setCardBack(id: CardBackId): void {
      settings.value = { ...settings.value, cardBackId: id };
    },
    setColorMode(mode: ColorMode): void {
      settings.value = { ...settings.value, colorMode: mode };
    },
    resetToDefaults(): void {
      settings.value = defaults();
    },
  };
}

// Test helper: clears localStorage and resets the in-memory ref. Used by
// the round-trip test so it doesn't observe state from prior runs.
export function resetSettingsForTesting(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  settings.value = defaults();
}
