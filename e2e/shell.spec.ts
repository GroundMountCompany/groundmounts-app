import { test, expect, type Page } from '@playwright/test';
import './gmTest';
import { TX_FALLBACK_CURVE } from '../src/lib/production';
import { PANELS, BATTERY, SITE } from '../src/config/pricing';
import { parseQuoteInputs, priceFromInputs } from '../src/lib/quoteInputs';
import { RETAIL, COOP, MUNICIPAL, BLURRY_PHOTO } from './fixtures/bills/observed';
import { DEFAULT_RATE_CENTS } from '../src/store/quoteStore';

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

/**
 * Navigate to a step, retrying once if the previous page supersedes it.
 *
 * The funnel keeps ?step= in sync with the store, so a page being torn down can
 * still push its own step as the next navigation starts. Harmless in a browser
 * — the newer navigation wins — but Playwright reports it as an error.
 */
async function gotoStep(page: Page, step: number) {
  try {
    await page.goto(`/quote?step=${step}`);
  } catch (error) {
    if (!String(error).includes('interrupted by another navigation')) throw error;
    await page.goto(`/quote?step=${step}`);
  }
  await waitForHydration(page);
}

/**
 * Wait for the sheet to stop resizing before measuring anything.
 *
 * Its height comes from a ResizeObserver over the header and footer, so right
 * after a navigation it is still settling — and under parallel load that window
 * is wide enough to measure the wrong thing.
 */
async function waitForSheet(page: Page) {
  await page.waitForSelector('[data-testid="bottom-sheet"]', { timeout: 15_000 });
  let last = -1;
  for (let i = 0; i < 30; i++) {
    const height = await page
      .getByTestId('bottom-sheet')
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));
    if (height === last) return;
    last = height;
    await page.waitForTimeout(100);
  }
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

/** The heading each step renders, used to confirm which one is on screen. */
const STEP_HEADINGS = [
  'Find your property',
  'Your power use',
  'Your meter',
  'Design your array',
  'Options',
  'Get your number',
];

const scrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);

test('the page never scrolls under the map, on any step', async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith('mobile'),
    'the bottom sheet is the phone layout'
  );

  await page.addInitScript(() => {
    const pending = window.sessionStorage.getItem('e2e:seed');
    if (pending) window.localStorage.setItem('gmq:v3', pending);
  });

  const seedFor = (step: number) =>
    JSON.stringify({
      state: {
        currentStepIndex: step,
        address: '123 Main St, Fort Worth, TX 76131',
        coordinates: { latitude: 32.7555, longitude: -97.3208 },
        electricalMeterPosition: [-97.3208, 32.7556],
        arrayCenter: [-97.3208, 32.7553],
        avgValue: 240,
        percentage: 100,
        totalPanels: 31,
        trenchFeet: 42,
        leadId: 'scroll-test',
        startedAt: Date.now() - 600_000,
      },
      version: 1,
    });

  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  // The v1 shell scrolled the map off screen and made customers hunt for the
  // button. The map is the viewport now; only the sheet's content moves.
  expect(await scrollTop(page)).toBe(0);

  for (let step = 0; step <= 5; step++) {
    await page.evaluate((seed) => window.sessionStorage.setItem('e2e:seed', seed), seedFor(step));
    // Navigate with the step in the URL rather than reloading: ?step= is
    // authoritative over the persisted index, so a plain reload would restore
    // whichever step the previous URL named.
    await gotoStep(page, step);
    await expect(
      page.getByRole('heading', { name: STEP_HEADINGS[step] })
    ).toBeVisible({ timeout: 10_000 });
    await waitForSheet(page);

    expect(await scrollTop(page), `step ${step} on load`).toBe(0);

    // Scroll the sheet's own content. On steps with no map the sheet is
    // full-height and there is real overflow, so this must actually move —
    // asserting the document stayed put means nothing if nothing scrolled.
    const handle = page.getByTestId('sheet-handle');
    if (await handle.count()) {
      await handle.click();
      await handle.click();
    }
    const sheetScroll = await page.getByTestId('sheet-content').evaluate((el) => {
      el.scrollTop = 600;
      return { top: el.scrollTop, overflow: el.scrollHeight - el.clientHeight };
    });
    if (sheetScroll.overflow > 0) {
      expect(sheetScroll.top, `step ${step} sheet did not scroll`).toBeGreaterThan(0);
    }
    expect(await scrollTop(page), `step ${step} with the sheet open`).toBe(0);

    // And a deliberate attempt to scroll the window changes nothing.
    await page.evaluate(() => window.scrollTo(0, 800));
    expect(await scrollTop(page), `step ${step} after window.scrollTo`).toBe(0);
  }
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

