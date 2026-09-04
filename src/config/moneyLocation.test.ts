import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Money lives in pricing.ts and nowhere else.
 *
 * The owner edits one file. v1 had $45/ft in four places and $3.50/W in one
 * more, and they disagreed — this is the check that stops that coming back.
 */

const ROOTS = ['src', 'e2e'];

/** Files allowed to contain money. */
const ALLOWED = [
  'src/config/pricing.ts',
  // Asserts against the config, so it necessarily names figures.
  'src/lib/pricing.test.ts',
  // This file lists the patterns it searches for.
  'src/config/moneyLocation.test.ts',
];

/** The quote email still formats currency; Phase 7 rewrites it brand-matched. */
const KNOWN_EXCEPTIONS = ['src/components/common/EmailTemplate.tsx'];

const PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // $1,200 or $45.50 — a currency figure written into the source.
  { name: 'dollar figure', regex: /\$\s?\d[\d,]*(\.\d+)?/ },
  // 3.50 per watt, in any of the usual spellings.
  { name: 'dollars per watt', regex: /\b\d+(\.\d+)?\s*(\/|per\s*)w(att)?\b/i },
  // 45 per foot.
  { name: 'dollars per foot', regex: /\b\d+(\.\d+)?\s*(\/|per\s*)(ft|foot)\b/i },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

describe('money only lives in pricing.ts', () => {
  it('finds no dollar figures or rates elsewhere in the source', () => {
    const offences: string[] = [];

    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const relative = file.split(path.sep).join('/');
        if (ALLOWED.includes(relative) || KNOWN_EXCEPTIONS.includes(relative)) continue;

        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            // A comment explaining a number is not the number being used.
            const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
            for (const { name, regex } of PATTERNS) {
              const hit = regex.exec(code);
              if (hit) offences.push(`${relative}:${i + 1}  ${name}: ${hit[0].trim()}`);
            }
          });
      }
    }

    expect(
      offences,
      `money outside pricing.ts (move it there):\n${offences.join('\n')}`
    ).toEqual([]);
  });

  it('would catch money if it were reintroduced', () => {
    // Guards the patterns themselves.
    const samples = [
      'const cost = $45;',
      'const rate = 3.50 per watt;',
      'const trench = 45/ft;',
      'label: "$1,200"',
    ];
    for (const sample of samples) {
      expect(
        PATTERNS.some((p) => p.regex.test(sample)),
        `"${sample}" should have been caught`
      ).toBe(true);
    }
  });

  it('scans a meaningful number of files', () => {
    const count = ROOTS.reduce((n, root) => n + sourceFiles(root).length, 0);
    expect(count).toBeGreaterThan(30);
  });
});
