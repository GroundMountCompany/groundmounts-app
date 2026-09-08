/**
 * The shape of the Leads table, in one place.
 *
 * Airtable rejects a whole record if a single field name is wrong, and the
 * error is a 422 with a message nobody reads. This declares what the app
 * expects; `scripts/verify-airtable.ts` diffs it against the live base, and the
 * `LeadFields` type below is derived from it so the writer and the checker can
 * never drift apart.
 */

export type FieldKind =
  | 'text'
  | 'longText'
  | 'email'
  | 'phone'
  | 'number'
  | 'currency'
  | 'checkbox'
  | 'select'
  | 'attachment'
  | 'date';

export const LEAD_SCHEMA = {
  /** The upsert merge key. One record per funnel, from step 1 to submit. */
  'Lead ID': 'text',
  /** How far they got. A partial record is a design nobody has claimed yet. */
  'Step Reached': 'number',
  /** Where they were looking. Written from step 1, before any PII exists. */
  Latitude: 'number',
  Longitude: 'number',
  Name: 'text',
  Email: 'email',
  Phone: 'phone',
  Address: 'text',
  City: 'text',
  State: 'text',
  Zip: 'text',
  Panels: 'number',
  'System Size kW': 'number',
  'Monthly Bill Avg': 'currency',
  'Monthly Bill High': 'currency',
  'Offset Percentage': 'number',
  /** Whether the customer uploaded a bill rather than typing their usage in. */
  'Bill Upload': 'checkbox',
  /** The months they confirmed, so the owner can see what it was sized on. */
  'Monthly kWh JSON': 'longText',
  'Trenching Distance ft': 'number',
  'Trenching Cost': 'currency',
  'Equipment Cost': 'currency',
  'Total Investment': 'currency',
  'Price Low': 'currency',
  'Price High': 'currency',
  'Equipment Cost Low': 'currency',
  'Equipment Cost High': 'currency',
  'Trenching Cost Low': 'currency',
  'Trenching Cost High': 'currency',
  'Line Items JSON': 'longText',
  'Panel Tier': 'select',
  'Battery Units': 'number',
  'Site Prep': 'checkbox',
  'Slope %': 'number',
  'Slope Tier': 'select',
  'Slope Answer': 'select',
  Rocky: 'checkbox',
  'Battery Interest': 'checkbox',
  'Break Even Year': 'number',
  'Utility Inflation Pct': 'number',
  'Soil Class': 'text',
  'Est Annual Production kWh': 'number',
  'Curve Source': 'select',
  Azimuth: 'number',
  /** Which partner or page sent them. Unchanged; the UTM columns sit beside it. */
  Source: 'text',
  /**
   * The campaign, split into its five parts rather than concatenated.
   *
   * One column each so the owner can group by medium or by campaign in
   * Airtable without parsing a string, which is the whole reason for asking
   * for them separately.
   */
  'UTM Source': 'text',
  'UTM Medium': 'text',
  'UTM Campaign': 'text',
  'UTM Term': 'text',
  'UTM Content': 'text',
  /** They asked for their design by email so they could come back to it. */
  'Resume Requested': 'checkbox',
  /** When they said a call would suit them. Their answer, not a guess. */
  'Preferred Call Time': 'select',
  /**
   * What the quote email did after it left.
   *
   * Written by the Resend webhook, never by the funnel. "Filed but never
   * delivered" is a lead the owner should chase differently from one that
   * arrived and was ignored, and without this the two look identical.
   */
  'Email Status': 'select',
  'Email Opened At': 'date',
  /*
    Filled in by the owner after a site visit, never by the app.

    The whole point is to be able to ask how wrong the estimate was. A column
    the app could write would eventually be written by the app, and then it
    would be measuring itself.
  */
  'Actual Quote': 'currency',
  'Actual Trench Ft': 'number',
  'Actual Notes': 'longText',
  Status: 'select',
  'Map Screenshot': 'attachment',
} as const satisfies Record<string, FieldKind>;

export type LeadFieldName = keyof typeof LEAD_SCHEMA;

type ValueFor<K extends FieldKind> = K extends 'number' | 'currency'
  ? number
  : K extends 'checkbox'
    ? boolean
    : K extends 'attachment'
      ? Array<{ url: string }>
      : // A date is written as an ISO string, which is what Airtable accepts.
        string;

