import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a Resend webhook signature.
 *
 * Resend signs with Svix, and the scheme is worth stating because it is not
 * the obvious one: the signed payload is `<id>.<timestamp>.<body>`, the secret
 * is base64 *after* stripping its `whsec_` prefix, and the signature header
 * carries a space-separated list of `v1,<base64>` entries — plural, because a
 * secret being rotated is signed with both the old and the new one.
 *
 * Implemented here rather than by adding the `svix` package: it is forty lines
 * of HMAC, and a webhook verifier is exactly the kind of thing worth being
 * able to read in the repo that depends on it.
 */

/** How far out of step a timestamp may be. Svix's own default. */
export const TOLERANCE_SECONDS = 5 * 60;

export type SignatureVerdict = 'ok' | 'invalid' | 'stale' | 'unconfigured';

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function readSvixHeaders(headers: Headers): SvixHeaders {
  return {
    // Both spellings, because Svix sends `svix-*` and some proxies rewrite to
    // `webhook-*` under the standard-webhooks name.
    id: headers.get('svix-id') ?? headers.get('webhook-id'),
    timestamp: headers.get('svix-timestamp') ?? headers.get('webhook-timestamp'),
    signature: headers.get('svix-signature') ?? headers.get('webhook-signature'),
  };
}

export function verifySvix(
  secret: string,
  headers: SvixHeaders,
  body: string,
  now = Date.now()
): SignatureVerdict {
  if (!secret) return 'unconfigured';
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return 'invalid';

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return 'invalid';

  /*
    Replay window, checked before the signature.

    A correctly signed request from an hour ago is still a replay, and the
    timestamp is inside the signed payload, so an attacker cannot move it
    without invalidating the signature.
  */
  if (Math.abs(Math.floor(now / 1000) - sentAt) > TOLERANCE_SECONDS) return 'stale';

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');

  // A rotating secret means several signatures arrive at once, any of which
  // may be the valid one.
  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    const a = Buffer.from(value, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    // Length-checked first: timingSafeEqual throws on a mismatch, and a thrown
    // comparison is a 500 where a 401 belongs.
    if (a.length === b.length && timingSafeEqual(a, b)) return 'ok';
  }
  return 'invalid';
}
