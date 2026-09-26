import { describe, it, expect } from 'vitest';
import { parseSnapshot } from './resumeSnapshot';
import { UTM_KEYS, fbcFromSearch, nextFbc, parseFbc, parseUtm, utmFromSearch } from './utm';
import { useQuoteStore } from '@/store/quoteStore';

const GOOD = {
  version: 1,
  step: 3,
  coordinates: { latitude: 32.7555, longitude: -97.3208 },
  electricalMeterPosition: [-97.3208, 32.7556],
  arrayCenter: [-97.3208, 32.7553],
  azimuth: 180,
  totalPanels: 31,
  panelAdjust: 0,
  sizingMode: 'auto',
  trenchFeet: 42,
  avgValue: 240,
  rateCentsPerKwh: 14,
  percentage: 100,
  billAnnualKwh: null,
  panelTier: 'standard',
  slopeAnswer: 'flat',
  rocky: false,
  needsClearing: false,
  batteryInterest: false,
  savedAt: 1_760_000_000_000,
};

/**
 * A snapshot is written by a browser, stored for a month, and handed back to a
 * different device. It is ours, and it is still not trusted on the way in.
 */
describe('a resume snapshot coming back off the wire', () => {
  it('restores a design it recognises', () => {
    const parsed = parseSnapshot(GOOD);
    expect(parsed?.step).toBe(3);
    expect(parsed?.totalPanels).toBe(31);
    expect(parsed?.arrayCenter).toEqual([-97.3208, 32.7553]);
  });

  it('refuses anything that is not a version it knows', () => {
    expect(parseSnapshot({ ...GOOD, version: 2 })).toBeNull();
    expect(parseSnapshot({ ...GOOD, version: undefined })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('a string')).toBeNull();
  });

  it('refuses coordinates that are not on Earth', () => {
    expect(parseSnapshot({ ...GOOD, coordinates: { latitude: 120, longitude: 0 } })).toBeNull();
    expect(parseSnapshot({ ...GOOD, coordinates: { latitude: 0, longitude: 900 } })).toBeNull();
  });

  it('refuses a step outside the funnel', () => {
    expect(parseSnapshot({ ...GOOD, step: 9 })).toBeNull();
    expect(parseSnapshot({ ...GOOD, step: -1 })).toBeNull();
  });

  it('drops a malformed point rather than restoring half of one', () => {
    // A one-element array used to become [lng, undefined], which reached the
    // map as NaN and left the array in the Gulf of Guinea.
    expect(parseSnapshot({ ...GOOD, arrayCenter: [-97.3] })?.arrayCenter).toBeNull();
    expect(parseSnapshot({ ...GOOD, arrayCenter: ['a', 'b'] })?.arrayCenter).toBeNull();
    expect(parseSnapshot({ ...GOOD, electricalMeterPosition: 'nope' })?.electricalMeterPosition)
      .toBeNull();
  });

  it('falls back rather than propagating NaN', () => {
    const parsed = parseSnapshot({ ...GOOD, azimuth: 'south', totalPanels: undefined });
    expect(parsed?.azimuth).toBe(0);
    expect(parsed?.totalPanels).toBe(0);
  });

  it('narrows the enumerations instead of trusting them', () => {
    const parsed = parseSnapshot({
      ...GOOD,
      sizingMode: 'whatever',
      panelTier: 'gold',
      slopeAnswer: 'vertical',
    });
    expect(parsed?.sizingMode).toBe('auto');
    expect(parsed?.panelTier).toBe('standard');
    expect(parsed?.slopeAnswer).toBe('flat');
  });

  it('carries no name, email, phone or address, however hard they are pushed in', () => {
    /*
      The guarantee this whole module exists for. A snapshot is a design and a
      parcel; it is stored for thirty days and reachable with a link, so
      nothing that identifies a person may survive the parse — including
      fields somebody adds to the store later and forgets about here.
    */
    const parsed = parseSnapshot({
      ...GOOD,
      name: 'Bert Ortiz',
      email: 'someone@example.com',
      phone: '(469) 555-0100',
      address: '123 Main St, Fort Worth, TX',
    }) as unknown as Record<string, unknown>;

    for (const leaked of ['name', 'email', 'phone', 'address']) {
      expect(parsed[leaked], `${leaked} survived the parse`).toBeUndefined();
    }
    expect(JSON.stringify(parsed)).not.toMatch(/Bert|example\.com|555-0100|Main St/);
  });
});

