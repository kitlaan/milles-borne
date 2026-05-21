# ADR 002 — Drop `Card.value`; derive from type

**Status:** accepted
**Date:** 2026-05-15
**Supersedes:** none
**Related:** [ADR 001](./001-player-config-discriminated-union.md)

## Context

`Card` initially carried both `type` and `value`:

```typescript
type Card = {
  id: string;
  type: CardType;          // e.g., 'mile-100', 'hazard-stop'
  category: CardCategory;
  value?: MileValue;       // present only for mileage cards
};
```

`value` was a sibling optional dependent on `category` — the same anti-pattern
ADR 001 addressed for `PlayerConfig`. Worse here: `value` was fully derivable
from `type` (`mileValueOf('mile-100') === 100`), so it was denormalized
data carried alongside its own source of truth.

Failure modes the type allowed:
- Mileage card constructed without `value`
- Non-mileage card constructed with `value`
- Mileage card with `value` not matching `type` (drift)

## Decision

Drop the `value` field from `Card`. All access goes through
`mileValueOf(card.type)`. Test fixtures, deck builder, CLI helper, and AI
discard heuristic were updated accordingly.

`category` remains on `Card` as a denormalized convenience: it is also
derivable from `type` via `categoryOf()`, but `switch (card.category)`
reads better than repeated string-prefix checks. Drift risk is mitigated
in practice because the only constructors (`buildDeck`, test helpers)
compute `category` from `type` directly. If drift becomes a real concern,
a future ADR can drop `category` too.

## Consequences

- `Card` is one field smaller; serialized records are slightly smaller.
- Every `card.value` read becomes `mileValueOf(card.type)`. Tiny
  ergonomic regression; outweighed by no-drift guarantee.
- `category` retained pragmatically — re-evaluate if it becomes a drift
  source.

## Touched files

- `src/engine/cards.ts` — type
- `src/engine/deck.ts` — buildDeck construction
- `src/engine/__tests__/deck.test.ts` — assertions
- `src/engine/__tests__/reducer.test.ts` — makeCard fixture
- `src/engine/__tests__/coup-fourre.test.ts` — makeCard fixture
- `src/cli/play.ts` — sumDistance helper
