<script setup lang="ts">
// Shared modal frame: full-viewport scrim + centered panel + optional
// dismiss header. Consumers focus on content (default slot) and supply
// their own h2 / close logic when they want non-standard headers.
//
// Z-index is configurable because we have a hierarchy of overlays
// (coup-fourré > end > inspector > rules) so an overlay opened mid-game
// stacks correctly above any pre-existing one.

withDefaults(
  defineProps<{
    open: boolean;
    /** Header text. If omitted, no header is rendered. */
    title?: string;
    /** Show an "×" close button in the header. Default true. */
    dismissible?: boolean;
    /** Click on the backdrop closes the modal. Default true. */
    closeOnBackdrop?: boolean;
    /** Override z-index; defaults to 80. */
    zIndex?: number;
    /** Override max-width on the panel. */
    maxWidth?: string;
  }>(),
  {
    dismissible: true,
    closeOnBackdrop: true,
    zIndex: 80,
    title: undefined,
    maxWidth: undefined,
  },
);

defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <div
    v-if="open"
    class="modal-backdrop"
    :style="{ zIndex }"
    @click.self="closeOnBackdrop && $emit('close')"
  >
    <div class="modal" :style="maxWidth ? { maxWidth } : {}">
      <header v-if="title || dismissible" class="modal__head">
        <h2 v-if="title">{{ title }}</h2>
        <button
          v-if="dismissible"
          class="modal__close"
          aria-label="Close"
          @click="$emit('close')"
        >
          ×
        </button>
      </header>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
}
.modal {
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 10px;
  padding: 20px 24px;
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal__head h2 { margin: 0; }
.modal__close {
  background: transparent;
  border: none;
  font-size: 24px;
  line-height: 1;
  padding: 0 6px;
  cursor: pointer;
  color: var(--muted);
}
.modal__close:hover { color: var(--fg); }
</style>
