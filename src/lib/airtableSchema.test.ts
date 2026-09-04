import { describe, it, expect } from 'vitest';
import {
  LEAD_SCHEMA,
  ACCEPTABLE_AIRTABLE_TYPES,
  diffLeadSchema,
  schemaMatches,
  type LiveField,
} from './airtableSchema';

/** A base that matches, built from the declaration itself. */
function healthyBase(): LiveField[] {
  return Object.entries(LEAD_SCHEMA).map(([name, kind]) => ({
    name,
    type: ACCEPTABLE_AIRTABLE_TYPES[kind][0],
  }));
}

describe('the Airtable schema check', () => {
  it('passes a base that has every field at the right type', () => {
    const diff = diffLeadSchema(healthyBase());
    expect(diff.missing).toEqual([]);
    expect(diff.mistyped).toEqual([]);
    expect(schemaMatches(diff)).toBe(true);
  });

  it('names a field the owner never created', () => {
    const base = healthyBase().filter((f) => f.name !== 'Price Low');
    const diff = diffLeadSchema(base);

    expect(schemaMatches(diff)).toBe(false);
    expect(diff.missing.map((m) => m.name)).toEqual(['Price Low']);
  });

  it('points at a near miss, which is what actually goes wrong', () => {
    // A trailing space is invisible in the Airtable UI and fails every write.
    const base = healthyBase().map((f) =>
      f.name === 'System Size kW' ? { ...f, name: 'System Size KW ' } : f
    );
    const diff = diffLeadSchema(base);

    const missing = diff.missing.find((m) => m.name === 'System Size kW');
    expect(missing?.nearMiss).toEqual(['System Size KW ']);
    // And the stray column is reported as unused rather than silently dropped.
    expect(diff.unused).toContain('System Size KW ');
  });

  it('catches a field created as the wrong type', () => {
    const base = healthyBase().map((f) =>
      f.name === 'Site Prep' ? { ...f, type: 'singleLineText' } : f
    );
    const diff = diffLeadSchema(base);

    expect(schemaMatches(diff)).toBe(false);
    expect(diff.mistyped).toEqual([
      {
        name: 'Site Prep',
        kind: 'checkbox',
        actual: 'singleLineText',
        acceptable: ACCEPTABLE_AIRTABLE_TYPES.checkbox,
      },
    ]);
  });

  it('accepts either of the types a price can reasonably be', () => {
    for (const type of ACCEPTABLE_AIRTABLE_TYPES.currency) {
      const base = healthyBase().map((f) => (f.name === 'Price High' ? { ...f, type } : f));
      expect(schemaMatches(diffLeadSchema(base)), type).toBe(true);
    }
  });

  it('does not fail on columns the owner keeps for themselves', () => {
    const base = [
      ...healthyBase(),
      { name: 'Owner Notes', type: 'multilineText' },
      { name: 'Follow-up Date', type: 'date' },
    ];
    const diff = diffLeadSchema(base);

    expect(schemaMatches(diff)).toBe(true);
    expect(diff.unused).toEqual(['Follow-up Date', 'Owner Notes']);
  });

  it('reports an empty base as entirely missing rather than fine', () => {
    const diff = diffLeadSchema([]);
    expect(schemaMatches(diff)).toBe(false);
    expect(diff.missing).toHaveLength(Object.keys(LEAD_SCHEMA).length);
  });
});
