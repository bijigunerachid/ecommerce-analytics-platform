import { WhereBuilder, escapeLike, paginate } from '../db/query-helpers.js';

// Allow-listed API sort fields → SQL expressions. Never interpolate client input directly.
const SORT_COLUMNS = {
  name: 'c.name',
  createdAt: 'c.created_at',
  productCount: 'product_count',
};

const SELECT = `
  SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
         (SELECT count(*) FROM products p WHERE p.category_id = c.id)::int AS product_count
  FROM categories c`;

function toCategory(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    productCount: row.product_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCategoriesRepository(db) {
  return {
    async list({ search, sort, order, page, pageSize }) {
      const where = new WhereBuilder();
      if (search) {
        where.add((p) => `c.name ILIKE '%' || ${p(escapeLike(search))} || '%' ESCAPE '\\'`);
      }

      const direction = order === 'desc' ? 'DESC' : 'ASC';
      const countSql = `SELECT count(*)::int AS total FROM categories c ${where.toSql()}`;
      const { rows: countRows } = await db.query(countSql, where.params);

      const listSql = `${SELECT} ${where.toSql()}
        ORDER BY ${SORT_COLUMNS[sort]} ${direction}, c.id ${direction}
        ${paginate(where, { page, pageSize })}`;
      const { rows } = await db.query(listSql, where.params);

      return { items: rows.map(toCategory), total: countRows[0].total };
    },

    async findById(id) {
      const { rows } = await db.query(`${SELECT} WHERE c.id = $1`, [id]);
      return toCategory(rows[0]);
    },

    async create({ name, description = null }) {
      const { rows } = await db.query(
        `INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id`,
        [name, description],
      );
      return this.findById(rows[0].id);
    },

    /** Updates only the provided fields. Returns null if the category does not exist. */
    async update(id, changes) {
      const columns = { name: 'name', description: 'description' };
      const sets = [];
      const params = [];
      for (const [field, column] of Object.entries(columns)) {
        if (changes[field] !== undefined) {
          params.push(changes[field]);
          sets.push(`${column} = $${params.length}`);
        }
      }
      params.push(id);
      const { rowCount } = await db.query(
        `UPDATE categories SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );
      return rowCount ? this.findById(id) : null;
    },

    /** @returns {Promise<boolean>} whether a row was deleted */
    async delete(id) {
      const { rowCount } = await db.query('DELETE FROM categories WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}
