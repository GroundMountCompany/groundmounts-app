import { NextRequest, NextResponse } from "next/server";
import { createLead, parseAddress, LeadFields } from "@/lib/airtable";
import { getClientIp, rateLimitOk, isBotHoneypot, minTimeOk } from "@/lib/guard";
import { getResendOrThrow } from "@/lib/resendSafe";
import { put } from "@vercel/blob";
import { escapeHtml, escapeOr, headerSafe } from "@/lib/escape";

/** Decoded screenshots above this are rejected rather than uploaded. */
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
/** PNG signature: \x89 P N G \r \n \x1a \n */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const NOTIFICATION_EMAIL = "bert@groundmounts.com";
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
// Airtable record deep links need the table *id* (tblXXXXXXXX), not its name.
// Without it we link to the base, which always resolves.
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID;

interface LeadPayload {
  id: string;
  state: string;
  email?: string;
  phone?: string;
  address?: string;
  name?: string;
  source?: string;
  quote?: {
    quotation?: number;
    totalPanels?: number;
    additionalCost?: number;
    electricalMeter?: {
      distanceInFeet?: number;
    };
    percentage?: number;
    avgBill?: number;
    highBill?: number;
    systemSizeKw?: number;
  };
  ts: number;
  honeypot?: string;
  ttc_ms?: number;
  mapScreenshot?: string;
}

