import { getLeadRecord, updateLeadRecord } from '@/lib/airtable';
import { getClientIp, rateLimitOkAsync } from '@/lib/guard';
import { escapeHtml } from '@/lib/escape';
import { brandFor } from '@/config/brands';
import { unsubscribeFields } from '@/lib/unsubscribe';
import { verifyUnsubscribe } from '@/lib/server/unsubscribeToken';

/**
 * /unsubscribe?t=<recordId>.<hmac> — the link in the footer of every
 * follow-up email.
 *
 * GET shows one button; POST does the write. Not a GET that writes, because
 * mail scanners and link previewers open every link in an email before the
 * person does, and a GET that unsubscribed would take people off the list
 * who never asked. The same POST also answers the one-click
 * `List-Unsubscribe-Post` header (RFC 8058), which mail apps send without
 * showing anything.
 *
 * The token is checked on both, so nobody can unsubscribe somebody else, and
 * a bad one gets the same answer whether or not the lead exists.
 */

type Outcome = 'confirm' | 'done' | 'invalid' | 'failed' | 'rate_limited';

async function check(req: Request): Promise<{ outcome: Outcome; recordId?: string }> {
  // Before the signature check: a free check is an oracle for guessing tokens.
  if (!(await rateLimitOkAsync(getClientIp(req), 'unsubscribe'))) return { outcome: 'rate_limited' };

  const token = new URL(req.url).searchParams.get('t') ?? '';
  const verdict = verifyUnsubscribe(token);
  if (!verdict.ok) {
    if (verdict.reason === 'unconfigured') {
      console.warn('[UNSUBSCRIBE] UNSUBSCRIBE_SECRET is not set; refusing every link');
    }
    return { outcome: 'invalid' };
  }
  return { outcome: 'confirm', recordId: verdict.recordId };
}

export async function GET(req: Request): Promise<Response> {
  const { outcome } = await check(req);
  return page(outcome);
}

export async function POST(req: Request): Promise<Response> {
  const { outcome, recordId } = await check(req);
  if (outcome !== 'confirm' || !recordId) return page(outcome);

  try {
    const fields = unsubscribeFields(await getLeadRecord(recordId));
    // Null means it is already recorded: a second click, or a mail app's
    // one-click request followed by the person clicking too.
    if (fields) await updateLeadRecord(recordId, fields);
    console.log('[UNSUBSCRIBE]', recordId, fields ? 'recorded' : 'already recorded');
    return page('done');
  } catch (error) {
    console.error('[UNSUBSCRIBE_ERROR]', recordId, error instanceof Error ? error.message : error);
    return page('failed');
  }
}

const COPY: Record<Outcome, { heading: string; body: string; status: number }> = {
  confirm: {
    heading: 'Stop getting our emails?',
    body: 'One click and we won’t email you again.',
    status: 200,
  },
  done: {
    heading: 'You’re unsubscribed.',
    body: 'We won’t email you again.',
    status: 200,
  },
  invalid: {
    heading: 'That link didn’t work.',
    body: 'Reply to any email from us with the word “unsubscribe” and we’ll take you off the list.',
    status: 400,
  },
  failed: {
    heading: 'That didn’t go through on our end.',
    body: 'Try again in a minute, or reply to any email from us with the word “unsubscribe” and we’ll take you off the list.',
    status: 502,
  },
  rate_limited: {
    heading: 'Too many tries.',
    body: 'Wait a minute and try the link again.',
    status: 429,
  },
};

/**
 * Self-contained HTML, like the call-time page: opened from an inbox, often in
 * a webview, so it does not wait on the funnel's bundle.
 */
function page(outcome: Outcome): Response {
  const { heading, body, status } = COPY[outcome];
  // No action attribute: the form posts back to this exact URL, token included.
  const button =
    outcome === 'confirm'
      ? `<form method="post" style="margin:24px 0 0"><button type="submit" style="font:inherit;font-weight:600;padding:12px 24px;border:0;border-radius:6px;background:#1e3a5f;color:#fff;cursor:pointer">Unsubscribe</button></form>`
      : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(brandFor().name)}</title></head>
<body style="margin:0;font:17px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#171717">
<main style="max-width:520px;margin:0 auto;padding:48px 24px">
<p style="font-size:20px;font-weight:600;margin:0 0 12px">${escapeHtml(heading)}</p>
<p style="margin:0;color:#525252">${escapeHtml(body)}</p>
${button}
</main></body></html>`;

  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // The token is in the URL; nothing this page links to should see it.
      'Referrer-Policy': 'no-referrer',
    },
  });
}
