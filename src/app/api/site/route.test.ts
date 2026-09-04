import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { __resetRateLimits } from '@/lib/guard';
import { TX_FALLBACK_CURVE } from '@/lib/production';
import { DEFAULTS } from '@/config/pricing';
import { PVWATTS, SSURGO } from '@/config/apis';

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

function routeFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return Promise.resolve(handler(url));
  });
}

const isPvwatts = (url: string) => url.includes(PVWATTS.host);

beforeEach(() => {
  __resetRateLimits();
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
