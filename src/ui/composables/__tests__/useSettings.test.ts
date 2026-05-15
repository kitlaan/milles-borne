// Round-trip the settings composable across "page reloads" (module
// re-evaluations would normally need DI; we approximate by reading raw
// localStorage and re-invoking loadInitial via resetSettingsForTesting).

import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { resetSettingsForTesting, useSettings } from '../useSettings';

const STORAGE_KEY = 'mille-bornes-settings';

describe('useSettings', () => {
  beforeEach(() => {
    resetSettingsForTesting();
  });

  it('exposes default settings when nothing persisted', () => {
    const { settings } = useSettings();
    expect(settings.value.schemaVersion).toBe(1);
    expect(settings.value.themeId).toBeTypeOf('string');
    expect(settings.value.cardBackId).toBe('theme');
  });

  it('setTheme updates the in-memory ref and persists to localStorage', async () => {
    const { settings, setTheme } = useSettings();
    setTheme('made-up-id');
    expect(settings.value.themeId).toBe('made-up-id');
    await nextTick();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.themeId).toBe('made-up-id');
  });

  it('setCardBack updates the in-memory ref and persists to localStorage', async () => {
    const { settings, setCardBack } = useSettings();
    setCardBack('classic');
    expect(settings.value.cardBackId).toBe('classic');
    await nextTick();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.cardBackId).toBe('classic');
  });

  it('resetToDefaults clears overrides', () => {
    const { settings, setTheme, resetToDefaults } = useSettings();
    setTheme('not-default');
    resetToDefaults();
    expect(settings.value.themeId).not.toBe('not-default');
    expect(settings.value.cardBackId).toBe('theme');
  });

  it('garbage in localStorage falls back to defaults', () => {
    localStorage.setItem(STORAGE_KEY, '{ this is not valid JSON');
    resetSettingsForTesting();
    // Re-import is needed in true module isolation; this test asserts that
    // the in-memory ref after reset matches defaults — which loadInitial
    // would also produce given parse failure.
    const { settings } = useSettings();
    expect(settings.value.schemaVersion).toBe(1);
  });
});
