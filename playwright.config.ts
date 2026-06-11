import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for TallerFlow.
 *
 * Test structure:
 *   tests/e2e/          — test files (*.spec.ts)
 *   tests/e2e/fixtures/ — shared fixtures and helpers
 *   tests/e2e/auth.setup.ts — authentication state setup
 *
 * Run tests:
 *   npx playwright test            — all tests
 *   npx playwright test --ui       — interactive UI mode
 *   npx playwright test login      — specific file
 *   npx playwright show-report     — open HTML report
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",

  // ── Execution ──────────────────────────────────────────────────────────────
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,

  // ── Timeouts ───────────────────────────────────────────────────────────────
  timeout: 30_000, // per-test timeout
  expect: { timeout: 8_000 }, // assertion timeout

  // ── Reporting ──────────────────────────────────────────────────────────────
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],

  // ── Global test options ────────────────────────────────────────────────────
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Accept self-signed certs in dev
    ignoreHTTPSErrors: true,
    // Locale and timezone consistent with Chilean users
    locale: "es-CL",
    timezoneId: "America/Santiago",
  },

  // ── Browser projects ───────────────────────────────────────────────────────
  projects: [
    // ── Auth setup (runs first, saves session state) ────────────────────────
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },

    // ── Chromium ────────────────────────────────────────────────────────────
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Reuse session from auth setup for authenticated tests
        storageState: "tests/e2e/fixtures/.auth/admin.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },

    // ── Firefox ─────────────────────────────────────────────────────────────
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        storageState: "tests/e2e/fixtures/.auth/admin.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },

    // ── Unauthenticated tests (login page, PIN screen) ───────────────────────
    // These intentionally run WITHOUT saved auth state
    {
      name: "chromium-unauth",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\.(login|pin|auth)\.spec\.ts/,
    },
  ],

  // ── Dev server ─────────────────────────────────────────────────────────────
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stderr: "pipe",
  },

  // ── Output ─────────────────────────────────────────────────────────────────
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/snapshots/{testFilePath}/{arg}{ext}",
});
