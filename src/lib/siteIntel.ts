import { useQuoteStore } from '@/store/quoteStore';
import type { LngLat } from './geo/units';

/**
 * Fetch what we can find out about the ground under the array.
 *
 * Keyed on the array, not the meter. The meter is on the house; the panels can
 * end up hundreds of feet away, on different soil and a different part of the
 * sun's day. Asking about the meter and pricing the array is how the quote ends
 * up describing a place nobody is building on.
 *
 * Advisory throughout: the store already holds the Texas fallback curve and a
 * null soil class, so every failure here leaves the customer moving.
 */

/** ~100 m, matching the cache key the route itself uses. */
const KEY_PRECISION = 3;

export function siteCellKey([lng, lat]: LngLat): string {
  return `${lat.toFixed(KEY_PRECISION)},${lng.toFixed(KEY_PRECISION)}`;
}

/**
 * The last cell we asked about. Dragging the array a few feet must not fire a
 * request, and dragging it across the parcel must.
 */
let lastKey: string | null = null;

/** Whether this funnel has asked about anywhere yet. */
export function hasAskedSiteIntel(): boolean {
  return lastKey !== null;
}

/** Test seam, and what a fresh funnel needs so the next lookup is not skipped. */
export function resetSiteIntel(): void {
  lastKey = null;
}

export async function refreshSiteIntel(
  center: LngLat,
  fetchImpl: typeof fetch = fetch
): Promise<'fetched' | 'skipped' | 'failed'> {
  const key = siteCellKey(center);
  if (key === lastKey) return 'skipped';
  lastKey = key;

  const [lng, lat] = center;
  try {
    const res = await fetchImpl(`/api/site?lat=${lat}&lng=${lng}`);
    if (!res.ok) return 'failed';
    const json = await res.json();
    if (!json?.ok) return 'failed';

    useQuoteStore.getState().setSiteIntel({
      curve: json.curve,
      curveSource: json.curveSource,
      soilClass: json.soilClass,
    });
    return 'fetched';
  } catch {
    // Keeping the fallback is the correct outcome, so there is nothing to do.
    return 'failed';
  }
}
