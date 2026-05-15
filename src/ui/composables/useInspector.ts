// Module-level singleton state for the "inspect this pile" modal.
// Any Pile in the tree calls `open(...)`; PileInspector watches the value
// and renders the modal. Single source of truth; no provide/inject ceremony.

import { ref } from 'vue';
import type { Card } from '@/engine/cards';

type InspectTarget = {
  readonly cards: ReadonlyArray<Card>;
  readonly label: string;
};

const inspecting = ref<InspectTarget | null>(null);

export function useInspector() {
  return {
    inspecting,
    open(cards: ReadonlyArray<Card>, label: string): void {
      if (cards.length === 0) return;
      inspecting.value = { cards, label };
    },
    close(): void {
      inspecting.value = null;
    },
  };
}
