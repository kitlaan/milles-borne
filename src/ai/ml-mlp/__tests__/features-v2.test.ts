import { describe, expect, it } from 'vitest';
import type { Card } from '@/engine/cards';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import { encodeFeatures, FEATURE_DIM } from '../features';
import { encodeFeaturesV2, FEATURE_DIM_V2, FEATURE_LAYOUT_V2 } from '../features-v2';

const rules = defaultRules();

function freshView() {
  const state = createInitialState({ seats: 2, rules, seed: 1 });
  return toSeatView(state, 0);
}

describe('features-v2', () => {
  it('exposes FEATURE_DIM_V2 = 63', () => {
    expect(FEATURE_DIM_V2).toBe(63);
  });

  it('produces a vector of length FEATURE_DIM_V2', () => {
    const f = encodeFeaturesV2(freshView());
    expect(f).toHaveLength(FEATURE_DIM_V2);
  });

  it('first FEATURE_DIM dims match v1 exactly (backwards-compat prefix)', () => {
    const view = freshView();
    const v1 = encodeFeatures(view);
    const v2 = encodeFeaturesV2(view);
    expect(v1).toHaveLength(FEATURE_DIM);
    for (let i = 0; i < FEATURE_DIM; i++) {
      expect(v2[i]).toBeCloseTo(v1[i]!, 12);
    }
  });

  it('selfMinusOppDistance is 0 on initial state and stays in [-1, 1]', () => {
    const f = encodeFeaturesV2(freshView());
    const v = f[FEATURE_LAYOUT_V2.selfMinusOppDistance.offset]!;
    expect(v).toBe(0);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('deckRemainingByCategory entries are non-negative and bounded', () => {
    const f = encodeFeaturesV2(freshView());
    const base = FEATURE_LAYOUT_V2.deckRemainingByCategory.offset;
    const width = FEATURE_LAYOUT_V2.deckRemainingByCategory.width;
    for (let i = 0; i < width; i++) {
      expect(f[base + i]).toBeGreaterThanOrEqual(0);
      expect(f[base + i]).toBeLessThanOrEqual(1);
    }
  });

  it('oppVulnerableToHazard is all-1 when opponent has no safeties', () => {
    const f = encodeFeaturesV2(freshView());
    const base = FEATURE_LAYOUT_V2.oppVulnerableToHazard.offset;
    const width = FEATURE_LAYOUT_V2.oppVulnerableToHazard.width;
    for (let i = 0; i < width; i++) {
      expect(f[base + i]).toBe(1);
    }
  });

  it('oppVulnerableToHazard reflects opponent safeties when present', () => {
    // Synthesize a view where opponent holds Right-of-Way + Driving-Ace.
    // Right-of-Way immunizes stop AND speed-limit (per HAZARD_TO_SAFETY);
    // Driving-Ace immunizes accident. So flags should be:
    //   stop=0, speed-limit=0, out-of-gas=1, flat-tire=1, accident=0
    const rofw: Card = { id: 'rofw-1', type: 'safety-right-of-way', category: 'safety' };
    const ace: Card = { id: 'ace-1', type: 'safety-driving-ace', category: 'safety' };
    const view = freshView();
    const modifiedView = {
      ...view,
      others: [
        {
          ...view.others[0]!,
          tableau: {
            ...view.others[0]!.tableau,
            safeties: [
              { card: rofw, coupFourre: false },
              { card: ace, coupFourre: false },
            ],
          },
        },
      ],
    };
    const f = encodeFeaturesV2(modifiedView);
    const base = FEATURE_LAYOUT_V2.oppVulnerableToHazard.offset;
    // HAZARD_TYPES_ORDER = ['stop','speed-limit','out-of-gas','flat-tire','accident']
    expect(f[base + 0]).toBe(0); // stop covered by right-of-way
    expect(f[base + 1]).toBe(0); // speed-limit covered by right-of-way
    expect(f[base + 2]).toBe(1); // out-of-gas not covered
    expect(f[base + 3]).toBe(1); // flat-tire not covered
    expect(f[base + 4]).toBe(0); // accident covered by driving-ace
  });
});
