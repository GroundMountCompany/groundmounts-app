import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { COACH_MS } from '../src/components/map/DesignCoach';
import { COACH_SEEN_KEY } from '../src/lib/coach';

/**
 * Phase 11: the two paths into step 2, the design coach, save-and-resume, and
 * the promise that analytics can never break any of it.
 */

const SUGGESTION = {
  id: 'address.1',
  place_name: '123 Main St, Fort Worth, Texas 76131, United States',
  center: [-97.3208, 32.7555] as [number, number],
};

const LEAD_ID = 'e1f2a3b4-5c6d-4e7f-9a8b-9cadbecfd7e8';

/** The secret playwright.config.ts builds the server with. */
const E2E_RESUME_SECRET = process.env.E2E_RESUME_SECRET ?? 'e2e-resume-secret';

function signResume(leadId: string, expiresAt: number): string {
  const sig = createHmac('sha256', E2E_RESUME_SECRET)
    .update(`${leadId}.${expiresAt}`)
    .digest('hex');
  return `${expiresAt}.${sig}`;
}

async function mockGeocoding(page: Page) {
  await page.route('**/geocoding/v5/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ features: [SUGGESTION] }),
    })
  );
}

async function waitForHydration(page: Page) {
  await page.waitForSelector('[data-testid="funnel"][data-hydrated="true"]', { timeout: 30_000 });
}

/** A funnel that has an address and nothing else — nobody has answered step 2. */
const ADDRESS_ONLY_SEED = {
  state: {
    currentStepIndex: 1,
    address: '123 Main St, Fort Worth, TX 76131',
    coordinates: { latitude: 32.7555, longitude: -97.3208 },
    avgValue: 0,
    percentage: 100,
    leadId: LEAD_ID,
    startedAt: Date.now() - 600_000,
  },
  version: 1,
};

const DESIGN_SEED = (step: number) => ({
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
    azimuth: 180,
    sizedAzimuth: 180,
    trenchFeet: 42,
    productionCurve: { 90: 900, 135: 1000, 180: 1100, 225: 1000, 270: 900 },
    curveSource: 'pvwatts',
    leadId: LEAD_ID,
    startedAt: Date.now() - 600_000,
  },
  version: 1,
});

/** Seed once, not on every navigation — an unconditional write wipes progress. */
async function seed(page: Page, payload: object) {
  await page.addInitScript((p) => {
    if (window.localStorage.getItem('gmq:v3')) return;
    window.localStorage.setItem('gmq:v3', JSON.stringify(p));
  }, payload);
}

// --- A. Two equal paths into step 2 -----------------------------------------

test('step 2 offers two paths, neither of them the default', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');
  await mockGeocoding(page);
  await seed(page, ADDRESS_ONLY_SEED);
  await page.goto('/quote?step=1');
  await waitForHydration(page);

  const upload = page.getByTestId('bill-path-upload');
  const manual = page.getByTestId('bill-path-manual');

  await expect(upload).toBeVisible();
  await expect(manual).toBeVisible();
  await expect(upload).toContainText('Upload a bill');
  await expect(manual).toContainText('Type it in');
  await expect(manual).toContainText(
    'No bill handy? Your average monthly bill and your rate is all we need.'
  );

  /*
    Equal weight, measured rather than asserted about the markup.

    The regression this guards is the one owner QA found: the upload sat above
    the fields and read as the real way in. "Side by side and the same size" is
    a geometric claim, so it is checked geometrically — at 390px, where it has
    to hold.
  */
  const a = (await upload.boundingBox())!;
  const b = (await manual.boundingBox())!;
  expect(a, 'no upload card').not.toBeNull();
  expect(b, 'no manual card').not.toBeNull();

  // Same row.
  expect(Math.abs(a.y - b.y), 'the two paths are not side by side').toBeLessThanOrEqual(2);
  // Same width, within a pixel of rounding.
  expect(Math.abs(a.width - b.width), 'one path is wider than the other').toBeLessThanOrEqual(1);
  // Same height, so neither looks like the bigger offer.
  expect(Math.abs(a.height - b.height), 'one path is taller than the other').toBeLessThanOrEqual(1);
  // Both actually on a 390px screen, not one pushed off the edge.
  expect(a.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);

  // Same type weight on the title, so neither reads as the primary.
  const weights = await page.evaluate(() =>
    ['bill-path-upload', 'bill-path-manual'].map((id) => {
      const el = document.querySelector(`[data-testid="${id}"] span`)!;
      const s = getComputedStyle(el);
      return `${s.fontSize}/${s.fontWeight}`;
    })
  );
  expect(weights[0], 'the two titles are styled differently').toBe(weights[1]);

  // And nothing is chosen until the customer chooses.
  await expect(upload).toHaveAttribute('aria-pressed', 'false');
  await expect(manual).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#avg-bill')).toHaveCount(0);
  await expect(page.getByTestId('bill-upload')).toHaveCount(0);
});

