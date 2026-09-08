/**
 * When a call would suit them.
 *
 * Three answers, because the question is "when's a good time?" and not "pick a
 * slot" — the owner rings people, and a customer who has just been shown a
 * five-figure number should not be made to negotiate a calendar to say
 * "afternoons are fine".
 */
export const CALL_TIMES = ['Morning', 'Afternoon', 'Evening'] as const;

export type CallTime = (typeof CALL_TIMES)[number];

export function isCallTime(value: unknown): value is CallTime {
  return typeof value === 'string' && (CALL_TIMES as readonly string[]).includes(value);
}

/**
 * Read a call time off an untrusted string, case-insensitively.
 *
 * The email's version arrives as a query parameter that has been through a
 * mail client, a link scanner and possibly somebody's clipboard, so "morning"
 * and "Morning" both have to work. Returns null rather than a default: a
 * malformed answer is not an answer, and writing "Morning" because the
 * parameter was gibberish would put a fact in the owner's base that nobody
 * ever said.
 */
export function parseCallTime(value: unknown): CallTime | null {
  if (typeof value !== 'string') return null;
  const wanted = value.trim().toLowerCase();
  return CALL_TIMES.find((t) => t.toLowerCase() === wanted) ?? null;
}
