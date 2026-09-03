import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { minTimeOk } from '../src/lib/guard';

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
    currentStepIndex: number;
    mapScreenshot: string | null;
    setCurrentStepIndex: (v: number) => void;
    setTotalPanels: (v: number) => void;
    setArrayCenter: (v: Pt | null) => void;
    setElectricalMeterPosition: (v: Pt | null) => void;
  };
  mapCenter: () => Pt;
  mapZoom: () => number;
  project: (ll: Pt) => Pt;
  renderedHulls: () => number;
  renderedHandles: () => number;
  canvasRect: () => { left: number; top: number; width: number; height: number };
  hitAt: (pt: Pt) => { handle: number; hull: number };
  handleLngLat: () => Pt | null;
  bearingFromCenter: (ll: Pt) => number | null;
  unproject: (pt: Pt) => Pt;
  setZoom: (z: number) => void;
  viewArrayAt: (z: number) => void;
  isMoving: () => boolean;
  lastPointer: () => Pt | null;
  renderedGeom: () => {
    handlePx: Pt;
    hullPx: Pt[];
  } | null;
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
      // Seed once only: addInitScript runs on every navigation, and re-seeding
      // on reload would wipe exactly the persisted state a reload test checks.
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
            leadId: 'interaction-test-lead',
            // Ten minutes ago, so a ttc_ms measured from the funnel start is
            // impossible to confuse with one measured from the reload.
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

