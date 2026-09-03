import { test, expect, type Page } from '@playwright/test';

/**
 * The Phase 4 shell: a full-bleed map that the page never scrolls under, a
 * bottom sheet that owns its own gesture, and a back button that steps back
 * through the funnel instead of leaving the page.
 *
 * These run on the mocked-geocode projects, so no Mapbox token is needed.
 */

const SUGGESTION = {
  id: 'address.test1',
  place_name: '123 Main St, Fort Worth, Texas 76131, United States',
  center: [-97.3208, 32.7555] as [number, number],
};

async function mockGeocoding(page: Page) {
  await page.route('**/api.mapbox.com/geocoding/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [
          { id: SUGGESTION.id, place_name: SUGGESTION.place_name, center: SUGGESTION.center },
        ],
      }),
    })
  );
}

async function waitForHydration(page: Page) {
  await page.waitForSelector('[data-testid="funnel"][data-hydrated="true"]', { timeout: 20_000 });
}

async function openFunnel(page: Page) {
  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);
}

async function pickAddress(page: Page) {
  await page.locator('#address').fill('123 Main St');
  const suggestion = page.getByRole('button', { name: SUGGESTION.place_name });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
}

const scrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);

test('the page never scrolls under the map', async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith('mobile'),
    'the bottom sheet is the phone layout'
  );
  await openFunnel(page);

  // The v1 shell scrolled the map off screen and made customers hunt for the
  // button. The map is the viewport now; only the sheet's content moves.
  expect(await scrollTop(page)).toBe(0);

  await pickAddress(page);
  expect(await scrollTop(page)).toBe(0);

  // Walk forward through the funnel, checking after every move.
  await page.getByTestId('primary-cta').click();
  await page.getByTestId('avg-bill').fill('240');
  expect(await scrollTop(page)).toBe(0);

  // Open the sheet fully and scroll its content: the page must still not move.
  await page.getByTestId('sheet-handle').click();
  await page.getByTestId('sheet-handle').click();
  await page.getByTestId('sheet-content').evaluate((el) => {
    el.scrollTop = 400;
  });
  expect(await scrollTop(page)).toBe(0);

  // And a deliberate attempt to scroll the window changes nothing.
  await page.evaluate(() => window.scrollTo(0, 600));
  expect(await scrollTop(page)).toBe(0);
});

test('sheet drags land on exact snap points and the map does not move', async ({
  page,
}, testInfo) => {
  // CDP touch is Chromium-only, so this one runs on the phone-sized Chromium
  // project rather than the WebKit phone.
  test.skip(testInfo.project.name !== 'mobile-chromium', 'needs CDP touch');
  await openFunnel(page);

  const sheet = page.getByTestId('bottom-sheet');
  const client = await page.context().newCDPSession(page);

  const mapRect = async () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="map-canvas"]') as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      return { top: r?.top ?? null, left: r?.left ?? null, height: r?.height ?? null };
    });

  /** Drag the handle by `dy` pixels with a real touch. */
  async function dragHandle(dy: number) {
    const box = (await page.getByTestId('sheet-handle').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    for (let i = 1; i <= 10; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (dy * i) / 10, id: 1 }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Let the snap animation finish before reading the destination.
    await page.waitForTimeout(400);
  }

  const before = await mapRect();
  await expect(sheet).toHaveAttribute('data-snap', 'peek');

  // peek -> half. A tap-cycle firing after the drag used to overshoot to full.
  await dragHandle(-260);
  await expect(sheet).toHaveAttribute('data-snap', 'half');

  // half -> full
  await dragHandle(-300);
  await expect(sheet).toHaveAttribute('data-snap', 'full');

  // full -> peek, in one long drag down
  await dragHandle(600);
  await expect(sheet).toHaveAttribute('data-snap', 'peek');

  // Through all of it the map kept its own geometry and the page never scrolled.
  expect(await mapRect()).toEqual(before);
  expect(await scrollTop(page)).toBe(0);
});

