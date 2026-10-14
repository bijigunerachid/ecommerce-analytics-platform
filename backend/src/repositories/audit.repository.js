import { WhereBuilder, escapeLike, paginate } from '../db/query-helpers.js';

function toEntry(row) {
  return {
    id: Number(row.id),
    occurredAt: row.occurred_at,
    actor:
      row.actor_email === null
        ? null
        : {
            id: row.actor_id === null ? null : Number(row.actor_id),
            email: row.actor_email,
            fullName: row.actor_name,
          },
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    details: row.details,
    ip: row.ip,
  };
}

export function createAuditRepository(db) {
  return {
    async insert({ actorId, actorEmail, action, entityType, entityId, summary, details, ip }) {
      await db.query(
        `INSERT INTO audit_log
           (actor_id, actor_email, action, entity_type, entity_id, summary, details, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          actorId ?? null,
          actorEmail ?? null,
          action,
          entityType ?? null,
          entityId === undefined || entityId === null ? null : String(entityId),
          summary,
          details ?? {},
          ip ?? null,
        ],
      );
    },

    async list({
      action,
      actorId,
      entityType,
      entityId,
      search,
      dateFrom,
      dateTo,
      page,
      pageSize,
    }) {
      const where = new WhereBuilder();
      if (action) where.add((p) => `a.action = ${p(action)}`);
      if (actorId !== undefined) where.add((p) => `a.actor_id = ${p(actorId)}`);
      if (entityType) where.add((p) => `a.entity_type = ${p(entityType)}`);
      if (entityId) where.add((p) => `a.entity_id = ${p(entityId)}`);
      if (search) {
        where.add((p) => {
          const pattern = p(escapeLike(search));
          return `(a.summary ILIKE '%' || ${pattern} || '%' ESCAPE '\\'
                   OR a.actor_email ILIKE '%' || ${pattern} || '%' ESCAPE '\\')`;
        });
      }
      if (dateFrom) where.add((p) => `a.occurred_at >= ${p(dateFrom)}::date`);
      if (dateTo) where.add((p) => `a.occurred_at < ${p(dateTo)}::date + 1`);

      const { rows: count } = await db.query(
        `SELECT count(*)::int AS total FROM audit_log a ${where.toSql()}`,
        where.params,
      );
      const { rows } = await db.query(
        `SELECT a.*, u.full_name AS actor_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
         ${where.toSql()}
         ORDER BY a.occurred_at DESC, a.id DESC
         ${paginate(where, { page, pageSize })}`,
        where.params,
      );
      return { items: rows.map(toEntry), total: count[0].total };
    },
  };
}
