import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeOr, headerSafe } from './escape';

describe('headerSafe', () => {
  it('strips CRLF so a name cannot inject an email header', () => {
    const out = headerSafe('Bert\r\nBcc: victim@example.com');
    expect(out).toBe('Bert Bcc: victim@example.com');
    expect(out).not.toMatch(/[\r\n]/);
  });

  it('strips bare LF and bare CR', () => {
    expect(headerSafe('a\nb')).toBe('a b');
    expect(headerSafe('a\rb')).toBe('a b');
  });

  it('strips unicode line separators', () => {
    expect(headerSafe('a\u2028b\u2029c')).toBe('a b c');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(headerSafe('  Fort   Worth  ')).toBe('Fort Worth');
  });

  it('falls back when the value is empty or whitespace only', () => {
    expect(headerSafe('', 'Unknown')).toBe('Unknown');
    expect(headerSafe('\r\n', 'Unknown')).toBe('Unknown');
    expect(headerSafe(undefined, 'Unknown')).toBe('Unknown');
  });

  it('leaves a normal city and state untouched', () => {
    expect(headerSafe('Fort Worth')).toBe('Fort Worth');
    expect(headerSafe('TX')).toBe('TX');
  });
});

describe('escapeHtml', () => {
  it('neutralizes a script tag in a lead name', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain('<script');
  });

  it('prevents breaking out of a double-quoted attribute', () => {
    // The notification email puts the address into href="..." and src="...".
    const out = escapeHtml('" onerror="alert(1)');
    expect(out).not.toContain('"');
    expect(out).toBe('&quot; onerror=&quot;alert(1)');
  });

  it('prevents breaking out of a single-quoted attribute', () => {
    expect(escapeHtml("' onload='x")).toBe('&#39; onload=&#39;x');
  });

  it('escapes ampersands first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('handles a realistic Texas address unchanged apart from safe chars', () => {
    expect(escapeHtml('123 Main St, Fort Worth, TX 76131')).toBe(
      '123 Main St, Fort Worth, TX 76131'
    );
  });

  it('returns an empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces numbers', () => {
    expect(escapeHtml(4350)).toBe('4350');
  });
});

describe('escapeOr', () => {
  it('falls back when the value is empty or whitespace', () => {
    expect(escapeOr('', 'Not provided')).toBe('Not provided');
    expect(escapeOr('   ', 'Not provided')).toBe('Not provided');
    expect(escapeOr(undefined, 'Not provided')).toBe('Not provided');
  });

  it('escapes the value when present', () => {
    expect(escapeOr('<b>Bert</b>', 'Not provided')).toBe('&lt;b&gt;Bert&lt;/b&gt;');
  });

  it('escapes the fallback too', () => {
    expect(escapeOr('', '<none>')).toBe('&lt;none&gt;');
  });
});
