# ADR 001 — PlayerConfig as discriminated union

**Status:** accepted
**Date:** 2026-05-15
**Supersedes:** none

## Context

The initial Phase 1 implementation defined `PlayerConfig` with `aiId` and
`aiVersion` as optional siblings:

```typescript
type PlayerConfig = {
  seatId: number;
  kind: 'human' | 'ai';
  displayName: string;
  aiId?: string;
  aiVersion?: string;
};
```

Two issues surfaced during code review:

1. The type does not enforce that `aiId`/`aiVersion` are present iff
   `kind === 'ai'`. A human config could carry stray AI fields, or an AI
   config could omit them, and TypeScript would not catch it.
2. As AI metadata grows (e.g., model weights hash, training timestamp,
   inference config hash for ML-trained AIs), the top-level shape would
   keep accreting optional siblings, mixing human-relevant and AI-relevant
   fields.

## Decision

Refactor `PlayerConfig` into a discriminated union with a nested `ai`
sub-object on the `'ai'` branch:

```typescript
type AIDescriptor = {
  id: string;
  version: string;
};

type PlayerConfig =
  | { seatId: number; kind: 'human'; displayName: string }
  | { seatId: number; kind: 'ai'; displayName: string; ai: AIDescriptor };
```

The `ai` sub-object is the only growth surface for AI metadata; human
configs remain narrow.

Schema version stays at `1`. No real GameRecords have been written outside
test runs at this point, so no migration is required. Once production
records exist, future shape changes will bump `schemaVersion` and ship a
loader migration.

## Consequences

- TypeScript narrows `config.ai` only inside `if (config.kind === 'ai')`
  blocks; the invariant is now type-enforced.
- Future AI metadata (model hash, weights ref, etc.) lives under `ai` and
  does not pollute human configs.
- One-time refactor of CLI play construction and tests; no runtime change
  to engine behavior.

## Touched files

- `src/persistence/records.ts` — type
- `src/cli/play.ts` — construction
- `src/persistence/__tests__/records.test.ts` — fixture
