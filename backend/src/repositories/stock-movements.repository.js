/**
 * Inventory ledger writes. Must be called with a transaction client so the movement row and the
 * product's stock_quantity change commit (or roll back) together.
 */
export function createStockMovementsRepository() {
  return {
    /**
     * Applies a stock change and records it. Returns the new stock level.
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
      await client.query(
        `INSERT INTO stock_movements
           (product_id, quantity_change, reason, order_id, note, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [productId, quantityChange, reason, orderId, note, idempotencyKey, userId],
      );
      const { rows } = await client.query(
        `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2
         RETURNING stock_quantity`,
        [quantityChange, productId],
      );
      return rows[0].stock_quantity;
    },
  };
}
