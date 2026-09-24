import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signUnsubscribe, verifyUnsubscribe } from './unsubscribeToken';

const LEAD = 'recAbCdEfGhIjKlMn';
const OTHER = 'recZyXwVuTsRqPoNm';

describe('the unsubscribe link signature', () => {
  const original = process.env.UNSUBSCRIBE_SECRET;
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = 'test-secret-not-the-real-one';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = original;
  });

  it('accepts a link it just issued and names the lead', () => {
    const token = signUnsubscribe(LEAD)!;
    expect(token.startsWith(`${LEAD}.`)).toBe(true);
    expect(verifyUnsubscribe(token)).toEqual({ ok: true, recordId: LEAD });
  });

  it("will not unsubscribe somebody else: the lead id cannot be swapped", () => {
    const [, sig] = signUnsubscribe(LEAD)!.split('.');
    expect(verifyUnsubscribe(`${OTHER}.${sig}`)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a tampered signature', () => {
    const [id, sig] = signUnsubscribe(LEAD)!.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verifyUnsubscribe(`${id}.${flipped}`).ok).toBe(false);
  });

  it('refuses a malformed token rather than throwing', () => {
    for (const bad of ['', '.', 'nope', 'a.b.c', `${LEAD}.`, `${LEAD}.aa`, `recshort.${'a'.repeat(64)}`]) {
      expect(verifyUnsubscribe(bad), bad).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('never expires, because an old email still has to work', () => {
    const token = signUnsubscribe(LEAD)!;
    // No date in it at all: the same lead always gets the same link.
    expect(signUnsubscribe(LEAD)).toBe(token);
    expect(token.split('.')).toHaveLength(2);
  });

  it('a bare HMAC of the id under the same secret does not pass', () => {
    // The input is prefixed, so some other signature over this id cannot double as one.
    const bare = createHmac('sha256', process.env.UNSUBSCRIBE_SECRET!).update(LEAD).digest('hex');
    expect(verifyUnsubscribe(`${LEAD}.${bare}`).ok).toBe(false);
  });

  it('a token signed under one secret does not verify under another', () => {
    const token = signUnsubscribe(LEAD)!;
    process.env.UNSUBSCRIBE_SECRET = 'a-different-secret';
    expect(verifyUnsubscribe(token).ok).toBe(false);
  });

  it('signs nothing and verifies nothing without a secret', () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    expect(signUnsubscribe(LEAD)).toBeNull();
    expect(verifyUnsubscribe('anything')).toEqual({ ok: false, reason: 'unconfigured' });
  });

  it('will not sign something that is not an Airtable record id', () => {
    expect(signUnsubscribe('e1f2a3b4-5c6d-4e7f-9a8b-9cadbecfd7e8')).toBeNull();
  });
});
