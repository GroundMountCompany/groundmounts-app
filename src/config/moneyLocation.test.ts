import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  PANELS,
  TRENCH,
  BATTERY,
  SITE,
  DEFAULTS,
  RANGE_SPREAD_PCT,
} from './pricing';

/**
 * Money lives in pricing.ts and nowhere else.
 *
 * The owner edits one file. v1 had $45/ft in four places and $3.50/W in one
 * more, and they disagreed — this is the check that stops that coming back.
 *
 * Two passes. The first looks for money written in an obviously monetary shape
 * ($1,200, 3.50/W, 45 per ft). The second is the one that matters: it takes the
 * actual numbers out of pricing.ts and looks for them written bare, because
 * that is how the drift really happened. `const systemSizeKw = totalPanels *
 * 435 / 1000` carries no dollar sign and no unit, and it sat in the email route
 * for a year quietly disagreeing with the screen.
 */

const ROOTS = ['src', 'e2e', 'scripts'];

/**
 * Files allowed to contain money — the config itself and the tests that assert
 * against it. There is no exception list beyond this: every component, route
 * and template is scanned, EmailTemplate.tsx included.
 */
const ALLOWED = [
  'src/config/pricing.ts',
  // Asserts against the config, so it necessarily names figures.
  'src/lib/pricing.test.ts',
  // This file lists the patterns and values it searches for.
  'src/config/moneyLocation.test.ts',
];

const PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // $1,200 or $45.50 — a currency figure written into the source.
  { name: 'dollar figure', regex: /\$\s?\d[\d,]*(\.\d+)?/ },
  // 3.50 per watt, in any of the usual spellings.
  { name: 'dollars per watt', regex: /\b\d+(\.\d+)?\s*(\/|per\s*)w(att)?\b/i },
  // 45 per foot.
  { name: 'dollars per foot', regex: /\b\d+(\.\d+)?\s*(\/|per\s*)(ft|foot)\b/i },
];

/**
 * Every number in pricing.ts that turns a design into a price: the rates, the
 * adders, the multipliers, and the two physical constants (panel wattage, the
 * fallback yield) that the rest of the app used to re-declare for itself.
 *
 * Read off the live config, so adding a conduit row or a panel tier extends the
 * search without anyone remembering to update this list.
 */
function costValues(): Map<number, string> {
  const found = new Map<number, string>();

  const add = (value: unknown, where: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    // Small whole numbers are unscannable: a bare 4 is an array index, a loop
    // bound and a panel row long before it is $4.00 a watt. The decorated
    // patterns above still catch "$4" and "4/W", which is how a price is
    // actually written when somebody hardcodes one.
    if (Number.isInteger(value) && Math.abs(value) < 10) return;
    if (!found.has(value)) found.set(value, where);
  };

  for (const [tier, panel] of Object.entries(PANELS)) {
    add(panel.watts, `PANELS.${tier}.watts`);
    add(panel.pricePerWatt, `PANELS.${tier}.pricePerWatt`);
  }

  add(TRENCH.basePerFt, 'TRENCH.basePerFt');
  TRENCH.conduitSchedule.forEach((row, i) =>
    add(row.multiplier, `TRENCH.conduitSchedule[${i}].multiplier`)
  );
  add(TRENCH.batteryMultiplierAdder, 'TRENCH.batteryMultiplierAdder');

  add(BATTERY.kwh, 'BATTERY.kwh');
  add(BATTERY.firstUnit, 'BATTERY.firstUnit');
  add(BATTERY.additionalUnit, 'BATTERY.additionalUnit');

  for (const [answer, pct] of Object.entries(SITE.slopeAnswers)) {
    add(pct, `SITE.slopeAnswers.${answer}`);
  }
  add(SITE.rockyAdderPct, 'SITE.rockyAdderPct');
  add(SITE.vegetationClearing.perAcre, 'SITE.vegetationClearing.perAcre');
  add(SITE.vegetationClearing.baseCharge, 'SITE.vegetationClearing.baseCharge');

  add(DEFAULTS.ratePerKwh, 'DEFAULTS.ratePerKwh');
  add(DEFAULTS.fallbackKwhPerKwYear, 'DEFAULTS.fallbackKwhPerKwYear');
  add(RANGE_SPREAD_PCT, 'RANGE_SPREAD_PCT');

  return found;
}

