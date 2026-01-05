import { NextRequest, NextResponse } from "next/server";
import { createLead, parseAddress, LeadFields } from "@/lib/airtable";
import { getClientIp, rateLimitOk, isBotHoneypot, minTimeOk } from "@/lib/guard";

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
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log incoming request
    console.log("[LEADS_INCOMING]", JSON.stringify(body, null, 2));

    // Apply guards before processing
    const ip = getClientIp(req);
    if (!rateLimitOk(ip)) {
      console.log("[LEADS_BLOCKED] Rate limited:", ip);
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
    console.log("[LEADS_VALIDATED] Lead ID:", lead.id, "Email:", lead.email, "Source:", lead.source);

    // Parse address components
    const addressParts = lead.address ? parseAddress(lead.address) : {};
    console.log("[LEADS_ADDRESS_PARSED]", JSON.stringify(addressParts));

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
    };

    // Remove undefined fields
    const cleanFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined && v !== '')
    ) as LeadFields;

    // Log Airtable payload
    console.log("[LEADS_AIRTABLE_PAYLOAD]", JSON.stringify(cleanFields, null, 2));

    const result = await createLead(cleanFields);

    console.log("[LEAD_CAPTURED]", lead.id, lead.email || "no_email", "airtable_id:", result.id);
    return NextResponse.json({ ok: true, airtableId: result.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[LEADS_ROUTE_ERROR]", msg);
    if (stack) console.error("[LEADS_ROUTE_STACK]", stack);
    return NextResponse.json({ ok: false, error: msg || "bad_request" }, { status: 400 });
  }
}
