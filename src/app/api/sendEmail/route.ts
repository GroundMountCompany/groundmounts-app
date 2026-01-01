import EmailTemplate from '@/components/common/EmailTemplate';
import { NextResponse } from 'next/server';
import { getResendOrThrow } from '@/lib/resendSafe';
import { enqueueFollowup } from '@/lib/followups';
import type { ReactElement } from 'react';

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 500 });
  }
  
  try {
    const resend = getResendOrThrow();
    
    const body = await request.json();
    const {
      email,
      address,
      coordinates,
      quotation,
      totalPanels,
      paymentMethod,
      additionalCost,
      electricalMeter,
      percentage
    } = body;

    // Calculate values for email
    const systemCostRaw = quotation || 0;
    const trenchingCostRaw = additionalCost || 0;
    const trenchingDistance = electricalMeter?.distanceInFeet || 0;
    const totalCostRaw = systemCostRaw + trenchingCostRaw;
    const systemSizeKw = (totalPanels * 400) / 1000;

    // Estimate monthly bill from the quote (reverse calculation)
    // If percentage is the offset and we know panels, we can estimate the original bill
    const monthlyBill = body.avgBill || Math.round((totalPanels * 400 * 0.18 * 30 * 24 / 1000) * 0.14 / (percentage / 100));

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

    console.log("emailTemplate", emailTemplate)
    const { data, error } = await resend.emails.send({
      from: 'Ground Mounts Solar System <info@groundmounts.com>',
      to: [email],
      subject: 'Your Quote Summary & Booking Link',
      react: emailTemplate,
    });

    // Send data to Google Sheets API endpoint
    // await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/saveQuoteToSheet`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     email,
    //     address,
    //     coordinates,
    //     quotation,
    //     totalPanels,
    //     paymentMethod,
    //     quoteId,
    //     additionalCost,
    //     electricalMeter,
    //     percentage,
    //     totalCost,
    //     federalTaxCredit,
    //     netCostAfterTax,
    //     systemSizeWatts,
    //     quoteDate: formattedDate
    //   })
    // });
    if (error) {
      console.error("[SEND_EMAIL_ERROR]", error);
      return Response.json({ error }, { status: 500 });
    }

    // Enqueue follow-up email for 15 minutes later
    try {
      const leadId = `${email}_${Date.now()}`;
      const followupDueMs = Date.now() + (15 * 60 * 1000); // 15 minutes
      const quoteData = JSON.stringify({
        email,
        address,
        coordinates,
        quotation,
        totalPanels,
        paymentMethod,
        additionalCost,
        electricalMeter,
        percentage,
      });

      await enqueueFollowup({
        lead_id: leadId,
        email,
        created_at_ms: Date.now(),
        followup_due_ms: followupDueMs,
        followup_sent: false,
        quote_data: quoteData,
      });
      
      console.log("[FOLLOWUP_ENQUEUED]", leadId, email);
    } catch (followupError) {
      console.error("[FOLLOWUP_ENQUEUE_ERROR]", followupError);
      // Don't fail the main email send if follow-up queueing fails
    }

    return Response.json({ ok: true, data });
  } catch (error) {
    console.log("error", error)
    return Response.json({ error }, { status: 500 });
  }
}