function validateLead(data: unknown): LeadPayload {
  const obj = data as Record<string, unknown>;
  if (!obj.id || typeof obj.id !== 'string' || obj.id.length < 8) {
    throw new Error('Invalid lead ID');
  }
  if (!obj.state || typeof obj.state !== 'string') {
    throw new Error('Invalid state');
  }
  if (typeof obj.ts !== 'number') {
    throw new Error('Invalid timestamp');
  }

  return {
    id: obj.id,
    state: obj.state,
    email: (obj.email as string) || "",
    phone: (obj.phone as string) || "",
    address: (obj.address as string) || "",
    name: (obj.name as string) || "",
    source: (obj.source as string) || "",
    quote: obj.quote as LeadPayload['quote'],
    ts: obj.ts,
    honeypot: obj.honeypot as string,
    ttc_ms: obj.ttc_ms as number,
    mapScreenshot: obj.mapScreenshot as string | undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Apply guards before processing
    const ip = getClientIp(req);
    if (!rateLimitOk(ip)) {
      console.log("[LEADS_BLOCKED] Rate limited");
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    if (isBotHoneypot((body as Record<string, unknown>).honeypot as string)) {
      console.log("[LEADS_BLOCKED] Bot honeypot triggered");
      return NextResponse.json({ ok: true, ignored: true }); // pretend success, do nothing
    }

    if ((body as Record<string, unknown>).ttc_ms !== undefined && !minTimeOk((body as Record<string, unknown>).ttc_ms as number)) {
      console.log("[LEADS_BLOCKED] Too fast:", (body as Record<string, unknown>).ttc_ms);
      return NextResponse.json({ ok: false, error: "too_fast" }, { status: 400 });
    }

    const lead = validateLead(body);
    console.log("[LEADS_VALIDATED]", lead.id);

    // Upload map screenshot to Vercel Blob if provided
    let mapScreenshotUrl: string | undefined;
    if (lead.mapScreenshot && lead.mapScreenshot.startsWith('data:image/png;base64,')) {
      try {
        // Convert base64 to buffer
        const base64Data = lead.mapScreenshot.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // The data: prefix is caller-controlled and proves nothing. Check the
        // real PNG signature and cap the size before anything reaches Blob
        // storage, so this endpoint cannot be used to host arbitrary files.
        if (!buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
          throw new Error('screenshot is not a PNG');
        }
        if (buffer.length > MAX_SCREENSHOT_BYTES) {
          throw new Error(
            `screenshot too large: ${Math.round(buffer.length / 1024)}KB > ${MAX_SCREENSHOT_BYTES / 1024}KB`
          );
        }

        // Upload to Vercel Blob
        const blob = await put(`map-screenshots/${lead.id}.png`, buffer, {
          access: 'public',
          contentType: 'image/png',
        });
        mapScreenshotUrl = blob.url;
        console.log("[MAP_SCREENSHOT_UPLOADED]", lead.id, "size:", Math.round(buffer.length / 1024), "KB");
      } catch (uploadError) {
        console.error("[MAP_SCREENSHOT_UPLOAD_ERROR]", uploadError instanceof Error ? uploadError.message : uploadError);
        // Continue without screenshot - don't fail the lead capture
      }
    }

    // Parse address components
    const addressParts = lead.address ? parseAddress(lead.address) : {};

    // Build Airtable fields
    // Source options in Airtable: groundmounts.com, texasgroundmountsolar.com, backyardsolartexas.com, groundmountsolar.guide
    // Status options in Airtable: New, Contacted, Qualified, etc.
    const fields: LeadFields = {
      Name: lead.name || undefined,
      Email: lead.email || undefined,
      Phone: lead.phone || undefined,
      Address: lead.address || undefined,
      City: addressParts.city,
      State: addressParts.state || lead.state,
      Zip: addressParts.zip,
      Panels: lead.quote?.totalPanels,
      'System Size kW': lead.quote?.systemSizeKw,
      'Monthly Bill Avg': lead.quote?.avgBill,
      'Monthly Bill High': lead.quote?.highBill,
      'Offset Percentage': lead.quote?.percentage,
      'Trenching Distance ft': lead.quote?.electricalMeter?.distanceInFeet,
      'Trenching Cost': lead.quote?.additionalCost,
      'Equipment Cost': lead.quote?.quotation,
      'Total Investment': lead.quote?.quotation ? (lead.quote.quotation + (lead.quote.additionalCost || 0)) : undefined,
      Source: lead.source || undefined,
      Status: 'New',
      'Map Screenshot': mapScreenshotUrl ? [{ url: mapScreenshotUrl }] : undefined,
    };

    // Remove undefined fields
    const cleanFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined && v !== '')
    ) as LeadFields;

    const result = await createLead(cleanFields, lead.id);

    console.log("[LEAD_CAPTURED]", lead.id, "airtable_id:", result.id);

    // Send notification email (don't fail request if email fails)
    try {
      const resend = getResendOrThrow();
      const airtableUrl = AIRTABLE_TABLE_ID
        ? `https://airtable.com/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${result.id}`
        : `https://airtable.com/${AIRTABLE_BASE_ID}`;
      const cityDisplay = addressParts.city || 'Unknown City';
      const stateDisplay = addressParts.state || lead.state || 'TX';

      // Everything below is attacker-controlled; escape before it enters HTML.
      const kw = lead.quote?.systemSizeKw;
      const panels = lead.quote?.totalPanels;
      const avgBill = lead.quote?.avgBill;
      const trenchFt = lead.quote?.electricalMeter?.distanceInFeet;
      const equipment = lead.quote?.quotation;
      const trenchCost = lead.quote?.additionalCost;
      const total = equipment ? equipment + (trenchCost || 0) : undefined;

      await resend.emails.send({
        from: 'Ground Mounts <leads@groundmounts.com>',
        to: NOTIFICATION_EMAIL,
        subject: headerSafe(
          `New Solar Lead: ${headerSafe(lead.name, 'Unknown')} - ${headerSafe(cityDisplay)}, ${headerSafe(stateDisplay)}`
        ),
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a; margin-bottom: 24px;">New Lead Received</h2>

            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666; width: 140px;">Name</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600;">${escapeOr(lead.name, 'Not provided')}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Email</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;"><a href="mailto:${escapeHtml(lead.email)}" style="color: #2563eb;">${escapeOr(lead.email, 'Not provided')}</a></td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Phone</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;"><a href="tel:${escapeHtml(lead.phone)}" style="color: #2563eb;">${escapeOr(lead.phone, 'Not provided')}</a></td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Address</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${escapeOr(lead.address, 'Not provided')}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">System Size</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${kw ? `${escapeHtml(kw)} kW` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Panels</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${panels ? escapeHtml(panels) : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Monthly Bill (Avg)</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${avgBill ? `$${escapeHtml(avgBill)}` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Trenching Distance</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${trenchFt ? `${escapeHtml(trenchFt)} ft` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Equipment Cost</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${typeof equipment === 'number' ? `$${escapeHtml(equipment.toLocaleString())}` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Trenching Cost</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${typeof trenchCost === 'number' ? `$${escapeHtml(trenchCost.toLocaleString())}` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666; font-weight: 600;">Total Investment</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #16a34a;">${typeof total === 'number' ? `$${escapeHtml(total.toLocaleString())}` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Source</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${escapeOr(lead.source, 'Direct')}</td>
              </tr>
            </table>

            ${mapScreenshotUrl ? `
            <div style="margin-top: 24px;">
              <h3 style="color: #374151; margin-bottom: 12px; font-size: 14px;">Panel Placement Map</h3>
              <img src="${escapeHtml(mapScreenshotUrl)}" alt="Panel placement map" style="max-width: 100%; border-radius: 8px; border: 1px solid #e5e5e5;" />
            </div>
            ` : ''}

            <div style="margin-top: 24px;">
              <a href="${escapeHtml(airtableUrl)}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">View in Airtable</a>
            </div>

            <p style="margin-top: 24px; color: #999; font-size: 12px;">
              Lead ID: ${escapeHtml(lead.id)}<br>
              Received: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
            </p>
          </div>
        `,
      });
      console.log("[LEAD_EMAIL_SENT]", NOTIFICATION_EMAIL);
    } catch (emailError) {
      console.error("[LEAD_EMAIL_ERROR]", emailError instanceof Error ? emailError.message : emailError);
      // Don't throw - lead was still captured successfully
    }

    return NextResponse.json({ ok: true, airtableId: result.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[LEADS_ROUTE_ERROR]", msg);
    if (stack) console.error("[LEADS_ROUTE_STACK]", stack);
    return NextResponse.json({ ok: false, error: msg || "bad_request" }, { status: 400 });
  }
}
