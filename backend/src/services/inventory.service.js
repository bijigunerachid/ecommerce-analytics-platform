import { PG_CHECK_VIOLATION, isPgError } from '../db/pg-errors.js';
import { paginationMeta } from '../db/query-helpers.js';
import { withTransaction } from '../db/transaction.js';
import { HttpError, badRequest } from '../utils/http-error.js';

// Client-supplied keys are namespaced so they can never collide with keys the order flow
// generates for its own movements (e.g. "order-5-product-3").
const clientKey = (key) => `client:${key}`;

function sameAdjustment(movement, { productId, quantityChange, reason }) {
  return (
    movement.productId === productId &&
    movement.quantityChange === quantityChange &&
    movement.reason === reason
  );
}

export function createInventoryService({ db, stockMovementsRepository }) {
  return {
    async listMovements(query) {
      const { items, total } = await stockMovementsRepository.list(query);
      return { data: items, pagination: paginationMeta(query, total) };
    },

    /**
     * Applies a manual restock or adjustment exactly once per Idempotency-Key.
     * @returns {Promise<{ movement: object, replayed: boolean }>}
     */
    async adjust(input, { idempotencyKey, userId }) {
      const key = clientKey(idempotencyKey);
      try {
        return await withTransaction(db, async (client) => {
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`stock:${key}`]);

          const existing = await stockMovementsRepository.findByIdempotencyKey(key, client);
          if (existing) {
            if (!sameAdjustment(existing, input)) {
              throw new HttpError(
                409,
                'IDEMPOTENCY_KEY_REUSED',
                'This Idempotency-Key was already used for a different adjustment',
              );
            }
            return { movement: existing, replayed: true };
          }

          const { rows } = await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [
            input.productId,
          ]);
          if (!rows[0]) {
            throw badRequest('Product does not exist', [
              { location: 'body', path: 'productId', message: 'Product does not exist' },
            ]);
          }

          await stockMovementsRepository.apply(client, { ...input, idempotencyKey: key, userId });
          const movement = await stockMovementsRepository.findByIdempotencyKey(key, client);
          return { movement, replayed: false };
        });
      } catch (err) {
        if (isPgError(err, PG_CHECK_VIOLATION, 'products_stock_nonnegative')) {
          throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Adjustment would make stock negative');
        }
        throw err;
      }
    },
  };
}
