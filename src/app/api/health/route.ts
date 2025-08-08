import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = {
      hasResend: !!process.env.RESEND_API_KEY,
      hasMapbox: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      hasSheetsId: !!process.env.NEXT_PUBLIC_SPREADSHEET_ID,
      hasGoogleAuth: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
    };
    return NextResponse.json({ ok: true, env });
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({ ok: false, error: error?.message || "health_failed" }, { status: 500 });
  }
}