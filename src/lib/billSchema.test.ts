import { describe, it, expect } from 'vitest';
import {
  BILL_TOOL_SCHEMA,
  deriveRate,
  MAX_MONTHS,
  monthOrder,
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

  describe('what a kilowatt-hour actually costs', () => {
    const month = (kwh: number, cost: number | null) => ({ month: 'Aug 2026', kwh, cost });

    it('divides the electricity total by the kilowatt-hours', () => {
      // The Lone Star sample: $296.41 across 1,842 kWh is 16.1c, and the 12.9c
      // printed on the bill is only the retailer's half of it.
      expect(deriveRate([month(1842, 296.41)], 0.129)).toBe(0.1609);
    });

    it('does the same for the other two fixture bills', () => {
      // Brazos Valley co-op: $312.77 across 2,315 kWh against 10.8c printed.
      expect(deriveRate([month(2315, 312.77)], 0.108)).toBe(0.1351);
      // Granbury municipal: $195.62 of electricity across 1,560 kWh.
      expect(deriveRate([month(1560, 195.62)], 0.1145)).toBe(0.1254);
    });

    it('falls back to the printed rate when no cost was shown', () => {
      expect(deriveRate([month(1842, null)], 0.129)).toBe(0.129);
      expect(deriveRate([], 0.129)).toBe(0.129);
    });

    it('returns nothing when the bill gives neither', () => {
      // The caller keeps the configured Texas default.
      expect(deriveRate([month(1842, null)], null)).toBeNull();
    });

    it('ignores a division that could not be a tariff', () => {
      // A misread cost of $5,000 on 1,842 kWh is $2.71/kWh. Not a rate.
      expect(deriveRate([month(1842, 5000)], 0.129)).toBe(0.129);
      expect(deriveRate([month(1842, 1)], 0.129)).toBe(0.129);
    });

    it('uses the first period that has both numbers', () => {
      // A history table usually prices only the current period.
      expect(
        deriveRate([month(2315, null), { month: 'Jul', kwh: 2240, cost: 300 }], null)
      ).toBe(0.1339);
    });
  });

  it('treats anything but an explicit "high" as low confidence', () => {
    expect(sanitiseExtraction({}).confidence).toBe('low');
    expect(sanitiseExtraction({ confidence: 'HIGH' }).confidence).toBe('low');
    expect(sanitiseExtraction({ confidence: 'high' }).confidence).toBe('high');
  });
});

