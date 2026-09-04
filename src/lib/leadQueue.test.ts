import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The offline queue, and the half-success it has to cope with.
 *
 * One request files the lead and sends the customer's email. Either half can
 * fail on its own, and a 200 with `emailSent: false` is the case that used to
 * be invisible: the queue saw a successful response, dropped the item, and the
 * customer never got their quote.
 */

const KEY = 'gm_lead_queue_v1';

/** A localStorage that behaves like the real one, for a node environment. */
function installStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  return store;
}

const queued = () => JSON.parse(localStorage.getItem(KEY) ?? '[]');

const lead = (id: string) => ({
  id,
  state: 'TX',
  ts: Date.now(),
  ttc_ms: 60_000,
  quote: { inputs: { panelCount: 16 } },
});

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let flushQueue: typeof import('./leadQueue').flushQueue;
let enqueueOrSend: typeof import('./leadQueue').enqueueOrSend;

beforeEach(async () => {
  vi.resetModules();
  installStorage();
  vi.useFakeTimers();
  // The module keeps flush state at module scope, so it is re-imported per case.
  ({ flushQueue, enqueueOrSend } = await import('./leadQueue'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the queue after a half-successful submit', () => {
  it('queues an email-only retry when the lead filed but the email did not send', async () => {
    localStorage.setItem(KEY, JSON.stringify([lead('half-success')]));
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { ok: true, leadFiled: true, emailSent: false })
    );
    vi.stubGlobal('fetch', fetchMock);

    flushQueue();
    await vi.waitFor(() => expect(queued()).toHaveLength(1));

    const [retry] = queued();
    expect(retry.resend, 'the retry would have filed a second lead').toBe(true);
    expect(retry.id).toBe('half-success');
  });

  it('drops the item when both halves succeeded', async () => {
    localStorage.setItem(KEY, JSON.stringify([lead('all-good')]));
    vi.stubGlobal('fetch', async () =>
      jsonResponse(200, { ok: true, leadFiled: true, emailSent: true })
    );

    flushQueue();
    await vi.waitFor(() => expect(queued()).toHaveLength(0));
  });

  it('does not queue a resend for a resend that failed again', async () => {
    // Otherwise a permanently broken mailer grows the queue without bound.
    localStorage.setItem(KEY, JSON.stringify([{ ...lead('already-resent'), resend: true }]));
    vi.stubGlobal('fetch', async () =>
      jsonResponse(200, { ok: true, leadFiled: true, emailSent: false })
    );

    flushQueue();
    await vi.waitFor(() => expect(queued()).toHaveLength(0));
  });

  it('still retries the whole payload when the request itself fails', async () => {
    localStorage.setItem(KEY, JSON.stringify([lead('network-down')]));
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });

    flushQueue();
    await vi.waitFor(() => expect(queued()).toHaveLength(1));
    expect(queued()[0].resend, 'a network failure was mistaken for a mail failure').toBeFalsy();
    expect(queued()[0]._retries).toBe(1);
  });

  it('drops a lead the server rejected as invalid rather than looping', async () => {
    localStorage.setItem(KEY, JSON.stringify([lead('bad-payload')]));
    vi.stubGlobal('fetch', async () => jsonResponse(400, { ok: false, error: 'invalid_inputs' }));

    flushQueue();
    await vi.waitFor(() => expect(queued()).toHaveLength(0));
  });
});

describe('sending directly', () => {
  it('hands the response body back so the page can read what happened', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse(200, { ok: true, leadFiled: true, emailSent: false, priceLow: 1, priceHigh: 2 })
    );

    const result = await enqueueOrSend(lead('direct'));

    expect(result.ok).toBe(true);
    expect(result.body).toMatchObject({ leadFiled: true, emailSent: false, priceLow: 1 });
  });

  it('queues the payload when the request never lands', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });

    const result = await enqueueOrSend(lead('offline'));

    expect(result).toMatchObject({ ok: false, queued: true });
    expect(queued()).toHaveLength(1);
  });
});
