import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

// A low limit keeps the "too large" case cheap; 1,205 rows still spans two pages of 1,000.
const ctx = createTestContext({ exportMaxRows: 1500 });
afterAll(() => ctx.close());

let admin;
let analyst;
let customer;
let product;

beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'admin@example.test', role: 'admin' });
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  admin = await ctx.loginAs('admin@example.test');
  analyst = await ctx.loginAs('analyst@example.test');
  customer = await ctx.seedCustomer();
  product = await ctx.seedProduct({ sku: 'SKU-1', name: 'Desk Lamp', price: '25.50', stock: 50 });
});

/** Parses our CSV (CRLF rows; quoted cells may contain the delimiter). */
function parse(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += ch;
  }
  return rows;
}

const download = (agent, path) =>
  agent
    .get(path)
    .buffer(true)
    .parse((res, cb) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => cb(null, data));
    });

function placeOrder() {
  return admin
    .post('/api/orders')
    .set('Idempotency-Key', randomUUID())
    .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 2 }] })
    .expect(201);
}

describe('CSV exports', () => {
  it('exports orders with the list filters, as an attachment', async () => {
    const kept = (await placeOrder()).body.order;
    const cancelled = (await placeOrder()).body.order;
    await admin.patch(`/api/orders/${cancelled.id}/status`).send({ status: 'cancelled' });

    const res = await download(analyst, '/api/exports/orders.csv?status=pending').expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="orders-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    const rows = parse(res.body);
    expect(rows[0]).toEqual([
      'Order',
      'Placed at (UTC)',
      'Status',
      'Customer ID',
      'Customer',
      'Customer email',
      'Lines',
      'Total',
      'Last updated (UTC)',
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual([
      String(kept.id),
      kept.createdAt,
      'pending',
      String(customer.id),
      'Jane Doe',
      expect.any(String),
      '1',
      '51.00',
      expect.any(String),
    ]);
  });

  it('writes Excel-friendly files with a byte order mark and semicolons', async () => {
    const res = await download(admin, '/api/exports/products.csv?format=excel').expect(200);
    expect(res.body.charCodeAt(0)).toBe(0xfeff);
    const rows = parse(res.body.slice(1), ';');
    expect(rows[0].slice(0, 3)).toEqual(['Product ID', 'SKU', 'Name']);
    expect(rows[1]).toEqual(expect.arrayContaining(['SKU-1', 'Desk Lamp', '25.50', 'true']));
  });

  it('neutralizes spreadsheet formulas in text but keeps negative numbers', async () => {
    await ctx.db.query(`UPDATE customers SET first_name = '=HYPERLINK("http://x","y")'`);
    await admin
      .post('/api/inventory/adjustments')
      .set('Idempotency-Key', randomUUID())
      .send({ productId: product.id, quantityChange: -3, reason: 'adjustment', note: '+1 broke' })
      .expect(201);

    const customers = parse((await download(admin, '/api/exports/customers.csv')).body);
    expect(customers[1][1]).toBe(`'=HYPERLINK("http://x","y")`);

    const movements = parse((await download(admin, '/api/exports/inventory-movements.csv')).body);
    const change = movements[0].indexOf('Change');
    const note = movements[0].indexOf('Note');
    expect(movements[1][change]).toBe('-3');
    expect(movements[1][note]).toBe("'+1 broke");
  });

  it('streams every page of a large export', async () => {
    await ctx.db.query(
      `INSERT INTO products (sku, name, category_id, price, stock_quantity)
       SELECT 'BULK-' || g, 'Bulk ' || g, (SELECT category_id FROM products LIMIT 1), 1, 1
       FROM generate_series(1, 1204) g`,
    );
    const rows = parse((await download(admin, '/api/exports/products.csv')).body);
    expect(rows).toHaveLength(1 + 1205);
    expect(new Set(rows.slice(1).map((r) => r[0])).size).toBe(1205);
  });

  it('refuses exports over the row limit before sending anything', async () => {
    await ctx.db.query(
      `INSERT INTO products (sku, name, category_id, price, stock_quantity)
       SELECT 'BULK-' || g, 'Bulk ' || g, (SELECT category_id FROM products LIMIT 1), 1, 1
       FROM generate_series(1, 1500) g`,
    );
    const res = await admin.get('/api/exports/products.csv').expect(400);
    expect(res.body.error.code).toBe('EXPORT_TOO_LARGE');
    await admin.get('/api/exports/products.csv?search=Bulk%2015').expect(200);
  });

  it('exports daily sales and top products for a date range', async () => {
    await ctx.db.query(
      `INSERT INTO analytics_sales_hourly
         (bucket_start, orders_count, gross_revenue, items_sold, cancelled_orders, cancelled_revenue)
       VALUES ('2026-03-02T10:00:00Z', 3, 300.00, 5, 1, 100.00)`,
    );
    const rows = parse(
      (await download(admin, '/api/exports/sales-daily.csv?from=2026-03-01&to=2026-03-03')).body,
    );
    expect(rows.map((r) => r[0])).toEqual(['Day (UTC)', '2026-03-01', '2026-03-02', '2026-03-03']);
    const net = rows[0].indexOf('Net revenue');
    expect(rows[2][net]).toBe('200.00');

    const top = await download(
      admin,
      '/api/exports/top-products.csv?from=2026-03-01&to=2026-03-03',
    );
    expect(parse(top.body)[0][0]).toBe('Rank');
  });

  it('records each export in the audit log', async () => {
    await placeOrder();
    await download(analyst, '/api/exports/orders.csv?format=excel').expect(200);
    const { rows } = await ctx.db.query(
      `SELECT actor_email, summary, details FROM audit_log WHERE action = 'export.downloaded'`,
    );
    expect(rows).toEqual([
      {
        actor_email: 'analyst@example.test',
        summary: 'Exported 1 orders (Excel)',
        details: { export: 'orders', format: 'excel', rows: 1, filters: { format: 'excel' } },
      },
    ]);
  });

  it('checks access, the export name, the format, and the filters', async () => {
    await analyst.get('/api/exports/audit-log.csv').expect(403);
    await admin.get('/api/exports/audit-log.csv').expect(200);
    await admin.get('/api/exports/passwords.csv').expect(404);
    await admin.get('/api/exports/__proto__.csv').expect(404);
    await admin.get('/api/exports/orders.csv?format=xlsx').expect(400);
    await admin.get('/api/exports/orders.csv?status=lost').expect(400);
    await admin.get('/api/exports/sales-daily.csv?from=2025-01-01&to=2026-12-31').expect(400);
    const { default: request } = await import('supertest');
    await request(ctx.app).get('/api/exports/orders.csv').expect(401);
  });
});