test('each path opens its own half of step 2', async ({ page }) => {
  await mockGeocoding(page);
  await seed(page, ADDRESS_ONLY_SEED);
  await page.goto('/quote?step=1');
  await waitForHydration(page);

  await page.getByTestId('bill-path-manual').click();
  await expect(page.locator('#avg-bill')).toBeVisible();
  await expect(page.getByTestId('bill-upload')).toHaveCount(0);

  // And back the other way, without losing what was typed.
  await page.locator('#avg-bill').fill('275');
  await page.locator('#avg-bill').blur();
  await page.getByTestId('bill-path-upload').click();
  await expect(page.getByTestId('bill-upload')).toBeVisible();
  await expect(page.locator('#avg-bill')).toHaveCount(0);

  await page.getByTestId('bill-path-manual').click();
  await expect(page.locator('#avg-bill'), 'switching paths threw away the figure').toHaveValue(
    '275'
  );
});

test('a funnel that already has an answer is past the question', async ({ page }) => {
  // Somebody resuming or coming back through the progress bar has chosen
  // already; two empty offers would read as their work having been lost.
  await mockGeocoding(page);
  await seed(page, DESIGN_SEED(1));
  await page.goto('/quote?step=1');
  await waitForHydration(page);

  await expect(page.getByTestId('bill-path-manual')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#avg-bill')).toHaveValue('240');
});

// --- B. The design coach ----------------------------------------------------

test('the coach plays once, and goes away when touched', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');
  await mockGeocoding(page);
  await seed(page, DESIGN_SEED(3));

  await page.goto('/quote?step=3');
  await waitForHydration(page);

  const coach = page.getByTestId('design-coach');
  await expect(coach, 'no coach on a first visit').toBeVisible();
  await expect(page.getByTestId('design-coach-copy')).toHaveText(
    'Drag the panels. Turn them with the compass.'
  );

  /*
    It teaches, it never blocks.

    The overlay covers the middle of the map, which is exactly where the array
    is. If it took the pointer, the first customer to reach for the array
    during those three seconds would find it dead — which would be a worse bug
    than the one this fixes.
  */
  const events = await coach.evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(events, 'the coach is blocking the map it is pointing at').toBe('none');

  // A touch anywhere dismisses it.
  await page.mouse.click(200, 300);
  await expect(coach).toHaveCount(0);

  /*
    And it stays dismissed across a reload.

    Two assertions, because either alone is weak. The flag is checked directly
    — that is the mechanism, and an absence does not prove it was written. And
    the absence is checked after a settle, because the overlay renders from an
    effect: `toHaveCount(0)` on the frame after hydration passes even when the
    coach is about to appear, which is how an earlier version of this test
    stayed green against a build with `markCoachSeen` gutted.
  */
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), COACH_SEEN_KEY),
    'dismissing the coach did not record it'
  ).toBe('1');

  await page.reload();
  await waitForHydration(page);
  await expect(page.getByTestId('design-hud')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('design-coach'), 'the coach played twice').toHaveCount(0);
});

test('the coach gives up on its own after three seconds', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'phone layout');
  await mockGeocoding(page);
  await seed(page, DESIGN_SEED(3));
  await page.goto('/quote?step=3');
  await waitForHydration(page);

  await expect(page.getByTestId('design-coach')).toBeVisible();
  // Its own constant, so the test cannot drift from the component.
  await expect(page.getByTestId('design-coach')).toHaveCount(0, { timeout: COACH_MS + 4000 });
});

