export function createPipelineRepository(db) {
  return {
    async heartbeat(component, details) {
      await db.query(
        `INSERT INTO pipeline_heartbeats (component, last_seen_at, details)
         VALUES ($1, now(), $2)
         ON CONFLICT (component) DO UPDATE
           SET last_seen_at = EXCLUDED.last_seen_at, details = EXCLUDED.details`,
        [component, details],
      );
    },

    async listHeartbeats() {
      const { rows } = await db.query(
        `SELECT component, last_seen_at, details,
                extract(epoch FROM now() - last_seen_at)::float AS age_seconds
         FROM pipeline_heartbeats ORDER BY component`,
      );
      return rows.map((r) => ({
        component: r.component,
        lastSeenAt: r.last_seen_at,
        ageSeconds: r.age_seconds,
        details: r.details,
      }));
    },

    async outboxStats() {
      const { rows } = await db.query(
        `SELECT
           count(*) FILTER (WHERE published_at IS NULL)::int AS pending,
           count(*) FILTER (WHERE published_at IS NULL AND attempts > 0)::int AS failing,
           extract(epoch FROM now() - min(occurred_at) FILTER (WHERE published_at IS NULL))::float
             AS oldest_pending_age_seconds,
           max(published_at) AS last_published_at,
           count(*) FILTER (WHERE published_at > now() - interval '1 hour')::int
             AS published_last_hour,
           (array_agg(last_error ORDER BY seq DESC)
              FILTER (WHERE published_at IS NULL AND last_error IS NOT NULL))[1] AS last_error
         FROM event_outbox`,
      );
      const r = rows[0];
      return {
        pending: r.pending,
        failing: r.failing,
        oldestPendingAgeSeconds:
          r.oldest_pending_age_seconds === null ? null : Math.round(r.oldest_pending_age_seconds),
        lastPublishedAt: r.last_published_at,
        publishedLastHour: r.published_last_hour,
        lastError: r.last_error,
      };
    },
  };
}