test('every interactive control is at least 44px, on every step', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');

  // Seeded per step and reloaded, rather than driven through the map: the
  // WebKit phone project has no WebGL, so there is no map instance to talk to.
  //
  // One init script, reading a value written before each reload — stacking a
  // fresh addInitScript per iteration left several registered at once with no
  // guaranteed order, so the step under audit was not reliably the one seeded.
  await page.addInitScript(() => {
    const pending = window.sessionStorage.getItem('e2e:seed');
    if (pending) window.localStorage.setItem('gmq:v3', pending);
  });

  const seedFor = (step: number) =>
    JSON.stringify({
      state: {
        currentStepIndex: step,
        address: '123 Main St, Fort Worth, TX 76131',
        coordinates: { latitude: 32.7555, longitude: -97.3208 },
        electricalMeterPosition: [-97.3208, 32.7556],
        arrayCenter: [-97.3208, 32.7553],
        avgValue: 240,
        percentage: 100,
        totalPanels: 31,
        trenchFeet: 42,
        leadId: 'touch-target-test',
        startedAt: Date.now() - 600_000,
      },
      version: 1,
    });

  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  /** Walk the real rendered layout. jsdom has no layout engine, so this cannot
   *  be a vitest unit test — every rect there is zero. */
  const auditDom = () =>
    page.evaluate(() => {
      const MIN = 44;
      const out: string[] = [];
      const nodes = document.querySelectorAll<HTMLElement>(
        'button, a, input, select, textarea, [role="button"], [role="slider"]'
      );
      for (const el of nodes) {
        // Mapbox's own attribution and logo are vendor chrome we are required
        // to display at their size; they are not controls we ask anyone to hit.
        if (el.closest('.mapboxgl-ctrl')) continue;
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

  const offences: string[] = [];

  for (let step = 0; step <= 5; step++) {
    await page.evaluate((seed) => window.sessionStorage.setItem('e2e:seed', seed), seedFor(step));
    // Navigate with the step in the URL rather than reloading: ?step= is
    // authoritative over the persisted index, so a plain reload would restore
    // whichever step the previous URL named.
    await gotoStep(page, step);

    // Confirm we are auditing the step we think we are before measuring.
    await expect(
      page.getByRole('heading', { name: STEP_HEADINGS[step] })
    ).toBeVisible({ timeout: 10_000 });
    await waitForSheet(page);

    // Open the sheet fully so the step's own controls are laid out, not
    // clipped. Steps with no map have no handle: the sheet is already full.
    const handle = page.getByTestId('sheet-handle');
    if (await handle.count()) {
      await handle.click();
      await handle.click();
    }
    await page.waitForTimeout(400);

    for (const offence of await auditDom()) offences.push(`step ${step} — ${offence}`);
  }

  expect(offences, `controls under 44px:\n${offences.join('\n')}`).toEqual([]);
});

/** Seed the contact step with a finished design. */
/**
 * A curve that is nothing like the Texas fallback, so a screen reading the
 * fallback instead of the site's own answer is visibly wrong rather than
 * plausibly close.
 */
const MOCK_CURVE = { 90: 900, 135: 1000, 180: 1100, 225: 1000, 270: 900 };

function siteCurveSeed(step: number) {
  return {
    state: {
      currentStepIndex: step,
      address: '123 Main St, Fort Worth, TX 76131',
      coordinates: { latitude: 32.7555, longitude: -97.3208 },
      electricalMeterPosition: [-97.3208, 32.7556],
      arrayCenter: [-97.3208, 32.7553],
      avgValue: 240,
      percentage: 100,
      totalPanels: 31,
      sizedPanels: 31,
      sizedAzimuth: 180,
      azimuth: 180,
      trenchFeet: 42,
      productionCurve: MOCK_CURVE,
      curveSource: 'pvwatts',
      leadId: 'curve-agreement',
      startedAt: Date.now() - 600_000,
    },
    version: 1,
  };
}

test('the design step and the quote report the same production', async ({ page }) => {
  // Both screens must read the curve /api/site returned for this address.
  // The design step used to read the Texas fallback unconditionally, so a
  // customer whose site had a real curve was shown two different numbers for
  // the same array two steps apart.
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, siteCurveSeed(3));

  // The design step asks /api/site for this address on arrival. Answering with
  // the mock is what puts a non-fallback curve in the store, exactly as a real
  // PVWatts response would.
  await page.route('**/api/site*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        curve: MOCK_CURVE,
        curveSource: 'pvwatts',
        soilClass: 'clay loam',
        soilSource: 'ssurgo',
      }),
    })
  );

  await mockGeocoding(page);
  await gotoStep(page, 3);
  // textContent, not innerText: the stats live in the sheet's scroll region,
  // which is clipped at this viewport, and innerText reports clipped text as
  // empty even though the customer scrolls to it.
  const onDesign = await page.getByTestId('stat-production').textContent();
  const panels = Number((await page.getByTestId('stat-panels').textContent()) ?? '0');

  await gotoStep(page, 5);
  const onQuote = await page.getByTestId('summary-production').textContent();

  expect(onQuote).toBe(onDesign);

  // And it is the mocked curve, not the fallback. Sizing solves for the bill,
  // so the kWh figure alone barely moves between curves — the honest check is
  // against the panel count actually on screen.
  const kw = (panels * PANELS.standard.watts) / 1000;
  const kwh = Number((onDesign ?? '').replace(/[^\d]/g, ''));

  expect(panels).toBeGreaterThan(0);
  expect(kwh).toBeCloseTo(Math.round(kw * MOCK_CURVE[180]), -1);
  // The fallback would put the same array somewhere else entirely.
  expect(Math.abs(kwh - kw * TX_FALLBACK_CURVE[180])).toBeGreaterThan(1_000);
});

