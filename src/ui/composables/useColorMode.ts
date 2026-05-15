// Map the persisted color-mode setting onto the document's `color-scheme`.
// CSS handles the rest via `light-dark()` — no matchMedia listener needed,
// the browser flips the picked value automatically when the user changes
// their OS preference (assuming color-scheme is `light dark`).
//
//   'auto'  → color-scheme: light dark     (CSS rule; remove inline override)
//   'light' → color-scheme: only light     (force light branch)
//   'dark'  → color-scheme: only dark      (force dark branch)

import type { ColorMode } from './useSettings';

export function applyColorMode(mode: ColorMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'auto') {
    root.style.removeProperty('color-scheme');
  } else {
    root.style.colorScheme = `only ${mode}`;
  }
}
