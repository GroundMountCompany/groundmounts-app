/**
 * Redis key prefixes, in one place.
 *
 * Here rather than in the routes that use them because a Next route module may
 * only export its handlers — a shared constant declared in one fails the build
 * with an error about route types that says nothing about the real cause. The
 * resume prefix learned this the hard way in Phase 11.
 */

/** The submit record: what was filed, and whether the email went. */
export const SUBMIT_PREFIX = 'gm:submit:';

/** The call time a customer picked, so a second tap is not a second write. */
export const CALL_TIME_PREFIX = 'gm:calltime:';

/** Resend's email id to our lead id, written when the quote is sent. */
export const EMAIL_LEAD_PREFIX = 'gm:emaillead:';

/** One webhook delivery, by Svix message id, so a retry is not a second write. */
export const EMAIL_EVENT_PREFIX = 'gm:emailevent:';
