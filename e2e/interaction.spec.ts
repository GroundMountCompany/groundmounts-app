import { test, expect, type Page, type CDPSession } from '@playwright/test';

/**
 * Real gesture proof, on a real WebGL map.
 *
 * The smoke suite runs on headless WebKit, which has no WebGL and no touch
 * digitiser, so drag, pinch and canvas capture were entirely unverified. This
 * runs on headless Chromium with SwiftShader and drives genuine touch events
 * through CDP, because that is the only way to prove the pointer arbitration
 * works rather than merely looks right.
 *
 * Requires a real Mapbox token: satellite tiles must load for the array to be
 * hit-testable. Skipped with an explicit message when none is available.
 */

test.skip(
  process.env.E2E_REAL_MAPBOX !== '1',
  'No real NEXT_PUBLIC_MAPBOX_TOKEN found (checked env and .env.local). ' +
    'Interaction tests need real satellite tiles and WebGL; run with a token to execute them.'
);

/** Open country south-west of Fort Worth — a rural parcel with no buildings. */
const RURAL: [number, number] = [-97.9425, 32.1183];
const METER: [number, number] = [-97.9425, 32.1186];

type Pt = [number, number];

interface GmTest {
  state: () => {
    arrayCenter: Pt | null;
    azimuth: number;
    trenchFeet: number;
    totalPanels: number;
  };
  mapCenter: () => Pt;
  mapZoom: () => number;
  project: (ll: Pt) => Pt;
  renderedHulls: () => number;
  renderedHandles: () => number;
  canvasRect: () => { left: number; top: number; width: number; height: number };
  hitAt: (pt: Pt) => { handle: number; hull: number };
  styleLoaded: () => boolean;
  capture: () => Promise<{ dataUrl: string | null; reason?: string }>;
}

declare global {
  interface Window {
    __gmTest: GmTest;
  }
}

/** Seed the funnel straight into the design step on a rural parcel. */
async function openDesignStep(page: Page) {
  await page.addInitScript(
    ([rural, meter]) => {
      window.localStorage.setItem(
        'gmq:v3',
        JSON.stringify({
          state: {
            currentStepIndex: 3,
            address: 'County Road 1004, Rural, TX',
            coordinates: { latitude: rural[1], longitude: rural[0] },
            electricalMeterPosition: meter,
            avgValue: 240,
            percentage: 100,
            totalPanels: 40,
            panelTier: 'standard',
            azimuth: 180,
            leadId: 'interaction-test-lead',
          },
          version: 1,
        })
      );
    },
    [RURAL, METER] as const
  );

  await page.goto('/quote');
  await page.waitForFunction(() => typeof window.__gmTest !== 'undefined', null, {
    timeout: 20_000,
  });
}

/** Wait until the array polygon is actually rendered on the map. */
async function waitForArray(page: Page, timeout: number) {
  await page.waitForFunction(
    () => window.__gmTest.state().arrayCenter !== null && window.__gmTest.renderedHulls() > 0,
    null,
    { timeout }
  );
}

async function bringMapIntoView(page: Page) {
  await page
    .locator('[data-testid="map-slot"]')
    .evaluate((el) =>
      el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
    );

  // Content above the map settles late — the slope readout flips from
  // "Checking..." to a value and shifts the canvas by ~9px. On an array only
  // ~8px deep at zoom 18 that is the whole target, so wait for the canvas rect
  // to hold still across several consecutive samples rather than a fixed sleep.
  let stable = 0;
  let last = Number.NaN;
  for (let i = 0; i < 40 && stable < 5; i++) {
    const top = await page.evaluate(() => window.__gmTest.canvasRect().top);
    stable = top === last ? stable + 1 : 0;
    last = top;
    await page.waitForTimeout(200);
  }
}

async function touchDrag(client: CDPSession, from: Pt, to: Pt, steps = 10) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from[0], y: from[1], id: 1 }],
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t, id: 1 },
      ],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Two fingers moving apart from a common centre. */
async function pinchOut(client: CDPSession, centre: Pt, steps = 10) {
  const [cx, cy] = centre;
  const from = 30;
  const to = 150;

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: cx - from, y: cy, id: 1 },
      { x: cx + from, y: cy, id: 2 },
    ],
  });
  for (let i = 1; i <= steps; i++) {
    const spread = from + ((to - from) * i) / steps;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: cx - spread, y: cy, id: 1 },
        { x: cx + spread, y: cy, id: 2 },
      ],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * A viewport point that hits only the array, with the canvas rect measured in
 * the same evaluate so the two cannot drift apart.
 *
 * An IronRidge table is ~13.6 ft deep — roughly 8px on screen at zoom 18 — and
 * content above the map settles late enough to shift it a few pixels, so this
 * is re-derived on every attempt rather than cached.
 */
async function findArrayGrab(page: Page): Promise<Pt | null> {
  return page.evaluate(() => {
    const t = window.__gmTest;
    const r = t.canvasRect();
    const ac = t.state().arrayCenter;
    if (!ac) return null;
    const [cx, cy] = t.project(ac);
    for (const dy of [0, -2, 2, -4, 4, -6, 6]) {
      for (const dx of [0, -8, 8, -14, 14]) {
        const hit = t.hitAt([cx + dx, cy + dy]);
        // Array-only: the handler tests the compass first, so a point where
        // both overlap would rotate instead of translate.
        if (hit.hull > 0 && hit.handle === 0) {
          return [r.left + cx + dx, r.top + cy + dy] as Pt;
        }
      }
    }
    return null;
  });
}

