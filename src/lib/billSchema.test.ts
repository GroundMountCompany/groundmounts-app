import { describe, it, expect } from 'vitest';
import {
  BILL_TOOL_SCHEMA,
  BILL_PROMPT,
  schemaFieldNames,
  schemaRequestsPii,
  sanitiseExtraction,
} from './billSchema';

/**
 * The bill we ask for, and the bill we refuse to ask for.
 *
 * A utility bill carries the customer's name, service address and account
 * number on every page. The funnel needs none of it — it already knows the
 * address and is about to ask the name — so the contract is that there is
 * nowhere for any of it to go.
 */

describe('the extraction schema asks for usage and nothing else', () => {
  it('declares no field that could hold personal information', () => {
    expect(schemaRequestsPii()).toEqual([]);
  });

  it('declares only the fields the sizing maths uses', () => {
    expect(schemaFieldNames(BILL_TOOL_SCHEMA).sort()).toEqual(
      ['confidence', 'cost', 'kwh', 'month', 'months', 'ratePerKwh'].sort()
    );
  });

  it('closes every object, so a volunteered field is a schema violation', () => {
    // Without this the model could add `accountNumber` and still be valid.
    expect(BILL_TOOL_SCHEMA.additionalProperties).toBe(false);
    expect(BILL_TOOL_SCHEMA.properties.months.items.additionalProperties).toBe(false);
  });

  it('tells the model in words as well', () => {
    for (const forbidden of ['name', 'address', 'account number', 'meter number']) {
      expect(BILL_PROMPT.toLowerCase()).toContain(forbidden);
    }
    expect(BILL_PROMPT).toContain('Do not extract');
  });

  it('would catch a PII field if one were added', () => {
    // Guards the check itself.
    const tampered = {
      type: 'object',
      properties: { months: { type: 'array' }, accountNumber: { type: 'string' } },
    };
    expect(schemaFieldNames(tampered)).toContain('accountNumber');
  });
});

describe('sanitising what comes back', () => {
  it('keeps only the declared fields', () => {
    const result = sanitiseExtraction({
      months: [{ month: 'Jan 2026', kwh: 1450, cost: 203.5, meterNumber: 'M-1' }],
      ratePerKwh: 0.17,
      confidence: 'high',
      customerName: 'Bert Ortiz',
    });

    expect(JSON.stringify(result)).not.toContain('Bert Ortiz');
    expect(JSON.stringify(result)).not.toContain('M-1');
    expect(result.months[0]).toEqual({ month: 'Jan 2026', kwh: 1450, cost: 203.5 });
  });

  it('drops rows with no usable usage', () => {
    const result = sanitiseExtraction({
      months: [
        { month: 'Jan', kwh: 1450, cost: null },
        { month: 'Feb', kwh: 'lots', cost: null },
        { month: 'Mar', kwh: -5, cost: null },
      ],
      ratePerKwh: null,
      confidence: 'high',
    });

    expect(result.months.map((m) => m.month)).toEqual(['Jan']);
  });

  it('refuses an implausible rate rather than pricing against it', () => {
    expect(sanitiseExtraction({ months: [], ratePerKwh: 99, confidence: 'high' }).ratePerKwh)
      .toBeNull();
    expect(sanitiseExtraction({ months: [], ratePerKwh: 0.19, confidence: 'high' }).ratePerKwh)
      .toBe(0.19);
  });

  it('treats anything but an explicit "high" as low confidence', () => {
    expect(sanitiseExtraction({}).confidence).toBe('low');
    expect(sanitiseExtraction({ confidence: 'HIGH' }).confidence).toBe('low');
    expect(sanitiseExtraction({ confidence: 'high' }).confidence).toBe('high');
  });
});
