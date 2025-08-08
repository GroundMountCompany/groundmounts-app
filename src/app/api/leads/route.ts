import { NextRequest, NextResponse } from "next/server";

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

// If you have a way to check for existing id in Sheets, call it here
async function isDuplicate(id: string) {
  // Optional: implement via Sheets lookup; for now return false to just append
  return false;
}

async function writeLeadToSheet(lead: any) {
  // Import the Sheets utility from your existing utils
  const { updateSheet } = await import("@/lib/utils");
  
  try {
    // Write to different columns based on what data we have
    // This is a simplified approach - in a real system you'd want proper row management
    if (lead.id) await updateSheet("A", lead.id);
    if (lead.state) await updateSheet("B", lead.state);  
    if (lead.address) await updateSheet("C", lead.address);
    if (lead.email) await updateSheet("D", lead.email);
    if (lead.phone) await updateSheet("E", lead.phone);
    if (lead.quote) await updateSheet("F", JSON.stringify(lead.quote));
    if (lead.ts) await updateSheet("G", new Date(lead.ts).toISOString());
    
    return true;
  } catch (error) {
    console.error("[WRITE_LEAD_ERROR]", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const lead = validateLead(body);

    if (await isDuplicate(lead.id)) {
      return NextResponse.json({ ok: true, dedup: true });
    }

    const res = await writeLeadToSheet(lead);
    if (!res) throw new Error("sheet_write_failed");

    console.log("[LEAD_CAPTURED]", lead.id, lead.state, lead.address || "no_address");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[LEADS_ROUTE_ERROR]", e?.message || e, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message || "bad_request" }, { status: 400 });
  }
}