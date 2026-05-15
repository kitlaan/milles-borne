<script setup lang="ts">
// Top-level game board: opponent tableau, deck/discard center strip, own
// tableau, own hand. CSS Grid with `grid-template-areas` rearranges
// gracefully on narrow viewports.
//
// Phase 2 interactions land here:
//   - Hand card click → if a single legal PLAY exists (mile/remedy/safety),
//     dispatch it. If the card is a hazard, enter targeting mode.
//   - Discard select + button next to the hand → dispatch DISCARD.
//   - Click opponent tableau while targeting → dispatch PLAY with targetSeat.
//   - Coup-Fourré modal handles awaiting-response (own component).
//   - Game-end overlay handles `phase === 'ended'`.

import { computed, ref } from 'vue';
import type { Action } from '@/engine/actions';
import { legalActions } from '@/engine/legal';
import { useGameStore } from '@/ui/stores/game';
import CoupFourreModal from './CoupFourreModal.vue';
import EndOverlay from './EndOverlay.vue';
import Hand from './Hand.vue';
import Pile from './Pile.vue';
import PileInspector from './PileInspector.vue';
import ScorePanel from './ScorePanel.vue';
import Tableau from './Tableau.vue';

const store = useGameStore();

const targetingCardId = ref<string | null>(null);

const legalForHuman = computed<Action[]>(() => {
  if (!store.state) return [];
  if (store.actingSeat !== store.humanSeat) return [];
  return legalActions(store.state, store.humanSeat, store.activeRules);
});

// All card ids in hand for which any PLAY action is legal (regardless of
// target). Used to highlight which cards the human can play.
const legalCardIds = computed<string[]>(() => {
  const ids = new Set<string>();
  for (const a of legalForHuman.value) {
    if (a.type === 'PLAY') ids.add(a.cardId);
  }
  return [...ids];
});

// Tableaus that are legal hazard targets *for the currently selected hazard*.
const targetableSeats = computed<Set<number>>(() => {
  const set = new Set<number>();
  if (!targetingCardId.value) return set;
  for (const a of legalForHuman.value) {
    if (a.type === 'PLAY' && a.cardId === targetingCardId.value && a.targetSeat !== undefined) {
      set.add(a.targetSeat);
    }
  }
  return set;
});

const humanSeatObj = computed(() =>
  store.state ? store.state.seats[store.humanSeat] : null,
);
const opponentSeats = computed(() =>
  store.state ? store.state.seats.filter((s) => s.id !== store.humanSeat) : [],
);

const isHumanActing = computed(
  () => store.actingSeat === store.humanSeat && store.phase === 'action',
);

async function handleCardClick(cardId: string): Promise<void> {
  if (!isHumanActing.value) return;
  // If we were already targeting and the same card was clicked again, cancel.
  if (targetingCardId.value === cardId) {
    targetingCardId.value = null;
    return;
  }
  // Find legal PLAY actions for this card.
  const plays = legalForHuman.value.filter(
    (a): a is Action & { type: 'PLAY' } => a.type === 'PLAY' && a.cardId === cardId,
  );
  if (plays.length === 0) return; // illegal, ignore
  if (plays.length === 1 && plays[0]!.targetSeat === undefined) {
    // Single legal play, no target needed — dispatch immediately.
    await store.dispatch(plays[0]!);
    return;
  }
  // Multiple plays (hazard with several possible targets) → enter targeting.
  targetingCardId.value = cardId;
}

async function handleDiscard(cardId: string): Promise<void> {
  if (!isHumanActing.value) return;
  await store.dispatch({ seat: store.humanSeat, type: 'DISCARD', cardId });
}

async function handleTarget(seatId: number): Promise<void> {
  if (!targetingCardId.value) return;
  const play = legalForHuman.value.find(
    (a) => a.type === 'PLAY' && a.cardId === targetingCardId.value && a.targetSeat === seatId,
  );
  if (!play) return;
  targetingCardId.value = null;
  await store.dispatch(play);
}

