import { NextRequest, NextResponse } from "next/server";
import { createLead, parseAddress, LeadFields } from "@/lib/airtable";
import { getClientIp, rateLimitOk, isBotHoneypot, minTimeOk } from "@/lib/guard";
import { getResendOrThrow } from "@/lib/resendSafe";
import { put } from "@vercel/blob";
import { escapeHtml, escapeOr, headerSafe } from "@/lib/escape";
import { sniffImage } from "@/lib/imageSniff";
import { parseQuoteInputs, priceFromInputs, InvalidQuoteInputs } from "@/lib/quoteInputs";
import { curveForArray } from "@/lib/server/siteLookup";

/** Decoded screenshots above this are rejected rather than uploaded. */
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
/**
 * Base64 inflates by 4/3, so 2 MB decoded is ~2.8 MB encoded. Checking the
 * string length first means an oversized payload is rejected without allocating
 * a buffer for it.
 */
const MAX_SCREENSHOT_B64_CHARS = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4;
/** Midpoint of a low/high pair, for the single-value legacy columns. */
function midpoint(low: number, high: number): number {
  return Math.round((low + high) / 2);
}

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
    /** What the price is computed from. Everything else here is context. */
    inputs?: unknown;
    totalPanels?: number;
    /** Trench run in feet, straight from the map. */
    trenchFeet?: number;
    azimuth?: number;
    percentage?: number;
    avgBill?: number;
    highBill?: number;
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
    if (!rateLimitOk(ip, 'leads')) {
      console.log("[LEADS_BLOCKED] Rate limited");
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    if (isBotHoneypot((body as Record<string, unknown>).honeypot as string)) {
      console.log("[LEADS_BLOCKED] Bot honeypot triggered");
      return NextResponse.json({ ok: true, ignored: true }); // pretend success, do nothing
    }

    // A missing ttc_ms is rejected the same as a too-fast one.
    if (!minTimeOk((body as Record<string, unknown>).ttc_ms)) {
      console.log("[LEADS_BLOCKED] Too fast or missing ttc_ms");
      return NextResponse.json({ ok: false, error: "too_fast" }, { status: 400 });
    }

    const lead = validateLead(body);
    console.log("[LEADS_VALIDATED]", lead.id);

    // Upload map screenshot to Vercel Blob if provided
    let mapScreenshotUrl: string | undefined;
    if (lead.mapScreenshot && /^data:image\/(png|jpeg);base64,/.test(lead.mapScreenshot)) {
      try {
        const base64Data = lead.mapScreenshot.replace(/^data:image\/(png|jpeg);base64,/, '');

        // Reject on the encoded length first, before allocating the buffer.
        if (base64Data.length > MAX_SCREENSHOT_B64_CHARS) {
          throw new Error(
            `screenshot too large (encoded): ${Math.round(base64Data.length / 1024)}KB`
          );
        }

        const buffer = Buffer.from(base64Data, 'base64');

        // Cap the size and confirm the bytes really are an image before anything
        // reaches Blob storage, so this endpoint cannot host arbitrary files.
        const kind = sniffImage(buffer);
        if (!kind) {
          throw new Error('screenshot is neither PNG nor JPEG');
        }
        if (buffer.length > MAX_SCREENSHOT_BYTES) {
          throw new Error(
            `screenshot too large: ${Math.round(buffer.length / 1024)}KB > ${MAX_SCREENSHOT_BYTES / 1024}KB`
          );
        }

        // Upload to Vercel Blob
        const blob = await put(`map-screenshots/${lead.id}.${kind.ext}`, buffer, {
          access: 'public',
          contentType: kind.contentType,
        });
        mapScreenshotUrl = blob.url;
        console.log("[MAP_SCREENSHOT_UPLOADED]", lead.id, "size:", Math.round(buffer.length / 1024), "KB");
      } catch (uploadError) {
        console.error("[MAP_SCREENSHOT_UPLOAD_ERROR]", uploadError instanceof Error ? uploadError.message : uploadError);
        // Continue without screenshot - don't fail the lead capture
      }
    }

    // Price the design here, not on the customer's phone.
    //
    // The record the owner quotes from must be one this server computed. A
    // browser can describe its design; it cannot name its own price, and a
    // payload that tries is priced from its inputs like any other.
    let priced;
    let inputs;
    let curveSource: 'pvwatts' | 'fallback' = 'fallback';
    try {
      inputs = parseQuoteInputs(lead.quote?.inputs);
      // Derived here from the array's own coordinates. A curve in the request
      // body is ignored: it decides the production figure the owner quotes
      // from, so it cannot be something the browser chose.
      const derived = await curveForArray(inputs.arrayCenter);
      curveSource = derived.curveSource;
      priced = priceFromInputs(inputs, derived.curve);
    } catch (error) {
      if (error instanceof InvalidQuoteInputs) {
        console.log('[LEADS_BLOCKED] Invalid quote inputs:', error.message);
        return NextResponse.json({ ok: false, error: 'invalid_inputs' }, { status: 400 });
      }
      throw error;
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
      Panels: inputs.panelCount,
      'System Size kW': priced.systemSizeKw,
      'Monthly Bill Avg': lead.quote?.avgBill,
      'Monthly Bill High': lead.quote?.highBill,
      'Offset Percentage': lead.quote?.percentage,
      'Trenching Distance ft': inputs.trenchFeet,
      // Legacy columns, kept for the owner's existing views. Midpoints of the
      // same priced figures rather than a second calculation.
      'Trenching Cost': midpoint(priced.trench.low, priced.trench.high),
      'Equipment Cost': midpoint(priced.equipment.low, priced.equipment.high),
      'Total Investment': midpoint(priced.quote.low, priced.quote.high),
      'Price Low': priced.quote.low,
      'Price High': priced.quote.high,
      'Equipment Cost Low': priced.equipment.low,
      'Equipment Cost High': priced.equipment.high,
      'Trenching Cost Low': priced.trench.low,
      'Trenching Cost High': priced.trench.high,
      'Line Items JSON': JSON.stringify(priced.quote.lineItems),
      'Panel Tier': inputs.tier,
      'Battery Units': inputs.batteryUnits,
      'Site Prep': inputs.needsClearing,
      'Slope %': inputs.slopePercent ?? undefined,
      'Slope Tier': priced.quote.slopeTier,
      'Soil Class': inputs.soilClass ?? undefined,
      'Est Annual Production kWh': priced.annualProductionKwh,
      // Whether that production figure came from the site's own PVWatts curve
      // or the Texas reference, so a quote can be read in context later.
      'Curve Source': curveSource,
      Azimuth: inputs.azimuth,
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
      const kw = priced.systemSizeKw;
      const panels = inputs.panelCount;
      const avgBill = lead.quote?.avgBill;
      const trenchFt = inputs.trenchFeet;
      const equipment = midpoint(priced.equipment.low, priced.equipment.high);
      const trenchCost = midpoint(priced.trench.low, priced.trench.high);
      const total = midpoint(priced.quote.low, priced.quote.high);

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
