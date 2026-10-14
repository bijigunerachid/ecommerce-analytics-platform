// Docker health check for the outbox relay: healthy when its heartbeat in pipeline_heartbeats
// is recent and it is not reporting publish errors. "standby" (another relay instance holds
// the publishing lock) counts as healthy.
//   node scripts/relay-healthcheck.js   → exit 0 healthy, 1 unhealthy
import pg from 'pg';
import { getDatabaseConfig } from '../src/config/database.js';

const MAX_AGE_SECONDS = 30;

const client = new pg.Client({ ...getDatabaseConfig(), connectionTimeoutMillis: 3000 });
try {
  await client.connect();
  const { rows } = await client.query(
    `SELECT details->>'status' AS status,
            extract(epoch FROM now() - last_seen_at) AS age_seconds
     FROM pipeline_heartbeats WHERE component = 'outbox-relay'`,
  );
  const beat = rows[0];
  const healthy =
    beat && Number(beat.age_seconds) <= MAX_AGE_SECONDS && ['ok', 'standby'].includes(beat.status);
  if (!healthy) {
    console.error(
      beat
        ? `relay ${beat.status}, last heartbeat ${Math.round(beat.age_seconds)} s ago`
        : 'no relay heartbeat yet',
    );
  }
  process.exitCode = healthy ? 0 : 1;
} catch (err) {
  console.error(`health check failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
