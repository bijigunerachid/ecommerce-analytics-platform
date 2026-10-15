# Browser end-to-end tests

Playwright tests that drive the real app in Chromium through nginx, against the full Docker
stack: sign-in and roles, placing an order and changing its status, the invoice, live updates
between two clients, the command palette, CSV export, the API docs, and automated
accessibility checks (axe-core, WCAG 2.2 A/AA) on the main pages in both themes.

## Running

The tests run against a separate, throwaway copy of the stack (Compose project `ecommerce-e2e`,
web app on http://localhost:8081), never your development stack, so the records they create
(`E2E` products, customers, and orders) never reach your data. It runs next to the development
stack, with its own containers, volumes, and image tags, and reads the same `.env`.

```powershell
cd e2e; npm ci; npx playwright install chromium; cd ..   # once

node scripts/test-stack.mjs            # start the test stack, smoke test, e2e tests, remove it
node scripts/test-stack.mjs --keep     # same, but keep the stack to rerun or debug
```

With the stack kept:

```powershell
node scripts/test-stack.mjs e2e                        # all browser tests (~1.5 minutes)
node scripts/test-stack.mjs e2e tests/orders.spec.js   # one file
node scripts/test-stack.mjs smoke                      # the smoke test
node scripts/test-stack.mjs logs                       # recent API, relay, and web logs
node scripts/test-stack.mjs down                       # remove the stack and its volumes
cd e2e; npx playwright show-report                     # after a failure: traces, screenshots
```

- The script creates a throwaway admin (`ci.admin@example.com`) in the test stack; the tests
  create an analyst `e2e.analyst@example.com` there too. If a run fails, the stack is kept so
  you can look at it.
- Spark is not started (the tests do not need it); add `--spark` to start it too.
- Ports: web `E2E_WEB_PORT` (8081); PostgreSQL 55432, Kafka 59092, and the Spark UI 54040 on
  localhost (`E2E_POSTGRES_PORT`, `E2E_KAFKA_PORT`, `E2E_SPARK_UI_PORT`).
- To run against another stack, set `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, and
  `E2E_ADMIN_PASSWORD` and run `npx playwright test` in `e2e/`. Only point it at a stack
  whose data you can throw away.
- Sessions are saved in `e2e/.auth/` and reused while valid.

In CI the "Full stack" job runs the same script on a fresh runner; on failure the Playwright
report (with traces) is kept as a build artifact.