describe('twelve months, the most recent twelve', () => {
  const month = (label: string, kwh: number) => ({ month: label, kwh, cost: null });

  it('keeps the latest twelve and drops the oldest', () => {
    // Thirteen months of history, oldest last. Jan 2025 is the one that goes:
    // sizing against thirteen months would inflate the array by a twelfth, and
    // sizing against the wrong twelve would use a year the customer has left
    // behind.
    const thirteen = [
      month('Jan 2026', 1300),
      month('Dec 2025', 1200),
      month('Nov 2025', 1100),
      month('Oct 2025', 1000),
      month('Sep 2025', 1520),
      month('Aug 2025', 1900),
      month('Jul 2025', 2000),
      month('Jun 2025', 1800),
      month('May 2025', 1400),
      month('Apr 2025', 1000),
      month('Mar 2025', 900),
      month('Feb 2025', 950),
      month('Jan 2025', 1250),
    ];

    const kept = sanitiseExtraction({ months: thirteen, ratePerKwh: null, confidence: 'high' })
      .months.map((m) => m.month);

    expect(kept).toHaveLength(MAX_MONTHS);
    expect(kept, 'the oldest month should have been dropped').not.toContain('Jan 2025');
    expect(kept).toContain('Jan 2026');
    expect(kept).toContain('Feb 2025');
  });

  it('drops the oldest even when the bill lists them oldest first', () => {
    const ascending = [
      month('Jan 2025', 1250),
      month('Feb 2025', 950),
      month('Mar 2025', 900),
      month('Apr 2025', 1000),
      month('May 2025', 1400),
      month('Jun 2025', 1800),
      month('Jul 2025', 2000),
      month('Aug 2025', 1900),
      month('Sep 2025', 1520),
      month('Oct 2025', 1000),
      month('Nov 2025', 1100),
      month('Dec 2025', 1200),
      month('Jan 2026', 1300),
    ];

    const kept = sanitiseExtraction({ months: ascending, ratePerKwh: null, confidence: 'high' })
      .months.map((m) => m.month);

    expect(kept).toHaveLength(MAX_MONTHS);
    expect(kept).not.toContain('Jan 2025');
    expect(kept[0]).toBe('Jan 2026');
  });

  it('falls back to the given order when the labels cannot be dated', () => {
    // The model is told most-recent-first, so that order is the best guess
    // available — better than inventing a sequence from unreadable labels.
    const odd = Array.from({ length: 13 }, (_, i) => month(`Period ${i + 1}`, 1000 + i));
    const kept = sanitiseExtraction({ months: odd, ratePerKwh: null, confidence: 'high' }).months;

    expect(kept).toHaveLength(MAX_MONTHS);
    expect(kept[0].month).toBe('Period 1');
    expect(kept.map((m) => m.month)).not.toContain('Period 13');
  });

  it('reads the month labels bills actually use', () => {
    expect(monthOrder('Jan 2026')).toBeGreaterThan(monthOrder('Dec 2025')!);
    expect(monthOrder('January 2026')).toBe(monthOrder('Jan 2026'));
    expect(monthOrder('12/2025')).toBe(monthOrder('Dec 2025'));
    expect(monthOrder('2025-12')).toBe(monthOrder('Dec 2025'));
    expect(monthOrder('Jul 1 - Jul 31, 2026')).toBe(monthOrder('Jul 2026'));
    expect(monthOrder('Billing period 4')).toBeNull();
  });

  it('reads the two-digit labels a usage chart uses', () => {
    // Found by running a real bill through: a usage-history chart labels its
    // bars "Aug 25", "Jul 26". Unreadable labels fall back to the order the
    // model returned them in — and that model returned oldest first, so the
    // newest month was the one dropped.
    expect(monthOrder('Aug 25')).toBe(monthOrder('Aug 2025'));
    expect(monthOrder('Jul 26')).toBe(monthOrder('Jul 2026'));
    expect(monthOrder('Jul 26')).toBeGreaterThan(monthOrder('Aug 25')!);
  });

  it('keeps the newest twelve of a chart listed oldest first', () => {
    // The exact shape the live retail bill returned.
    const chart = [
      'Aug 25', 'Sep 25', 'Oct 25', 'Nov 25', 'Dec 25', 'Jan 26',
      'Feb 26', 'Mar 26', 'Apr 26', 'May 26', 'Jun 26', 'Jul 26', 'Aug 26',
    ].map((label, i) => month(label, 1000 + i * 10));

    const kept = sanitiseExtraction({ months: chart, ratePerKwh: null, confidence: 'high' })
      .months.map((m) => m.month);

    expect(kept).toHaveLength(MAX_MONTHS);
    expect(kept, 'the most recent month was dropped').toContain('Aug 26');
    expect(kept, 'the oldest month was kept').not.toContain('Aug 25');
  });
});

describe('a month the bill did not price', () => {
  it('stays null rather than becoming a free month', () => {
    // Number(null) is 0, and a zero here would show the customer a month that
    // cost them nothing.
    const result = sanitiseExtraction({
      months: [
        { month: 'Jan 2026', kwh: 1450, cost: null },
        { month: 'Dec 2025', kwh: 1310 },
        { month: 'Nov 2025', kwh: 1200, cost: 0 },
        { month: 'Oct 2025', kwh: 1100, cost: 188.2 },
      ],
      ratePerKwh: null,
      confidence: 'high',
    });

    expect(result.months.map((m) => m.cost)).toEqual([null, null, 0, 188.2]);
  });
});
