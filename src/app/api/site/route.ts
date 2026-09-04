import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, rateLimitOk } from '@/lib/guard';
import { DEFAULTS } from '@/config/pricing';
import { TX_FALLBACK_CURVE, type ProductionCurve } from '@/lib/production';

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
        const url =
          `https://developer.nrel.gov/api/pvwatts/v8.json?api_key=${key}` +
          `&lat=${lat}&lon=${lng}&system_capacity=1&azimuth=${azimuth}` +
          `&tilt=${tiltDeg}&array_type=${arrayType}&module_type=${moduleType}` +
          `&losses=${lossesPct}`;

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
    const res = await fetch('https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest', {
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

export async function GET(req: NextRequest) {
  if (!rateLimitOk(getClientIp(req), 'site')) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  // Read as strings first: Number(null) is 0, so a request with no coordinates
  // at all used to be answered with data for the Gulf of Guinea.
  const rawLat = req.nextUrl.searchParams.get('lat');
  const rawLng = req.nextUrl.searchParams.get('lng');
  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (
    rawLat === null ||
    rawLng === null ||
    rawLat.trim() === '' ||
    rawLng.trim() === '' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return NextResponse.json({ ok: false, error: 'bad_coordinates' }, { status: 400 });
  }

  const key = cacheKey(lat, lng);
  const cached = readCache(key);
  if (cached) return NextResponse.json({ ok: true, ...cached, cached: true });

  // Fan out. Neither can fail the request; both have their own fallback.
  const [curve, soilClass] = await Promise.all([fetchCurve(lat, lng), fetchSoil(lat, lng)]);

  const value: SiteResponse = {
    curve: curve ?? TX_FALLBACK_CURVE,
    curveSource: curve ? 'pvwatts' : 'fallback',
    soilClass,
    soilSource: soilClass ? 'ssurgo' : 'unavailable',
  };

  writeCache(key, value);
  console.log('[SITE]', key, value.curveSource, value.soilSource);

  return NextResponse.json({ ok: true, ...value, cached: false });
}
