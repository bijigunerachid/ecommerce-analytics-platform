// End-to-end smoke test of a running stack, through the web server (nginx) like a browser.
//
// Usage (Node 22+, no dependencies):
//   $env:SMOKE_ADMIN_EMAIL = 'admin@example.com'; $env:SMOKE_ADMIN_PASSWORD = '...'
//   node scripts/smoke-test.mjs [baseUrl]        # default http://localhost:8080
//
// It creates a small amount of uniquely named data (a category, product, customer, order) and
// checks: web server and API health, security headers, SPA routing, sign-in, server-side order
// pricing, idempotent order retries, stock decrement, and that the outbox relay published the
// resulting events to Kafka. Exits with code 1 on the first failure.

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const RUN = Date.now().toString(36);
let cookie = '';
let step = 0;

function check(condition, message, detail) {
  if (!condition) {
    console.error(`\n✗ ${message}${detail === undefined ? '' : `\n  ${JSON.stringify(detail)}`}`);
    process.exit(1);
  }
}

async function request(method, path, { body, headers = {}, raw = false } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(cookie && { Cookie: cookie }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  if (raw) return response;
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, headers: response.headers, data };
}

async function run(name, fn) {
  step += 1;
  process.stdout.write(`${String(step).padStart(2)}. ${name} … `);
  const started = Date.now();
  await fn();
  console.log(`ok (${Date.now() - started} ms)`);
}

check(EMAIL && PASSWORD, 'Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to an admin account');
console.log(`Smoke test against ${BASE} (run ${RUN})\n`);

await run('web server is healthy', async () => {
  const res = await request('GET', '/healthz');
  check(res.status === 200, 'GET /healthz should return 200', res.status);
});

await run('API and database are healthy', async () => {
  const res = await request('GET', '/api/health');
  check(res.status === 200 && res.data?.checks?.database === 'up', 'GET /api/health', res.data);
});

await run('app shell is served with security headers', async () => {
  const res = await request('GET', '/', { raw: true });
  const html = await res.text();
  check(res.status === 200 && html.includes('<div id="root">'), 'GET / should return the app');
  const csp = res.headers.get('content-security-policy') ?? '';
  check(csp.includes("script-src 'self'") && !csp.includes("'unsafe-eval'"), 'CSP header', csp);
  check(res.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options');
});

await run('client-side routes work on reload (SPA fallback)', async () => {
  const res = await request('GET', '/orders/123', { raw: true });
  check(res.status === 200 && (await res.text()).includes('<div id="root">'), 'GET /orders/123');
});

await run('protected API rejects anonymous requests', async () => {
  const res = await request('GET', '/api/orders');
  check(res.status === 401, 'GET /api/orders without a session should be 401', res.status);
});

await run('admin signs in (HttpOnly session cookie)', async () => {
  const res = await request('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  check(res.status === 200 && res.data?.user?.role === 'admin', 'login', res.data);
  check(/httponly/i.test(res.headers.get('set-cookie') ?? ''), 'session cookie must be HttpOnly');
});

let product;
let customer;
await run('creates a category, product (with stock) and customer', async () => {
  const category = await request('POST', '/api/categories', { body: { name: `Smoke ${RUN}` } });
  check(category.status === 201, 'create category', category.data);
  const p = await request('POST', '/api/products', {
    body: { sku: `SMOKE-${RUN}`.toUpperCase(), name: `Smoke product ${RUN}`, categoryId: category.data.category.id, price: '12.50', initialStock: 10 },
  });
  check(p.status === 201 && p.data.product.stockQuantity === 10, 'create product', p.data);
  product = p.data.product;
  const c = await request('POST', '/api/customers', {
    body: { email: `smoke.${RUN}@example.com`, firstName: 'Smoke', lastName: `Test ${RUN}` },
  });
  check(c.status === 201, 'create customer', c.data);
  customer = c.data.customer;
});

let order;
const key = crypto.randomUUID();
await run('places an order with server-side pricing', async () => {
  const res = await request('POST', '/api/orders', {
    body: { customerId: customer.id, items: [{ productId: product.id, quantity: 3 }] },
    headers: { 'Idempotency-Key': key },
  });
  check(res.status === 201 && res.data.order.totalAmount === '37.50', 'create order (3 × 12.50)', res.data);
  order = res.data.order;
});

await run('a retried order returns the original, not a duplicate', async () => {
  const res = await request('POST', '/api/orders', {
    body: { customerId: customer.id, items: [{ productId: product.id, quantity: 3 }] },
    headers: { 'Idempotency-Key': key },
  });
  check(res.status === 200 && res.headers.get('idempotent-replayed') === 'true', 'replay', res.status);
  check(res.data.order.id === order.id, 'replay must return the same order', res.data.order.id);
  const p = await request('GET', `/api/products/${product.id}`);
  check(p.data.product.stockQuantity === 7, 'stock must be deducted exactly once', p.data.product);
});

await run('overselling is rejected', async () => {
  const res = await request('POST', '/api/orders', {
    body: { customerId: customer.id, items: [{ productId: product.id, quantity: 8 }] },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  check(res.status === 409 && res.data.error.code === 'INSUFFICIENT_STOCK', 'oversell', res.data);
});

await run('the outbox relay publishes the events to Kafka', async () => {
  const deadline = Date.now() + 60_000;
  let health;
  while (Date.now() < deadline) {
    health = (await request('GET', '/api/pipeline/health')).data;
    const relay = health?.components?.find((c) => c.component === 'outbox-relay');
    if (health?.outbox?.pending === 0 && relay?.status === 'up') return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  check(false, 'events still pending after 60 s (is the relay running and Kafka reachable?)', health);
});

await run('signs out', async () => {
  const res = await request('POST', '/api/auth/logout');
  check(res.status === 204, 'logout', res.status);
  cookie = '';
  const me = await request('GET', '/api/auth/me');
  check(me.status === 401, 'session must be gone after logout', me.status);
});

console.log(`\nAll ${step} smoke checks passed. Order #${order.id} was created for this run.`);
