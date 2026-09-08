import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySvix, readSvixHeaders, TOLERANCE_SECONDS } from './svix';

const SECRET = 'whsec_' + Buffer.from('a-test-signing-key-32-bytes-long').toString('base64');
const BODY = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });

function sign(id: string, timestamp: number, body: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const TS = Math.floor(NOW / 1000);

/**
 * A public URL that writes to the owner's base. The signature is the only
 * thing standing between it and anyone who can guess the path.
 */
describe('the Resend webhook signature', () => {
  it('accepts a delivery it can verify', () => {
    const headers = { id: 'msg_1', timestamp: String(TS), signature: sign('msg_1', TS, BODY) };
    expect(verifySvix(SECRET, headers, BODY, NOW)).toBe('ok');
  });

  it('refuses a body that was changed after signing', () => {
    // The attack that matters: mark somebody else's lead bounced.
    const headers = { id: 'msg_1', timestamp: String(TS), signature: sign('msg_1', TS, BODY) };
    const tampered = BODY.replace('delivered', 'bounced');
    expect(verifySvix(SECRET, headers, tampered, NOW)).toBe('invalid');
  });

  it('refuses a signature made with another secret', () => {
    const other = 'whsec_' + Buffer.from('a-different-key-of-32-bytes-here').toString('base64');
    const headers = {
      id: 'msg_1',
      timestamp: String(TS),
      signature: sign('msg_1', TS, BODY, other),
    };
    expect(verifySvix(SECRET, headers, BODY, NOW)).toBe('invalid');
  });

  it('refuses a signature bound to a different message id', () => {
    // The id is inside the signed payload, so a replay under a fresh id fails.
    const headers = { id: 'msg_2', timestamp: String(TS), signature: sign('msg_1', TS, BODY) };
    expect(verifySvix(SECRET, headers, BODY, NOW)).toBe('invalid');
  });

  it('calls an old but correctly signed delivery stale, not invalid', () => {
    // A valid signature from an hour ago is still a replay, and the two
    // failures mean different things in a log.
    const old = TS - TOLERANCE_SECONDS - 60;
    const headers = { id: 'msg_1', timestamp: String(old), signature: sign('msg_1', old, BODY) };
    expect(verifySvix(SECRET, headers, BODY, NOW)).toBe('stale');
  });

  it('accepts one just inside the tolerance, either side', () => {
    for (const offset of [-TOLERANCE_SECONDS + 5, TOLERANCE_SECONDS - 5]) {
      const ts = TS + offset;
      const headers = { id: 'msg_1', timestamp: String(ts), signature: sign('msg_1', ts, BODY) };
      expect(verifySvix(SECRET, headers, BODY, NOW), `offset ${offset}`).toBe('ok');
    }
  });

  it('accepts when one of several signatures matches', () => {
    // A rotating secret means Svix sends both. Either being valid is enough.
    const headers = {
      id: 'msg_1',
      timestamp: String(TS),
      signature: `v1,bm90LXRoZS1yaWdodC1vbmU= ${sign('msg_1', TS, BODY)}`,
    };
    expect(verifySvix(SECRET, headers, BODY, NOW)).toBe('ok');
  });

  it('refuses a malformed header rather than throwing', () => {
    const bad = [
      { id: null, timestamp: String(TS), signature: sign('msg_1', TS, BODY) },
      { id: 'msg_1', timestamp: null, signature: sign('msg_1', TS, BODY) },
      { id: 'msg_1', timestamp: String(TS), signature: null },
      { id: 'msg_1', timestamp: 'not-a-number', signature: sign('msg_1', TS, BODY) },
      { id: 'msg_1', timestamp: String(TS), signature: 'garbage' },
      // A short signature: timingSafeEqual throws on differing lengths, so the
      // length is checked first. A thrown comparison is a 500 where a 401
      // belongs, and a denial of service besides.
      { id: 'msg_1', timestamp: String(TS), signature: 'v1,aa' },
    ];
    for (const headers of bad) {
      expect(() => verifySvix(SECRET, headers, BODY, NOW)).not.toThrow();
      expect(verifySvix(SECRET, headers, BODY, NOW)).not.toBe('ok');
    }
  });

  it('verifies nothing at all without a configured secret', () => {
    const headers = { id: 'msg_1', timestamp: String(TS), signature: sign('msg_1', TS, BODY) };
    // Not 'invalid': the caller has to tell "misconfigured" from "somebody is
    // poking at this", because only one of them is worth an alert.
    expect(verifySvix('', headers, BODY, NOW)).toBe('unconfigured');
  });

  it('reads both header spellings', () => {
    const svix = new Headers({ 'svix-id': 'a', 'svix-timestamp': 'b', 'svix-signature': 'c' });
    expect(readSvixHeaders(svix)).toEqual({ id: 'a', timestamp: 'b', signature: 'c' });

    // Some proxies rewrite to the standard-webhooks names.
    const standard = new Headers({
      'webhook-id': 'a',
      'webhook-timestamp': 'b',
      'webhook-signature': 'c',
    });
    expect(readSvixHeaders(standard)).toEqual({ id: 'a', timestamp: 'b', signature: 'c' });
  });
});
