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

/**
 * Flush and wait for the handler to finish with the item.
 *
 * `flushQueue` takes the item off the queue *before* sending it, so the queue
 * is momentarily empty whatever the outcome. Asserting straight after the call
 * therefore passes for a drop and for a retry alike — which it did, silently,
 * until a deliberate break failed to fail. This waits for the request to have
 * been answered and the .then/.catch chain to have run, so what is asserted is
 * where the item ended up rather than where it briefly was not.
 */
async function flushAndSettle(respond: (url: string) => Response | Promise<Response>) {
  let called: () => void = () => {};
  const requested = new Promise<void>((resolve) => (called = resolve));

  vi.stubGlobal('fetch', async (url: string) => {
    try {
      return await respond(url);
    } finally {
      // Signalled on the way out either way: a thrown request is exactly the
      // offline case, and it still needs to be waited for.
      called();
    }
  });

  flushQueue();
  await requested;
  // Let the response handler and its catch/finally run, without firing the
  // backoff timer that a re-queued item would schedule.
  await vi.advanceTimersByTimeAsync(0);
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
    await flushAndSettle(() => jsonResponse(200, { ok: true, leadFiled: true, emailSent: false }));

    expect(queued()).toHaveLength(1);
    const [retry] = queued();
    expect(retry.resend, 'the retry would have filed a second lead').toBe(true);
    expect(retry.id).toBe('half-success');
  });

  it('drops the item when both halves succeeded', async () => {
    localStorage.setItem(KEY, JSON.stringify([lead('all-good')]));

    await flushAndSettle(() => jsonResponse(200, { ok: true, leadFiled: true, emailSent: true }));

    expect(queued()).toHaveLength(0);
  });

  it('does not queue a resend for a resend that failed again', async () => {
    // Otherwise a permanently broken mailer grows the queue without bound.
    localStorage.setItem(KEY, JSON.stringify([{ ...lead('already-resent'), resend: true }]));

    await flushAndSettle(() => jsonResponse(200, { ok: true, leadFiled: true, emailSent: false }));

    expect(queued()).toHaveLength(0);
  });

  it('still retries the whole payload when the request itself fails', async () => {
    localStorage.setItem(KEY, JSON.stringify([lead('network-down')]));

    await flushAndSettle(() => {
      throw new Error('offline');
    });

    expect(queued()).toHaveLength(1);
    expect(queued()[0].resend, 'a network failure was mistaken for a mail failure').toBeFalsy();
    expect(queued()[0]._retries).toBe(1);
  });

  it('drops a lead the server rejected as invalid rather than looping', async () => {
    localStorage.setItem(KEY, JSON.stringify([lead('bad-payload')]));

    await flushAndSettle(() => jsonResponse(400, { ok: false, error: 'invalid_inputs' }));

    expect(queued()).toHaveLength(0);
  });

  // One case per status: the module rate-limits flushes at module scope, so a
  // loop inside a single test would be measuring that instead of the policy.
  it.each([400, 404, 409, 429])(
    'drops a lead on %i, because that will not work on a second try either',
    async (status) => {
      // 404 is a resend for a lead the server has no record of; 409 is another
      // instance already writing this one. Retrying either is pointless, and
      // for the duplicate it is actively wrong.
      localStorage.setItem(KEY, JSON.stringify([lead(`refused-${status}`)]));

      await flushAndSettle(() => jsonResponse(status, { ok: false }));

      expect(queued()).toHaveLength(0);
    }
  );

  it.each([500, 502, 503])('keeps the lead on %i, because that is what a queue is for', async (status) => {
    // Airtable, Redis or Resend unreachable. The design must survive it.
    localStorage.setItem(KEY, JSON.stringify([lead(`down-${status}`)]));

    await flushAndSettle(() => jsonResponse(status, { ok: false }));

    expect(queued()).toHaveLength(1);
    expect(queued()[0]._retries).toBe(1);
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

describe('what a real client sends', () => {
  it('puts the honeypot in a header as well as the body', async () => {
    // The server checks the header before it parses anything. A guard only
    // real clients fail to trigger is a guard that only stops honest traffic.
    let sentHeaders: Record<string, string> = {};
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sentHeaders = init.headers as Record<string, string>;
      return jsonResponse(200, { ok: true, leadFiled: true, emailSent: true });
    });

    await enqueueOrSend({ ...lead('with-hp'), honeypot: 'i am a robot' });

    expect(sentHeaders['x-gm-hp']).toBe('i am a robot');
    expect(sentHeaders['Content-Type']).toBe('application/json');
  });

  it('sends no honeypot header when the field is empty', async () => {
    let sentHeaders: Record<string, string> = {};
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sentHeaders = init.headers as Record<string, string>;
      return jsonResponse(200, { ok: true, leadFiled: true, emailSent: true });
    });

    await enqueueOrSend({ ...lead('no-hp'), honeypot: '' });

    expect(sentHeaders['x-gm-hp']).toBeUndefined();
  });
});

describe('chasing a retry without being woken', () => {
  it('schedules its own flush after a 5xx', async () => {
    // The queue used to flush only on `online` or the tab becoming visible.
    // A customer who submits, gets a 503 because something held the lease for
    // a moment, and keeps looking at the same tab triggers neither.
    let attempts = 0;
    vi.stubGlobal('fetch', async () => {
      attempts++;
      return attempts === 1
        ? jsonResponse(503, { ok: false, error: 'busy' })
        : jsonResponse(200, { ok: true, leadFiled: true, emailSent: true });
    });

    const result = await enqueueOrSend(lead('busy-then-fine'));

    expect(result).toMatchObject({ ok: false, queued: true, status: 503 });
    expect(queued(), 'the lead was not kept').toHaveLength(1);
    expect(attempts).toBe(1);

    // Nothing happens in the tab: no navigation, no reconnect. The queue has
    // to come back on its own.
    await vi.advanceTimersByTimeAsync(3500);

    expect(attempts, 'the queue never retried by itself').toBeGreaterThan(1);
    await vi.waitFor(() => expect(queued()).toHaveLength(0));
  });

  it('does not queue a lead the server refused outright', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(400, { ok: false, error: 'bad_request' }));

    const result = await enqueueOrSend(lead('refused'));

    expect(result).toMatchObject({ ok: false, queued: false, status: 400 });
    expect(queued(), 'a payload that can never work was queued').toHaveLength(0);
  });
});
