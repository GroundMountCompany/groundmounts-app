import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { projectResults } from '@/lib/results';
import { RESULTS } from '@/config/results';
import type { ReactElement } from 'react';
import { __resetRateLimits } from '@/lib/guard';
import { priceFromInputs, parseQuoteInputs } from '@/lib/quoteInputs';
import { TX_FALLBACK_CURVE } from '@/lib/production';
import type { LeadFields } from '@/lib/airtableSchema';
import type { SiteResponse } from '@/lib/server/siteLookup';

/** The durable store, stubbed. Real Redis is not a unit-test dependency. */
const store = new Map<string, unknown>();
/** Flipped on by the cases that need a configured-but-unreachable store. */
let storeDown = false;

vi.mock('@/lib/server/redis', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/redis')>('@/lib/server/redis');
  const failIfDown = (op: string) => {
    if (storeDown) throw new actual.StoreUnavailable(op, new Error('ECONNREFUSED'));
  };
  return {
    ...actual,
    redis: () => null,
    storeGet: async (key: string) => {
      failIfDown('get');
      return store.get(key) ?? null;
    },
    storeSet: async (key: string, value: unknown) => {
      failIfDown('set');
      store.set(key, value);
    },
    acquireLease: async (key: string) => {
      failIfDown('lease');
      if (store.has(key)) return null;
      const token = `token-${store.size}`;
      store.set(key, token);
      return token;
    },
    releaseLease: async (key: string, token: string) => {
      if (store.get(key) === token) store.delete(key);
    },
    cacheGet: async () => null,
    cacheSet: async () => undefined,
  };
});

/**
 * What actually reaches Airtable.
 *
 * The record the owner quotes from has to be one this server computed. These
 * capture the fields the route writes rather than trusting the payload it was
 * handed.
 */

const written: LeadFields[] = [];
const notifications: Array<{
  html?: string;
  subject: string;
  react?: ReactElement;
  to?: unknown;
  from?: string;
  replyTo?: string;
  idempotencyKey?: string;
}> = [];

/** The customer's quote email is the one sent as a React element. */
const quoteEmail = () => notifications.find((n) => n.react);
/** Whatever the customer would actually have read. */
const quoteHtml = () => renderToStaticMarkup(quoteEmail()!.react!);

vi.mock('@/lib/airtable', async () => {
  const actual = await vi.importActual<typeof import('@/lib/airtable')>('@/lib/airtable');
  return {
    ...actual,
    upsertLeadByLeadId: async (fields: LeadFields, leadId: string) => {
      if (failWrite) throw new Error('Airtable error: 503 - upstream');
      if (failAttach && fields['Map Screenshot']) {
        throw new Error('Airtable error: 422 - attachment rejected');
      }
      written.push({ ...fields, 'Lead ID': leadId });
      return { id: 'recTest123', created: true };
    },
  };
});

/** Blob uploads, counted. Nothing should reach storage before Airtable agrees. */
const blobs: string[] = [];
/** Blobs deleted again, so an orphan can be told from a kept one. */
const deletedBlobs: string[] = [];
vi.mock('@vercel/blob', () => ({
  put: async (key: string) => {
    blobs.push(key);
    return { url: `https://blob.example/${key}` };
  },
  del: async (url: string) => {
    deletedBlobs.push(url);
  },
}));

