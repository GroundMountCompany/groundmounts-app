import { createHash } from 'node:crypto';

/**
 * The half of the funnel a browser cannot be trusted to report.
 *
 * An ad blocker, a privacy extension, a corporate proxy or simply a tab closed
 * a second after the button was pressed all lose the client's `lead_filed`.
 * The server's copy cannot be blocked, and it fires from the same code path
 * that actually wrote the record — so it is a count of leads rather than a
 * count of browsers that managed to phone home.
 *
 * Both copies share the lead id as their identity, so PostHog and Meta each
 * de-duplicate rather than counting one submission twice.
 *
 * Everything here is best-effort and silent. This module is imported by the
 * route that files the lead; nothing in it may ever be the reason a lead is
 * not filed.
 */

type ServerEvent = 'lead_filed' | 'email_sent';

function posthogKey(): string {
  // The same project as the browser's. There is no separate server key.
  return process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? '';
}

function posthogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
}

/**
 * Sent and awaited, not queued.
 *
 * posthog-node batches and flushes on a timer, which is exactly wrong in a
 * serverless function: the instance can be frozen the moment the response is
 * returned and the batch never leaves. One request, awaited, with a short
 * timeout — a lost event is acceptable, a lead delayed by analytics is not.
 */
const CAPTURE_TIMEOUT_MS = 2500;

export async function captureServer(
  event: ServerEvent,
  distinctId: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const key = posthogKey();
  if (!key || !distinctId) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
    try {
      await fetch(`${posthogHost()}/i/v0/e/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          api_key: key,
          event,
          distinct_id: distinctId,
          properties: { ...properties, $lib: 'gm-server' },
          timestamp: new Date().toISOString(),
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* Swallowed on purpose. See the note at the top of this file. */
  }
}

// --- Meta Conversions API ---------------------------------------------------

const META_PIXEL_ID = '1711326086132514';
const META_API_VERSION = 'v21.0';

export function metaCapiEnabled(): boolean {
  return (process.env.META_CAPI_TOKEN?.trim() ?? '') !== '';
}

/** Meta requires contact details hashed, lower-cased and trimmed. */
function hashed(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return undefined;
  return createHash('sha256').update(trimmed).digest('hex');
}

/**
 * The same Lead the pixel reports, from the server.
 *
 * `eventId` is the lead id, which the browser also sends as the pixel's
 * `eventID`. Meta collapses the pair into one conversion — without it the
 * owner would see every lead twice and bid against their own numbers.
 *
 * Skipped cleanly when META_CAPI_TOKEN is absent, which is the state on every
 * preview deployment and on a local machine.
 */
export async function metaLead(
  eventId: string,
  input: { email?: string; phone?: string; value?: number; sourceUrl?: string }
): Promise<void> {
  const token = process.env.META_CAPI_TOKEN?.trim();
  if (!token || !eventId) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
    try {
      await fetch(`https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          access_token: token,
          data: [
            {
              event_name: 'Lead',
              event_time: Math.floor(Date.now() / 1000),
              // The dedup key. Same string the pixel sent.
              event_id: eventId,
              action_source: 'website',
              event_source_url: input.sourceUrl,
              user_data: {
                em: hashed(input.email),
                ph: hashed(input.phone?.replace(/\D/g, '')),
              },
              custom_data: { value: input.value ?? 0, currency: 'USD' },
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* Same rule. Analytics never breaks a submit. */
  }
}