test('options the owner has not switched on are not offered', async ({ page }) => {
  // Premium panels and batteries ship disabled: their prices are placeholders,
  // and a card quoting a number nobody stands behind is worse than no card.
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, siteCurveSeed(4));

  await mockGeocoding(page);
  await gotoStep(page, 4);

  await expect(page.getByTestId('option-panels')).toHaveCount(PANELS.premium.enabled ? 1 : 0);
  await expect(page.getByTestId('option-battery')).toHaveCount(BATTERY.enabled ? 1 : 0);
  await expect(page.getByTestId('option-siteprep')).toHaveCount(
    SITE.vegetationClearing.enabled ? 1 : 0
  );

  // Whatever is on offer, the step is not empty.
  await expect(page.getByTestId('option-siteprep')).toBeVisible();
});

test('the premium delta is the change the customer actually gets', async ({ page }) => {
  test.skip(!PANELS.premium.enabled, 'premium panels are switched off in pricing.ts');

  // Choosing premium re-sizes the array: fewer, stronger panels for the same
  // bill. The card used to price the current count at the premium rate, which
  // quoted an increase nobody was ever charged.
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, siteCurveSeed(4));

  await page.route('**/api/site*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        curve: MOCK_CURVE,
        curveSource: 'pvwatts',
        soilClass: 'clay loam',
        soilSource: 'ssurgo',
      }),
    })
  );
  await mockGeocoding(page);

  /** Midpoint of the range on the quote step, which is the estimate itself. */
  const estimateOnQuote = async () => {
    await gotoStep(page, 5);
    const prices = pricesIn((await page.getByTestId('price-range').textContent()) ?? '');
    expect(prices, 'no price range on the quote step').toHaveLength(2);
    return (prices[0] + prices[1]) / 2;
  };

  await gotoStep(page, 4);
  const quoted = (await page.getByTestId('tier-premium').textContent()) ?? '';
  const delta = Number(quoted.replace(/[^\d]/g, '')) * (quoted.includes('−') ? -1 : 1);
  expect(Math.abs(delta), 'premium was quoted as no change at all').toBeGreaterThan(0);

  const before = await estimateOnQuote();

  await gotoStep(page, 4);
  await page.getByTestId('tier-premium').click();
  await expect(page.getByTestId('tier-premium')).toHaveAttribute('aria-pressed', 'true');

  const after = await estimateOnQuote();

  // Within a dollar or two of rounding on each end of the range.
  expect(Math.abs(after - before - delta), 'the quoted delta was not the change').toBeLessThan(3);
});

test('asks for the slope when the ground cannot be read, and prices the answer', async ({
  page,
}) => {
  // Both terrain lookups can fail — no DEM tiles, no Tilequery. An unknown
  // slope prices at no adder at all, so a steep hill-country parcel was quietly
  // quoted as if it were flat.
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, { ...siteCurveSeed(3), state: { ...siteCurveSeed(3).state, slopeSource: 'unavailable' } });

  await page.route('**/api/site*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        curve: MOCK_CURVE,
        curveSource: 'pvwatts',
        soilClass: 'clay loam',
        soilSource: 'ssurgo',
      }),
    })
  );
  await mockGeocoding(page);

  const estimateOnQuote = async () => {
    await gotoStep(page, 5);
    const prices = pricesIn((await page.getByTestId('price-range').textContent()) ?? '');
    return (prices[0] + prices[1]) / 2;
  };

  await gotoStep(page, 3);
  await expect(page.getByTestId('slope-picker')).toBeAttached();

  const unanswered = await estimateOnQuote();

  await gotoStep(page, 3);
  await page.getByTestId('slope-steep').click();
  await expect(page.getByTestId('slope-steep')).toHaveAttribute('aria-pressed', 'true');

  const steep = await estimateOnQuote();
  expect(steep, 'answering steep changed nothing').toBeGreaterThan(unanswered);

  // And the answer survives a reload, so nobody is asked twice.
  await gotoStep(page, 3);
  await expect(page.getByTestId('slope-steep')).toHaveAttribute('aria-pressed', 'true');
});

function contactStepSeed(leadId: string) {
  return {
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
      leadId,
      startedAt: Date.now() - 600_000,
    },
    version: 1,
  };
}

async function fillAndSubmit(page: Page) {
  await page.locator('#name').fill('Bert Ortiz');
  await page.locator('#email').fill('bert@example.com');
  await page.locator('#phone').fill('(469) 555-0100');
  await page.getByTestId('submit-lead').click();
}

/** "$12,345 – $67,890" -> [12345, 67890]. */
function pricesIn(text: string): number[] {
  return (text.match(/\$[\d,]+/g) ?? []).map((m) => Number(m.replace(/[$,]/g, '')));
}

