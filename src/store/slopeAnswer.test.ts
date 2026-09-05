import { describe, it, expect, beforeEach } from 'vitest';
import { useQuoteStore } from './quoteStore';

/**
 * A slope the customer told us stands until the ground itself disagrees.
 *
 * Every arrival at the design step re-reads the terrain, and both sources can
 * come back with nothing. That "nothing" was landing on the store as
 * `Unknown` / `unavailable` and wiping the tier the customer had picked — so a
 * steep hill-country parcel, answered honestly, was quoted with no site adder
 * the moment the page was reloaded.
 */
describe('an answered slope survives a failed lookup', () => {
  beforeEach(() => {
    useQuoteStore.getState().resetQuote();
  });

  it('keeps the customer pick when the lookup finds nothing', () => {
    const store = useQuoteStore.getState();
    store.chooseSlopeTier('Steep');
    expect(useQuoteStore.getState().slopeSource).toBe('chosen');

    // Both terrain sources failed. This is the shape slopeAt returns.
    useQuoteStore.getState().setSlope(null, 'Unknown', 'unavailable');

    expect(useQuoteStore.getState().slopeTier, 'the pick was overwritten').toBe('Steep');
    expect(useQuoteStore.getState().slopeSource).toBe('chosen');
  });

  it('still lets a real measurement replace the pick', () => {
    useQuoteStore.getState().chooseSlopeTier('Steep');

    // Terrain answered this time. A measurement of the ground beats a guess
    // about it, so this one has to land.
    useQuoteStore.getState().setSlope(3.2, 'Flat', 'terrain');

    expect(useQuoteStore.getState().slopeTier).toBe('Flat');
    expect(useQuoteStore.getState().slopePercent).toBe(3.2);
    expect(useQuoteStore.getState().slopeSource).toBe('terrain');
  });

  it('a failed lookup still lands when nobody has answered', () => {
    useQuoteStore.getState().setSlope(null, 'Unknown', 'unavailable');

    // This is what puts the picker on screen in the first place.
    expect(useQuoteStore.getState().slopeSource).toBe('unavailable');
  });
});
