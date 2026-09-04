/**
 * The bill extraction contract.
 *
 * Two rules, and the schema is how both are enforced rather than hoped for:
 *
 *  1. We ask for usage and rate. Nothing else. The customer's name, service
 *     address and account number are on every page of that bill and none of
 *     them are our business — the funnel already knows where they live and is
 *     about to ask their name itself.
 *  2. The model returns data, not prose. Forced tool use means a validated
 *     object or a failure, never a paragraph to parse.
 *
 * `additionalProperties: false` is what makes rule 1 real: a model that
 * volunteers an account number is answering a different question, and the
 * result is rejected rather than quietly stored.
 */

export interface BillMonth {
  /** As printed on the bill: "Jan 2026", "12/2025". Free text, not a date. */
  month: string;
  kwh: number;
  /** Dollars for that month, when the bill breaks it out. */
  cost: number | null;
}

export interface BillExtraction {
  months: BillMonth[];
  ratePerKwh: number | null;
  confidence: 'high' | 'low';
}

export const BILL_TOOL_NAME = 'record_usage';

export const BILL_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['months', 'ratePerKwh', 'confidence'],
  properties: {
    months: {
      type: 'array',
      description: 'One entry per billing period shown, most recent first.',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['month', 'kwh', 'cost'],
        properties: {
          month: {
            type: 'string',
            description: 'The billing period label exactly as printed, e.g. "Jan 2026".',
            maxLength: 32,
          },
          kwh: {
            type: 'number',
            description: 'Kilowatt-hours used in that period.',
            minimum: 0,
            maximum: 100000,
          },
          cost: {
            type: ['number', 'null'],
            description: 'Total dollars for that period, or null if not shown.',
            minimum: 0,
          },
        },
      },
    },
    ratePerKwh: {
      type: ['number', 'null'],
      description: 'Dollars per kWh if the bill states it, otherwise null.',
      minimum: 0,
      maximum: 2,
    },
    confidence: {
      type: 'string',
      enum: ['high', 'low'],
      description:
        'high only if the figures were read directly from the document. low if anything was inferred, the image was unclear, or this may not be an electricity bill.',
    },
  },
} as const;

/**
 * What the model is told to do.
 *
 * Exported so the instruction can be read in a test and quoted in a report
 * rather than being a string buried in a route nobody looks at.
 */
export const BILL_PROMPT = `You are reading a residential electricity bill for a solar sizing tool.

Extract only:
- each billing period's usage in kWh, labelled as the bill labels it
- the dollar cost of each period, if the bill shows it
- the price per kWh, if the bill states it

Do not extract, transcribe, infer or mention the account holder's name, the
service address, the account number, the meter number, or any phone number or
email. They are not needed and there is nowhere to put them.

Call the ${BILL_TOOL_NAME} tool exactly once with what you found. If the
document is not an electricity bill, or you cannot read the usage figures,
call it with an empty months array and confidence "low". Do not guess at
numbers that are not printed on the page.`;

/** Fields that must never appear in the tool schema, at any depth. */
const FORBIDDEN_FIELDS = [
  'name',
  'accountholder',
  'account',
  'accountnumber',
  'address',
  'serviceaddress',
  'meter',
  'meternumber',
  'phone',
  'email',
  'customer',
];

/** Every property name the schema declares, at any depth. */
export function schemaFieldNames(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== 'object') return found;
  const record = node as Record<string, unknown>;

  if (record.properties && typeof record.properties === 'object') {
    for (const [key, value] of Object.entries(record.properties as Record<string, unknown>)) {
      found.push(key);
      schemaFieldNames(value, found);
    }
  }
  if (record.items) schemaFieldNames(record.items, found);

  return found;
}

/** Whether the schema asks for anything it should not. Asserted by a test. */
export function schemaRequestsPii(): string[] {
  return schemaFieldNames(BILL_TOOL_SCHEMA).filter((field) =>
    FORBIDDEN_FIELDS.includes(field.toLowerCase().replace(/[^a-z]/g, ''))
  );
}

/**
 * Keep only what the schema allows.
 *
 * The model is instructed not to volunteer PII and the schema has nowhere to
 * put it, but neither is a guarantee about what comes back over a network. So
 * the response is rebuilt field by field from the shape we asked for, and
 * anything else is dropped before it can reach a log or a database.
 */
export function sanitiseExtraction(raw: unknown): BillExtraction {
  const input = (raw ?? {}) as Record<string, unknown>;
  const rawMonths = Array.isArray(input.months) ? input.months : [];

  const months: BillMonth[] = rawMonths
    .slice(0, 24)
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const kwh = Number(row.kwh);
      const cost = Number(row.cost);
      return {
        month: typeof row.month === 'string' ? row.month.slice(0, 32) : '',
        kwh: Number.isFinite(kwh) && kwh >= 0 ? Math.round(kwh) : Number.NaN,
        cost: Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 100) / 100 : null,
      };
    })
    .filter((row) => Number.isFinite(row.kwh) && row.kwh > 0);

  const rate = Number(input.ratePerKwh);

  return {
    months,
    ratePerKwh: Number.isFinite(rate) && rate > 0 && rate <= 2 ? rate : null,
    confidence: input.confidence === 'high' ? 'high' : 'low',
  };
}
