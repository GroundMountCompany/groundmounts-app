import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INTERNAL_COOKIE_MAX_AGE_SECONDS,
  internalCookieFor,
  internalFromUrl,
  internalParam,
  isInternalCookie,
  isInternalRequest,
} from './internalVisit';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('internal visits', () => {
  it('reads only ?internal=1 and ?internal=0 from the landing URL', () => {
    expect(internalParam('?internal=1')).toBe('on');
    expect(internalParam('?step=3&internal=1&utm_source=gbp')).toBe('on');
    expect(internalParam('?internal=0')).toBe('off');
    for (const search of ['', '?step=3', '?internal=', '?internal=true', '?internal=yes']) {
      expect(internalParam(search), search).toBeNull();
    }
  });

  it('marks the browser for a year, and unmarks it straight away', () => {
    const on = internalCookieFor('?internal=1', true);
    expect(on).toContain('gm_internal=1');
    expect(on).toContain(`Max-Age=${INTERNAL_COOKIE_MAX_AGE_SECONDS}`);
    expect(on).toContain('Path=/');
    expect(on).toContain('Secure');

    const off = internalCookieFor('?internal=0', true);
    expect(off).toContain('gm_internal=;');
    expect(off).toContain('Max-Age=0');
  });

  it('leaves the cookie alone when the URL says nothing', () => {
    expect(internalCookieFor('?step=2', true)).toBeNull();
  });

  it('drops Secure on plain http, where the browser would refuse the cookie', () => {
    expect(internalCookieFor('?internal=1', false)).not.toContain('Secure');
  });

  it('treats only the exact value it sets as internal', () => {
    expect(isInternalCookie('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', ' 1']) {
      expect(isInternalCookie(value), String(value)).toBe(false);
    }
  });

  it('reads ?internal=1 off this page load, the way the iframe gets it', () => {
    vi.stubGlobal('window', { location: { search: '?source=groundmounts.com&internal=1&step=3' } });
    expect(internalFromUrl()).toBe(true);
    vi.stubGlobal('window', { location: { search: '?internal=0&step=3' } });
    expect(internalFromUrl()).toBe(false);
    vi.stubGlobal('window', { location: { search: '?step=3' } });
    expect(internalFromUrl()).toBe(false);
  });

  it('says no on the server, where there is no page URL', () => {
    expect(internalFromUrl()).toBe(false);
  });

  it('counts a save as the owner\'s from the cookie or from the body', () => {
    expect(isInternalRequest('1', undefined)).toBe(true);
    expect(isInternalRequest(undefined, true)).toBe(true);
    expect(isInternalRequest(undefined, undefined)).toBe(false);
    // Only a real boolean true: nothing a sloppy client might send by accident.
    for (const flag of ['true', 1, '1', 'yes', {}, null, false]) {
      expect(isInternalRequest(undefined, flag), JSON.stringify(flag)).toBe(false);
    }
  });
});
