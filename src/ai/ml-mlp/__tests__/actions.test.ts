import { describe, expect, it } from 'vitest';
import type { Action } from '@/engine/actions';
import type { Card } from '@/engine/cards';
import { legalActions } from '@/engine/legal';
import { defaultRules } from '@/engine/rules';
import { createInitialState } from '@/engine/setup';
import { toSeatView } from '@/engine/view';
import {
  ACTION_VOCAB_LAYOUT,
  ACTION_VOCAB_SIZE,
  decodeActionFromSlot,
  encodeActionSlot,
  legalActionMask,
} from '../actions';
import { CARD_TYPES } from '../features';

const rules = defaultRules();

describe('action vocab', () => {
  it('ACTION_VOCAB_SIZE equals 2*nCardTypes + 3', () => {
    expect(ACTION_VOCAB_SIZE).toBe(2 * CARD_TYPES.length + 3);
    expect(ACTION_VOCAB_SIZE).toBe(41);
  });

  it('layout offsets are consistent with vocab size', () => {
    const { playBase, discardBase, drawIndex, coupFourreIndex, passCoupFourreIndex } =
      ACTION_VOCAB_LAYOUT;
    expect(playBase).toBe(0);
    expect(discardBase).toBe(CARD_TYPES.length);
    expect(drawIndex).toBe(2 * CARD_TYPES.length);
    expect(coupFourreIndex).toBe(drawIndex + 1);
    expect(passCoupFourreIndex).toBe(drawIndex + 2);
    expect(passCoupFourreIndex + 1).toBe(ACTION_VOCAB_SIZE);
  });
});

describe('encodeActionSlot', () => {
  const sampleHand: Card[] = [
    { id: 'a', type: 'mile-25', category: 'mileage' },
    { id: 'b', type: 'hazard-stop', category: 'hazard' },
    { id: 'c', type: 'safety-right-of-way', category: 'safety' },
  ];

  it('encodes DRAW / COUP_FOURRE / PASS_COUP_FOURRE to fixed slots', () => {
    expect(encodeActionSlot({ seat: 0, type: 'DRAW' }, sampleHand)).toBe(
      ACTION_VOCAB_LAYOUT.drawIndex,
    );
    expect(
      encodeActionSlot({ seat: 0, type: 'COUP_FOURRE', safetyCardId: 'c' }, sampleHand),
    ).toBe(ACTION_VOCAB_LAYOUT.coupFourreIndex);
    expect(
      encodeActionSlot({ seat: 0, type: 'PASS_COUP_FOURRE' }, sampleHand),
    ).toBe(ACTION_VOCAB_LAYOUT.passCoupFourreIndex);
  });

  it('encodes PLAY by card type', () => {
    const slot = encodeActionSlot(
      { seat: 0, type: 'PLAY', cardId: 'a' },
      sampleHand,
    );
    expect(slot).toBe(ACTION_VOCAB_LAYOUT.playBase + CARD_TYPES.indexOf('mile-25'));
  });

  it('encodes DISCARD by card type', () => {
    const slot = encodeActionSlot(
      { seat: 0, type: 'DISCARD', cardId: 'b' },
      sampleHand,
    );
    expect(slot).toBe(
      ACTION_VOCAB_LAYOUT.discardBase + CARD_TYPES.indexOf('hazard-stop'),
    );
  });

  it('returns null when PLAY/DISCARD cardId is not in hand', () => {
    expect(
      encodeActionSlot({ seat: 0, type: 'PLAY', cardId: 'missing' }, sampleHand),
    ).toBeNull();
    expect(
      encodeActionSlot({ seat: 0, type: 'DISCARD', cardId: 'missing' }, sampleHand),
    ).toBeNull();
  });
});

describe('decodeActionFromSlot + legalActionMask', () => {
  it('decoded slot survives encode → decode round-trip on real legal actions', () => {
    const state = createInitialState({ seats: 2, rules, seed: 7 });
    const view = toSeatView(state, 0);
    const legal = legalActions(state, 0, rules);
    expect(legal.length).toBeGreaterThan(0);

    for (const action of legal) {
      const slot = encodeActionSlot(action, view.self.hand);
      expect(slot).not.toBeNull();
      const decoded = decodeActionFromSlot(slot!, view, legal);
      expect(decoded).not.toBeNull();
      // The decoded action must itself appear in legal.
      expect(legal).toContainEqual(decoded);
    }
  });

  it('mask matches encoded slots of legal actions', () => {
    const state = createInitialState({ seats: 2, rules, seed: 7 });
    const view = toSeatView(state, 0);
    const legal = legalActions(state, 0, rules);
    const mask = legalActionMask(view, legal);
    expect(mask).toHaveLength(ACTION_VOCAB_SIZE);

    // Every true bit corresponds to at least one legal action.
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s]) continue;
      const dec = decodeActionFromSlot(s, view, legal);
      expect(dec).not.toBeNull();
    }
    // Every legal action's slot is true.
    for (const a of legal) {
      const slot = encodeActionSlot(a, view.self.hand);
      if (slot !== null) expect(mask[slot]).toBe(true);
    }
  });

  it('returns null for slots with no legal counterpart', () => {
    const state = createInitialState({ seats: 2, rules, seed: 7 });
    const view = toSeatView(state, 0);
    const legal: Action[] = [{ seat: 0, type: 'DRAW' }];
    // Picking a PLAY slot with no PLAY in legal → null.
    expect(decodeActionFromSlot(ACTION_VOCAB_LAYOUT.playBase, view, legal)).toBeNull();
    // DRAW slot resolves.
    expect(decodeActionFromSlot(ACTION_VOCAB_LAYOUT.drawIndex, view, legal)).toEqual(
      { seat: 0, type: 'DRAW' },
    );
  });
});