describe('campaign parameters', () => {
  it('reads the five it knows and ignores the rest', () => {
    const utm = utmFromSearch('?utm_source=meta&utm_medium=cpc&utm_campaign=tx&gclid=xyz');
    expect(utm).toEqual({ utm_source: 'meta', utm_medium: 'cpc', utm_campaign: 'tx' });
  });

  it('caps a value that would be rejected by a single-line field', () => {
    const long = 'a'.repeat(500);
    expect(utmFromSearch(`?utm_term=${long}`).utm_term).toHaveLength(200);
    expect(parseUtm({ utm_term: long }).utm_term).toHaveLength(200);
  });

  it('ignores blanks, whitespace and the wrong types', () => {
    expect(utmFromSearch('?utm_source=&utm_medium=%20%20')).toEqual({});
    expect(parseUtm({ utm_source: 42, utm_medium: null, utm_campaign: '  ' })).toEqual({});
    expect(parseUtm(null)).toEqual({});
  });

  it('covers every key the store and Airtable know about', () => {
    // So adding a sixth parameter cannot land with nowhere to put it.
    const all = Object.fromEntries(UTM_KEYS.map((k) => [k, k]));
    expect(parseUtm(all)).toEqual(all);
  });
});

describe('Meta click id', () => {
  const SEEN = 1_790_000_000_000;

  it('turns ?fbclid= into the fbc Meta matches on, stamped when first seen', () => {
    expect(fbcFromSearch('?utm_source=meta&fbclid=IwAR3x_Y-9z', SEEN)).toBe(
      `fb.1.${SEEN}.IwAR3x_Y-9z`
    );
  });

  it('ignores a missing, blank or odd-looking click id', () => {
    expect(fbcFromSearch('?utm_source=meta', SEEN)).toBeUndefined();
    expect(fbcFromSearch('?fbclid=', SEEN)).toBeUndefined();
    expect(fbcFromSearch('?fbclid=abc%3Cscript%3E', SEEN)).toBeUndefined();
    expect(fbcFromSearch(`?fbclid=${'a'.repeat(501)}`, SEEN)).toBeUndefined();
  });

  it('keeps the first timestamp on a reload, and takes a newer click', () => {
    const first = `fb.1.${SEEN}.clickA`;
    expect(nextFbc(null, first)).toBe(first);
    expect(nextFbc(first, `fb.1.${SEEN + 60_000}.clickA`)).toBe(first);
    expect(nextFbc(first, `fb.1.${SEEN + 60_000}.clickB`)).toBe(`fb.1.${SEEN + 60_000}.clickB`);
  });

  it('is kept in the store the same way', () => {
    useQuoteStore.setState({ fbc: null });
    useQuoteStore.getState().setFbc(`fb.1.${SEEN}.clickA`);
    useQuoteStore.getState().setFbc(`fb.1.${SEEN + 1}.clickA`);
    expect(useQuoteStore.getState().fbc).toBe(`fb.1.${SEEN}.clickA`);
  });

  it('accepts only a well-formed fbc off the request body', () => {
    expect(parseFbc(`fb.1.${SEEN}.clickA`)).toBe(`fb.1.${SEEN}.clickA`);
    expect(parseFbc('fb.1.123.clickA')).toBeUndefined();
    expect(parseFbc(`fb.1.${SEEN}.a b`)).toBeUndefined();
    expect(parseFbc(42)).toBeUndefined();
    expect(parseFbc(undefined)).toBeUndefined();
  });
});
