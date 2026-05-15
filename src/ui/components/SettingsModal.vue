<script setup lang="ts">
// Settings drawer. Phase 4a ships theme + card-back pickers. Rules /
// ruleset / AI selectors slot in here in later phases.

import { useSettings } from '@/ui/composables/useSettings';
import { themeRegistry } from '@/ui/themes';
import Modal from './Modal.vue';

defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const { settings, setTheme, setCardBack } = useSettings();
const themes = themeRegistry();

function onThemeChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  setTheme(v);
}

function onCardBackChange(e: Event): void {
  const v = (e.target as HTMLSelectElement).value;
  setCardBack(v);
}
</script>

<template>
  <Modal
    :open="open"
    title="Settings"
    :z-index="80"
    max-width="420px"
    @close="$emit('close')"
  >
    <section class="row">
      <label for="set-theme">Theme</label>
      <select
        id="set-theme"
        :value="settings.themeId"
        @change="onThemeChange"
      >
        <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
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
  </Modal>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px;
  align-items: center;
}
.row label {
  font-size: 13px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.row select {
  font: inherit;
  color: inherit;
  background: #2a2a2a;
  border: 1px solid #444;
  padding: 4px 8px;
  border-radius: 4px;
}
</style>
