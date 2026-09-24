import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetRateLimits } from '@/lib/guard';
import { signUnsubscribe } from '@/lib/server/unsubscribeToken';
import type { LeadFields } from '@/lib/airtableSchema';
import { GET, POST } from './route';

vi.mock('@/lib/server/redis', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/redis')>('@/lib/server/redis');
  return { ...actual, redis: () => null };
});

/** The owner's base, stubbed: one row per record id. */
const rows = new Map<string, Record<string, unknown>>();
const writes: Array<{ id: string; fields: LeadFields }> = [];
let airtableDown = false;

vi.mock('@/lib/airtable', () => ({
  getLeadRecord: async (id: string) => {
    if (airtableDown) throw new Error('Airtable error: 503');
    if (!rows.has(id)) throw new Error('Airtable error: 404');
    return rows.get(id)!;
  },
  updateLeadRecord: async (id: string, fields: LeadFields) => {
    if (airtableDown) throw new Error('Airtable error: 503');
    writes.push({ id, fields });
    rows.set(id, { ...rows.get(id), ...fields });
  },
}));


const LEAD = 'recAbCdEfGhIjKlMn';
const OTHER = 'recZyXwVuTsRqPoNm';

const url = (t: string) => `https://groundmounts-app.vercel.app/unsubscribe?t=${encodeURIComponent(t)}`;
const get = (t: string) => GET(new Request(url(t)));
const post = (t: string, ip = '1.2.3.4') =>
  POST(
    new Request(url(t), {
      method: 'POST',
      headers: { 'x-forwarded-for': ip, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    })
  );

describe('/unsubscribe', () => {
  const original = process.env.UNSUBSCRIBE_SECRET;
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'test-secret-not-the-real-one';
    rows.clear();
    rows.set(LEAD, { Name: 'Pat', Status: 'Quoted' });
    rows.set(OTHER, { Name: 'Sam', Status: 'New' });
    writes.length = 0;
    airtableDown = false;
    __resetRateLimits();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = original;
  });

  it('opening the link changes nothing: it shows one button', async () => {
    // Mail scanners open every link. Opening must not be unsubscribing.
    const res = await get(signUnsubscribe(LEAD)!);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<form method="post"');
    expect(html).toContain('Unsubscribe</button>');
    expect(writes).toEqual([]);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('the button marks that lead, and only that lead', async () => {
    const res = await post(signUnsubscribe(LEAD)!);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('You’re unsubscribed.');
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe(LEAD);
    expect(writes[0].fields.email_status).toBe('unsubscribed');
    expect(writes[0].fields.disqualify_reason).toMatch(/^asked not to be contacted \(email, \d{4}-\d{2}-\d{2}\)$/);
    // Status is the owner's call, not ours.
    expect(rows.get(LEAD)!.Status).toBe('Quoted');
    expect(rows.get(OTHER)).toEqual({ Name: 'Sam', Status: 'New' });
  });

  it('clicking twice writes once', async () => {
    const token = signUnsubscribe(LEAD)!;
    await post(token);
    const again = await post(token);
    expect(again.status).toBe(200);
    expect(writes).toHaveLength(1);
  });

  it("refuses somebody else's id with a real signature on it", async () => {
    const [, sig] = signUnsubscribe(LEAD)!.split('.');
    const res = await post(`${OTHER}.${sig}`);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('That link didn’t work.');
    expect(writes).toEqual([]);
  });

  it('refuses a missing or junk token on both methods', async () => {
    for (const t of ['', 'nope', `${LEAD}.abc`]) {
      expect((await get(t)).status, t).toBe(400);
      expect((await post(t)).status, t).toBe(400);
    }
    expect(writes).toEqual([]);
  });

  it('refuses every link when the secret is not set', async () => {
    const token = signUnsubscribe(LEAD)!;
    delete process.env.UNSUBSCRIBE_SECRET;
    expect((await post(token)).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('says so plainly when Airtable is down, rather than pretending', async () => {
    airtableDown = true;
    const res = await post(signUnsubscribe(LEAD)!);
    expect(res.status).toBe(502);
    expect(await res.text()).toContain('reply to any email from us');
  });

  it('rate-limits before checking the signature', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post('junk', '9.9.9.9')).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[11]).toBe(429);
  });
});
