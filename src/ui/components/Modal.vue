<script setup lang="ts">
// Shared modal frame: full-viewport scrim + centered panel + optional
// dismiss header. Consumers focus on content (default slot) and supply
// their own h2 / close logic when they want non-standard headers.
//
// Z-index is a CSS value — defaults to `var(--z-modal)`; specific overlays
// pass another `var(--z-*)` token from base.css. The hierarchy
// (coup-fourré > end > preview > inspector > modal) lives in base.css.

withDefaults(
  defineProps<{
    open: boolean;
    /** Header text. If omitted, no header is rendered. */
    title?: string;
    /** Show an "×" close button in the header. Default true. */
    dismissible?: boolean;
    /** Click on the backdrop closes the modal. Default true. */
    closeOnBackdrop?: boolean;
    /** CSS z-index value. Pass e.g. 'var(--z-interrupt)'. */
    zIndex?: string;
    /** Override max-width on the panel. */
    maxWidth?: string;
  }>(),
  {
    dismissible: true,
    closeOnBackdrop: true,
    zIndex: 'var(--z-modal)',
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
  background: var(--backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--pad-modal-edge);
  overflow: auto;
}
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--pad-modal);
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
  /* 24px is the icon glyph size (one-off, larger than --font-heading);
     horizontal padding gives the × a comfortable hit area. */
  font-size: 24px;
  line-height: 1;
  padding: 0 8px;
  cursor: pointer;
  color: var(--muted);
}
.modal__close:hover { color: var(--fg); }
</style>
