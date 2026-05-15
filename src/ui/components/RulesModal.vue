<script setup lang="ts">
// Lightweight help / about modal. Shows a Mille Bornes quick-rules
// summary, the active rule plugins, and the active AI configs.

import { computed } from 'vue';
import { defaultRules } from '@/engine/rules';
import { useGameStore } from '@/ui/stores/game';
import Modal from './Modal.vue';

defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const store = useGameStore();
const rules = defaultRules();

const ruleNotes: Readonly<Record<string, string>> = {
  core: 'Core Mille Bornes mechanics: dealing, draw/play/discard, battle/speed pile resolution, distance scoring (1pt/km), per-safety score (100pt), 1000-km target.',
  'coup-fourre': 'If a hazard is played against you and you hold the matching safety, you may interrupt to cancel the hazard and earn +300 at hand-end.',
};

const activeRules = computed(() => rules);
const playerConfigs = computed(() => store.playerConfigs);
</script>

<template>
  <Modal
    :open="open"
    title="How to play"
    :z-index="80"
    @close="$emit('close')"
  >
    <section class="block">
      <h3>The race</h3>
      <p>
        Each player drives toward 1000 km. Build distance by playing mile
        cards (25/50/75/100/200) onto your tableau. The first to exactly
        1000 km wins the hand.
      </p>
    </section>

    <section class="block">
      <h3>Turn flow</h3>
      <ul>
        <li>Draw 1 card.</li>
        <li>Play 1 card <em>or</em> discard 1 card.</li>
        <li>Turn passes to the next player.</li>
      </ul>
    </section>

    <section class="block">
      <h3>Card types</h3>
      <ul>
        <li><strong>Mileage</strong> (25/50/75/100/200): advances your distance. You must be Rolling. Max two 200-mile cards per hand.</li>
        <li><strong>Roll</strong>: lets you start driving, or resume after a Stop / non-Speed hazard.</li>
        <li><strong>Hazards</strong> (Stop, Speed Limit, Out of Gas, Flat Tire, Accident): played against an opponent. Stop / Out of Gas / Flat Tire / Accident require the target be Rolling.</li>
        <li><strong>Remedies</strong> (Roll, End of Limit, Gasoline, Spare Tire, Repairs): clear a matching hazard from your tableau.</li>
        <li><strong>Safeties</strong> (Right of Way, Driving Ace, Extra Tank, Puncture-Proof): permanent immunity. +100 each.</li>
      </ul>
    </section>

    <section class="block">
      <h3>Speed Limit</h3>
      <p>While Speed Limit is on your speed pile, you can only play 25- and 50-mile cards. End of Limit clears it.</p>
    </section>

    <section class="block">
      <h3>Coup-Fourré</h3>
      <p>
        If a hazard is played against you and you hold its matching safety,
        you may play the safety as a Coup-Fourré: the hazard is cancelled,
        you bank a +300 bonus, and you take the next turn.
      </p>
    </section>

    <section class="block">
      <h3>Active rules</h3>
      <ul>
        <li v-for="r in activeRules" :key="r.id">
          <strong>{{ r.id }}</strong> v{{ r.version }} —
          <span class="muted">{{ ruleNotes[r.id] ?? '(no description)' }}</span>
        </li>
      </ul>
    </section>

    <section class="block">
      <h3>Players</h3>
      <ul>
        <li v-for="p in playerConfigs" :key="p.seatId">
          Seat {{ p.seatId }}: <strong>{{ p.displayName }}</strong>
          <span v-if="p.kind === 'ai'" class="muted"> — AI {{ p.ai.id }} v{{ p.ai.version }}</span>
        </li>
      </ul>
    </section>
  </Modal>
</template>

<style scoped>
.block h3 {
  margin: 0 0 4px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.block p, .block ul { margin: 0; }
.block ul { padding-left: 18px; }
.block li { margin-bottom: 4px; }
.muted { color: var(--muted); }
</style>
