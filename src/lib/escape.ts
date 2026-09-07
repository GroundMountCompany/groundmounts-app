/**
 * Escape a value for interpolation into HTML text or a double-quoted attribute.
 *
 * Lead names and addresses are attacker-controlled and get interpolated straight
 * into the notification email body, so everything user-supplied goes through here
 * first. Escaping `"` and `'` as well as the tag characters is what makes this
 * safe inside `href="..."` and `src="..."`, not just in text nodes.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Make a value safe to interpolate into an email header (Subject, etc.).
 *
 * CR and LF are what let an attacker append their own headers, so they are
 * stripped rather than escaped. Every fragment of a subject line goes through
 * this — city and state are parsed out of user-supplied address text, so they
 * are no more trustworthy than the name field.
 */
export function headerSafe(value: unknown, fallback = ''): string {
  const str = value === null || value === undefined ? '' : String(value);
  //   U+2028 and U+2029 are line terminators in JS and are honoured by some
  // MIME encoders, so they are stripped alongside CR and LF.
  const cleaned = str
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

/** Escape a value, falling back to a placeholder when it is empty. */
export function escapeOr(value: unknown, fallback: string): string {
  const str = value === null || value === undefined ? '' : String(value).trim();
  return str ? escapeHtml(str) : escapeHtml(fallback);
}
