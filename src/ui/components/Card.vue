<script setup lang="ts">
// Card renders the active theme's SVG for the given card type (or the
// resolved back SVG when face-down). Container handles legality outline +
// lift; the SVG inside the button owns the frame, fill, and any glyphs.
//
// Themes inject CSS variables (e.g. `--card-bg`, `--color-mileage`) at the
// document root; SVG content references them via `var(--*)` so palette
// swaps happen at runtime without re-rendering this component.

import { computed } from 'vue';
import type { Card } from '@/engine/cards';
import { useTheme } from '@/ui/composables/useTheme';

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

const { activeTheme, resolvedBack } = useTheme();

const isFaceUp = computed(() => props.card !== null && props.faceUp);

const svgContent = computed(() => {
  if (!isFaceUp.value) return resolvedBack.value;
  const c = props.card;
  if (!c) return '';
  return activeTheme.value.cards[c.type] ?? '';
});
</script>

<template>
  <button
    type="button"
    class="card"
    :class="{ 'card--legal': legal, 'card--selected': selected, 'card--down': !isFaceUp }"
    @click="$emit('click')"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- SVG content is internal (theme modules), never user-supplied. -->
    <span class="card__inner" v-html="svgContent" />
  </button>
</template>

<style scoped>
.card {
  width: clamp(56px, 10vw, 92px);
  aspect-ratio: 5 / 7;
  background: transparent;
  border: none;
  padding: 0;
  cursor: default;
  user-select: none;
  transition: transform 80ms ease-out;
  display: block;
}

.card__inner {
  display: block;
  width: 100%;
  height: 100%;
}

/* Inner SVG fills the button; pointer events ignore SVG internals so the
   whole card reacts to clicks/hovers uniformly. */
.card__inner :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}

/* Legal cards in Hand are marked by a bright yellow outline + a small
   permanent lift so they "stick out" from the row. Hover adds extra lift.
   The Hand component sets a gap wide enough that adjacent outlines don't
   overlap. */
.card--legal {
  cursor: pointer;
  outline: 2px solid #ffd84a;
  outline-offset: 3px;
  transform: translateY(-3px);
  border-radius: var(--card-radius);
}
.card--legal:hover {
  transform: translateY(-8px);
}

.card--selected {
  outline: 3px solid var(--color-safety);
  outline-offset: 4px;
  transform: translateY(-8px);
  border-radius: var(--card-radius);
}
</style>
