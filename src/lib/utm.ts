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

/*
 * Meta's click id, as the `fbc` value its Conversions API matches on.
 *
 * An ad click lands with `?fbclid=`. Meta wants it back on the server's Lead as
 * `fb.1.<ms the click id was first seen>.<fbclid>`; without it a lead from a
 * browser that blocked the pixel cannot be tied to the ad that paid for it.
 * Kept next to the UTM tags for the same reason they are kept: the URL is
 * stripped as the funnel advances. Never written to Airtable.
 */
const FBCLID_PATTERN = /^[A-Za-z0-9_-]{1,500}$/;
const FBC_PATTERN = /^fb\.1\.\d{13}\.[A-Za-z0-9_-]{1,500}$/;

/** The `fbc` for this URL's `fbclid`, first seen at `now`, or none. */
export function fbcFromSearch(search: string, now: number): string | undefined {
  const fbclid = new URLSearchParams(search).get('fbclid')?.trim();
  if (!fbclid || !FBCLID_PATTERN.test(fbclid)) return undefined;
  return `fb.1.${Math.floor(now)}.${fbclid}`;
}

/**
 * Which `fbc` to keep. The same click id seen again (a reload) keeps its first
 * timestamp; a different one is a newer ad click and replaces it, as Meta asks.
 */
export function nextFbc(current: string | null, incoming: string): string {
  const clickId = (fbc: string) => fbc.split('.').slice(3).join('.');
  return current && clickId(current) === clickId(incoming) ? current : incoming;
}

/** Read an `fbc` off an untrusted request body. Anything malformed is dropped. */
export function parseFbc(value: unknown): string | undefined {
  return typeof value === 'string' && FBC_PATTERN.test(value) ? value : undefined;
}

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
