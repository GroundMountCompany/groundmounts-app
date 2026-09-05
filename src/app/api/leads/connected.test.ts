import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { __resetRateLimits } from '@/lib/guard';
import { TX_FALLBACK_CURVE } from '@/lib/production';
import type { LeadFields } from '@/lib/airtableSchema';
import type { SiteResponse } from '@/lib/server/siteLookup';

/**
 * The queue and the route, wired to each other.
 *
 * Every other test stubs one side of this boundary. Here `enqueueOrSend` calls
 * the real POST handler through a fetch shim, so the thing under test is the
 * behaviour a customer actually gets: a lead that hits a busy lease, waits,
 * and files itself without anybody touching the page.
 */

const written: LeadFields[] = [];
const store = new Map<string, unknown>();

vi.mock('@/lib/airtable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/airtable')>('@/lib/airtable');
  return {
    ...actual,
    upsertLeadByLeadId: async (fields: LeadFields, leadId: string) => {
      written.push({ ...fields, 'Lead ID': leadId });
      return { id: 'recConnected', created: true };
    },
  };
});

vi.mock('@/lib/resendSafe', () => ({
  getResendOrThrow: () => ({
    emails: { send: async () => ({ data: { id: 'e' }, error: null }) },
  }),
}));

const SITE: SiteResponse = {
  curve: TX_FALLBACK_CURVE,
  curveSource: 'fallback',
  soilClass: null,
  soilSource: 'unavailable',
  slopePercent: null,
  slopeTier: 'Unknown',
  slopeSource: 'unavailable',
};

vi.mock('@/lib/server/siteLookup', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/server/siteLookup')>('@/lib/server/siteLookup');
  return { ...actual, siteFactsForArray: async () => SITE };
});

/**
 * Imported once, at module scope, so the route and this test share one module
 * registry — and therefore one in-memory lease store. Resetting modules
 * between tests would give each side its own, and the lease under test would
 * be held in a map the route never looks at.
 */
const { POST } = await import('./route');
const redis = await import('@/lib/server/redis');
const { enqueueOrSend } = await import('@/lib/leadQueue');

const LEAD = '5b3c9e10-4a2f-4c88-9d77-1e6f0a3b2c44';

function installStorage() {
  const local = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
    removeItem: (k: string) => void local.delete(k),
    clear: () => local.clear(),
  });
}

/** Route `fetch('/api/leads')` straight into the real handler. */
function wireFetchToRoute() {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const req = new NextRequest('http://localhost' + url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.44',
        ...((init.headers as Record<string, string>) ?? {}),
      },
      body: init.body as string,
    });
    // The per-IP bucket is not what this test is about.
    __resetRateLimits();
    return POST(req);
  });
}

const payload = () => ({
  id: LEAD,
  state: 'TX',
  name: 'Bert Ortiz',
  email: 'bert@example.com',
  phone: '469-555-0100',
  address: '123 Main St, Fort Worth, TX 76131',
  source: 'groundmounts.com',
  // Now, not a fixed date: the queue drops items older than its staleness
  // window, which is exactly what a real client would never send.
  ts: Date.now(),
  ttc_ms: 60_000,
  honeypot: '',
  quote: {
    inputs: {
      panelCount: 16,
      tier: 'standard',
      trenchFeet: 113,
      batteryUnits: 0,
      needsClearing: false,
      slopePercent: null,
      slopeTier: null,
      soilClass: null,
      azimuth: 180,
      arrayCenter: [-97.3208, 32.7555] as [number, number],
    },
  },
});

beforeEach(() => {
  written.length = 0;
  store.clear();
  installStorage();
  vi.useFakeTimers();
  __resetRateLimits();
  redis.__resetRedis();
  vi.stubEnv('AIRTABLE_API_KEY', 'test');
  vi.stubEnv('AIRTABLE_BASE_ID', 'appTest');
  wireFetchToRoute();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('a lead submitted while the lease is busy', () => {
  it('waits, retries itself, and files exactly once', async () => {
    // Something else holds the lead — a partial save, mid-write.
    const held = await redis.acquireLease(`gm:submit:lease:${LEAD}`, 60);
    expect(held).toBeTruthy();

    // The customer presses the button. The route waits its 1.5s — six 250ms
    // attempts, advanced here because the clock is fake — and gives up with a
    // 503, so the queue keeps the lead and schedules its own retry.
    const sending = enqueueOrSend(payload());
    await vi.advanceTimersByTimeAsync(2_000);
    const first = await sending;

    expect(first).toMatchObject({ ok: false, queued: true, status: 503 });
    expect(written, 'a lead was written while the lease was held').toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('gm_lead_queue_v1') ?? '[]')).toHaveLength(1);

    // The queue has scheduled its own flush for three seconds' time. Wind the
    // clock to just before it, so the release lands inside that window — which
    // is the real sequence: the holder finishes while the retry is pending.
    await vi.advanceTimersByTimeAsync(2_900);
    expect(written, 'the retry ran before the lease was free').toHaveLength(0);

    await redis.releaseLease(`gm:submit:lease:${LEAD}`, held!);

    // And now the flush fires. Nobody touched the page: no reconnect, no
    // navigation, no second press of the button.
    await vi.advanceTimersByTimeAsync(1_000);

    await vi.waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem('gm_lead_queue_v1') ?? '[]'),
        'the lead is still queued'
      ).toHaveLength(0)
    );

    expect(written, 'the lead did not file exactly once').toHaveLength(1);
    expect(written[0]['Lead ID']).toBe(LEAD);
    expect(written[0].Status).toBe('New');
    expect(written[0]['Price Low']).toBeGreaterThan(0);
  });
});
