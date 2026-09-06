import { test, expect, type Page } from '@playwright/test';

/**
 * Capture the results screen for review, without filing a lead.
 *
 * Not part of the suite — it asserts almost nothing and writes files. It runs
 * on demand, against a server built with NEXT_PUBLIC_DEMO_PARAMS=1:
 *
 *   npx playwright test --project=mobile e2e/screenshots.spec.ts
 *
 * The lead route is stubbed to fail loudly as well as being unreachable by
 * design, so a capture that somehow submitted would be obvious rather than
 * quietly landing in the owner's Airtable.
 */

test.skip(
  (process.env.E2E_DEMO_PARAMS ?? '1') !== '1',
  'needs a server built with demo parameters on'
);

const DIR = 'docs/screenshots';

async function openResults(page: Page) {
  await page.route('**/api/leads', (route) =>
    route.fulfill({ status: 500, body: 'screenshots must not submit' })
  );
  await page.route('**/api.mapbox.com/geocoding/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"features":[]}' })
  );

  await page.goto('/quote?demo=results');
  await page.waitForSelector('[data-testid="funnel"][data-hydrated="true"]', { timeout: 20_000 });
  await expect(page.getByTestId('results-section')).toBeVisible({ timeout: 20_000 });
  // The chart animates its axis in; wait for the figures to settle instead of
  // guessing a duration.
  await expect(page.getByTestId('result-breakeven')).toBeVisible();
  await page.waitForTimeout(600);
}

/** Move the inflation slider to a value, from the keyboard. */
async function setInflation(page: Page, target: number) {
  const thumb = page.getByTestId('inflation-slider').getByRole('slider');
  await thumb.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft');
  const steps = Math.round(target / 0.5);
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('inflation-value')).toHaveText(`${target}%`);
  await page.waitForTimeout(400);
}

test('captures the results screen', async ({ page }, testInfo) => {
  const size = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
  await openResults(page);

  /*
    Let the page grow to its own height before capturing.

    The controls are an internally scrolling column on both layouts — the
    sheet's content on a phone, the centred column on a desktop — so a fullPage
    screenshot otherwise captures whatever slice happened to be scrolled into
    view. On the desktop capture that meant starting halfway down the chart.
  */
  await page.evaluate(() => {
    for (const id of ['sheet-content', 'content-column', 'funnel']) {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) continue;
      el.style.overflow = 'visible';
      el.style.height = 'auto';
      el.style.position = 'static';
    }
    document.documentElement.style.overflow = 'visible';
    document.body.style.overflow = 'visible';
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/results-${size}.png`, fullPage: true });

  await setInflation(page, 0);
  await page.screenshot({ path: `${DIR}/results-${size}-inflation-0.png`, fullPage: true });

  await setInflation(page, 8);
  await page.screenshot({ path: `${DIR}/results-${size}-inflation-8.png`, fullPage: true });
});
