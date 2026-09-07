import { NextRequest, NextResponse } from "next/server";
import { redisConfigured } from "@/lib/server/redis";
import { getClientIp, rateLimitOkAsync } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * Is this deployment wired up?
 *
 * Booleans only. It used to echo the notification address, which is a piece of
 * the owner's configuration that an unauthenticated caller has no reason to
 * learn from us. Rate limited like everything else: an endpoint that reads env
 * on every request should not be free to hammer.
 */
export async function GET(req: NextRequest) {
  if (!(await rateLimitOkAsync(getClientIp(req), 'health'))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

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
      // Whether a recipient is configured, not who it is.
      hasNotifyEmail: !!process.env.NOTIFY_EMAIL,
    };
    return NextResponse.json({ ok: true, env });
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({ ok: false, error: error?.message || "health_failed" }, { status: 500 });
  }
}