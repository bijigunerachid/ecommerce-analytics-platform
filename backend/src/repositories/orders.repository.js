import { WhereBuilder, escapeLike, paginate } from '../db/query-helpers.js';

const SORT_COLUMNS = {
  createdAt: 'o.created_at',
  totalAmount: 'o.total_amount',
  status: 'o.status',
};

const SELECT = `
  SELECT o.id, o.customer_id, c.first_name, c.last_name, c.email AS customer_email,
         o.status, o.total_amount, o.created_by, o.created_at, o.updated_at,
         (SELECT count(*) FROM order_items i WHERE i.order_id = o.id)::int AS item_count
  FROM orders o
  JOIN customers c ON c.id = o.customer_id`;

function toOrder(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    customerName: `${row.first_name} ${row.last_name}`,
    customerEmail: row.customer_email,
    status: row.status,
    totalAmount: row.total_amount,
    itemCount: row.item_count,
    createdBy: row.created_by === null ? null : Number(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toItem(row) {
  return {
    productId: Number(row.product_id),
    sku: row.sku,
    productName: row.product_name,
    categoryId: Number(row.category_id),
    quantity: row.quantity,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
  };
}

export function createOrdersRepository(db) {
  return {
    async list({
      search,
      status,
      customerId,
      dateFrom,
      dateTo,
      minTotal,
      maxTotal,
      sort,
      order,
      page,
      pageSize,
    }) {
      const where = new WhereBuilder();
      if (search) {
        where.add((p) => {
          const pattern = p(escapeLike(search));
          // Searching "42" also finds order #42.
          const idMatch = /^\d{1,15}$/.test(search) ? `OR o.id = ${p(Number(search))}` : '';
          return `(c.first_name || ' ' || c.last_name ILIKE '%' || ${pattern} || '%' ESCAPE '\\'
                   OR c.email ILIKE '%' || ${pattern} || '%' ESCAPE '\\' ${idMatch})`;
        });
      }
      if (status) where.add((p) => `o.status = ${p(status)}`);
      if (customerId !== undefined) where.add((p) => `o.customer_id = ${p(customerId)}`);
      if (dateFrom) where.add((p) => `o.created_at >= ${p(dateFrom)}::date`);
      if (dateTo) where.add((p) => `o.created_at < ${p(dateTo)}::date + 1`);
      if (minTotal !== undefined) where.add((p) => `o.total_amount >= ${p(minTotal)}`);
      if (maxTotal !== undefined) where.add((p) => `o.total_amount <= ${p(maxTotal)}`);

      const direction = order === 'desc' ? 'DESC' : 'ASC';
      const { rows: countRows } = await db.query(
        `SELECT count(*)::int AS total
         FROM orders o JOIN customers c ON c.id = o.customer_id ${where.toSql()}`,
        where.params,
      );
      const { rows } = await db.query(
        `${SELECT} ${where.toSql()}
         ORDER BY ${SORT_COLUMNS[sort]} ${direction}, o.id ${direction}
         ${paginate(where, { page, pageSize })}`,
        where.params,
      );
      return { items: rows.map(toOrder), total: countRows[0].total };
    },

    /** Returns the order with its line items, or null. */
    async findById(id, executor = db) {
      const { rows } = await executor.query(`${SELECT} WHERE o.id = $1`, [id]);
      if (!rows[0]) return null;
      const { rows: items } = await executor.query(
        `SELECT i.product_id, p.sku, p.name AS product_name, p.category_id,
                i.quantity, i.unit_price, i.line_total
         FROM order_items i JOIN products p ON p.id = i.product_id
         WHERE i.order_id = $1
         ORDER BY i.id`,
        [id],
      );
      return { ...toOrder(rows[0]), items: items.map(toItem) };
    },

    async findIdByIdempotencyKey(key, executor = db) {
      const { rows } = await executor.query('SELECT id FROM orders WHERE idempotency_key = $1', [
        key,
      ]);
      return rows[0] ? Number(rows[0].id) : null;
    },

    /** Locks the order row for the rest of the transaction. Returns { id, status } or null. */
    async lockById(client, id) {
      const { rows } = await client.query(
        'SELECT id, status FROM orders WHERE id = $1 FOR UPDATE',
        [id],
      );
      return rows[0] ?? null;
    },

    async insert(client, { customerId, totalAmount, idempotencyKey, userId }) {
      const { rows } = await client.query(
        `INSERT INTO orders (customer_id, total_amount, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [customerId, totalAmount, idempotencyKey, userId],
      );
      return Number(rows[0].id);
    },

    async insertItems(client, orderId, items) {
      for (const item of items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.productId, item.quantity, item.unitPrice, item.lineTotal],
        );
      }
    },

    /** Records a status the order entered (fromStatus is null when it was placed). */
    async insertStatusHistory(client, { orderId, fromStatus, toStatus, userId, note, changedAt }) {
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note, changed_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))`,
        [orderId, fromStatus, toStatus, userId ?? null, note ?? null, changedAt ?? null],
      );
    },

    /** Status changes, oldest first, with the name of the staff member who made them. */
    async listStatusHistory(orderId) {
      const { rows } = await db.query(
        `SELECT h.id, h.from_status, h.to_status, h.note, h.changed_at,
                h.changed_by, u.full_name AS changed_by_name
         FROM order_status_history h
         LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.order_id = $1
         ORDER BY h.changed_at, h.id`,
        [orderId],
      );
      return rows.map((r) => ({
        id: Number(r.id),
        fromStatus: r.from_status,
        toStatus: r.to_status,
        note: r.note,
        changedAt: r.changed_at,
        changedBy:
          r.changed_by === null ? null : { id: Number(r.changed_by), fullName: r.changed_by_name },
      }));
    },

    async insertNote(orderId, { body, userId }) {
      const { rows } = await db.query(
        `INSERT INTO order_notes (order_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`,
        [orderId, userId, body],
      );
      return Number(rows[0].id);
    },

    /** Staff notes, oldest first. */
    async listNotes(orderId) {
      const { rows } = await db.query(
        `SELECT n.id, n.body, n.created_at, n.author_id, u.full_name AS author_name
         FROM order_notes n
         LEFT JOIN users u ON u.id = n.author_id
         WHERE n.order_id = $1
         ORDER BY n.created_at, n.id`,
        [orderId],
      );
      return rows.map((r) => ({
        id: Number(r.id),
        body: r.body,
        createdAt: r.created_at,
        author: r.author_id === null ? null : { id: Number(r.author_id), fullName: r.author_name },
      }));
    },

    async exists(id) {
      const { rows } = await db.query('SELECT 1 FROM orders WHERE id = $1', [id]);
      return rows.length > 0;
    },

    async updateStatus(client, id, status) {
      const { rows } = await client.query(
        'UPDATE orders SET status = $1 WHERE id = $2 RETURNING updated_at',
        [status, id],
      );
      return rows[0].updated_at;
    },
  };
}
