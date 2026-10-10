import { WhereBuilder, escapeLike, paginate } from '../db/query-helpers.js';

const SORT_COLUMNS = {
  name: 'c.last_name, c.first_name',
  email: 'c.email',
  createdAt: 'c.created_at',
  orderCount: 'order_count',
  totalSpent: 'total_spent',
};

const UPDATABLE_COLUMNS = {
  email: 'email',
  firstName: 'first_name',
  lastName: 'last_name',
  phone: 'phone',
  city: 'city',
  country: 'country',
};

// Purchase statistics exclude cancelled orders.
const SELECT = `
  SELECT c.id, c.email, c.first_name, c.last_name, c.phone, c.city, c.country,
         c.created_at, c.updated_at,
         coalesce(s.order_count, 0)::int AS order_count,
         coalesce(s.total_spent, 0)::numeric(12,2) AS total_spent,
         s.last_order_at
  FROM customers c
  LEFT JOIN LATERAL (
    SELECT count(*) AS order_count, sum(o.total_amount) AS total_spent,
           max(o.created_at) AS last_order_at
    FROM orders o
    WHERE o.customer_id = c.id AND o.status <> 'cancelled'
  ) s ON true`;

function toCustomer(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    city: row.city,
    country: row.country,
    orderCount: row.order_count,
    totalSpent: row.total_spent,
    lastOrderAt: row.last_order_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCustomersRepository(db) {
  return {
    async list({ search, country, sort, order, page, pageSize }) {
      const where = new WhereBuilder();
      if (search) {
        where.add((p) => {
          const pattern = p(escapeLike(search));
          return `(c.first_name || ' ' || c.last_name ILIKE '%' || ${pattern} || '%' ESCAPE '\\'
                   OR c.email ILIKE '%' || ${pattern} || '%' ESCAPE '\\')`;
        });
      }
      if (country) where.add((p) => `lower(c.country) = lower(${p(country)})`);

      const direction = order === 'desc' ? 'DESC' : 'ASC';
      const orderBy = SORT_COLUMNS[sort]
        .split(', ')
        .map((col) => `${col} ${direction}`)
        .join(', ');

      const { rows: countRows } = await db.query(
        `SELECT count(*)::int AS total FROM customers c ${where.toSql()}`,
        where.params,
      );
      const { rows } = await db.query(
        `${SELECT} ${where.toSql()}
         ORDER BY ${orderBy}, c.id ${direction}
         ${paginate(where, { page, pageSize })}`,
        where.params,
      );
      return { items: rows.map(toCustomer), total: countRows[0].total };
    },

    async findById(id, executor = db) {
      const { rows } = await executor.query(`${SELECT} WHERE c.id = $1`, [id]);
      return toCustomer(rows[0]);
    },

    async create({ email, firstName, lastName, phone = null, city = null, country = null }) {
      const { rows } = await db.query(
        `INSERT INTO customers (email, first_name, last_name, phone, city, country)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [email, firstName, lastName, phone, city, country],
      );
      return this.findById(rows[0].id);
    },

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
        `UPDATE customers SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );
      return rowCount ? this.findById(id) : null;
    },

    async delete(id) {
      const { rowCount } = await db.query('DELETE FROM customers WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}