/**
 * Units that are not money.
 *
 * A line about an angle, a delay or a colour channel is allowed to contain a
 * number that happens to match a price. `for (const azimuth of [0, 45, 90...])`
 * is not $45/ft, and forcing it to be rewritten would make this check something
 * people work around rather than fix.
 */
const NON_MONEY_UNITS =
  /azimuth|bearing|angle|\bdeg\b|tilt|rotate|zoom|timeout|delay|\bms\b|duration|opacity|rgba?\b|channel|\bpx\b|latitude|longitude|inflation|degradation|horizon/i;

/**
 * Strip comments and string bodies so prose and copy are not scanned as code.
 *
 * Template literals are tracked across lines, because a Tailwind class list
 * broken over five lines is still a string, not arithmetic.
 */
function stripToCode(source: string): string[] {
  let inTemplate = false;
  return source.split('\n').map((line) => {
    let out = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

    if (inTemplate) {
      const end = out.indexOf('`');
      if (end === -1) return '';
      out = out.slice(end + 1);
      inTemplate = false;
    }

    out = out.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');

    // A backtick with no partner opens a multi-line template.
    let cursor = 0;
    for (;;) {
      const open = out.indexOf('`', cursor);
      if (open === -1) break;
      const close = out.indexOf('`', open + 1);
      if (close === -1) {
        out = out.slice(0, open);
        inTemplate = true;
        break;
      }
      out = out.slice(0, open + 1) + out.slice(close);
      cursor = open + 1;
    }
    return out;
  });
}

/** Bare numeric literals in a line of code, boundary-checked. */
function numericLiterals(code: string): number[] {
  const out: number[] = [];
  const re = /(?<![\w.$])\d+(?:\.\d+)?(?![\w.])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) out.push(Number(m[0]));
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

function scannedFiles(): string[] {
  const out: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const relative = file.split(path.sep).join('/');
      if (!ALLOWED.includes(relative)) out.push(relative);
    }
  }
  return out;
}

describe('money only lives in pricing.ts', () => {
  it('finds no dollar figures or rates elsewhere in the source', () => {
    const offences: string[] = [];

    for (const relative of scannedFiles()) {
      stripToCode(readFileSync(relative, 'utf8'))
        .forEach((code, i) => {
          for (const { name, regex } of PATTERNS) {
            const hit = regex.exec(code);
            if (hit) offences.push(`${relative}:${i + 1}  ${name}: ${hit[0].trim()}`);
          }
        });
    }

    expect(
      offences,
      `money outside pricing.ts (move it there):\n${offences.join('\n')}`
    ).toEqual([]);
  });

  it('finds no bare copy of a pricing.ts value anywhere else', () => {
    const values = costValues();
    const offences: string[] = [];

    for (const relative of scannedFiles()) {
      stripToCode(readFileSync(relative, 'utf8'))
        .forEach((code, i) => {
          if (NON_MONEY_UNITS.test(code)) return;
          for (const n of numericLiterals(code)) {
            const source = values.get(n);
            if (source) {
              offences.push(`${relative}:${i + 1}  ${n} — read it from ${source}`);
            }
          }
        });
    }

    expect(
      offences,
      `pricing.ts values re-declared elsewhere:\n${offences.join('\n')}`
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

  it('would catch a bare pricing value if it were reintroduced', () => {
    // The exact line this test was written for: the system size the email
    // route used to derive for itself from a hardcoded panel wattage.
    const values = costValues();
    const reintroduced = 'const systemSizeKw = (totalPanels * 435) / 1000;';
    const hits = numericLiterals(stripToCode(reintroduced)[0]).filter((n) => values.has(n));
    expect(hits).toContain(PANELS.standard.watts);

    // And it does not fire on a number that merely contains one.
    expect(
      numericLiterals(stripToCode('const x = 1435.5;')[0]).filter((n) => values.has(n))
    ).toEqual([]);

    // The unit escape hatch is narrow: it needs a non-money unit on the line.
    expect(NON_MONEY_UNITS.test(reintroduced)).toBe(false);
    expect(NON_MONEY_UNITS.test('for (const azimuth of [0, 45, 90])')).toBe(true);
  });

  it('scans a meaningful number of files', () => {
    expect(scannedFiles().length).toBeGreaterThan(30);
  });
});
