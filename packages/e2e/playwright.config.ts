import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for Magenta IDE E2E tests.
 *
 * Notes:
 * - Electron launches are heavy and the daemon takes up to 15s to become
 *   ready, so we run a single worker and give each test 60s.
 * - Tests drive the real packaged main + daemon + renderer via Playwright's
 *   `_electron` API (see tests/fixtures.ts).
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
