<script setup lang="ts">
// One seat's tableau: battle / speed piles + distance accumulator + played
// safeties. Click on tableau (when `targetable` is set) emits 'target' so
// the parent can dispatch a hazard PLAY at this seat.

import { computed } from 'vue';
import type { Seat } from '@/engine/state';
import { sumDistance } from '@/engine/tableau-query';
import Pile from './Pile.vue';

const props = defineProps<{
  seat: Seat;
  label: string;
  /** Whether this tableau is a legal hazard target for the current selection. */
  targetable?: boolean;
}>();

defineEmits<{ (e: 'target'): void }>();

const totalDistance = computed(() => sumDistance(props.seat));
const safetyCards = computed(() => props.seat.tableau.safeties.map((s) => s.card));
</script>

<template>
  <section
    class="tableau"
    :class="{ 'tableau--targetable': targetable }"
    @click="targetable && $emit('target')"
  >
    <header class="tableau__header">
      <span class="tableau__label">{{ label }}</span>
      <span class="tableau__distance">{{ totalDistance }} km</span>
    </header>
    <div class="tableau__piles">
      <Pile :cards="seat.tableau.battle" label="Battle" empty="Roll?" />
      <Pile :cards="seat.tableau.speed" label="Speed" empty="—" />
      <Pile :cards="seat.tableau.distance" label="Distance" empty="0" />
      <Pile :cards="safetyCards" label="Safeties" empty="—" />
    </div>
  </section>
</template>

<style scoped>
.tableau {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--pad-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.tableau--targetable {
  cursor: pointer;
  outline: 2px dashed var(--color-hazard);
  outline-offset: 2px;
}

.tableau__header {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-body);
  color: var(--muted);
}

.tableau__label {
  font-weight: 600;
  color: var(--fg);
}

.tableau__distance {
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.tableau__piles {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
