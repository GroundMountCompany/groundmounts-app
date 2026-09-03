import EmailTemplate from '@/components/common/EmailTemplate';
import { NextRequest, NextResponse } from 'next/server';
import { getResendOrThrow } from '@/lib/resendSafe';
import { getClientIp, rateLimitOk, isBotHoneypot, minTimeOk } from '@/lib/guard';
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

    const {
      email,
      address,
      quotation,
      totalPanels,
      additionalCost,
      electricalMeter,
      percentage
    } = body;

    // Calculate values for email
    const systemCostRaw = quotation || 0;
    const trenchingCostRaw = additionalCost || 0;
    const trenchingDistance = electricalMeter?.distanceInFeet || 0;
    const totalCostRaw = systemCostRaw + trenchingCostRaw;
    const systemSizeKw = (totalPanels * 435) / 1000;

    // Estimate monthly bill from the quote (reverse calculation)
    // If percentage is the offset and we know panels, we can estimate the original bill
    const monthlyBill = body.avgBill || Math.round((totalPanels * 435 * 0.18 * 30 * 24 / 1000) * 0.14 / (percentage / 100));

    const formattedDate = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/groundmounts/consultation';

    const emailTemplate = EmailTemplate({
      client: email,
      address: address || 'Your Property',
      systemCostRaw,
      trenchingCostRaw,
      trenchingDistance,
      totalCostRaw,
      totalPanels: totalPanels || 0,
      systemSizeKw,
      monthlyBill,
      offsetPercentage: percentage || 100,
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