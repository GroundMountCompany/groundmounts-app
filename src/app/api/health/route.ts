import { NextResponse } from "next/server";
import { redisConfigured } from "@/lib/server/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = {
      hasResend: !!process.env.RESEND_API_KEY,
      hasMapbox: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      hasAirtable: !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID,
      hasNrel: !!process.env.NREL_API_KEY,
      // Absent is not broken — rate limiting, the site cache and submit
      // idempotency all fall back to per-instance memory. It does mean they
      // are per-instance, which is worth being able to see from outside.
      hasRedis: redisConfigured(),
      notifyEmail: process.env.NOTIFY_EMAIL || "bert@groundmounts.com",
    };
    return NextResponse.json({ ok: true, env });
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({ ok: false, error: error?.message || "health_failed" }, { status: 500 });
  }
}