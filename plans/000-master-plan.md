# Mille Bornes — Browser Game Design

## Context

Greenfield project. Build a browser-based Mille Bornes implementation (per
[Wikipedia rules](https://en.wikipedia.org/wiki/Mille_Bornes)) as a
client-only TypeScript app. Hosted as static files; no server.

Stated long-term goals: 1P-vs-AI, 2P hot-seat, save/resume, high scores +
stats, pluggable AI engines (including future ML-trained players), mobile +
desktop UI, SVG cards, theming.

Approach: **engine first, then layer features iteratively.** Phase 1 ships a
pure-TS engine, a dumb AI, persistence, and a CLI driver + replay verifier
— no UI. Each later phase adds one capability (UI, hot-seat, variants,
themes, more AI engines, ML pipeline).

The design below resolves architectural decisions that affect multiple phases
(state model, plugin shapes, persistence, determinism). UI choices that only
affect themselves are deferred to their phase.

---

## Stack

- TypeScript
- Vue 3 + Vite (single project; no monorepo / workspaces)
- Pinia for UI state container
- `pure-rand` (xoroshiro128+) for seeded RNG
- `idb-keyval` for IndexedDB persistence
- `tsx` for running CLI scripts
- Vitest for tests
- ESLint with import-restriction rules to police engine purity

---

## Goals & Non-Goals

### Phase 1 (this design)
- Pure-TS engine implementing core Mille Bornes rules + Coup-Fourré
- Pluggable rule modules (two rules upfront to discover hook surface)
- Pluggable AI players via stable async function interface
- IndexedDB persistence: in-progress game + completed game history
- Seeded RNG; deterministic replay from `seed + actionLog`
- CLI driver that plays a complete 2-seat game vs dumb AI
- Replay verifier: load a `GameRecord`, replay, assert final state matches
- Vitest unit tests covering core rules, Coup-Fourré edge cases, replay

### Deferred (later phases)
- Vue UI (single responsive layout)
- Hot-seat 2P with interstitial + manual hide
- SVG card visuals + CSS-variable theming
- Additional AI engines (greedy, MCTS, ML-trained)
- Hand-end bonuses (Safe Trip, Shut-Out, Delayed Action, Extension)
- Match play to 5000 points
- N > 2 seats; teams
- ML data export pipeline
- Mobile-specific gestures, desktop hover affordances

### Non-Goals
- Networked multiplayer
- Account system / cloud sync
- Server-side anything

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                       src/ui/  (Vue)                     │  (Phase 2+)
│  Pinia store → wraps engine, owns hot-seat reveal state  │
└────────────────────────────┬─────────────────────────────┘
                             │ dispatch(action)
┌────────────────────────────▼─────────────────────────────┐
│                  src/engine/  (pure TS)                  │
│  - reduce(state, action) → state                         │
│  - legalActions(state, seat) → Action[]                  │
│  - createInitialState({ seats, ruleIds, seed })          │
│  - rule plugins: { id, version, hooks }                  │
└────────────────────────────┬─────────────────────────────┘
                             │
                  ┌──────────┴───────────┐
                  ▼                      ▼
        ┌──────────────────┐   ┌──────────────────────┐
        │  src/ai/  (TS)   │   │ src/persistence/(TS) │
        │  AIPlayer fn type│   │ idb-keyval wrappers  │
        │  dumb impl       │   │ GameRecord codec     │
        └──────────────────┘   └──────────────────────┘
                  ▲                      ▲
                  └──────────┬───────────┘
                             │
                  ┌──────────┴───────────┐
                  │   src/cli/  (TS)     │
                  │ play.ts, verify.ts   │
                  └──────────────────────┘
```

**Boundary enforcement:** ESLint `no-restricted-imports` in `src/engine/`
forbids imports from `vue`, `vue/*`, `vite`, `vite/*`, `@/ui/*`, plus
ambient impure APIs (`Math.random`, `Date.now`, `crypto.*`, `localStorage`,
`fetch`). Engine is portable to Node, Worker, future server.

---

## Engine Design

### State model

Plain immutable data. `Object.freeze` in dev for fast tripwires; production
can skip freeze for perf. Optional Immer in reducer if mutation syntax
becomes unwieldy.

```typescript
type GameState = {
  readonly phase: 'setup' | 'playing' | 'awaiting-response' | 'ended';
  readonly seats: ReadonlyArray<Seat>;
  readonly deck: ReadonlyArray<Card>;      // ordered, top = index 0
  readonly discard: ReadonlyArray<Card>;
  readonly currentSeat: number;
  readonly awaiting?: {
    seat: number;
    reason: 'coup-fourre-response';
    afterAction: Action;                    // hazard that triggered it
  };
  readonly rng: RngState;                   // serializable PRNG state
  readonly turnNumber: number;
  readonly handNumber: number;
  readonly handStartedAt: number;           // turnNumber when hand started
};

type Seat = {
  readonly id: number;
  readonly hand: ReadonlyArray<Card>;
  readonly tableau: {
    readonly battle: Card | null;           // top of battle pile
    readonly speed: Card | null;            // top of speed pile
    readonly distance: ReadonlyArray<Card>; // accumulated mile cards
    readonly safeties: ReadonlyArray<Card>; // safeties played
  };
  readonly score: number;
};

type Card = {
  readonly id: string;                      // unique within deck, e.g. 'm200-1'
  readonly type: CardType;                  // 'mile-200' | 'hazard-flat-tire' | ...
  readonly category: 'distance' | 'hazard' | 'remedy' | 'safety';
  readonly value?: number;                  // miles, where applicable
};
```

Player-facing view (what AI/UI consume for a given seat):

```typescript
type SeatView = {
  readonly self: Seat;                      // full visibility
  readonly others: ReadonlyArray<           // tableau visible, hand hidden
    Pick<Seat, 'id' | 'tableau' | 'score'> & { handSize: number }
  >;
  readonly discardTop: Card | null;
  readonly deckSize: number;
  readonly phase: GameState['phase'];
  readonly currentSeat: number;
  readonly awaiting?: GameState['awaiting'];
  readonly turnNumber: number;
};

function toSeatView(state: GameState, seat: number): SeatView;
```

### Actions

```typescript
type Action =
  | { type: 'DRAW';       seat: number }
  | { type: 'PLAY';       seat: number; cardId: string; targetSeat?: number }
  | { type: 'DISCARD';    seat: number; cardId: string }
  | { type: 'COUP_FOURRE'; seat: number; safetyCardId: string }
  | { type: 'PASS_COUP_FOURRE'; seat: number };  // decline interrupt
```

### Reducer

```typescript
function reduce(state: GameState, action: Action): GameState;
function legalActions(state: GameState, seat: number): Action[];
function createInitialState(config: {
  seats: number;          // v1: always 2
  ruleIds: string[];      // e.g. ['core', 'coup-fourre']
  seed: number;
}): GameState;
```

Reducer is pure. No I/O, no time queries, no `Math.random`. All randomness
sourced from `state.rng`, which is advanced through state and persisted.

### Rules as plugins — hook surface

Two rules in v1 to discover the hook surface:
- `core`: card validity, draw/play/discard cycle, distance scoring,
  hand-end detection at 700/1000 miles
- `coup-fourre`: interrupts hazard application, applies +300 bonus, cancels
  hazard, grants extra turn to interruptor

```typescript
type RulePlugin = {
  id: string;
  version: string;
  hooks: {
    // Validate an action. Returns 'legal' or rejection reason. Chained:
    // action is legal iff every plugin returns 'legal'.
    validate?(action: Action, state: GameState): 'legal' | { reject: string };

    // After action applied, mutate-in-reducer (via Immer) or return next
    // state. Run in registration order. Core runs first.
    apply?(action: Action, state: GameState): GameState;

    // After a hazard is applied to a seat, plugins may return an
    // InterruptAction shifting control to the victim. First non-null wins.
    onHazardApplied?(hazard: Card, victim: number, state: GameState):
      | { type: 'await-coup-fourre'; seat: number }
      | null;

    // On hand-end, plugins return score adjustments. Aggregated.
    onHandEnd?(state: GameState): ReadonlyArray<{ seat: number; points: number; reason: string }>;
  };
};
```

The reducer iterates registered plugins per phase. v1 only exercises
`validate`, `apply`, `onHazardApplied`, `onHandEnd`. Future hooks
(`onMatchEnd`, `onTurnStart`, etc.) added when match-play / other variants
arrive.

### Engine descriptor (for GameRecord compatibility)

Stored on every `GameRecord`. Used at load time to detect replay drift.

```typescript
type EngineDescriptor = {
  engineVersion: string;   // semver from package.json
  gitCommit: string;       // injected via Vite `define`; 'dev' if no git
  schemaVersion: 1;        // bumps when GameRecord shape changes
  rules: Array<{ id: string; version: string }>;  // sorted by id
};
```

`gitCommit` injection (vite.config.ts):
```typescript
const commit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();
defineConfig({ define: { __GIT_COMMIT__: JSON.stringify(commit) } });
```

For CLI tooling that runs outside Vite, a small helper reads commit via
`child_process` at startup with the same fallback.

---

## AI Plugin Interface

Minimum viable interface — async pure function:

```typescript
type AIPlayer = (
  view: SeatView,
  legal: ReadonlyArray<Action>
) => Promise<Action>;
```

Reasons:
- Async return covers ML inference, Web Worker offload, future networked AI
  without API change. Sync AIs return resolved promises (~free).
- Pure function shape; AI internal state is closure-captured. Lifecycle
  hooks (game start/end, event subscriptions) can be added later as
  *optional, additive* APIs without breaking existing implementations.
- Engine pre-computes `legal`; AI picks one. AI cannot produce illegal
  moves by construction.

Dumb AI (Phase 1):
- If a legal `PLAY` advances distance and is not blocked: play highest-value
  mile card.
- If a legal `PLAY` is a remedy that unblocks battle/speed: play it.
- If a legal `PLAY` is a safety: play it (rare; safeties are usually held).
- Else `DISCARD` lowest-value card in hand.

Future-proof additions (out of scope for Phase 1; documented for direction):
- Stateful AI = closure over mutable state, same function signature outside.
- Event hooks = engine emits `onCardPlayed`, `onHazard`, etc. AI subscribes
  optionally. Existing plain-function AIs continue to work.
- Web Worker AI = wrap a function-shaped AI in a worker; promise resolves
  on `postMessage` reply. Interface unchanged.

---

## Persistence

### Two storage concerns

1. **Resume snapshot** — current in-progress game. One IndexedDB key
   (`currentGame`). Overwritten after every successful action. JSON of full
   `GameState`.
2. **Completed game history** — `GameRecord` per finished game.
   IndexedDB store (`completedGames`). Append-only. Used for stats, high
   scores, ML training data.

```typescript
type GameRecord = {
  schemaVersion: 1;
  engine: EngineDescriptor;
  seed: number;
  playerConfigs: ReadonlyArray<{
    seatId: number;
    kind: 'human' | 'ai';
    aiId?: string;          // 'dumb-v1', etc.
    displayName: string;
  }>;
  actionLog: ReadonlyArray<Action>;
  finalScores: ReadonlyArray<{ seat: number; total: number; breakdown: ScoreEntry[] }>;
  startedAt: string;        // ISO timestamp, recorded by wrapper, not reducer
  endedAt: string;
};
```

`finalScores.breakdown` carries score lines produced by `onHandEnd` hooks
(distance, Coup-Fourré bonuses, etc.) — preserved for stats display.

### Save wiring

The action log is kept by the *wrapper* (Pinia store or CLI driver), not
inside engine state. Engine state has no history — the reducer is pure on
(state, action). The wrapper appends each successful action to its own log,
which becomes the `GameRecord.actionLog` at game-end.

```typescript
// In Pinia store / engine wrapper
const initialState = ref<GameState>(createInitialState({...}));
const state = ref<GameState>(initialState.value);
const actionLog = ref<Action[]>([]);
const seed = ref<number>(/* original seed */);

async function dispatch(action: Action) {
  const next = reduce(state.value, action);          // engine is pure
  state.value = next;
  actionLog.value.push(action);                      // wrapper-owned log
  await db.set('currentGame',
    { state: next, actionLog: actionLog.value, seed: seed.value });
  if (next.phase === 'ended') {
    const record = buildGameRecord({
      seed: seed.value, actionLog: actionLog.value, final: next
    });
    await db.add('completedGames', record);
    await db.del('currentGame');
  }
}
```

On resume: read `currentGame`, restore `state.value`, `actionLog.value`,
`seed.value`. Reducer never needs the log.

Save failures (quota, private mode) log a non-blocking warning. Game
continues in memory; user can manually export later.

### Storage layout

- `currentGame` — single key, `GameState | undefined`
- `completedGames` — keyed by record id (`startedAt` + random suffix)
- `highScores` — derived view computed from `completedGames` on demand;
  cached in `highScoresCache` with last-update timestamp

`idb-keyval` is sufficient; promote to Dexie only if querying becomes
painful (likely never for personal use).

---

## UI (Phase 2 sketch — not built in Phase 1)

### Stack
- Vue 3 SFC
- Pinia store wrapping the engine; `useGameStore()` exposes
  `state, dispatch, viewFor(seat)`.
- Single responsive `<Board>` component using CSS Grid + `clamp()` for card
  sizes.

### Layout

```
grid-template-areas:
  "tableau-top tableau-top"
  "discard     deck"
  "tableau-me  tableau-me"
  "hand        hand";
```

Card size: `clamp(60px, 12vw, 100px)`. Tableaus stack on narrow viewports
without layout change.

### Subcomponents
- `<Card :card :face-up :theme>` — renders SVG via `v-html` from active
  theme, scoped by CSS vars
- `<Pile :cards>` — stacked card pile (distance, safeties, discard)
- `<Hand :cards :reveal>` — local seat's hand; `reveal=false` shows backs
- `<Tableau :seat>` — composes piles for one seat
- `<ScorePanel :seats>` — score, hand number, deck remaining

### Hot-seat reveal logic
- UI-only concept. Engine knows `currentSeat`; UI owns `viewerSeat`.
- After turn ends, UI shows "Pass to Player N — tap when ready"
  interstitial. Tap sets `viewerSeat = currentSeat` and reveals hand.
- Manual "hide my hand" button forces interstitial mid-turn.
- Coup-Fourré: when engine emits `awaiting: { seat, reason: 'coup-fourre-response' }`,
  UI shows interstitial to *that* seat (which may or may not be `currentSeat`).

### Theming

Card SVGs use CSS variables for fills/strokes:
```svg
<svg viewBox="0 0 200 280">
  <rect fill="var(--card-bg)" stroke="var(--card-frame)" .../>
  <g fill="var(--card-icon-hazard)"><!-- icon paths --></g>
</svg>
```

Theme module shape:
```typescript
type Theme = {
  id: string;
  name: string;
  cards: Record<CardType, string>;  // raw SVG strings, ?raw imports
  cssVars: Record<string, string>;
};
```

Theme switch = swap module + set CSS variables on root. SVG composition
techniques available to designers:
1. Inline nesting (`<svg><svg>...</svg></svg>`) — no infra
2. App-wide `<symbol>` sprite referenced via `<use href="#glyph-x"/>` —
   add later if multiple cards share glyphs

---

## Repository Layout

```
package.json
vite.config.ts                   # injects __GIT_COMMIT__
tsconfig.json
.eslintrc.cjs                    # import-restriction rules for src/engine/
vitest.config.ts
src/
  engine/
    state.ts                     # types
    actions.ts                   # action types + helpers
    reducer.ts                   # reduce()
    legal.ts                     # legalActions()
    deck.ts                      # buildDeck(), shuffle (deterministic)
    rng.ts                       # pure-rand wrapper, RngState type
    descriptor.ts                # EngineDescriptor + helpers
    rules/
      index.ts                   # rule registry + types
      core.ts
      coup-fourre.ts
    __tests__/
      reducer.test.ts
      legal.test.ts
      coup-fourre.test.ts
      replay.test.ts
  ai/
    types.ts                     # AIPlayer type
    dumb.ts                      # Phase 1 AI
    __tests__/
      dumb.test.ts
  persistence/
    db.ts                        # idb-keyval wrappers
    records.ts                   # GameRecord codec + buildGameRecord()
    __tests__/
      records.test.ts            # round-trip serialize/deserialize
  cli/
    play.ts                      # `tsx src/cli/play.ts` — runs a game
    verify.ts                    # `tsx src/cli/verify.ts <file>` — replay
    util.ts                      # shared helpers (read commit, fmt cards)
  # (UI added in Phase 2 — out of scope for this design)
  # ui/
  # themes/
  # main.ts
```

---

## ESLint & Purity Guards

`.eslintrc.cjs` overrides for `src/engine/**`:

```javascript
{
  files: ['src/engine/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: ['vue', 'vue/*', 'vite', 'vite/*', '@/ui/*', '@/themes/*']
    }],
    'no-restricted-globals': ['error',
      'Math.random', 'Date', 'localStorage', 'sessionStorage',
      'fetch', 'XMLHttpRequest', 'crypto'
    ],
  }
}
```

Note: `no-restricted-globals` doesn't catch `Math.random()` cleanly. Pair
with `no-restricted-properties` for `Math.random` and `Date.now`
specifically. Spot-check via the replay verifier — non-determinism reveals
itself as replay mismatch.

---

## Phase 1 Verification

Phase 1 is complete when **all** the following are true:

1. `pnpm test` — Vitest passes. Coverage includes:
   - Core actions: deal, draw, play mile, play hazard, play remedy, play
     safety, discard
   - Battle pile resolution: hazard blocks, remedy unblocks, safety
     permanently immunizes
   - Speed pile: limit/end-limit cycle
   - Distance accumulation; hand-end at 700 (no extension); hand-end at 1000
     (engine doesn't auto-extend in v1 — extension is a deferred rule)
   - Coup-Fourré: legal interrupt window, +300 bonus, hazard cancelled,
     interruptor takes extra turn
   - Illegal Coup-Fourré attempts rejected
   - Replay: for each test game played, replaying from `seed + actionLog`
     produces identical final state
2. `pnpm cli:play` — runs a complete 2-seat game vs dumb AI to hand-end,
   prints score, writes `GameRecord` to IndexedDB. (Run under
   `fake-indexeddb` for Node compatibility.)
3. `pnpm cli:verify <record-id>` — reads stored `GameRecord`, replays from
   seed + action log, asserts replayed final state's score breakdown
   matches stored `finalScores`. Exits 0 on success.
4. Lint passes; engine files contain zero impure global references.
5. `pnpm dlx tsc --noEmit` — type-check clean.

---

## Open Questions / Deferred Decisions

- **Card data model**: should each physical card carry a unique `id`, or is
  card identity by type+index sufficient? Decision: unique `id` (e.g.
  `'m200-1'`, `'m200-2'`). Cleaner for action references and animations.
- **N > 2 seats / teams**: engine accepts `seats: number`. v1 only tests
  N=2. Team grouping is a separate concept (Team = set of seats) deferred
  until needed. Score breakdown already per-seat, so team total = sum.
- **Variant naming convention for rule plugins**: `id` is a string. No
  versioning collision strategy yet (e.g., what if two plugins both claim
  `'extension'`?). Defer until second-variant author exists.
- **Coup-Fourré timing window**: spec allows it only before victim's next
  draw. Engine implements via `awaiting` phase; UI/AI given window to
  respond. Window does NOT time out in v1 (no real-time pressure); decide
  later for competitive modes.
- **ML data export format**: `GameRecord` is the source-of-truth dataset
  entry. Export pipeline (e.g., bulk JSON dump, JSONL stream, training
  set/test split) deferred to ML phase.
- **Card SVG asset authoring**: who draws them? Until decided, Phase 2 ships
  with placeholder typography-only "cards" (`<div>`-based, no SVG); SVG
  theme is its own sub-phase.
- **`__GIT_COMMIT__` for CLI**: CLI runs under `tsx`, not Vite. CLI helper
  reads commit via `child_process` at startup. Engine itself accepts the
  commit string as a config param so it stays portable.

---

## Working Method

The master plan (this document) is **immutable reference material once
approved.** It is copied verbatim into `./plans/000-master-plan.md` in the
repo. Future changes to scope, architecture, or phases are recorded as
**ADRs** in `./plans/` rather than by mutating the master plan. Rationale:
the master plan captures *initial* context and decisions; ADRs capture
*evolution* with their own context. Editing the master in place loses the
"why we changed" trail.

ADR naming: `./plans/NNN-<slug>.md`, monotonic numeric prefix
(`001-add-extension-rule.md`, `002-switch-to-monorepo.md`, ...). Each ADR:
status (proposed/accepted/superseded), context, decision, consequences,
links to any ADRs it supersedes.

First action on plan approval: create `./plans/` and write this document
to `./plans/000-master-plan.md`.

---

## Phasing (proposed; orthogonal to Phase 1 design)

| Phase | Adds                                                        |
|-------|-------------------------------------------------------------|
| 1     | Engine + dumb AI + persistence + CLI + replay verifier      |
| 2     | Vue UI, single responsive layout, solo-vs-dumb-AI playable  |
| 3     | Hot-seat 2P (interstitial + manual hide)                    |
| 4     | SVG cards + CSS-variable theming; first real theme          |
| 5     | Second AI engine (greedy or heuristic); UI to pick AI       |
| 6     | Hand-end bonuses + Extension as rule plugins                |
| 7     | Match play to 5000 as rule plugin                           |
| 8     | ML data export tool + first ML-trained AI prototype         |

User confirms phase order at each transition; not committed up-front.
