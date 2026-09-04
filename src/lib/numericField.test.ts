import { describe, it, expect } from 'vitest';
import { sanitizeNumeric, parseNumericField, parseIntegerField } from './numericField';
import { dollarsPerKwhFromCents, estimateMonthlyKWh, BILL_PER_KWH } from './solar';

/**
 * The reported bug: typing "0." into a number-backed rate field produced NaN,
 * which then travelled into the sizing maths without anything complaining.
 */
const PARTIAL_ENTRIES = ['', '.', '0', '0.', '00', 'abc', '-', ' '];

describe('numeric fields never produce NaN', () => {
  it('parses every partial entry to a number', () => {
    for (const raw of PARTIAL_ENTRIES) {
      expect(Number.isNaN(parseNumericField(raw)), `parseNumericField("${raw}")`).toBe(false);
      expect(Number.isNaN(parseIntegerField(raw)), `parseIntegerField("${raw}")`).toBe(false);
    }
  });

  it('uses the fallback rather than NaN', () => {
    expect(parseNumericField('', 14)).toBe(14);
    expect(parseNumericField('.', 14)).toBe(14);
    expect(parseIntegerField('0.', 14)).toBe(0); // "0." parses to 0, which is a number
  });

  it('keeps real values intact', () => {
    expect(parseNumericField('240')).toBe(240);
    expect(parseNumericField('0.14')).toBeCloseTo(0.14, 5);
    expect(parseIntegerField('14')).toBe(14);
  });

  it('survives the whole downstream chain', () => {
    // What actually broke: a partial entry reaching the sizing maths.
    for (const raw of PARTIAL_ENTRIES) {
      const cents = parseIntegerField(raw, 0);
      const rate = dollarsPerKwhFromCents(cents);
      const kwh = estimateMonthlyKWh(parseNumericField(raw, 0), rate);
      expect(Number.isNaN(rate), `rate from "${raw}"`).toBe(false);
      expect(Number.isNaN(kwh), `kwh from "${raw}"`).toBe(false);
    }
  });
});

describe('sanitizeNumeric', () => {
  it('drops anything that is not a digit', () => {
    expect(sanitizeNumeric('1a2b3')).toBe('123');
    expect(sanitizeNumeric('12.5')).toBe('125');
  });

  it('allows one decimal point when asked', () => {
    expect(sanitizeNumeric('12.5', true)).toBe('12.5');
    expect(sanitizeNumeric('1.2.3', true)).toBe('1.23');
    expect(sanitizeNumeric('.', true)).toBe('.');
  });
});

describe('cents to dollars', () => {
  it('converts whole cents', () => {
    expect(dollarsPerKwhFromCents(14)).toBeCloseTo(0.14, 6);
    expect(dollarsPerKwhFromCents(9)).toBeCloseTo(0.09, 6);
  });

  it('falls back for zero, negative and non-finite input', () => {
    expect(dollarsPerKwhFromCents(0)).toBe(BILL_PER_KWH);
    expect(dollarsPerKwhFromCents(-3)).toBe(BILL_PER_KWH);
    expect(dollarsPerKwhFromCents(Number.NaN)).toBe(BILL_PER_KWH);
  });
});

describe('the bill field commits whole dollars', () => {
  /** What Step2Power does on blur. */
  const commitBill = (raw: string) => Math.round(parseNumericField(raw, 0));

  it('rounds a decimal off the bill', () => {
    expect(commitBill('240.75')).toBe(241);
    expect(commitBill('240.4')).toBe(240);
    expect(commitBill('0.6')).toBe(1);
  });

  it('leaves a whole number alone', () => {
    expect(commitBill('240')).toBe(240);
  });

  it('never yields NaN from a partial entry', () => {
    for (const raw of PARTIAL_ENTRIES) {
      const value = commitBill(raw);
      expect(Number.isNaN(value), `commitBill("${raw}")`).toBe(false);
      expect(Number.isInteger(value), `commitBill("${raw}") is whole`).toBe(true);
    }
  });

  it('uses parseNumericField, not parseIntegerField', () => {
    // parseIntegerField would truncate to 240 and lose the rounding entirely.
    expect(commitBill('240.75')).not.toBe(parseIntegerField('240.75'));
  });
});
