import { describe, it, expect } from 'vitest';
import { unsubscribeFields, isOptedOut } from './unsubscribe';

const NOW = new Date('2026-09-24T15:00:00Z');

describe('what an unsubscribe writes', () => {
  it('marks a fresh lead with the phone agent\'s own words', () => {
    expect(unsubscribeFields({}, NOW)).toEqual({
      email_status: 'unsubscribed',
      disqualify_reason: 'asked not to be contacted (email, 2026-09-24)',
    });
  });

  it('keeps a reason that was already there', () => {
    const fields = unsubscribeFields(
      { disqualify_reason: 'out of state (Tulsa, OK): design link only, no outreach' },
      NOW
    );
    expect(fields?.disqualify_reason).toBe(
      'out of state (Tulsa, OK): design link only, no outreach; asked not to be contacted (email, 2026-09-24)'
    );
  });

  it('writes nothing a second time', () => {
    const first = unsubscribeFields({}, NOW)!;
    expect(unsubscribeFields(first, NOW)).toBeNull();
  });

  it('only sets the email status when the phone agent already recorded the opt-out', () => {
    const fields = unsubscribeFields({ disqualify_reason: 'asked not to be contacted (sms, 2026-09-20)' }, NOW);
    expect(fields).toEqual({ email_status: 'unsubscribed' });
  });

  it('overrides an active follow-up', () => {
    expect(unsubscribeFields({ email_status: 'active' }, NOW)?.email_status).toBe('unsubscribed');
  });

  it('never touches Status', () => {
    expect(unsubscribeFields({}, NOW)).not.toHaveProperty('Status');
  });

  it('recognises the phrase however it was cased', () => {
    expect(isOptedOut('Asked not to be contacted (voice, 2026-09-01)')).toBe(true);
    expect(isOptedOut('out of state')).toBe(false);
    expect(isOptedOut(undefined)).toBe(false);
  });
});
