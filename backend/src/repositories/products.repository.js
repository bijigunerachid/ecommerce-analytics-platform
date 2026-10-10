import { WhereBuilder, escapeLike, paginate } from '../db/query-helpers.js';

// Allow-listed API sort fields → SQL expressions. Never interpolate client input directly.
const SORT_COLUMNS = {
  name: 'p.name',
  sku: 'p.sku',
  price: 'p.price',
  stockQuantity: 'p.stock_quantity',
  createdAt: 'p.created_at',
};

// API field → column, for partial updates. stock_quantity is intentionally absent.
const UPDATABLE_COLUMNS = {
  sku: 'sku',
  name: 'name',
  description: 'description',
  categoryId: 'category_id',
  price: 'price',
  reorderLevel: 'reorder_level',
  isActive: 'is_active',
};

const SELECT = `
  SELECT p.id, p.sku, p.name, p.description, p.category_id, c.name AS category_name,
         p.price, p.stock_quantity, p.reorder_level, p.is_active, p.created_at, p.updated_at
  FROM products p
  JOIN categories c ON c.id = p.category_id`;

function toProduct(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    sku: row.sku,
    name: row.name,
    description: row.description,
    categoryId: Number(row.category_id),
    categoryName: row.category_name,
    price: row.price, // numeric → string, preserves cents exactly
    stockQuantity: row.stock_quantity,
    reorderLevel: row.reorder_level,
    isLowStock: row.stock_quantity <= row.reorder_level,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProductsRepository(db) {
  return {
    async list({
      search,
      categoryId,
      isActive,
      lowStock,
      minPrice,
      maxPrice,
      sort,
      order,
      page,
      pageSize,
    }) {
      const where = new WhereBuilder();
      if (search) {
        where.add((p) => {
          const pattern = p(escapeLike(search));
          return `(p.name ILIKE '%' || ${pattern} || '%' ESCAPE '\\'
                   OR p.sku ILIKE '%' || ${pattern} || '%' ESCAPE '\\')`;
        });
      }
      if (categoryId !== undefined) where.add((p) => `p.category_id = ${p(categoryId)}`);
      if (isActive !== undefined) where.add((p) => `p.is_active = ${p(isActive)}`);
      if (lowStock !== undefined) {
        where.add(() =>
          lowStock ? 'p.stock_quantity <= p.reorder_level' : 'p.stock_quantity > p.reorder_level',
        );
      }
      if (minPrice !== undefined) where.add((p) => `p.price >= ${p(minPrice)}`);
      if (maxPrice !== undefined) where.add((p) => `p.price <= ${p(maxPrice)}`);

      const direction = order === 'desc' ? 'DESC' : 'ASC';
      const { rows: countRows } = await db.query(
        `SELECT count(*)::int AS total FROM products p ${where.toSql()}`,
        where.params,
      );
      const { rows } = await db.query(
        `${SELECT} ${where.toSql()}
         ORDER BY ${SORT_COLUMNS[sort]} ${direction}, p.id ${direction}
         ${paginate(where, { page, pageSize })}`,
        where.params,
      );

      return { items: rows.map(toProduct), total: countRows[0].total };
    },

    async findById(id) {
      const { rows } = await db.query(`${SELECT} WHERE p.id = $1`, [id]);
      return toProduct(rows[0]);
    },

    /**
     * Inserts with stock 0; initial stock is applied through the inventory ledger.
     * Pass a transaction client as executor to run inside a transaction.
     */
    async create(
      { sku, name, description = null, categoryId, price, reorderLevel, isActive },
      executor = db,
    ) {
      const { rows } = await executor.query(
        `INSERT INTO products (sku, name, description, category_id, price, reorder_level, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [sku, name, description, categoryId, price, reorderLevel, isActive],
      );
      return Number(rows[0].id);
    },

    /** Updates only the provided fields. Returns false if the product does not exist. */
    async update(id, changes) {
      const sets = [];
      const params = [];
      for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
        if (changes[field] !== undefined) {
          params.push(changes[field]);
          sets.push(`${column} = $${params.length}`);
        }
      }
      params.push(id);
      const { rowCount } = await db.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );
      return rowCount > 0;
    },

    async delete(id) {
      const { rowCount } = await db.query('DELETE FROM products WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}
