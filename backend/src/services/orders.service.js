import { PG_UNIQUE_VIOLATION, isPgError } from '../db/pg-errors.js';
import { paginationMeta } from '../db/query-helpers.js';
import { withTransaction } from '../db/transaction.js';
import { allowedTransitions, canTransition } from '../domain/order-status.js';
import { orderCreated, orderStatusChanged } from '../events/business-events.js';
import { HttpError, badRequest, notFound } from '../utils/http-error.js';
import { fromCents, toCents } from '../utils/money.js';

/** True if a stored order is the same request as the incoming one (same customer and lines). */
function sameRequest(order, { customerId, items }) {
  const normalize = (lines) =>
    lines
      .map((l) => `${l.productId}x${l.quantity}`)
      .sort()
      .join(',');
  return order.customerId === customerId && normalize(order.items) === normalize(items);
}

export function createOrdersService({
  db,
  ordersRepository,
  customersRepository,
  stockMovementsRepository,
  outboxRepository,
}) {
  /**
   * Returns the order already created with this idempotency key, or null.
   * A key reused for a different request is rejected rather than silently replayed.
   */
  async function findReplay(client, idempotencyKey, request) {
    const existingId = await ordersRepository.findIdByIdempotencyKey(idempotencyKey, client);
    if (existingId === null) return null;
    const existing = await ordersRepository.findById(existingId, client);
    if (!sameRequest(existing, request)) {
      throw new HttpError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different order request',
      );
    }
    return existing;
  }

  /**
   * Locks the requested products (in id order, so concurrent orders cannot deadlock), then
   * checks they exist, are active, and have enough stock. Returns priced order lines.
   */
  async function lockAndPriceItems(client, items) {
    const ids = items.map((i) => i.productId).sort((a, b) => a - b);
    const { rows } = await client.query(
      `SELECT id, sku, name, category_id, price, stock_quantity, is_active
       FROM products WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
      [ids],
    );
    const products = new Map(rows.map((r) => [Number(r.id), r]));

    const missing = [];
    const unavailable = [];
    const insufficient = [];
    items.forEach((item, index) => {
      const product = products.get(item.productId);
      if (!product) {
        missing.push({
          location: 'body',
          path: `items.${index}.productId`,
          message: `Product ${item.productId} does not exist`,
        });
      } else if (!product.is_active) {
        unavailable.push({ productId: item.productId, sku: product.sku });
      } else if (product.stock_quantity < item.quantity) {
        insufficient.push({
          productId: item.productId,
          sku: product.sku,
          requested: item.quantity,
          available: product.stock_quantity,
        });
      }
    });

    if (missing.length) throw badRequest('Order references unknown products', missing);
    if (unavailable.length) {
      throw new HttpError(
        409,
        'PRODUCT_UNAVAILABLE',
        'Some products are inactive and cannot be ordered',
        unavailable,
      );
    }
    if (insufficient.length) {
      throw new HttpError(
        409,
        'INSUFFICIENT_STOCK',
        'Not enough stock for some items',
        insufficient,
      );
    }

    // Prices come from the database, never from the client. Lines are in product-id order.
    return ids.map((productId) => {
      const product = products.get(productId);
      const { quantity } = items.find((i) => i.productId === productId);
      const unitCents = toCents(product.price);
      return {
        productId,
        sku: product.sku,
        categoryId: Number(product.category_id),
        quantity,
        unitPrice: fromCents(unitCents),
        lineTotal: fromCents(unitCents * quantity),
        lineCents: unitCents * quantity,
      };
    });
  }

  async function createInTransaction(request, idempotencyKey, userId) {
    return withTransaction(db, async (client) => {
      // Serializes concurrent requests that share a key, so a retry arriving while the first
      // attempt is still running waits and then replays it instead of racing it.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`order:${idempotencyKey}`]);

      const replay = await findReplay(client, idempotencyKey, request);
      if (replay) return { order: replay, replayed: true };

      const customer = await customersRepository.findById(request.customerId, client);
      if (!customer) {
        throw badRequest('Customer does not exist', [
          { location: 'body', path: 'customerId', message: 'Customer does not exist' },
        ]);
      }

      const lines = await lockAndPriceItems(client, request.items);
      const totalAmount = fromCents(lines.reduce((sum, l) => sum + l.lineCents, 0));

      const orderId = await ordersRepository.insert(client, {
        customerId: request.customerId,
        totalAmount,
        idempotencyKey,
        userId,
      });
      await ordersRepository.insertItems(client, orderId, lines);

      for (const line of lines) {
        await stockMovementsRepository.apply(client, {
          productId: line.productId,
          quantityChange: -line.quantity,
          reason: 'order',
          orderId,
          idempotencyKey: `order-${orderId}-product-${line.productId}`,
          userId,
        });
      }

      const order = await ordersRepository.findById(orderId, client);
      await outboxRepository.add(client, orderCreated(order));
      return { order, replayed: false };
    });
  }

  return {
    async list(query) {
      const { items, total } = await ordersRepository.list(query);
      return { data: items, pagination: paginationMeta(query, total) };
    },

    async get(id) {
      const order = await ordersRepository.findById(id);
      if (!order) throw notFound('Order not found');
      return order;
    },

    /**
     * Creates an order atomically: stock check, server-side pricing, order + items, stock
     * decrements, and the order.created event all commit together or not at all.
     * @returns {Promise<{ order: object, replayed: boolean }>}
     */
    async create(request, { idempotencyKey, userId }) {
      try {
        return await createInTransaction(request, idempotencyKey, userId);
      } catch (err) {
        // Backstop for the advisory lock: if two requests with the same key still collide on
        // the unique constraint, the loser replays the winner's (now committed) order.
        if (isPgError(err, PG_UNIQUE_VIOLATION, 'orders_idempotency_key_unique')) {
          const replay = await findReplay(db, idempotencyKey, request);
          if (replay) return { order: replay, replayed: true };
        }
        throw err;
      }
    },

    /**
     * Moves an order to a new status if the transition is allowed. Cancelling restores the
     * ordered quantities to stock through the inventory ledger.
     */
    async updateStatus(id, newStatus, { userId }) {
      return withTransaction(db, async (client) => {
        const locked = await ordersRepository.lockById(client, id);
        if (!locked) throw notFound('Order not found');

        const fromStatus = locked.status;
        if (!canTransition(fromStatus, newStatus)) {
          const allowed = allowedTransitions(fromStatus);
          throw new HttpError(
            409,
            'INVALID_STATUS_TRANSITION',
            `Cannot change order status from ${fromStatus} to ${newStatus}` +
              (allowed.length ? ` (allowed: ${allowed.join(', ')})` : ' (final status)'),
          );
        }

        const changedAt = await ordersRepository.updateStatus(client, id, newStatus);
        const order = await ordersRepository.findById(id, client);

        if (newStatus === 'cancelled') {
          const items = [...order.items].sort((a, b) => a.productId - b.productId);
          for (const item of items) {
            await stockMovementsRepository.apply(client, {
              productId: item.productId,
              quantityChange: item.quantity,
              reason: 'cancellation',
              orderId: id,
              idempotencyKey: `order-${id}-cancel-product-${item.productId}`,
              userId,
            });
          }
        }

        await outboxRepository.add(client, orderStatusChanged({ order, fromStatus, changedAt }));
        return order;
      });
    },
  };
}
