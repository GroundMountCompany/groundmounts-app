import EmailTemplate from '@/components/common/EmailTemplate';
import { Resend } from 'resend';
import type { ReactElement } from 'react';
import { saveToSpreadsheet } from '@/lib/spreadsheetUtils';
import { SPREADSHEET_ID, TAB_NAME } from '@/constants/quote';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const {
      email,
      address,
      coordinates,
      quotation,
      totalPanels,
      paymentMethod,
      quoteId,
      additionalCost,
      electricalMeter,
      percentage
    } = await request.json();

    const totalCost = quotation + (additionalCost || 0);
    const federalTaxCredit = Math.floor(totalCost * 0.3);
    const netCostAfterTax = totalCost - federalTaxCredit;
    const systemSizeWatts = totalPanels * 400;
    const formattedDate = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL;

    const emailTemplate = EmailTemplate({
      client: email,
      systemType: 'Ground Mount Solar System',
      address: `Address: ${address}, Coordinates: ${coordinates.latitude.toFixed(2)}° N, ${coordinates.longitude.toFixed(2)}° W`,
      coordinates: `Lon: ${coordinates.longitude}, Lat: ${coordinates.latitude}`,
      materials: `${totalPanels} Panels (${systemSizeWatts}W) - ${percentage}% Offset`,
      estimatedCost: `$${totalCost} (Federal Tax Credit: $${federalTaxCredit})`,
      totalCost: `Net Out-of-Pocket Cost: $${paymentMethod === 'cash' ? netCostAfterTax : 0}`,
      trenching: trenchingSection(electricalMeter?.distanceInFeet || 0, additionalCost),
      date: formattedDate,
      calendlyUrl
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
      return Response.json({ error }, { status: 500 });
    }

    return Response.json(data);
  } catch (error) {
    console.log("error", error)
    return Response.json({ error }, { status: 500 });
  }
}

function trenchingSection(distance: number, cost: number) {
  if (cost > 0) {
    return `Trenching: Distance = ${distance}ft, Cost = $${cost} ($45/ft)`;
  }
  return 'Trenching: Not required';
}