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
  | 'attachment';

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
  'Soil Class': 'text',
  'Est Annual Production kWh': 'number',
  'Curve Source': 'select',
  Azimuth: 'number',
  Source: 'text',
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
      : string;

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
  // Matches SiteResponse.curveSource exactly; deliberately not renamed.
  'Curve Source': ['pvwatts', 'fallback'],
  Status: ['Partial', 'New', 'Contacted', 'Quoted', 'Won', 'Lost'],
};

/** Decimal places for the numeric columns. Money is whole dollars. */
const NUMBER_PRECISION: Partial<Record<LeadFieldName, number>> = {
  'System Size kW': 2,
  'Slope %': 1,
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
