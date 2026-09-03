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
 * Whichever Continue control is actually on screen.
 *
 * The funnel renders two: a sticky bottom CTA (phones, `md:hidden`) and the
 * address form's own submit button (desktop). Both are disabled from the same
 * store-derived `shouldContinueButtonDisabled`, so either is a valid read-back
 * signal — but only one is visible per viewport, so the locator has to pick.
 */
const continueButton = (page: Page) =>
  page
    .locator('[data-testid="mobile-continue"]:visible, form button[type="submit"]:visible')
    .first();

/** Type an address and choose the mocked suggestion. */
async function pickAddress(page: Page) {
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

  await expect(page.locator('#address')).toBeVisible();
  expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('geocode suggestion unlocks Continue and advances to the meter step', async ({ page }) => {
  await mockGeocoding(page);
  await page.goto('/quote');

  // Nothing chosen yet, so the funnel refuses to move on.
  await expect(continueButton(page)).toBeDisabled();

  await pickAddress(page);
  await expect(continueButton(page)).toBeEnabled();

  await continueButton(page).click();
  await expect(
    page.getByRole('heading', { name: 'Find Your Electrical Meter' })
  ).toBeVisible();
});

test('restores the address from the store after a reload', async ({ page }) => {
  await mockGeocoding(page);
  await page.goto('/quote');
  await pickAddress(page);
  await expect(continueButton(page)).toBeEnabled();

  await page.reload();

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

  const meterHeading = page.getByRole('heading', { name: 'Find Your Electrical Meter' });
  await expect(meterHeading).toBeVisible();

  await page.reload();

  // The funnel comes back on step 2, not back at the address form.
  await expect(meterHeading).toBeVisible();
});

test('the root page renders the same funnel as /quote', async ({ page }) => {
  await mockGeocoding(page);
  await page.goto('/');
  await expect(page.locator('#address')).toBeVisible();
});
