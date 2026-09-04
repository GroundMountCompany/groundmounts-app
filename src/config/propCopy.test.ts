import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

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

describe('props that a person reads come from copy.ts', () => {
  it('has no hard-coded placeholder, aria-label, alt or title', () => {
    const offences: string[] = [];

    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const relative = file.split(path.sep).join('/');
        if (EXCLUDED.includes(relative)) continue;

        const source = readFileSync(file, 'utf8');
        source.split('\n').forEach((line, i) => {
          for (const prop of PROPS) {
            // Matches prop="literal" but not prop={expression}. A single
            // character (a decorative icon's alt, say) is not copy.
            const match = new RegExp(`${prop}="([^"]{2,})"`).exec(line);
            if (match) offences.push(`${relative}:${i + 1}  ${prop}="${match[1]}"`);
          }
        });
      }
    }

    expect(
      offences,
      `hard-coded text props (move them to copy.ts):\n${offences.join('\n')}`
    ).toEqual([]);
  });

  it('actually scans a meaningful number of files', () => {
    // Guards the walker itself: a broken glob would make the test above pass by
    // scanning nothing at all.
    const count = ROOTS.reduce((n, root) => n + tsxFiles(root).length, 0);
    expect(count).toBeGreaterThan(10);
  });
});
