import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let analyst;
beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  analyst = await ctx.loginAs('analyst@example.test');
});

const health = async () => (await analyst.get('/api/pipeline/health')).body;

async function heartbeat(secondsAgo, details) {
  await ctx.db.query(
    `INSERT INTO pipeline_heartbeats (component, last_seen_at, details)
     VALUES ('outbox-relay', now() - make_interval(secs => $1), $2)`,
    [secondsAgo, details],
  );
}

async function pendingEvent({ ageSeconds = 0, published = false, attempts = 0, error = null }) {
  await ctx.db.query(
    `INSERT INTO event_outbox
       (event_type, aggregate_type, aggregate_id, payload, occurred_at, published_at, attempts, last_error)
     VALUES ('order.created', 'order', '1', '{}', now() - make_interval(secs => $1),
             CASE WHEN $2 THEN now() END, $3, $4)`,
    [ageSeconds, published, attempts, error],
  );
}

describe('GET /api/pipeline/health', () => {
  it('requires a session and is readable by analysts', async () => {
    expect((await request(ctx.app).get('/api/pipeline/health')).status).toBe(401);
    expect((await analyst.get('/api/pipeline/health')).status).toBe(200);
  });

  it('reports the relay as unknown before it has ever run', async () => {
    const body = await health();
    expect(body.status).toBe('degraded');
    expect(body.components).toEqual([
      { component: 'outbox-relay', status: 'unknown', lastSeenAt: null, details: {} },
    ]);
    expect(body.outbox).toMatchObject({ pending: 0, failing: 0, oldestPendingAgeSeconds: null });
  });

  it('is healthy when the relay is up and the outbox is drained', async () => {
    await heartbeat(2, { status: 'ok', publishedTotal: 5 });
    await pendingEvent({ published: true });

    const body = await health();
    expect(body.status).toBe('healthy');
    expect(body.components[0]).toMatchObject({ status: 'up', details: { publishedTotal: 5 } });
    expect(body.outbox).toMatchObject({ pending: 0, publishedLastHour: 1 });
    expect(body.outbox.lastPublishedAt).not.toBeNull();
  });

  it('is degraded when events wait longer than a minute', async () => {
    await heartbeat(1, { status: 'ok' });
    await pendingEvent({ ageSeconds: 300 });

    const body = await health();
    expect(body.status).toBe('degraded');
    expect(body.outbox).toMatchObject({ pending: 1 });
    expect(body.outbox.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(300);
  });

  it('is degraded while the relay reports publishing errors', async () => {
    await heartbeat(1, { status: 'error', lastError: 'broker down', consecutiveFailures: 3 });
    await pendingEvent({ attempts: 3, error: 'Local: Message timed out' });

    const body = await health();
    expect(body.status).toBe('degraded');
    expect(body.components[0].status).toBe('degraded');
    expect(body.outbox).toMatchObject({ failing: 1, lastError: 'Local: Message timed out' });
  });

  it('is unhealthy when the relay stopped reporting and events are waiting', async () => {
    await heartbeat(120, { status: 'ok' });
    await pendingEvent({ ageSeconds: 90 });

    const body = await health();
    expect(body.status).toBe('unhealthy');
    expect(body.components[0].status).toBe('down');
  });
});
