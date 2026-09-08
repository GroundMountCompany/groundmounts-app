import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signResume, verifyResume, RESUME_TTL_SECONDS } from './resumeToken';

const LEAD = 'e1f2a3b4-5c6d-4e7f-9a8b-9cadbecfd7e8';
const OTHER = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

/**
 * A link that arrives from an inbox and has to prove it came from us.
 *
 * The three answers are deliberately different and each is load-bearing:
 * a tampered link must not be told it is merely expired, an expired one must
 * not be told it is forged, and neither may work.
 */
describe('the resume link signature', () => {
  const original = process.env.RESUME_SECRET;
  beforeEach(() => {
    process.env.RESUME_SECRET = 'test-secret-not-the-real-one';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.RESUME_SECRET;
    else process.env.RESUME_SECRET = original;
  });

  it('accepts a link it just issued', () => {
    const token = signResume(LEAD)!;
    expect(token).toBeTruthy();
    expect(verifyResume(LEAD, token)).toBe('ok');
  });

  it('refuses a token signed for a different lead', () => {
    // The whole point: a valid token must not be a skeleton key.
    const token = signResume(OTHER)!;
    expect(verifyResume(LEAD, token)).toBe('invalid');
  });

  it('refuses a tampered signature', () => {
    const token = signResume(LEAD)!;
    const [expiry, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verifyResume(LEAD, `${expiry}.${flipped}`)).toBe('invalid');
  });

  it('refuses an extended expiry', () => {
    // The attack the signature exists to stop: take a real token, push the
    // date out, keep the signature. The HMAC covers the expiry, so it fails.
    const token = signResume(LEAD)!;
    const [expiry, sig] = token.split('.');
    const later = Number(expiry) + 86_400;
    expect(verifyResume(LEAD, `${later}.${sig}`)).toBe('invalid');
  });

  it('refuses a malformed token rather than throwing', () => {
    for (const bad of ['', '.', 'nope', 'a.b.c', 'abc.def', `${Date.now()}.`]) {
      expect(verifyResume(LEAD, bad)).toBe('invalid');
    }
  });

  it('refuses a short signature without a length-mismatch throw', () => {
    // timingSafeEqual throws on differing lengths, so this path is checked
    // before the comparison. A thrown 500 here would be a denial of service.
    const [expiry] = signResume(LEAD)!.split('.');
    expect(verifyResume(LEAD, `${expiry}.aa`)).toBe('invalid');
  });

  it('calls a link expired only once its own date has passed', () => {
    const issuedAt = Date.UTC(2026, 0, 1);
    const token = signResume(LEAD, issuedAt)!;

    // One second before the deadline it still works.
    const justInside = issuedAt + RESUME_TTL_SECONDS * 1000 - 1000;
    expect(verifyResume(LEAD, token, justInside)).toBe('ok');

    // A minute past it does not.
    const past = issuedAt + (RESUME_TTL_SECONDS + 60) * 1000;
    expect(verifyResume(LEAD, token, past)).toBe('expired');
  });

  it('rejects a token at the exact second it expires', () => {
    /*
      The boundary, which is the only place this is observable.

      The token names the second it expires, so that second is already outside
      it. With `>` the link was still honoured for the whole of its own
      deadline second — valid for one second longer than it claimed. Nobody
      would ever notice, which is precisely why it needs a test rather than an
      argument.

      Sub-second offsets too: the check floors to whole seconds, so anything
      inside the deadline second has to give the same answer as its start.
    */
    const issuedAt = Date.UTC(2026, 0, 1);
    const token = signResume(LEAD, issuedAt)!;
    const expiresAtMs = (Math.floor(issuedAt / 1000) + RESUME_TTL_SECONDS) * 1000;

    // The last instant it is good for: one second before the deadline.
    expect(verifyResume(LEAD, token, expiresAtMs - 1)).toBe('ok');
    expect(verifyResume(LEAD, token, expiresAtMs - 1000)).toBe('ok');

    // The deadline second itself, and every part of it.
    expect(verifyResume(LEAD, token, expiresAtMs), 'honoured at its own expiry').toBe('expired');
    expect(verifyResume(LEAD, token, expiresAtMs + 1)).toBe('expired');
    expect(verifyResume(LEAD, token, expiresAtMs + 999)).toBe('expired');

    // And after it, unchanged.
    expect(verifyResume(LEAD, token, expiresAtMs + 1000)).toBe('expired');
  });

  it('signs nothing and verifies nothing without a secret', () => {
    delete process.env.RESUME_SECRET;
    expect(signResume(LEAD)).toBeNull();
    // Not 'invalid': the caller has to be able to tell "misconfigured" from
    // "somebody is poking at this", because only one of them is worth an alert.
    expect(verifyResume(LEAD, 'anything')).toBe('unconfigured');
  });

  it('a token signed under one secret does not verify under another', () => {
    const token = signResume(LEAD)!;
    process.env.RESUME_SECRET = 'a-different-secret';
    // Which is what makes rotating the secret a real revocation.
    expect(verifyResume(LEAD, token)).toBe('invalid');
  });
});
