import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { OPERATIONS, buildOpenApiDocument } from '../../src/openapi/spec.js';
import { buildTestConfig, createTestContext } from '../helpers/test-app.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let analyst;

beforeEach(async () => {
  await ctx.reset();
  await ctx.createUser({ email: 'analyst@example.test', role: 'analyst' });
  analyst = await ctx.loginAs('analyst@example.test');
});

describe('GET /api/metrics', () => {
  it('reports requests by route pattern, live streams, and pipeline state', async () => {
    await analyst.get('/api/orders/123').expect(404);
    await analyst.get('/api/orders/456').expect(404);
    await request(ctx.app).get('/api/no-such-route').expect(404);
    await ctx.db.query(
      `INSERT INTO event_outbox (event_type, aggregate_type, aggregate_id, payload)
       VALUES ('order.created', 'order', '1', '{}')`,
    );

    const res = await request(ctx.app).get('/api/metrics').expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    const text = res.text;
    // Ids never become labels: both requests count under one route pattern.
    expect(text).toMatch(
      /ecommerce_api_http_requests_total\{method="GET",route="\/api\/orders\/:id",status="404"\} 2/,
    );
    expect(text).toMatch(/ecommerce_api_http_requests_total\{[^}]*route="unmatched"[^}]*\} 1/);
    expect(text).toMatch(/ecommerce_api_http_request_duration_seconds_bucket\{/);
    expect(text).toMatch(/^ecommerce_api_event_streams 0$/m);
    expect(text).toMatch(/^ecommerce_outbox_pending_events 1$/m);
    expect(text).toMatch(
      /ecommerce_pipeline_component_status\{component="outbox-relay",status="unknown"\} 1/,
    );
    expect(text).toMatch(/^ecommerce_pipeline_scrape_ok 1$/m);
    expect(text).toMatch(/^ecommerce_api_process_cpu_seconds_total /m);
  });

  it('requires the bearer token when one is configured', async () => {
    const app = createApp({
      db: ctx.db,
      config: buildTestConfig({ metricsToken: 's3cret-token' }),
    });
    try {
      await request(app).get('/api/metrics').expect(401);
      await request(app).get('/api/metrics').set('Authorization', 'Bearer wrong').expect(401);
      await request(app)
        .get('/api/metrics')
        .set('Authorization', 'Bearer s3cret-token')
        .expect(200);
    } finally {
      await app.locals.eventHub.stop();
    }
  });
});

describe('API documentation', () => {
  it('serves the OpenAPI document and Swagger UI to signed-in users', async () => {
    const res = await analyst.get('/api/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    const createOrder = res.body.paths['/orders'].post;
    expect(createOrder.requestBody.content['application/json'].schema.properties).toHaveProperty(
      'customerId',
    );
    expect(createOrder.parameters.map((p) => p.name)).toContain('Idempotency-Key');
    const listOrders = res.body.paths['/orders'].get.parameters.map((p) => p.name);
    expect(listOrders).toEqual(expect.arrayContaining(['status', 'dateFrom', 'page', 'sort']));

    const page = await analyst.get('/api/docs/').expect(200);
    expect(page.text).toContain('swagger-initializer.js');
    const init = await analyst.get('/api/docs/swagger-initializer.js').expect(200);
    expect(init.text).toContain("url: '../openapi.json'");
    await analyst.get('/api/docs/swagger-ui-bundle.js').expect(200);

    await request(ctx.app).get('/api/openapi.json').expect(401);
    await request(ctx.app).get('/api/docs/').expect(401);
  });

  it('documents exactly the routes the app serves', () => {
    // Express 5 does not keep the path a router was mounted at, so record it while the app is
    // built, then walk the routers and compare with the documented operations.
    // The app's own router and express.Router() instances have different prototypes, and
    // `use` sits further up each chain: patch the objects that actually own it.
    const ownerOfUse = (object) => {
      let current = object;
      while (current && !Object.hasOwn(current, 'use')) current = Object.getPrototypeOf(current);
      return current;
    };
    const protos = [...new Set([ownerOfUse(express.Router()), ownerOfUse(express().router)])];
    const originals = protos.map((p) => p.use);
    const mounts = new Map();
    const recordingUse = (originalUse) =>
      function use(...args) {
        const path = typeof args[0] === 'string' ? args[0] : '';
        for (const handler of args.flat()) {
          if (handler && typeof handler === 'function' && Array.isArray(handler.stack)) {
            mounts.set(handler, path);
          }
        }
        return originalUse.apply(this, args);
      };
    protos.forEach((p, i) => (p.use = recordingUse(originals[i])));
    let app;
    try {
      app = createApp({ db: ctx.db, config: buildTestConfig() });
    } finally {
      protos.forEach((p, i) => (p.use = originals[i]));
    }

    const served = new Set();
    const walk = (router, prefix) => {
      for (const layer of router.stack) {
        if (layer.route) {
          for (const method of Object.keys(layer.route.methods)) {
            const path = `${prefix}${layer.route.path}`.replace(/(.)\/$/, '$1'); // '/orders/' → '/orders'
            served.add(`${method.toUpperCase()} ${path}`);
          }
        } else if (mounts.has(layer.handle)) {
          walk(layer.handle, `${prefix}${mounts.get(layer.handle)}`);
        }
      }
    };
    walk(app.router, '');
    app.locals.eventHub.stop();

    const documented = new Set();
    for (const [path, methods] of Object.entries(OPERATIONS)) {
      for (const method of Object.keys(methods)) {
        documented.add(`${method.toUpperCase()} /api${path.replace(/\{(\w+)\}/g, ':$1')}`);
      }
    }
    // Swagger UI's own files and the /docs redirect are not API operations.
    const ignored = (route) => route.includes('/api/docs');
    const servedApi = [...served].filter((r) => r.includes(' /api') && !ignored(r)).sort();
    expect(servedApi).toEqual([...documented].sort());
  });

  it('builds a document where every operation has a summary and responses', () => {
    const doc = buildOpenApiDocument();
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.summary, `${method} ${path}`).toBeTruthy();
        expect(Object.keys(operation.responses).length).toBeGreaterThan(1);
      }
    }
  });
});