/** The compass grip, found by scanning down from the array centre. */
async function findHandleGrab(page: Page): Promise<Pt | null> {
  return page.evaluate(() => {
    const t = window.__gmTest;
    const r = t.canvasRect();
    const ac = t.state().arrayCenter;
    if (!ac) return null;
    const [cx, cy] = t.project(ac);
    for (let dy = 10; dy < 220; dy += 3) {
      if (t.hitAt([cx, cy + dy]).handle > 0) {
        return [r.left + cx, r.top + cy + dy] as Pt;
      }
    }
    return null;
  });
}

const distance = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test.describe('design step gestures', () => {
  test('array appears within 3s on a rural parcel', async ({ page }) => {
    await openDesignStep(page);

    // The rural hang: no buildings ever load, so a placement that waits for
    // them never resolves. The bounded wait must still put panels on the map.
    await waitForArray(page, 3000);

    const state = await page.evaluate(() => window.__gmTest.state());
    expect(state.arrayCenter).not.toBeNull();
    expect(state.trenchFeet).toBeGreaterThan(0);
  });

  test('single-finger drag moves the array and not the map', async ({ page }) => {
    await openDesignStep(page);
    await waitForArray(page, 15_000);
    await bringMapIntoView(page);

    const client = await page.context().newCDPSession(page);
    let moved = 0;
    let mapDrift = Number.NaN;

    // Re-derive the grab point each attempt: if late layout shifted the canvas
    // between measuring and dispatching, the touch misses and we try again.
    for (let attempt = 0; attempt < 4 && moved === 0; attempt++) {
      const grab = await findArrayGrab(page);
      if (!grab) {
        await page.waitForTimeout(300);
        continue;
      }
      const before = await page.evaluate(() => ({
        array: window.__gmTest.state().arrayCenter!,
        map: window.__gmTest.mapCenter(),
      }));

      await touchDrag(client, grab, [grab[0] + 70, grab[1] + 45]);

      const after = await page.evaluate(() => ({
        array: window.__gmTest.state().arrayCenter!,
        map: window.__gmTest.mapCenter(),
      }));
      moved = distance(after.array, before.array);
      mapDrift = distance(after.map, before.map);
    }

    expect(moved, 'array did not move under a single-finger drag').toBeGreaterThan(0);
    // The map must not pan underneath it.
    expect(mapDrift).toBeLessThan(1e-9);
  });

  test('two-finger pinch zooms the map and leaves the array alone', async ({ page }) => {
    await openDesignStep(page);
    await waitForArray(page, 15_000);
    await bringMapIntoView(page);

    const client = await page.context().newCDPSession(page);
    const before = await page.evaluate(() => ({
      array: window.__gmTest.state().arrayCenter!,
      zoom: window.__gmTest.mapZoom(),
    }));

    // Pinch centred on the array — the case most likely to be misclaimed as a
    // drag. Two fingers must always belong to the map.
    const centre = await page.evaluate(() => {
      const t = window.__gmTest;
      const r = t.canvasRect();
      const [cx, cy] = t.project(t.state().arrayCenter!);
      return [r.left + cx, r.top + cy] as Pt;
    });
    await pinchOut(client, centre);

    await expect
      .poll(async () =>
        page.evaluate((z) => Math.abs(window.__gmTest.mapZoom() - z), before.zoom)
      )
      .toBeGreaterThan(0.05);

    const after = await page.evaluate(() => ({
      array: window.__gmTest.state().arrayCenter!,
      zoom: window.__gmTest.mapZoom(),
    }));

    expect(Math.abs(after.zoom - before.zoom)).toBeGreaterThan(0.05);
    expect(distance(after.array, before.array)).toBeLessThan(1e-9);
  });

  test('dragging the compass handle changes azimuth', async ({ page }) => {
    await openDesignStep(page);
    await waitForArray(page, 15_000);
    await bringMapIntoView(page);
    await page.waitForFunction(() => window.__gmTest.renderedHandles() > 0, null, {
      timeout: 10_000,
    });

    const client = await page.context().newCDPSession(page);
    let delta = 0;

    for (let attempt = 0; attempt < 4 && delta <= 5; attempt++) {
      const grab = await findHandleGrab(page);
      if (!grab) {
        await page.waitForTimeout(300);
        continue;
      }
      const before = await page.evaluate(() => window.__gmTest.state().azimuth);
      // Swing the grip well to the east.
      await touchDrag(client, grab, [grab[0] + 140, grab[1] - 40]);
      delta = await page.evaluate(
        (a) => Math.abs(window.__gmTest.state().azimuth - a),
        before
      );
    }

    expect(delta, 'azimuth did not change when the compass was dragged').toBeGreaterThan(5);
  });

  test('captured map screenshot is a non-blank PNG', async ({ page }) => {
    await openDesignStep(page);
    await waitForArray(page, 15_000);
    // Let tiles finish so the buffer holds imagery, not just the array.
    await page.waitForTimeout(2500);

    const result = await page.evaluate(() => window.__gmTest.capture());

    expect(result.reason ?? 'ok').not.toBe('blank');
    expect(result.dataUrl).toBeTruthy();
    expect(result.dataUrl!.startsWith('data:image/png;base64,')).toBe(true);
    // A blank 390x844 PNG compresses to a few hundred bytes; imagery does not.
    expect(result.dataUrl!.length).toBeGreaterThan(50_000);
  });
});
