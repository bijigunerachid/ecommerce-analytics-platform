import { defineConfig, devices } from "@playwright/test";

// Runs through the web container (nginx), exactly as a browser sees it, against the separate test
// stack from `node scripts/test-stack.mjs` (http://localhost:8081), never the development stack,
// so test records stay out of your data. See e2e/README.md.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.js",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // tests share one database; keep their order predictable
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Dates in the UI follow the browser locale; pin it so assertions are stable.
    locale: "en-GB",
    timezoneId: "UTC",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
