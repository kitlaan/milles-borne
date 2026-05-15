// Helpers for theme modules. Use `import.meta.glob` to pull every card SVG
// in a theme's `cards/` directory without enumerating them by name —
// dropping a new SVG file is enough for it to land in the registry.
//
// Runtime check that all expected CardTypes are present so a missing or
// misnamed file fails loudly at theme-load time rather than silently
// returning `undefined` from a Card render.

import type { CardType } from '@/engine/cards';
import { STANDARD_DECK_COMPOSITION } from '@/engine/deck';

/**
 * Convert a `{ './cards/<card-type>.svg': '<svg...>' }` glob result into a
 * `Record<CardType, string>`. Throws if any required CardType is missing
 * OR if any filename doesn't correspond to a standard CardType (catches
 * typos and stray files that would otherwise silently waste bundle bytes).
 */
export function buildCardsRecord(
  glob: Readonly<Record<string, string>>,
): Record<CardType, string> {
  const expected = new Set<string>(STANDARD_DECK_COMPOSITION.map(([t]) => t));
  const out: Partial<Record<CardType, string>> = {};
  const unknown: string[] = [];
  for (const [path, content] of Object.entries(glob)) {
    const m = path.match(/([^/]+)\.svg$/);
    if (!m) continue;
    const id = m[1]!;
    if (!expected.has(id)) {
      unknown.push(id);
      continue;
    }
    out[id as CardType] = content;
  }
  const missing: string[] = [];
  for (const type of expected) {
    if (!out[type as CardType]) missing.push(type);
  }
  if (missing.length > 0 || unknown.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
    if (unknown.length > 0) parts.push(`unknown: ${unknown.join(', ')}`);
    throw new Error(`Theme cards/*.svg validation failed — ${parts.join('; ')}`);
  }
  return out as Record<CardType, string>;
}