test('?reset=1 makes the coach a first-timer again', async ({ page }) => {
  await mockGeocoding(page);
  await seed(page, DESIGN_SEED(3));

  // Arrive with the flag already set, as a returning customer would.
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, '1');
  }, COACH_SEEN_KEY);

  await page.goto('/quote?step=3');
  await waitForHydration(page);
  await expect(page.getByTestId('design-hud')).toBeVisible();
  // Same reason as above: a negative assertion needs time to be wrong.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('design-coach'), 'the coach ignored its seen flag').toHaveCount(0);

  await page.goto('/quote?reset=1');
  await waitForHydration(page);
  const cleared = await page.evaluate((key) => window.localStorage.getItem(key), COACH_SEEN_KEY);
  expect(cleared, '?reset=1 left the coach flag in place').toBeNull();
});

// --- C. Save and resume -----------------------------------------------------

test('a tampered resume link is refused, and an expired one says so', async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);

  // Forged: a real shape with one character changed.
  const good = signResume(LEAD_ID, now + 3600);
  const [expiry, sig] = good.split('.');
  const tampered = `${expiry}.${sig.slice(0, -1)}${sig.endsWith('a') ? 'b' : 'a'}`;

  const forged = await page.request.get(`/api/resume?id=${LEAD_ID}&t=${tampered}`);
  expect(forged.status(), 'a tampered signature was not refused').toBe(401);

  // Signed for a different lead: the same signature, the wrong id.
  const other = await page.request.get(
    `/api/resume?id=a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d&t=${good}`
  );
  expect(other.status(), 'a token for another lead was accepted').toBe(401);

  // Extended: a real signature with a later date pasted in front of it.
  const extended = await page.request.get(
    `/api/resume?id=${LEAD_ID}&t=${now + 999_999}.${sig}`
  );
  expect(extended.status(), 'an extended expiry was accepted').toBe(401);

  // Genuinely expired: signed correctly, for a moment that has passed.
  const stale = await page.request.get(
    `/api/resume?id=${LEAD_ID}&t=${signResume(LEAD_ID, now - 60)}`
  );
  expect(stale.status(), 'an expired link was not reported as expired').toBe(410);
  expect((await stale.json()).error).toBe('expired');
});

test('a valid link with nothing behind it is a 404, not a 500', async ({ page }) => {
  // No snapshot was ever written for this id. The link checks out; there is
  // simply nothing to give back.
  const unseen = 'b2c3d4e5-6f7a-4b8c-9d1e-2f3a4b5c6d7e';
  const res = await page.request.get(
    `/api/resume?id=${unseen}&t=${signResume(unseen, Math.floor(Date.now() / 1000) + 3600)}`
  );
  expect(res.status()).toBe(404);
});

test('a resume link restores the step and the design', async ({ page }) => {
  const snapshot = {
    version: 1,
    step: 3,
    coordinates: { latitude: 32.7555, longitude: -97.3208 },
    electricalMeterPosition: [-97.3208, 32.7556],
    arrayCenter: [-97.3208, 32.7553],
    azimuth: 205,
    totalPanels: 27,
    panelAdjust: 0,
    sizingMode: 'manual',
    trenchFeet: 88,
    avgValue: 310,
    rateCentsPerKwh: 16,
    percentage: 110,
    billAnnualKwh: null,
    panelTier: 'standard',
    slopeAnswer: 'big',
    rocky: true,
    needsClearing: false,
    batteryInterest: false,
    savedAt: Date.now(),
  };

  // The server's own store is blanked for the suite, so the snapshot is
  // served from a route mock. What is under test here is the client half:
  // that a signed link hydrates the store and lands on the saved step.
  await page.route('**/api/resume**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, snapshot }),
    })
  );
  await mockGeocoding(page);

  const token = signResume(LEAD_ID, Math.floor(Date.now() / 1000) + 3600);
  await page.goto(`/quote?resume=${LEAD_ID}&t=${token}`);
  await waitForHydration(page);

  // Landed on the design step, not back at the address. The step's own
  // furniture rather than its heading: a map step opens at peek, where the
  // sheet shows the panel control in place of the title.
  await expect.poll(() => page.url(), { timeout: 20_000 }).toContain('step=3');
  await expect(page.getByTestId('find-panels')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('design-hud')).toBeVisible();
  const landedUrl = page.url();

  /*
    And the design came back, not just the step.

    Checked on the figures the customer typed rather than on the panel count:
    the count is re-derived from the offset and the bill every time the design
    step is entered, so asserting it would be asserting the sizing maths, not
    the restore. The bill and the offset are answers, and answers must survive
    exactly.
  */
  await page.goto('/quote?step=1');
  await waitForHydration(page);
  await expect(page.locator('#avg-bill'), 'the bill did not survive the link').toHaveValue('310');
  await expect(page.getByTestId('rate-kwh')).toHaveValue('16');
  await expect(page.getByTestId('offset-value')).toHaveText('110%');

  // And the signed token was not left sitting in the address bar.
  expect(landedUrl, 'the resume token stayed in the URL').not.toContain('t=');
  expect(landedUrl).not.toContain('resume=');
});

