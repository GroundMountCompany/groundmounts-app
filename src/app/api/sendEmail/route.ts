import EmailTemplate from '@/components/common/EmailTemplate';
import { NextRequest, NextResponse } from 'next/server';
import { getResendOrThrow } from '@/lib/resendSafe';
import { getClientIp, rateLimitOk, isBotHoneypot, minTimeOk } from '@/lib/guard';
import { parseQuoteInputs, priceFromInputs, InvalidQuoteInputs } from '@/lib/quoteInputs';
import type { ReactElement } from 'react';

export async function POST(request: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 500 });
  }

  try {
    const resend = getResendOrThrow();

    const body = await request.json();

    // This route sends mail from our domain to any address in the payload, so it
    // gets the same guards as /api/leads. The client has always sent `honeypot`
    // and `ttc_ms`; until now the route simply ignored them.
    // Phase 7 replaces the in-memory limiter with a durable Upstash bucket and
    // adds per-leadId idempotency.
    if (!rateLimitOk(getClientIp(request), 'sendEmail')) {
      console.log('[SEND_EMAIL_BLOCKED] Rate limited');
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
    }

    if (isBotHoneypot(body?.honeypot)) {
      console.log('[SEND_EMAIL_BLOCKED] Bot honeypot triggered');
      // Pretend success so the bot learns nothing.
      return NextResponse.json({ ok: true, ignored: true });
    }

    // A missing ttc_ms is rejected the same as a too-fast one.
    if (!minTimeOk(body?.ttc_ms)) {
      console.log('[SEND_EMAIL_BLOCKED] Too fast or missing ttc_ms');
      return NextResponse.json({ ok: false, error: 'too_fast' }, { status: 400 });
    }

    const { email, address } = body;

    // The price is computed here, from the design the client described.
    //
    // Nothing about money is read from the request. A payload can claim a
    // panel count and a trench length — those are the design — but the figures
    // in the email come out of priceQuote on this server, so the quote a
    // customer receives is one we actually calculated.
    let priced;
    let inputs;
    try {
      inputs = parseQuoteInputs(body?.inputs);
      priced = priceFromInputs(inputs);
    } catch (error) {
      if (error instanceof InvalidQuoteInputs) {
        console.log('[SEND_EMAIL_BLOCKED] Invalid quote inputs:', error.message);
        return NextResponse.json({ ok: false, error: 'invalid_inputs' }, { status: 400 });
      }
      throw error;
    }

    const formattedDate = new Date().toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const calendlyUrl =
      process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/groundmounts/consultation';

    const emailTemplate = EmailTemplate({
      client: email,
      address: address || 'Your Property',
      totalPanels: inputs.panelCount,
      systemSizeKw: priced.systemSizeKw,
      trenchingDistance: inputs.trenchFeet,
      annualProductionKwh: priced.annualProductionKwh,
      lineItems: priced.quote.lineItems,
      estimate: priced.quote.estimate,
      priceLow: priced.quote.low,
      priceHigh: priced.quote.high,
      date: formattedDate,
      calendlyUrl,
    }) as ReactElement;

    const { data, error } = await resend.emails.send({
      from: 'Ground Mounts Solar System <info@groundmounts.com>',
      to: [email],
      subject: 'Your Quote Summary & Booking Link',
      react: emailTemplate,
    });

    if (error) {
      console.error("[SEND_EMAIL_ERROR]", error);
      return Response.json({ error }, { status: 500 });
    }

    return Response.json({ ok: true, data });
  } catch (error) {
    console.log("error", error)
    return Response.json({ error }, { status: 500 });
  }
}