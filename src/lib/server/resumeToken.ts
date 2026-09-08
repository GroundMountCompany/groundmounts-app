import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A link that proves it came from us.
 *
 * The resume link goes out by email and comes back as a URL, which means it
 * arrives from somewhere we do not control and may have been forwarded,
 * truncated by a mail client, or edited by somebody curious. A lead id on its
 * own would let anyone who guessed one read a stranger's saved design — the
 * design is not PII, but it is a real address on a satellite map, which is
 * near enough to somebody's home that it should not be enumerable.
 *
 * So: `<expiry>.<hmac>`, where the HMAC covers both the lead id and the
 * expiry. Changing either invalidates it. The expiry is in the clear because
 * it has to be readable to be checked, and the signature is what stops it
 * being extended.
 */

/** Thirty days, matching the snapshot's own TTL. Neither outlives the other. */
export const RESUME_TTL_SECONDS = 30 * 24 * 60 * 60;

export type ResumeVerdict = 'ok' | 'invalid' | 'expired' | 'unconfigured';

function secret(): string {
  return process.env.RESUME_SECRET?.trim() ?? '';
}

export function resumeConfigured(): boolean {
  return secret().length > 0;
}

function sign(leadId: string, expiresAt: number): string {
  return createHmac('sha256', secret()).update(`${leadId}.${expiresAt}`).digest('hex');
}

/** A token for this lead, valid for `ttlSeconds` from `now`. */
export function signResume(
  leadId: string,
  now = Date.now(),
  ttlSeconds = RESUME_TTL_SECONDS
): string | null {
  if (!resumeConfigured()) return null;
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  return `${expiresAt}.${sign(leadId, expiresAt)}`;
}

/**
 * Signature first, expiry second — and the order is the point.
 *
 * A tampered token must never be told it is merely expired: that would confirm
 * the id is real and invite a retry with a later date. An expired one is a
 * different answer because the customer holding it did nothing wrong and the
 * screen should say so rather than accusing them.
 */
export function verifyResume(leadId: string, token: string, now = Date.now()): ResumeVerdict {
  if (!resumeConfigured()) return 'unconfigured';

  const parts = token.split('.');
  if (parts.length !== 2) return 'invalid';
  const [rawExpiry, provided] = parts;

  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return 'invalid';

  const expected = sign(leadId, expiresAt);
  // Length-checked first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a thrown comparison is still a leak of length.
  if (provided.length !== expected.length) return 'invalid';
  if (!timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))) {
    return 'invalid';
  }

  // `>=`, not `>`. The token names the second it expires, so that second is
  // already outside it — a link honoured at exactly its own deadline is valid
  // for one second longer than it claims, and the boundary is the only place
  // an off-by-one here is ever observable.
  return Math.floor(now / 1000) >= expiresAt ? 'expired' : 'ok';
}
