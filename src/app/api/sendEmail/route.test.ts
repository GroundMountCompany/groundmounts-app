import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { __resetRateLimits } from '@/lib/guard';
import { priceFromInputs, parseQuoteInputs } from '@/lib/quoteInputs';
import { TX_FALLBACK_CURVE } from '@/lib/production';

/**
 * The quote email, end to end through the route.
 *
 * The route is the last place the numbers can go wrong before a customer reads
 * them, so this renders the template the route actually built and reads the
 * HTML — not the arguments it was called with.
 */

const sent: Array<{ to: string[]; subject: string; react: ReactElement }> = [];

vi.mock('@/lib/resendSafe', () => ({
  getResendOrThrow: () => ({
    emails: {
      send: async (args: { to: string[]; subject: string; react: ReactElement }) => {
        sent.push(args);
        return { data: { id: 'test-email-id' }, error: null };
      },
    },
  }),
}));

/**
 * The site lookup, stubbed with a curve that is nothing like the fallback and
 * nothing like anything a payload could claim. Production computed from this
 * is the only production the routes may produce.
 */
const SITE_CURVE = { 90: 1010, 135: 1110, 180: 1210, 225: 1110, 270: 1010 };
const curveCalls: Array<[number, number] | null> = [];

vi.mock('@/lib/server/siteLookup', () => ({
  curveForArray: async (arrayCenter: [number, number] | null) => {
    curveCalls.push(arrayCenter);
    return arrayCenter
      ? { curve: SITE_CURVE, curveSource: 'pvwatts' as const }
      : { curve: TX_FALLBACK_CURVE, curveSource: 'fallback' as const };
  },
}));

const { POST } = await import('./route');

/** The design from the brief's worked example, as the client would send it. */
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

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/sendEmail', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  });
}

const HOSTILE_CURVE = { 90: 9999, 135: 9999, 180: 9999, 225: 9999, 270: 9999 };

const validBody = (extra: Record<string, unknown> = {}) => ({
  email: 'bert@example.com',
  address: '123 Main St, Fort Worth, TX 76131',
  inputs: INPUTS,
  ttc_ms: 60_000,
  honeypot: '',
  ...extra,
});

/** Digits only, so "$52,880" and "52880" compare the same. */
const money = (n: number) => n.toLocaleString('en-US');

beforeEach(() => {
  sent.length = 0;
  curveCalls.length = 0;
  __resetRateLimits();
  vi.stubEnv('RESEND_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/sendEmail', () => {
  it('renders the range, every line item and the estimate for the worked example', async () => {
    const res = await POST(post(validBody()));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);

    const html = renderToStaticMarkup(sent[0].react);
    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);

    // The range the customer reads.
    expect(html).toContain(money(expected.quote.low));
    expect(html).toContain(money(expected.quote.high));

    // Every line item, by label and by amount. 16 panels on clay loam with a
    // 113 ft trench is equipment, trench and a soil adder.
    expect(expected.quote.lineItems.length).toBeGreaterThan(0);
    for (const item of expected.quote.lineItems) {
      expect(html, `missing line item ${item.label}`).toContain(item.label);
      expect(html, `missing amount for ${item.label}`).toContain(money(item.amount));
    }

    // And the estimate the items add up to.
    expect(html).toContain(money(expected.quote.estimate));
    expect(
      expected.quote.lineItems.reduce((t, i) => t + i.amount, 0),
      'the rendered items do not add up to the rendered estimate'
    ).toBe(expected.quote.estimate);

    // Plus the design itself, so the email describes what was drawn.
    expect(html).toContain(String(INPUTS.panelCount));
    expect(html).toContain(`${expected.systemSizeKw} kW`);
    expect(html).toContain(`${INPUTS.trenchFeet} ft`);
    expect(html).toContain(expected.annualProductionKwh.toLocaleString());
    expect(sent[0].to).toEqual(['bert@example.com']);
    // Derived from the array's own coordinates, not from anything sent.
    expect(curveCalls).toEqual([INPUTS.arrayCenter]);
  });

  it('ignores a price the client tried to name', async () => {
    // The attack: valid design, invented money. The route never reads it.
    const res = await POST(
      post(
        validBody({
          priceLow: 1,
          priceHigh: 2,
          estimate: 3,
          lineItems: [{ key: 'equipment', label: 'Free solar', amount: 1 }],
          annualProductionKwh: 999_999,
        })
      )
    );
    expect(res.status).toBe(200);

    const html = renderToStaticMarkup(sent[0].react);
    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);

    expect(html).toContain(money(expected.quote.low));
    expect(html).toContain(money(expected.quote.high));
    expect(html).not.toContain('Free solar');
    expect(html).not.toContain('999,999');
    // "$1" would appear inside "$1,234", so check the rendered range instead:
    // the low is thousands of dollars, not the 1 the payload asked for.
    expect(expected.quote.low).toBeGreaterThan(1000);
  });

  it('refuses a design that is not a design', async () => {
    for (const inputs of [
      undefined,
      { ...INPUTS, panelCount: 0 },
      { ...INPUTS, panelCount: -40 },
      { ...INPUTS, panelCount: 1e9 },
      { ...INPUTS, tier: 'free' },
      { ...INPUTS, trenchFeet: -100 },
      { ...INPUTS, batteryUnits: 99 },
      { ...INPUTS, slopePercent: 5000 },
    ]) {
      __resetRateLimits();
      const res = await POST(post(validBody({ inputs })));
      expect(res.status, JSON.stringify(inputs)).toBe(400);
      expect((await res.json()).error).toBe('invalid_inputs');
    }
    expect(sent, 'an invalid design still sent mail').toHaveLength(0);
  });

  it('keeps the existing guards in front of all of it', async () => {
    const honeypot = await POST(post(validBody({ honeypot: 'i am a robot' })));
    expect((await honeypot.json()).ignored).toBe(true);

    __resetRateLimits();
    const tooFast = await POST(post(validBody({ ttc_ms: 10 })));
    expect(tooFast.status).toBe(400);
    expect((await tooFast.json()).error).toBe('too_fast');

    expect(sent, 'a guarded request still sent mail').toHaveLength(0);
  });

  it('ignores a production curve in the payload', async () => {
    // Codex's reproduction: five samples of 9,999 kWh/kW/yr made a 16-panel
    // array produce 69,593 kWh a year in the customer's email.
    await POST(post(validBody({ inputs: { ...INPUTS, productionCurve: HOSTILE_CURVE } })));

    const html = renderToStaticMarkup(sent[0].react);
    const expected = priceFromInputs(parseQuoteInputs(INPUTS), SITE_CURVE);

    expect(html).toContain(expected.annualProductionKwh.toLocaleString());
    expect(html).not.toContain('69,593');
    // Sanity on the fixture: the hostile curve would have produced something
    // several times larger, so this is a real difference and not a near miss.
    expect(expected.annualProductionKwh).toBeLessThan(30_000);
  });

  it('uses the Texas reference when the design has no coordinates', async () => {
    await POST(post(validBody({ inputs: { ...INPUTS, arrayCenter: null } })));

    const html = renderToStaticMarkup(sent[0].react);
    const fallback = priceFromInputs(parseQuoteInputs({ ...INPUTS, arrayCenter: null }));
    expect(html).toContain(fallback.annualProductionKwh.toLocaleString());
    expect(curveCalls).toEqual([null]);
  });
});
