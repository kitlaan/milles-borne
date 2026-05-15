<script setup lang="ts">
// Compact score / status display for the current hand. Sits in the center
// "river" row alongside the deck and discard.

import { computed } from 'vue';
import { defaultRules } from '@/engine/rules';
import { computeScores } from '@/engine/score';
import type { GameState } from '@/engine/state';

const props = defineProps<{
  state: GameState;
}>();

const rules = defaultRules();

const scores = computed(() => computeScores(props.state, rules));
</script>

<template>
  <aside class="score-panel">
    <span class="label">Target</span>
    <span class="value">{{ state.target }}</span>
    <span class="label">Hand #</span>
    <span class="value">{{ state.handNumber }}</span>
    <span class="label">Turn</span>
    <span class="value">{{ state.turnNumber }}</span>
    <span class="label">Deck</span>
    <span class="value">{{ state.deck.length }}</span>
    <template v-for="s in scores" :key="s.seat">
      <span class="label">Seat {{ s.seat }} pts</span>
      <span class="value">{{ s.total }}</span>
    </template>
  </aside>
</template>

<style scoped>
.score-panel {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 12px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #1e1e1e;
  font-size: 13px;
  align-content: start;
  min-width: 0;
}

.label {
  color: var(--muted);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.05em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value {
  font-family: ui-monospace, SFMono-Regular, monospace;
  text-align: right;
  white-space: nowrap;
}
</style>
