// Synthetic history generator for demos and dashboard development.
//
// Produces a realistic, reproducible (seeded) e-commerce history and writes it exactly the way
// the application would: orders, order items, stock ledger, and business events in the outbox.
// Running the outbox relay and the Spark job afterwards turns it into dashboard analytics.
//
// Realism: growth over the period, weekly seasonality (busier weekends), daily traffic curve,
// long-tail product popularity, returning customers, order lifecycles (paid → shipped →
// delivered), ~6% cancellations, weekly supplier restocks, and a few planted anomalies.
//
// Consistency: everything that happens is first planned on one timeline, sorted by time, then
// applied in that order. Stock levels, ledger entries, and event timestamps therefore agree at
// every point in time (stock never goes negative; stockAfter in events is exact).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { withTransaction } from '../db/transaction.js';
import {
  orderCreated,
  orderStatusChanged,
  stockMovementRecorded,
} from '../events/business-events.js';
import { fromCents, toCents } from '../utils/money.js';

// SAMPLE_CATALOG_PATH lets the Docker image point at its own copy of the catalog.
export const CATALOG_PATH =
  process.env.SAMPLE_CATALOG_PATH ||
  path.resolve(import.meta.dirname, '../../../data/samples/catalog.json');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Relative order volume by hour of day (UTC) and by weekday (Sunday first).
const HOURLY_TRAFFIC = [
  1, 0.5, 0.3, 0.2, 0.2, 0.4, 1, 2, 3.5, 4.5, 5, 5.5, 6.5, 6.5, 5.5, 5, 5, 5.5, 6.5, 7.5, 8, 7, 5,
  2.5,
];
const WEEKDAY_FACTOR = [1.25, 0.9, 0.92, 0.97, 1.0, 1.1, 1.3];

export function loadCatalog(file = CATALOG_PATH) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Small, fast, seedable PRNG (mulberry32) so the same seed always yields the same data. */
export function createRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rnd = {
    next,
    between: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted(items, weightOf) {
      const total = items.reduce((s, i) => s + weightOf(i), 0);
      let r = next() * total;
      for (const item of items) {
        r -= weightOf(item);
        if (r <= 0) return item;
      }
      return items[items.length - 1];
    },
  };
  return rnd;
}

function slug(text) {
  return text
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();
}

