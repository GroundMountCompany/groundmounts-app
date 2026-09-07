import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@typescript-eslint/parser';

/**
 * Customer-visible text passed as a prop must come from copy.ts.
 *
 * jsx-no-literals cannot police this: turning on `ignoreProps: false` would
 * flag every Tailwind className, so the lint rule only covers JSX children.
 * These four props are the ones a person actually reads or hears, so they get
 * checked here instead.
 */

const ROOTS = ['src/app', 'src/components'];
const PROPS = ['placeholder', 'aria-label', 'alt', 'title'];

/** Files whose strings are not funnel copy. Mirrors the eslint config. */
const EXCLUDED = [
  // The quote email body; becomes brand-matched in Phase 7.
  'src/components/common/EmailTemplate.tsx',
  // Inline analytics scripts, which are code rather than copy.
  'src/app/layout.tsx',
];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Walk the JSX with the TypeScript ESLint parser rather than grepping.
 *
 * A regex over source lines missed anything split across lines, anything using
 * single quotes, and `alt={'literal'}` — an expression container holding a
 * literal, which reads exactly the same to a customer.
 */
function offendingAttributes(source: string, file: string): string[] {
  const ast = parse(source, { jsx: true, loc: true, range: false });
  const out: string[] = [];

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown> & { type?: string };

    if (record.type === 'JSXAttribute') {
      const name = record.name as { type?: string; name?: string } | undefined;
      const value = record.value as Record<string, unknown> | null | undefined;

      if (name?.type === 'JSXIdentifier' && PROPS.includes(name.name ?? '')) {
        // Either a bare string, or {'a bare string'} which is the same thing.
        const literal =
          value?.type === 'Literal'
            ? value
            : value?.type === 'JSXExpressionContainer' &&
                (value.expression as Record<string, unknown>)?.type === 'Literal'
              ? (value.expression as Record<string, unknown>)
              : null;

        const text = literal?.value;
        if (typeof text === 'string' && text.trim().length > 1) {
          const line = (record.loc as { start: { line: number } } | undefined)?.start.line;
          out.push(`${file}:${line}  ${name.name}="${text}"`);
        }
      }
    }

    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };

  visit(ast);
  return out;
}

describe('props that a person reads come from copy.ts', () => {
  it('has no hard-coded placeholder, aria-label, alt or title', () => {
    const offences: string[] = [];

    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const relative = file.split(path.sep).join('/');
        if (EXCLUDED.includes(relative)) continue;
        offences.push(...offendingAttributes(readFileSync(file, 'utf8'), relative));
      }
    }

    expect(
      offences,
      `hard-coded text props (move them to copy.ts):\n${offences.join('\n')}`
    ).toEqual([]);
  });

  it('catches the forms a regex would miss', () => {
    // Guards the walker: single quotes, an expression container, and an
    // attribute split over two lines all have to trip it.
    const sample = `
      const A = () => (
        <div>
          <input placeholder='typed by hand' />
          <img alt={'also by hand'} src="x" />
          <button
            aria-label="split across lines"
          />
        </div>
      );
    `;
    expect(offendingAttributes(sample, 'sample.tsx')).toHaveLength(3);
  });

  it('allows values that come from copy', () => {
    const sample = `
      const A = () => <input placeholder={UI.billPlaceholder} aria-label={UI.offsetSliderLabel} />;
    `;
    expect(offendingAttributes(sample, 'sample.tsx')).toEqual([]);
  });

  it('actually scans a meaningful number of files', () => {
    // Guards the walker itself: a broken glob would make the test above pass by
    // scanning nothing at all.
    const count = ROOTS.reduce((n, root) => n + tsxFiles(root).length, 0);
    expect(count).toBeGreaterThan(10);
  });
});
