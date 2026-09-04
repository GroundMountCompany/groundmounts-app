import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useQuoteStore } from '@/store/quoteStore';
import { refreshSiteIntel, resetSiteIntel, siteCellKey } from './siteIntel';
import { TX_FALLBACK_CURVE } from './production';
import type { LngLat } from './geo/units';

const HOUSE: LngLat = [-97.3208, 32.7555];
/**
 * ~25 ft away and inside the same ~100 m cell. Chosen deliberately: a nudge
 * that straddles a cell boundary does re-fetch, which is harmless because the
 * route caches, but it would make this assertion a coin toss.
 */
const NUDGED: LngLat = [-97.32072, 32.75542];
/** ~1.5 miles away: different soil, different answer. */
const ACROSS_THE_PARCEL: LngLat = [-97.2, 32.71];

const MOCK_CURVE = { 90: 900, 135: 1000, 180: 1100, 225: 1000, 270: 900 };

function okResponse(soilClass: string) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      curve: MOCK_CURVE,
      curveSource: 'pvwatts',
      soilClass,
      soilSource: 'ssurgo',
    }),
  } as unknown as Response;
}

beforeEach(() => {
  resetSiteIntel();
  useQuoteStore.setState({
    productionCurve: TX_FALLBACK_CURVE,
    curveSource: 'fallback',
    soilClass: null,
  });
});

describe('site intel follows the array', () => {
  it('asks about the array position and stores what comes back', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/api/site');
      return okResponse('clay loam');
    });

    expect(await refreshSiteIntel(HOUSE, fetchImpl as unknown as typeof fetch)).toBe('fetched');

    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain(`lat=${HOUSE[1]}`);
    expect(url).toContain(`lng=${HOUSE[0]}`);

    const s = useQuoteStore.getState();
    expect(s.productionCurve).toEqual(MOCK_CURVE);
    expect(s.curveSource).toBe('pvwatts');
    expect(s.soilClass).toBe('clay loam');
  });

  it('does not re-ask when the array barely moves', async () => {
    const fetchImpl = vi.fn(async () => okResponse('clay loam'));

    await refreshSiteIntel(HOUSE, fetchImpl as unknown as typeof fetch);
    const result = await refreshSiteIntel(NUDGED, fetchImpl as unknown as typeof fetch);

    expect(siteCellKey(NUDGED)).toBe(siteCellKey(HOUSE));
    expect(result).toBe('skipped');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-asks when the array is dragged somewhere genuinely different', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okResponse('clay loam'))
      .mockResolvedValueOnce(okResponse('rock outcrop'));

    await refreshSiteIntel(HOUSE, fetchImpl as unknown as typeof fetch);
    expect(await refreshSiteIntel(ACROSS_THE_PARCEL, fetchImpl as unknown as typeof fetch)).toBe(
      'fetched'
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(useQuoteStore.getState().soilClass).toBe('rock outcrop');
  });

  it('leaves the fallback in place when the lookup fails', async () => {
    const failing = vi.fn(async () => ({ ok: false }) as unknown as Response);

    expect(await refreshSiteIntel(HOUSE, failing as unknown as typeof fetch)).toBe('failed');

    const s = useQuoteStore.getState();
    expect(s.productionCurve).toEqual(TX_FALLBACK_CURVE);
    expect(s.curveSource).toBe('fallback');
    expect(s.soilClass).toBeNull();
  });

  it('survives the request throwing', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('offline');
    });

    expect(await refreshSiteIntel(HOUSE, throwing as unknown as typeof fetch)).toBe('failed');
    expect(useQuoteStore.getState().curveSource).toBe('fallback');
  });
});