vi.mock('@/lib/resendSafe', () => ({
  getResendOrThrow: () => ({
    emails: {
      send: async (
        args: {
          html?: string;
          subject: string;
          react?: ReactElement;
          to?: unknown;
          from?: string;
          replyTo?: string;
        },
        options?: { idempotencyKey?: string }
      ) => {
        notifications.push({ ...args, idempotencyKey: options?.idempotencyKey });
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
/** Set by the tests that need Airtable to fail. */
let failWrite = false;
/** Set by the test that needs only the attachment patch to fail. */
let failAttach = false;

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
  slopeAnswer: 'flat',
  rocky: false,
  batteryInterest: false,
  slopePercent: 3,
  slopeTier: 'Flat',
  soilClass: 'clay loam',
  azimuth: 180,
  arrayCenter: [-97.3208, 32.7555] as [number, number],
};

const HOSTILE_CURVE = { 90: 9999, 135: 9999, 180: 9999, 225: 9999, 270: 9999 };

const validLead = (quoteExtra: Record<string, unknown> = {}) => ({
  id: '8f14e45f-ceea-467a-9f34-2c8c3b1a77de',
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
  blobs.length = 0;
  deletedBlobs.length = 0;
  failAttach = false;
  store.clear();
  storeDown = false;
  failWrite = false;
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
    expect(fields['Slope Tier']).toBe('Flat');
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
  it('records the ground it found, and prices the ground the customer described', async () => {
    // From Phase 9 the survey is evidence for the owner, not an input to the
    // price. The customer standing on the land answers three questions and
    // those answers are what the number is built from — a DEM tile sampled at
    // 200 ft has no way to know about the ledge under the corner of the field.
    siteFacts = {
      curve: SITE_CURVE,
      curveSource: 'pvwatts',
      soilClass: 'rock outcrop',
      soilSource: 'ssurgo',
      slopePercent: 18,
      slopeTier: 'Steep',
      slopeSource: 'tilequery',
    };

    // The survey says steep and rocky. The customer says flat and not rocky.
    await POST(post(validLead({ inputs: { ...INPUTS, slopeAnswer: 'flat', rocky: false } })));

    const asAnswered = priceFromInputs(
      parseQuoteInputs({ ...INPUTS, slopeAnswer: 'flat', rocky: false }),
      SITE_CURVE
    );
    const fields = written[0];

    // Priced on the answer.
    expect(fields['Price Low']).toBe(asAnswered.quote.low);
    expect(fields['Price High']).toBe(asAnswered.quote.high);
    expect(
      JSON.parse(fields['Line Items JSON'] as string).map((i: { key: string }) => i.key)
    ).toEqual(['equipment', 'trench']);

    // And the survey is on the record anyway, so the owner can see where the
    // customer disagreed with the map before anybody drives out there.
    expect(fields['Slope Tier']).toBe('Steep');
    expect(fields['Soil Class']).toBe('rock outcrop');
    expect(fields['Slope %']).toBe(18);
    expect(fields['Slope Answer']).toBe('Flat');
    expect(fields.Rocky).toBe(false);
  });

  it('prices what the customer answered, whatever the survey said', async () => {
    // The mirror image: the survey finds nothing at all and the customer says
    // the ground is steep and rocky. Both adders apply.
    siteFacts = { ...NOTHING_KNOWN, curve: SITE_CURVE, curveSource: 'pvwatts' };
    failEmail = false;

    await POST(post(validLead({ inputs: { ...INPUTS, slopeAnswer: 'big', rocky: true } })));

    const answered = priceFromInputs(
      parseQuoteInputs({ ...INPUTS, slopeAnswer: 'big', rocky: true }),
      SITE_CURVE
    );
    const plain = priceFromInputs(
      parseQuoteInputs({ ...INPUTS, slopeAnswer: 'flat', rocky: false }),
      SITE_CURVE
    );
    const fields = written[0];

    expect(fields['Price Low']).toBe(answered.quote.low);
    expect(
      JSON.parse(fields['Line Items JSON'] as string).map((i: { key: string }) => i.key)
    ).toEqual(['equipment', 'trench', 'slope', 'soil']);
    // Genuinely dearer, so this is a real adder rather than two numbers that
    // happen to agree.
    expect(answered.quote.estimate).toBeGreaterThan(plain.quote.estimate);

    expect(fields['Slope Answer']).toBe('Big');
    expect(fields.Rocky).toBe(true);
  });

  it('refuses a slope answer it does not recognise', async () => {
    // The only three site figures a browser can move are bounded here: an
    // invented answer is a tampered payload, not a lead.
    const res = await POST(
      post(validLead({ inputs: { ...INPUTS, slopeAnswer: 'vertical' } }))
    );
    expect(res.status).toBe(400);
    expect(written).toHaveLength(0);
  });

  it('records battery interest without pricing it', async () => {
    failEmail = false;
    await POST(post(validLead({ inputs: { ...INPUTS, batteryInterest: true } })));

    const withInterest = priceFromInputs(
      parseQuoteInputs({ ...INPUTS, batteryInterest: true }),
      SITE_CURVE
    );
    const without = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);

    expect(written[0]['Battery Interest']).toBe(true);
    expect(written[0]['Battery Units']).toBe(0);
    expect(withInterest.quote.estimate).toBe(without.quote.estimate);
    expect(
      JSON.parse(written[0]['Line Items JSON'] as string).some(
        (i: { key: string }) => i.key === 'battery'
      )
    ).toBe(false);
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

  it('finishes a lead whose email failed, without writing a second record', async () => {
    failEmail = true;
    await POST(post(validLead()));
    expect(written).toHaveLength(1);
    notifications.length = 0;

    failEmail = false;
    __resetRateLimits();
    const res = await POST(post({ ...validLead(), resend: true }));
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, leadFiled: true, emailSent: true });
    expect(written, 'a resend wrote a second Airtable record').toHaveLength(1);
    expect(notifications.filter((n) => n.react)).toHaveLength(1);
    // The owner's copy failed with the customer's the first time round, so the
    // resend finishes both halves.
    expect(notifications.filter((n) => n.html)).toHaveLength(1);
  });
});

describe('partial saves', () => {
  const partial = (extra: Record<string, unknown> = {}) => ({
    partial: true,
    id: '2b9d6d7e-1f4a-4f8b-8c21-9a7d5e3f0b11',
    stepReached: 4,
    source: 'groundmounts.com',
    coordinates: { latitude: 32.7555, longitude: -97.3208 },
    inputs: INPUTS,
    ...extra,
  });

  it('writes the design and where it is, and no PII at all', async () => {
    // The payload deliberately carries contact details. A partial save must
    // drop them on the floor: the guarantee is what the handler writes, not
    // what the client happened to send.
    const res = await POST(
      post(
        partial({
          name: 'Bert Ortiz',
          email: 'bert@example.com',
          phone: '469-555-0100',
          address: '123 Main St, Fort Worth, TX 76131',
        })
      )
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, partial: true, stepReached: 4 });

    const fields = written[0];
    expect(fields['Lead ID']).toBe('2b9d6d7e-1f4a-4f8b-8c21-9a7d5e3f0b11');
    expect(fields['Step Reached']).toBe(4);
    expect(fields.Status).toBe('Partial');
    expect(fields.Panels).toBe(16);
    expect(fields.Latitude).toBe(32.7555);

    // The whole point: an abandoned funnel leaves an anonymous design.
    for (const pii of ['Name', 'Email', 'Phone', 'Address', 'City', 'Zip'] as const) {
      expect(fields[pii], `a partial save carried ${pii}`).toBeUndefined();
    }
    // And no price: nobody has been quoted anything yet.
    expect(fields['Price Low']).toBeUndefined();
    expect(fields['Price High']).toBeUndefined();
  });

  it('saves a step 1 with coordinates and no design yet', async () => {
    const res = await POST(post(partial({ stepReached: 1, inputs: undefined })));

    expect(res.status).toBe(200);
    expect(written[0]['Step Reached']).toBe(1);
    expect(written[0].Latitude).toBe(32.7555);
    expect(written[0].Panels).toBeUndefined();
  });

  it('is not held to the minimum-time guard', async () => {
    // A partial at step 1 happens seconds after arriving. Judging it like a
    // final submit would throw away every design from someone who moves fast.
    const res = await POST(post({ ...partial(), ttc_ms: 200 }));
    expect(res.status).toBe(200);
  });

  it('refuses a partial with no usable lead id or step', async () => {
    expect((await POST(post(partial({ id: 'x' })))).status).toBe(400);
    __resetRateLimits();
    expect((await POST(post(partial({ stepReached: 99 })))).status).toBe(400);
    expect(written).toHaveLength(0);
  });

  it('sends no email of any kind', async () => {
    await POST(post(partial()));
    expect(notifications, 'a partial save emailed somebody').toHaveLength(0);
  });
});

describe('submitting twice', () => {
  it('replays the first answer and writes nothing the second time', async () => {
    const first = await POST(post(validLead()));
    const firstBody = await first.json();

    __resetRateLimits();
    const second = await POST(post(validLead()));
    const secondBody = await second.json();

    expect(secondBody).toMatchObject({
      leadFiled: true,
      emailSent: true,
      priceLow: firstBody.priceLow,
      priceHigh: firstBody.priceHigh,
      duplicate: true,
    });

    // One record, one customer email, one owner notification.
    expect(written, 'a double submit wrote two records').toHaveLength(1);
    expect(notifications, 'a double submit sent more mail').toHaveLength(2);
  });

  it('does not re-send for a lead whose email already went', async () => {
    await POST(post(validLead()));
    expect(notifications.filter((n) => n.react)).toHaveLength(1);
    __resetRateLimits();

    const res = await POST(post({ ...validLead(), resend: true }));

    expect(await res.json()).toMatchObject({ emailSent: true, duplicate: true });
    expect(written).toHaveLength(1);
    expect(
      notifications.filter((n) => n.react),
      'a resend sent a second copy of an email that had already arrived'
    ).toHaveLength(1);
  });

  it('does not remember a submit that failed, so it can be retried', async () => {
    failEmail = true;
    await POST(post(validLead()));
    expect(written).toHaveLength(1);

    // The email failed, so the result is not cached as final: the retry path
    // is the resend, and a fresh submit is still allowed to do its work.
    failEmail = false;
    __resetRateLimits();
    const retry = await POST(post({ ...validLead(), resend: true }));
    expect(await retry.json()).toMatchObject({ emailSent: true });
  });
});

describe('the twenty-five year comparison', () => {
  it('reaches the email as a table, and the record as two figures', async () => {
    await POST(post(validLead()));

    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);
    const model = projectResults({
      monthlyBillUsd: validLead().quote!.avgBill as number,
      systemPriceUsd: expected.quote.estimate,
      offsetFraction: (validLead().quote!.percentage as number) / 100,
      inflationPct: RESULTS.utilityInflationPct,
      startYear: new Date().getFullYear(),
    });

    const html = quoteHtml();
    expect(html).toContain('What it costs to do nothing');
    expect(html, 'the utility total is missing').toContain(
      model.totalWithout.toLocaleString('en-US')
    );
    expect(html, 'the year-25 line is missing').toContain(String(model.final.calendarYear));
    // The assumption the whole table rests on is stated in it.
    expect(html).toContain(`${RESULTS.utilityInflationPct}% a year`);
    // Static, not a chart: an inbox cannot run one and a rendered image is one
    // more thing that arrives broken.
    expect(html).not.toContain('<svg');

    expect(written[0]['Break Even Year']).toBe(model.breakEvenYear);
    expect(written[0]['Utility Inflation Pct']).toBe(RESULTS.utilityInflationPct);
  });

  it('uses the rate the customer chose, bounded to the slider', async () => {
    failEmail = false;
    await POST(
      post(validLead({ utilityInflationPct: 7 }))
    );

    expect(written[0]['Utility Inflation Pct']).toBe(7);
    expect(quoteHtml()).toContain('7% a year');
  });

  it('refuses a rate outside the slider rather than emailing it', async () => {
    // The figure goes into the customer's inbox and onto the record, so a
    // payload claiming 400% a year must reach neither.
    failEmail = false;
    await POST(
      post(validLead({ utilityInflationPct: 400 }))
    );

    expect(written[0]['Utility Inflation Pct']).toBe(RESULTS.utilityInflationPct);
    expect(quoteHtml()).not.toContain('400%');
  });

  it('says nothing at all when there is no bill to compare against', async () => {
    failEmail = false;
    await POST(post(validLead({ avgBill: 0 })));

    expect(quoteHtml()).not.toContain('What it costs to do nothing');
    expect(written[0]['Break Even Year']).toBeUndefined();
  });
});

describe('the brand on the email', () => {
  it('is the build default when nothing asks for another', async () => {
    await POST(post(validLead()));

    const quote = quoteEmail() as unknown as { from: string; replyTo: string; subject: string };
    expect(quote.from).toContain('quotes@groundmounts.com');
    expect(quote.subject).toContain('The Ground Mount Company');
  });

  it('leads with a logo an inbox can actually fetch', async () => {
    // The header pointed at /logos/groundmount-company.png — a relative path
    // with no file behind it — so every quote email opened with a broken image
    // icon where the sender's name should be. An inbox has no origin to
    // resolve a path against, so this has to be absolute.
    await POST(post({ ...validLead(), mapScreenshot: undefined }));
    const html = quoteHtml();

    expect(html, 'the dead logo path is back').not.toContain('/logos/');
    expect(html).toContain('https://www.groundmounts.com/images/logo-email.png');
    expect(html, 'the logo is a relative path again').not.toMatch(/src="\/[^/]/);

    // Above the heading, where a header belongs.
    expect(
      html.indexOf('logo-email.png'),
      'the logo is not at the top of the email'
    ).toBeLessThan(html.indexOf('Your ground mount estimate'));

    // And the brand name is the alt text, so an inbox that blocks remote
    // images still says who the mail is from.
    expect(html).toMatch(/<img[^>]*alt="The Ground Mount Company"/);
  });

  it('honours an explicit brand', async () => {
    await POST(post({ ...validLead(), brand: 'neutral' }));

    const quote = quoteEmail() as unknown as { from: string; subject: string };
    // Same verified sending domain, neutral display name.
    expect(quote.from).toContain('quotes@groundmounts.com');
    expect(quote.from).toContain('Ground Mount Solar');
    expect(quote.subject).toContain('Ground Mount Solar');
    expect(quote.subject).not.toContain('The Ground Mount Company');
  });

  it('never lets attribution choose the brand', async () => {
    // ?source= says which partner sent the visitor. If it could also pick the
    // brand, any URL could decide what a customer's email claimed to be from.
    await POST(
      post({ ...validLead(), source: 'neutral', brand: undefined })
    );

    const quote = quoteEmail() as unknown as { subject: string };
    expect(quote.subject).toContain('The Ground Mount Company');

    // And the attribution is still recorded, because that is what it is for.
    expect(written[0].Source).toBe('neutral');
  });

  it('falls back to the default for a brand that does not exist', async () => {
    await POST(post({ ...validLead(), brand: 'texasgroundmountsolar' }));

    const quote = quoteEmail() as unknown as { from: string; subject: string };
    expect(quote.subject).toContain('The Ground Mount Company');
    expect(quote.from).toContain('quotes@groundmounts.com');
  });
});

describe('resending is not a way to send mail', () => {
  it('refuses a resend for a lead it has never heard of', async () => {
    const res = await POST(post({ ...validLead(), id: '00000000-0000-4000-8000-000000000001', resend: true }));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('no_such_lead');
    expect(notifications, 'a resend for an unknown lead sent mail').toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it('sends to the stored address, not the one in the request', async () => {
    // The attack: file a lead, then ask for it again with somebody else's
    // address in the body and use our verified domain to mail a stranger.
    failEmail = true;
    await POST(post(validLead()));
    expect(quoteEmail()).toBeTruthy();
    notifications.length = 0;

    failEmail = false;
    __resetRateLimits();
    const res = await POST(
      post({
        ...validLead(),
        resend: true,
        email: 'attacker@example.com',
        address: 'Somewhere else entirely',
      })
    );

    expect(res.status).toBe(200);
    const sent = notifications.filter((n) => n.react);
    expect(sent, 'a resend sent more than one email').toHaveLength(1);
    expect(sent[0].to).toEqual(['bert@example.com']);
    expect(sent[0].to).not.toEqual(['attacker@example.com']);
  });

  it('prices a resend from what was stored, not from the request body', async () => {
    failEmail = true;
    await POST(post(validLead()));
    const filedLow = written[0]['Price Low'];
    notifications.length = 0;

    failEmail = false;
    __resetRateLimits();
    await POST(
      post({
        ...validLead(),
        resend: true,
        quote: { inputs: { ...INPUTS, panelCount: 400 } },
      })
    );

    const html = quoteHtml();
    expect(html).toContain((filedLow as number).toLocaleString('en-US'));
    // 400 panels would be an order of magnitude more.
    expect(html).not.toContain('400 x');
  });

  it('flips emailSent so a second resend does not send twice', async () => {
    failEmail = true;
    await POST(post(validLead()));
    notifications.length = 0;

    failEmail = false;
    __resetRateLimits();
    await POST(post({ ...validLead(), resend: true }));
    __resetRateLimits();
    const again = await POST(post({ ...validLead(), resend: true }));

    expect(await again.json()).toMatchObject({ emailSent: true, duplicate: true });
    expect(notifications.filter((n) => n.react), 'the second resend sent again').toHaveLength(1);
  });

  it('reports a failed resend as retryable, and keeps the lead unsent', async () => {
    failEmail = true;
    await POST(post(validLead()));
    __resetRateLimits();

    const res = await POST(post({ ...validLead(), resend: true }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ leadFiled: true, emailSent: false });
  });
});

describe('lease, then commit', () => {
  it('releases the lease when Airtable fails, so the retry works immediately', async () => {
    failWrite = true;
    const first = await POST(post(validLead()));

    expect(first.status).toBe(502);
    expect(await first.json()).toMatchObject({ leadFiled: false, error: 'lead_not_saved' });
    expect(written).toHaveLength(0);

    // Immediately, not in sixty seconds: the customer is still standing there.
    failWrite = false;
    __resetRateLimits();
    const retry = await POST(post(validLead()));

    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ leadFiled: true, emailSent: true });
    expect(written).toHaveLength(1);
  });

  it('answers 503 when the store is down, and writes nothing', async () => {
    storeDown = true;
    const res = await POST(post(validLead()));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('store_unavailable');
    expect(written, 'a lead was written without a durable record').toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });

  it('never answers 400 for an infrastructure failure', async () => {
    // 4xx tells the queue the payload is bad and it drops the lead. Airtable
    // being down is not the customer's fault and must not lose their design.
    failWrite = true;
    expect((await POST(post(validLead()))).status).toBeGreaterThanOrEqual(500);

    __resetRateLimits();
    storeDown = true;
    expect((await POST(post(validLead()))).status).toBeGreaterThanOrEqual(500);
  });

  it('files one record when two submits land together', async () => {
    // The loser waits for the lease, then finds the record the winner wrote
    // and replays it. Waiting rather than refusing matters because partials
    // hold this lease too, and a 4xx would make the queue drop the lead.
    failEmail = false;
    const [first, second] = await Promise.all([
      POST(post(validLead())),
      POST(post(validLead())),
    ]);

    const bodies = await Promise.all([first.json(), second.json()]);
    expect(written, 'two concurrent submits wrote two records').toHaveLength(1);

    // One did the work; the other replayed it. Both got the same answer.
    expect(bodies.filter((b) => b.duplicate)).toHaveLength(1);
    expect(bodies[0].priceLow).toBe(bodies[1].priceLow);
    expect(notifications.filter((n) => n.react), 'two customer emails').toHaveLength(1);
  });
});

describe('sending the same email twice', () => {
  it('gives the customer copy a key derived from the lead', async () => {
    await POST(post(validLead()));

    const quote = quoteEmail() as unknown as { idempotencyKey?: string };
    expect(quote.idempotencyKey).toBe('gm:quote:8f14e45f-ceea-467a-9f34-2c8c3b1a77de');

    const owner = notifications.find((n) => n.html);
    expect(owner?.idempotencyKey).toBe('gm:owner-notify:8f14e45f-ceea-467a-9f34-2c8c3b1a77de');
  });

  it('reuses the key when the flag write fails after the send', async () => {
    // The window this closes: Resend accepted the email, then the store went
    // away before emailSent could be recorded. The lead looks unsent, the
    // customer asks again, and without a key Resend would deliver a second
    // copy of the same quote.
    await POST(post(validLead()));
    const firstKey = (quoteEmail() as unknown as { idempotencyKey?: string }).idempotencyKey;

    // Rewind the stored record to the state a crash would have left behind.
    const record = store.get('gm:submit:8f14e45f-ceea-467a-9f34-2c8c3b1a77de') as { emailSent: boolean };
    store.set('gm:submit:8f14e45f-ceea-467a-9f34-2c8c3b1a77de', { ...record, emailSent: false });
    notifications.length = 0;

    __resetRateLimits();
    await POST(post({ ...validLead(), resend: true }));

    const resent = quoteEmail() as unknown as { idempotencyKey?: string };
    expect(resent.idempotencyKey).toBe(firstKey);
    expect(resent.idempotencyKey).toBe('gm:quote:8f14e45f-ceea-467a-9f34-2c8c3b1a77de');
  });
});

describe('a resend touches nothing but the stored record', () => {
  it('succeeds with a garbage body when the stored record is good', async () => {
    failEmail = true;
    await POST(post(validLead()));
    notifications.length = 0;
    curveCalls.length = 0;

    failEmail = false;
    __resetRateLimits();
    const res = await POST(
      post({
        id: '8f14e45f-ceea-467a-9f34-2c8c3b1a77de',
        state: 'TX',
        ts: 1_700_000_000_000,
        ttc_ms: 60_000,
        resend: true,
        // Everything below is nonsense. None of it is read.
        quote: { inputs: { panelCount: 'many', tier: 'unobtainium', trenchFeet: -5 } },
        email: 'attacker@example.com',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ leadFiled: true, emailSent: true });
    expect(quoteEmail()!.to).toEqual(['bert@example.com']);
    // A garbage design would have failed validation had it been parsed.
    expect(curveCalls, 'a resend looked the site up again').toHaveLength(0);
  });

  it('costs nothing at all for a lead id it does not know', async () => {
    curveCalls.length = 0;

    const res = await POST(post({ ...validLead(), id: '00000000-0000-4000-8000-000000000002', resend: true }));

    expect(res.status).toBe(404);
    // No PVWatts, no SSURGO, no Tilequery: an unauthenticated caller must not
    // be able to spend upstream calls by inventing ids.
    expect(curveCalls, 'an unknown resend hit the site lookup').toHaveLength(0);
    expect(written).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });
});

describe('telling the owner a lead arrived', () => {
  /** The owner's notification is the HTML one; the customer's is React. */
  const ownerEmails = () => notifications.filter((n) => n.html);

  it('records that it went', async () => {
    await POST(post(validLead()));

    expect(ownerEmails()).toHaveLength(1);
    expect(await (await POST(post(validLead()))).json()).toMatchObject({ ownerNotified: true });
  });

  it('records a failure instead of swallowing it', async () => {
    // It used to be fire-and-forget in a try/catch: Resend could be down and
    // the lead would be filed with nobody told about it.
    failEmail = true;
    await POST(post(validLead()));

    const stored = store.get('gm:submit:8f14e45f-ceea-467a-9f34-2c8c3b1a77de') as { ownerNotified: boolean };
    expect(stored.ownerNotified).toBe(false);
  });

  it('retries it on the resend that finishes the customer email', async () => {
    failEmail = true;
    await POST(post(validLead()));
    notifications.length = 0;

    failEmail = false;
    __resetRateLimits();
    const res = await POST(post({ ...validLead(), resend: true }));

    expect(await res.json()).toMatchObject({ emailSent: true, ownerNotified: true });
    expect(ownerEmails(), 'the owner was not told on the retry').toHaveLength(1);
  });

  it('retries it on a replay when only the owner copy failed', async () => {
    // The customer has their quote; the owner does not. A repeat of the submit
    // is the only thing that will come along, so it finishes the job.
    await POST(post(validLead()));
    const stored = store.get('gm:submit:8f14e45f-ceea-467a-9f34-2c8c3b1a77de') as Record<string, unknown>;
    store.set('gm:submit:8f14e45f-ceea-467a-9f34-2c8c3b1a77de', { ...stored, ownerNotified: false });
    notifications.length = 0;

    __resetRateLimits();
    const res = await POST(post(validLead()));

    expect(await res.json()).toMatchObject({ duplicate: true, ownerNotified: true });
    expect(ownerEmails()).toHaveLength(1);
    // And still no second record, and no second customer email.
    expect(written).toHaveLength(1);
    expect(notifications.filter((n) => n.react)).toHaveLength(0);
  });

  it('does not send it twice on a replay when it already went', async () => {
    await POST(post(validLead()));
    notifications.length = 0;

    __resetRateLimits();
    await POST(post(validLead()));

    expect(ownerEmails()).toHaveLength(0);
  });
});

describe('what a hostile payload can put in the record', () => {
  it('truncates every free-text field rather than storing a novel', async () => {
    // Airtable will take a megabyte of text, and the owner's notification puts
    // the name straight into an email subject line.
    const huge = 'A'.repeat(50_000);

    await POST(
      post({
        ...validLead(),
        name: huge,
        email: huge,
        phone: huge,
        address: huge,
        source: huge,
        state: huge,
      })
    );

    const fields = written[0];
    for (const key of ['Name', 'Email', 'Phone', 'Address', 'Source', 'State'] as const) {
      const value = fields[key];
      if (typeof value === 'string') {
        expect(value.length, `${key} was not truncated`).toBeLessThanOrEqual(200);
      }
    }

    // And the subject line the owner receives stays a subject line.
    const owner = notifications.find((n) => n.html);
    expect(owner!.subject.length).toBeLessThan(500);
  });

  it('refuses anything that is not a UUID v4', async () => {
    // The id is the Airtable merge key, the idempotency key and part of a
    // Redis key. A caller picking `aaaaaaaa` could collide with somebody.
    for (const id of [
      'x'.repeat(5000),
      'lead-1234-5678',
      'aaaaaaaa',
      '8f14e45f-ceea-367a-9f34-2c8c3b1a77de', // version 3
      '8f14e45f-ceea-467a-1f34-2c8c3b1a77de', // bad variant
      '',
    ]) {
      __resetRateLimits();
      const res = await POST(post({ ...validLead(), id }));
      // 4xx specifically: the queue drops these, and retrying a payload that
      // can never work helps nobody.
      expect(res.status, id.slice(0, 20)).toBe(400);
      expect((await res.json()).error).toBe('bad_request');
    }
    expect(written).toHaveLength(0);
  });

  it('refuses a lead id long enough to be an attack on the key space', async () => {
    const res = await POST(post({ ...validLead(), id: 'x'.repeat(5000) }));
    expect(res.status).toBe(400);
    expect(written).toHaveLength(0);
  });

  it('keeps 5xx for failures that are ours', async () => {
    // The queue retries these, which is the whole point of telling them apart.
    failWrite = true;
    expect((await POST(post(validLead()))).status).toBe(502);

    __resetRateLimits();
    storeDown = true;
    expect((await POST(post(validLead()))).status).toBe(503);
  });
});

describe('a partial save arriving after the submit', () => {
  const partialBody = (step: number) => ({
    partial: true,
    id: '8f14e45f-ceea-467a-9f34-2c8c3b1a77de',
    stepReached: step,
    source: 'groundmounts.com',
    coordinates: { latitude: 32.7555, longitude: -97.3208 },
    inputs: INPUTS,
  });

  it('changes nothing once the lead is filed', async () => {
    // A page left open in a tab fires these. Without the check, a step-4
    // partial landing seconds after the submit rewrites the owner's New lead
    // at step 6 into a Partial at step 4.
    await POST(post(validLead()));
    expect(written).toHaveLength(1);
    expect(written[0].Status).toBe('New');
    expect(written[0]['Step Reached']).toBe(6);

    __resetRateLimits();
    const late = await POST(post(partialBody(4)));

    expect(late.status).toBe(200);
    expect(await late.json()).toMatchObject({ ok: true, skipped: 'already_filed' });
    expect(written, 'a late partial wrote over a filed lead').toHaveLength(1);
    expect(written[0].Status).toBe('New');
    expect(written[0]['Step Reached']).toBe(6);
  });

  it('accepts only the three steps that mean something', async () => {
    for (const step of [0, 2, 5, 6, 7, -1]) {
      __resetRateLimits();
      const res = await POST(post(partialBody(step)));
      expect(res.status, `step ${step}`).toBe(400);
    }
    expect(written).toHaveLength(0);

    for (const step of [1, 3, 4]) {
      __resetRateLimits();
      store.clear();
      written.length = 0;
      const res = await POST(post(partialBody(step)));
      expect(res.status, `step ${step}`).toBe(200);
    }
  });

  it('caps how often one lead id may save, whatever its IP', async () => {
    // A stuck retry loop in one browser is the shape this stops. No resets
    // between these: the per-IP bucket allows forty, so what stops the fourth
    // is the per-lead cap and nothing else.
    for (let i = 0; i < 3; i++) {
      await POST(post(partialBody(4)));
    }
    const before = written.length;

    const capped = await POST(post(partialBody(4)));

    expect(await capped.json()).toMatchObject({ skipped: 'rate_limited' });
    expect(written).toHaveLength(before);
  });
});

describe('the envelope around a quote', () => {
  it('bounds the figures the customer typed', async () => {
    await POST(
      post({
        ...validLead(),
        quote: {
          inputs: INPUTS,
          avgBill: 1e9,
          highBill: Number.NaN,
          percentage: 100000,
          billAnnualKwh: -5,
        },
      })
    );

    const fields = written[0];
    // Out of range, not-a-number, and a NaN that JSON turned into null on the
    // way: none of them should reach the record as a figure.
    expect(fields['Monthly Bill Avg']).toBeUndefined();
    expect(fields['Monthly Bill High']).toBeUndefined();
    expect(fields['Offset Percentage']).toBeUndefined();
  });

  it('runs bill months through the same sanitiser as extraction', async () => {
    const months = Array.from({ length: 20 }, (_, i) => ({
      month: `Month ${i} ${'x'.repeat(50)}`,
      kwh: 1000 + i,
      cost: null,
      accountNumber: '4455-9982',
    }));

    await POST(post({ ...validLead(), quote: { inputs: INPUTS, billMonths: months } }));

    const stored = JSON.parse(written[0]['Monthly kWh JSON'] as string) as Array<
      Record<string, unknown>
    >;
    expect(stored.length, 'more than a year of months was stored').toBeLessThanOrEqual(12);
    for (const row of stored) {
      expect(Object.keys(row).sort()).toEqual(['cost', 'kwh', 'month']);
      expect((row.month as string).length).toBeLessThanOrEqual(16);
    }
    expect(JSON.stringify(stored)).not.toContain('4455-9982');
  });

  it('drops a source that is not a slug', async () => {
    await POST(
      post({ ...validLead(), source: '<script>alert(1)</script> and a whole sentence' })
    );
    expect(written[0].Source).toBeUndefined();

    __resetRateLimits();
    store.clear();
    written.length = 0;
    await POST(post({ ...validLead(), source: 'partner-site.com' }));
    expect(written[0].Source).toBe('partner-site.com');
  });
});

describe('the envelope itself', () => {
  it('answers malformed JSON with a generic 400', async () => {
    const req = new NextRequest('http://localhost/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: '{"id": "lead-1234-5678", "quote": {',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_request');
    expect(written).toHaveLength(0);
  });

  it('takes a resend with an id and nothing else', async () => {
    failEmail = true;
    await POST(post(validLead()));
    notifications.length = 0;
    failEmail = false;

    __resetRateLimits();
    // No state, no ts, no ttc_ms, no honeypot: none of it is used.
    const res = await POST(post({ id: '8f14e45f-ceea-467a-9f34-2c8c3b1a77de', resend: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ emailSent: true });
    expect(notifications.filter((n) => n.react)).toHaveLength(1);
  });
});

describe('the map screenshot', () => {
  /** A one-pixel PNG, as a data URL. */
  const PNG_DATA_URL =
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('is uploaded only after Airtable has taken the record', async () => {
    await POST(post({ ...validLead(), mapScreenshot: PNG_DATA_URL }));

    // Two upserts on one row: the record, then the attachment patched onto it.
    // Both merge on Lead ID, so this is still one Airtable record.
    expect(written).toHaveLength(2);
    expect(written[0]['Map Screenshot'], 'the record carried the blob URL').toBeUndefined();
    expect(written[1]['Map Screenshot']).toEqual([
      { url: 'https://blob.example/map-screenshots/8f14e45f-ceea-467a-9f34-2c8c3b1a77de.png' },
    ]);
    expect(written.every((f) => f['Lead ID'] === '8f14e45f-ceea-467a-9f34-2c8c3b1a77de')).toBe(true);
    expect(blobs, 'the screenshot was not stored').toHaveLength(1);
  });

  it('puts the design the customer drew in their own email', async () => {
    // The quote email had no picture of the thing it was quoting. The upload
    // happens before either send, so both the customer's copy and the owner's
    // carry the same URL.
    await POST(post({ ...validLead(), mapScreenshot: PNG_DATA_URL }));

    const blobUrl =
      'https://blob.example/map-screenshots/8f14e45f-ceea-467a-9f34-2c8c3b1a77de.png';

    const html = quoteHtml();
    expect(html, 'the quote email has no map in it').toContain(blobUrl);
    // Above the range, which is what it explains.
    expect(html.indexOf(blobUrl)).toBeLessThan(html.indexOf('YOUR RANGE'));

    const owner = notifications.find((n) => !n.react);
    expect(owner?.html, 'the owner notification has no map in it').toContain(blobUrl);
  });

  it('sends the same email, picture and all, when the first one failed', async () => {
    // A resend rebuilds the email from the stored record rather than from the
    // request. Without the URL on that record the retry would quietly arrive
    // without its map — the same email minus the only picture in it.
    failEmail = true;
    await POST(post({ ...validLead(), mapScreenshot: PNG_DATA_URL }));

    failEmail = false;
    __resetRateLimits();
    notifications.length = 0;

    // The retry carries no screenshot of its own; everything it sends has to
    // come off the stored record.
    const res = await POST(post({ ...validLead(), resend: true }));
    expect(await res.json()).toMatchObject({ emailSent: true });

    expect(quoteHtml()).toContain(
      'https://blob.example/map-screenshots/8f14e45f-ceea-467a-9f34-2c8c3b1a77de.png'
    );
  });

  it('leaves no orphan in storage when the write is rejected', async () => {
    // A blob uploaded before a failed write is a public image nobody points at
    // and nothing cleans up.
    failWrite = true;

    const res = await POST(post({ ...validLead(), mapScreenshot: PNG_DATA_URL }));

    expect(res.status).toBe(502);
    expect(written).toHaveLength(0);
    expect(blobs, 'a rejected lead still left a blob behind').toHaveLength(0);
  });

  it('files the lead even when the upload fails', async () => {
    // Garbage that is not an image: the picture is lost, the lead is not.
    const res = await POST(
      post({ ...validLead(), mapScreenshot: 'data:image/png;base64,bm90YW5pbWFnZQ==' })
    );

    expect(res.status).toBe(200);
    expect(written).toHaveLength(1);
    expect(blobs).toHaveLength(0);
  });
});

describe('a partial racing the submit that follows it', () => {
  const LEAD = '8f14e45f-ceea-467a-9f34-2c8c3b1a77de';
  const partialBody = (step: number) => ({
    partial: true,
    id: LEAD,
    stepReached: step,
    source: 'groundmounts.com',
    coordinates: { latitude: 32.7555, longitude: -97.3208 },
    inputs: INPUTS,
  });

  it('stands aside while the submit holds the lease', async () => {
    // The page fires a partial on a step change at the moment the customer
    // presses the button. Both write the same Airtable row.
    //
    // Held by hand here: the submit's lease is taken and not yet released.
    const held = await import('@/lib/server/redis').then((m) =>
      m.acquireLease(`gm:submit:lease:${LEAD}`, 60)
    );
    expect(held).toBeTruthy();

    const res = await POST(post(partialBody(4)));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: 'in_progress' });
    expect(written, 'a partial wrote while a submit held the lease').toHaveLength(0);
  });

  it('leaves Status New and Step Reached 6 when it resumes after the submit', async () => {
    // The interleaving that matters: the partial reads the completed record
    // before the submit writes it, then tries to write afterwards.
    const beforeSubmit = await storeGetRecord(LEAD);
    expect(beforeSubmit).toBeNull();

    await POST(post(validLead()));
    expect(written).toHaveLength(1);

    // Resuming now, with the submit finished, it finds the completed record.
    __resetRateLimits();
    const resumed = await POST(post(partialBody(4)));

    expect(await resumed.json()).toMatchObject({ skipped: 'already_filed' });
    expect(written).toHaveLength(1);
    expect(written[0].Status).toBe('New');
    expect(written[0]['Step Reached']).toBe(6);
  });

  it('gives the lease back so the submit is not blocked by it', async () => {
    await POST(post(partialBody(4)));
    expect(written).toHaveLength(1);

    __resetRateLimits();
    const submit = await POST(post(validLead()));

    expect(submit.status, 'the partial kept the lease').toBe(200);
    expect(written).toHaveLength(2);
  });
});

/** Read the stored submit record the way the route does. */
async function storeGetRecord(id: string) {
  const { storeGet } = await import('@/lib/server/redis');
  return storeGet(`gm:submit:${id}`);
}

describe('what a partial is allowed to believe', () => {
  it('never takes the customer\'s word for the soil', async () => {
    // A partial is written with nobody reviewing it. The server found rock;
    // the payload claims sand; the row says rock.
    siteFacts = {
      ...NOTHING_KNOWN,
      curve: SITE_CURVE,
      curveSource: 'pvwatts',
      soilClass: 'rock outcrop',
      soilSource: 'ssurgo',
    };

    await POST(
      post({
        partial: true,
        id: '3c1f9a22-77b4-4d1e-9f0a-6e2b8d4c5a90',
        stepReached: 4,
        inputs: { ...INPUTS, soilClass: 'sand' },
      })
    );

    expect(written[0]['Soil Class']).toBe('rock outcrop');
  });

  it('records Unknown rather than the claim when the server found nothing', async () => {
    siteFacts = { ...NOTHING_KNOWN, curve: SITE_CURVE, curveSource: 'pvwatts' };

    await POST(
      post({
        partial: true,
        id: '3c1f9a22-77b4-4d1e-9f0a-6e2b8d4c5a91',
        stepReached: 4,
        inputs: { ...INPUTS, soilClass: 'caliche' },
      })
    );

    expect(written[0]['Soil Class'], 'a partial trusted the payload').toBeUndefined();
  });
});

describe('an attachment Airtable would not take', () => {
  const PNG_DATA_URL =
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('is deleted rather than left in storage', async () => {
    // Nothing points at it and nothing ever will. A public photo of somebody's
    // property with no record referencing it is worse than no screenshot.
    failAttach = true;

    const res = await POST(post({ ...validLead(), mapScreenshot: PNG_DATA_URL }));

    expect(res.status).toBe(200);
    expect(blobs, 'the screenshot was never uploaded').toHaveLength(1);
    expect(deletedBlobs, 'the orphaned blob was left behind').toHaveLength(1);
    expect(deletedBlobs[0]).toContain('map-screenshots/');
  });

  it('is kept when the patch succeeds', async () => {
    await POST(post({ ...validLead(), mapScreenshot: PNG_DATA_URL }));

    expect(blobs).toHaveLength(1);
    expect(deletedBlobs, 'a good attachment was deleted').toHaveLength(0);
  });
});

describe('a partial paused in the middle of its own work', () => {
  const LEAD = '8f14e45f-ceea-467a-9f34-2c8c3b1a77de';
  const partialBody = (step: number) => ({
    partial: true,
    id: LEAD,
    stepReached: step,
    inputs: INPUTS,
    coordinates: { latitude: 32.7555, longitude: -97.3208 },
  });

  it('cannot overwrite a submit that completed while it was suspended', async () => {
    // The interleaving that used to lose the lead: the partial reads "not
    // filed yet", a submit runs to completion in the gap, and the partial then
    // writes Status Partial over the New lead at step 6.
    //
    // The partial is suspended at exactly that point — inside its
    // completed-record read — and a submit is started. With the lease taken
    // before the read, the submit cannot get past its own lease acquisition
    // while the partial is stopped, so the gap the bug needed does not exist.
    let resume: (() => void) | null = null;
    const held = new Promise<void>((resolve) => (resume = resolve));

    const redis = await import('@/lib/server/redis');
    const realGet = redis.storeGet;
    let reads = 0;
    let suspended = false;

    vi.spyOn(redis, 'storeGet').mockImplementation(async (key: string) => {
      // The partial reads twice: once cheaply before the lease, and once
      // authoritatively under it. The second is the one to suspend inside —
      // suspending the first would stop before the lease was ever taken and
      // prove nothing about the window this test exists for.
      if (key === `gm:submit:${LEAD}`) {
        reads++;
        if (reads === 2) {
          suspended = true;
          await held;
        }
      }
      return realGet(key);
    });

    const partial = POST(post(partialBody(4)));
    await vi.waitFor(() => expect(suspended).toBe(true));

    const submit = POST(post(validLead()));
    // Long enough for the submit to have written, if anything could.
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(
      written,
      'a submit wrote while a partial held the lease'
    ).toHaveLength(0);

    (resume as unknown as () => void)();
    await Promise.all([partial, submit]);
    vi.restoreAllMocks();

    // The partial went first and wrote its row; the submit followed and turned
    // it into the finished funnel. Whatever the order, the row ends as New.
    const final = written[written.length - 1];
    expect(final.Status, 'a partial overwrote a filed lead').toBe('New');
    expect(final['Step Reached']).toBe(6);
    expect(written.every((f) => f['Lead ID'] === LEAD)).toBe(true);
  });

  it('makes the submit wait rather than refusing it', async () => {
    // A partial holding the lease must never cost somebody their lead: a 409
    // is a 4xx, and the queue drops those.
    const redis = await import('@/lib/server/redis');
    const held = await redis.acquireLease(`gm:submit:lease:${LEAD}`, 60);
    expect(held).toBeTruthy();

    // Give it back while the submit is in its retry loop.
    setTimeout(() => void redis.releaseLease(`gm:submit:lease:${LEAD}`, held!), 300);

    const res = await POST(post(validLead()));

    expect(res.status, 'the submit gave up instead of waiting').toBe(200);
    expect(written).toHaveLength(1);
  });
});

describe('a submit that cannot get the lease', () => {
  const LEAD = '8f14e45f-ceea-467a-9f34-2c8c3b1a77de';

  it('answers 503 so the queue keeps the lead', async () => {
    // Held for longer than the submit is willing to wait. A 409 here would be
    // a 4xx, and the queue drops those — somebody would lose their lead to a
    // background save.
    const redis = await import('@/lib/server/redis');
    const held = await redis.acquireLease(`gm:submit:lease:${LEAD}`, 60);
    expect(held).toBeTruthy();

    const res = await POST(post(validLead()));

    expect(res.status, 'a busy lead was reported as a client error').toBe(503);
    expect((await res.json()).error).toBe('busy');
    expect(written).toHaveLength(0);

    // Once it is free, the same payload files.
    await redis.releaseLease(`gm:submit:lease:${LEAD}`, held!);
    __resetRateLimits();
    const retry = await POST(post(validLead()));

    expect(retry.status).toBe(200);
    expect(written).toHaveLength(1);
  });
});

describe('what a partial does before it takes the lease', () => {
  it('looks the site up first, so the lock covers only the write', async () => {
    // Holding a lock across somebody else's network is how a background save
    // blocks a customer's submit for seconds.
    curveCalls.length = 0;

    const redis = await import('@/lib/server/redis');
    const observed: string[] = [];
    const realAcquire = redis.acquireLease;
    vi.spyOn(redis, 'acquireLease').mockImplementation(async (key: string, ttl: number) => {
      // How many lookups had happened by the time the lease was taken?
      observed.push(`lease-after-${curveCalls.length}-lookups`);
      return realAcquire(key, ttl);
    });

    await POST(
      post({
        partial: true,
        id: '9d3f1c55-2a7e-4b3d-8e61-0c4a7b2f9d10',
        stepReached: 4,
        inputs: INPUTS,
      })
    );
    vi.restoreAllMocks();

    expect(curveCalls, 'the site was never looked up').toHaveLength(1);
    expect(observed, 'the lease was taken before the site lookup').toEqual([
      'lease-after-1-lookups',
    ]);
  });
});

describe('what a doomed partial costs', () => {
  const LEAD = '8f14e45f-ceea-467a-9f34-2c8c3b1a77de';
  const partialBody = (step: number, id = LEAD) => ({
    partial: true,
    id,
    stepReached: step,
    inputs: INPUTS,
  });

  it('makes no site lookup at all once the lead is filed', async () => {
    // A cold lookup is eleven upstream calls. A save that is going to be
    // thrown away should not pay for one.
    await POST(post(validLead()));
    curveCalls.length = 0;

    __resetRateLimits();
    const late = await POST(post(partialBody(4)));

    expect(await late.json()).toMatchObject({ skipped: 'already_filed' });
    expect(curveCalls, 'a doomed partial still looked the site up').toHaveLength(0);
  });

  it('makes no site lookup on the fourth save in a minute', async () => {
    // Three legitimate saves, then a stuck retry loop.
    for (let i = 0; i < 3; i++) await POST(post(partialBody(4)));
    expect(curveCalls.length).toBeGreaterThan(0);
    curveCalls.length = 0;

    const capped = await POST(post(partialBody(4)));

    expect(await capped.json()).toMatchObject({ skipped: 'rate_limited' });
    expect(curveCalls, 'a rate-limited partial still looked the site up').toHaveLength(0);
  });
});
