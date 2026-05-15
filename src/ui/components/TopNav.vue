<script setup lang="ts">
// Slim app-bar at the top of the page. Hybrid pattern: frequent actions
// (New game) are visible buttons; future rare actions (theme, settings)
// land behind a menu icon → drawer.
//
// Live status badge ("AI thinking…", "Your turn", phase) sits inline so
// the player can tell what the game is doing.

import { computed, ref } from 'vue';
import { useGameStore } from '@/ui/stores/game';
import RulesModal from './RulesModal.vue';
import SettingsModal from './SettingsModal.vue';

defineEmits<{ (e: 'new-game'): void }>();

const store = useGameStore();
const rulesOpen = ref(false);
const settingsOpen = ref(false);

const statusLabel = computed(() => {
  if (!store.state) return 'loading…';
  if (store.phase === 'ended') return 'game over';
  if (store.phase === 'awaiting-response') {
    return store.awaiting?.seat === store.humanSeat
      ? 'coup-fourré opportunity'
      : 'AI responding…';
  }
  const youActing = store.actingSeat === store.humanSeat;
  if (store.phase === 'draw') {
    return youActing ? 'drawing…' : 'AI drawing…';
  }
  return youActing ? 'your turn' : 'AI thinking…';
});
</script>

<template>
  <header class="topnav">
    <div class="topnav__brand">Mille Bornes</div>
    <div class="topnav__status">{{ statusLabel }}</div>
    <div class="topnav__actions">
      <button aria-label="How to play" title="How to play" @click="rulesOpen = true">?</button>
      <button @click="$emit('new-game')">New game</button>
      <button aria-label="Settings" title="Settings" @click="settingsOpen = true">☰</button>
    </div>
  </header>
  <RulesModal :open="rulesOpen" @close="rulesOpen = false" />
  <SettingsModal :open="settingsOpen" @close="settingsOpen = false" />
</template>

<style scoped>
.topnav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #181818;
  border-bottom: 1px solid #2a2a2a;
  height: 48px;
  flex-shrink: 0;
}
.topnav__brand {
  font-weight: 700;
  letter-spacing: 0.03em;
}
.topnav__status {
  flex: 1;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  font-variant: small-caps;
  letter-spacing: 0.05em;
}
.topnav__actions {
  display: flex;
  gap: 8px;
}
</style>
