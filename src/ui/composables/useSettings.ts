// User-level settings persisted in localStorage. Read synchronously at
// module-init so the initial render uses the chosen theme without flash.
// Writes are async via a `watch` side-effect.
//
// Schema versioned for forward compatibility — bump `schemaVersion` and add
// a migration when new required fields land.

import { ref, watch } from 'vue';
import { AI_LIBRARY, DEFAULT_AI_ID } from '@/ai';
import { OPTIONAL_RULE_IDS } from '@/engine/rules';
import { DEFAULT_THEME_ID } from '@/ui/themes';
import type { CardBackId, ThemeId } from '@/ui/themes/types';

const STORAGE_KEY = 'mille-bornes-settings';

export type ColorMode = 'light' | 'dark' | 'auto';

export type Settings = {
  readonly schemaVersion: 1;
  readonly themeId: ThemeId;
  readonly cardBackId: CardBackId;
  readonly colorMode: ColorMode;
  /** Optional rule plugin ids the user has opted in. Core rules are
   *  always active and are not represented here. */
  readonly enabledRuleIds: ReadonlyArray<string>;
  /** AI player id used for non-human seats in solo mode. */
  readonly aiId: string;
};

function defaultEnabledRuleIds(): ReadonlyArray<string> {
  // Default to the standard Mille Bornes experience: coup-fourré + the
  // hand-end bonuses. Memory-mode and other house variants are off by
  // default.
  return ['coup-fourre', 'standard-bonuses'];
}

function defaults(): Settings {
  return {
    schemaVersion: 1,
    themeId: DEFAULT_THEME_ID,
    cardBackId: 'theme',
    colorMode: 'auto',
    enabledRuleIds: defaultEnabledRuleIds(),
    aiId: DEFAULT_AI_ID,
  };
}

function sanitizeAiId(id: string | undefined): string {
  if (id && AI_LIBRARY[id]) return id;
  return DEFAULT_AI_ID;
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
      enabledRuleIds: sanitizeEnabledRuleIds(parsed.enabledRuleIds),
      aiId: sanitizeAiId(parsed.aiId),
    };
  } catch {
    return defaults();
  }
}

// Drop any ids that no longer exist in the OPTIONAL_RULE_IDS registry —
// e.g., a rule plugin removed in a later engine version.
function sanitizeEnabledRuleIds(
  raw: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
  if (!raw) return defaultEnabledRuleIds();
  const known = new Set<string>(OPTIONAL_RULE_IDS);
  return raw.filter((id) => known.has(id));
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
    setAiId(id: string): void {
      settings.value = { ...settings.value, aiId: sanitizeAiId(id) };
    },
    setEnabledRuleIds(ids: ReadonlyArray<string>): void {
      settings.value = {
        ...settings.value,
        enabledRuleIds: sanitizeEnabledRuleIds(ids),
      };
    },
    toggleRule(id: string): void {
      const cur = new Set(settings.value.enabledRuleIds);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      settings.value = {
        ...settings.value,
        enabledRuleIds: sanitizeEnabledRuleIds([...cur]),
      };
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
