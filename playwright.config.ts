import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const DUMMY_TOKEN = 'pk.e2e-dummy-token';

/**
 * Find a real Mapbox token, if the machine has one.
 *
 * The smoke suite mocks every geocode call and needs no real token, so a clean
 * checkout stays green. The interaction suite needs actual satellite tiles and
 * a real WebGL scene, so it only runs when a genuine token is present and
 * skips with a clear message otherwise.
 */
function findMapboxToken(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (fromEnv && fromEnv !== DUMMY_TOKEN) return fromEnv;

  try {
    const envLocal = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
    const match = envLocal.match(/^NEXT_PUBLIC_MAPBOX_TOKEN\s*=\s*(.+)$/m);
    const token = match?.[1]?.trim().replace(/^["']|["']$/g, '');
    return token && token !== DUMMY_TOKEN ? token : null;
  } catch {
    return null;
  }
}

const realToken = findMapboxToken();
// Read by the interaction spec to decide whether to run or skip.
process.env.E2E_REAL_MAPBOX = realToken ? '1' : '';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // The funnel is mobile-first and customers are overwhelmingly on phones,
      // so the phone viewport is the default target, not an afterthought.
      name: 'mobile',
      testIgnore: /(interaction|mouse|screenshots|warmup)\.spec\.ts/,
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      testIgnore: /(interaction|mouse|screenshots|warmup)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // A phone-sized Chromium for touch work that needs CDP, which WebKit does
      // not expose. No Mapbox token required: these are DOM-level gestures.
      name: 'mobile-chromium',
      testMatch: /shell\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    {
      /**
       * Loads the map once, before the WebGL projects run.
       *
       * The first map in a browser pays for DNS, the TLS handshake to
       * api.mapbox.com, the lazily-imported mapbox-gl chunk and the first
       * SwiftShader context — and whichever real test goes first pays all of
       * it inside its own budget. Same launch flags as the projects that
       * depend on it, or it would warm the wrong thing.
       */
      name: 'warmup',
      testMatch: /warmup\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
    {
      // Real map gestures. Chromium because it is the only engine here that
      // gives headless WebGL via SwiftShader; WebKit headless has none, which
      // is why the drag and pinch paths went unverified until now.
      name: 'interaction',
      testMatch: /interaction\.spec\.ts/,
      /**
       * Runs last, on its own.
       *
       * This project renders a real WebGL scene through SwiftShader, which is
       * CPU rasterisation — there is no GPU doing the work. Playwright runs
       * projects concurrently, so it was sharing four workers with three other
       * browser projects, and under that load waiting for the map's first idle
       * frame missed a 30 s budget that takes 2 s when it runs alone.
       *
       * `dependencies` makes it wait for the others to finish rather than
       * compete with them. The alternative was a longer timeout, which would
       * have hidden the contention rather than removed it.
       *
       * `fullyParallel: false` on top of that, so the file's tests run one at
       * a time within the project as well — two SwiftShader contexts on one
       * machine are still two software rasterisers competing.
       */
      dependencies: ['mobile', 'desktop', 'mobile-chromium', 'warmup'],
      fullyParallel: false,
      /**
       * Two 10s readiness attempts plus classification, on a software
       * rasteriser, inside one budget. The default 30s left no room for the
       * second attempt and the failure would arrive as a bare timeout rather
       * than as the classifier's message.
       */
      timeout: 45_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
    /*
      Captures for docs/screenshots, opt-in.

      Not in the default run at all: it writes files and asserts almost
      nothing, so a plain `npx playwright test` must not rewrite the committed
      images. Playwright has no way to mark a project opt-out, so the project
      only exists when asked for:

        E2E_SCREENSHOTS=1 npx playwright test --project=screenshots
    */
    ...(process.env.E2E_SCREENSHOTS === '1'
      ? [
          {
            name: 'screenshots',
            testMatch: /screenshots\.spec\.ts/,
            use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
          },
        ]
      : []),
    {
      /**
       * The same real map, driven with a mouse.
       *
       * Everything above dispatches synthetic touch, so the pointer path a
       * desktop customer actually uses went unexercised — which is how a
       * capture-phase listener that broke mouse dragging outright survived a
       * full green suite.
       */
      name: 'desktop-map',
      testMatch: /mouse\.spec\.ts/,
      dependencies: ['interaction'],
      fullyParallel: false,
      timeout: 45_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  /**
   * A production build, not `next dev`.
   *
   * The dev server compiles a route the first time it is asked for. With four
   * workers navigating in parallel, a page could sit in on-demand compilation
   * long enough that hydration and a back-navigation missed their budgets —
   * six failures on an independent full run, every one of them green in
   * isolation. That is the dev server's scheduling, not the app's, and no
   * timeout would have fixed it honestly.
   *
   * `next build` also strips the e2e hooks, so NEXT_PUBLIC_E2E_HOOKS below
   * asks for them back. Nothing outside this file sets it; `npm run
   * verify:hooks` proves a real build has none.
   */
  webServer: {
    // Behind a build lock: two suites started within a second of each other
    // both find nothing listening and would otherwise both build into `.next`.
    // See scripts/e2e-server.mjs.
    command: `node scripts/e2e-server.mjs ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // A build, then a boot. The old 120s budget only had to cover the boot.
    timeout: 600_000,
    env: {
      // Asks for __gmTest and the upload-size attributes, which a production
      // build otherwise drops. See next.config.mjs.
      NEXT_PUBLIC_E2E_HOOKS: '1',

      /*
        The Preview-only demo parameter, on by default so ?demo=results is
        exercised by the normal run.

        Overridable, because the off state needs proving too and there is no
        build-level signal that distinguishes them — the flag inlines to a
        literal either way. `E2E_DEMO_PARAMS= npx playwright test -g "flag is
        off"` on a spare port runs the other half. See the RUNBOOK.
      */
      NEXT_PUBLIC_DEMO_PARAMS: process.env.E2E_DEMO_PARAMS ?? '1',

      // A real token when the machine has one, otherwise a dummy so the mocked
      // smoke suite still runs on a clean checkout with no secrets.
      NEXT_PUBLIC_MAPBOX_TOKEN: realToken ?? DUMMY_TOKEN,

      // No live credentials reach the server under test.
      //
      // This is not belt and braces, it is a fix: partial saves fire from the
      // design step without any spec asking them to, and the dev server loads
      // .env.local. A full e2e run wrote seventeen partial records into the
      // owner's real Airtable base before this was here. Blanking the
      // credentials makes the write impossible rather than unlikely — a spec
      // that forgets to mock /api/leads gets a 502 it already ignores.
      AIRTABLE_API_KEY: '',
      AIRTABLE_BASE_ID: '',
      RESEND_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      BLOB_READ_WRITE_TOKEN: '',
      // Same for the durable store: a test run must not spend the owner's
      // Upstash quota or leave keys in their database.
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      KV_REST_API_URL: '',
      KV_REST_API_TOKEN: '',
    },
  },
});
