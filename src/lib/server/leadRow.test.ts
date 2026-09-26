import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { __resetRateLimits } from '@/lib/guard';
import type { LeadFields } from '@/lib/airtableSchema';
import { SUBMIT_PREFIX, EMAIL_LEAD_PREFIX, PHONE_ROW_PREFIX } from '@/lib/leadKeys';

/**
 * After app #10 files a design onto a caller's row, the two routes that write
 * later — the call-time pick and the quote email's webhook — must follow it
 * there, not onto the design's leftover partial row.
 */

/** The durable store, stubbed: store and cache share one map, as in Redis. */
const store = new Map<string, unknown>();
let storeDown = false;

vi.mock('@/lib/server/redis', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/redis')>('@/lib/server/redis');
  const get = async (key: string) => {
    if (storeDown) throw new actual.StoreUnavailable('get', new Error('ECONNREFUSED'));
    return store.get(key) ?? null;
  };
  const set = async (key: string, value: unknown) => {
    store.set(key, value);
  };
  return {
    ...actual,
    redis: () => null,
    storeGet: get,
    storeSet: set,
    cacheGet: async (key: string) => store.get(key) ?? null,
    cacheSet: set,
    acquireLease: async () => 'token',
    releaseLease: async () => undefined,
  };
});

/** Upserts by Lead ID (the design's row) and PATCHes by record id (the caller's). */
const upserted: Array<{ leadId: string; fields: LeadFields }> = [];
const patched: Array<{ recordId: string; fields: LeadFields }> = [];
/** The Status the caller's row has now, as the owner left it. */
let phoneRowStatus = 'Contacted';
let failRead = false;

vi.mock('@/lib/airtable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/airtable')>('@/lib/airtable');
  return {
    ...actual,
    upsertLeadByLeadId: async (fields: LeadFields, leadId: string) => {
      upserted.push({ leadId, fields });
      return { id: 'recDesign', created: false };
    },
    getLeadRecord: async () => {
      if (failRead) throw new Error('Airtable error: 503 - upstream');
      return { Status: phoneRowStatus };
    },
    updateLeadRecord: async (recordId: string, fields: LeadFields) => {
      patched.push({ recordId, fields });
    },
  };
});

const { rememberPhoneRow } = await import('./leadRow');
const callTime = await import('@/app/api/call-time/route');
const webhook = await import('@/app/api/email-webhook/route');

const LEAD_ID = '8f14e45f-ceea-467a-9f34-2c8c3b1a77de';
const SECRET = 'whsec_' + Buffer.from('test-secret-for-webhooks').toString('base64');

function pickCallTime(when = 'Evening'): Request {
  return new Request('http://localhost/api/call-time', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ id: LEAD_ID, when }),
  });
}

let delivery = 0;
function emailEvent(type = 'email.opened'): Request {
  const body = JSON.stringify({
    type,
    created_at: '2026-09-26T15:00:00.000Z',
    data: { email_id: 'email_1' },
  });
  const id = `msg_${++delivery}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return new Request('http://localhost/api/email-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
    body,
  });
}

beforeEach(() => {
  store.clear();
  storeDown = false;
  upserted.length = 0;
  patched.length = 0;
  phoneRowStatus = 'Contacted';
  failRead = false;
  __resetRateLimits();
  vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET);
  // What the leads route leaves behind for a filed lead whose quote email went.
  store.set(SUBMIT_PREFIX + LEAD_ID, { leadFiled: true });
  store.set(EMAIL_LEAD_PREFIX + 'email_1', LEAD_ID);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('after the design was filed onto a caller\'s row', () => {
  beforeEach(async () => {
    await rememberPhoneRow(LEAD_ID, 'recPhone1');
  });

  it('the call-time pick lands on the caller\'s row', async () => {
    const res = await callTime.POST(pickCallTime('Evening'));
    expect(res.status).toBe(200);
    expect(upserted, 'wrote to the design\'s partial row').toEqual([]);
    expect(patched).toEqual([{ recordId: 'recPhone1', fields: { 'Preferred Call Time': 'Evening' } }]);
  });

  it('an email event lands on the caller\'s row', async () => {
    const res = await webhook.POST(emailEvent('email.opened'));
    expect(res.status).toBe(200);
    expect(upserted).toEqual([]);
    expect(patched).toHaveLength(1);
    expect(patched[0].recordId).toBe('recPhone1');
    expect(patched[0].fields['Email Status']).toBe('opened');
    expect(patched[0].fields['Email Opened At']).toBe('2026-09-26T15:00:00.000Z');
  });

  it('never writes Status, so a Test or a New stays what it was', async () => {
    phoneRowStatus = 'Test';
    await callTime.POST(pickCallTime());
    await webhook.POST(emailEvent('email.clicked'));
    expect(patched).toHaveLength(2);
    for (const p of patched) expect(p.fields).not.toHaveProperty('Status');
  });

  it('leaves the row alone once the caller is a Customer, and writes to the design row', async () => {
    phoneRowStatus = 'Customer';
    await callTime.POST(pickCallTime('Morning'));
    await webhook.POST(emailEvent('email.delivered'));
    expect(patched, 'touched a Customer row').toEqual([]);
    expect(upserted.map((u) => u.leadId)).toEqual([LEAD_ID, LEAD_ID]);
  });

  it('asks for a retry, rather than writing to the wrong row, when the caller\'s row can\'t be read', async () => {
    failRead = true;
    expect((await callTime.POST(pickCallTime())).status).toBe(502);
    expect((await webhook.POST(emailEvent())).status).toBe(502);
    expect(patched).toEqual([]);
    expect(upserted).toEqual([]);
  });

  it('keeps the link for thirty days, as long as the email\'s own', async () => {
    expect(store.get(PHONE_ROW_PREFIX + LEAD_ID)).toBe('recPhone1');
    const { PHONE_ROW_TTL_SECONDS } = await import('./leadRow');
    expect(PHONE_ROW_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
  });
});

describe('when there was no caller\'s row', () => {
  it('the call-time pick lands on the design\'s row, as today', async () => {
    const res = await callTime.POST(pickCallTime('Afternoon'));
    expect(res.status).toBe(200);
    expect(patched).toEqual([]);
    expect(upserted).toEqual([{ leadId: LEAD_ID, fields: { 'Preferred Call Time': 'Afternoon' } }]);
  });

  it('an email event lands on the design\'s row, as today', async () => {
    const res = await webhook.POST(emailEvent('email.bounced'));
    expect(res.status).toBe(200);
    expect(patched).toEqual([]);
    expect(upserted).toEqual([{ leadId: LEAD_ID, fields: { 'Email Status': 'bounced' } }]);
  });
});
