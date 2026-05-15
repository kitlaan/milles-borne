import { describe, expect, it } from 'vitest';
import { STANDARD_DECK_COMPOSITION } from '@/engine/deck';
import { buildCardsRecord } from '../util';

function fullGlob(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [type] of STANDARD_DECK_COMPOSITION) {
    out[`./cards/${type}.svg`] = `<svg data-type="${type}"/>`;
  }
  return out;
}

describe('buildCardsRecord', () => {
  it('accepts a complete glob and returns a fully-populated record', () => {
    const rec = buildCardsRecord(fullGlob());
    expect(Object.keys(rec).length).toBe(STANDARD_DECK_COMPOSITION.length);
    expect(rec['mile-200']).toContain('mile-200');
  });

  it('throws when a required CardType is missing', () => {
    const glob = fullGlob();
    delete glob['./cards/hazard-stop.svg'];
    expect(() => buildCardsRecord(glob)).toThrow(/missing.*hazard-stop/);
  });

  it('throws when an unknown filename is present', () => {
    const glob = fullGlob();
    glob['./cards/foobar.svg'] = '<svg/>';
    expect(() => buildCardsRecord(glob)).toThrow(/unknown.*foobar/);
  });

  it('reports both missing and unknown together (e.g. typo of a card type)', () => {
    const glob = fullGlob();
    delete glob['./cards/hazard-stop.svg'];
    glob['./cards/hazard-stp.svg'] = '<svg/>';
    expect(() => buildCardsRecord(glob)).toThrow(/missing.*hazard-stop.*unknown.*hazard-stp/);
  });
});