export type LeadFields = {
  [K in LeadFieldName]?: ValueFor<(typeof LEAD_SCHEMA)[K]>;
};

/**
 * Airtable field types that satisfy each kind.
 *
 * More than one is acceptable in several cases — a currency column and a plain
 * number column both hold a price, and the owner may have typed either.
 */
export const ACCEPTABLE_AIRTABLE_TYPES: Record<FieldKind, string[]> = {
  text: ['singleLineText', 'multilineText', 'singleSelect', 'richText'],
  longText: ['multilineText', 'richText', 'singleLineText'],
  email: ['email', 'singleLineText'],
  phone: ['phoneNumber', 'singleLineText'],
  number: ['number', 'percent', 'currency', 'rating', 'duration'],
  currency: ['currency', 'number'],
  checkbox: ['checkbox'],
  select: ['singleSelect', 'singleLineText', 'multilineText'],
  attachment: ['multipleAttachments'],
  // A plain text column holds an ISO string perfectly well, and the owner may
  // already have one; only the reporting cares, and it parses either.
  date: ['date', 'dateTime', 'createdTime', 'lastModifiedTime', 'singleLineText'],
};

export interface LiveField {
  name: string;
  type: string;
  /** Present on single-selects. Airtable gives each choice a stable id. */
  options?: { choices?: Array<{ id?: string; name: string; color?: string }> };
}

export interface SchemaDiff {
  missing: Array<{ name: string; kind: FieldKind; nearMiss: string[] }>;
  mistyped: Array<{ name: string; kind: FieldKind; actual: string; acceptable: string[] }>;
  /**
   * Selects that exist but cannot accept a value the app writes.
   *
   * A single-select rejects any option it has never heard of, so a Status
   * column without "Partial" fails every partial save with the same 422 a
   * missing column gives — and the column is right there in the UI, which is
   * why this was worth checking separately.
   */
  missingChoices: Array<{ name: string; missing: string[]; present: string[] }>;
  /** Columns the owner keeps that the app never writes. Not a problem. */
  unused: string[];
}

const squash = (name: string) => name.toLowerCase().replace(/\s+/g, '');

/**
 * Compare the live table against what the app writes.
 *
 * Pure, so the comparison is unit-tested rather than only exercised against a
 * live base that nobody can break on purpose.
 */
export function diffLeadSchema(live: LiveField[]): SchemaDiff {
  const byName = new Map(live.map((f) => [f.name, f]));
  const diff: SchemaDiff = { missing: [], mistyped: [], missingChoices: [], unused: [] };

  for (const [name, kind] of Object.entries(LEAD_SCHEMA) as Array<[LeadFieldName, FieldKind]>) {
    const field = byName.get(name);
    if (!field) {
      // A trailing space or "KW" for "kW" is the usual cause, and unmissable
      // once it is named.
      diff.missing.push({
        name,
        kind,
        nearMiss: live.filter((f) => squash(f.name) === squash(name)).map((f) => f.name),
      });
      continue;
    }
    const acceptable = ACCEPTABLE_AIRTABLE_TYPES[kind];
    if (!acceptable.includes(field.type)) {
      diff.mistyped.push({ name, kind, actual: field.type, acceptable });
      continue;
    }

    // Only a real single-select constrains its values. A select we declared
    // that the owner made a text column takes anything, and is reported above.
    const wanted = SELECT_CHOICES[name];
    if (kind === 'select' && field.type === 'singleSelect' && wanted?.length) {
      const present = (field.options?.choices ?? []).map((c) => c.name);
      const missing = wanted.filter((choice) => !present.includes(choice));
      if (missing.length) diff.missingChoices.push({ name, missing, present });
    }
  }

  diff.unused = live
    .map((f) => f.name)
    .filter((n) => !(n in LEAD_SCHEMA))
    .sort();

  return diff;
}

export function schemaMatches(diff: SchemaDiff): boolean {
  return (
    diff.missing.length === 0 && diff.mistyped.length === 0 && diff.missingChoices.length === 0
  );
}

