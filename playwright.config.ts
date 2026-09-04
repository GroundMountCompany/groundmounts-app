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
      testIgnore: /interaction\.spec\.ts/,
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      testIgnore: /interaction\.spec\.ts/,
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
      // Real map gestures. Chromium because it is the only engine here that
      // gives headless WebGL via SwiftShader; WebKit headless has none, which
      // is why the drag and pinch paths went unverified until now.
      name: 'interaction',
      testMatch: /interaction\.spec\.ts/,
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
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
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
