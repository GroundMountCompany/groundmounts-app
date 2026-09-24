/**
 * The owner's own test visits, marked so nobody treats them as customers.
 *
 * Visiting any quote URL with `?internal=1` sets a cookie on that browser, and
 * every lead it files from then on lands with Status "Test" instead of
 * "Partial" or "New". `?internal=0` takes it off again.
 *
 * The cookie only works when the app is the page. Inside groundmounts.com/quote
 * the app is a cross-site iframe, where the browser treats it as a third-party
 * cookie and neither stores nor sends it. So `?internal=1` on the app's own URL
 * also counts on its own for that page load, and travels to the server in the
 * lead save's body (see `internalFromUrl`). groundmounts.com keeps its own
 * first-party mark and adds `internal=1` to the iframe's src.
 *
 * Status rather than a new column because "Test" is already a choice on the
 * live table (the owner added it 2026-09-24) and the seats that read Leads —
 * the inbound rep, the reports — already skip it. A test that files as "New"
 * is a test somebody might answer.
 *
 * Not a secret, and does not need to be: the worst a stranger can do with it
 * is file their own lead as a test. It is a label, not a permission.
 */

export const INTERNAL_COOKIE = 'gm_internal';

/** A year: long enough that the owner sets it once per phone. */
export const INTERNAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** What the landing URL asks for: mark this browser, unmark it, or neither. */
export function internalParam(search: string): 'on' | 'off' | null {
  const value = new URLSearchParams(search).get('internal');
  if (value === '1') return 'on';
  if (value === '0') return 'off';
  return null;
}

/** The Set-Cookie string for `document.cookie`, or null when the URL says nothing. */
export function internalCookieFor(search: string, secure: boolean): string | null {
  const wanted = internalParam(search);
  if (!wanted) return null;
  const maxAge = wanted === 'on' ? INTERNAL_COOKIE_MAX_AGE_SECONDS : 0;
  const value = wanted === 'on' ? '1' : '';
  return `${INTERNAL_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * Whether this page load was opened with `?internal=1`. Read at send time, like
 * `?source=`: the step URL keeps every other query param, so it is still there.
 */
export function internalFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return internalParam(window.location.search) === 'on';
}

/** Whether a request came from a browser marked as the owner's. */
export function isInternalCookie(value: string | undefined): boolean {
  return value === '1';
}

/**
 * Whether a lead save is the owner's: the cookie, or the body's `internal`
 * field for the page loads where the cookie cannot reach (the iframe).
 * Only a literal `true` counts, the same way only the cookie's exact "1" does.
 */
export function isInternalRequest(cookie: string | undefined, bodyFlag: unknown): boolean {
  return isInternalCookie(cookie) || bodyFlag === true;
}
