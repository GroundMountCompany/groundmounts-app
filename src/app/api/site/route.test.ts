import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { __resetRateLimits } from '@/lib/guard';
import { __clearSiteCache } from '@/lib/server/siteLookup';
import * as redisModule from '@/lib/server/redis';
import { TX_FALLBACK_CURVE } from '@/lib/production';
import { DEFAULTS } from '@/config/pricing';
import { PVWATTS, SSURGO, MAPBOX } from '@/config/apis';

/**
 * /api/site is advisory, and that is the whole point.
 *
 * PVWatts and SSURGO are both somebody else's servers. Either can be slow,
 * rate-limited or simply down, and a Texas landowner standing in a field must
 * never see a spinner because of it. Each case below kills one or both and
 * checks the customer still gets a usable answer.
 */

/** Distinct coordinates per case: the route caches by rounded position. */
let nextLat = 30;
function freshRequest(): NextRequest {
  nextLat += 0.01;
  return new NextRequest(`http://localhost/api/site?lat=${nextLat.toFixed(3)}&lng=-97.5`);
}

const pvwattsOk = (annual: number) =>
  new Response(JSON.stringify({ outputs: { ac_annual: annual } }), { status: 200 });

const ssurgoOk = (texture: string) =>
  new Response(JSON.stringify({ Table: [['Windthorst', texture]] }), { status: 200 });

/** Contours around one sample point. The route takes the highest per point. */
const tilequeryOk = (elevation: number) =>
  new Response(
    JSON.stringify({ features: [{ properties: { ele: elevation } }] }),
    { status: 200 }
  );

const isTilequery = (url: string) => url.includes(MAPBOX.host);

function routeFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return Promise.resolve(handler(url));
  });
}

const isPvwatts = (url: string) => url.includes(PVWATTS.host);

beforeEach(() => {
  __resetRateLimits();
  __clearSiteCache();
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test');
  // The route only calls PVWatts when it has a key to call it with.
  vi.stubEnv('NREL_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('/api/site', () => {
  it('calls PVWatts at the current host, once per reference azimuth', async () => {
    // The lab renamed and the old hostname stopped resolving. A DNS failure
    // looks exactly like a healthy fallback from the outside, so the host is
    // asserted rather than assumed.
    const urls: string[] = [];
    routeFetch((url) => {
      urls.push(url);
      return isPvwatts(url) ? pvwattsOk(1650) : ssurgoOk('clay loam');
    });

    await GET(freshRequest());

    const pvwatts = urls.filter(isPvwatts).map((u) => new URL(u));
    expect(pvwatts).toHaveLength(DEFAULTS.pvwatts.referenceAzimuths.length);
    for (const url of pvwatts) {
      expect(url.host).toBe('developer.nlr.gov');
      expect(url.host).not.toBe('developer.nrel.gov');
      expect(url.pathname).toBe(PVWATTS.path);
    }
    expect(
      pvwatts.map((u) => Number(u.searchParams.get('azimuth'))).sort((a, b) => a - b)
    ).toEqual([...DEFAULTS.pvwatts.referenceAzimuths].sort((a, b) => a - b));

    // And the soil lookup still goes where it always did.
    expect(urls.some((u) => u.includes(SSURGO.host))).toBe(true);
  });

  it('samples the slope around the array and returns a tier', async () => {
    // Five points, flat in the middle and higher to one side: a real grade.
    let point = 0;
    routeFetch((url) => {
      if (isPvwatts(url)) return pvwattsOk(1650);
      if (isTilequery(url)) return tilequeryOk(100 + point++ * 5);
      return ssurgoOk('clay loam');
    });

    const body = await (await GET(freshRequest())).json();

    expect(body.slopeSource).toBe('tilequery');
    expect(body.slopePercent).toBeGreaterThan(0);
    expect(['Flat', 'Rolling', 'Steep']).toContain(body.slopeTier);
  });

  it('reports an unknown slope rather than guessing one', async () => {
    routeFetch((url) => {
      if (isPvwatts(url)) return pvwattsOk(1650);
      if (isTilequery(url)) return new Response('no tiles', { status: 404 });
      return ssurgoOk('clay loam');
    });

    const body = await (await GET(freshRequest())).json();

    expect(body.slopeSource).toBe('unavailable');
    expect(body.slopePercent).toBeNull();
    expect(body.slopeTier).toBe('Unknown');
    // The other two still answered.
    expect(body.curveSource).toBe('pvwatts');
    expect(body.soilSource).toBe('ssurgo');
  });

  it('returns both lookups when both answer', async () => {
    routeFetch((url) => (isPvwatts(url) ? pvwattsOk(1650) : ssurgoOk('clay loam')));

    const res = await GET(freshRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.curveSource).toBe('pvwatts');
    expect(body.soilSource).toBe('ssurgo');
    expect(body.soilClass).toBe('clay loam');
    // One sample per reference azimuth, all from the live response.
    expect(Object.keys(body.curve).map(Number).sort((a, b) => a - b)).toEqual(
      [...DEFAULTS.pvwatts.referenceAzimuths].sort((a, b) => a - b)
    );
    expect(Object.values(body.curve)).toEqual(
      DEFAULTS.pvwatts.referenceAzimuths.map(() => 1650)
    );
  });

  it('falls back to the Texas curve when PVWatts fails, keeping the soil', async () => {
    routeFetch((url) =>
      isPvwatts(url) ? new Response('rate limited', { status: 429 }) : ssurgoOk('rock outcrop')
    );

    const body = await (await GET(freshRequest())).json();

    expect(body.ok).toBe(true);
    expect(body.curveSource).toBe('fallback');
    expect(body.curve).toEqual(TX_FALLBACK_CURVE);
    // The half that worked is still returned.
    expect(body.soilSource).toBe('ssurgo');
    expect(body.soilClass).toBe('rock outcrop');
  });

  it('reports unknown soil when SSURGO fails, keeping the curve', async () => {
    routeFetch((url) =>
      isPvwatts(url) ? pvwattsOk(1700) : new Response('service unavailable', { status: 503 })
    );

    const body = await (await GET(freshRequest())).json();

    expect(body.ok).toBe(true);
    expect(body.curveSource).toBe('pvwatts');
    expect(body.soilSource).toBe('unavailable');
    expect(body.soilClass).toBeNull();
  });

  it('still answers when both fall over', async () => {
    routeFetch(() => new Response('nope', { status: 500 }));

    const res = await GET(freshRequest());
    const body = await res.json();

    // Not a 502. The design step needs an answer, not an outage.
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.curveSource).toBe('fallback');
    expect(body.curve).toEqual(TX_FALLBACK_CURVE);
    expect(body.soilSource).toBe('unavailable');
    expect(body.soilClass).toBeNull();
  });

  it('treats a rejected connection the same as a bad status', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));

    const body = await (await GET(freshRequest())).json();

    expect(body.ok).toBe(true);
    expect(body.curveSource).toBe('fallback');
    expect(body.soilSource).toBe('unavailable');
  });

  it('falls back when PVWatts answers with no usable number', async () => {
    // A 200 with a null output is the failure mode that actually happens.
    routeFetch((url) =>
      isPvwatts(url)
        ? new Response(JSON.stringify({ outputs: { ac_annual: null } }), { status: 200 })
        : ssurgoOk('sandy loam')
    );

    const body = await (await GET(freshRequest())).json();
    expect(body.curveSource).toBe('fallback');
  });

  it('serves the second request for the same place from cache', async () => {
    let calls = 0;
    routeFetch((url) => {
      calls++;
      return isPvwatts(url) ? pvwattsOk(1600) : ssurgoOk('clay');
    });

    const req = freshRequest();
    const first = await (await GET(req)).json();
    const callsAfterFirst = calls;
    const second = await (await GET(req)).json();

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(calls, 'the cached response still hit the network').toBe(callsAfterFirst);
    expect(second.curve).toEqual(first.curve);
  });

  it('rejects coordinates that are not on the planet', async () => {
    routeFetch(() => pvwattsOk(1600));

    for (const query of ['lat=99&lng=-97', 'lat=32&lng=999', 'lat=abc&lng=-97', '']) {
      const res = await GET(new NextRequest(`http://localhost/api/site?${query}`));
      expect(res.status, query).toBe(400);
      expect((await res.json()).error).toBe('bad_coordinates');
    }
  });

  it('skips PVWatts entirely with no API key, without failing the request', async () => {
    vi.stubEnv('NREL_API_KEY', '');
    let pvwattsCalls = 0;
    routeFetch((url) => {
      if (isPvwatts(url)) pvwattsCalls++;
      return isPvwatts(url) ? pvwattsOk(1600) : ssurgoOk('clay');
    });

    const body = await (await GET(freshRequest())).json();

    expect(pvwattsCalls).toBe(0);
    expect(body.curveSource).toBe('fallback');
    expect(body.soilSource).toBe('ssurgo');
  });
});