test('a bill upload fills the table and sizes the array from it', async ({ page }) => {
  // The shortcut past typing numbers in. The extraction itself is mocked —
  // this is about the customer's path through it: upload, check what we read,
  // correct it, and carry that into the design.
  await page.route('**/api/bill/extract', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        extraction: {
          months: [
            { month: 'Jan 2026', kwh: 1450, cost: 203.5 },
            { month: 'Dec 2025', kwh: 1310, cost: 188.2 },
          ],
          ratePerKwh: 0.17,
          confidence: 'high',
        },
      }),
    })
  );

  await mockGeocoding(page);
  await gotoStep(page, 1);

  await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bill.png');
  await expect(page.getByTestId('bill-review')).toBeVisible();

  // What we read, editable, before anything is used.
  await expect(page.getByTestId('bill-kwh-0')).toHaveValue('1450');
  await expect(page.getByTestId('bill-kwh-1')).toHaveValue('1310');
  // Two months is a partial year, and it says so rather than presenting a
  // projection as a reading.
  await expect(page.getByTestId('bill-scaled')).toBeVisible();

  // The customer corrects a misread digit.
  await page.getByTestId('bill-kwh-1').fill('1500');
  await expect(page.getByTestId('bill-annual')).toContainText('17,700');

  await page.getByTestId('bill-confirm').click();
  await expect(page.getByTestId('bill-review')).toHaveCount(0);
  await expect(page.getByTestId('bill-confirmed')).toBeVisible();

  // The rate takes over the field below, in the same box they would have typed
  // it into — and it is the blended one, $203.50 over 1,450 kWh, not the 17c
  // the mock states. A Texas bill's printed rate is only the energy half.
  await expect(page.getByTestId('rate-kwh')).toHaveValue('14');

  // A refresh must not offer to do the work again.
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId('bill-confirmed')).toBeVisible();
  await expect(page.getByTestId('bill-upload')).toHaveCount(0);
  await expect(page.getByTestId('bill-confirmed')).toContainText('17,700');

  // And the design is sized against it: 17,700 kWh is a much larger array than
  // the seeded $240 bill would have produced.
  await gotoStep(page, 3);
  const panels = Number((await page.getByTestId('stat-panels').textContent()) ?? '0');
  expect(panels).toBeGreaterThan(0);

  const kwText = (await page.getByTestId('stat-kw').textContent()) ?? '';
  expect(Number(kwText.replace(/[^\d.]/g, ''))).toBeGreaterThan(8);
});

test('a bill survives confirm, reload, edit, discard and reload again', async ({ page }) => {
  // The whole lifecycle in one go, because each transition persists something
  // different and the bugs live in the handovers.
  await page.route('**/api/bill/extract', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, extraction: MUNICIPAL }),
    })
  );

  await mockGeocoding(page);
  await gotoStep(page, 1);

  // CONFIRM
  await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bills/bill-municipal.png');
  await expect(page.getByTestId('bill-review')).toBeVisible();
  await expect(page.getByTestId('bill-kwh-0')).toHaveValue('1560');
  await page.getByTestId('bill-confirm').click();
  await expect(page.getByTestId('bill-confirmed')).toBeVisible();

  const confirmedTarget = Number(
    ((await page.getByTestId('annual-target').textContent()) ?? '').replace(/[^\d]/g, '')
  );
  expect(confirmedTarget).toBeGreaterThan(18_000);

  // RELOAD — still confirmed, no upload button offering to redo the work.
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId('bill-confirmed')).toBeVisible();
  await expect(page.getByTestId('bill-upload')).toHaveCount(0);
  await expect(page.getByTestId('annual-target')).toContainText(
    confirmedTarget.toLocaleString()
  );

  // EDIT — back to the table with the confirmed figures in it.
  await page.getByTestId('bill-edit').click();
  await expect(page.getByTestId('bill-review')).toBeVisible();
  await expect(page.getByTestId('bill-kwh-0')).toHaveValue('1560');
  await page.getByTestId('bill-kwh-0').fill('2000');
  await expect(page.getByTestId('bill-annual')).toContainText('24,000');
  await page.getByTestId('bill-confirm').click();
  await expect(page.getByTestId('bill-confirmed')).toContainText('24,000');

  // DISCARD — sizing returns to the typed figures and the rate to the default.
  await page.getByTestId('bill-edit').click();
  await page.getByTestId('bill-discard').click();
  await expect(page.getByTestId('bill-upload')).toBeVisible();
  await expect(page.getByTestId('bill-confirmed')).toHaveCount(0);
  await expect(page.getByTestId('rate-kwh')).toHaveValue(String(DEFAULT_RATE_CENTS));

  const manualTarget = Number(
    ((await page.getByTestId('annual-target').textContent()) ?? '').replace(/[^\d]/g, '')
  );
  expect(manualTarget, 'the discarded bill was still driving the target').not.toBe(24_000);

  // RELOAD — and it is still discarded.
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId('bill-upload')).toBeVisible();
  await expect(page.getByTestId('bill-confirmed')).toHaveCount(0);
  await expect(page.getByTestId('annual-target')).toContainText(manualTarget.toLocaleString());
});

test('discarding a bill puts sizing back on the typed figures', async ({ page }) => {
  await page.route('**/api/bill/extract', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        extraction: {
          months: [{ month: 'Jan 2026', kwh: 3000, cost: null }],
          ratePerKwh: 0.17,
          confidence: 'high',
        },
      }),
    })
  );

  await mockGeocoding(page);
  await gotoStep(page, 1);

  // A deliberately huge bill, so sizing against it is unmistakable.
  await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bill.png');
  await expect(page.getByTestId('bill-review')).toBeVisible();
  await page.getByTestId('bill-confirm').click();

  const withBill = Number(
    ((await page.getByTestId('annual-target').textContent()) ?? '').replace(/[^\d]/g, '')
  );
  expect(withBill).toBeGreaterThan(30_000);

  // Throw it away and type a figure in instead.
  await page.getByTestId('bill-edit').click();
  await page.getByTestId('bill-discard').click();
  await expect(page.getByTestId('bill-upload')).toBeVisible();

  const bill = page.getByTestId('avg-bill');
  await bill.fill('180');
  await bill.blur();

  const manual = Number(
    ((await page.getByTestId('annual-target').textContent()) ?? '').replace(/[^\d]/g, '')
  );
  expect(manual, 'the discarded bill was still driving the target').toBeLessThan(withBill);
  expect(manual).toBeGreaterThan(0);

  // And it stays discarded across a refresh.
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId('bill-upload')).toBeVisible();
  await expect(page.getByTestId('bill-confirmed')).toHaveCount(0);
});

