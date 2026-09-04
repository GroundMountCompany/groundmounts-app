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
}

export interface SchemaDiff {
  missing: Array<{ name: string; kind: FieldKind; nearMiss: string[] }>;
  mistyped: Array<{ name: string; kind: FieldKind; actual: string; acceptable: string[] }>;
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
  const diff: SchemaDiff = { missing: [], mistyped: [], unused: [] };

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
    }
  }

  diff.unused = live
    .map((f) => f.name)
    .filter((n) => !(n in LEAD_SCHEMA))
    .sort();

  return diff;
}

export function schemaMatches(diff: SchemaDiff): boolean {
  return diff.missing.length === 0 && diff.mistyped.length === 0;
}
