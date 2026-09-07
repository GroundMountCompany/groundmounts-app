import { describe, it, expect, vi } from 'vitest';
import { gradeFrom, tierFor, slopeFromTilequery } from './slope';
import { offsetMeters, type LngLat } from './geo/units';
import { looksRendered } from './screenshot';

const C: LngLat = [-97.3208, 32.7555];

describe('slope grade', () => {
  it('reports zero on flat ground', () => {
    const pts = [C, offsetMeters(C, 0, 30), offsetMeters(C, 30, 0)];
    expect(gradeFrom(pts, [200, 200, 200])).toBe(0);
  });

  it('computes rise over run as a percentage', () => {
    // 3 m rise over a 30 m run is 10%.
    const pts = [C, offsetMeters(C, 0, 30)];
    expect(gradeFrom(pts, [200, 203])).toBeCloseTo(10, 1);
  });

  it('takes the worst pair, not the average', () => {
    // A bank through one edge must not be flattened by three level samples.
    const pts = [C, offsetMeters(C, 0, 30), offsetMeters(C, 30, 0), offsetMeters(C, -30, 0)];
    const grade = gradeFrom(pts, [200, 200, 200, 206]);
    expect(grade).toBeGreaterThan(9);
  });

  it('returns null when there is not enough data to judge', () => {
    expect(gradeFrom([C], [200])).toBeNull();
    expect(gradeFrom([C, offsetMeters(C, 0, 30)], [Number.NaN, 203])).toBeNull();
  });
});

describe('slope tiers', () => {
  it('maps grades to the tiers the pricing table uses', () => {
    expect(tierFor(0)).toBe('Flat');
    expect(tierFor(4.9)).toBe('Flat');
    expect(tierFor(5)).toBe('Rolling');
    expect(tierFor(11.9)).toBe('Rolling');
    expect(tierFor(12)).toBe('Steep');
  });

  it('is Unknown when no source answered, so the UI can ask the user', () => {
    expect(tierFor(null)).toBe('Unknown');
  });
});

describe('blank-canvas detection', () => {
  const pixels = (fill: (i: number) => [number, number, number, number], n = 4000) => {
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const [r, g, b, a] = fill(i);
      out.set([r, g, b, a], i * 4);
    }
    return out;
  };

  it('rejects an all-black frame', () => {
    expect(looksRendered(pixels(() => [0, 0, 0, 255]))).toBe(false);
  });

  it('rejects a fully transparent frame', () => {
    expect(looksRendered(pixels(() => [0, 0, 0, 0]))).toBe(false);
  });

  it('rejects a flat solid colour', () => {
    expect(looksRendered(pixels(() => [120, 120, 120, 255]))).toBe(false);
  });

  it('accepts varied imagery', () => {
    expect(looksRendered(pixels((i) => [(i * 7) % 256, (i * 13) % 256, i % 256, 255]))).toBe(
      true
    );
  });
});

describe('the server-side slope sample', () => {
  const CENTER: LngLat = [-97.3208, 32.7555];

  /** One contour elevation per point, in the order the sampler asks. */
  function stubTilequery(elevations: Array<number | null>) {
    let call = 0;
    return vi.fn(async () => {
      const ele = elevations[call++];
      return {
        ok: true,
        json: async () => ({ features: ele === null ? [] : [{ properties: { ele } }] }),
      } as unknown as Response;
    });
  }

  it('reports Unknown when every sample lands in the same contour band', async () => {
    // Measured against the live API: at both a Fort Worth and a Hill Country
    // coordinate, all five points return one identical elevation. Calling that
    // "Flat" would be inventing a measurement — and Flat carries no site adder,
    // so the steepest parcels would be the ones quoted lowest.
    vi.stubGlobal('fetch', stubTilequery([360, 360, 360, 360, 360]));

    const result = await slopeFromTilequery(CENTER, 'pk.test');

    expect(result.source).toBe('unavailable');
    expect(result.percent).toBeNull();
    expect(result.tier).toBe('Unknown');
    vi.unstubAllGlobals();
  });

  it('reports a grade when the samples genuinely differ', async () => {
    vi.stubGlobal('fetch', stubTilequery([360, 370, 350, 360, 360]));

    const result = await slopeFromTilequery(CENTER, 'pk.test');

    expect(result.source).toBe('tilequery');
    expect(result.percent).toBeGreaterThan(0);
    expect(['Flat', 'Rolling', 'Steep']).toContain(result.tier);
    vi.unstubAllGlobals();
  });

  it('reports Unknown when a point has no contour at all', async () => {
    vi.stubGlobal('fetch', stubTilequery([360, null, 350, 360, 360]));

    const result = await slopeFromTilequery(CENTER, 'pk.test');
    expect(result.source).toBe('unavailable');
    vi.unstubAllGlobals();
  });

  it('needs a token, and says so rather than guessing', async () => {
    const result = await slopeFromTilequery(CENTER, undefined);
    expect(result.source).toBe('unavailable');
  });
});
