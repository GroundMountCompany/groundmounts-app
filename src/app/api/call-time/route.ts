import { NextResponse } from 'next/server';
import { upsertLeadByLeadId } from '@/lib/airtable';
import type { LeadFields } from '@/lib/airtable';
import { getClientIp, rateLimitOkAsync } from '@/lib/guard';
import { storeGet, storeSet, acquireLease, releaseLease } from '@/lib/server/redis';
import { parseCallTime } from '@/lib/callTime';
import { verifyResume, resumeConfigured } from '@/lib/server/resumeToken';
import { CALL_TIME_PREFIX, SUBMIT_PREFIX } from '@/lib/leadKeys';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Long enough to cover the write, short enough not to strand a retry. */
const LEASE_TTL_SECONDS = 30;
const LEASE_PREFIX = 'gm:calltime:lease:';

/** Remembered so a second tap on the same chip is not a second write. */
const RECORD_TTL_SECONDS = 30 * 24 * 60 * 60;

interface StoredAnswer {
  when: string;
  at: number;
}

/**
 * "When's a good time?" — answered.
 *
 * The one thing this route will not do is invent a lead. It requires a lead
 * that has actually been filed, checked against the same submit record the
 * quote route writes: without that, an endpoint that takes a uuid and a word
 * and writes them to the owner's base is a way to fill it with rows for
 * customers who do not exist.
 *
 * Two ways in, one implementation:
 *
 *   POST  from the success screen, where the browser has just filed the lead
 *         and already holds the id.
 *   GET   from the quote email, where there is no session at all — so the link
 *         carries the same HMAC the resume links use, and answers with a page
 *         rather than JSON, because a person in their inbox opened it.
 */
async function record(
  leadId: string,
  when: string,
  ip: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!(await rateLimitOkAsync(ip, 'call-time'))) {
    return { status: 429, body: { ok: false, error: 'rate_limited' } };
  }

  /*
    The lead has to exist and have been filed.

    Read before the lease, so a caller with no business here costs nothing.
    The store is the only thing that can vouch for the lead, so if it cannot
    be reached this route declines rather than guessing.
  */
  let filed: { leadFiled?: boolean } | null;
  try {
    filed = await storeGet<{ leadFiled?: boolean }>(SUBMIT_PREFIX + leadId);
  } catch {
    return { status: 503, body: { ok: false, error: 'unavailable' } };
  }
  if (!filed?.leadFiled) {
    return { status: 404, body: { ok: false, error: 'no_such_lead' } };
  }

  const leaseKey = LEASE_PREFIX + leadId;
  let token: string | null;
  try {
    token = await acquireLease(leaseKey, LEASE_TTL_SECONDS);
  } catch {
    return { status: 503, body: { ok: false, error: 'unavailable' } };
  }
  if (!token) {
    // Another tap is mid-write. Theirs will land; this one need not.
    return { status: 200, body: { ok: true, when, deduped: true } };
  }

  try {
    const already = await storeGet<StoredAnswer>(CALL_TIME_PREFIX + leadId);
    if (already?.when === when) {
      // The same answer twice — a double tap, or the email link opened again.
      // Idempotent by doing nothing, rather than by rewriting the same row.
      return { status: 200, body: { ok: true, when, deduped: true } };
    }

    const fields: LeadFields = { 'Preferred Call Time': when };
    await upsertLeadByLeadId(fields, leadId);

    // Only after the write, so a failed write is retried next time rather than
    // silently remembered as done.
    await storeSet(CALL_TIME_PREFIX + leadId, { when, at: Date.now() }, RECORD_TTL_SECONDS);

    console.log('[CALL_TIME]', leadId, when);
    return { status: 200, body: { ok: true, when } };
  } catch (error) {
    console.error('[CALL_TIME_ERROR]', leadId, error instanceof Error ? error.message : error);
    return { status: 502, body: { ok: false, error: 'not_saved' } };
  } finally {
    await releaseLease(leaseKey, token);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const leadId = typeof body.id === 'string' ? body.id : '';
  const when = parseCallTime(body.when);

  if (!UUID_V4.test(leadId) || !when) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  }

  const result = await record(leadId, when, getClientIp(req));
  return NextResponse.json(result.body, { status: result.status });
}

/** The same answer, from a signed link in the quote email. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const leadId = url.searchParams.get('id') ?? '';
  const when = parseCallTime(url.searchParams.get('when'));
  const token = url.searchParams.get('t') ?? '';

  if (!UUID_V4.test(leadId) || !when || !token || !resumeConfigured()) return page(false, null);
  if (verifyResume(leadId, token) !== 'ok') return page(false, null);

  const result = await record(leadId, when, getClientIp(req));
  return page(result.body.ok === true, when);
}

/**
 * A whole page for one word.
 *
 * Self-contained HTML with none of the app's styles: this is opened from an
 * inbox, often in a webview, and a page that waited on the funnel's bundle
 * would be a spinner for somebody who has already done what they came to do.
 * It says what happened and stops.
 */
function page(ok: boolean, when: string | null): Response {
  const message = ok
    ? `Got it — ${when} it is. We'll be in touch within one business day.`
    : 'That link did not work. Reply to your quote email and we will sort it out.';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ground Mount Solar</title></head>
<body style="margin:0;font:17px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717">
<main style="max-width:520px;margin:0 auto;padding:48px 24px">
<p style="font-size:20px;font-weight:600;margin:0 0 12px">${escapeText(message)}</p>
<p style="margin:0;color:#525252">Questions? <a href="mailto:bert@groundmounts.com" style="color:#1e3a5f">bert@groundmounts.com</a></p>
</main></body></html>`;

  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** The message is ours, but it is interpolated, so it is escaped. */
function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}
