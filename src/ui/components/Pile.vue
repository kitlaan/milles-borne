<script setup lang="ts">
// Stack of cards in a tableau region (battle / speed / discard / distance /
// safeties). Renders the cards layered with a small vertical offset so
// the bottom edge of underlying cards peeks out, like a real card stack.

import { computed } from 'vue';
import type { Card } from '@/engine/cards';
import { useInspector } from '@/ui/composables/useInspector';
import CardComponent from './Card.vue';

const props = withDefaults(
  defineProps<{
    cards: ReadonlyArray<Card>;
    label?: string;
    empty?: string;
    faceUp?: boolean;
    /** Highlight when this pile is a legal hazard target. */
    targetable?: boolean;
    /** Max number of cards to render in the visible stack. Rest summarized by count. */
    visibleStack?: number;
    /** Vertical pixels between stacked peeking cards. Smaller for face-down decks. */
    peekPx?: number;
    /**
     * Whether clicking opens the pile inspector. Disable for face-down
     * stacks (deck) where inspecting would leak the draw order.
     */
    inspectable?: boolean;
  }>(),
  {
    label: '',
    empty: '—',
    faceUp: true,
    targetable: false,
    visibleStack: 3,
    peekPx: 14,
    inspectable: true,
  },
);

const inspector = useInspector();

function handleClick(): void {
  // Hazard-targeting clicks are handled at the Tableau level (the click
  // bubbles up; Tableau intercepts when its `targetable` flag is set).
  // Here we only handle the inspect affordance.
  if (props.inspectable && props.cards.length > 0) {
    inspector.open(props.cards, props.label || 'Pile');
  }
}

// Top-N slice of the pile, oldest first → newest last. Renders with vertical
// offset so older cards' bottom edges peek below the newest. Stack height
// is bounded by `visibleStack`; anything beyond is summarized by the count
// badge.
const visibleCards = computed(() => {
  const n = props.cards.length;
  if (n === 0) return [];
  const take = Math.min(props.visibleStack, n);
  return props.cards.slice(n - take);
});

// Max peek offset (in px) for the *top* of the stack — used to budget the
// stack's CSS height so the pile doesn't bleed into neighbors.
const maxPeekPx = computed(() => (props.visibleStack - 1) * props.peekPx);
</script>

<template>
  <div
    class="pile"
    :class="{
      'pile--empty': cards.length === 0,
      'pile--targetable': targetable,
      'pile--inspectable': inspectable && cards.length > 0,
    }"
    @click="handleClick"
  >
    <div v-if="label" class="pile__label">{{ label }}</div>
    <div class="pile__stack" :style="{ '--max-peek': `${maxPeekPx}px` }">
      <template v-if="visibleCards.length > 0">
        <!-- Newest sits at top: 0; older cards are pushed downward by their
             peek offset so their bottom edges cascade out below the newest.
             Click the pile to open the inspector modal for the full ordered
             list. Hovering an underlying peek card raises its z-index so its
             full face is revealed without motion. -->
        <CardComponent
          v-for="(card, i) in visibleCards"
          :key="card.id"
          :card="card"
          :face-up="faceUp"
          class="pile__card"
          :style="{ '--peek-offset': `${(visibleCards.length - 1 - i) * peekPx}px` }"
        />
      </template>
      <div v-else class="pile__placeholder">{{ empty }}</div>
    </div>
    <div v-if="cards.length > 1" class="pile__count">{{ cards.length }}</div>
  </div>
</template>

<style scoped>
.pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--pad-panel);
  border-radius: var(--radius-md);
  min-width: 80px;
}

.pile--targetable {
  cursor: pointer;
  outline: 2px dashed var(--color-hazard);
  outline-offset: 4px;
}

/* `zoom-in` (magnifier) reads as "inspect/see" — semantically distinct
   from the pointer hand which signals "click to do something". The pile
   only opens a viewer; we want the cursor to reflect that. */
.pile--inspectable {
  cursor: zoom-in;
}

.pile__label {
  text-transform: uppercase;
  font-size: var(--font-label);
  letter-spacing: 0.08em;
  color: var(--muted);
}

.pile__stack {
  position: relative;
  width: clamp(56px, 10vw, 92px);
  /* Card aspect (5/7 of width) + per-instance --max-peek (passed via style). */
  height: calc(clamp(56px, 10vw, 92px) * 7 / 5 + var(--max-peek, 28px));
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.pile__card {
  position: absolute;
  /* Newest sits at top: 0; older cards are pushed *down* by their peek
     offset so their bottom edges cascade out below the newest. */
  top: var(--peek-offset, 0);
  left: 50%;
  transform: translateX(-50%);
}

/* Hovering a peek card pulls it forward in z-stack — no motion, just
   stacking order change — so the older card's full face is revealed
   (the newer card that was covering it now sits behind). Only applies to
   inspectable piles; face-down stacks like the deck stay inert. */
.pile--inspectable .pile__card {
  cursor: zoom-in;
}
.pile--inspectable .pile__card:hover {
  z-index: var(--z-pile-hover);
}

.pile__placeholder {
  width: 100%;
  height: 100%;
  border: 1px dashed var(--border);
  border-radius: var(--card-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 0.85em;
  aspect-ratio: 5 / 7;
}

.pile__count {
  font-size: var(--font-label);
  color: var(--muted);
}
</style>
