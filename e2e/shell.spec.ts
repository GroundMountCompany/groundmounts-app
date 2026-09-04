import { test, expect, type Page } from '@playwright/test';
import './gmTest';

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
    await page.goto(`/quote?step=${step}`);
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: STEP_HEADINGS[step] })
    ).toBeVisible({ timeout: 10_000 });

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
    await page.goto(`/quote?step=${step}`);
    await waitForHydration(page);

    // Confirm we are auditing the step we think we are before measuring.
    await expect(
      page.getByRole('heading', { name: STEP_HEADINGS[step] })
    ).toBeVisible({ timeout: 10_000 });

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

test('a failed email retries only the email, never re-filing the lead', async ({ page }) => {
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('retry-email-test')
  );

  let leadCalls = 0;
  let emailCalls = 0;
  await page.route('**/api/leads', (route) => {
    leadCalls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/sendEmail', (route) => {
    emailCalls++;
    // Fail the first attempt, accept the second.
    return route.fulfill({
      status: emailCalls === 1 ? 500 : 200,
      contentType: 'application/json',
      body: emailCalls === 1 ? '{"error":"boom"}' : '{"ok":true}',
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

  // Exactly one lead write, two email attempts.
  expect(leadCalls, 'the lead was filed more than once').toBe(1);
  expect(emailCalls, 'the email was not retried').toBe(2);
});

test('a failed lead write sends no email at all', async ({ page }) => {
  await page.addInitScript(
    (payload) => window.localStorage.setItem('gmq:v3', JSON.stringify(payload)),
    contactStepSeed('retry-lead-test')
  );

  let leadCalls = 0;
  let emailCalls = 0;
  await page.route('**/api/leads', (route) => {
    leadCalls++;
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
  });
  await page.route('**/api/sendEmail', (route) => {
    emailCalls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await mockGeocoding(page);
  await page.goto('/quote');
  await waitForHydration(page);

  await fillAndSubmit(page);
  await expect(page.getByText('Did not go through. Try again.')).toBeVisible();

  await page.getByTestId('submit-lead').click();
  await expect(page.getByText('Did not go through. Try again.')).toBeVisible();

  // Never promise a customer an email about a lead that was never filed.
  expect(leadCalls, 'the lead should have been retried').toBe(2);
  expect(emailCalls, 'an email was sent despite the lead failing').toBe(0);
  await expect(page.getByTestId('success-screen')).toHaveCount(0);
});

test('inputs and the button stay visible with a keyboard up', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');

  // The owner's finding: the primary button sat at the top of the sheet
  // content, covering the fields, so with the keyboard up you had to scroll
  // around hunting for the inputs.
  const KEYBOARD_PX = 300;
  await page.setViewportSize({ width: 390, height: 844 - KEYBOARD_PX });

  await page.addInitScript(() => {
    const pending = window.sessionStorage.getItem('e2e:seed');
    if (pending) window.localStorage.setItem('gmq:v3', pending);
  });

  const seed = JSON.stringify({
    state: {
      currentStepIndex: 1,
      address: '123 Main St, Fort Worth, TX 76131',
      coordinates: { latitude: 32.7555, longitude: -97.3208 },
      electricalMeterPosition: [-97.3208, 32.7556],
      arrayCenter: [-97.3208, 32.7553],
      avgValue: 240,
      percentage: 100,
      totalPanels: 31,
      trenchFeet: 42,
      leadId: 'keyboard-test',
      startedAt: Date.now() - 600_000,
    },
    version: 1,
  });

  await mockGeocoding(page);
  await page.goto('/quote');
  await page.evaluate((v) => window.sessionStorage.setItem('e2e:seed', v), seed);

  const visibleInViewport = async (selector: string) => {
    const box = await page.locator(selector).boundingBox();
    const size = page.viewportSize()!;
    if (!box) return false;
    return box.y >= 0 && box.y + box.height <= size.height;
  };

  // Step 2: both bill fields and the button, without scrolling.
  await page.goto('/quote?step=1');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Your power use' })).toBeVisible();

  expect(await visibleInViewport('#avg-bill'), 'bill field hidden').toBe(true);
  expect(await visibleInViewport('#rate-kwh'), 'rate field hidden').toBe(true);
  expect(await visibleInViewport('[data-testid="primary-cta"]'), 'button hidden').toBe(true);

  // Step 6: the three contact fields and the submit button.
  await page.goto('/quote?step=5');
  await waitForHydration(page);
  await expect(page.getByRole('heading', { name: 'Get your number' })).toBeVisible();

  for (const field of ['#name', '#email', '#phone']) {
    // The contact fields scroll within the sheet, so bring each into view the
    // way focusing it does, then check it cleared the keyboard.
    await page.locator(field).scrollIntoViewIfNeeded();
    expect(await visibleInViewport(field), `${field} hidden`).toBe(true);
  }
  expect(await visibleInViewport('[data-testid="submit-lead"]'), 'submit hidden').toBe(true);
});

test('no stray text renders outside the sheet on a map-less step', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');

  // The owner saw a ghost line of the step description above the sheet's top
  // edge: the map column was rendering its own copy of the intro into the blank
  // band left by a half-height sheet.
  await mockGeocoding(page);
  await page.goto('/quote?step=1');
  await waitForHydration(page);

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
    await page.goto(`/quote?step=${step}`);
    await waitForHydration(page);

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

  await page.route('**/api/leads', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  );
  await page.route('**/api/sendEmail', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
  );

  await mockGeocoding(page);
  await page.goto('/quote');
  await page.evaluate(
    (v) => window.sessionStorage.setItem('e2e:seed', v),
    JSON.stringify(contactStepSeed('restore-test'))
  );
  await page.goto('/quote?step=5');
  await waitForHydration(page);
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
