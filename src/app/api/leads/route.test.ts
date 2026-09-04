import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
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
      written.push({ ...fields, 'Lead ID': leadId });
      return { id: 'recTest123', created: true };
    },
  };
});

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
    // The customer's copy only: the owner was notified the first time.
    expect(notifications.filter((n) => n.react)).toHaveLength(1);
    expect(notifications.filter((n) => n.html)).toHaveLength(0);
  });
});

describe('partial saves', () => {
  const partial = (extra: Record<string, unknown> = {}) => ({
    partial: true,
    id: 'lead-partial-001',
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
    expect(fields['Lead ID']).toBe('lead-partial-001');
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

describe('the brand on the email', () => {
  it('is the build default when nothing asks for another', async () => {
    await POST(post(validLead()));

    const quote = quoteEmail() as unknown as { from: string; replyTo: string; subject: string };
    expect(quote.from).toContain('quotes@groundmounts.com');
    expect(quote.subject).toContain('The Ground Mount Company');
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
    const res = await POST(post({ ...validLead(), id: 'never-submitted-1234', resend: true }));

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

  it('refuses a second submit while the first holds the lease', async () => {
    // The lease is taken before the write and only released after it, so a
    // concurrent duplicate is told to go away rather than filing a second row.
    failEmail = false;
    const holder = POST(post(validLead()));
    __resetRateLimits();
    const rival = await POST(post(validLead()));

    await holder;
    expect([409, 200]).toContain(rival.status);
    expect(written, 'two concurrent submits wrote two records').toHaveLength(1);
  });
});

describe('sending the same email twice', () => {
  it('gives the customer copy a key derived from the lead', async () => {
    await POST(post(validLead()));

    const quote = quoteEmail() as unknown as { idempotencyKey?: string };
    expect(quote.idempotencyKey).toBe('gm:quote:lead-1234-5678');

    const owner = notifications.find((n) => n.html);
    expect(owner?.idempotencyKey).toBe('gm:owner-notify:lead-1234-5678');
  });

  it('reuses the key when the flag write fails after the send', async () => {
    // The window this closes: Resend accepted the email, then the store went
    // away before emailSent could be recorded. The lead looks unsent, the
    // customer asks again, and without a key Resend would deliver a second
    // copy of the same quote.
    await POST(post(validLead()));
    const firstKey = (quoteEmail() as unknown as { idempotencyKey?: string }).idempotencyKey;

    // Rewind the stored record to the state a crash would have left behind.
    const record = store.get('gm:submit:lead-1234-5678') as { emailSent: boolean };
    store.set('gm:submit:lead-1234-5678', { ...record, emailSent: false });
    notifications.length = 0;

    __resetRateLimits();
    await POST(post({ ...validLead(), resend: true }));

    const resent = quoteEmail() as unknown as { idempotencyKey?: string };
    expect(resent.idempotencyKey).toBe(firstKey);
    expect(resent.idempotencyKey).toBe('gm:quote:lead-1234-5678');
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
        id: 'lead-1234-5678',
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

    const res = await POST(post({ ...validLead(), id: 'unknown-lead-9999', resend: true }));

    expect(res.status).toBe(404);
    // No PVWatts, no SSURGO, no Tilequery: an unauthenticated caller must not
    // be able to spend upstream calls by inventing ids.
    expect(curveCalls, 'an unknown resend hit the site lookup').toHaveLength(0);
    expect(written).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });
});