/**
 * The choice list to PATCH onto an existing select: everything it already has,
 * unchanged and with its ids, plus the ones it is missing.
 *
 * Additive by construction. Existing choices are passed through by id so
 * Airtable keeps them exactly as they are — no rename, no removal, and no way
 * for this function to express either.
 */
export function additiveChoices(
  field: LiveField,
  wanted: string[]
): Array<{ id?: string; name: string }> {
  const present = field.options?.choices ?? [];
  const presentNames = present.map((c) => c.name);
  return [
    ...present.map((c) => (c.id ? { id: c.id, name: c.name } : { name: c.name })),
    ...wanted.filter((c) => !presentNames.includes(c)).map((name) => ({ name })),
  ];
}

/**
 * Choices for the single-select columns, matching exactly what the app writes.
 *
 * A select created without these accepts nothing, so every write 422s in a way
 * that looks like a missing field. Declared here so field creation and the
 * writer read the same list.
 */
export const SELECT_CHOICES: Partial<Record<LeadFieldName, string[]>> = {
  // Lowercase because that is what PanelTier is in the code and what the route
  // writes; Airtable select options are case-sensitive.
  'Panel Tier': ['standard', 'premium'],
  'Slope Tier': ['Flat', 'Rolling', 'Steep', 'Unknown'],
  'Slope Answer': ['Flat', 'Slight', 'Big'],
  // Matches SiteResponse.curveSource exactly; deliberately not renamed.
  'Curve Source': ['pvwatts', 'fallback'],
  Status: ['Partial', 'New', 'Contacted', 'Quoted', 'Won', 'Lost'],
  // The three the success screen and the quote email offer, and nothing else:
  // the value is decided by us, not typed by the customer.
  'Preferred Call Time': ['Morning', 'Afternoon', 'Evening'],
  /*
    Resend's own event names, minus the prefix.

    Deliberately not renamed to something prettier: when the owner is looking
    at a bounced lead and then at Resend's dashboard, the two should say the
    same word.
  */
  'Email Status': ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'],
};

/** Decimal places for the numeric columns. Money is whole dollars. */
const NUMBER_PRECISION: Partial<Record<LeadFieldName, number>> = {
  'System Size kW': 2,
  'Slope %': 1,
  'Utility Inflation Pct': 1,
  'Actual Trench Ft': 0,
  // Six places is about 4 inches: enough to find the array again.
  Latitude: 6,
  Longitude: 6,
};

export interface AirtableFieldSpec {
  name: string;
  type: string;
  options?: Record<string, unknown>;
}

/**
 * What to POST to the Meta API to create a missing field.
 *
 * Creation only. Nothing here can describe an edit or a delete, because the
 * owner's base is theirs: a script that could retype a column is a script that
 * could lose their data.
 */
export function createSpecFor(name: LeadFieldName): AirtableFieldSpec {
  const kind: FieldKind = LEAD_SCHEMA[name];
  const precision = NUMBER_PRECISION[name] ?? 0;

  switch (kind) {
    case 'text':
      return { name, type: 'singleLineText' };
    case 'longText':
      return { name, type: 'multilineText' };
    case 'email':
      return { name, type: 'email' };
    case 'phone':
      return { name, type: 'phoneNumber' };
    case 'number':
      return { name, type: 'number', options: { precision } };
    case 'currency':
      return { name, type: 'currency', options: { precision: 0, symbol: '$' } };
    case 'checkbox':
      return { name, type: 'checkbox', options: { icon: 'check', color: 'greenBright' } };
    case 'attachment':
      return { name, type: 'multipleAttachments' };
    case 'date':
      // Time included: "delivered at 09:14" and "delivered on Tuesday" are
      // different facts, and the second one cannot answer a question about
      // whether the email arrived before the customer gave up.
      return {
        name,
        type: 'dateTime',
        options: {
          timeZone: 'America/Chicago',
          dateFormat: { name: 'iso' },
          timeFormat: { name: '24hour' },
        },
      };
    case 'select': {
      const choices = SELECT_CHOICES[name];
      if (!choices?.length) {
        // Better to refuse than to create a select nothing can be written to.
        throw new Error(`No select choices declared for "${name}"`);
      }
      return { name, type: 'singleSelect', options: { choices: choices.map((c) => ({ name: c })) } };
    }
  }
}