test('an unreadable bill lands on the manual fields, not a dead end', async ({ page }) => {
  await page.route('**/api/bill/extract', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, reason: "Couldn't read that one. Type it in instead." }),
    })
  );

  await mockGeocoding(page);
  await gotoStep(page, 1);

  await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bill.png');

  await expect(page.getByTestId('bill-failed')).toHaveText(
    "Couldn't read that one. Type it in instead."
  );
  // No review table, and no spinner left running.
  await expect(page.getByTestId('bill-review')).toHaveCount(0);

  // The manual path is right there, working, with nothing to dismiss first.
  const bill = page.getByTestId('avg-bill');
  await bill.fill('265');
  await bill.blur();
  await expect(bill).toHaveValue('265');

  // And the funnel still moves on.
  await gotoStep(page, 3);
  await expect(page.getByTestId('stat-panels')).toBeAttached();
});

test.describe('real bills, as the deployed extractor read them', () => {
  /** Replays a captured response for whichever fixture is uploaded. */
  async function withExtraction(page: Page, extraction: unknown) {
    await page.route('**/api/bill/extract', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, extraction }),
      })
    );
    await mockGeocoding(page);
    await gotoStep(page, 1);
  }

  test('a retailer chart of thirteen months keeps the newest twelve', async ({ page }) => {
    await withExtraction(page, RETAIL);
    await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bills/bill-retail.png');
    await expect(page.getByTestId('bill-review')).toBeVisible();

    // Twelve rows, and the newest is among them. The bill's chart runs
    // oldest-to-newest, and both the model and the sort had to be corrected
    // before August 2026 — the month that matters most — stopped being the
    // one dropped.
    await expect(page.getByTestId('bill-kwh-11')).toBeVisible();
    await expect(page.getByTestId('bill-kwh-12')).toHaveCount(0);
    await expect(page.getByTestId('bill-review')).toContainText('Aug 26');
    await expect(page.getByTestId('bill-review')).not.toContainText('Aug 25');

    // A full year, so no scaling note.
    await expect(page.getByTestId('bill-scaled')).toHaveCount(0);
    // 1842+2040+1710+1490+1375+1280+1195+1080+950+910+980+1045 = 15,897
    await expect(page.getByTestId('bill-annual')).toContainText('15,897');

    // The rate it read: 12.9c energy. Editable, because on this bill the
    // delivery charge is separate and the all-in rate is nearer 16c.
    await expect(page.getByTestId('bill-rate')).toHaveValue('13');
  });

  test('a cooperative table of twelve months needs no scaling', async ({ page }) => {
    await withExtraction(page, COOP);
    await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bills/bill-coop.png');
    await expect(page.getByTestId('bill-review')).toBeVisible();

    await expect(page.getByTestId('bill-kwh-0')).toHaveValue('2315');
    await expect(page.getByTestId('bill-kwh-11')).toHaveValue('1260');
    await expect(page.getByTestId('bill-scaled')).toHaveCount(0);
    // The period total is shown against its month, read-only.
    await expect(page.getByTestId('bill-cost-0')).toContainText('312.77');
    await expect(page.getByTestId('bill-cost-1')).toHaveText('—');
    await expect(page.getByTestId('bill-annual')).toContainText('18,610');
  });

  test('a municipal statement gives one month and says it scaled', async ({ page }) => {
    await withExtraction(page, MUNICIPAL);
    await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bills/bill-municipal.png');
    await expect(page.getByTestId('bill-review')).toBeVisible();

    await expect(page.getByTestId('bill-kwh-0')).toHaveValue('1560');
    await expect(page.getByTestId('bill-kwh-1')).toHaveCount(0);
    // One month is a projection, and the screen says so.
    await expect(page.getByTestId('bill-scaled')).toBeVisible();
    await expect(page.getByTestId('bill-annual')).toContainText('18,720');
  });

  test('a photo of that statement on a worktop reads the same figures', async ({ page }) => {
    // Predicted to fail to manual entry; it did not. Kept as the case it
    // turned out to be rather than the one that was expected.
    await withExtraction(page, BLURRY_PHOTO);
    await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bills/bill-photo-blurry.png');
    await expect(page.getByTestId('bill-review')).toBeVisible();

    await expect(page.getByTestId('bill-kwh-0')).toHaveValue('1560');
    await expect(page.getByTestId('bill-annual')).toContainText('18,720');
  });

  test('an unreadable photo would still land on manual entry', async ({ page }) => {
    // The path the blurry fixture was expected to take, kept because it is the
    // one that matters: no dead end when the model genuinely cannot read it.
    await page.route('**/api/bill/extract', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, reason: "Couldn't read that one. Type it in instead." }),
      })
    );
    await mockGeocoding(page);
    await gotoStep(page, 1);

    await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bills/bill-photo-blurry.png');
    await expect(page.getByTestId('bill-failed')).toBeVisible();
    await expect(page.getByTestId('bill-review')).toHaveCount(0);
  });
});