/** Builds the full timeline of things that happen, without touching the database. */
function planTimeline({ rnd, catalog, days, ordersPerDay, start, now }) {
  const timeline = [];
  let seq = 0;
  const add = (at, item) => {
    if (at <= now) timeline.push({ ...item, at, seq: seq++ });
  };
  const products = catalog.categories.flatMap((c) => c.products);
  const customers = [];
  let orderNo = 0;

  const newCustomer = () => {
    const first = rnd.pick(catalog.firstNames);
    const last = rnd.pick(catalog.lastNames);
    const customer = {
      index: customers.length,
      firstName: first,
      lastName: last,
      email: `${slug(first)}.${slug(last)}.${customers.length + 1}@example.com`,
      ...rnd.pick(catalog.locations),
      orders: 0,
    };
    customers.push(customer);
    return customer;
  };

  const chooseCustomer = () => {
    if (customers.length === 0 || rnd.chance(0.3)) return newCustomer();
    // Customers who bought before are more likely to buy again.
    return rnd.weighted(customers, (c) => 1 + c.orders * 2);
  };

  const chooseItems = () => {
    const lineCount = rnd.weighted([1, 2, 3], (n) => ({ 1: 60, 2: 28, 3: 12 })[n]);
    const chosen = new Set();
    while (chosen.size < lineCount) chosen.add(rnd.weighted(products, (p) => p.popularity));
    return [...chosen].map((p) => ({
      sku: p.sku,
      quantity: rnd.weighted([1, 2, 3], (q) => ({ 1: 75, 2: 18, 3: 7 })[q]),
    }));
  };

  const planOrder = (at, customer, items) => {
    customer.orders += 1;
    const ref = orderNo++;
    add(at, { kind: 'order', ref, customer, items });

    if (rnd.chance(0.06)) {
      const cancelAt = at + rnd.between(30 * MINUTE, 20 * HOUR);
      if (rnd.chance(0.4))
        add(at + rnd.between(5 * MINUTE, 25 * MINUTE), { kind: 'status', ref, status: 'paid' });
      add(cancelAt, { kind: 'status', ref, status: 'cancelled' });
      return;
    }
    const paidAt = at + rnd.between(5 * MINUTE, 90 * MINUTE);
    const shippedAt = paidAt + rnd.between(12 * HOUR, 48 * HOUR);
    const deliveredAt = shippedAt + rnd.between(24 * HOUR, 96 * HOUR);
    add(paidAt, { kind: 'status', ref, status: 'paid' });
    add(shippedAt, { kind: 'status', ref, status: 'shipped' });
    add(deliveredAt, { kind: 'status', ref, status: 'delivered' });
  };

  // Initial stock, one day before the history starts.
  for (const p of products) {
    add(start - DAY, {
      kind: 'restock',
      sku: p.sku,
      quantity: p.initialStock,
      note: 'Initial stock',
    });
  }

  for (let d = 0; d < days; d++) {
    const dayStart = start + d * DAY;
    const growth = 0.75 + 0.5 * (d / Math.max(days - 1, 1));
    const weekday = WEEKDAY_FACTOR[new Date(dayStart).getUTCDay()];
    const count = Math.round(ordersPerDay * growth * weekday * rnd.between(0.85, 1.15));

    const times = Array.from({ length: count }, () => {
      const hour = rnd.weighted([...HOURLY_TRAFFIC.keys()], (h) => HOURLY_TRAFFIC[h]);
      return dayStart + hour * HOUR + rnd.between(0, HOUR);
    }).sort((a, b) => a - b);
    for (const at of times) planOrder(at, chooseCustomer(), chooseItems());

    // Weekly supplier delivery (Mondays 08:00): top up products running low.
    if (new Date(dayStart).getUTCDay() === 1) add(dayStart + 8 * HOUR, { kind: 'replenish' });
  }

  // Planted anomalies for the detection rules (see docs/analytics.md).
  if (days >= 7) {
    const burstCustomer = newCustomer();
    const burstStart = start + (days - 3) * DAY + 14 * HOUR;
    for (let i = 0; i < 6; i++) {
      planOrder(burstStart + i * 90_000, burstCustomer, [{ sku: 'FSH-TSHIRT', quantity: 1 }]);
    }
    const expensive = [...products].sort((a, b) => toCents(b.price) - toCents(a.price))[0];
    planOrder(start + (days - 5) * DAY + 11 * HOUR + 20 * MINUTE, newCustomer(), [
      { sku: expensive.sku, quantity: 25 },
    ]);
    add(start + (days - 2) * DAY + 16 * HOUR + 45 * MINUTE, {
      kind: 'adjustment',
      sku: 'HOM-MUGS-4',
      share: 0.6,
      note: 'Inventory count: damaged in warehouse',
    });
  }

  timeline.sort((a, b) => a.at - b.at || a.seq - b.seq);
  return { timeline, customers };
}

/**
 * Writes a generated history into an EMPTY database (no products yet), in one transaction.
 * @param {import('pg').Pool} db
 * @param {{ days?: number, ordersPerDay?: number, seed?: number, now?: Date,
 *           catalog?: object, log?: (msg: string) => void }} [options]
 */