test('a refused link explains itself and starts them over', async ({ page }) => {
  await page.route('**/api/resume**', (route) =>
    route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'expired' }),
    })
  );
  await mockGeocoding(page);

  await page.goto(`/quote?resume=${LEAD_ID}&t=${signResume(LEAD_ID, 1)}`);
  await waitForHydration(page);

  await expect(page.getByTestId('resume-failed')).toContainText('That link has expired');
  // Step 1, because there is nothing to resume to.
  await expect(page.getByRole('heading', { name: 'Find your property' })).toBeVisible();
});

test('Finish later asks for one field and reports what happened', async ({ page }) => {
  await mockGeocoding(page);
  await seed(page, DESIGN_SEED(3));

  let sentBody: Record<string, unknown> | null = null;
  await page.route('**/api/leads', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body?.resumeRequest) sentBody = body;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, partial: true, resume: true, sent: true }),
    });
  });

  await page.goto('/quote?step=3');
  await waitForHydration(page);

  await page.getByTestId('finish-later').click();
  await expect(page.getByTestId('finish-later-form')).toBeVisible();

  // A bad address is caught before a round trip.
  await page.getByTestId('finish-later-email').fill('not-an-address');
  await page.getByTestId('finish-later-send').click();
  await expect(page.getByTestId('finish-later-failed')).toBeVisible();
  expect(sentBody, 'a malformed address was sent to the server').toBeNull();

  await page.getByTestId('finish-later-email').fill('someone@example.com');
  await page.getByTestId('finish-later-send').click();
  await expect(page.getByTestId('finish-later-sent')).toContainText('Check your inbox');

  const body = sentBody as unknown as Record<string, unknown>;
  expect(body, 'nothing reached the server').not.toBeNull();
  expect(body.resumeRequest).toBe(true);
  expect(body.email).toBe('someone@example.com');
  expect(body.id).toBe(LEAD_ID);

  /*
    The one PII field a partial may carry, and only this one.

    A resume request is the single exception to the rule that partials are
    anonymous, because the customer typed the address into a box that says
    what it is for. Nothing else may ride along with it.
  */
  const asText = JSON.stringify(body);
  for (const forbidden of ['name', 'phone', 'address']) {
    expect(body[forbidden], `a partial carried ${forbidden}`).toBeUndefined();
  }
  const snapshot = body.snapshot as Record<string, unknown>;
  expect(snapshot, 'no snapshot was sent').toBeTruthy();
  for (const forbidden of ['name', 'email', 'phone', 'address']) {
    expect(snapshot[forbidden], `the snapshot carried ${forbidden}`).toBeUndefined();
  }
  expect(asText).not.toContain('123 Main St');
});

test('Finish later is on the three steps in the middle and nowhere else', async ({ page }) => {
  await mockGeocoding(page);
  await seed(page, DESIGN_SEED(4));

  // Steps 3, 4 and 5 in the owner's numbering.
  for (const step of [2, 3, 4]) {
    await page.goto(`/quote?step=${step}`);
    await waitForHydration(page);
    await expect(page.getByTestId('finish-later'), `no Finish later on step ${step}`).toBeVisible();
  }

  // Not on the first two — there is no design to save yet — and not on the
  // last, where the button beside it files the lead.
  for (const step of [0, 1, 5]) {
    await page.goto(`/quote?step=${step}`);
    await waitForHydration(page);
    await expect(page.getByTestId('finish-later'), `Finish later on step ${step}`).toHaveCount(0);
  }
});

// --- D. Analytics -----------------------------------------------------------

/** The key playwright.config.ts builds the server with. */
const E2E_POSTHOG_KEY = 'phc_e2e_dummy';

