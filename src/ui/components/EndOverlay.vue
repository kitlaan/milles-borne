<script setup lang="ts">
// Game-end overlay. Shows winner, per-seat score breakdown, and a "New
// game" button that clears state + creates a fresh seed.
//
// Not dismissible by backdrop — the game has ended, the only action is to
// start a new game (or leave the page).

import { computed } from 'vue';
import { defaultRules } from '@/engine/rules';
import { computeScores } from '@/engine/score';
import { useGameStore } from '@/ui/stores/game';
import Modal from './Modal.vue';

const store = useGameStore();
const rules = defaultRules();

const open = computed(() => store.phase === 'ended');

const winnerLabel = computed(() => {
  if (!store.state) return '';
  const w = store.state.winnerSeat;
  if (w === null) return 'Stalemate (deck exhausted)';
  if (w === store.humanSeat) return 'You win!';
  return `${store.configFor(w)?.displayName ?? `Seat ${w}`} wins`;
});

const scores = computed(() => (store.state ? computeScores(store.state, rules) : []));

async function newGame(): Promise<void> {
  await store.newGame();
}
</script>

<template>
  <Modal
    :open="open"
    :title="winnerLabel"
    :dismissible="false"
    :close-on-backdrop="false"
    :z-index="90"
    max-width="520px"
  >
    <div v-for="s in scores" :key="s.seat" class="score-block">
      <header>
        <span class="name">{{ store.configFor(s.seat)?.displayName ?? `Seat ${s.seat}` }}</span>
        <span class="total">{{ s.total }} pts</span>
      </header>
      <ul>
        <li v-for="(entry, i) in s.breakdown" :key="i">
          <span class="pts">+{{ entry.points }}</span>
          <span class="muted">{{ entry.reason }}</span>
        </li>
      </ul>
    </div>
    <button class="primary" @click="newGame">New game</button>
  </Modal>
</template>

<style scoped>
.score-block {
  background: #181818;
  border: 1px solid #2a2a2a;
  padding: 8px 12px;
  border-radius: 6px;
}
.score-block header {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 4px;
}
.score-block ul {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}
.score-block li {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  align-items: baseline;
}
.score-block .pts {
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.muted { color: var(--muted); }
.primary {
  background: var(--color-mileage);
  border-color: var(--color-mileage);
  color: white;
  font-weight: 600;
  margin-top: 4px;
}
</style>
