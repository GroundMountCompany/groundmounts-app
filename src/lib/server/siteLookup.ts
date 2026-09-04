import { DEFAULTS } from '@/config/pricing';
import { TX_FALLBACK_CURVE, type ProductionCurve } from '@/lib/production';
import { pvwattsUrl, SSURGO_URL } from '@/config/apis';
import { slopeFromTilequery, type SlopeTier } from '@/lib/slope';
import type { QuoteInputs } from '@/lib/quoteInputs';

/**
 * What the design step needs to know about a location.
 *
 * Both lookups are advisory. Either can fail and the step still works: the
 * client falls back to the Texas reference curve and an unknown soil class,
 * because a customer should never be blocked by somebody else's API.
 */
export interface SiteResponse {
  curve: ProductionCurve;
  curveSource: 'pvwatts' | 'fallback';
  soilClass: string | null;
  soilSource: 'ssurgo' | 'unavailable';
  slopePercent: number | null;
  slopeTier: SlopeTier;
  slopeSource: 'tilequery' | 'unavailable';
}

/** Each upstream gets this long before we give up and use the fallback. */
const UPSTREAM_TIMEOUT_MS = 4000;
/** Coordinates are rounded to ~100 m for the cache key. */
const CACHE_PRECISION = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

interface CacheEntry {
  value: SiteResponse;
  at: number;
}

/**
 * Per-instance cache. Serverless means several of these exist and none survive
 * a cold start, which is fine: a miss costs one upstream call, not a wrong
 * answer. Phase 7's durable store can back this if the call volume justifies it.
 */
