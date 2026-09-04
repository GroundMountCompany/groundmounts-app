/**
 * Run the fixture bills through the real model and say how it did.
 *
 * Opt-in, and deliberately not part of `npm test`: it costs money, needs a key,
 * and depends on a model that can change underneath us. But extraction accuracy
 * is the one thing the mocked tests cannot tell you, and "it reads bills" is
 * otherwise an untested claim about the number the whole quote is sized from.
 *
 *   npm run eval:bills
 *
 * Compares against e2e/fixtures/bills/expected.ts — what a person reads off the
 * image, not what the model said last time.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { EXPECTED_BILLS, type ExpectedBill } from '../e2e/fixtures/bills/expected';
import { sniffUpload } from '../src/lib/fileSniff';
import {
  BILL_PROMPT,
  BILL_TOOL_NAME,
  BILL_TOOL_SCHEMA,
  sanitiseExtraction,
  type BillExtraction,
} from '../src/lib/billSchema';
import { ANTHROPIC, ANTHROPIC_URL } from '../src/config/apis';

const FIXTURES = 'e2e/fixtures/bills';

function loadEnvLocal(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

async function extract(file: string): Promise<BillExtraction> {
  const bytes = readFileSync(path.join(FIXTURES, file));
  const sniffed = sniffUpload(bytes);
  if (!sniffed.mediaType) throw new Error(`${file}: unreadable file type (${sniffed.kind})`);

  const source = { type: 'base64' as const, media_type: sniffed.mediaType, data: bytes.toString('base64') };
  const content =
    sniffed.kind === 'pdf'
      ? [{ type: 'document', source }, { type: 'text', text: BILL_PROMPT }]
      : [{ type: 'image', source }, { type: 'text', text: BILL_PROMPT }];

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY as string,
      'anthropic-version': ANTHROPIC.version,
    },
    body: JSON.stringify({
      model: ANTHROPIC.model,
      max_tokens: ANTHROPIC.maxTokens,
      tool_choice: { type: 'tool', name: BILL_TOOL_NAME },
      tools: [
        {
          name: BILL_TOOL_NAME,
          description: 'Record the usage and rate read from an electricity bill.',
          input_schema: BILL_TOOL_SCHEMA,
        },
      ],
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(ANTHROPIC.timeoutMs * 2),
  });

  if (!res.ok) throw new Error(`${file}: anthropic returned ${res.status}`);

  const json = await res.json();
  const call = json.content?.find(
    (block: { type: string; name?: string }) => block.type === 'tool_use' && block.name === BILL_TOOL_NAME
  );
  if (!call) throw new Error(`${file}: no tool call in response`);

  return sanitiseExtraction(call.input);
}

/** One bill's verdict, in the shape the report wants. */
function compare(expected: ExpectedBill, got: BillExtraction): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;

  if (got.months.length !== expected.expectedMonthCount) {
    ok = false;
    lines.push(
      `  months: got ${got.months.length}, expected ${expected.expectedMonthCount}`
    );
  } else {
    lines.push(`  months: ${got.months.length}`);
  }

  // Matched on kWh rather than on the label, because how a bill writes
  // "Aug 26" is not what we are judging.
  const expectedKwh = expected.months.map((m) => m.kwh);
  const gotKwh = got.months.map((m) => m.kwh);
  const missing = expectedKwh.filter((k) => !gotKwh.includes(k));
  const extra = gotKwh.filter((k) => !expectedKwh.includes(k));

  if (missing.length) {
    ok = false;
    lines.push(`  MISSING kWh: ${missing.join(', ')}`);
  }
  if (extra.length) {
    ok = false;
    lines.push(`  UNEXPECTED kWh: ${extra.join(', ')}`);
  }
  if (!missing.length && !extra.length) lines.push('  every kWh figure matches the page');

  const rate = got.ratePerKwh;
  if (expected.ratePerKwh === null) {
    lines.push(`  rate: ${rate ?? 'none'} (nothing expected)`);
  } else if (rate === null) {
    ok = false;
    lines.push(`  rate: MISSING, expected ~${expected.ratePerKwh}`);
  } else {
    // Half a cent of tolerance: rounding on the page, not a misread.
    const off = Math.abs(rate - expected.ratePerKwh);
    if (off > 0.005) {
      ok = false;
      lines.push(`  rate: ${rate}, expected ~${expected.ratePerKwh} (off by ${off.toFixed(4)})`);
    } else {
      lines.push(`  rate: ${rate} (expected ~${expected.ratePerKwh})`);
    }
  }

  lines.push(`  confidence: ${got.confidence}`);
  return { ok, lines };
}

async function main(): Promise<void> {
  loadEnvLocal();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Set ANTHROPIC_API_KEY to run this. It calls the real model against the fixture bills,\n' +
        'which costs money — that is why it is not part of npm test.'
    );
    process.exit(2);
  }

  console.log(`Model: ${ANTHROPIC.model}\n`);

  let failures = 0;
  for (const expected of EXPECTED_BILLS) {
    console.log(`${expected.file} — ${expected.description}`);
    try {
      const got = await extract(expected.file);
      const { ok, lines } = compare(expected, got);
      lines.forEach((line) => console.log(line));
      console.log(ok ? '  PASS\n' : '  FAIL\n');
      if (!ok) failures++;
    } catch (error) {
      console.log(`  ERROR ${error instanceof Error ? error.message : error}\n`);
      failures++;
    }
  }

  if (failures) {
    console.error(`${failures} of ${EXPECTED_BILLS.length} bills did not match what is printed.`);
    process.exit(1);
  }
  console.log(`All ${EXPECTED_BILLS.length} bills matched what is printed on them.`);
}

main().catch((error: unknown) => {
  console.error(`eval-bills failed to run: ${String(error)}`);
  process.exit(2);
});
