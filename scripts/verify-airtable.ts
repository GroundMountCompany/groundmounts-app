/**
 * Check the live Airtable base against what the app writes.
 *
 * A misspelled or retyped column does not fail loudly: Airtable returns 422
 * and the lead is gone. The owner maintains this base by hand, so the schema
 * drifts. Run this before a deploy.
 *
 *   npm run verify:airtable
 *   npm run verify:airtable -- --create-missing
 *
 * With --create-missing it also creates the columns the app needs and the base
 * does not have, with the names, types and select options declared in
 * airtableSchema.ts. It only ever POSTs new fields. Nothing in this script can
 * edit or delete an existing column: a field that is present but the wrong type
 * is reported for the owner to decide about, never retyped, because the data in
 * it is theirs and a conversion can lose it.
 *
 * Exit codes: 0 the base matches, 1 the base does not, 2 it could not be
 * checked (missing key, network, no such table) — which is not the same thing
 * and must not be reported as a pass.
 */

import { readFileSync } from 'node:fs';
import {
  LEAD_SCHEMA,
  createSpecFor,
  diffLeadSchema,
  schemaMatches,
  type LeadFieldName,
} from '../src/lib/airtableSchema';

const TABLE_NAME = 'Leads';

interface MetaField {
  id: string;
  name: string;
  type: string;
}

interface MetaTable {
  id: string;
  name: string;
  fields: MetaField[];
}

/** Load .env.local by hand: this runs outside Next, which is what loads it. */
function loadEnvLocal(): void {
  for (const file of ['.env.local', '.env']) {
    let contents: string;
    try {
      contents = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of contents.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

function fail(message: string, code: 1 | 2): never {
  console.error(message);
  process.exit(code);
}

/** Fetch the Leads table's live schema. */
async function fetchTable(apiKey: string, baseId: string): Promise<MetaTable> {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch((error: unknown) => {
    fail(`Cannot reach the Airtable Meta API: ${String(error)}`, 2);
  });

  if (!res.ok) {
    const body = await res.text();
    fail(
      `Airtable Meta API returned ${res.status}. ${body.slice(0, 300)}\n` +
        'A 403 usually means the token is missing the schema.bases:read scope.',
      2
    );
  }

  const tables: MetaTable[] = (await res.json()).tables ?? [];
  const table = tables.find((t) => t.name === TABLE_NAME);
  if (!table) {
    fail(
      `No table named "${TABLE_NAME}" in base ${baseId}. Found: ${
        tables.map((t) => t.name).join(', ') || '(none)'
      }`,
      2
    );
  }
  return table;
}

/**
 * Create one missing column.
 *
 * POST only. There is deliberately no code path in this file that PATCHes or
 * DELETEs a field: the owner's columns and the data in them are theirs.
 */
async function createField(
  apiKey: string,
  baseId: string,
  tableId: string,
  name: LeadFieldName
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let spec;
  try {
    spec = createSpecFor(name);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(spec),
      }
    );
    if (!res.ok) {
      return { ok: false, reason: `${res.status} ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const createMissing = process.argv.includes('--create-missing');

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    fail(
      'Cannot check the schema: AIRTABLE_API_KEY and AIRTABLE_BASE_ID must both be set.\n' +
        'The token needs the schema.bases:read scope.',
      2
    );
  }

  let table = await fetchTable(apiKey, baseId);
  let diff = diffLeadSchema(table.fields);

  if (createMissing && diff.missing.length) {
    console.log(`Creating ${diff.missing.length} missing field(s) in "${TABLE_NAME}"...`);
    const failures: string[] = [];

    for (const { name, kind } of diff.missing) {
      const result = await createField(apiKey, baseId, table.id, name as LeadFieldName);
      if (result.ok) {
        console.log(`  created  ${name} (${kind})`);
      } else {
        console.error(`  FAILED   ${name} (${kind}) - ${result.reason}`);
        failures.push(name);
      }
    }

    // Re-read the live schema rather than assuming the writes landed.
    table = await fetchTable(apiKey, baseId);
    diff = diffLeadSchema(table.fields);

    if (failures.length) {
      console.error(`\n${failures.length} field(s) could not be created: ${failures.join(', ')}`);
    }
  } else if (createMissing) {
    console.log('Nothing to create: every field the app writes already exists.');
  }

  if (diff.mistyped.length) {
    // Never touched, with or without --create-missing.
    console.log(
      `Existing columns with an unexpected type are left exactly as they are (${diff.mistyped.length}).`
    );
  }

  if (diff.unused.length) {
    // Not a failure: the owner keeps their own columns, formulas and notes.
    console.log(
      `Columns the app never writes (fine, listed for context): ${diff.unused.join(', ')}`
    );
  }

  if (schemaMatches(diff)) {
    console.log(
      `Airtable "${TABLE_NAME}" matches: all ${Object.keys(LEAD_SCHEMA).length} fields present and the right type.`
    );
    return;
  }

  const parts = [`Airtable "${TABLE_NAME}" does not match what the app writes.`];
  if (diff.missing.length) {
    parts.push(
      `\nMissing fields (${diff.missing.length}):\n` +
        diff.missing
          .map(
            (m) =>
              `  ${m.name} (${m.kind})` +
              (m.nearMiss.length ? ` — did you mean "${m.nearMiss.join('", "')}"?` : '')
          )
          .join('\n')
    );
  }
  if (diff.mistyped.length) {
    parts.push(
      `\nWrong type (${diff.mistyped.length}):\n` +
        diff.mistyped
          .map((m) => `  ${m.name} is ${m.actual}, expected one of: ${m.acceptable.join(', ')}`)
          .join('\n')
    );
  }
  parts.push('\nEvery lead write will 422 until these are fixed.');
  fail(parts.join('\n'), 1);
}

main().catch((error: unknown) => {
  fail(`Schema check failed to run: ${String(error)}`, 2);
});
