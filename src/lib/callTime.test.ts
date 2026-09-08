import { describe, it, expect } from 'vitest';
import { CALL_TIMES, isCallTime, parseCallTime } from './callTime';
import { SELECT_CHOICES } from './airtableSchema';

describe('when a call would suit them', () => {
  it('offers exactly the three the owner asked for', () => {
    expect(CALL_TIMES).toEqual(['Morning', 'Afternoon', 'Evening']);
  });

  it('matches the Airtable select, so a write cannot be rejected', () => {
    // The column is a single-select. A value the app sends that the column
    // does not have is a 422 on a lead that has already been filed.
    expect(SELECT_CHOICES['Preferred Call Time']).toEqual([...CALL_TIMES]);
  });

  it('reads an answer whatever case it comes back in', () => {
    // The email's version is a query parameter that has been through a mail
    // client and possibly somebody's clipboard.
    expect(parseCallTime('morning')).toBe('Morning');
    expect(parseCallTime('AFTERNOON')).toBe('Afternoon');
    expect(parseCallTime('  Evening  ')).toBe('Evening');
  });

  it('refuses anything that is not one of the three', () => {
    // Null rather than a default: writing "Morning" because the parameter was
    // gibberish would put a fact in the owner's base that nobody ever said.
    for (const bad of ['', 'noon', 'Mornings', 'Morning ', null, 42, undefined, {}]) {
      if (bad === 'Morning ') continue; // trimmed above, and legitimately valid
      expect(parseCallTime(bad), String(bad)).toBeNull();
    }
  });

  it('isCallTime is exact, with no trimming or case folding', () => {
    expect(isCallTime('Morning')).toBe(true);
    expect(isCallTime('morning')).toBe(false);
  });
});
