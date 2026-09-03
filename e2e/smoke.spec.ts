import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 1 e2e: the funnel runs and its state survives a reload.
 *
 * The full six-step run lands in Phase 8 once the rebuilt steps exist. What is
 * worth proving now is the regression this phase could plausibly have caused:
 * that the Zustand migration still drives the UI, and that a refresh restores
 * both the step and the design inputs.
 *
 * Assertions deliberately go through store-derived UI rather than reading
 * localStorage — checking that a value we just wrote comes back out of the
 * browser would test the browser, not the app. The Continue button's enabled
 * state is computed from `address` + `coordinates` in the store, so it is a
 * genuine read-back signal.
 */

const SUGGESTION = {
  id: 'address.test1',
  place_name: '123 Main St, Fort Worth, Texas 76131, United States',
  center: [-97.3208, 32.7555] as [number, number],
};

/** Serve a deterministic geocode result so the test never depends on Mapbox. */
async function mockGeocoding(page: Page) {
  await page.route('**/api.mapbox.com/geocoding/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [
          {
            id: SUGGESTION.id,
            place_name: SUGGESTION.place_name,
            center: SUGGESTION.center,
          },
        ],
      }),
    });
  });
}

/**
 * The single primary button in the sheet.
 *
 * Phase 4 replaced the two competing Continue buttons (a sticky mobile CTA and
 * the address form's own submit) with one, present at every snap point and on
 * both layouts. Its disabled state is still derived from the store.
 */
const continueButton = (page: Page) => page.getByTestId('primary-cta');

/** Wait until the persisted store has rehydrated and inputs are live. */
async function waitForHydration(page: Page) {
  await page.waitForSelector('[data-testid="funnel"][data-hydrated="true"]', {
    timeout: 20_000,
  });
}

/** Type an address and choose the mocked suggestion. */
async function pickAddress(page: Page) {
  await waitForHydration(page);
  await page.locator('#address').fill('123 Main St');
  const suggestion = page.getByRole('button', { name: SUGGESTION.place_name });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
}

test('loads the funnel on a phone viewport without uncaught errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  await expect(page.locator('#address')).toBeVisible();
  expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('geocode suggestion unlocks Continue and advances a step', async ({ page }) => {
  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  // Nothing chosen yet, so the funnel refuses to move on.
  await expect(continueButton(page)).toBeDisabled();

  await pickAddress(page);
  await expect(continueButton(page)).toBeEnabled();

  await continueButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your power use' })).toBeVisible();
});

test('restores the address from the store after a reload', async ({ page }) => {
  await mockGeocoding(page);
  await page.goto('/quote');
  await pickAddress(page);
  await expect(continueButton(page)).toBeEnabled();

  await page.reload();
  await waitForHydration(page);

  // Continue is enabled only when address and coordinates are both present, so
  // this passing means the store rehydrated them — not that the browser kept a
  // string we handed it.
  await expect(continueButton(page)).toBeEnabled();
});

test('restores the current step after a reload', async ({ page }) => {
  await mockGeocoding(page);
  await page.goto('/quote');
  await pickAddress(page);
  await continueButton(page).click();

  const nextHeading = page.getByRole('heading', { name: 'Your power use' });
  await expect(nextHeading).toBeVisible();

  await page.reload();
  await waitForHydration(page);

  // The funnel comes back on step 2, not back at the address form.
  await expect(nextHeading).toBeVisible();
});

test('the root page renders the same funnel as /quote', async ({ page }) => {
  await mockGeocoding(page);
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.locator('#address')).toBeVisible();
});
