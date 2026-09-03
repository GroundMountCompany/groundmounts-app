import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

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
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // The suite mocks every Mapbox geocode call, so the token only has to be
      // present, not valid. Hard-coding a dummy keeps a clean checkout green
      // with no secrets, and stops a real token leaking into test traffic.
      NEXT_PUBLIC_MAPBOX_TOKEN: 'pk.e2e-dummy-token',
    },
  },
});
