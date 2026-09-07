import { test, expect, type Page } from '@playwright/test';
import './gmTest';
import { TX_FALLBACK_CURVE } from '../src/lib/production';
import { PANELS, BATTERY, SITE } from '../src/config/pricing';
import { parseQuoteInputs, priceFromInputs } from '../src/lib/quoteInputs';
import { RETAIL, COOP, MUNICIPAL, BLURRY_PHOTO } from './fixtures/bills/observed';
import { DEFAULT_RATE_CENTS } from '../src/store/quoteStore';
import { RESULTS } from '../src/config/results';

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
  // 50ms, not 100: this is called two or three times per step in the loops that
  // walk all six, and its floor is two polls. The sheet's transition is 220ms,
  // so a finer poll costs nothing in accuracy and gives back a second a test.
  for (let i = 0; i < 60; i++) {
    const height = await page
      .getByTestId('bottom-sheet')
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));
    if (height === last) return;
    last = height;
    await page.waitForTimeout(50);
  }
}

/**
 * Wait for an element's box to stop changing before measuring it.
 *
 * Same reason as waitForSheet: a layout that is still settling gives a reading
 * that was true for one frame. Waiting for stability is not the same as
 * waiting for the assertion to pass — a box that settles in the wrong place
 * still fails.
 */
/**
 * Wait for a rendered figure to stop changing before reading it.
 *
 * The design step sizes itself twice on arrival — once against the fallback
 * curve, then again once the site's own curve has hydrated — so a count read on
 * the first frame is a different number a moment later. A baseline captured
 * there measures that settling rather than whatever the test went on to do.
 */
async function waitForStableText(page: Page, testId: string): Promise<string> {
  const locator = page.getByTestId(testId);
  await expect(locator).toBeVisible({ timeout: 15_000 });
  let last = '';
  let identical = 0;
  // Eight samples, not two. The second sizing pass can land a third of a second
  // after the first, and a short window declared the intermediate figure final.
  for (let i = 0; i < 80; i++) {
    const now = (await locator.textContent()) ?? '';
    identical = now === last ? identical + 1 : 0;
    if (identical >= 8) return now;
    last = now;
    await page.waitForTimeout(50);
  }
  return last;
}