test('the revealed price is the one the server filed, not the page estimate', async ({
  page,
}) => {
  // The page's own arithmetic is a preview. What the customer is shown after
  // submitting has to be what was written to Airtable and put in their inbox —
  // so this mocks a server that returns a deliberately different range and
  // asserts the screen shows the server's.
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('server-price-wins')
  );

  const SERVER_LOW = 41_234;
  const SERVER_HIGH = 48_765;
  const SERVER_ITEMS = [
    { key: 'equipment', label: 'Panels and racking', detail: 'server priced', amount: 40_000 },
    { key: 'trench', label: 'Trench', detail: '113 ft', amount: 5_000 },
  ];

  const requests: Array<{ quote?: { inputs?: unknown }; resend?: boolean }> = [];
  await page.route('**/api/leads', (route) => {
    requests.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        leadFiled: true,
        emailSent: true,
        priceLow: SERVER_LOW,
        priceHigh: SERVER_HIGH,
        lineItems: SERVER_ITEMS,
      }),
    });
  });
  let strayEmailCalls = 0;
  await page.route('**/api/sendEmail', (route) => {
    strayEmailCalls++;
    return route.fulfill({ status: 404, body: 'gone' });
  });

  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  const beforeSubmit = pricesIn((await page.getByTestId('price-range').innerText()) ?? '');
  expect(beforeSubmit, 'no range on screen before submit').toHaveLength(2);

  await fillAndSubmit(page);
  await expect(page.getByTestId('success-screen')).toBeVisible({ timeout: 15_000 });

  const revealed = pricesIn(await page.getByTestId('price-revealed').innerText());
  expect(revealed, 'the page revealed its own estimate, not the filed one').toEqual([
    SERVER_LOW,
    SERVER_HIGH,
  ]);
  // The fixture is only meaningful if the two genuinely differ.
  expect(revealed).not.toEqual(beforeSubmit);

  // The breakdown comes from the same response.
  const items = await page.getByTestId('line-items').innerText();
  expect(items).toContain('server priced');
  expect(items).toContain('$40,000');

  // Still one request, still no price sent from the browser.
  expect(requests, 'the submit was not a single request').toHaveLength(1);
  expect(strayEmailCalls, 'something still calls /api/sendEmail').toBe(0);
  const body = JSON.stringify(requests[0]);
  for (const key of ['priceLow', 'priceHigh', 'estimate', 'lineItems']) {
    expect(body, `a price was sent from the browser: ${key}`).not.toContain(key);
  }

  // And what was sent still prices to what the page had shown, so the preview
  // is honest even though the reveal defers to the server.
  const priced = priceFromInputs(parseQuoteInputs(requests[0].quote!.inputs));
  expect([priced.quote.low, priced.quote.high]).toEqual(beforeSubmit);
});

test('a failed email retries only the email, never re-filing the lead', async ({ page }) => {
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('retry-email-test')
  );

  const calls: Array<{ resend?: boolean }> = [];
  await page.route('**/api/leads', (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    calls.push(body);
    // The lead files; the email fails first time and goes on the retry.
    const emailSent = calls.length > 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, leadFiled: true, emailSent }),
    });
  });

  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  await fillAndSubmit(page);

  // The lead is safe; only the email failed, and the wording says so.
  await expect(
    page.getByText('Your design is saved. The email did not send — try again.')
  ).toBeVisible();
  await expect(page.getByTestId('success-screen')).toHaveCount(0);

  await page.getByTestId('submit-lead').click();
  await expect(page.getByTestId('success-screen')).toBeVisible({ timeout: 15_000 });

  // Two requests, and the second asks for the email alone — the record is
  // already written and must not be written again.
  expect(calls, 'the submit was retried the wrong number of times').toHaveLength(2);
  expect(calls[0].resend, 'the first request asked for a resend').toBeFalsy();
  expect(calls[1].resend, 'the retry would have filed a second lead').toBe(true);
});

test('a failed lead write sends no email at all', async ({ page }) => {
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('retry-lead-test')
  );

  const calls: Array<{ resend?: boolean }> = [];
  await page.route('**/api/leads', (route) => {
    calls.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, leadFiled: false, emailSent: false }),
    });
  });

  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  await fillAndSubmit(page);
  await expect(page.getByText('Did not go through. Try again.')).toBeVisible();

  await page.getByTestId('submit-lead').click();
  await expect(page.getByText('Did not go through. Try again.')).toBeVisible();

  // Never promise a customer an email about a lead that was never filed, and
  // never let a retry skip the write by asking for a resend.
  expect(calls, 'the lead should have been retried').toHaveLength(2);
  expect(
    calls.some((c) => c.resend),
    'a retry asked to resend an email for a lead that was never filed'
  ).toBe(false);
  await expect(page.getByTestId('success-screen')).toHaveCount(0);
});

