import { describe, expect, it } from 'vitest';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import {
  CARD_TYPES,
  CATEGORIES_ORDER,
  DECK_MAX,
  DISTANCE_TARGET,
  FEATURE_DIM,
  FEATURE_LAYOUT,
  HAND_MAX,
  HAZARD_TYPES_ORDER,
  PHASES_ORDER,
  SAFETY_TYPES_ORDER,
  encodeFeatures,
} from '../features';

describe('mlp features', () => {
  const rules = defaultRules();

  it('FEATURE_DIM equals sum of section widths', () => {
    const sum = Object.values(FEATURE_LAYOUT).reduce((a, s) => a + s.width, 0);
    expect(sum).toBe(FEATURE_DIM);
  });

  it('layout sections do not overlap', () => {
    const sections = Object.entries(FEATURE_LAYOUT);
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const a = sections[i]![1];
        const b = sections[j]![1];
        const disjoint = a.offset + a.width <= b.offset || b.offset + b.width <= a.offset;
        expect(disjoint, `${sections[i]![0]} overlaps ${sections[j]![0]}`).toBe(true);
      }
    }
  });

  it('returns an array of length FEATURE_DIM', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const view = toSeatView(state, 0);
    expect(encodeFeatures(view)).toHaveLength(FEATURE_DIM);
  });

  it('is deterministic for the same view', () => {
    const state = createInitialState({ seats: 2, rules, seed: 7 });
    const view = toSeatView(state, 0);
    expect(encodeFeatures(view)).toEqual(encodeFeatures(view));
  });

  it('produces finite, plausibly-bounded values', () => {
    for (const seed of [1, 7, 42, 99, 2024]) {
      const state = createInitialState({ seats: 2, rules, seed });
      const view = toSeatView(state, 0);
      for (const v of encodeFeatures(view)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        // Hand counts allow modest >1 since HAND_MAX may be exceeded if a
        // player held many duplicates briefly. Keep an upper sanity bound.
        expect(v).toBeLessThanOrEqual(2);
      }
    }
  });

  it('encodes initial deal as draw-phase, no hazards, no safeties, distance 0', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const view = toSeatView(state, 0);
    const f = encodeFeatures(view);

    // phase one-hot: initial phase is 'draw'
    const phaseIdx = PHASES_ORDER.indexOf('draw');
    for (let i = 0; i < FEATURE_LAYOUT.phase.width; i++) {
      expect(f[FEATURE_LAYOUT.phase.offset + i]).toBe(i === phaseIdx ? 1 : 0);
    }

    // no hazards on either side
    for (let i = 0; i < FEATURE_LAYOUT.selfHazard.width; i++) {
      expect(f[FEATURE_LAYOUT.selfHazard.offset + i]).toBe(0);
    }
    for (let i = 0; i < FEATURE_LAYOUT.oppHazard.width; i++) {
      expect(f[FEATURE_LAYOUT.oppHazard.offset + i]).toBe(0);
    }

    // no safeties on either side
    for (let i = 0; i < FEATURE_LAYOUT.selfSafeties.width; i++) {
      expect(f[FEATURE_LAYOUT.selfSafeties.offset + i]).toBe(0);
    }
    for (let i = 0; i < FEATURE_LAYOUT.oppSafeties.width; i++) {
      expect(f[FEATURE_LAYOUT.oppSafeties.offset + i]).toBe(0);
    }

    // distance zero, not rolling, not limited (empty piles)
    expect(f[FEATURE_LAYOUT.selfDistance.offset]).toBe(0);
    expect(f[FEATURE_LAYOUT.oppDistance.offset]).toBe(0);
    expect(f[FEATURE_LAYOUT.selfRolling.offset]).toBe(0);
    expect(f[FEATURE_LAYOUT.selfLimited.offset]).toBe(0);
    expect(f[FEATURE_LAYOUT.oppRolling.offset]).toBe(0);
    expect(f[FEATURE_LAYOUT.oppLimited.offset]).toBe(0);

    // opp hand size = STARTING_HAND_SIZE / HAND_MAX
    expect(f[FEATURE_LAYOUT.oppHandSize.offset]).toBeCloseTo(view.others[0]!.handSize / HAND_MAX, 6);

    // deck size = (full deck - dealt) / DECK_MAX
    expect(f[FEATURE_LAYOUT.deckSize.offset]).toBeCloseTo(view.deckSize / DECK_MAX, 6);

    // discard top empty: all category bits zero
    for (let i = 0; i < FEATURE_LAYOUT.discardCategory.width; i++) {
      expect(f[FEATURE_LAYOUT.discardCategory.offset + i]).toBe(0);
    }
  });

  it('self hand counts sum to hand size / HAND_MAX', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const view = toSeatView(state, 0);
    const f = encodeFeatures(view);
    let total = 0;
    for (let i = 0; i < CARD_TYPES.length; i++) {
      total += f[FEATURE_LAYOUT.selfHand.offset + i]!;
    }
    expect(total).toBeCloseTo(view.self.hand.length / HAND_MAX, 5);
  });

  it('throws for non-2-seat views', () => {
    const state = createInitialState({ seats: 2, rules, seed: 1 });
    const view = toSeatView(state, 0);
    const tooMany = { ...view, others: [...view.others, view.others[0]!] };
    expect(() => encodeFeatures(tooMany)).toThrow(/2-seat/);
    const tooFew = { ...view, others: [] };
    expect(() => encodeFeatures(tooFew)).toThrow(/2-seat/);
  });

  // Drift trips: bump these intentionally + retrain when CARD_TYPES grows.
  it('FEATURE_DIM is the expected pinned value', () => {
    expect(FEATURE_DIM).toBe(53);
  });

  it('pinned enum lengths match expected counts', () => {
    expect(CARD_TYPES).toHaveLength(19);
    expect(HAZARD_TYPES_ORDER).toHaveLength(5);
    expect(SAFETY_TYPES_ORDER).toHaveLength(4);
    expect(PHASES_ORDER).toHaveLength(4);
    expect(CATEGORIES_ORDER).toHaveLength(4);
  });

  it('DISTANCE_TARGET matches engine default', () => {
    expect(DISTANCE_TARGET).toBe(1000);
  });

  it('DECK_MAX is the standard Mille Bornes deck size', () => {
    expect(DECK_MAX).toBe(78);
  });
});
