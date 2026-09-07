/**
 * Prove the e2e hooks are not in the built output.
 *
 * `__gmTest` hands out the whole store and the live map camera. It exists so
 * the interaction suite can see things the DOM does not expose, and it is
 * gated on NEXT_PUBLIC_E2E_HOOKS — a flag only playwright.config.ts sets — so
 * the comparison inlines to `false` and the branch is dropped from a real
 * build.
 *
 * That is the theory. This checks it, because the failure mode is silent: a
 * bundler change or a refactor that hoists the flag into a variable would ship
 * the hook to customers and nothing else would notice.
 *
 * Run it after `next build`. Exit 1 if any hook name survives.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '.next');
const HOOKS = ['__gmTest', '__gmLastPointer', 'data-upload-bytes'];

/*
  NEXT_PUBLIC_DEMO_PARAMS is deliberately not in that list.

  It looks like it belongs — ?demo=results opens a screen claiming a quote, and
  it must be inert in production. But the flag inlines to a literal either way,
  so the variable name is absent from the bundle whether it was set or not, and
  the demo seed itself survives both builds. A check that passes in both
  directions proves nothing and reads as assurance, which is worse than no
  check at all.

  What guards it instead: demoMode.test.ts asserts the gate returns null for
  every value that is not exactly "1", and the e2e runs ?demo=results against
  both a flagged and an unflagged server. See the RUNBOOK.
*/

async function* files(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(js|mjs)$/.test(entry.name)) yield full;
  }
}

const found = [];
for (const dir of ['static', 'server']) {
  for await (const file of files(path.join(ROOT, dir))) {
    const text = await readFile(file, 'utf8');
    for (const hook of HOOKS) {
      if (text.includes(hook)) found.push(`${hook} in ${path.relative(ROOT, file)}`);
    }
  }
}

if (found.length) {
  console.error('Test hooks reached the build:');
  for (const line of found) console.error(`  ${line}`);
  console.error('\nThey must be behind a literal `process.env.NEXT_PUBLIC_* === \'1\'`');
  console.error('comparison, and the variable declared in next.config.mjs, so the');
  console.error('bundler substitutes it and drops the branch.');
  process.exit(1);
}

console.log(`No test hooks in the build (checked ${HOOKS.join(', ')}).`);