describe('simultaneous misses for the same place', () => {
  it('share one fan-out instead of each paying for their own', async () => {
    // A cold cache and three requests for one parcel used to mean fifteen
    // PVWatts calls, three SSURGO queries and fifteen Tilequery calls. One
    // funnel can do this to itself: the design step and a partial save land
    // milliseconds apart.
    let upstreamCalls = 0;
    routeFetch((url) => {
      upstreamCalls++;
      if (isPvwatts(url)) return pvwattsOk(1650);
      if (isTilequery(url)) return tilequeryOk(100);
      return ssurgoOk('clay loam');
    });

    const req = () => new NextRequest('http://localhost/api/site?lat=31.111&lng=-97.111');
    const [a, b, c] = await Promise.all([GET(req()), GET(req()), GET(req())]);
    const bodies = await Promise.all([a.json(), b.json(), c.json()]);

    // Five PVWatts azimuths, one SSURGO, five Tilequery points: one fan-out.
    expect(upstreamCalls).toBe(11);
    // And all three callers get the same answer.
    expect(bodies[1].curve).toEqual(bodies[0].curve);
    expect(bodies[2].soilClass).toBe(bodies[0].soilClass);
  });

  it('does not keep a failed lookup for a week', async () => {
    // A fallback is a record of one bad minute, not knowledge about a place.
    // Cached for ten minutes rather than seven days, so the next customer on
    // that parcel gets a real curve rather than a generic one until Tuesday.
    routeFetch(() => new Response('nope', { status: 500 }));
    const degraded = await (
      await GET(new NextRequest('http://localhost/api/site?lat=31.222&lng=-97.222'))
    ).json();
    expect(degraded.curveSource).toBe('fallback');

    const ttls: number[] = [];
    vi.spyOn(redisModule, 'cacheSet').mockImplementation(async (_k, _v, ttl) => {
      ttls.push(ttl);
    });

    routeFetch((url) => (isPvwatts(url) ? pvwattsOk(1700) : ssurgoOk('clay')));
    await GET(new NextRequest('http://localhost/api/site?lat=31.333&lng=-97.333'));

    routeFetch(() => new Response('nope', { status: 500 }));
    await GET(new NextRequest('http://localhost/api/site?lat=31.444&lng=-97.444'));

    const [complete, incomplete] = ttls;
    expect(complete, 'a full answer should be kept for a week').toBeGreaterThan(24 * 60 * 60);
    expect(incomplete, 'a failure should expire quickly').toBeLessThanOrEqual(15 * 60);
    vi.restoreAllMocks();
  });
});
