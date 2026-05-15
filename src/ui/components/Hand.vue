<script setup lang="ts">
// Active seat's hand. Rows the cards horizontally. When face-down, shows
// card backs (count comes from the prop array length).
//
// `legalCardIds` is the set of card ids for which at least one PLAY action
// is currently legal. Cards in that set are highlighted as clickable.
// Click on any card emits 'card-click' with the card id; the parent decides
// what to do (auto-play, enter targeting mode for hazards, etc).

import type { Card } from '@/engine/cards';
import CardComponent from './Card.vue';

withDefaults(
  defineProps<{
    cards: ReadonlyArray<Card>;
    faceUp?: boolean;
    legalCardIds?: ReadonlyArray<string>;
    selectedCardId?: string | null;
  }>(),
  { faceUp: true, legalCardIds: () => [], selectedCardId: null },
);

defineEmits<{ (e: 'card-click', cardId: string): void }>();
</script>

<template>
  <div class="hand">
    <CardComponent
      v-for="card in cards"
      :key="card.id"
      :card="card"
      :face-up="faceUp"
      :legal="legalCardIds.includes(card.id)"
      :selected="selectedCardId === card.id"
      @click="$emit('card-click', card.id)"
    />
  </div>
</template>

<style scoped>
.hand {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: center;
  /* Extra top padding leaves room for lifted/hovered legal cards
     (transform: translateY up to -8px) without clipping. */
  padding: 16px 8px 8px;
}
</style>
