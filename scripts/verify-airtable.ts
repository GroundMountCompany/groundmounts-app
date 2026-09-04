/**
 * Check the live Airtable base against what the app writes.
 *
 * A misspelled or retyped column does not fail loudly: Airtable returns 422
 * and the lead is gone. The owner maintains this base by hand, so the schema
 * drifts. Run this before a deploy.
 *
 *   npm run verify:airtable
 *
 * Exit codes: 0 the base matches, 1 the base does not, 2 it could not be
 * checked (missing key, network, no such table) — which is not the same thing
 * and must not be reported as a pass.
 */

import { readFileSync } from 'node:fs';
import { LEAD_SCHEMA, diffLeadSchema, schemaMatches } from '../src/lib/airtableSchema';

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

async function main(): Promise<void> {
  loadEnvLocal();

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    fail(
      'Cannot check the schema: AIRTABLE_API_KEY and AIRTABLE_BASE_ID must both be set.\n' +
        'The token needs the schema.bases:read scope.',
      2
    );
  }

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

  const diff = diffLeadSchema(table.fields);

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
