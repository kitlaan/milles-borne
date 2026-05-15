<script setup lang="ts">
// Placeholder card visual: typography + category-color border. SVG art
// arrives in phase 4; this component is the swap point. Props are stable
// across themes, so phase 4 can change `:style`/template without touching
// callers.

import { computed } from 'vue';
import type { Card } from '@/engine/cards';
import { mileValueOf } from '@/engine/cards';

const props = withDefaults(
  defineProps<{
    card: Card | null;
    faceUp?: boolean;
    legal?: boolean;
    selected?: boolean;
  }>(),
  { faceUp: true, legal: false, selected: false },
);

defineEmits<{ (e: 'click'): void }>();

const isFaceUp = computed(() => props.card !== null && props.faceUp);

const label = computed(() => {
  const c = props.card;
  if (!c) return '';
  const v = mileValueOf(c.type);
  if (v !== null) return `${v}`;
  // Strip the `<category>-` prefix from the type for compact display.
  return c.type.replace(/^[^-]+-/, '').replace(/-/g, ' ');
});

const sublabel = computed(() => {
  const c = props.card;
  if (!c) return '';
  return c.category;
});

const categoryClass = computed(() =>
  props.card ? `card--${props.card.category}` : null,
);
</script>

<template>
  <button
    type="button"
    class="card"
    :class="[categoryClass, { 'card--legal': legal, 'card--selected': selected, 'card--down': !isFaceUp }]"
    @click="$emit('click')"
  >
    <template v-if="isFaceUp">
      <div class="card__label">{{ label }}</div>
      <div class="card__sublabel">{{ sublabel }}</div>
    </template>
    <template v-else>
      <div class="card__back">MB</div>
    </template>
  </button>
</template>

<style scoped>
.card {
  width: clamp(56px, 10vw, 92px);
  aspect-ratio: 5 / 7;
  border-radius: var(--card-radius);
  background: var(--card-bg);
  color: var(--card-fg);
  border: 2px solid var(--card-frame);
  padding: 6px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  font-size: clamp(11px, 1.6vw, 14px);
  line-height: 1.15;
  cursor: default;
  user-select: none;
  transition: transform 80ms ease-out;
}

.card--mileage { border-color: var(--color-mileage); }
.card--hazard  { border-color: var(--color-hazard); }
.card--remedy  { border-color: var(--color-remedy); }
.card--safety  { border-color: var(--color-safety); }

/* Legal cards in Hand are marked by a bright yellow outline + a small
   permanent lift so they "stick out" from the row. Hover adds extra lift.
   The Hand component sets a gap wide enough that adjacent outlines don't
   overlap. */
.card--legal {
  cursor: pointer;
  outline: 2px solid #ffd84a;
  outline-offset: 3px;
  transform: translateY(-3px);
}
.card--legal:hover {
  transform: translateY(-8px);
}

.card--selected {
  outline: 3px solid var(--color-safety);
  outline-offset: 4px;
  transform: translateY(-8px);
}

.card--down {
  background: linear-gradient(135deg, #2a2a2a, #444);
  color: #999;
  border-color: #555;
}

.card__label {
  font-weight: 700;
  font-size: clamp(14px, 2.4vw, 22px);
  text-transform: capitalize;
  text-align: center;
}

.card__sublabel {
  text-transform: uppercase;
  font-size: 0.7em;
  opacity: 0.65;
  letter-spacing: 0.05em;
}

.card__back {
  font-weight: 800;
  letter-spacing: 0.1em;
}
</style>
