import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The module reads its keys when it loads, so they go in first.
vi.stubEnv('AIRTABLE_API_KEY', 'test-key');
vi.stubEnv('AIRTABLE_BASE_ID', 'appTest');
const { leadIsMarkedTest } = await import('./airtable');

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
