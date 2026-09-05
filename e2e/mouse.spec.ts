import { test, expect, type Page } from '@playwright/test';
import './gmTest';

/**
 * The map, driven with a mouse.
 *
 * Every other gesture test dispatches synthetic touch through CDP, so the
 * pointer path a desktop customer actually uses was never exercised. That gap
 * let a capture-phase `pointerdown` listener ship that stopped propagation
 * above the map container — which meant the component's own handler never ran
 * and mouse dragging was broken outright, with the whole suite green.
 *
 * Needs a real token for satellite tiles and WebGL, like the touch suite.
 */

test.describe.configure({ mode: 'serial' });

test.skip(
  process.env.E2E_REAL_MAPBOX !== '1',
  'No real NEXT_PUBLIC_MAPBOX_TOKEN found. Mouse gestures need a real map.'
);

/** Open country south-west of Fort Worth — a rural parcel with no buildings. */
const RURAL: [number, number] = [-97.9425, 32.1183];
const METER: [number, number] = [-97.9425, 32.1186];

const distance = (a: [number, number], b: [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

async function openDesignStep(page: Page) {
  await page.addInitScript(
    ([rural, meter]) => {
      if (window.localStorage.getItem('gmq:v3')) return;
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
            leadId: 'b7c1a2d3-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
            startedAt: Date.now() - 600_000,
          },
          version: 1,
        })
      );
    },
    [RURAL, METER] as const
  );

  await page.goto('/quote');
  await page.waitForFunction(() => typeof window.__gmTest !== 'undefined', null, {
    timeout: 15_000,
  });
  await page.waitForFunction(() => window.__gmTest.state().mapReady === true, null, {
    timeout: 15_000,
  });
  await page.waitForFunction(() => window.__gmTest.renderedHulls() > 0, null, { timeout: 15_000 });
}

/** Wait until the camera has genuinely stopped, as the touch suite does. */
async function waitForCameraStill(page: Page) {
  let last = '';
  let identical = 0;
  for (let i = 0; i < 60; i++) {
    const now = await page.evaluate(() => {
      const c = window.__gmTest.mapCenter();
      return `${c[0].toFixed(9)},${c[1].toFixed(9)},${window.__gmTest.isMoving() ? 1 : 0}`;
    });
    identical = now === last ? identical + 1 : 0;
    last = now;
    if (identical >= 2 && now.endsWith(',0')) return;
    await page.waitForTimeout(50);
  }
}

/** A point on the array that is not also on the compass grip. */
async function arrayGrabPoint(page: Page): Promise<[number, number] | null> {
  return page.evaluate(() => {
    const t = window.__gmTest;
    const r = t.canvasRect();
    const centre = t.state().arrayCenter;
    if (!centre) return null;
    const [cx, cy] = t.project(centre);
    for (const dy of [0, -2, 2, -4, 4]) {
      for (const dx of [0, -8, 8, -14, 14]) {
        const hit = t.hitAt([cx + dx, cy + dy]);
        if (hit.hull > 0 && hit.handle === 0) {
          return [r.left + cx + dx, r.top + cy + dy] as [number, number];
        }
      }
    }
    return null;
  });
}

test('a mouse drag moves the array and not the map', async ({ page }) => {
  await openDesignStep(page);
  await waitForCameraStill(page);

  const grab = await arrayGrabPoint(page);
  expect(grab, 'no grabbable point on the array').not.toBeNull();

  const before = await page.evaluate(() => ({
    array: window.__gmTest.state().arrayCenter!,
    map: window.__gmTest.mapCenter(),
  }));

  await page.mouse.move(grab![0], grab![1]);
  await page.mouse.down();

  const samples: Array<[number, number]> = [];
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(grab![0] + i * 9, grab![1] + i * 6);
    samples.push(await page.evaluate(() => window.__gmTest.mapCenter()));
  }

  const during = await page.evaluate(() => ({
    array: window.__gmTest.state().arrayCenter!,
    map: window.__gmTest.mapCenter(),
  }));
  await page.mouse.up();

  const degreesPerPixel = await page.evaluate(() => {
    const a = window.__gmTest.unproject([0, 0]);
    const b = window.__gmTest.unproject([1, 0]);
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  });

  // The array followed the mouse.
  expect(
    distance(during.array, before.array),
    'the array did not move under a mouse drag'
  ).toBeGreaterThan(0);

  // And the map did not, measured the same way as the touch suite: peak
  // across the gesture, not just where it ended up.
  const fingerTravelPx = Math.hypot(20 * 9, 20 * 6);
  const driftsPx = samples.map((m) => distance(m, before.map) / degreesPerPixel);
  const spreadPx = Math.max(...driftsPx) - Math.min(...driftsPx);

  expect(
    spreadPx / fingerTravelPx,
    `map moved ${spreadPx.toFixed(1)}px across the drag`
  ).toBeLessThan(0.05);
  expect(
    Math.max(...driftsPx),
    `map jumped ${Math.max(...driftsPx).toFixed(1)}px as the drag started`
  ).toBeLessThan(3);
});

test('a mouse drag on the compass turns the array', async ({ page }) => {
  await openDesignStep(page);
  await page.waitForFunction(() => window.__gmTest.renderedHandles() > 0, null, {
    timeout: 15_000,
  });
  // Zoomed in so the grip sits far enough from the centre for the bearing to
  // mean something.
  await page.evaluate(() => window.__gmTest.setZoom(18.8));
  await waitForCameraStill(page);

  const start = await page.evaluate(() => {
    const t = window.__gmTest;
    const r = t.canvasRect();
    const handle = t.handleLngLat();
    if (!handle) return null;
    const h = t.project(handle);
    return { point: [r.left + h[0], r.top + h[1]] as [number, number], azimuth: t.state().azimuth };
  });
  expect(start, 'the compass grip is not on screen').not.toBeNull();

  // Swing the grip a quarter turn around the array.
  const target = await page.evaluate(() => {
    const t = window.__gmTest;
    const r = t.canvasRect();
    const c = t.project(t.state().arrayCenter!);
    const h = t.project(t.handleLngLat()!);
    const radius = Math.hypot(h[0] - c[0], h[1] - c[1]);
    // Bearing 90 (due east): screen y grows downward.
    return [r.left + c[0] + radius, r.top + c[1]] as [number, number];
  });

  await page.mouse.move(start!.point[0], start!.point[1]);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      start!.point[0] + ((target[0] - start!.point[0]) * i) / 12,
      start!.point[1] + ((target[1] - start!.point[1]) * i) / 12
    );
  }
  await page.mouse.up();

  const after = await page.evaluate(() => window.__gmTest.state().azimuth);
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const turned = Math.abs(norm(after) - norm(start!.azimuth));

  expect(
    Math.min(turned, 360 - turned),
    'the compass did not turn under a mouse drag'
  ).toBeGreaterThan(30);
});