/** The minimum PostHog will accept as a settled configuration. */
const FLAGS_RESPONSE = {
  featureFlags: {},
  featureFlagPayloads: {},
  errorsWhileComputingFlags: false,
  // Off in the suite: rrweb is a second external script and a lot of work per
  // frame, and no assertion here is about the replay.
  sessionRecording: false,
  supportedCompression: [],
  autocapture_opt_out: false,
  capturePerformance: false,
  analytics: { endpoint: '/i/v0/e/' },
  toolbarParams: {},
  isAuthenticated: false,
  siteApps: [],
  quotaLimited: null,
  defaultIdentifiedOnly: true,
};

/**
 * Stand in for PostHog, completely.
 *
 * The library will not flush a single event until its remote config resolves,
 * and against a local host that request 404s — which is why an earlier version
 * of these tests saw no traffic at all and looked like a broken integration.
 * Answering it is what makes the capture endpoint reachable.
 *
 * Nothing here leaves the machine: playwright.config.ts points the host at this
 * server, so every request lands on a route we own.
 */
async function stubPostHog(page: Page, onBody: (body: string) => void) {
  /*
    Look like a person, not a robot.

    posthog-js drops every event when `navigator.webdriver` is true — it treats
    automation as a bot, which is correct in production and fatal here, because
    Playwright always sets it. Without this the endpoint sees no traffic at all
    and the integration looks broken when it is working exactly as intended.

    Test setup only. Nothing in the application reads or sets this.
  */
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  });

  await page.route('**/__posthog/**', async (route) => {
    const url = route.request().url();

    if (url.includes('/config.js')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body:
          `window._POSTHOG_REMOTE_CONFIG = window._POSTHOG_REMOTE_CONFIG || {};` +
          `window._POSTHOG_REMOTE_CONFIG[${JSON.stringify(E2E_POSTHOG_KEY)}] = ` +
          `{ config: ${JSON.stringify(FLAGS_RESPONSE)}, siteApps: [] };`,
      });
      return;
    }

    // The flags call gates the first flush. An unparseable answer leaves every
    // event sitting in the library's buffer forever.
    if (url.includes('/flags')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FLAGS_RESPONSE),
      });
      return;
    }

    onBody(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
}

/** Every event name this page reported, in the order it reported them. */
async function captureAnalytics(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await stubPostHog(page, (body) => {
    for (const match of body.matchAll(/"event"\s*:\s*"([^"]+)"/g)) seen.push(match[1]);
  });
  return seen;
}