test('the phone back button goes back one step, not out of the page', async ({ page }) => {
  await openFunnel(page);
  await pickAddress(page);

  await page.getByTestId('primary-cta').click();
  await expect(page.getByRole('heading', { name: 'Your power use' })).toBeVisible();
  await expect.poll(() => page.url()).toContain('step=1');

  await page.goBack();

  // Back into the funnel, not off it. Inside an iframe, leaving the page means
  // leaving the host site entirely.
  await expect(page.getByRole('heading', { name: 'Find your property' })).toBeVisible();
  await expect.poll(() => page.url()).toContain('step=0');
  expect(page.url()).toContain('/quote');
});

test('keeps ?source= and ?zipcode= through a step change', async ({ page }) => {
  await mockGeocoding(page);
  await page.goto('/quote?source=partner-site&zipcode=76131');
  await waitForHydration(page);

  // ?zipcode= geocodes on load, which is enough to move on.
  await expect(page.getByTestId('primary-cta')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('primary-cta').click();

  const url = page.url();
  expect(url).toContain('source=partner-site');
  expect(url).toContain('zipcode=76131');
  expect(url).toContain('step=1');
});

test('the primary button is on screen at every snap point', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');
  await openFunnel(page);

  // The regression this guards: peek height was a fixed 168px, so growing the
  // peek row pushed the button below the fold and the customer had to hunt.
  for (const snap of ['peek', 'half', 'full'] as const) {
    if (snap !== 'peek') await page.getByTestId('sheet-handle').click();
    await expect(page.getByTestId('bottom-sheet')).toHaveAttribute('data-snap', snap);

    const box = await page.getByTestId('primary-cta').boundingBox();
    const viewport = page.viewportSize()!;
    expect(box, `no primary button at ${snap}`).not.toBeNull();
    expect(box!.y + box!.height, `button below the fold at ${snap}`).toBeLessThanOrEqual(
      viewport.height
    );
    expect(box!.y, `button above the fold at ${snap}`).toBeGreaterThanOrEqual(0);
  }
});

test('every interactive control is at least 44px', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');
  await openFunnel(page);

  // Walk the real rendered layout at 390x844. jsdom cannot do this — it has no
  // layout engine, so getBoundingClientRect is all zeros there.
  const undersized = await page.evaluate(() => {
    const MIN = 44;
    const out: string[] = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, a, input, select, textarea, [role="button"]'
    );
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // offscreen or honeypot
      if (r.height < MIN || r.width < MIN) {
        const id = el.getAttribute('data-testid') ?? el.id ?? el.tagName.toLowerCase();
        out.push(`${id}: ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });

  expect(undersized, `controls under 44px:\n${undersized.join('\n')}`).toEqual([]);
});

test('a server error keeps the design and does not claim success', async ({ page }) => {
  // Seed straight into the contact step with a design already made.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem(
      'gmq:v3',
      JSON.stringify({
        state: {
          currentStepIndex: 5,
          address: '123 Main St, Fort Worth, TX 76131',
          coordinates: { latitude: 32.7555, longitude: -97.3208 },
          electricalMeterPosition: [-97.3208, 32.7556],
          arrayCenter: [-97.3208, 32.7553],
          avgValue: 240,
          percentage: 100,
          totalPanels: 31,
          trenchFeet: 42,
          leadId: 'error-path-test',
          startedAt: Date.now() - 600_000,
        },
        version: 1,
      })
    );
  });

  let leadCalled = false;
  await page.route('**/api/sendEmail', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
  );
  await page.route('**/api/leads', (route) => {
    leadCalled = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  await page.locator('#name').fill('Bert Ortiz');
  await page.locator('#email').fill('bert@example.com');
  await page.locator('#phone').fill('(469) 555-0100');
  await page.getByTestId('submit-lead').click();

  // A plain message, and the form is still there to try again with.
  await expect(page.getByText('Did not go through. Try again.')).toBeVisible();
  await expect(page.getByTestId('success-screen')).toHaveCount(0);
  await expect(page.getByTestId('submit-lead')).toBeEnabled();

  // The design survives: nothing was cleared on a failed send.
  const persisted = await page.evaluate(() => window.localStorage.getItem('gmq:v3'));
  expect(persisted, 'persisted state was cleared on a failed submit').toContain('error-path-test');
  expect(persisted).toContain('"trenchFeet":42');

  // And we never pretended to file the lead after the email failed.
  expect(leadCalled, 'lead was sent even though the email failed').toBe(false);
});
