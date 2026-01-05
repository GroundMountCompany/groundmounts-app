import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = {
      hasResend: !!process.env.RESEND_API_KEY,
      hasMapbox: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      hasAirtable: !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID,
    };
    return NextResponse.json({ ok: true, env });
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({ ok: false, error: error?.message || "health_failed" }, { status: 500 });
  }
}