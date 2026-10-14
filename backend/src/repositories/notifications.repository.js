function toNotification(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: row.created_at,
    unread: row.unread,
  };
}

// A user's unread notifications are those created after they last marked all as read, or after
// their account was created if they never did.
const READ_BASELINE = `coalesce(
  (SELECT last_read_at FROM notification_reads WHERE user_id = $1),
  (SELECT created_at FROM users WHERE id = $1))`;

export function createNotificationsRepository(db) {
  return {
    async listForUser(userId, { limit }) {
      const { rows } = await db.query(
        `SELECT n.*, n.created_at > ${READ_BASELINE} AS unread
         FROM notifications n
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT $2`,
        [userId, limit],
      );
      return rows.map(toNotification);
    },

    async unreadCount(userId) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM notifications WHERE created_at > ${READ_BASELINE}`,
        [userId],
      );
      return rows[0].n;
    },

    async markAllRead(userId) {
      const { rows } = await db.query(
        `INSERT INTO notification_reads (user_id, last_read_at) VALUES ($1, now())
         ON CONFLICT (user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at
         RETURNING last_read_at`,
        [userId],
      );
      return rows[0].last_read_at;
    },

    /** Latest order placements and status changes, newest first, from the outbox. */
    async recentOrderActivity(limit) {
      const { rows } = await db.query(
        `SELECT e.event_id, e.event_type, e.occurred_at,
                (e.payload ->> 'orderId')::bigint AS order_id,
                (e.payload ->> 'customerId')::bigint AS customer_id,
                c.first_name || ' ' || c.last_name AS customer_name,
                e.payload ->> 'totalAmount' AS total_amount,
                e.payload ->> 'fromStatus' AS from_status,
                e.payload ->> 'toStatus' AS to_status
         FROM event_outbox e
         LEFT JOIN customers c ON c.id = (e.payload ->> 'customerId')::bigint
         WHERE e.event_type IN ('order.created', 'order.status_changed')
         ORDER BY e.seq DESC
         LIMIT $1`,
        [limit],
      );
      return rows.map((r) => ({
        type: r.event_type,
        eventId: r.event_id,
        occurredAt: r.occurred_at,
        orderId: Number(r.order_id),
        customerId: r.customer_id === null ? null : Number(r.customer_id),
        customerName: r.customer_name,
        totalAmount: r.total_amount,
        fromStatus: r.from_status,
        toStatus: r.to_status,
      }));
    },
  };
}
