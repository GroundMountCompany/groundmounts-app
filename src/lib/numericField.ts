/**
 * Parsing for numeric text inputs.
 *
 * The fields keep a string while the customer types and only commit a number on
 * blur. Storing a number directly meant every intermediate keystroke had to be
 * a valid number: typing "0." to reach "0.14" produced NaN, which then spread
 * silently through the sizing maths.
 */

/** Strip everything that cannot appear in a typed number. */
export function sanitizeNumeric(raw: string, allowDecimal = false): string {
  const pattern = allowDecimal ? /[^0-9.]/g : /[^0-9]/g;
  const cleaned = raw.replace(pattern, '');
  if (!allowDecimal) return cleaned;
  // Keep only the first decimal point.
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('')}` : head;
}

/**
 * Commit a typed string to a number. Anything that is not a finite number —
 * "", ".", "0.", "abc" — falls back rather than becoming NaN.
 */
export function parseNumericField(raw: string, fallback = 0): number {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Commit to a whole number, for fields like cents that have no fraction. */
export function parseIntegerField(raw: string, fallback = 0): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}
