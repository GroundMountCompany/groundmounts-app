import FollowUpEmailTemplate from '@/components/common/FollowUpEmailTemplate';
import { Resend } from 'resend';
import type { ReactElement } from 'react';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const {
      email,
      phone,
      address,
      coordinates,
      quotation,
      totalPanels,
      paymentMethod,
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

    const emailTemplate = FollowUpEmailTemplate({
      client: email,
      phone: phone || 'Not provided',
      systemType: 'Ground Mount Solar System',
      address: `Address: ${address}, Coordinates: ${coordinates.latitude.toFixed(2)}° N, ${coordinates.longitude.toFixed(2)}° W`,
      coordinates: `Lon: ${coordinates.longitude}, Lat: ${coordinates.latitude}`,
      materials: `${totalPanels} Panels (${systemSizeWatts}W) - ${percentage}% Offset`,
      estimatedCost: `$${totalCost}`,
      fedralTax: federalTaxCredit?.toString(),
      totalCost: `Net Out-of-Pocket Cost: $${paymentMethod === 'cash' ? netCostAfterTax : 0}`,
      trenching: trenchingSection(electricalMeter?.distanceInFeet || 0, additionalCost),
      date: formattedDate,
      calendlyUrl
    }) as ReactElement;

    console.log("followUpEmailTemplate", emailTemplate);
    
    const { data, error } = await resend.emails.send({
      from: 'Ground Mounts Solar System <info@groundmounts.com>',
      to: [email],
      subject: 'Your Ground Mount Quote - Ready to Move Forward?',
      react: emailTemplate,
    });

    if (error) {
      console.error('Follow-up email error:', error);
      return Response.json({ error }, { status: 500 });
    }

    console.log('Follow-up email sent successfully:', data);
    return Response.json(data);
  } catch (error) {
    console.error('Follow-up email exception:', error);
    return Response.json({ error }, { status: 500 });
  }
}

function trenchingSection(distance: number, cost: number) {
  if (cost > 0) {
    return `Trenching: Distance = ${distance}ft, Cost = $${cost} ($45/ft)`;
  }
  return 'Trenching: Not required';
} 