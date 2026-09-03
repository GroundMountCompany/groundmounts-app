import { describe, it, expect } from 'vitest';
import { STEPS, UI, BANNED_WORDS, BANNED_OPENINGS } from './copy';

/** Every customer-facing string in the copy config, with a path for reporting. */
function allStrings(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];

  STEPS.forEach((step, i) => {
    out.push({ path: `STEPS[${i}].label`, text: step.label });
    out.push({ path: `STEPS[${i}].title`, text: step.title });
    out.push({ path: `STEPS[${i}].intro`, text: step.intro });
    out.push({ path: `STEPS[${i}].cta`, text: step.cta });
    out.push({ path: `STEPS[${i}].education.why`, text: step.education.why });
    out.push({ path: `STEPS[${i}].education.more`, text: step.education.more });
  });

  for (const [key, value] of Object.entries(UI)) {
    out.push({ path: `UI.${key}`, text: value });
  }

  return out;
}

describe('voice', () => {
  it('uses no banned marketing words', () => {
    const offences: string[] = [];

    for (const { path, text } of allStrings()) {
      const lower = text.toLowerCase();
      for (const word of BANNED_WORDS) {
        // Word boundary, so "fostering" is caught but "landscaper" would not be
        // a false positive on a different word.
        if (new RegExp(`\\b${word}\\b`).test(lower)) {
          offences.push(`${path}: "${word}"`);
        }
      }
    }

    expect(offences, `banned words found:\n${offences.join('\n')}`).toEqual([]);
  });

  it('allows "unlock" only as the final button label', () => {
    const uses = allStrings().filter(({ text }) => /\bunlock\b/i.test(text));
    expect(uses.map((u) => u.path)).toEqual(['STEPS[5].cta']);
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
