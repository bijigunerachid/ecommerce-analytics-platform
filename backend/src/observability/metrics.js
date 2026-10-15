import client from 'prom-client';
import { OPERATIONS } from '../openapi/spec.js';

// Seconds; covers fast reads (a few ms) up to slow exports.
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const COMPONENT_STATUSES = ['up', 'degraded', 'down', 'unknown'];

/**
 * Route patterns for labels, from the documented operations: /api/orders/123 → /api/orders/:id.
 * Matching the URL (rather than reading Express's req.route) gives the same label whether the
 * request succeeded or failed, and anything undocumented counts as "unmatched".
 */
const ROUTES = Object.entries(OPERATIONS).map(([path, methods]) => {
  const pattern = `/api${path.replace(/\{(\w+)\}/g, ':$1')}`;
  const regex = new RegExp(`^/api${path.replace(/\{\w+\}/g, '[^/]+')}$`);
  return { pattern, regex, methods: new Set(Object.keys(methods).map((m) => m.toUpperCase())) };
});
// Fewer parameters first, so literal paths win (/orders/bulk-status before /orders/:id).
const paramCount = (route) => route.pattern.split(':').length;
ROUTES.sort((a, b) => paramCount(a) - paramCount(b));

export function routeLabel(method, url) {
  const path = url.split('?')[0].replace(/\/+$/, '') || '/';
  const route = ROUTES.find((r) => r.methods.has(method) && r.regex.test(path));
  return route ? route.pattern : path.startsWith('/api/docs') ? '/api/docs' : 'unmatched';
}

/**
 * Prometheus metrics for the API (text format at GET /api/metrics):
 * - HTTP request count and latency per documented route pattern (e.g. /api/orders/:id, never
 *   raw ids, so the number of series stays small),
 * - live event streams, and
 * - pipeline state (outbox backlog, component status, Kafka lag), read from the same source as
 *   GET /api/pipeline/health on every scrape.
 * Each app gets its own registry, so tests can create several apps in one process.
 */
export function createMetrics({ pipelineService, eventHub }) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: 'ecommerce_api_' });

  const requests = new client.Counter({
    name: 'ecommerce_api_http_requests_total',
    help: 'HTTP requests by method, route pattern, and status code',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const duration = new client.Histogram({
    name: 'ecommerce_api_http_request_duration_seconds',
    help: 'HTTP request duration by method and route pattern',
    labelNames: ['method', 'route'],
    buckets: DURATION_BUCKETS,
    registers: [registry],
  });

  new client.Gauge({
    name: 'ecommerce_api_event_streams',
    help: 'Open live event streams (GET /api/stream)',
    registers: [registry],
    collect() {
      this.set(eventHub.subscriberCount);
    },
  });

  // Pipeline state is read once per scrape: prom-client collects metrics in parallel, so every
  // pipeline gauge awaits the same in-flight query and then sets its own value.
  let inFlight = null;
  const pipelineState = () => {
    inFlight ??= pipelineService
      .health()
      .then((health) => ({ ok: true, health }))
      .catch(() => ({ ok: false }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
  const pipelineGauge = (options, fill) =>
    new client.Gauge({
      ...options,
      registers: [registry],
      async collect() {
        const state = await pipelineState();
        if (state.ok) fill(this, state.health);
      },
    });

  // When the read fails, the other pipeline gauges keep their last values; this one says so.
  new client.Gauge({
    name: 'ecommerce_pipeline_scrape_ok',
    help: '1 if pipeline state could be read for this scrape, 0 if the database query failed',
    registers: [registry],
    async collect() {
      this.set((await pipelineState()).ok ? 1 : 0);
    },
  });
  pipelineGauge(
    { name: 'ecommerce_outbox_pending_events', help: 'Business events waiting to be published' },
    (gauge, h) => gauge.set(h.outbox.pending),
  );
  pipelineGauge(
    {
      name: 'ecommerce_outbox_failing_events',
      help: 'Pending events whose last publish attempt failed',
    },
    (gauge, h) => gauge.set(h.outbox.failing),
  );
  pipelineGauge(
    {
      name: 'ecommerce_outbox_oldest_pending_age_seconds',
      help: 'Age of the oldest unpublished event (0 when none)',
    },
    (gauge, h) => gauge.set(h.outbox.oldestPendingAgeSeconds ?? 0),
  );
  pipelineGauge(
    {
      name: 'ecommerce_pipeline_component_status',
      help: 'Pipeline component status: 1 for the current status, 0 for the others',
      labelNames: ['component', 'status'],
    },
    (gauge, h) => {
      for (const c of h.components) {
        for (const status of COMPONENT_STATUSES) {
          gauge.set({ component: c.component, status }, c.status === status ? 1 : 0);
        }
      }
    },
  );
  pipelineGauge(
    {
      name: 'ecommerce_pipeline_kafka_lag',
      help: 'Kafka messages not yet processed by the stream processor',
    },
    (gauge, h) => {
      const spark = h.components.find((c) => c.component === 'spark-streaming');
      if (typeof spark?.details?.kafkaLag === 'number') gauge.set(spark.details.kafkaLag);
    },
  );

  return {
    registry,

    /** Records every request under its route pattern once the response is finished. */
    middleware(req, res, next) {
      const end = duration.startTimer();
      res.on('finish', () => {
        const route = routeLabel(req.method, req.originalUrl);
        end({ method: req.method, route });
        requests.inc({ method: req.method, route, status: String(res.statusCode) });
      });
      next();
    },
  };
}
