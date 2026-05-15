<script setup lang="ts">
// Theme preview / developer aid. Shows every card type in the active theme
// plus the card back, grouped by category, so the author can scan the full
// deck at a glance while iterating on art.

import { computed } from 'vue';
import type { CardCategory } from '@/engine/cards';
import { STANDARD_DECK_COMPOSITION } from '@/engine/deck';
import { categoryOf } from '@/engine/cards';
import { useTheme } from '@/ui/composables/useTheme';
import Modal from './Modal.vue';

defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const { activeTheme, resolvedBack } = useTheme();

type Group = {
  category: CardCategory;
  cards: Array<{ type: string; svg: string }>;
};

const ORDER: CardCategory[] = ['mileage', 'remedy', 'hazard', 'safety'];

const groups = computed<Group[]>(() => {
  const buckets: Record<CardCategory, Group['cards']> = {
    mileage: [],
    hazard: [],
    remedy: [],
    safety: [],
  };
  for (const [type] of STANDARD_DECK_COMPOSITION) {
    const cat = categoryOf(type);
    buckets[cat].push({ type, svg: activeTheme.value.cards[type] });
  }
  return ORDER.map((category) => ({ category, cards: buckets[category] }));
});
</script>

<template>
  <Modal
    :open="open"
    :title="`Theme preview: ${activeTheme.name}`"
    z-index="var(--z-preview)"
    max-width="900px"
    @close="$emit('close')"
  >
    <section v-for="g in groups" :key="g.category" class="group">
      <h3>{{ g.category }}</h3>
      <div class="grid">
        <figure v-for="c in g.cards" :key="c.type" class="cell">
          <!-- eslint-disable-next-line vue/no-v-html -- internal SVG, not user-supplied -->
          <div class="cell__art" v-html="c.svg" />
          <figcaption>{{ c.type }}</figcaption>
        </figure>
      </div>
    </section>
    <section class="group">
      <h3>Card back</h3>
      <div class="grid">
        <figure class="cell">
          <!-- eslint-disable-next-line vue/no-v-html -- internal SVG, not user-supplied -->
          <div class="cell__art" v-html="resolvedBack" />
          <figcaption>back</figcaption>
        </figure>
      </div>
    </section>
  </Modal>
</template>

<style scoped>
.group h3 {
  margin: 0 0 8px;
  font-size: var(--font-heading);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 16px;
}
.cell {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 140px;
}
.cell__art {
  width: 100px;
  aspect-ratio: 5 / 7;
}
.cell__art :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
.cell figcaption {
  font-size: var(--font-label);
  color: var(--muted);
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, monospace;
  /* Wrap only at hyphens (the natural separator in card ids) rather than
     mid-word, so longer ids like "safety-puncture-proof" break cleanly. */
  overflow-wrap: anywhere;
  word-break: keep-all;
  line-height: 1.3;
}
</style>
