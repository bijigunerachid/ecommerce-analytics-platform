import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, isPgError } from '../db/pg-errors.js';
import { paginationMeta } from '../db/query-helpers.js';
import { withTransaction } from '../db/transaction.js';
import { HttpError, conflict, notFound } from '../utils/http-error.js';

function translateWriteError(err) {
  if (isPgError(err, PG_UNIQUE_VIOLATION, 'products_sku_unique')) {
    return conflict('A product with this SKU already exists');
  }
  if (isPgError(err, PG_FOREIGN_KEY_VIOLATION, 'products_category_id_fkey')) {
    return new HttpError(400, 'VALIDATION_ERROR', 'Category does not exist', [
      { location: 'body', path: 'categoryId', message: 'Category does not exist' },
    ]);
  }
  return err;
}

export function createProductsService({ db, productsRepository, stockMovementsRepository }) {
  return {
    async list(query) {
      const { items, total } = await productsRepository.list(query);
      return { data: items, pagination: paginationMeta(query, total) };
    },

    async get(id) {
      const product = await productsRepository.findById(id);
      if (!product) throw notFound('Product not found');
      return product;
    },

    /**
     * Creates the product and, if initialStock > 0, records it as a stock movement in the same
     * transaction so the inventory ledger always explains the current stock level.
     */
    async create({ initialStock, ...fields }, { userId } = {}) {
      let productId;
      try {
        productId = await withTransaction(db, async (client) => {
          const id = await productsRepository.create(fields, client);
          if (initialStock > 0) {
            await stockMovementsRepository.apply(client, {
              productId: id,
              quantityChange: initialStock,
              reason: 'restock',
              note: 'Initial stock',
              idempotencyKey: `product-${id}-initial-stock`,
              userId,
            });
          }
          return id;
        });
      } catch (err) {
        throw translateWriteError(err);
      }
      return productsRepository.findById(productId);
    },

    async update(id, changes) {
      let updated;
      try {
        updated = await productsRepository.update(id, changes);
      } catch (err) {
        throw translateWriteError(err);
      }
      if (!updated) throw notFound('Product not found');
      return productsRepository.findById(id);
    },

    async delete(id) {
      let deleted;
      try {
        deleted = await productsRepository.delete(id);
      } catch (err) {
        if (isPgError(err, PG_FOREIGN_KEY_VIOLATION)) {
          throw conflict(
            'Product has order or inventory history and cannot be deleted; set isActive to false instead',
          );
        }
        throw err;
      }
      if (!deleted) throw notFound('Product not found');
    },
  };
}
