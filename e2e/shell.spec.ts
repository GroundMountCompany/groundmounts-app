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
  test.skip(testInfo.project.name !== 'mobile', 'the bottom sheet is the phone layout');
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

test('dragging the sheet resizes it and leaves the map alone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'the bottom sheet is the phone layout');
  await openFunnel(page);

  const sheet = page.getByTestId('bottom-sheet');
  await expect(sheet).toHaveAttribute('data-snap', 'peek');

  const before = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="map-canvas"]') as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    return { top: r?.top ?? null, left: r?.left ?? null, height: r?.height ?? null };
  });

  // Drag the handle upward. The sheet is a sibling of the map, so this must
  // never reach the map's gesture handling.
  const handle = page.getByTestId('sheet-handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 30);
  }
  await page.mouse.up();

  await expect(sheet).not.toHaveAttribute('data-snap', 'peek');

  const after = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="map-canvas"]') as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    return { top: r?.top ?? null, left: r?.left ?? null, height: r?.height ?? null };
  });

  // The map keeps its own geometry; the sheet grew over the top of it.
  expect(after).toEqual(before);
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