export async function generateSampleData(
  db,
  {
    days = 90,
    ordersPerDay = 60,
    seed = 42,
    now = new Date(),
    catalog = loadCatalog(),
    log = () => {},
  } = {},
) {
  const rnd = createRandom(seed);
  const nowMs = now.getTime();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - days * DAY;
  const { timeline } = planTimeline({ rnd, catalog, days, ordersPerDay, start, now: nowMs });

  const stats = {
    orders: 0,
    cancelled: 0,
    customers: 0,
    restocks: 0,
    adjustments: 0,
    events: 0,
    grossCents: 0,
  };

  await withTransaction(db, async (client) => {
    const { rows: existing } = await client.query('SELECT count(*)::int AS n FROM products');
    if (existing[0].n > 0) {
      throw new Error(
        'The database already has products. The generator only runs on an empty database ' +
          '(reset it with "docker compose down -v", or use --test for the test database).',
      );
    }
    // Historical timestamps: keep updated_at as generated instead of "now".
    await client.query('ALTER TABLE orders DISABLE TRIGGER orders_set_updated_at');
    await client.query('ALTER TABLE products DISABLE TRIGGER products_set_updated_at');
    // A bulk load of history is not news: no stock notifications or live events for it.
    await client.query('ALTER TABLE products DISABLE TRIGGER products_stock_level_notify');
    await client.query('ALTER TABLE event_outbox DISABLE TRIGGER event_outbox_publish');

    const q = (sql, params) => client.query(sql, params);
    const at = (ms) => new Date(ms);

    async function outbox(event, ms) {
      await q(
        `INSERT INTO event_outbox (event_type, aggregate_type, aggregate_id, payload, occurred_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.eventType, event.aggregateType, event.aggregateId, event.payload, at(ms)],
      );
      stats.events += 1;
    }

    // Catalog
    const products = new Map(); // sku → { id, categoryId, price, stock, reorderLevel, initialStock }
    const setupTime = at(start - 2 * DAY);
    for (const category of catalog.categories) {
      const { rows } = await q(
        'INSERT INTO categories (name, description, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING id',
        [category.name, category.description, setupTime],
      );
      for (const p of category.products) {
        const { rows: inserted } = await q(
          `INSERT INTO products (sku, name, category_id, price, reorder_level, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
          [p.sku, p.name, rows[0].id, p.price, p.reorderLevel, setupTime],
        );
        products.set(p.sku, {
          id: Number(inserted[0].id),
          categoryId: Number(rows[0].id),
          sku: p.sku,
          price: p.price,
          stock: 0,
          reorderLevel: p.reorderLevel,
          initialStock: p.initialStock,
        });
      }
    }

    async function moveStock(product, change, reason, ms, { orderId = null, note = null, key }) {
      const { rows } = await q(
        `INSERT INTO stock_movements
           (product_id, quantity_change, reason, order_id, note, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [product.id, change, reason, orderId, note, key, at(ms)],
      );
      product.stock += change;
      await q('UPDATE products SET stock_quantity = $1, updated_at = $2 WHERE id = $3', [
        product.stock,
        at(ms),
        product.id,
      ]);
      await outbox(
        stockMovementRecorded({
          id: Number(rows[0].id),
          productId: product.id,
          quantityChange: change,
          stockAfter: product.stock,
          reason,
          orderId,
          createdAt: at(ms),
        }),
        ms,
      );
    }

    let restockNo = 0;
    const restock = (product, quantity, ms, note) => {
      stats.restocks += 1;
      return moveStock(product, quantity, 'restock', ms, {
        note,
        key: `sample-restock-${restockNo++}`,
      });
    };

    const customerIds = new Map(); // planned customer index → database id
    const orders = new Map(); // planned order ref → { id, customerId, status, totalAmount, createdAt, items }
    let lastLog = 0;

    for (const item of timeline) {
      const ms = item.at;
      if (item.kind === 'restock') {
        await restock(products.get(item.sku), item.quantity, ms, item.note);
      } else if (item.kind === 'replenish') {
        for (const p of products.values()) {
          if (p.stock <= p.reorderLevel * 2) {
            await restock(
              p,
              p.initialStock - p.stock + p.reorderLevel,
              ms,
              'Weekly supplier delivery',
            );
          }
        }
      } else if (item.kind === 'adjustment') {
        const p = products.get(item.sku);
        const quantity = Math.floor(p.stock * item.share);
        if (quantity > 0) {
          stats.adjustments += 1;
          await moveStock(p, -quantity, 'adjustment', ms, {
            note: item.note,
            key: `sample-adjustment-${stats.adjustments}`,
          });
        }
      } else if (item.kind === 'order') {
        const c = item.customer;
        if (!customerIds.has(c.index)) {
          const created = at(ms - rnd.between(MINUTE, 3 * HOUR));
          const { rows } = await q(
            `INSERT INTO customers (email, first_name, last_name, city, country, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
            [c.email, c.firstName, c.lastName, c.city, c.country, created],
          );
          customerIds.set(c.index, Number(rows[0].id));
          stats.customers += 1;
        }
        const customerId = customerIds.get(c.index);

        const lines = item.items.map(({ sku, quantity }) => {
          const p = products.get(sku);
          const unit = toCents(p.price);
          return { product: p, quantity, unitPrice: p.price, lineCents: unit * quantity };
        });
        // Emergency restock if a popular product ran out between weekly deliveries.
        for (const line of lines) {
          if (line.product.stock < line.quantity) {
            await restock(
              line.product,
              line.product.initialStock + line.quantity,
              ms,
              'Urgent supplier delivery',
            );
          }
        }
        const totalCents = lines.reduce((s, l) => s + l.lineCents, 0);
        const { rows } = await q(
          `INSERT INTO orders (customer_id, status, total_amount, idempotency_key, created_at, updated_at)
           VALUES ($1, 'pending', $2, $3, $4, $4) RETURNING id`,
          [customerId, fromCents(totalCents), `sample-${seed}-${item.ref}`, at(ms)],
        );
        const orderId = Number(rows[0].id);
        for (const l of lines) {
          await q(
            `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
             VALUES ($1, $2, $3, $4, $5)`,
            [orderId, l.product.id, l.quantity, l.unitPrice, fromCents(l.lineCents)],
          );
        }
        for (const l of [...lines].sort((a, b) => a.product.id - b.product.id)) {
          await moveStock(l.product, -l.quantity, 'order', ms, {
            orderId,
            key: `order-${orderId}-product-${l.product.id}`,
          });
        }
        const order = {
          id: orderId,
          customerId,
          status: 'pending',
          totalAmount: fromCents(totalCents),
          createdAt: at(ms),
          items: lines.map((l) => ({
            productId: l.product.id,
            sku: l.product.sku,
            categoryId: l.product.categoryId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: fromCents(l.lineCents),
            product: l.product,
          })),
        };
        orders.set(item.ref, order);
        await q(
          `INSERT INTO order_status_history (order_id, from_status, to_status, changed_at)
           VALUES ($1, NULL, 'pending', $2)`,
          [orderId, at(ms)],
        );
        await outbox(orderCreated(order), ms);
        stats.orders += 1;
        stats.grossCents += totalCents;
      } else if (item.kind === 'status') {
        const order = orders.get(item.ref);
        const fromStatus = order.status;
        order.status = item.status;
        await q('UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3', [
          item.status,
          at(ms),
          order.id,
        ]);
        if (item.status === 'cancelled') {
          stats.cancelled += 1;
          for (const line of [...order.items].sort((a, b) => a.productId - b.productId)) {
            await moveStock(line.product, line.quantity, 'cancellation', ms, {
              orderId: order.id,
              key: `order-${order.id}-cancel-product-${line.productId}`,
            });
          }
        }
        await q(
          `INSERT INTO order_status_history (order_id, from_status, to_status, changed_at)
           VALUES ($1, $2, $3, $4)`,
          [order.id, fromStatus, item.status, at(ms)],
        );
        await outbox(orderStatusChanged({ order, fromStatus, changedAt: at(ms) }), ms);
      }

      if (stats.orders - lastLog >= 1000) {
        lastLog = stats.orders;
        log(`  ${stats.orders} orders written...`);
      }
    }

    await client.query('ALTER TABLE orders ENABLE TRIGGER orders_set_updated_at');
    await client.query('ALTER TABLE products ENABLE TRIGGER products_set_updated_at');
    await client.query('ALTER TABLE products ENABLE TRIGGER products_stock_level_notify');
    await client.query('ALTER TABLE event_outbox ENABLE TRIGGER event_outbox_publish');
  });

  return {
    from: new Date(start).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    orders: stats.orders,
    cancelledOrders: stats.cancelled,
    customers: stats.customers,
    products: catalog.categories.reduce((s, c) => s + c.products.length, 0),
    restocks: stats.restocks,
    adjustments: stats.adjustments,
    events: stats.events,
    grossRevenue: fromCents(stats.grossCents),
  };
}
