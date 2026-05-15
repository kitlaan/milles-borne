<script setup lang="ts">
// Settings drawer. Phase 4a ships theme + card-back pickers. Rules /
// ruleset / AI selectors slot in here in later phases.

import { ref } from 'vue';
import { useSettings } from '@/ui/composables/useSettings';
import { themeRegistry } from '@/ui/themes';
import Modal from './Modal.vue';
import ThemeShower from './ThemeShower.vue';

defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const { settings, setTheme, setCardBack } = useSettings();
const themes = themeRegistry();
const showerOpen = ref(false);

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
  width: 100%;
}
.control {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
.control select { flex: 1; }
.icon-btn {
  padding: 4px 10px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover { background: #333; }
.icon-btn svg { display: block; }
</style>
