<script setup lang="ts">
// Pile inspection modal. Listens to the inspector singleton; when set,
// renders the pile's cards in oldest-to-newest order so the player can
// trace what's happened.

import { computed } from 'vue';
import { useInspector } from '@/ui/composables/useInspector';
import CardComponent from './Card.vue';
import Modal from './Modal.vue';

const { inspecting, close } = useInspector();

const title = computed(() => {
  const it = inspecting.value;
  if (!it) return '';
  return `${it.label} (${it.cards.length})`;
});
</script>

<template>
  <Modal
    :open="inspecting !== null"
    :title="title"
    z-index="var(--z-inspector)"
    max-width="720px"
    @close="close"
  >
    <p v-if="inspecting" class="muted">oldest → newest</p>
    <div v-if="inspecting" class="grid">
      <CardComponent
        v-for="card in inspecting.cards"
        :key="card.id"
        :card="card"
      />
    </div>
  </Modal>
</template>

<style scoped>
.muted { color: var(--muted); font-size: var(--font-body); }
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
</style>