// Discard UX is a small select+button next to the hand. Real right-click
// affordance is on the wishlist; visible control is more obvious for
// phase-2 placeholder.
const discardChoice = ref<string>('');
async function discardSelected(): Promise<void> {
  if (!discardChoice.value) return;
  await handleDiscard(discardChoice.value);
  discardChoice.value = '';
}
</script>

<template>
  <div v-if="store.state" class="board">
    <section class="board__opponents">
      <Tableau
        v-for="opp in opponentSeats"
        :key="opp.id"
        :seat="opp"
        :label="store.configFor(opp.id)?.displayName ?? `Seat ${opp.id}`"
        :targetable="targetableSeats.has(opp.id)"
        @target="handleTarget(opp.id)"
      />
    </section>

    <section class="board__center">
      <ScorePanel :state="store.state" />
      <!-- Deck is face-down and inspecting it would leak draw order.
           Uses a tighter peek + more visible cards since the stack isn't
           interactable and just signals "deck still has cards". -->
      <Pile
        :cards="store.state.deck"
        :face-up="false"
        :inspectable="false"
        :visible-stack="5"
        :peek-px="4"
        label="Deck"
        empty="—"
      />
      <!-- Memory-mode rule (if active) suppresses the inspector AND
           collapses the peek stack to a single top card so neither the
           most recent N nor the full pile is browsable. -->
      <Pile
        :cards="store.state.discard"
        :inspectable="!store.hasRule('memory-mode')"
        :visible-stack="store.hasRule('memory-mode') ? 1 : 3"
        label="Discard"
        empty="—"
      />
    </section>


    <section v-if="humanSeatObj" class="board__me">
      <Tableau
        :seat="humanSeatObj"
        :label="store.configFor(store.humanSeat)?.displayName ?? 'You'"
      />
      <div class="hand-row">
        <Hand
          :cards="humanSeatObj.hand"
          :legal-card-ids="legalCardIds"
          :selected-card-id="targetingCardId"
          @card-click="handleCardClick"
        />
        <!-- Hint slot reserves a fixed minimum height so the page doesn't
             bounce when phase swaps between targeting / discard / idle. -->
        <div class="hint-slot">
          <div v-if="targetingCardId" class="targeting-hint">
            Click an opponent's tableau to target.
            <button @click="targetingCardId = null">Cancel</button>
          </div>
          <div v-else-if="isHumanActing" class="discard-hint">
            <span class="muted">Click a glowing card to play. Or:</span>
            <select v-model="discardChoice" class="discard-select">
              <option value="" disabled>Discard…</option>
              <option v-for="c in humanSeatObj.hand" :key="c.id" :value="c.id">{{ c.type }}</option>
            </select>
            <button :disabled="!discardChoice" @click="discardSelected">Discard</button>
          </div>
        </div>
      </div>
    </section>

    <CoupFourreModal />
    <EndOverlay />
    <PileInspector />
  </div>
  <div v-else class="board board--loading">Loading…</div>
</template>

<style scoped>
.board {
  display: grid;
  grid-template-areas:
    'opponents'
    'center'
    'me';
  grid-template-columns: 1fr;
  gap: 12px;
  padding: var(--pad-section);
  flex: 1;
}

.board__opponents { grid-area: opponents; display: flex; flex-direction: column; gap: 8px; }
.board__center {
  grid-area: center;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.board__me { grid-area: me; display: flex; flex-direction: column; gap: 8px; }

.hand-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.hint-slot {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.targeting-hint, .discard-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-body);
}

.muted { color: var(--muted); }

.discard-select {
  font: inherit;
  color: inherit;
  background: var(--surface-elev);
  border: 1px solid var(--border);
  padding: var(--pad-control-tight);
  border-radius: var(--radius-sm);
}

.board--loading {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
</style>
