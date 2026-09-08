import { NextResponse } from 'next/server';
import { cacheGet } from '@/lib/server/redis';
import { getClientIp, rateLimitOkAsync } from '@/lib/guard';
import { parseSnapshot, RESUME_PREFIX } from '@/lib/resumeSnapshot';
import { resumeConfigured, verifyResume } from '@/lib/server/resumeToken';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Hand back a saved design to whoever holds a valid link.
 *
 * Three failure modes, deliberately distinct, because they mean different
 * things to the person holding the link:
 *
 *   401 invalid  — the signature does not check out. Someone edited the URL,
 *                  or a mail client mangled it. Says nothing about whether
 *                  the lead exists, so ids cannot be probed.
 *   410 expired  — signed by us, but the thirty days are up. The customer did
 *                  nothing wrong and the screen should not imply they did.
 *   404 gone     — valid link, no snapshot. Redis dropped it, or the funnel
 *                  was submitted and cleaned up.
 *
 * Read-only and cheap, but rate-limited anyway: without a limit this is an
 * oracle for guessing tokens, and a signature check is exactly the thing worth
 * making slow to attack.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('t') ?? '';

  if (!UUID_V4.test(id) || !token) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (!(await rateLimitOkAsync(ip, 'resume'))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  if (!resumeConfigured()) {
    // No secret configured means no link we issued can be checked, so nothing
    // may be handed out. Deliberately the same answer as a bad signature.
    console.warn('[RESUME] RESUME_SECRET is not set; refusing every link');
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 401 });
  }

  const verdict = verifyResume(id, token);
  if (verdict === 'expired') {
    return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 });
  }
  if (verdict !== 'ok') {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 401 });
  }

  // Best-effort: a store that is down is a link that does not work today, not
  // a 500 for a customer who is only trying to get back to their design.
  const stored = await cacheGet<unknown>(RESUME_PREFIX + id);
  const snapshot = parseSnapshot(stored);
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: 'gone' }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, snapshot },
    // Never cached anywhere: it is keyed on a signed token and it is somebody's
    // property on a map.
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
