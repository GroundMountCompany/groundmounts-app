import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { __resetRateLimits } from '@/lib/guard';
import { priceFromInputs, parseQuoteInputs } from '@/lib/quoteInputs';
import { TX_FALLBACK_CURVE } from '@/lib/production';
import type { LeadFields } from '@/lib/airtableSchema';

/**
 * What actually reaches Airtable.
 *
 * The record the owner quotes from has to be one this server computed. These
 * capture the fields the route writes rather than trusting the payload it was
 * handed.
 */

const written: LeadFields[] = [];
const notifications: Array<{ html: string; subject: string }> = [];

vi.mock('@/lib/airtable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/airtable')>('@/lib/airtable');
  return {
    ...actual,
    createLead: async (fields: LeadFields) => {
      written.push(fields);
      return { id: 'recTest123' };
    },
  };
});

vi.mock('@/lib/resendSafe', () => ({
  getResendOrThrow: () => ({
    emails: {
      send: async (args: { html: string; subject: string }) => {
        notifications.push(args);
        return { data: { id: 'note' }, error: null };
      },
    },
  }),
}));

const { POST } = await import('./route');

const INPUTS = {
  panelCount: 16,
  tier: 'standard',
  trenchFeet: 113,
  batteryUnits: 0,
  needsClearing: false,
  slopePercent: 3,
  slopeTier: 'Flat',
  soilClass: 'clay loam',
  azimuth: 180,
  productionCurve: TX_FALLBACK_CURVE,
};

const validLead = (quoteExtra: Record<string, unknown> = {}) => ({
  id: 'lead-1234-5678',
  state: 'TX',
  name: 'Bert Ortiz',
  email: 'bert@example.com',
  phone: '469-555-0100',
  address: '123 Main St, Fort Worth, TX 76131',
  source: 'groundmounts.com',
  quote: {
    inputs: INPUTS,
    totalPanels: 16,
    trenchFeet: 113,
    azimuth: 180,
    percentage: 100,
    avgBill: 240,
    highBill: 320,
    ...quoteExtra,
  },
  ts: 1_700_000_000_000,
  honeypot: '',
  ttc_ms: 60_000,
});

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  written.length = 0;
  notifications.length = 0;
  __resetRateLimits();
  vi.stubEnv('AIRTABLE_API_KEY', 'test-key');
  vi.stubEnv('AIRTABLE_BASE_ID', 'appTest');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/leads', () => {
  it('writes the price it computed from the design', async () => {
    const res = await POST(post(validLead()));
    expect(res.status).toBe(200);
    expect(written).toHaveLength(1);

    const expected = priceFromInputs(parseQuoteInputs(INPUTS));
    const fields = written[0];

    expect(fields['Price Low']).toBe(expected.quote.low);
    expect(fields['Price High']).toBe(expected.quote.high);
    expect(fields['Equipment Cost Low']).toBe(expected.equipment.low);
    expect(fields['Equipment Cost High']).toBe(expected.equipment.high);
    expect(fields['Trenching Cost Low']).toBe(expected.trench.low);
    expect(fields['Trenching Cost High']).toBe(expected.trench.high);
    expect(fields['Line Items JSON']).toBe(JSON.stringify(expected.quote.lineItems));
    expect(fields['System Size kW']).toBe(expected.systemSizeKw);
    expect(fields['Slope Tier']).toBe(expected.quote.slopeTier);
    expect(fields.Panels).toBe(16);
    // Legacy single-value columns are midpoints of the same pair.
    expect(fields['Total Investment']).toBe(
      Math.round((expected.quote.low + expected.quote.high) / 2)
    );
  });

  it('ignores a price the client tried to name', async () => {
    // A tampered payload: real design, invented money.
    const res = await POST(
      post(
        validLead({
          priceLow: 1,
          priceHigh: 2,
          equipmentLow: 1,
          equipmentHigh: 1,
          trenchingLow: 1,
          trenchingHigh: 1,
          systemSizeKw: 999,
          lineItemsJson: '[{"key":"equipment","label":"Free solar","amount":1}]',
        })
      )
    );
    expect(res.status).toBe(200);

    const expected = priceFromInputs(parseQuoteInputs(INPUTS));
    const fields = written[0];

    expect(fields['Price Low']).toBe(expected.quote.low);
    expect(fields['Price Low']).not.toBe(1);
    expect(fields['Price High']).not.toBe(2);
    expect(fields['System Size kW']).not.toBe(999);
    expect(fields['Line Items JSON']).not.toContain('Free solar');

    // The owner's notification email reads from the same computed figures.
    expect(notifications).toHaveLength(1);
    expect(notifications[0].html).toContain(
      Math.round((expected.quote.low + expected.quote.high) / 2).toLocaleString()
    );
    expect(notifications[0].html).not.toContain('>$1<');
  });

  it('refuses a lead whose design is not a design', async () => {
    for (const inputs of [undefined, { ...INPUTS, panelCount: 0 }, { ...INPUTS, tier: 'free' }]) {
      __resetRateLimits();
      const res = await POST(post(validLead({ inputs })));
      expect(res.status, JSON.stringify(inputs)).toBe(400);
      expect((await res.json()).error).toBe('invalid_inputs');
    }
    expect(written, 'an invalid design still wrote a record').toHaveLength(0);
  });

  it('keeps its guards in front of the pricing', async () => {
    const honeypot = await POST(post({ ...validLead(), honeypot: 'bot' }));
    expect((await honeypot.json()).ignored).toBe(true);

    __resetRateLimits();
    const tooFast = await POST(post({ ...validLead(), ttc_ms: 10 }));
    expect((await tooFast.json()).error).toBe('too_fast');

    expect(written).toHaveLength(0);
  });
});
