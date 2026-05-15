<script setup lang="ts">
// Settings drawer. Phase 4a ships theme + card-back pickers. Rules /
// ruleset / AI selectors slot in here in later phases.

import { computed, ref } from 'vue';
import { OPTIONAL_RULE_IDS, RULE_LIBRARY } from '@/engine/rules';
import { useSettings, type ColorMode } from '@/ui/composables/useSettings';
import { themeRegistry } from '@/ui/themes';
import Modal from './Modal.vue';
import ThemeShower from './ThemeShower.vue';

defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const { settings, setTheme, setCardBack, setColorMode, toggleRule } = useSettings();
const themes = themeRegistry();
const showerOpen = ref(false);

const optionalRules = computed(() =>
  OPTIONAL_RULE_IDS.map((id) => {
    const rule = RULE_LIBRARY[id];
    return {
      id,
      version: rule?.version ?? '?',
      enabled: settings.value.enabledRuleIds.includes(id),
    };
  }),
);

const RULE_LABELS: Readonly<Record<string, string>> = {
  'coup-fourre': 'Coup-Fourré',
  'standard-bonuses': 'Hand-end bonuses',
  'memory-mode': 'Memory Mode',
};

function onThemeChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  setTheme(v);
}

function onCardBackChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  setCardBack(v);
}

function onColorModeChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value as ColorMode;
  setColorMode(v);
}
</script>

<template>
  <Modal
    :open="open"
    title="Settings"
    max-width="420px"
    @close="$emit('close')"
  >
    <section class="row">
      <label for="set-theme">Theme</label>
      <div class="control">
        <select
          id="set-theme"
          :value="settings.themeId"
          @change="onThemeChange"
        >
          <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <button
          class="icon-btn"
          aria-label="Preview theme cards"
          title="Preview cards"
          @click="showerOpen = true"
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
        </button>
      </div>
    </section>

    <section class="row">
      <label for="set-back">Card back</label>
      <select
        id="set-back"
        :value="settings.cardBackId"
        @change="onCardBackChange"
      >
        <option value="theme">Use theme default</option>
        <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }} back</option>
      </select>
    </section>

    <section class="row">
      <label for="set-mode">Color mode</label>
      <select
        id="set-mode"
        :value="settings.colorMode"
        @change="onColorModeChange"
      >
        <option value="auto">Auto (follow system)</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </section>

    <section class="rules-section">
      <header class="rules-section__head">
        <span class="label">Optional rules</span>
        <span class="muted">Applies to new games</span>
      </header>
      <label v-for="r in optionalRules" :key="r.id" class="rule-row">
        <input
          type="checkbox"
          :checked="r.enabled"
          @change="toggleRule(r.id)"
        >
        <span>{{ RULE_LABELS[r.id] ?? r.id }}</span>
      </label>
    </section>
  </Modal>
  <ThemeShower :open="showerOpen" @close="showerOpen = false" />
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px;
  align-items: center;
}
.row label, .row .label {
  font-size: var(--font-body);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.row select {
  font: inherit;
  color: inherit;
  background: var(--surface-elev);
  border: 1px solid var(--border);
  padding: var(--pad-control-tight);
  border-radius: var(--radius-sm);
  width: 100%;
}
.control {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
.control select { flex: 1; }
.icon-btn {
  padding: var(--pad-control-tight);
  background: var(--surface-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-heading);
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover { background: var(--hover); }
.icon-btn svg { display: block; }

.rules-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rules-section__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.rules-section__head .muted {
  font-size: var(--font-label);
  color: var(--muted);
  font-style: italic;
}
.rule-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-body);
  cursor: pointer;
}
.rule-row input { cursor: pointer; }
</style>