async function waitForStableBox(page: Page, testId: string, timeout = 15_000) {
  const locator = page.getByTestId(testId);
  await expect(locator).toBeVisible({ timeout });
  let last = '';
  let identical = 0;
  for (let i = 0; i < 40; i++) {
    const now = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.top)},${Math.round(r.height)}`;
    });
    identical = now === last ? identical + 1 : 0;
    if (identical >= 2) return;
    last = now;
    await page.waitForTimeout(50);
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

/**
 * Confirm which step is on screen.
 *
 * The design step's peek row is its panel control, not its heading — the
 * heading is one drag up, deliberately, so the numbers and the buttons fit on
 * screen while the array is being placed. So peel the sheet open if the
 * heading is not already there.
 */
async function openSheet(page: Page) {
  const handle = page.getByTestId('sheet-handle');
  if (!(await handle.isVisible())) return; // desktop: the panel is already open
  await waitForSheet(page);
  while ((await page.getByTestId('bottom-sheet').getAttribute('data-snap')) !== 'full') {
    await handle.click();
    await waitForSheet(page);
  }
}

async function expectOnStep(page: Page, step: number) {
  const heading = page.getByRole('heading', { name: STEP_HEADINGS[step] });
  if (!(await heading.isVisible())) {
    const handle = page.getByTestId('sheet-handle');
    if (await handle.isVisible()) await handle.click();
  }
  await expect(heading).toBeVisible({ timeout: 10_000 });
}

const scrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);

test('the page never scrolls under the map, on any step', async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith('mobile'),
    'the bottom sheet is the phone layout'
  );
  /*
    Six full page loads in one test, each with hydration and — on three of the
    steps — a WebGL map. Measured solo at 11-16s on this project against
    Playwright's generic 30s budget, which leaves under 2x headroom; running a
    second suite alongside pushed it to 31s and 34s.

    test.slow() triples the budget. This is sizing it to the work rather than
    papering over a race: the same loop passes on the other two projects under
    the same contention, and the failures were the whole loop running long, not
    one step hanging.
  */
  test.slow();

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
    await expectOnStep(page, step);
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

  // The map is created lazily — the Mapbox chunk, then a WebGL context — so
  // the canvas exists with a zero box before it has laid out. Taking the
  // baseline then recorded height 0 and compared it against a real 844 at the
  // end, which under a second concurrent suite is exactly when the chunk was
  // still arriving. Wait for geometry before claiming to measure it.
  await waitForStableBox(page, 'map-canvas');
  const before = await mapRect();
  expect(before.height, 'the map had no geometry to preserve').toBeGreaterThan(0);
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
  /*
    Six full page loads in one test, each with hydration and — on three of the
    steps — a WebGL map. Measured solo at 11-16s on this project against
    Playwright's generic 30s budget, which leaves under 2x headroom; running a
    second suite alongside pushed it to 31s and 34s.

    test.slow() triples the budget. This is sizing it to the work rather than
    papering over a race: the same loop passes on the other two projects under
    the same contention, and the failures were the whole loop running long, not
    one step hanging.
  */
  test.slow();

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
    await expectOnStep(page, step);
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

test('the options step asks four questions about the land', async ({ page }) => {
  // Phase 9: the panel choice and the battery cards are gone. What replaced
  // them is what the surveys used to decide silently — how steep the ground is
  // and whether it is rocky, both worth thousands on a bad parcel.
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, siteCurveSeed(4));

  await mockGeocoding(page);
  await gotoStep(page, 4);

  // Gone entirely, not hidden behind a flag that could flip back on.
  await expect(page.getByTestId('option-panels')).toHaveCount(0);
  await expect(page.getByTestId('tier-premium')).toHaveCount(0);
  await expect(page.getByTestId('battery-1')).toHaveCount(0);
  expect(PANELS.premium.enabled, 'premium is meant to be off in pricing.ts').toBe(false);
  expect(BATTERY.enabled, 'battery is meant to be off in pricing.ts').toBe(false);

  // Four questions, in the owner's order.
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="option-"]')).map(
      (el) => (el as HTMLElement).dataset.testid
    )
  );
  expect(order).toEqual(['option-siteprep', 'option-slope', 'option-soil', 'option-battery']);

  await expect(page.getByTestId('option-siteprep')).toHaveCount(
    SITE.vegetationClearing.enabled ? 1 : 0
  );
  for (const id of ['slope-answer-flat', 'slope-answer-slight', 'slope-answer-big']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('rocky-no')).toBeVisible();
  await expect(page.getByTestId('rocky-yes')).toBeVisible();
  await expect(page.getByTestId('battery-interest-yes')).toBeVisible();
  await expect(page.getByTestId('battery-interest-no')).toBeVisible();
});

test('the ground answers change the price, and the battery question does not', async ({
  page,
}) => {
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, siteCurveSeed(4));

  await mockGeocoding(page);

  /** Midpoint of the range on the quote step, which is the estimate itself. */
  const estimateOnQuote = async () => {
    await gotoStep(page, 5);
    const prices = pricesIn((await page.getByTestId('price-range').textContent()) ?? '');
    expect(prices, 'no price range on the quote step').toHaveLength(2);
    return (prices[0] + prices[1]) / 2;
  };

  await gotoStep(page, 4);
  await expect(page.getByTestId('slope-answer-flat')).toHaveAttribute('aria-pressed', 'true');
  const flat = await estimateOnQuote();

  // A big slope costs more than a slight one, which costs more than flat.
  await gotoStep(page, 4);
  await page.getByTestId('slope-answer-slight').click();
  const slight = await estimateOnQuote();

  await gotoStep(page, 4);
  await page.getByTestId('slope-answer-big').click();
  const big = await estimateOnQuote();

  expect(slight).toBeGreaterThan(flat);
  expect(big).toBeGreaterThan(slight);

  // Rocky ground costs more again, on top.
  await gotoStep(page, 4);
  await page.getByTestId('rocky-yes').click();
  const rocky = await estimateOnQuote();
  expect(rocky).toBeGreaterThan(big);

  // The battery question is a conversation, not a line item.
  await gotoStep(page, 4);
  await page.getByTestId('battery-interest-yes').click();
  await expect(page.getByTestId('battery-interest-yes')).toHaveAttribute('aria-pressed', 'true');
  expect(await estimateOnQuote()).toBe(rocky);

  // And the answers survive a reload, like every other decision in the funnel.
  await gotoStep(page, 4);
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId('slope-answer-big')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rocky-yes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('battery-interest-yes')).toHaveAttribute('aria-pressed', 'true');
});

test('the soil survey pre-selects rocky, and the customer can overrule it', async ({ page }) => {
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, {
    ...siteCurveSeed(4),
    state: {
      ...siteCurveSeed(4).state,
      soilClass: 'Tarrant rock outcrop complex',
      slopeTier: 'Steep',
    },
  });

  await mockGeocoding(page);
  await gotoStep(page, 4);

  // Pre-selected from what the surveys found, with a line saying why.
  await expect(page.getByTestId('rocky-yes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rocky-survey-note')).toBeVisible();
  await expect(page.getByTestId('slope-answer-big')).toHaveAttribute('aria-pressed', 'true');

  // And overruled by the person standing on the land, which is the whole point.
  await page.getByTestId('rocky-no').click();
  await expect(page.getByTestId('rocky-no')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rocky-yes')).toHaveAttribute('aria-pressed', 'false');

  // The note stays: it is what the survey said, not what they answered.
  await expect(page.getByTestId('rocky-survey-note')).toBeVisible();

  // A survey result arriving late must not move an answer already given.
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId('rocky-no')).toHaveAttribute('aria-pressed', 'true');
});

test('a slope picked on the design step pre-selects the answer that prices', async ({
  page,
}) => {
  // Both terrain lookups can fail — no DEM tiles, no Tilequery — and the
  // design step asks. From Phase 9 that pick does not price directly: it sets
  // the tier on the record for the owner, and it pre-selects the slope answer
  // on the options step, which is what the number is built from. This walks
  // the whole chain, because a break anywhere in it quietly under-quotes a
  // steep parcel.
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
  // The second terrain source, refused for the whole test rather than for the
  // instant the first assertion runs. The seed says the ground could not be
  // read, but every visit to the step asks again — so without this the picker
  // was racing a lookup that could answer and take it off screen, and the test
  // only passed because it clicked faster than the network.
  await page.route('**/api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  );
  await mockGeocoding(page);

  const estimateOnQuote = async () => {
    await gotoStep(page, 5);
    const prices = pricesIn((await page.getByTestId('price-range').textContent()) ?? '');
    return (prices[0] + prices[1]) / 2;
  };

  await gotoStep(page, 3);
  await expect(page.getByTestId('slope-picker')).toBeAttached();

  // Nobody has said anything about the ground yet, so it prices as flat.
  await gotoStep(page, 4);
  await expect(page.getByTestId('slope-answer-flat')).toHaveAttribute('aria-pressed', 'true');
  const unanswered = await estimateOnQuote();

  await gotoStep(page, 3);
  // The peek row is the panel control and the button; the slope picker is a
  // rare fallback that lives in the body, so open the sheet the way a customer
  // would before reaching for it.
  await openSheet(page);
  await page.getByTestId('slope-steep').click();
  await expect(page.getByTestId('slope-steep')).toHaveAttribute('aria-pressed', 'true');

  // Which arrives on the options step as the answer already chosen for them.
  await gotoStep(page, 4);
  await expect(page.getByTestId('slope-answer-big')).toHaveAttribute('aria-pressed', 'true');

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

/** Files a lead with a fixed server price, so the results maths is predictable. */
async function submitWithServerPrice(page: Page, low: number, high: number) {
  await page.route('**/api/leads', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        leadFiled: true,
        emailSent: true,
        priceLow: low,
        priceHigh: high,
        lineItems: [
          { key: 'equipment', label: 'Panels and installation', amount: low },
          { key: 'trench', label: 'Trenching', amount: high - low },
        ],
      }),
    })
  );
  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);
  await fillAndSubmit(page);
  await expect(page.getByTestId('success-screen')).toBeVisible({ timeout: 15_000 });
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

  test('a 12 MP phone photo is shrunk before it is sent', async ({ page }) => {
    // Vercel rejects a request body over 4.5 MB before any of our code runs,
    // so a raw camera photo would have produced a platform error page rather
    // than the "type it in instead" this funnel promises.
    await page.route('**/api/bill/extract', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, extraction: MUNICIPAL }),
      })
    );

    await mockGeocoding(page);
    await gotoStep(page, 1);

    await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bills/bill-oversized.png');

    // It still works, which is the point.
    await expect(page.getByTestId('bill-review')).toBeVisible();
    await expect(page.getByTestId('bill-kwh-0')).toHaveValue('1560');

    // And what left the browser is a fraction of what was chosen. Measured
    // from the client rather than from the request: Playwright does not hand
    // back the body of a multipart upload, and reading `postDataBuffer` gave
    // 192 bytes whether the image had been shrunk or not.
    const file = page.getByTestId('bill-file');
    const original = Number(await file.getAttribute('data-original-bytes'));
    const uploaded = Number(await file.getAttribute('data-upload-bytes'));

    expect(original, 'the fixture is not the size this test assumes').toBeGreaterThan(
      5 * 1024 * 1024
    );
    expect(uploaded, 'the photo was sent at full size').toBeLessThan(2 * 1024 * 1024);
    expect(uploaded).toBeLessThan(original / 2);
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
    await expect(page.getByTestId('bill-failed')).toBeVisible({ timeout: BILL_HOLD_TIMEOUT });
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

  const calls: Array<{ resend?: boolean; email?: string }> = [];
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

  const calls: Array<{ resend?: boolean; email?: string }> = [];
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
  //
  // A lower bound, not an exact count: the queue re-flushes a 5xx on its own
  // backoff, so on a fast server a third write lands inside this window and on
  // a slow one it does not. That timer is not what this test is about — what
  // matters is that every attempt is a full lead write. Pinning the count to 2
  // was measuring the backoff.
  expect(calls.length, 'the lead should have been retried').toBeGreaterThanOrEqual(2);
  expect(
    calls.some((c) => c.resend),
    'a retry asked to resend an email for a lead that was never filed'
  ).toBe(false);
  // And each one carries the lead, rather than a retry shrinking to a nudge.
  for (const call of calls) {
    expect(call.email, 'a retry went out without the lead on it').toBe('bert@example.com');
  }
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

test('?demo=results opens the finished screen without sending anything', async ({ page }) => {
  test.skip(
    (process.env.E2E_DEMO_PARAMS ?? '1') !== '1',
    'this run built the server with demo parameters off'
  );

  // Reviewing this screen used to mean filing a real lead with a real email
  // address and leaving a real record in the owner's Airtable. Nothing may
  // leave the browser here.
  const leadCalls: string[] = [];
  await page.route('**/api/leads', (route) => {
    leadCalls.push(route.request().method());
    return route.fulfill({ status: 500, body: 'the demo must not call this' });
  });

  await mockGeocoding(page);
  await page.goto('/quote?demo=results');
  await waitForHydration(page);

  await expect(page.getByTestId('success-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('results-section')).toBeVisible();
  await expect(page.getByTestId('result-breakeven')).toBeVisible();

  expect(leadCalls, `the demo sent ${leadCalls.length} request(s) to /api/leads`).toEqual([]);

  // The revealed range is the page's own arithmetic for the seeded design, so
  // it agrees with the line items beside it rather than being a stray figure.
  const revealed = pricesIn(await page.getByTestId('price-revealed').innerText());
  expect(revealed, 'no range on the demo screen').toHaveLength(2);
  const items = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="line-items"] dd')).map((d) =>
      Number((d.textContent ?? '').replace(/[^\d]/g, ''))
    )
  );
  const total = items.reduce((sum, n) => sum + n, 0);
  expect(total, 'the line items do not add up to the revealed range').toBeGreaterThan(revealed[0]);
  expect(total).toBeLessThan(revealed[1]);

  // And it did not pretend a lead was filed: the design is not locked.
  const filed = await page.evaluate(() => {
    const raw = window.localStorage.getItem('gmq:v3');
    return raw ? JSON.parse(raw).state?.leadFiled : 'no store';
  });
  expect(filed, 'the demo marked the lead as filed').toBeNull();
});

test('?demo=results does nothing when the flag is off', async ({ page }) => {
  test.skip(
    (process.env.E2E_DEMO_PARAMS ?? '1') === '1',
    'needs a server built without the flag: E2E_DEMO_PARAMS= E2E_PORT=3101 ...'
  );

  // In production the comparison inlines to false and the parameter is inert.
  // A demo screen that opened for anybody would be claiming a quote nobody
  // was given.
  await mockGeocoding(page);
  await page.goto('/quote?demo=results');
  await waitForHydration(page);

  await expect(page.getByTestId('success-screen')).toHaveCount(0);
  await expect(page.getByTestId('results-section')).toHaveCount(0);
});

test('the results section answers the number it sits under', async ({ page }) => {
  // A five-figure quote is only frightening on its own. Most people have never
  // added up what the utility is going to take over the same twenty-five
  // years, and this is where they find out.
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d')
  );

  await submitWithServerPrice(page, 29_799, 34_981);

  const section = page.getByTestId('results-section');
  await expect(section).toBeVisible();

  // It sits below the line items, not above them: the price comes first and
  // this answers it.
  const order = await page.evaluate(() => {
    const items = document.querySelector('[data-testid="line-items"]')!;
    const results = document.querySelector('[data-testid="results-section"]')!;
    return items.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before';
  });
  expect(order, 'the results section is above the line items').toBe('after');

  // The chart, with both lines named in words rather than field names.
  await expect(page.getByTestId('results-chart')).toBeVisible();
  await expect(section).toContainText("What you'd pay the utility");
  await expect(section).toContainText("This system, plus what you'd still pay");
  await expect(section, 'the crossing is unlabelled').toContainText('Paid back');

  // Six x-axis labels at most, or a 390px axis turns to mush — and the first
  // and last years must be among them. Handing Recharts all twenty-five and
  // letting it thin them itself produces six labels that start at 2029, so the
  // chart no longer shows where it begins.
  const axis = await page.evaluate(() => {
    const chart = document.querySelector('[data-testid="results-chart"]')!;
    const ticks = Array.from(
      chart.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick')
    );
    return {
      labels: ticks.map((t) => (t.textContent ?? '').trim()),
      fontSizes: ticks.map((t) => {
        const text = t.querySelector('text');
        return text ? getComputedStyle(text).fontSize : '';
      }),
    };
  });

  expect(axis.labels.length, `the x-axis carries ${axis.labels.length} labels`).toBeLessThanOrEqual(6);
  expect(axis.labels.length, 'the x-axis has no labels at all').toBeGreaterThan(1);

  const thisYear = new Date().getFullYear();
  expect(axis.labels[0], 'the chart does not show the year it starts').toBe(String(thisYear));
  expect(axis.labels[axis.labels.length - 1], 'the chart does not show the year it ends').toBe(
    String(thisYear + 24)
  );

  // Readable at arm's length, which is the whole reason for thinning them.
  for (const size of axis.fontSizes) expect(size).toBe('17px');

  // The three figures, and the year-25 line.
  await expect(page.getByTestId('result-utility-total')).toBeVisible();
  await expect(page.getByTestId('result-system-total')).toBeVisible();
  // Read exactly, for the same reason as the spread line: a fragment match
  // let a duplicated unit ship.
  await expect(page.getByTestId('result-year-25')).toHaveText(
    /^In \d{4} at this rate your bill is \$[\d,]+\/month\. With this system: \$[\d,]+\/month\.$/
  );

  // The system figure is the midpoint of the range they were just shown, not a
  // fourth number.
  await expect(page.getByTestId('result-system-total')).toHaveText('$32,390');

  /*
    Payback is the whole point of the section: $240 a month against a $32,390
    system, with the cheque written on day one rather than spread across the
    horizon. Year 10 at the shipped default of 3%, which is also where the
    hand-checked example at 3.5% lands — close rates, same year.
  */
  const startYear = new Date().getFullYear();
  await expect(page.getByTestId('result-breakeven')).toHaveText(`10 (${startYear + 9})`);

  /*
    The spread figure, read exactly.

    A `toContainText` on the number alone let "$108/month a month." ship: the
    sentence said its unit twice and nothing was checking the whole of it.
  */
  await expect(page.getByTestId('result-monthly-equivalent')).toHaveText(
    'Spread over 25 years, this system works out to $108/month.'
  );

  // The chart is cumulative: the utility line has to reach six figures over
  // twenty-five years, which a monthly chart never would.
  const axisMax = await page.evaluate(() => {
    const chart = document.querySelector('[data-testid="results-chart"]')!;
    const labels = Array.from(chart.querySelectorAll('.recharts-yAxis text')).map(
      (t) => t.textContent ?? ''
    );
    return labels;
  });
  expect(
    axisMax.some((l) => /\$\d+k/.test(l)),
    `the y-axis is not showing cumulative money: ${axisMax.join(', ')}`
  ).toBe(true);

  // Nothing about credits or rebates, anywhere on the screen.
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const banned of ['tax credit', 'itc', '30%']) {
    expect(body, `the screen says "${banned}"`).not.toContain(banned);
  }
});

test('the inflation slider moves the whole comparison', async ({ page }) => {
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('b2c3d4e5-6f7a-4b8c-9d0e-1f2a3b4c5d6e')
  );

  await submitWithServerPrice(page, 29_799, 34_981);

  const slider = page.getByTestId('inflation-slider');
  await expect(slider).toBeVisible();
  await expect(page.getByTestId('inflation-value')).toHaveText('3%');

  const before = await page.getByTestId('result-utility-total').textContent();

  // Drive it from the keyboard: a Radix slider thumb responds to arrows, and
  // this is also the path somebody using a keyboard takes.
  await slider.getByRole('slider').focus();
  // 0.1 a press, from the 3% default.
  for (let i = 0; i < 35; i++) await page.keyboard.press('ArrowRight');

  await expect(page.getByTestId('inflation-value')).toHaveText('6.5%');
  await expect(page.getByTestId('result-utility-total')).not.toHaveText(before ?? '');

  // A steeper rate means the utility takes more, so the total can only rise.
  const money = (text: string | null) => Number((text ?? '').replace(/[^\d]/g, ''));
  expect(money(await page.getByTestId('result-utility-total').textContent())).toBeGreaterThan(
    money(before)
  );

  // And it is kept, so the figure the customer settled on is the one that
  // goes with the lead rather than the default. The success screen itself is
  // not restored by a reload — a filed lead comes back to the locked contact
  // form — so this reads the store rather than the screen.
  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem('gmq:v3');
    return raw ? JSON.parse(raw).state?.utilityInflationPct : null;
  });
  expect(stored, 'the chosen rate was not kept').toBe(6.5);
});

test('the rate marks are somebody else\'s published figures, one tap away', async ({ page }) => {
  // Dragging to a number invites the customer to pick whichever one they like
  // the look of. These are what the Texas utilities have actually done and
  // what the EIA says they are about to do.
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('e5f6a7b8-9c0d-4e1f-8a2b-3c4d5e6f7a81')
  );

  await submitWithServerPrice(page, 29_799, 34_981);

  // The section is lazily loaded, so wait for it before reading the DOM
  // directly — page.evaluate does not retry the way a locator does.
  await expect(page.getByTestId('inflation-marks')).toBeVisible();

  // Every mark on screen, in order, with its label.
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="inflation-mark-"]')).map((el) =>
      (el.textContent ?? '').trim()
    )
  );
  expect(labels).toEqual(['2000–25', '2015–25', "EIA '26", '2021–25']);

  /*
    No two labels may overlap.

    Three of the four rates crowd the middle of the scale, so laid out along
    the track their labels ran into each other and read as "Since 20E1A", and
    their 44px tap targets overlapped besides. The ticks still mark the rate;
    the chips are the control. Checked as rectangles rather than by eye,
    because the next rate somebody adds will be the one that collides.
  */
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="inflation-mark-"]')).map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: el.textContent };
    })
  );
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlaps =
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlaps, `"${a.text}" overlaps "${b.text}"`).toBe(false);
    }
  }

  // And each one is a target a thumb can hit.
  for (const box of boxes) {
    expect(box.bottom - box.top, `"${box.text}" is under 44px tall`).toBeGreaterThanOrEqual(44);
  }

  // The default is the ten-year average, and it reads as selected.
  await expect(page.getByTestId('inflation-value')).toHaveText('3%');
  await expect(page.getByTestId('inflation-mark-3')).toHaveAttribute('aria-pressed', 'true');

  const utilityTotal = () => page.getByTestId('result-utility-total').textContent();
  const before = await utilityTotal();

  // Tapping the EIA forecast lands on exactly 5%, not a step either side of it.
  await page.getByTestId('inflation-mark-5').click();
  await expect(page.getByTestId('inflation-value')).toHaveText('5%');
  await expect(page.getByTestId('inflation-mark-5')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('inflation-mark-3')).toHaveAttribute('aria-pressed', 'false');
  expect(await utilityTotal(), 'the chart did not move').not.toBe(before);

  // And the awkward one: 2.9 is not a multiple of a half, so a coarser step
  // would have snapped this to 3.0 and disagreed with the label just pressed.
  await page.getByTestId('inflation-mark-6.3').click();
  await expect(page.getByTestId('inflation-value')).toHaveText('6.3%');

  // The panel says where all four came from.
  await page.getByTestId('results-assumptions-toggle').click();
  const list = page.getByTestId('results-assumptions');
  await expect(list).toContainText('Texas history and EIA forecast.');
  for (const source of ['7.96¢', '11.56¢', '12.11¢', '15.47¢', 'Short-Term Energy Outlook']) {
    await expect(list, `no source for ${source}`).toContainText(source);
  }
});

test('the sun section makes its case, with or without the photograph', async ({ page }) => {
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('f6a7b8c9-0d1e-4f2a-9b3c-4d5e6f7a8b92')
  );

  await submitWithServerPrice(page, 29_799, 34_981);

  const why = page.getByTestId('why-section');
  await expect(why).toBeVisible();
  await expect(why).toContainText('Payback is one reason. Reliability is the other.');
  // Present before reading positions out of the DOM directly.
  await expect(page.getByTestId('results-assumptions-toggle')).toBeVisible();
  await expect(why).toContainText('February 2021');
  await expect(why).toContainText('4.6 billion years');

  // Between the figures and the assumptions panel.
  const order = await page.evaluate(() => {
    const figures = document.querySelector('[data-testid="result-year-25"]')!;
    const section = document.querySelector('[data-testid="why-section"]')!;
    const panel = document.querySelector('[data-testid="results-assumptions-toggle"]')!;
    const after = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return { afterFigures: after(figures, section), beforePanel: after(section, panel) };
  });
  expect(order).toEqual({ afterFigures: true, beforePanel: true });

  const facts = page.getByTestId('why-facts');
  await expect(facts).toContainText('109 Earths wide');
  await expect(facts).toContainText('1.3 million Earths fit inside');
  await expect(facts).toContainText("An hour of sunlight = a year of the world's power.");

  // The photograph, loaded lazily so it does not compete with the price.
  await why.scrollIntoViewIfNeeded();
  const image = page.getByTestId('why-image');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('loading', 'lazy');
  await expect(image).toHaveAttribute('alt', /drawn to scale/);
  await expect(page.getByTestId('why-image-fallback')).toHaveCount(0);
});

test('the sun section falls back to a drawing when the file is missing', async ({ page }) => {
  // A missing file is not a reason to lose the point of the section. The
  // fallback is to scale rather than a grey box: the ratio is the argument.
  // Aborted rather than 404'd: a refused request fires the element's error
  // event on every engine, where an empty 404 body does not on WebKit.
  await page.route('**/sun-scale.png**', (route) => route.abort());
  await page.route('**/_next/image**', (route) => route.abort());

  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('a7b8c9d0-1e2f-4a3b-8c4d-5e6f7a8b9ca3')
  );

  await submitWithServerPrice(page, 29_799, 34_981);

  // The image is lazy, so nothing is requested — and nothing can fail —
  // until it is scrolled to. WebKit is strict about this where Chromium
  // fetches early; a customer scrolls either way.
  await page.getByTestId('why-section').scrollIntoViewIfNeeded();

  await expect(page.getByTestId('why-image-fallback')).toBeVisible();
  await expect(page.getByTestId('why-image')).toHaveCount(0);
  // The words and the facts are still there, which is most of the point.
  await expect(page.getByTestId('why-section')).toContainText('February 2021');
  await expect(page.getByTestId('why-facts')).toContainText('109 Earths wide');
});

test('the assumptions are on the page, not just in our heads', async ({ page }) => {
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('c3d4e5f6-7a8b-4c9d-8e1f-2a3b4c5d6e7f')
  );

  await submitWithServerPrice(page, 29_799, 34_981);

  // Closed to begin with — the chart is the point, not the footnotes.
  await expect(page.getByTestId('results-assumptions')).toHaveCount(0);

  await page.getByTestId('results-assumptions-toggle').click();
  const list = page.getByTestId('results-assumptions');
  await expect(list).toBeVisible();

  // Every input the model was given, printed.
  await expect(list).toContainText('$240/mo');
  await expect(list).toContainText('100%');
  await expect(list).toContainText(`${RESULTS.utilityInflationPct}%`);
  await expect(list).toContainText('0.4%');
  await expect(list).toContainText('25');
  await expect(list).toContainText('$32,390');
  await expect(list, 'the no-financing assumption is unstated').toContainText('not a loan');
  await expect(list, 'the cash assumption is unstated').toContainText(
    'Assumes you pay cash. Financing changes the picture.'
  );

  await page.getByTestId('results-assumptions-toggle').click();
  await expect(page.getByTestId('results-assumptions')).toHaveCount(0);
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

/**
 * Owner QA on a real iPhone, against the 8.6 preview. Three findings, all of
 * them things a headless run had no way to see because they are about what is
 * on screen at once rather than about what the DOM contains.
 */

/**
 * How much of the screen an iOS keyboard takes on a 390x844 phone.
 *
 * The number is the point of the test: a headless browser has no keyboard, so
 * everything below the input looked free and the suggestions "passed" while
 * being invisible on the owner's phone. 336px is the iPhone 13 QuickType
 * keyboard with its prediction bar.
 */
const IOS_KEYBOARD_PX = 336;

/**
 * Budget for anything that waits out one of the bill card's deliberate holds.
 *
 * The card shows "Got it — N months found" for 1.1s before the table replaces
 * it, and a failure for 2s before the manual fields take over. Playwright's
 * generic 5s leaves under three seconds for the upload round trip on top of
 * that, which is not enough under a second concurrent suite. This is sized to
 * the delay the product actually takes, not raised to hide a race.
 */
const BILL_HOLD_TIMEOUT = 12_000;

/**
 * Put a keyboard on screen.
 *
 * iOS Safari does not resize the layout viewport — it shrinks the *visual*
 * viewport and leaves `innerHeight` alone. So that is what this simulates:
 * `visualViewport.height` drops and a resize fires, exactly the signal both
 * the sheet and the suggestion list listen for. Overriding `innerHeight` would
 * be simulating Android, and would let a layout that only reads `innerHeight`
 * pass.
 */
async function raiseKeyboard(page: Page, keyboardPx = IOS_KEYBOARD_PX) {
  await page.evaluate((kb) => {
    const vv = window.visualViewport;
    if (!vv) throw new Error('no visualViewport to shrink');
    Object.defineProperty(vv, 'height', {
      value: window.innerHeight - kb,
      configurable: true,
    });
    vv.dispatchEvent(new Event('resize'));
  }, keyboardPx);
}

/** Where the keyboard's top edge is, read the way the app reads it. */
const visualBottom = (page: Page) =>
  page.evaluate(() => {
    const vv = window.visualViewport;
    return vv ? vv.offsetTop + vv.height : window.innerHeight;
  });

test('the address suggestions clear the sheet and the keyboard', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'the bottom sheet is the phone layout');

  // Five results, which is what Mapbox actually returns. One suggestion would
  // fit almost anywhere; a full list is what has to find room.
  await page.route('**/api.mapbox.com/geocoding/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        features: [
          { id: SUGGESTION.id, place_name: SUGGESTION.place_name, center: SUGGESTION.center },
          ...Array.from({ length: 4 }, (_, i) => ({
            id: `address.other${i}`,
            place_name: `${i + 200} Main St, Fort Worth, Texas 76131, United States`,
            center: SUGGESTION.center,
          })),
        ],
      }),
    })
  );

  await page.goto('/quote');
  await waitForHydration(page);
  await waitForSheet(page);

  // Start with the sheet pulled up, which is where the owner found it: the
  // list has to make its own room rather than assume it.
  await page.getByTestId('sheet-handle').click();
  await expect(page.getByTestId('bottom-sheet')).toHaveAttribute('data-snap', 'half');

  await page.locator('#address').click();
  await page.locator('#address').fill('123 Main St');

  // Focusing the field drops the sheet back, so the gap between the input and
  // the keyboard is free for the list.
  await expect(page.getByTestId('bottom-sheet')).toHaveAttribute('data-snap', 'peek');

  const suggestion = page.getByRole('button', { name: SUGGESTION.place_name });
  await expect(suggestion).toBeVisible();

  // Now the keyboard, in the order a phone does it: field first, keys after.
  await raiseKeyboard(page);
  await waitForSheet(page);
  // And the list itself, which resizes in response to the sheet.
  await waitForStableBox(page, 'address-suggestions');

  const keyboardTop = await visualBottom(page);
  const layoutHeight = await page.evaluate(() => window.innerHeight);
  expect(keyboardTop, 'the simulated keyboard did not shrink the visual viewport').toBe(
    layoutHeight - IOS_KEYBOARD_PX
  );

  const [row, list, sheet] = await Promise.all([
    suggestion.boundingBox(),
    page.getByTestId('address-suggestions').boundingBox(),
    page.getByTestId('bottom-sheet').boundingBox(),
  ]);
  expect(row, 'the first suggestion has no box').not.toBeNull();
  expect(sheet, 'the sheet has no box').not.toBeNull();

  // Inside the VISUAL viewport, not the layout viewport. The layout viewport
  // still claims all 844px on iOS; the bottom 336 of it are under the keys.
  expect(row!.y, 'the suggestion starts above the viewport').toBeGreaterThanOrEqual(0);
  expect(
    row!.y + row!.height,
    `the suggestion is ${Math.round(row!.y + row!.height - keyboardTop)}px under the keyboard`
  ).toBeLessThanOrEqual(keyboardTop);

  // The whole list, not just its first row: a list that overflows the gap is
  // one the customer has to scroll a container they cannot see the edge of.
  expect(
    list!.y + list!.height,
    `the list runs ${Math.round(list!.y + list!.height - keyboardTop)}px under the keyboard`
  ).toBeLessThanOrEqual(keyboardTop);

  // And clear of the sheet, not merely painted over it. A rect that overlaps
  // is a rect that would be hidden the moment the stacking order changed,
  // which is exactly what happened on the phone.
  expect(
    list!.y + list!.height,
    `the list overlaps the sheet by ${Math.round(list!.y + list!.height - sheet!.y)}px`
  ).toBeLessThanOrEqual(sheet!.y);

  // Topmost at its own centre, so it is the element a thumb would hit.
  const onTop = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return !!el?.closest('[data-testid="address-suggestions"]');
  }, [row!.x + row!.width / 2, row!.y + row!.height / 2] as const);
  expect(onTop, 'something else is on top of the suggestion').toBe(true);

  // It still works: this is a list, not a picture of one.
  await suggestion.click();
  await expect(page.locator('#address')).toHaveValue(SUGGESTION.place_name);
});

/**
 * Owner QA round 2. Choosing a file changed nothing on screen until the table
 * appeared twenty seconds later, so there was no way to tell the tap had
 * registered at all.
 */
test('choosing a bill shows what is happening, start to finish', async ({ page }) => {
  // Held open, so the reading state cannot be skipped past.
  let release: (() => void) | null = null;
  const inFlight = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/bill/extract', async (route) => {
    await inFlight;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        extraction: {
          months: Array.from({ length: 12 }, (_, i) => ({
            month: `M${i + 1}`,
            kwh: 1200,
            cost: 168,
          })),
          ratePerKwh: 0.14,
          confidence: 'high',
        },
      }),
    });
  });

  await mockGeocoding(page);
  await gotoStep(page, 1);

  const card = page.getByTestId('bill-card');
  const started = Date.now();
  await page.getByTestId('bill-file-library').setInputFiles('e2e/fixtures/bill.png');

  // In the same breath as the file being chosen — the state is set in the
  // change handler, before the downscale and before the request.
  await expect(card).toBeVisible({ timeout: 200 });
  expect(
    Date.now() - started,
    'the card took too long to acknowledge the file'
  ).toBeLessThan(2000);

  // Reading: a thumbnail of their own bill, a bar that moves, and how long it
  // usually takes.
  await expect(card).toHaveAttribute('data-card-state', 'reading');
  await expect(page.getByTestId('bill-thumb')).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(card).toContainText('20 seconds');

  // The buttons are gone, not greyed: leaving them there was part of the
  // confusion.
  await expect(page.getByTestId('bill-upload')).toHaveCount(0);
  await expect(page.getByTestId('bill-upload-library')).toHaveCount(0);
  // And the table is not up yet.
  await expect(page.getByTestId('bill-review')).toHaveCount(0);

  release!();

  // What was found, said out loud, before the table replaces it.
  //
  // One assertion, not two: the card is only up for FOUND_HOLD_MS, so a
  // separate toBeVisible followed by a text check gives the hold a window to
  // expire in between — which under load it does.
  await expect(page.getByTestId('bill-found')).toContainText('12', {
    timeout: BILL_HOLD_TIMEOUT,
  });
  expect(
    await page.getByTestId('bill-review').count(),
    'the table appeared before the customer was told anything was found'
  ).toBe(0);

  await expect(page.getByTestId('bill-review')).toBeVisible({ timeout: BILL_HOLD_TIMEOUT });
  await expect(card).toHaveCount(0);
});

test('a bill that cannot be read says so before dropping to manual', async ({ page }) => {
  await page.route('**/api/bill/extract', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, reason: "Couldn't read that one. Type it in instead." }),
    })
  );

  await mockGeocoding(page);
  await gotoStep(page, 1);

  await page.getByTestId('bill-file').setInputFiles('e2e/fixtures/bill.png');

  const card = page.getByTestId('bill-card');
  await expect(card).toBeVisible({ timeout: 200 });

  // The failure is on the card, in the place the customer is already looking,
  // rather than appearing as a line under buttons that came back.
  //
  // The state attribute first: it is on the card that is already on screen, so
  // it cannot expire between two assertions the way a second look at the
  // failure line can.
  await expect(card).toHaveAttribute('data-card-state', 'failed', {
    timeout: BILL_HOLD_TIMEOUT,
  });
  await expect(page.getByTestId('bill-card-failed')).toBeVisible();

  // Then it hands over. Nothing to dismiss.
  await expect(card).toHaveCount(0, { timeout: BILL_HOLD_TIMEOUT });
  await expect(page.getByTestId('bill-failed')).toBeVisible({ timeout: BILL_HOLD_TIMEOUT });
  await expect(page.getByTestId('bill-upload')).toBeVisible();
  await expect(page.locator('#avg-bill')).toBeVisible();
});

test('a PDF shows an icon rather than a broken thumbnail', async ({ page }) => {
  await page.route('**/api/bill/extract', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        extraction: {
          months: [{ month: 'Jan 2026', kwh: 1450, cost: 203.5 }],
          ratePerKwh: 0.14,
          confidence: 'high',
        },
      }),
    })
  );

  await mockGeocoding(page);
  await gotoStep(page, 1);

  await page.getByTestId('bill-file-library').setInputFiles({
    name: 'bill.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 not a real bill, only a real content type'),
  });

  await expect(page.getByTestId('bill-pdf-icon')).toBeVisible({ timeout: BILL_HOLD_TIMEOUT });
  await expect(page.getByTestId('bill-thumb')).toHaveCount(0);

  // One month is a partial year, and the card says what happens to it rather
  // than letting the scaled figure appear unexplained.
  await expect(page.getByTestId('bill-found')).toContainText('scale it to a year', {
    timeout: BILL_HOLD_TIMEOUT,
  });
});

test('pressing the panel control takes the count, and the chip gives it back', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'the HUD is the phone overlay');

  // Sized at due south, pointing east: the state a finished rotation leaves
  // behind, before anything has re-sized it. The real gesture is covered on a
  // real map in interaction.spec.ts; this is the manual gate and the way back.
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, { ...siteCurveSeed(3), state: { ...siteCurveSeed(3).state, azimuth: 90 } });

  await mockGeocoding(page);
  await gotoStep(page, 3);
  await waitForSheet(page);

  const panels = page.getByTestId('hud-panels');
  const sizedForSouth = Number(await waitForStableText(page, 'hud-panels'));
  expect(sizedForSouth).toBeGreaterThan(0);

  // Auto to begin with: no chip, because there is nothing to return from.
  await expect(page.getByTestId('hud-auto-size')).toHaveCount(0);

  // Pressing + hands the count over, and says so.
  await page.getByTestId('panel-plus').click();
  await expect(panels).toHaveText(String(sizedForSouth + 1));
  await expect(page.getByTestId('hud-auto-size')).toBeVisible();
  await expect(page.getByTestId('auto-size')).toBeVisible();

  // And the chip gives it back, sizing for the heading the array is on now
  // rather than waiting for the next turn.
  await page.getByTestId('auto-size').click();
  await expect(page.getByTestId('hud-auto-size')).toHaveCount(0);

  const auto = Number(await panels.textContent());
  expect(
    auto,
    'auto-sizing for an easterly array did not add panels over the south count'
  ).toBeGreaterThan(sizedForSouth);

  // The hand adjustment is dropped rather than carried on top of the new count.
  await expect(panels).toHaveText(String(auto));
});

test('the HUD says which way the array faces for as long as it is off south', async ({
  page,
}) => {
  // The toast says what just changed and goes. Owner QA: on a phone it was
  // missable, and once it had gone nothing on screen explained why the count
  // was what it was. This line stays until the array is back at 180, and it is
  // on the desktop layout too — the HUD lives on the map, which both have.
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, {
    ...siteCurveSeed(3),
    // Sized for the heading it is on, which is what a finished rotation leaves
    // behind. Seeding azimuth alone leaves the south count in place and the
    // difference is honestly zero, which is a state the line handles but not
    // the one this test is about.
    state: { ...siteCurveSeed(3).state, azimuth: 120, sizedAzimuth: 120 },
  });

  await mockGeocoding(page);
  await gotoStep(page, 3);
  await waitForSheet(page);

  const line = page.getByTestId('hud-facing');
  await expect(line).toBeVisible();

  // 120 degrees is inside the southeast sector, which runs 112.5 to 157.5.
  await expect(page.getByTestId('hud-facing-point')).toHaveText('SE');

  // The delta is the same number the sheet's own count implies against the
  // south sizing, read from one frame rather than recomputed here.
  const shown = await waitForStableText(page, 'hud-facing-delta');
  expect(Number(shown), 'the line named no panel difference').toBeGreaterThan(0);
  await expect(line).toContainText('more panels than south');
});

test('the facing line clears when the array is back at south', async ({ page }) => {
  await page.addInitScript((payload) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(payload));
  }, siteCurveSeed(3));

  await mockGeocoding(page);
  await gotoStep(page, 3);
  await waitForSheet(page);

  await expect(page.getByTestId('design-hud')).toBeVisible();
  await expect(page.getByTestId('hud-facing')).toHaveCount(0);
});

test('the desktop layout is one centred column on steps with no map', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'this is the two-column layout');

  // Owner QA: the map column rendered as an empty grey band across 60% of the
  // window while the form was squeezed into a 40% strip beside it.
  await mockGeocoding(page);

  for (const step of [1, 4, 5]) {
    await gotoStep(page, step);
    await expectOnStep(page, step);

    const size = page.viewportSize()!;
    const column = (await page.getByTestId('content-column').boundingBox())!;

    // Centred, within a pixel or two of dead centre.
    const leftGap = column.x;
    const rightGap = size.width - (column.x + column.width);
    expect(
      Math.abs(leftGap - rightGap),
      `step ${step} column is off centre by ${Math.round(Math.abs(leftGap - rightGap))}px`
    ).toBeLessThanOrEqual(8);

    // A reading width, not the whole window.
    expect(column.width, `step ${step} column is wider than 720px`).toBeLessThanOrEqual(720);

    // Full height.
    expect(column.height, `step ${step} column is not full height`).toBeGreaterThanOrEqual(
      size.height - 2
    );

    // And nothing of substance to the left of it — no map container, no grey
    // band, no stray line of the step description.
    const wide = await page.evaluate((columnLeft) => {
      const out: string[] = [];
      const column = document.querySelector('[data-testid="content-column"]')!;
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        // Its own ancestors span the window by definition — they are the
        // layout, not something sitting beside the content.
        if (el.contains(column)) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        // How much of this element sits left of the content column.
        const overhang = Math.max(0, Math.min(r.right, columnLeft) - Math.max(r.left, 0));
        if (overhang > 40) {
          out.push(
            `${el.dataset.testid ?? el.tagName.toLowerCase()}: ${Math.round(overhang)}px`
          );
        }
      }
      return out;
    }, column.x);

    expect(wide, `step ${step} has elements left of the column:\n${wide.join('\n')}`).toEqual([]);
  }
});

test('the suggestions are not crushed by the side panel on a desktop', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'this is the two-column layout');

  // Above md the sheet is a static column beside the map, not an overlay under
  // the input. Reading its top edge as a ceiling capped the list at its 96px
  // floor — a five-result list in a one-result box, on the widest screen we
  // support.
  await openFunnel(page);
  await page.locator('#address').click();
  await page.locator('#address').fill('123 Main St');

  const suggestion = page.getByRole('button', { name: SUGGESTION.place_name });
  await expect(suggestion).toBeVisible();
  await waitForStableBox(page, 'address-suggestions');

  const list = (await page.getByTestId('address-suggestions').boundingBox())!;
  const maxHeight = await page
    .getByTestId('address-suggestions')
    .evaluate((el) => parseFloat(getComputedStyle(el).maxHeight));

  // Room to grow, rather than pinned to the floor.
  expect(maxHeight, 'the list is capped at its minimum on a full-size screen').toBeGreaterThan(200);

  // And still on screen.
  const viewport = page.viewportSize()!;
  expect(list.y).toBeGreaterThanOrEqual(0);
  expect(list.y + list.height).toBeLessThanOrEqual(viewport.height);

  await suggestion.click();
  await expect(page.locator('#address')).toHaveValue(SUGGESTION.place_name);
});

test('a bill can be chosen from the library, not only shot with the camera', async ({ page }) => {
  await mockGeocoding(page);
  await gotoStep(page, 1);

  // The camera door keeps `capture`, because somebody standing at their meter
  // box wants the camera and nothing else.
  await expect(page.getByTestId('bill-file')).toHaveAttribute('capture', 'environment');

  // The other door must NOT have it. On iOS `capture` replaces the picker
  // rather than hinting at it, so its presence here is the whole bug: the
  // owner could not reach a bill already saved on the phone.
  const library = page.getByTestId('bill-file-library');
  expect(
    await library.evaluate((el) => el.hasAttribute('capture')),
    'the library input has a capture attribute, which hides Photo Library and Files on iOS'
  ).toBe(false);
  await expect(library).toHaveAttribute('accept', 'image/*,application/pdf');

  // Both buttons are on screen, and the second one opens the second input.
  await expect(page.getByTestId('bill-upload')).toBeVisible();
  await expect(page.getByTestId('bill-upload-library')).toBeVisible();

  await page.route('**/api/bill/extract', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        extraction: {
          months: [{ month: 'Jan 2026', kwh: 1450, cost: 203.5 }],
          ratePerKwh: 0.14,
          confidence: 'high',
        },
      }),
    })
  );
  await library.setInputFiles('e2e/fixtures/bill.png');
  await expect(page.getByTestId('bill-review')).toBeVisible();
});

test('the design step can be finished without opening the sheet', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'the bottom sheet is the phone layout');

  await page.addInitScript(() => {
    window.localStorage.setItem(
      'gmq:v3',
      JSON.stringify({
        state: {
          currentStepIndex: 3,
          address: '123 Main St, Fort Worth, TX 76131',
          coordinates: { latitude: 32.7555, longitude: -97.3208 },
          electricalMeterPosition: [-97.3208, 32.7556],
          arrayCenter: [-97.3208, 32.7553],
          avgValue: 240,
          percentage: 100,
          totalPanels: 31,
          trenchFeet: 42,
          leadId: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
          startedAt: Date.now() - 600_000,
        },
        version: 1,
      })
    );
  });

  await mockGeocoding(page);
  await gotoStep(page, 3);
  await waitForSheet(page);

  // The sheet is where the customer finds it, untouched.
  await expect(page.getByTestId('bottom-sheet')).toHaveAttribute('data-snap', 'peek');

  const viewport = page.viewportSize()!;
  expect(viewport.width, 'this test is about a 390px screen').toBe(390);

  /** On screen means on screen: in the DOM, laid out, and inside the viewport. */
  const fullyVisible = async (testId: string) => {
    await expect(page.getByTestId(testId)).toBeVisible();
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, `${testId} has no box`).not.toBeNull();
    expect(box!.y, `${testId} is above the viewport`).toBeGreaterThanOrEqual(0);
    expect(
      box!.y + box!.height,
      `${testId} runs ${Math.round(box!.y + box!.height - viewport.height)}px below the fold`
    ).toBeLessThanOrEqual(viewport.height);
    return box!;
  };

  // The numbers, on the map — and the same numbers the sheet's own grid holds,
  // rather than a second reading of the design that could drift from it.
  const hud = await fullyVisible('design-hud');

  // The design settles after the map places the array: the seeded trench is
  // replaced by the real one. Wait for that, then read the HUD and the grid in
  // ONE evaluation. Reading them with two round trips compared a value from
  // before the change against one from after, and reported a drift that never
  // existed in any single frame.
  await expect
    .poll(async () => (await page.getByTestId('hud-trench').textContent()) ?? '', {
      timeout: 15_000,
    })
    .not.toBe('');
  let last = '';
  for (let i = 0; i < 40; i++) {
    const now = await page.getByTestId('hud-trench').textContent();
    if (now === last) break;
    last = now ?? '';
    await page.waitForTimeout(50);
  }

  const figures = await page.evaluate(() => {
    const text = (id: string) =>
      (document.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').replace(
        /[^\d.]/g,
        ''
      );
    return {
      hudPanels: text('hud-panels'),
      statPanels: text('stat-panels'),
      hudTrench: text('hud-trench'),
      statTrench: text('stat-trench'),
    };
  });

  expect(figures.hudPanels, 'the HUD and the grid disagree on the panel count').toBe(
    figures.statPanels
  );
  expect(figures.hudTrench, 'the HUD and the grid disagree on the trench').toBe(
    figures.statTrench
  );
  expect(Number(figures.hudTrench), 'no trench on the HUD to read').toBeGreaterThan(0);

  // The controls, in the peek row.
  await fullyVisible('panel-minus');
  await fullyVisible('panel-plus');
  const cta = await fullyVisible('primary-cta');

  // The HUD is anchored opposite "Find my panels", so neither is on the other.
  const find = (await page.getByTestId('find-panels').boundingBox())!;
  expect(hud.x + hud.width, 'the HUD reaches under Find my panels').toBeLessThanOrEqual(find.x);

  // And the count actually changes from the peek row, without the sheet moving.
  await page.getByTestId('panel-plus').click();
  await expect(page.getByTestId('hud-panels')).toHaveText('32');
  await expect(page.getByTestId('bottom-sheet')).toHaveAttribute('data-snap', 'peek');
  expect(cta.y, 'the button moved when the count changed').toBeGreaterThan(0);
});
