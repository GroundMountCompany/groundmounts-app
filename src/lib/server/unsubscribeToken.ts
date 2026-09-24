import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The unsubscribe link: `<recordId>.<hmac>`.
 *
 * Keyed on the Airtable record id rather than the funnel's Lead ID, because
 * the leads that get follow-up email did not all come through the funnel —
 * the phone agent files them too, and those rows have no Lead ID at all.
 *
 * Two deliberate differences from the resume token:
 *
 *   No expiry.  An unsubscribe link in an email from last spring still has to
 *               work. A link that stops honouring "take me off" is worse than
 *               no link.
 *   Own secret. UNSUBSCRIBE_SECRET, not RESUME_SECRET, so rotating the resume
 *               secret (which is meant to revoke resume links) cannot quietly
 *               break every unsubscribe link sitting in an inbox. The HMAC
 *               input is prefixed as well, so even a shared secret could not
 *               make one kind of token pass for the other.
 */

export type UnsubscribeVerdict =
  | { ok: true; recordId: string }
  | { ok: false; reason: 'invalid' | 'unconfigured' };

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET?.trim() ?? '';
}

export function unsubscribeConfigured(): boolean {
  return secret().length > 0;
}

function sign(recordId: string): string {
  return createHmac('sha256', secret()).update(`unsubscribe.${recordId}`).digest('hex');
}

/** The token for one lead's unsubscribe link, or null without a secret. */
export function signUnsubscribe(recordId: string): string | null {
  if (!unsubscribeConfigured() || !RECORD_ID.test(recordId)) return null;
  return `${recordId}.${sign(recordId)}`;
}

/**
 * Which lead this token belongs to, if we signed it.
 *
 * Nothing about a bad token is echoed back: a forged one and one for a record
 * that never existed get the same answer, so ids cannot be probed.
 */
export function verifyUnsubscribe(token: string): UnsubscribeVerdict {
  if (!unsubscribeConfigured()) return { ok: false, reason: 'unconfigured' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid' };
  const [recordId, provided] = parts;
  if (!RECORD_ID.test(recordId)) return { ok: false, reason: 'invalid' };

  const expected = sign(recordId);
  // Length first: timingSafeEqual throws on a mismatch rather than returning false.
  if (provided.length !== expected.length) return { ok: false, reason: 'invalid' };
  if (!timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, recordId };
}
