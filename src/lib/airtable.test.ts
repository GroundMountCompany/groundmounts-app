import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The module reads its keys when it loads, so they go in first.
vi.stubEnv('AIRTABLE_API_KEY', 'test-key');
vi.stubEnv('AIRTABLE_BASE_ID', 'appTest');
const { leadIsMarkedTest, findPhoneLeads, pickPhoneLead, last10 } = await import('./airtable');

const requests: string[] = [];
let reply: { ok: boolean; status: number; body: unknown };

beforeEach(() => {
  requests.length = 0;
  reply = { ok: true, status: 200, body: { records: [] } };
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
    return {
      ok: reply.ok,
      status: reply.status,
      json: async () => reply.body,
      text: async () => JSON.stringify(reply.body),
    };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('leadIsMarkedTest', () => {
  it('asks for one row by Lead ID, Status only', async () => {
    await leadIsMarkedTest('2b9d6d7e-1f4a-4f8b-8c21-9a7d5e3f0b11');
    const url = new URL(requests[0]);
    expect(url.pathname).toBe('/v0/appTest/Leads');
    expect(url.searchParams.get('filterByFormula')).toBe(
      "{Lead ID}='2b9d6d7e-1f4a-4f8b-8c21-9a7d5e3f0b11'"
    );
    expect(url.searchParams.get('maxRecords')).toBe('1');
    expect(url.searchParams.getAll('fields[]')).toEqual(['Status']);
  });

  it('is true only when the row says Test', async () => {
    reply.body = { records: [{ fields: { Status: 'Test' } }] };
    expect(await leadIsMarkedTest('a')).toBe(true);
    reply.body = { records: [{ fields: { Status: 'Partial' } }] };
    expect(await leadIsMarkedTest('a')).toBe(false);
    reply.body = { records: [] };
    expect(await leadIsMarkedTest('a')).toBe(false);
  });

  it("can't be talked out of its formula by a quote in the id", async () => {
    await leadIsMarkedTest("x' OR TRUE() OR '");
    const formula = new URL(requests[0]).searchParams.get('filterByFormula');
    expect(formula).toBe("{Lead ID}='x\\' OR TRUE() OR \\''");
  });

  it('throws when Airtable says no', async () => {
    reply = { ok: false, status: 503, body: { error: { type: 'SERVER_ERROR' } } };
    await expect(leadIsMarkedTest('a')).rejects.toThrow('Airtable error: 503');
  });
});

describe('findPhoneLeads', () => {
  it("matches the phone agent's rows on the last ten digits, Status and Notes only", async () => {
    await findPhoneLeads('+1 (469) 555-0100');
    const url = new URL(requests[0]);
    expect(url.pathname).toBe('/v0/appTest/Leads');
    expect(url.searchParams.get('filterByFormula')).toBe(
      `AND(RIGHT(REGEX_REPLACE({Phone}&"", "[^0-9]", ""), 10)='4695550100', ` +
        `OR({Source}='Phone call', {Source}='Text message'))`
    );
    expect(url.searchParams.getAll('fields[]')).toEqual(['Status', 'Notes']);
  });

  it('asks nothing for a number with fewer than ten digits', async () => {
    expect(await findPhoneLeads('555-0100')).toEqual([]);
    expect(requests).toEqual([]);
  });

  it('puts nothing but digits into the formula, whatever was typed', async () => {
    await findPhoneLeads("4695550100' OR TRUE() OR '");
    const formula = new URL(requests[0]).searchParams.get('filterByFormula')!;
    expect(formula).not.toContain('TRUE()');
  });

  it('throws when Airtable says no', async () => {
    reply = { ok: false, status: 503, body: { error: { type: 'SERVER_ERROR' } } };
    await expect(findPhoneLeads('4695550100')).rejects.toThrow('Airtable error: 503');
  });
});

describe('last10', () => {
  it('keeps the last ten digits of any format', () => {
    expect(last10('+1 (469) 555-0100')).toBe('4695550100');
    expect(last10('469.555.0100')).toBe('4695550100');
    expect(last10('555-0100')).toBeNull();
    expect(last10(undefined)).toBeNull();
  });
});

describe('pickPhoneLead', () => {
  const NOW = Date.parse('2026-09-26T12:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;
  const row = (id: string, daysAgo: number, Status = 'Contacted') => ({
    id,
    createdTime: new Date(NOW - daysAgo * DAY).toISOString(),
    fields: { Status },
  });

  it('takes the newest row inside 30 days', () => {
    const rows = [row('recA', 25), row('recB', 3), row('recC', 40)];
    expect(pickPhoneLead(rows, { now: NOW, fromAgentLink: false })?.id).toBe('recB');
  });

  it('takes nothing older than 30 days for an ordinary design', () => {
    expect(pickPhoneLead([row('recA', 31)], { now: NOW, fromAgentLink: false })).toBeNull();
  });

  it("takes a row of any age when the design came from the agent's link", () => {
    expect(pickPhoneLead([row('recA', 200)], { now: NOW, fromAgentLink: true })?.id).toBe('recA');
  });

  it('takes nothing when the number belongs to a Customer', () => {
    const rows = [row('recA', 2), row('recB', 100, 'Customer')];
    expect(pickPhoneLead(rows, { now: NOW, fromAgentLink: true })).toBeNull();
  });

  it('takes nothing from nothing', () => {
    expect(pickPhoneLead([], { now: NOW, fromAgentLink: true })).toBeNull();
  });
});
