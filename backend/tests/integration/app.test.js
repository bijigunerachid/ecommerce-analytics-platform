import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { buildTestConfig, createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

describe('health checks', () => {
  it('GET /api/health reports the database as up', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
  });

  it('GET /api/health returns 503 when the database is unreachable', async () => {
    const brokenDb = { query: () => Promise.reject(new Error('connection refused')) };
    const app = createApp({ db: brokenDb, config: buildTestConfig() });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });

  it('GET /api/health/live does not depend on the database', async () => {
    const brokenDb = { query: () => Promise.reject(new Error('down')) };
    const app = createApp({ db: brokenDb, config: buildTestConfig() });
    expect((await request(app).get('/api/health/live')).status).toBe(200);
  });
});

describe('error handling', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(ctx.app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 413 for oversized bodies', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'a@example.test', password: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });

  it('hides internal error details behind a generic 500', async () => {
    const failingDb = {
      query: () => Promise.reject(new Error('relation "secret_table" does not exist')),
    };
    const app = createApp({ db: failingDb, config: buildTestConfig() });
    const originalError = console.error;
    console.error = () => {}; // keep the expected log out of test output
    try {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@example.test', password: 'whatever' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      });
      expect(res.text).not.toContain('secret_table');
    } finally {
      console.error = originalError;
    }
  });
});

describe('security headers and CORS', () => {
  it('sets helmet headers and hides the framework', async () => {
    const res = await request(ctx.app).get('/api/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows credentialed requests from the configured frontend origin', async () => {
    const res = await request(ctx.app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS access to other origins', async () => {
    const res = await request(ctx.app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
