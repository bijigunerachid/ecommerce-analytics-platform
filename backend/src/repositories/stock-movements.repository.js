import { WhereBuilder, paginate } from '../db/query-helpers.js';
import { stockMovementRecorded } from '../events/business-events.js';

const SORT_COLUMNS = {
  createdAt: 'm.created_at',
  quantityChange: 'm.quantity_change',
};

const SELECT = `
  SELECT m.id, m.product_id, p.sku, p.name AS product_name, m.quantity_change, m.reason,
         m.order_id, m.note, m.idempotency_key, m.created_by, m.created_at
  FROM stock_movements m
  JOIN products p ON p.id = m.product_id`;

function toMovement(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    sku: row.sku,
    productName: row.product_name,
    quantityChange: row.quantity_change,
    reason: row.reason,
    orderId: row.order_id === null ? null : Number(row.order_id),
    note: row.note,
    createdBy: row.created_by === null ? null : Number(row.created_by),
    createdAt: row.created_at,
  };
}

/**
 * The inventory ledger. Every stock change goes through apply(), which records the movement,
 * updates products.stock_quantity, and writes an inventory.stock_changed outbox event.
 */
export function createStockMovementsRepository({ db, outboxRepository }) {
  return {
    /**
     * Must be called with a transaction client. Returns the movement including stockAfter.
     * Throws a check violation (products_stock_nonnegative) if stock would go negative, and a
     * unique violation (stock_movements_idempotency_key_unique) if the key was already used.
     */
    async apply(
      client,
      {
        productId,
        quantityChange,
        reason,
        idempotencyKey,
        orderId = null,
        note = null,
        userId = null,
      },
    ) {
      const { rows: inserted } = await client.query(
        `INSERT INTO stock_movements
           (product_id, quantity_change, reason, order_id, note, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [productId, quantityChange, reason, orderId, note, idempotencyKey, userId],
      );
      const { rows: updated } = await client.query(
        `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2
         RETURNING stock_quantity`,
        [quantityChange, productId],
      );

      const movement = {
        id: Number(inserted[0].id),
        productId,
        quantityChange,
        reason,
        orderId,
        note,
        stockAfter: updated[0].stock_quantity,
        createdAt: inserted[0].created_at,
      };
      await outboxRepository.add(client, stockMovementRecorded(movement));
      return movement;
    },

    async findByIdempotencyKey(key, executor = db) {
      const { rows } = await executor.query(`${SELECT} WHERE m.idempotency_key = $1`, [key]);
      return toMovement(rows[0]);
    },

    async list({ productId, reason, orderId, dateFrom, dateTo, sort, order, page, pageSize }) {
      const where = new WhereBuilder();
      if (productId !== undefined) where.add((p) => `m.product_id = ${p(productId)}`);
      if (reason !== undefined) where.add((p) => `m.reason = ${p(reason)}`);
      if (orderId !== undefined) where.add((p) => `m.order_id = ${p(orderId)}`);
      if (dateFrom !== undefined) where.add((p) => `m.created_at >= ${p(dateFrom)}::date`);
      // dateTo is inclusive: everything before the start of the following day.
      if (dateTo !== undefined) where.add((p) => `m.created_at < ${p(dateTo)}::date + 1`);

      const direction = order === 'desc' ? 'DESC' : 'ASC';
      const { rows: countRows } = await db.query(
        `SELECT count(*)::int AS total FROM stock_movements m ${where.toSql()}`,
        where.params,
      );
      const { rows } = await db.query(
        `${SELECT} ${where.toSql()}
         ORDER BY ${SORT_COLUMNS[sort]} ${direction}, m.id ${direction}
         ${paginate(where, { page, pageSize })}`,
        where.params,
      );
      return { items: rows.map(toMovement), total: countRows[0].total };
    },
  };
}
