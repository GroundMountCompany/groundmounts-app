import { test } from '@playwright/test';
import './gmTest';

/**
 * Load the map once before any real test does.
 *
 * The first map in a browser pays for things none of the others do: DNS for
 * api.mapbox.com, the TLS handshake to it, the lazily-imported mapbox-gl
 * chunk, and the first WebGL context under SwiftShader. Whichever test goes
 * first pays all of it inside its own budget, and that test then looks flaky
 * for reasons that have nothing to do with what it asserts.
 *
 * Measured on this machine the cost is about a second, warm or cold — so this
 * is not a proven fix for the timeout seen elsewhere. It removes the variable
 * rather than guessing at it: after this, a real test that waits on mapReady
 * is waiting on the map, not on the network stack waking up.
 *
 * Deliberately assertion-free. It is not a test and must never fail a run: if
 * the warm-up cannot load the map, the tests that follow will say so with far
 * better diagnostics than this could.
 */

test.skip(process.env.E2E_REAL_MAPBOX !== '1', 'no real token, so nothing to warm');

test('warm the map', async ({ page }) => {
  try {
    await page.goto('/quote');
    await page.waitForFunction(() => typeof window.__gmTest !== 'undefined', null, {
      timeout: 20_000,
    });
    await page.waitForFunction(() => window.__gmTest.state().mapReady === true, null, {
      timeout: 20_000,
    });
  } catch {
    console.warn('[e2e] warm-up did not reach a ready map; the real tests will report why');
  }
});
