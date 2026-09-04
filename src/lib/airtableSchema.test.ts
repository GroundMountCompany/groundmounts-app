import { describe, it, expect } from 'vitest';
import {
  LEAD_SCHEMA,
  ACCEPTABLE_AIRTABLE_TYPES,
  SELECT_CHOICES,
  createSpecFor,
  diffLeadSchema,
  schemaMatches,
  additiveChoices,
  type LeadFieldName,
  type LiveField,
} from './airtableSchema';

/** A base that matches, built from the declaration itself. */
function healthyBase(): LiveField[] {
  return Object.entries(LEAD_SCHEMA).map(([name, kind]) => {
    const field: LiveField = { name, type: ACCEPTABLE_AIRTABLE_TYPES[kind][0] };
    const choices = SELECT_CHOICES[name as LeadFieldName];
    if (kind === 'select' && choices) {
      field.options = { choices: choices.map((c, i) => ({ id: `sel${i}`, name: c })) };
    }
    return field;
  });
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

describe('creating a field the base is missing', () => {
  it('describes every field in the schema well enough to create it', () => {
    for (const name of Object.keys(LEAD_SCHEMA) as LeadFieldName[]) {
      const spec = createSpecFor(name);
      expect(spec.name, name).toBe(name);
      // Whatever we create must be a type the checker then accepts, or the
      // script would create a field and immediately call it wrong.
      expect(ACCEPTABLE_AIRTABLE_TYPES[LEAD_SCHEMA[name]], name).toContain(spec.type);
    }
  });

  it('creates a base that passes its own check', () => {
    // Round trip: create every field from the spec, diff the result, no news.
    const created: LiveField[] = (Object.keys(LEAD_SCHEMA) as LeadFieldName[]).map((name) => {
      const spec = createSpecFor(name);
      // Modelled on what Airtable returns after a create: the choices we asked
      // for, each with an id. A select created without them would fail the
      // check below, which is the point of running the round trip.
      const choices = (spec.options?.choices ?? []) as Array<{ name: string }>;
      return {
        name: spec.name,
        type: spec.type,
        ...(choices.length
          ? { options: { choices: choices.map((c, i) => ({ id: `sel${i}`, name: c.name })) } }
          : {}),
      };
    });
    expect(schemaMatches(diffLeadSchema(created))).toBe(true);
  });

  it('gives the selects the exact options the app writes', () => {
    const panelTier = createSpecFor('Panel Tier');
    expect(panelTier.type).toBe('singleSelect');
    expect(panelTier.options?.choices).toEqual([{ name: 'standard' }, { name: 'premium' }]);

    const slopeTier = createSpecFor('Slope Tier');
    expect(slopeTier.options?.choices).toEqual([
      { name: 'Flat' },
      { name: 'Rolling' },
      { name: 'Steep' },
      { name: 'Unknown' },
    ]);

    // Every select must have choices; one without them accepts no writes.
    for (const [name, kind] of Object.entries(LEAD_SCHEMA)) {
      if (kind === 'select') {
        expect(SELECT_CHOICES[name as LeadFieldName], name).toBeTruthy();
      }
    }
  });

  it('asks for whole dollars on money and decimals where they matter', () => {
    expect(createSpecFor('Price Low')).toEqual({
      name: 'Price Low',
      type: 'currency',
      options: { precision: 0, symbol: '$' },
    });
    expect(createSpecFor('System Size kW').options).toEqual({ precision: 2 });
    expect(createSpecFor('Slope %').options).toEqual({ precision: 1 });
    expect(createSpecFor('Panels').options).toEqual({ precision: 0 });
  });

  it('gives a checkbox the options Airtable insists on', () => {
    const spec = createSpecFor('Site Prep');
    expect(spec.type).toBe('checkbox');
    expect(spec.options).toHaveProperty('icon');
    expect(spec.options).toHaveProperty('color');
  });
});

describe('single-select options', () => {
  it('reports a select that cannot accept a value the app writes', () => {
    // The real case: a Status column that predates partial saves.
    const base = healthyBase().map((f) =>
      f.name === 'Status'
        ? { ...f, options: { choices: [{ id: 'a', name: 'New' }, { id: 'b', name: 'Contacted' }] } }
        : f
    );
    const diff = diffLeadSchema(base);

    expect(schemaMatches(diff), 'a select missing options is not a match').toBe(false);
    expect(diff.missingChoices).toHaveLength(1);
    expect(diff.missingChoices[0].name).toBe('Status');
    expect(diff.missingChoices[0].missing).toContain('Partial');
    expect(diff.missingChoices[0].missing).not.toContain('New');
    expect(diff.missingChoices[0].present).toEqual(['New', 'Contacted']);
  });

  it('is satisfied by a select that has everything and more', () => {
    // The owner's own extra options are their business.
    const base = healthyBase().map((f) =>
      f.name === 'Slope Tier'
        ? {
            ...f,
            options: {
              choices: [
                ...(f.options?.choices ?? []),
                { id: 'extra', name: 'Terraced' },
              ],
            },
          }
        : f
    );
    expect(schemaMatches(diffLeadSchema(base))).toBe(true);
  });

  it('does not confuse a missing option with a missing column', () => {
    const diff = diffLeadSchema(
      healthyBase().map((f) => (f.name === 'Panel Tier' ? { ...f, options: { choices: [] } } : f))
    );
    expect(diff.missing).toEqual([]);
    expect(diff.missingChoices[0].missing).toEqual(['standard', 'premium']);
  });

  it('builds an additive choice list that keeps every existing option by id', () => {
    const live: LiveField = {
      name: 'Status',
      type: 'singleSelect',
      options: {
        choices: [
          { id: 'selNew', name: 'New', color: 'blueLight2' },
          { id: 'selWon', name: 'Won' },
        ],
      },
    };

    const patch = additiveChoices(live, ['Partial', 'New', 'Won']);

    // Existing choices come back first, by id, with their names unchanged —
    // which is what makes this a rename-proof, delete-proof update.
    expect(patch).toEqual([
      { id: 'selNew', name: 'New' },
      { id: 'selWon', name: 'Won' },
      { name: 'Partial' },
    ]);
    // Nothing the field already had can go missing from the patch.
    for (const existing of live.options!.choices!) {
      expect(patch.some((c) => c.id === existing.id && c.name === existing.name)).toBe(true);
    }
  });

  it('adds nothing when the select is already complete', () => {
    const live: LiveField = {
      name: 'Panel Tier',
      type: 'singleSelect',
      options: { choices: [{ id: 'a', name: 'standard' }, { id: 'b', name: 'premium' }] },
    };
    expect(additiveChoices(live, ['standard', 'premium'])).toEqual([
      { id: 'a', name: 'standard' },
      { id: 'b', name: 'premium' },
    ]);
  });
});