test('a focused field and the button are both visible with a keyboard up', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');

  // The owner's finding: with the keyboard up you had to scroll around hunting
  // for the inputs, because the button sat on top of them.
  const KEYBOARD_PX = 336;

  await page.addInitScript(() => {
    const pending = window.sessionStorage.getItem('e2e:seed');
    if (pending) window.localStorage.setItem('gmq:v3', pending);
  });

  // Stand in for the on-screen keyboard: iOS shrinks visualViewport and leaves
  // innerHeight alone, which is exactly the case the handler reads.
  await page.addInitScript((px) => {
    const vv = window.visualViewport;
    if (!vv) return;
    Object.defineProperty(vv, 'height', {
      get: () => window.innerHeight - px,
      configurable: true,
    });
  }, KEYBOARD_PX);

  await mockGeocoding(page);
  await page.goto('/quote');
  await page.evaluate(
    (v) => window.sessionStorage.setItem('e2e:seed', v),
    JSON.stringify(contactStepSeed('keyboard-test'))
  );

  /** Is the element inside the space the keyboard leaves? */
  const visibleAboveKeyboard = async (selector: string) => {
    const box = await page.locator(selector).boundingBox();
    if (!box) return false;
    const limit = page.viewportSize()!.height - KEYBOARD_PX;
    return box.y >= 0 && box.y + box.height <= limit + 1;
  };

  /**
   * Visible is not enough: the sticky button was sitting on top of the field,
   * overlapping Name by 35px and Phone by 22px.
   */
  const overlapPx = async (a: string, b: string) => {
    const [ra, rb] = await Promise.all([
      page.locator(a).boundingBox(),
      page.locator(b).boundingBox(),
    ]);
    if (!ra || !rb) return 0;
    const vertical = Math.min(ra.y + ra.height, rb.y + rb.height) - Math.max(ra.y, rb.y);
    const horizontal = Math.min(ra.x + ra.width, rb.x + rb.width) - Math.max(ra.x, rb.x);
    return vertical > 0 && horizontal > 0 ? vertical : 0;
  };

  // Step 2: focus each bill field in turn.
  await gotoStep(page, 1);
  await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')));

  for (const field of ['#avg-bill', '#rate-kwh']) {
    // .focus() so the production focusin handler runs, rather than the test
    // scrolling the field into view itself.
    await page.locator(field).focus();
    await page.waitForTimeout(400);

    expect(await visibleAboveKeyboard(field), `${field} hidden by the keyboard`).toBe(true);
    expect(
      await visibleAboveKeyboard('[data-testid="primary-cta"]'),
      `button hidden while ${field} focused`
    ).toBe(true);
    expect(
      await overlapPx(field, '[data-testid="primary-cta"]'),
      `button covers ${field}`
    ).toBe(0);
  }

  // Step 6: the three contact fields and the submit button.
  await gotoStep(page, 5);
  await page.evaluate(() => window.visualViewport?.dispatchEvent(new Event('resize')));

  for (const field of ['#name', '#email', '#phone']) {
    await page.locator(field).focus();
    await page.waitForTimeout(400);

    expect(await visibleAboveKeyboard(field), `${field} hidden by the keyboard`).toBe(true);
    expect(
      await visibleAboveKeyboard('[data-testid="submit-lead"]'),
      `submit hidden while ${field} focused`
    ).toBe(true);
    expect(
      await overlapPx(field, '[data-testid="submit-lead"]'),
      `submit button covers ${field}`
    ).toBe(0);
  }
});

test('no stray text renders outside the sheet on a map-less step', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');

  // The owner saw a ghost line of the step description above the sheet's top
  // edge: the map column was rendering its own copy of the intro into the blank
  // band left by a half-height sheet.
  await mockGeocoding(page);
  await gotoStep(page, 1);

  const strays = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="bottom-sheet"]');
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const text = node.textContent?.trim() ?? '';
      if (text.length < 3) continue;

      const el = node.parentElement;
      if (!el || sheet?.contains(el)) continue;
      if (el.closest('.mapboxgl-ctrl')) continue; // vendor attribution

      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      out.push(text.slice(0, 60));
    }
    return out;
  });

  expect(strays, `text outside the sheet:\n${strays.join('\n')}`).toEqual([]);
});

test('the sheet fills the screen on steps with no map', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');

  await mockGeocoding(page);
  for (const step of [1, 4, 5]) {
    await gotoStep(page, step);
    await waitForSheet(page);

    const box = (await page.getByTestId('bottom-sheet').boundingBox())!;
    const size = page.viewportSize()!;

    // No dead white band above it, and no snap handle to drag.
    expect(box.y, `step ${step} sheet does not reach the top`).toBeLessThanOrEqual(1);
    expect(box.height, `step ${step} sheet is not full height`).toBeGreaterThanOrEqual(
      size.height - 2
    );
    await expect(page.getByTestId('sheet-handle')).toHaveCount(0);
  }
});

