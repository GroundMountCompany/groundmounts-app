import { NextRequest, NextResponse } from "next/server";
import { findLeadById, ensureLeadIndexed, writeLeadToSheet } from "@/lib/sheets";
import { getClientIp, rateLimitOk, isBotHoneypot, minTimeOk } from "@/lib/guard";

interface Lead {
  id: string;
  state: string;
  email?: string;
  phone?: string;
  address?: string;
  quote?: any;
  ts: number;
}

function validateLead(data: any): Lead {
  if (!data.id || typeof data.id !== 'string' || data.id.length < 8) {
    throw new Error('Invalid lead ID');
  }
  if (!data.state || typeof data.state !== 'string') {
    throw new Error('Invalid state');
  }
  if (typeof data.ts !== 'number') {
    throw new Error('Invalid timestamp');
  }
  
  return {
    id: data.id,
    state: data.state,
    email: data.email || "",
    phone: data.phone || "",
    address: data.address || "",
    quote: data.quote,
    ts: data.ts,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Apply guards before processing
    const ip = getClientIp(req);
    if (!rateLimitOk(ip)) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    if (isBotHoneypot((body as Record<string, unknown>).honeypot as string)) {
      return NextResponse.json({ ok: true, ignored: true }); // pretend success, do nothing
    }

    if ((body as Record<string, unknown>).ttc_ms !== undefined && !minTimeOk((body as Record<string, unknown>).ttc_ms as number)) {
      return NextResponse.json({ ok: false, error: "too_fast" }, { status: 400 });
    }

    const lead = validateLead(body);

    const dup = await findLeadById(lead.id);
    if (dup) {
      return NextResponse.json({ ok: true, dedup: true });
    }

    const { rowRef } = await writeLeadToSheet(lead);
    await ensureLeadIndexed(lead.id, rowRef);

    console.log("[LEAD_CAPTURED]", lead.id, lead.state, lead.address || "no_address", "row:", rowRef);
    return NextResponse.json({ ok: true, rowRef });
  } catch (e: unknown) {
    const error = e as Error;
    console.error("[LEADS_ROUTE_ERROR]", error?.message || error);
    return NextResponse.json({ ok: false, error: error?.message || "bad_request" }, { status: 400 });
  }
}