/**
 * The campaign parameters, on their own.
 *
 * Split out from analytics.ts because the store holds them and analytics.ts
 * reads the store — putting the type there would be an import cycle. There is
 * nothing analytics-specific about a UTM tag anyway: it reaches Airtable
 * whether or not PostHog is configured.
 */
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;

/** Longest value that reaches a single-line Airtable field. */
export const UTM_MAX_LENGTH = 200;

export function utmFromSearch(search: string): Utm {
  const params = new URLSearchParams(search);
  const out: Utm = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    // Capped, because these arrive from whatever a customer pasted into the
    // address bar and not always from a campaign builder.
    if (value) out[key] = value.slice(0, UTM_MAX_LENGTH);
  }
  return out;
}

/** The Airtable column each parameter lands in. */
export const UTM_FIELDS: Record<UtmKey, string> = {
  utm_source: 'UTM Source',
  utm_medium: 'UTM Medium',
  utm_campaign: 'UTM Campaign',
  utm_term: 'UTM Term',
  utm_content: 'UTM Content',
};

/** Read a UTM object off an untrusted request body. */
export function parseUtm(value: unknown): Utm {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const out: Utm = {};
  for (const key of UTM_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, UTM_MAX_LENGTH);
  }
  return out;
}