test('the expected events fire, in the order they happen', async ({ page }, testInfo) => {
  /*
    One project, on purpose.

    posthog-js filters bots, and the check matches both `navigator.webdriver`
    and a headless user agent. The mask below deals with the first; the second
    is baked into the desktop project's Chromium UA and masking it would be
    testing our ability to fool a vendor's heuristic rather than testing the
    integration. The phone is the target anyway.
  */
  test.skip(!testInfo.project.name.startsWith('mobile'), 'one project is enough');

  const events = await captureAnalytics(page);
  await mockGeocoding(page);
  await seed(page, ADDRESS_ONLY_SEED);

  await page.goto('/quote?step=1');
  await waitForHydration(page);

  await page.getByTestId('bill-path-upload').click();
  await page.getByTestId('bill-path-manual').click();

  await expect
    .poll(() => events.filter((e) => e === 'step_viewed').length, {
      message: 'no step_viewed reached PostHog',
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  await expect
    .poll(() => events.includes('bill_manual_used'), { timeout: 10_000 })
    .toBe(true);

  // Order, not just presence: the funnel report reads these as a sequence.
  const ours = events.filter((e) => e === 'step_viewed' || e === 'bill_manual_used');
  expect(ours.indexOf('step_viewed')).toBeLessThan(ours.lastIndexOf('bill_manual_used'));
});

test('every event carries the step and the lead id', async ({ page }, testInfo) => {
  /*
    One project, on purpose.

    posthog-js filters bots, and the check matches both `navigator.webdriver`
    and a headless user agent. The mask below deals with the first; the second
    is baked into the desktop project's Chromium UA and masking it would be
    testing our ability to fool a vendor's heuristic rather than testing the
    integration. The phone is the target anyway.
  */
  test.skip(!testInfo.project.name.startsWith('mobile'), 'one project is enough');

  // Without these two the drop-off report cannot be built at all: it counts
  // distinct lead ids per step.
  const bodies: string[] = [];
  await stubPostHog(page, (body) => bodies.push(body));

  await mockGeocoding(page);
  await seed(page, DESIGN_SEED(3));
  await page.goto('/quote?step=3');
  await waitForHydration(page);

  await expect.poll(() => bodies.some((b) => b.includes('step_viewed')), { timeout: 15_000 }).toBe(
    true
  );

  const withStepView = bodies.find((b) => b.includes('step_viewed'))!;
  expect(withStepView, 'no lead id on the event').toContain(LEAD_ID);
  expect(withStepView, 'no step on the event').toMatch(/"step"\s*:\s*3/);
});

test('analytics never blocks the funnel, even when its endpoint is dead', async ({ page }) => {
  /*
    The rule with teeth.

    Every analytics call is wrapped and every failure swallowed — but "wrapped"
    is a claim about code, and this is the claim about behaviour: with the
    endpoint refusing every request, the customer still gets through the step.
  */
  await page.route('**/__posthog/**', (route) => route.abort('failed'));
  await mockGeocoding(page);
  await seed(page, ADDRESS_ONLY_SEED);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/quote?step=1');
  await waitForHydration(page);
  await page.getByTestId('bill-path-manual').click();
  await page.locator('#avg-bill').fill('240');
  await page.locator('#avg-bill').blur();

  await expect(page.getByTestId('primary-cta')).toBeEnabled();
  await page.getByTestId('primary-cta').click();
  await expect(page.getByRole('heading', { name: 'Your meter' })).toBeVisible();

  expect(errors, `analytics threw into the page: ${errors.join(' | ')}`).toEqual([]);
});

/*
  The other build.

  The key is inlined at build time, so "configured" and "not configured" are
  two different bundles and no runtime switch separates them — the same
  problem, and the same answer, as the demo flag. This test only means anything
  against a server built with a blank key:

    E2E_POSTHOG_KEY= E2E_PORT=3101 npx playwright test --project=mobile -g "analytics is off"

  See the RUNBOOK. It is skipped in the ordinary run rather than silently
  passing against the wrong build.
*/
test('analytics is off when the key is blank', async ({ page }, testInfo) => {
  test.skip(
    process.env.E2E_POSTHOG_KEY !== '',
    'needs a server built with a blank NEXT_PUBLIC_POSTHOG_KEY'
  );
  test.skip(!testInfo.project.name.startsWith('mobile'), 'one project is enough');

  const analytics: string[] = [];
  const scripts: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (/posthog|__posthog/i.test(url)) analytics.push(url);
    if (url.includes('/_next/static/chunks/')) scripts.push(url);
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  });
  await mockGeocoding(page);
  await seed(page, ADDRESS_ONLY_SEED);

  await page.goto('/quote?step=1');
  await waitForHydration(page);
  await page.getByTestId('bill-path-manual').click();
  await page.locator('#avg-bill').fill('240');
  await page.locator('#avg-bill').blur();
  await expect(page.getByTestId('primary-cta')).toBeEnabled();
  await page.getByTestId('primary-cta').click();

  // The funnel still moves...
  await expect(page.getByTestId('funnel')).toBeVisible();
  await expect.poll(() => page.url()).toContain('step=2');

  // ...and nothing was sent anywhere.
  expect(analytics, `analytics fired with a blank key: ${analytics.join(', ')}`).toEqual([]);

  /*
    And the library was never even fetched.

    A dynamic import is a code split, not a conditional compile, so posthog-js
    is in the output either way — about 280KB of it. What the inlined blank key
    buys is that the chunk is never requested. Checked by looking inside what
    the page actually downloaded rather than by guessing at a filename, because
    chunk names change on every build.
  */
  const loaded = await Promise.all(
    [...new Set(scripts)].map(async (url) => ({
      url,
      body: await (await page.request.get(url)).text(),
    }))
  );
  const carryingPostHog = loaded.filter((c) => c.body.includes('_POSTHOG_REMOTE_CONFIG'));
  expect(
    carryingPostHog.map((c) => c.url),
    'the page downloaded the analytics library despite a blank key'
  ).toEqual([]);
});