/** Low-level touch primitives so a second finger can join mid-gesture. */
async function touchStart(client: CDPSession, points: Array<{ x: number; y: number; id: number }>) {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
}
async function touchMove(client: CDPSession, points: Array<{ x: number; y: number; id: number }>) {
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
}
async function touchEnd(client: CDPSession) {
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

/**
 * Wait until the grip's projected position stops moving.
 *
 * Camera animations and late layout both shift it, and under parallel load a
 * fixed sleep is not enough — the drag then starts before the zoom has settled
 * and grabs empty map.
 */
async function waitForStableHandle(page: Page) {
  // The camera must have finished first, or every projection below is measured
  // against a moving target.
  await page.waitForFunction(() => !window.__gmTest.isMoving(), null, { timeout: 10_000 });
  let stable = 0;
  let last = '';
  for (let i = 0; i < 40 && stable < 4; i++) {
    const key = await page.evaluate(() => {
      const h = window.__gmTest.handleLngLat();
      if (!h) return 'none';
      const p = window.__gmTest.project(h);
      return `${Math.round(p[0])},${Math.round(p[1])}`;
    });
    stable = key === last && key !== 'none' ? stable + 1 : 0;
    last = key;
    await page.waitForTimeout(150);
  }
}

const distance = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Shortest distance from a point to a polygon's edges, in screen pixels. */
function distanceToPolygonEdge(point: Pt, ring: Pt[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / lenSq));
    best = Math.min(best, Math.hypot(point[0] - (ax + t * dx), point[1] - (ay + t * dy)));
  }
  return best;
}

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

  test('a second finger hands the gesture to the map mid-drag', async ({ page }) => {
    await openDesignStep(page);
    await waitForArray(page, 15_000);
    await bringMapIntoView(page);

    const client = await page.context().newCDPSession(page);

    // Finger one, alone, on a point confirmed to hit the array layer.
    const grab = await findArrayGrab(page);
    expect(grab, 'no point on the array reported a hit').not.toBeNull();
    const [gx, gy] = grab!;

    const start = await page.evaluate(() => ({
      array: window.__gmTest.state().arrayCenter!,
      zoom: window.__gmTest.mapZoom(),
    }));

    await touchStart(client, [{ x: gx, y: gy, id: 1 }]);
    for (let i = 1; i <= 6; i++) {
      await touchMove(client, [{ x: gx + i * 8, y: gy + i * 5, id: 1 }]);
    }

    // Let any queued pointermove flush before sampling, so the freeze assertion
    // measures the handler's behaviour and not event-loop timing.
    await page.waitForTimeout(150);
    const afterOneFinger = await page.evaluate(() => window.__gmTest.state().arrayCenter!);
    expect(
      distance(afterOneFinger, start.array),
      'array did not follow a single finger'
    ).toBeGreaterThan(0);

    // Finger two joins. From here the gesture belongs to the map: the array
    // must freeze and the zoom must change.
    const cx = gx + 48;
    const cy = gy + 30;
    await touchStart(client, [
      { x: cx, y: cy, id: 1 },
      { x: cx + 40, y: cy, id: 2 },
    ]);
    for (let i = 1; i <= 10; i++) {
      const spread = 40 + i * 11;
      await touchMove(client, [
        { x: cx - spread / 2, y: cy, id: 1 },
        { x: cx + spread / 2, y: cy, id: 2 },
      ]);
    }
    await touchEnd(client);

    const end = await page.evaluate(() => ({
      array: window.__gmTest.state().arrayCenter!,
      zoom: window.__gmTest.mapZoom(),
    }));

    expect(
      distance(end.array, afterOneFinger),
      'array kept moving after the second finger landed'
    ).toBeLessThan(1e-9);
    expect(
      Math.abs(end.zoom - start.zoom),
      'pinch did not reach the map'
    ).toBeGreaterThan(0.05);
  });

  test('compass tracks the finger and sets azimuth from its bearing', async ({ page }) => {
    await openDesignStep(page);
    await waitForArray(page, 15_000);
    await bringMapIntoView(page);
    await page.waitForFunction(() => window.__gmTest.renderedHandles() > 0, null, {
      timeout: 10_000,
    });

    // Zoom in so the grip's radius on screen is large enough for the angular
    // assertion to be meaningful: at the default zoom the handle is ~40px from
    // the array centre, where 2 degrees is barely one pixel of touch precision.
    await page.evaluate(() => window.__gmTest.setZoom(18.8));
    await waitForStableHandle(page);

    const client = await page.context().newCDPSession(page);

    /**
     * Drag the grip around the array to a target bearing, keeping the finger on
     * the circle the handle actually rides so "is the icon under the finger?"
     * is a fair question.
     */
    async function swingTo(targetBearing: number) {
      const geom = await page.evaluate((target) => {
        const t = window.__gmTest;
        const r = t.canvasRect();
        const centre = t.state().arrayCenter!;
        const handle = t.handleLngLat()!;
        const c = t.project(centre);
        const h = t.project(handle);
        const radius = Math.hypot(h[0] - c[0], h[1] - c[1]);
        // Screen y grows downward, so bearing 180 (south) is +y.
        const rad = (target * Math.PI) / 180;
        const to: [number, number] = [
          c[0] + radius * Math.sin(rad),
          c[1] - radius * Math.cos(rad),
        ];
        return {
          from: [r.left + h[0], r.top + h[1]] as Pt,
          to: [r.left + to[0], r.top + to[1]] as Pt,
          // Both ends must be inside the canvas or the touch never reaches the
          // grip and Mapbox pans the map instead.
          onScreen:
            h[0] > 0 && h[0] < r.width && h[1] > 0 && h[1] < r.height &&
            to[0] > 0 && to[0] < r.width && to[1] > 0 && to[1] < r.height,
          radius,
          // Canvas-space target, so the bearing check never depends on the
          // canvas rect and cannot be skewed by late layout shifts.
          toCanvas: to as Pt,
        };
      }, targetBearing);

      expect(
        geom.onScreen,
        `grip or target off-screen (radius ${Math.round(geom.radius)}px)`
      ).toBe(true);

      await touchStart(client, [{ x: geom.from[0], y: geom.from[1], id: 1 }]);
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await touchMove(client, [
          {
            x: geom.from[0] + (geom.to[0] - geom.from[0]) * t,
            y: geom.from[1] + (geom.to[1] - geom.from[1]) * t,
            id: 1,
          },
        ]);
      }
      await touchEnd(client);
      // The last pointermove can still be queued when touchEnd returns; read
      // azimuth only once it has stopped changing.
      let stable = 0;
      let last = Number.NaN;
      for (let i = 0; i < 25 && stable < 3; i++) {
        const az = await page.evaluate(() => window.__gmTest.state().azimuth);
        stable = az === last ? stable + 1 : 0;
        last = az;
        await page.waitForTimeout(80);
      }
      return geom;
    }

    // First swing: south to roughly due east.
    await swingTo(90);
    await expect
      .poll(async () => {
        const az = await page.evaluate(() => window.__gmTest.state().azimuth);
        const n = ((az % 360) + 360) % 360;
        return Math.min(Math.abs(n - 90), 360 - Math.abs(n - 90));
      })
      .toBeLessThan(10);
    await waitForStableHandle(page);

    // Re-grab at the new position and swing again. This is where a fixed
    // screen-space icon offset shows up: the grip drifts off the finger once
    // the azimuth leaves 180.
    const swing = await swingTo(135);
    await waitForStableHandle(page);

    const result = await page.evaluate((f) => {
      const t = window.__gmTest;
      const handle = t.handleLngLat()!;
      const hp = t.project(handle);
      // Drift compares the rendered icon against the point we dispatched.
      //
      // The bearing check uses the pointer position the handler ACTUALLY saw,
      // not the one we aimed at: CDP dispatch coordinates and the page's own
      // getBoundingClientRect differ by a fixed ~6px in this harness, which at
      // the grip's radius is ~2.5 degrees — larger than the tolerance, and
      // nothing to do with the app's maths. This asserts the property that
      // matters: azimuth equals the bearing to wherever the finger really was.
      const observed = t.lastPointer();
      return {
        drift: Math.hypot(hp[0] - f[0], hp[1] - f[1]),
        azimuth: t.state().azimuth,
        pointerBearing: observed ? t.bearingFromCenter(observed)! : Number.NaN,
      };
    }, swing.toCanvas);
    expect(result.drift, 'compass drifted away from the finger').toBeLessThan(8);

    const norm = (a: number) => ((a % 360) + 360) % 360;
    const delta = Math.abs(norm(result.azimuth) - norm(result.pointerBearing));
    expect(Math.min(delta, 360 - delta), 'azimuth does not match pointer bearing').toBeLessThan(2);
  });

  test('screenshot survives a reload on the contact form and reaches the lead', async ({
    page,
  }) => {
    // Mock the two endpoints so the flow completes without touching Airtable or
    // Resend, and so the outgoing lead payload can be inspected.
    let leadBody: { mapScreenshot?: string; ttc_ms?: number } | null = null;
    let emailBody: { ttc_ms?: number } | null = null;

    // Intercepted, not blindly succeeded: the request itself is the evidence.
    await page.route('**/api/sendEmail', (route) => {
      emailBody = JSON.parse(route.request().postData() ?? '{}');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true}',
      });
    });
    await page.route('**/api/leads', (route) => {
      leadBody = JSON.parse(route.request().postData() ?? '{}');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true,"airtableId":"recTest"}',
      });
    });

    await openDesignStep(page);
    await waitForArray(page, 15_000);
    await bringMapIntoView(page);
    await page.waitForTimeout(2500);

    const cta = page.getByTestId('mobile-continue');
    await expect(cta).toBeEnabled();
    await cta.click();

    await expect
      .poll(async () => page.evaluate(() => window.__gmTest.state().currentStepIndex), {
        timeout: 15_000,
      })
      .toBe(4);

    const captured = await page.evaluate(() => window.__gmTest.state().mapScreenshot);
    expect(captured).toBeTruthy();

    // The regression: a full-size PNG could not go in localStorage, so a refresh
    // on the contact form dropped the screenshot without saying anything.
    await page.reload();
    await page.waitForFunction(() => typeof window.__gmTest !== 'undefined', null, {
      timeout: 20_000,
    });

    await expect
      .poll(async () => page.evaluate(() => window.__gmTest.state().mapScreenshot?.length ?? 0), {
        timeout: 15_000,
      })
      .toBeGreaterThan(1000);

    // Step 3's intro animation runs before the form appears.
    const nameField = page.locator('#name');
    await expect(nameField).toBeVisible({ timeout: 20_000 });

    await nameField.fill('Bert Ortiz');
    await page.locator('#email').fill('bert@example.com');
    await page.locator('#phone').fill('(469) 555-0100');
    await page.getByRole('button', { name: /send|get|quote/i }).last().click();

    await expect.poll(() => (leadBody ? 'sent' : 'pending'), { timeout: 20_000 }).toBe('sent');

    const shot = leadBody!.mapScreenshot;
    expect(shot, 'lead payload has no screenshot after reload').toBeTruthy();
    expect(shot!.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(shot!.length).toBeGreaterThan(1000);

    // The funnel timer must survive the reload. If startedAt were not persisted,
    // ttc_ms would measure the seconds since the refresh and a prompt submit
    // would be rejected by the min-time guard on /api/sendEmail.
    expect(emailBody, '/api/sendEmail was never called').not.toBeNull();
    expect(
      emailBody!.ttc_ms,
      'ttc_ms restarted at the reload instead of the funnel start'
    ).toBeGreaterThan(300_000);
    expect(leadBody!.ttc_ms).toBeGreaterThan(300_000);

    // And it must still pass the guard the server actually applies.
    expect(minTimeOk(emailBody!.ttc_ms)).toBe(true);
  });

  test('grip keeps a usable screen distance from the array at any zoom', async ({
    page,
  }) => {
    await openDesignStep(page);
    await waitForArray(page, 15_000);
    await bringMapIntoView(page);

    // A fixed ground offset cannot work at both ends: 60 ft is ~5px at zoom 15
    // and ~290px at zoom 21. The offset is derived from a constant screen
    // radius instead, so the gap must hold across a 16x scale change.
    //
    // Measured from what Mapbox actually has rendered, not from a recomputed
    // expected position — otherwise this would still pass with the zoomend
    // wiring removed, because the recomputation would silently agree with
    // itself while the map showed something stale.
    for (const zoom of [16, 20]) {
      // Centre on the array as well: at zoom 20 it otherwise sits outside the
      // viewport and there is nothing rendered to read back.
      await page.evaluate((z) => window.__gmTest.viewArrayAt(z), zoom);
      await waitForStableHandle(page);

      const geom = await page.evaluate(() => window.__gmTest.renderedGeom());
      expect(geom, `no rendered array or grip at zoom ${zoom}`).not.toBeNull();

      const gapPx = distanceToPolygonEdge(geom!.handlePx, geom!.hullPx);

      expect(gapPx, `grip gap at zoom ${zoom}`).toBeGreaterThan(48);
      expect(gapPx, `grip gap at zoom ${zoom}`).toBeLessThan(96);
    }
  });

  test('the real Continue button stores a screenshot containing the design', async ({
    page,
  }) => {
    await openDesignStep(page);
    await waitForArray(page, 15_000);
    await bringMapIntoView(page);
    // Let satellite tiles finish so the buffer holds imagery, not just layers.
    await page.waitForTimeout(2500);

    // Go through the button a customer actually taps, not the dev capture hook.
    const cta = page.getByTestId('mobile-continue');
    await expect(cta).toBeEnabled();
    await cta.click();

    await expect
      .poll(async () => page.evaluate(() => window.__gmTest.state().currentStepIndex), {
        timeout: 15_000,
      })
      .toBe(4);

    const shot = await page.evaluate(() => window.__gmTest.state().mapScreenshot);
    expect(shot, 'Continue did not store a screenshot').toBeTruthy();
    // Stored as a downscaled JPEG so it fits in persisted state.
    expect(shot!.startsWith('data:image/jpeg;base64,')).toBe(true);

    const counts = await countDesignPixels(page, shot!);

    // Satellite imagery of open Texas farmland does not contain saturated
    // royal blue or this exact amber; these can only come from our own layers.
    expect(counts.arrayFill, 'no array-fill pixels in the screenshot').toBeGreaterThan(2000);
    expect(counts.trench, 'no trench-line pixels in the screenshot').toBeGreaterThan(150);
    expect(
      counts.labelHalo,
      'no trench distance label in the screenshot'
    ).toBeGreaterThan(80);
    expect(counts.total).toBeGreaterThan(100_000);

    // Control: same scene with the design cleared. If imagery alone could hit
    // those thresholds, this would too.
    // Step back to the meter step first: on the design step, Step2Form's sizing
    // effect immediately recomputes the panel count from the bill and re-places
    // the array, which would quietly defeat the control.
    await page.evaluate(() => window.__gmTest.state().setCurrentStepIndex(2));
    await page.waitForTimeout(300);
    // Clear the meter too: its marker is the same amber as the trench line, so
    // leaving it would let the control score trench pixels for the wrong reason.
    await page.evaluate(() => {
      window.__gmTest.state().setArrayCenter(null);
      window.__gmTest.state().setElectricalMeterPosition(null);
    });
    await page.waitForTimeout(1500);
    const blank = await page.evaluate(() => window.__gmTest.capture());
    const control = await countDesignPixels(page, blank.dataUrl!);

    expect(control.arrayFill, 'array pixels found with no array present').toBeLessThan(
      counts.arrayFill / 10
    );
    expect(control.trench, 'trench pixels found with no trench present').toBeLessThan(
      counts.trench / 10
    );
    expect(control.labelHalo, 'label pixels found with no label present').toBeLessThan(
      counts.labelHalo / 10
    );
  });
});

/**
 * Decode a PNG data URL and count pixels belonging to the design layers.
 *
 * Done in the page because a canvas is already available there; adding an image
 * decoding dependency to the repo for one assertion is not worth it.
 */
async function countDesignPixels(page: Page, dataUrl: string) {
  return page.evaluate(async (url) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('screenshot failed to decode'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let arrayFill = 0;
    let trench = 0;
    let labelHalo = 0;
    const total = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Trench distance label halo is #7e22ce, saturated violet: blue high,
      // green low, and red clearly above green. Checked first because it is
      // also blue-dominant and would otherwise be scored as array fill.
      if (r > 85 && r < 175 && g < 80 && b > 155 && b - g > 95 && r - g > 40) {
        labelHalo++;
        continue;
      }

      // Array fill is #1d4ed8 at 35% over imagery, plus a #bfdbfe outline: both
      // leave blue clearly dominant, which farmland never is.
      if (b > 90 && b - r > 45 && b - g > 30) arrayFill++;

      // Trench line is #f59e0b, opaque: strong red, mid green, almost no blue.
      if (r > 190 && g > 110 && g < 200 && b < 90 && r - b > 120) trench++;
    }

    return { arrayFill, trench, labelHalo, total };
  }, dataUrl);
}
