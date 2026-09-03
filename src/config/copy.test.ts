import { describe, it, expect } from 'vitest';
import * as copy from './copy';
import { STEPS, BANNED_WORDS, BANNED_OPENINGS } from './copy';

/**
 * Every string anywhere in the copy module, found by walking the whole export
 * tree rather than a hand-listed set of keys.
 *
 * The previous version enumerated STEPS and UI by hand, so a new export — or a
 * string hard-coded in a component — was simply never checked.
 */
function allStrings(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const skip = new Set(['BANNED_WORDS', 'BANNED_OPENINGS']);

  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      out.push({ path, text: value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };

  for (const [key, value] of Object.entries(copy)) {
    if (skip.has(key)) continue; // the lists of banned terms are not copy
    walk(value, key);
  }

  return out;
}

describe('voice', () => {
  it('uses no banned marketing words', () => {
    const offences: string[] = [];

    for (const { path, text } of allStrings()) {
      const lower = text.toLowerCase();
      for (const word of BANNED_WORDS) {
        // Prefix match, not a whole-word one: "fostering" and "solutions"
        // must trip "foster" and "solutions". A trailing \\b let inflections
        // through, which is exactly how marketing language creeps back.
        if (new RegExp(`\\b${word}`).test(lower)) {
          offences.push(`${path}: "${word}"`);
        }
      }
    }

    expect(offences, `banned words found:\n${offences.join('\n')}`).toEqual([]);
  });

  it('allows "unlock" only as the final button label', () => {
    const uses = allStrings().filter(({ text }) => /\bunlock/i.test(text));
    expect(uses.map((u) => u.path)).toEqual(['STEPS[5].cta']);
  });

  it('catches inflected forms of banned words', () => {
    // Guards the regex itself: a trailing word boundary would miss these.
    for (const sample of ['fostering growth', 'our solutions', 'leveraged']) {
      const hit = BANNED_WORDS.some((w) => new RegExp(`\\b${w}`).test(sample));
      expect(hit, `"${sample}" should trip the banned list`).toBe(true);
    }
  });

  it('never opens with filler', () => {
    const offences: string[] = [];
    for (const { path, text } of allStrings()) {
      const lower = text.toLowerCase().trimStart();
      for (const opening of BANNED_OPENINGS) {
        if (lower.startsWith(opening)) offences.push(`${path}: "${opening}"`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('keeps the default education line to one sentence', () => {
    // The whole point of "why" is that it fits on one line without a tap.
    for (const [i, step] of STEPS.entries()) {
      expect(step.education.why.length, `STEPS[${i}].education.why is long`).toBeLessThan(110);
    }
  });

  it('has copy for all six steps', () => {
    expect(STEPS).toHaveLength(6);
    for (const step of STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.cta.length).toBeGreaterThan(0);
      expect(step.education.more.length).toBeGreaterThan(step.education.why.length);
    }
  });

  it('avoids exclamation marks', () => {
    const shouty = allStrings().filter(({ text }) => text.includes('!'));
    expect(shouty.map((s) => s.path)).toEqual([]);
  });
});