const CACHE = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lng.toFixed(CACHE_PRECISION)}`;
}

function readCache(key: string): SiteResponse | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: SiteResponse) {
  if (CACHE.size >= CACHE_MAX_ENTRIES) {
    // Oldest insertion first; Map preserves order.
    const oldest = CACHE.keys().next().value;
    if (oldest) CACHE.delete(oldest);
  }
  CACHE.set(key, { value, at: Date.now() });
}

/**
 * One PVWatts call per reference azimuth for a 1 kW system.
 *
 * Five calls per location, cached. Everything between the samples is
 * interpolated on the client, so rotating the array costs no network at all.
 */
async function fetchCurve(lat: number, lng: number): Promise<ProductionCurve | null> {
  const key = process.env.NREL_API_KEY;
  if (!key) return null;

  const { tiltDeg, lossesPct, arrayType, moduleType, referenceAzimuths } = DEFAULTS.pvwatts;

  try {
    const results = await Promise.all(
      referenceAzimuths.map(async (azimuth) => {
        const url = pvwattsUrl({
          api_key: key,
          lat,
          lon: lng,
          system_capacity: 1,
          azimuth,
          tilt: tiltDeg,
          array_type: arrayType,
          module_type: moduleType,
          losses: lossesPct,
        });

        const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`pvwatts ${res.status}`);

        const json = await res.json();
        const annual = json?.outputs?.ac_annual;
        if (typeof annual !== 'number' || !Number.isFinite(annual) || annual <= 0) {
          throw new Error('pvwatts returned no annual output');
        }
        return [azimuth, annual] as const;
      })
    );

    return Object.fromEntries(results) as ProductionCurve;
  } catch (error) {
    console.warn('[SITE] pvwatts unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Soil texture from the USDA Soil Data Access service.
 *
 * SDA takes SQL over a POST. The query asks for the dominant component's
 * texture at the point, which is what drives the auger and pile cost.
 */
async function fetchSoil(lat: number, lng: number): Promise<string | null> {
  const query = `
    SELECT TOP 1 c.compname, ch.texdesc
    FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lng} ${lat})') AS m
    INNER JOIN component AS c ON c.mukey = m.mukey
    LEFT OUTER JOIN chorizon AS h ON h.cokey = c.cokey
    LEFT OUTER JOIN chtexturegrp AS ch ON ch.chkey = h.chkey
    WHERE c.majcompflag = 'Yes'
    ORDER BY c.comppct_r DESC
  `;

  try {
    const res = await fetch(SSURGO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, format: 'JSON' }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ssurgo ${res.status}`);

    const json = await res.json();
    const row = json?.Table?.[0];
    if (!Array.isArray(row)) return null;

    // [compname, texdesc]. Prefer the texture; fall back to the series name.
    const texture = typeof row[1] === 'string' && row[1].trim() ? row[1].trim() : null;
    const name = typeof row[0] === 'string' && row[0].trim() ? row[0].trim() : null;
    return texture ?? name;
  } catch (error) {
    console.warn('[SITE] ssurgo unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Everything we can find out about a location, cached.
 *
 * Shared by /api/site and by the two routes that price a quote, so a lead and
 * the email that follows it are computed from the same curve the design step
 * showed — and so a browser cannot hand the server a curve of its own. In the
 * normal case the design step has already asked about this array and every
 * later caller is a cache hit.
 */
export async function lookupSite(lat: number, lng: number): Promise<SiteResponse & { cached: boolean }> {
  const key = cacheKey(lat, lng);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  // Fan out. None of the three can fail the request; each has its own fallback.
  const [curve, soilClass, slope] = await Promise.all([
    fetchCurve(lat, lng),
    fetchSoil(lat, lng),
    slopeFromTilequery([lng, lat]),
  ]);

  const value: SiteResponse = {
    curve: curve ?? TX_FALLBACK_CURVE,
    curveSource: curve ? 'pvwatts' : 'fallback',
    soilClass,
    soilSource: soilClass ? 'ssurgo' : 'unavailable',
    slopePercent: slope.percent,
    slopeTier: slope.tier,
    slopeSource: slope.source === 'unavailable' ? 'unavailable' : 'tilequery',
  };

  writeCache(key, value);
  console.log('[SITE]', key, value.curveSource, value.soilSource, value.slopeSource);

  return { ...value, cached: false };
}

/** Test seam: the cache is per-instance and would otherwise leak between cases. */
export function __clearSiteCache(): void {
  CACHE.clear();
}

/** Everything nothing about a location was known: the honest empty answer. */
const NOTHING_KNOWN: SiteResponse = {
  curve: TX_FALLBACK_CURVE,
  curveSource: 'fallback',
  soilClass: null,
  soilSource: 'unavailable',
  slopePercent: null,
  slopeTier: 'Unknown',
  slopeSource: 'unavailable',
};

/**
 * What the server knows about the ground under an array.
 *
 * Production curve, soil and slope, all for the same coordinates and out of the
 * same cache entry. None of it is accepted from a request: a browser can say
 * where its array is, and the server decides what that place is like. A design
 * on rock and a steep grade costs more, so those are answers the customer's own
 * page must not be able to choose.
 *
 * In the normal case the design step has already asked /api/site about this
 * array, so this is a cache hit in the same instance.
 */
export async function siteFactsForArray(
  arrayCenter: [number, number] | null
): Promise<SiteResponse> {
  if (!arrayCenter) return NOTHING_KNOWN;

  const [lng, lat] = arrayCenter;
  try {
    const result = await lookupSite(lat, lng);
    // `cached` is for the /api/site response; a caller pricing a quote does not
    // care where the answer came from, only what it is.
    delete (result as Partial<typeof result>).cached;
    return result;
  } catch (error) {
    console.warn('[SITE] lookup failed:', error instanceof Error ? error.message : error);
    return NOTHING_KNOWN;
  }
}

/**
 * The site conditions a quote is priced with.
 *
 * The server's own answer wins wherever it has one. The client's is used only
 * where the server has nothing — a soil lookup that failed, a slope the
 * Tilequery API would not give — because in that case the alternative is not a
 * better number, it is no number, and an unknown slope prices as if the ground
 * were flat.
 *
 * So: a design claiming sand on flat ground, sitting on rock on a steep grade,
 * is priced as rock on a steep grade.
 */
export function resolveSiteConditions(
  clientInputs: Pick<QuoteInputs, 'soilClass' | 'slopePercent' | 'slopeTier'>,
  facts: SiteResponse
): {
  soilClass: string | null;
  slopePercent: number | null;
  slopeTier: SlopeTier | null;
  soilAuthority: 'server' | 'client';
  slopeAuthority: 'server' | 'client';
} {
  const serverSoil = facts.soilSource === 'ssurgo';
  const serverSlope = facts.slopeSource === 'tilequery' && facts.slopePercent !== null;

  return {
    soilClass: serverSoil ? facts.soilClass : clientInputs.soilClass,
    slopePercent: serverSlope ? facts.slopePercent : clientInputs.slopePercent,
    // The manual Flat/Rolling/Steep pick only ever applies when the server
    // could not measure the ground itself.
    slopeTier: serverSlope ? facts.slopeTier : clientInputs.slopeTier,
    soilAuthority: serverSoil ? 'server' : 'client',
    slopeAuthority: serverSlope ? 'server' : 'client',
  };
}
