# Browser end-to-end tests

Playwright tests that drive the real app in Chromium through nginx, against the full Docker
stack: sign-in and roles, placing an order and changing its status, the invoice, live updates
between two clients, the command palette, CSV export, the API docs, and automated
accessibility checks (axe-core, WCAG 2.2 A/AA) on the main pages in both themes.

## Running

```powershell
docker compose up -d --build --wait          # the stack, on http://localhost:8080
cd e2e
npm ci
npx playwright install chromium              # once
$env:E2E_ADMIN_EMAIL = "you@example.com"     # an existing admin account
$env:E2E_ADMIN_PASSWORD = "..."
npx playwright test                          # ~1.5 minutes
npx playwright test tests/orders.spec.js     # one file
npx playwright show-report                   # after a failure: traces, screenshots
```

- The tests create their own records (products, customers, orders with an `E2E` prefix) and an
  analyst account `e2e.analyst@example.com`, so they run on any database, including your sample
  data. Run them against a development stack, not real data.
- Sessions are saved in `e2e/.auth/` and reused while valid. Sign-in is rate limited (10 attempts
  per 15 minutes per IP by default): if many runs in a row report "Too many sign-in attempts",
  wait or restart the API (`docker compose restart api`).
- Settings: `E2E_BASE_URL` (default `http://localhost:8080`), `E2E_ADMIN_EMAIL`,
  `E2E_ADMIN_PASSWORD`, `E2E_ANALYST_EMAIL`, `E2E_ANALYST_PASSWORD`.

In CI the suite runs in the "Full stack" job on a fresh stack, after the smoke test; on failure
the Playwright report (with traces) is kept as a build artifact.
