import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { __resetRateLimits } from '@/lib/guard';
import { priceFromInputs, parseQuoteInputs } from '@/lib/quoteInputs';
import { TX_FALLBACK_CURVE } from '@/lib/production';
import type { LeadFields } from '@/lib/airtableSchema';
import type { SiteResponse } from '@/lib/server/siteLookup';

/**
 * What actually reaches Airtable.
 *
 * The record the owner quotes from has to be one this server computed. These
 * capture the fields the route writes rather than trusting the payload it was
 * handed.
 */

const written: LeadFields[] = [];
const notifications: Array<{ html?: string; subject: string; react?: ReactElement; to?: unknown }> =
  [];

/** The customer's quote email is the one sent as a React element. */
const quoteEmail = () => notifications.find((n) => n.react);
/** Whatever the customer would actually have read. */
const quoteHtml = () => renderToStaticMarkup(quoteEmail()!.react!);

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
      send: async (args: {
        html?: string;
        subject: string;
        react?: ReactElement;
        to?: unknown;
      }) => {
        notifications.push(args);
        if (failEmail) return { data: null, error: { message: 'resend is down' } };
        return { data: { id: 'note' }, error: null };
      },
    },
  }),
}));

/**
 * The site lookup, stubbed. The curve is nothing like the fallback and nothing
 * like anything a payload could claim, so production computed from it is
 * traceable to the server and only to the server.
 */
const SITE_CURVE = { 90: 1010, 135: 1110, 180: 1210, 225: 1110, 270: 1010 };
const curveCalls: Array<[number, number] | null> = [];

const NOTHING_KNOWN: SiteResponse = {
  curve: TX_FALLBACK_CURVE,
  curveSource: 'fallback',
  soilClass: null,
  soilSource: 'unavailable',
  slopePercent: null,
  slopeTier: 'Unknown',
  slopeSource: 'unavailable',
};

/** Set by the tests that need the mail to fail. */
let failEmail = false;

/** What the stubbed server "finds" on the ground. Overridden per test. */
let siteFacts: SiteResponse = { ...NOTHING_KNOWN, curve: SITE_CURVE, curveSource: 'pvwatts' };

vi.mock('@/lib/server/siteLookup', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/server/siteLookup')>('@/lib/server/siteLookup');
  return {
    ...actual,
    siteFactsForArray: async (arrayCenter: [number, number] | null) => {
      curveCalls.push(arrayCenter);
      return arrayCenter ? siteFacts : NOTHING_KNOWN;
    },
  };
});

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
  arrayCenter: [-97.3208, 32.7555] as [number, number],
};

