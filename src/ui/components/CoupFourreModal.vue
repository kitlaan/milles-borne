<script setup lang="ts">
// Modal that pops over the board when phase === 'awaiting-response' and the
// awaiting seat is the human. Shows the incoming hazard, lists matching
// safety cards in hand as buttons, plus a PASS button.
//
// Not dismissible: the human must respond (COUP_FOURRE or PASS) before the
// game advances. Highest z-index so it stacks above any other overlay that
// might be open when the interrupt fires.
//
// AI awaiting-response is handled silently by useTurnDriver.

import { computed } from 'vue';
import type { Action } from '@/engine/actions';
import { legalActions } from '@/engine/legal';
import { useGameStore } from '@/ui/stores/game';
import Modal from './Modal.vue';

const store = useGameStore();

const open = computed(
  () =>
    store.phase === 'awaiting-response' &&
    store.awaiting !== null &&
    store.awaiting.seat === store.humanSeat,
);

const hazardLabel = computed(() => {
  const haz = store.awaiting?.hazard;
  if (!haz) return '';
  return haz.type.replace(/^hazard-/, '').replace(/-/g, ' ');
});

const attackerName = computed(() => {
  const a = store.awaiting?.attacker;
  if (a === undefined) return 'Opponent';
  return store.configFor(a)?.displayName ?? `Seat ${a}`;
});

const legal = computed<Action[]>(() => {
  if (!store.state || !open.value) return [];
  return legalActions(store.state, store.humanSeat, store.activeRules);
});

const safetyChoices = computed(() =>
  legal.value.filter(
    (a): a is Action & { type: 'COUP_FOURRE' } => a.type === 'COUP_FOURRE',
  ),
);

function safetyLabel(cardId: string): string {
  const seat = store.state?.seats[store.humanSeat];
  const card = seat?.hand.find((c) => c.id === cardId);
  if (!card) return cardId;
  return card.type.replace(/^safety-/, '').replace(/-/g, ' ');
}

async function playCF(action: Action): Promise<void> {
  await store.dispatch(action);
}

async function pass(): Promise<void> {
  await store.dispatch({ seat: store.humanSeat, type: 'PASS_COUP_FOURRE' });
}
</script>

<template>
  <Modal
    :open="open"
    title="Coup-Fourré opportunity"
    :dismissible="false"
    :close-on-backdrop="false"
    z-index="var(--z-interrupt)"
    max-width="480px"
  >
    <p>
      <strong>{{ attackerName }}</strong> played
      <strong>{{ hazardLabel }}</strong> on you.
    </p>
    <p class="muted">
      Play a matching safety to cancel it (+300 bonus + next turn), or pass.
    </p>
    <div class="actions">
      <button
        v-for="choice in safetyChoices"
        :key="choice.safetyCardId"
        class="primary"
        @click="playCF(choice)"
      >
        Play {{ safetyLabel(choice.safetyCardId) }}
      </button>
      <button @click="pass">Pass</button>
    </div>
  </Modal>
</template>

<style scoped>
.muted { color: var(--muted); font-size: var(--font-body); }
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.primary {
  background: var(--color-safety);
  border-color: var(--color-safety);
  color: var(--on-safety);
  font-weight: 600;
  text-transform: capitalize;
}
.primary:hover { background: var(--color-safety-hover); }
</style>
