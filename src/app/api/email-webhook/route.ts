import { NextResponse } from 'next/server';
import { upsertLeadByLeadId } from '@/lib/airtable';
import type { LeadFields } from '@/lib/airtable';
import { getClientIp, rateLimitOkAsync } from '@/lib/guard';
import { cacheGet, storeSet } from '@/lib/server/redis';
import { readSvixHeaders, verifySvix } from '@/lib/server/svix';
import { EMAIL_LEAD_PREFIX, EMAIL_EVENT_PREFIX } from '@/lib/leadKeys';

/**
 * What the quote email did after it left.
 *
 * "Filed but never delivered" and "delivered and ignored" look identical in
 * Airtable without this, and they are not the same lead: one needs a different
 * address, the other needs a phone call. The owner registers this URL in
 * Resend and the column fills itself.
 *
 * Three properties this route has to have, in the order they bite:
 *
 *   verified   — it is a public URL that writes to the owner's base. An
 *                unsigned POST must not be able to mark a lead bounced.
 *   idempotent — Resend retries on any non-2xx, and a retry must not overwrite
 *                a later status with an earlier one.
 *   quiet      — a webhook that 500s gets retried for hours. Anything we
 *                cannot act on is acknowledged and dropped, not rejected.
 */

/** Resend's event names, and the ones we do anything with. */
const HANDLED = new Set([
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
]);

/**
 * How final each status is.
 *
 * Webhooks arrive out of order — `delivered` after `opened` is routine — and
 * without a rank a late delivery notice would overwrite the fact that somebody
 * read it. Higher wins; equal is a no-op.
 */
const RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  // A bounce or a complaint outranks everything: they are the states the owner
  // has to act on, and they cannot be undone by a stale earlier event.
  bounced: 5,
  complained: 6,
};

/** Long enough to outlive the conversation the email started. */
const SEEN_TTL_SECONDS = 30 * 24 * 60 * 60;

interface WebhookBody {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string };
}

export async function POST(req: Request): Promise<NextResponse> {
  const ip = getClientIp(req);
  if (!(await rateLimitOkAsync(ip, 'email-webhook'))) {
    // 429 rather than a silent drop: Resend backs off and retries, which is
    // the behaviour we want from a burst.
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? '';
  // Read as text, because the signature covers the exact bytes sent. Parsing
  // first and re-serialising would change them.
  const raw = await req.text();

  const verdict = verifySvix(secret, readSvixHeaders(req.headers), raw);
  if (verdict !== 'ok') {
    if (verdict === 'unconfigured') {
      console.warn('[EMAIL_WEBHOOK] RESEND_WEBHOOK_SECRET is not set; refusing every delivery');
    }
    // Deliberately the same answer for a bad signature and a missing secret:
    // a caller has no business learning which.
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: true, ignored: 'unparseable' });
  }

  const type = body.type ?? '';
  const emailId = body.data?.email_id ?? '';
  if (!HANDLED.has(type) || !emailId) {
    // Acknowledged, not rejected. An event we do not handle is not an error,
    // and a 4xx here would have Resend retrying it for hours.
    return NextResponse.json({ ok: true, ignored: type || 'unknown' });
  }

  /*
    One delivery, once.

    Svix's message id is stable across retries, so this is the natural
    idempotency key — and it is checked before anything is written, so a retry
    of a delivery we already acted on costs one read.
  */
  const svixId = readSvixHeaders(req.headers).id ?? '';
  const eventKey = EMAIL_EVENT_PREFIX + svixId;
  if (svixId) {
    const seen = await cacheGet<boolean>(eventKey);
    if (seen) return NextResponse.json({ ok: true, deduped: true });
  }

  /*
    Which lead this email belongs to.

    Written when the quote was sent, keyed on Resend's own email id. The
    alternative is Resend's `tags`, echoed back on the event — but that relies
    on a field being present on every event type, and this mapping is ours and
    can be reasoned about. The cost is that an evicted key loses the link; the
    TTL is thirty days, which is longer than any of these events arrive in.
  */
  const leadId = await cacheGet<string>(EMAIL_LEAD_PREFIX + emailId);
  if (!leadId) {
    console.warn('[EMAIL_WEBHOOK] no lead for email', emailId, type);
    return NextResponse.json({ ok: true, ignored: 'unknown_email' });
  }

  const status = type.replace(/^email\./, '');

  // Out-of-order protection. A late `delivered` must not overwrite `opened`.
  const previous = await cacheGet<string>(statusKey(leadId));
  if (previous && (RANK[previous] ?? 0) >= (RANK[status] ?? 0)) {
    if (svixId) await storeSet(eventKey, true, SEEN_TTL_SECONDS).catch(() => {});
    return NextResponse.json({ ok: true, superseded: previous });
  }

  const fields: LeadFields = { 'Email Status': status };
  if (type === 'email.opened') {
    // Their clock, not ours: `created_at` is when Resend saw it.
    fields['Email Opened At'] = isoOr(body.created_at);
  }

  try {
    await upsertLeadByLeadId(fields, leadId);
    await storeSet(statusKey(leadId), status, SEEN_TTL_SECONDS);
    if (svixId) await storeSet(eventKey, true, SEEN_TTL_SECONDS);
    console.log('[EMAIL_WEBHOOK]', leadId, status);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error('[EMAIL_WEBHOOK_ERROR]', leadId, error instanceof Error ? error.message : error);
    // 502 so Resend retries: this one is worth another attempt.
    return NextResponse.json({ ok: false, error: 'not_saved' }, { status: 502 });
  }
}

/** The last status written for a lead, so an older event can be recognised. */
function statusKey(leadId: string): string {
  return `gm:emailstatus:${leadId}`;
}

/** Resend's timestamp when it parses, ours when it does not. */
function isoOr(value: string | undefined): string {
  const parsed = value ? Date.parse(value) : NaN;
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString();
}

/** Unused, but declared: a GET here is somebody checking the URL by hand. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, note: 'POST only. Register this URL in Resend.' });
}