test('a filed lead restores read-only contact details, and Start over clears them', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const pending = window.sessionStorage.getItem('e2e:seed');
    if (pending) window.localStorage.setItem('gmq:v3', pending);
  });

  // The lead files, the email does not: the state these specs care about.
  await page.route('**/api/leads', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, leadFiled: true, emailSent: false }),
    })
  );

  await mockGeocoding(page);
  await page.goto('/quote');
  await page.evaluate(
    (v) => window.sessionStorage.setItem('e2e:seed', v),
    JSON.stringify(contactStepSeed('restore-test'))
  );
  await gotoStep(page, 5);
  // Drop the seed so the reload below keeps what the app persisted rather than
  // re-seeding over it.
  await page.evaluate(() => window.sessionStorage.removeItem('e2e:seed'));

  await page.locator('#name').fill('Bert Ortiz');
  await page.locator('#email').fill('bert@example.com');
  await page.locator('#phone').fill('(469) 555-0100');
  await page.getByTestId('submit-lead').click();

  // The lead is filed; the email failed, which is what keeps us on this screen.
  await expect(page.getByTestId('contact-locked')).toBeVisible();

  await page.reload();
  await waitForHydration(page);

  // Restored, and not editable: the email must go where the record says.
  await expect(page.locator('#name')).toHaveValue('Bert Ortiz');
  await expect(page.locator('#email')).toHaveValue('bert@example.com');
  await expect(page.locator('#phone')).toHaveValue('(469) 555-0100');
  for (const field of ['#name', '#email', '#phone']) {
    expect(await page.locator(field).getAttribute('readonly')).not.toBeNull();
  }

  const before = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem('gmq:v3') ?? '{}').state?.leadId
  );

  await page.getByTestId('start-over').click();
  await waitForHydration(page);

  await expect(page.getByRole('heading', { name: 'Find your property' })).toBeVisible();

  const after = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem('gmq:v3') ?? '{}').state?.leadId ?? null
  );
  expect(after, 'Start over did not issue a new leadId').not.toBe(before);
});

test('a filed lead blocks the design from every route in', async ({ page }) => {
  await page.addInitScript(() => {
    const pending = window.sessionStorage.getItem('e2e:seed');
    if (pending) window.localStorage.setItem('gmq:v3', pending);
  });

  // The lead files, the email does not: the state these specs care about.
  await page.route('**/api/leads', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, leadFiled: true, emailSent: false }),
    })
  );

  await mockGeocoding(page);
  await page.goto('/quote');
  await page.evaluate(
    (v) => window.sessionStorage.setItem('e2e:seed', v),
    JSON.stringify(contactStepSeed('lock-routes'))
  );
  // Arrive at the contact step the way a customer does — from Options — so the
  // history behind it holds a design step for the back button to return to.
  await gotoStep(page, 4);
  await page.evaluate(() => window.sessionStorage.removeItem('e2e:seed'));
  await page.getByTestId('primary-cta').click();
  await expect(page.getByRole('heading', { name: 'Get your number' })).toBeVisible();

  await page.locator('#name').fill('Bert Ortiz');
  await page.locator('#email').fill('bert@example.com');
  await page.locator('#phone').fill('(469) 555-0100');
  await page.getByTestId('submit-lead').click();
  await expect(page.getByTestId('contact-locked')).toBeVisible();

  const designHeading = page.getByRole('heading', { name: 'Design your array' });

  // Route 1: the browser back button.
  await page.goBack();
  await expect(designHeading).toHaveCount(0);
  await expect(page.getByTestId('design-locked')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Options' })).toHaveCount(0);

  // Route 2: a hand-typed ?step=.
  await gotoStep(page, 3);
  await expect(designHeading).toHaveCount(0);
  await expect(page.getByTestId('design-locked')).toBeVisible();

  // Route 3: the progress bar.
  await page.getByTestId('progress-step-3').click();
  await expect(designHeading).toHaveCount(0);
  await expect(page.getByTestId('design-locked')).toBeVisible();

  // Step 0 is locked too: the address is on the filed record as well.
  const addressHeading = page.getByRole('heading', { name: 'Find your property' });

  await gotoStep(page, 0);
  await expect(addressHeading).toHaveCount(0);
  await expect(page.getByTestId('design-locked')).toBeVisible();

  await page.getByTestId('progress-step-0').click();
  await expect(addressHeading).toHaveCount(0);
  await expect(page.getByTestId('design-locked')).toBeVisible();
});

test('?reset=1 clears the funnel and starts over', async ({ page }) => {
  await page.addInitScript(() => {
    const pending = window.sessionStorage.getItem('e2e:seed');
    if (pending) window.localStorage.setItem('gmq:v3', pending);
  });

  await mockGeocoding(page);
  await page.goto('/quote');
  await page.evaluate(
    (v) => window.sessionStorage.setItem('e2e:seed', v),
    JSON.stringify(contactStepSeed('reset-test'))
  );
  await gotoStep(page, 5);
  await page.evaluate(() => window.sessionStorage.removeItem('e2e:seed'));
  await expect(page.getByRole('heading', { name: 'Get your number' })).toBeVisible();

  await page.goto('/quote?reset=1');
  await waitForHydration(page);

  // Back at the start, with the design gone and the parameter stripped so a
  // refresh does not wipe the new run too.
  await expect(page.getByRole('heading', { name: 'Find your property' })).toBeVisible();
  expect(page.url()).not.toContain('reset=1');
  expect(page.url()).toContain('step=0');

  const state = await page.evaluate(() => {
    const raw = window.localStorage.getItem('gmq:v3');
    return raw ? JSON.parse(raw).state : null;
  });
  expect(state?.leadId, 'reset kept the old leadId').not.toBe('reset-test');
  expect(state?.trenchFeet ?? 0, 'reset kept the old design').toBe(0);
});

test('the bill field rounds to whole dollars on blur', async ({ page }) => {
  await mockGeocoding(page);
  await gotoStep(page, 1);

  const bill = page.locator('#avg-bill');
  await bill.fill('240.75');
  await bill.blur();
  await expect(bill).toHaveValue('241');

  // And a half-typed entry never becomes NaN on screen.
  await bill.fill('0.');
  await bill.blur();
  await expect(bill).toHaveValue('');
  await expect(page.getByText('NaN')).toHaveCount(0);
});
