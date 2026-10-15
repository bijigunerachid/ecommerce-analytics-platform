import { defineConfig, devices } from '@playwright/test';

// Runs against the full stack started with `docker compose up -d --build --wait`, through the
// web container (nginx), exactly as a browser sees it. See e2e/README.md.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // tests share one database; keep their order predictable
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Dates in the UI follow the browser locale; pin it so assertions are stable.
    locale: 'en-GB',
    timezoneId: 'UTC',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