const HOSTILE_CURVE = { 90: 9999, 135: 9999, 180: 9999, 225: 9999, 270: 9999 };

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
  curveCalls.length = 0;
  siteFacts = { ...NOTHING_KNOWN, curve: SITE_CURVE, curveSource: 'pvwatts' };
  failEmail = false;
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

    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);
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
    expect(fields['Est Annual Production kWh']).toBe(expected.annualProductionKwh);
    expect(fields['Curve Source']).toBe('pvwatts');
    expect(curveCalls).toEqual([INPUTS.arrayCenter]);
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

    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);
    const fields = written[0];

    expect(fields['Price Low']).toBe(expected.quote.low);
    expect(fields['Price Low']).not.toBe(1);
    expect(fields['Price High']).not.toBe(2);
    expect(fields['System Size kW']).not.toBe(999);
    expect(fields['Line Items JSON']).not.toContain('Free solar');

    // Two emails now go out per submit: the customer's quote and the owner's
    // notification. The owner's is the HTML one.
    expect(notifications).toHaveLength(2);
    const ownerNotice = notifications.find((n) => typeof n.html === 'string')!;
    expect(ownerNotice.html).toContain(
      Math.round((expected.quote.low + expected.quote.high) / 2).toLocaleString()
    );
    expect(ownerNotice.html).not.toContain('>$1<');
  });

  it('ignores a production curve in the payload', async () => {
    const res = await POST(
      post(validLead({ inputs: { ...INPUTS, productionCurve: HOSTILE_CURVE } }))
    );
    expect(res.status).toBe(200);

    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);
    expect(written[0]['Est Annual Production kWh']).toBe(expected.annualProductionKwh);
    expect(written[0]['Est Annual Production kWh']).toBeLessThan(30_000);
  });

  it('records the Texas fallback as the fallback when there are no coordinates', async () => {
    await POST(post(validLead({ inputs: { ...INPUTS, arrayCenter: null } })));

    const fallback = priceFromInputs(parseQuoteInputs({ ...INPUTS, arrayCenter: null }));
    expect(written[0]['Curve Source']).toBe('fallback');
    expect(written[0]['Est Annual Production kWh']).toBe(fallback.annualProductionKwh);
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

describe('site conditions are the server\'s to decide', () => {
  it('prices the ground it found, not the ground the payload claimed', async () => {
    // The payload says sand on the flat. The server finds rock on a steep
    // grade, both of which cost more, and the price has to reflect that.
    siteFacts = {
      curve: SITE_CURVE,
      curveSource: 'pvwatts',
      soilClass: 'rock outcrop',
      soilSource: 'ssurgo',
      slopePercent: 18,
      slopeTier: 'Steep',
      slopeSource: 'tilequery',
    };

    await POST(post(validLead({ inputs: { ...INPUTS, soilClass: 'sand', slopeTier: 'Flat', slopePercent: 1 } })));

    const asClaimed = priceFromInputs(
      parseQuoteInputs({ ...INPUTS, soilClass: 'sand', slopeTier: 'Flat', slopePercent: 1 }),
      SITE_CURVE
    );
    const asFound = priceFromInputs(
      parseQuoteInputs({ ...INPUTS, soilClass: 'rock outcrop', slopeTier: 'Steep', slopePercent: 18 }),
      SITE_CURVE
    );
    const fields = written[0];

    expect(fields['Price Low']).toBe(asFound.quote.low);
    expect(fields['Price High']).toBe(asFound.quote.high);
    expect(fields['Slope Tier']).toBe('Steep');
    expect(fields['Soil Class']).toBe('rock outcrop');
    expect(fields['Slope %']).toBe(18);
    expect(JSON.parse(fields['Line Items JSON'] as string).map((i: { key: string }) => i.key)).toEqual(
      asFound.quote.lineItems.map((i) => i.key)
    );

    // And the claimed ground would genuinely have been cheaper, so this is a
    // real override and not two numbers that happen to match.
    expect(asFound.quote.estimate).toBeGreaterThan(asClaimed.quote.estimate);
  });

  it('accepts the customer\'s answer only where the server has none', async () => {
    // Both lookups failed. The Flat/Rolling/Steep pick is all there is, and
    // dropping it would quietly price a steep parcel as if it were flat.
    siteFacts = { ...NOTHING_KNOWN, curve: SITE_CURVE, curveSource: 'pvwatts' };
  failEmail = false;

    await POST(
      post(
        validLead({
          inputs: { ...INPUTS, soilClass: 'caliche', slopeTier: 'Steep', slopePercent: null },
        })
      )
    );

    const expected = priceFromInputs(
      parseQuoteInputs({ ...INPUTS, soilClass: 'caliche', slopeTier: 'Steep', slopePercent: null }),
      SITE_CURVE
    );

    expect(written[0]['Slope Tier']).toBe('Steep');
    expect(written[0]['Soil Class']).toBe('caliche');
    expect(written[0]['Price Low']).toBe(expected.quote.low);
  });

  it('lets a server soil answer override a client one on its own', async () => {
    // Soil found, slope not: each is decided separately.
    siteFacts = {
      ...NOTHING_KNOWN,
      curve: SITE_CURVE,
      curveSource: 'pvwatts',
      soilClass: 'rock outcrop',
      soilSource: 'ssurgo',
    };

    // slopePercent null, so the manual pick is the only slope answer there is.
    // A measured grade always beats a picked tier, server or client.
    await POST(
      post(
        validLead({
          inputs: { ...INPUTS, soilClass: 'sand', slopeTier: 'Rolling', slopePercent: null },
        })
      )
    );

    expect(written[0]['Soil Class']).toBe('rock outcrop');
    expect(written[0]['Slope Tier']).toBe('Rolling');
  });
});

/** Digits only, so "$52,880" and 52880 compare the same. */
const money = (n: number) => n.toLocaleString('en-US');

describe('one request does the whole submit', () => {
  it('files the lead, sends the quote email and reports both', async () => {
    const res = await POST(post(validLead()));
    const body = await res.json();
    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      leadFiled: true,
      emailSent: true,
      priceLow: expected.quote.low,
      priceHigh: expected.quote.high,
    });

    // One Airtable write, one customer email, one owner notification.
    expect(written).toHaveLength(1);
    expect(notifications).toHaveLength(2);
    expect(quoteEmail()!.to).toEqual(['bert@example.com']);
  });

  it('renders the range, every line item and the estimate for the worked example', async () => {
    // Moved here wholesale when /api/sendEmail was merged in: the email is the
    // last place the numbers can go wrong before a customer reads them.
    await POST(post(validLead()));

    const html = quoteHtml();
    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);

    expect(html).toContain(money(expected.quote.low));
    expect(html).toContain(money(expected.quote.high));

    expect(expected.quote.lineItems.length).toBeGreaterThan(0);
    for (const item of expected.quote.lineItems) {
      expect(html, `missing line item ${item.label}`).toContain(item.label);
      expect(html, `missing amount for ${item.label}`).toContain(money(item.amount));
    }

    expect(html).toContain(money(expected.quote.estimate));
    expect(
      expected.quote.lineItems.reduce((t, i) => t + i.amount, 0),
      'the rendered items do not add up to the rendered estimate'
    ).toBe(expected.quote.estimate);

    expect(html).toContain(String(INPUTS.panelCount));
    expect(html).toContain(`${expected.systemSizeKw} kW`);
    expect(html).toContain(`${INPUTS.trenchFeet} ft`);
    expect(html).toContain(expected.annualProductionKwh.toLocaleString());
  });

  it('shows the customer the same number it writes to Airtable', async () => {
    // The reason the two routes became one: there is now a single priceQuote
    // call behind both, so they cannot disagree.
    await POST(post(validLead()));

    const html = quoteHtml();
    expect(html).toContain(money(written[0]['Price Low'] as number));
    expect(html).toContain(money(written[0]['Price High'] as number));
  });

  it('keeps the lead when the email fails, and says so', async () => {
    failEmail = true;
    const res = await POST(post(validLead()));
    const body = await res.json();

    // The lead is the thing the business cannot recover. It is filed.
    expect(res.status).toBe(200);
    expect(written).toHaveLength(1);
    expect(body.leadFiled).toBe(true);
    expect(body.emailSent).toBe(false);
  });

  it('resends the email without writing a second record', async () => {
    await POST(post(validLead()));
    expect(written).toHaveLength(1);

    __resetRateLimits();
    const res = await POST(post({ ...validLead(), resend: true }));
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, leadFiled: true, emailSent: true });
    expect(written, 'a resend wrote a second Airtable record').toHaveLength(1);
    // Two quote emails, one owner notification: the resend sends only the
    // customer's copy.
    expect(notifications.filter((n) => n.react)).toHaveLength(2);
    expect(notifications.filter((n) => n.html)).toHaveLength(1);
  });

  it('reports a failed resend rather than claiming it went', async () => {
    failEmail = true;
    const res = await POST(post({ ...validLead(), resend: true }));

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ leadFiled: true, emailSent: false });
    expect(written, 'a resend wrote a record').toHaveLength(0);
  });

  it('prices a resend from the same inputs, so a retry cannot change the quote', async () => {
    await POST(post({ ...validLead(), resend: true }));
    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);
    expect(quoteHtml()).toContain(money(expected.quote.low));
  });
});
