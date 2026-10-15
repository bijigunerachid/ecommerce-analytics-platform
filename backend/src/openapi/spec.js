import { z } from 'zod';
import * as analytics from '../validation/analytics.schemas.js';
import { listAuditQuerySchema } from '../validation/audit.schemas.js';
import {
  changePasswordSchema,
  loginSchema,
  updateProfileSchema,
} from '../validation/auth.schemas.js';
import * as categories from '../validation/categories.schemas.js';
import * as customers from '../validation/customers.schemas.js';
import { productInsightsQuerySchema } from '../validation/insights.schemas.js';
import {
  createAdjustmentSchema,
  listMovementsQuerySchema,
} from '../validation/inventory.schemas.js';
import * as orders from '../validation/orders.schemas.js';
import * as products from '../validation/products.schemas.js';
import {
  activityQuerySchema,
  listNotificationsQuerySchema,
} from '../validation/realtime.schemas.js';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from '../validation/users.schemas.js';

/**
 * OpenAPI 3.1 description of the API, served at GET /api/openapi.json and shown with Swagger UI
 * at /api/docs. Request parameters and bodies are generated from the same Zod schemas the API
 * validates with, so they cannot drift from the real rules. A test checks that every route in
 * the app is documented here and every documented route exists. docs/api.md has the prose.
 */

const toSchema = (schema) => {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  });
  return json;
};

/** Query parameters from an object schema (each property becomes one parameter). */
function queryParameters(schema) {
  const json = toSchema(schema);
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name) && property.default === undefined,
    schema: property,
  }));
}

function pathParameters(path, schema) {
  const names = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const properties = schema ? (toSchema(schema).properties ?? {}) : {};
  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: properties[name] ?? { type: 'integer', minimum: 1 },
  }));
}

const ERROR_RESPONSE = { $ref: '#/components/responses/Error' };

/**
 * access: 'public' (no session), 'any' (any signed-in user), or 'admin'.
 * `ok` describes the success response; errors share one documented shape.
 */
function op({ summary, access = 'any', query, body, params, ok = 'OK', status = 200, extra = {} }) {
  return { summary, access, query, body, params, ok, status, extra };
}

const idempotencyKey = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description: 'A unique key per logical request (8–128 characters); a retry reuses it.',
  schema: { type: 'string', minLength: 8, maxLength: 128 },
};

const crud = (tag, name, schemas) => ({
  [`/${tag}`]: {
    get: op({ summary: `List ${tag}`, query: schemas.list, ok: `{ data: ${name}[], pagination }` }),
    post: op({ summary: `Create a ${name}`, access: 'admin', body: schemas.create, status: 201 }),
  },
  [`/${tag}/{id}`]: {
    get: op({ summary: `Get a ${name}` }),
    patch: op({ summary: `Update a ${name}`, access: 'admin', body: schemas.update }),
    delete: op({ summary: `Delete a ${name}`, access: 'admin', status: 204, ok: 'Deleted' }),
  },
});

export const OPERATIONS = {
  '/health': { get: op({ summary: 'Readiness (database reachable)', access: 'public' }) },
  '/health/live': { get: op({ summary: 'Liveness', access: 'public' }) },
  '/metrics': {
    get: op({
      summary: 'Prometheus metrics (text format; bearer token if METRICS_TOKEN is set)',
      access: 'public',
      ok: 'Prometheus exposition format',
    }),
  },
  '/openapi.json': { get: op({ summary: 'This OpenAPI document' }) },

  '/auth/login': {
    post: op({ summary: 'Sign in (sets the session cookie)', access: 'public', body: loginSchema }),
  },
  '/auth/logout': { post: op({ summary: 'Sign out', access: 'public', status: 204 }) },
  '/auth/me': {
    get: op({ summary: 'The signed-in user' }),
    patch: op({ summary: 'Update your profile', body: updateProfileSchema }),
  },
  '/auth/password': {
    post: op({ summary: 'Change your password', body: changePasswordSchema, status: 204 }),
  },
  '/auth/sessions/revoke-others': {
    post: op({ summary: 'Sign out all other sessions', status: 204 }),
  },

  '/users': {
    get: op({ summary: 'List staff accounts', access: 'admin' }),
    post: op({
      summary: 'Create a staff account',
      access: 'admin',
      body: createUserSchema,
      status: 201,
    }),
  },
  '/users/{id}': {
    patch: op({ summary: 'Update a staff account', access: 'admin', body: updateUserSchema }),
  },
  '/users/{id}/password': {
    post: op({ summary: 'Reset a password', access: 'admin', body: resetPasswordSchema }),
  },
  '/audit-log': {
    get: op({ summary: 'Audit log', access: 'admin', query: listAuditQuerySchema }),
  },

  ...crud('categories', 'category', {
    list: categories.listCategoriesQuerySchema,
    create: categories.createCategorySchema,
    update: categories.updateCategorySchema,
  }),
  ...crud('products', 'product', {
    list: products.listProductsQuerySchema,
    create: products.createProductSchema,
    update: products.updateProductSchema,
  }),
  ...crud('customers', 'customer', {
    list: customers.listCustomersQuerySchema,
    create: customers.createCustomerSchema,
    update: customers.updateCustomerSchema,
  }),
  '/products/{id}/insights': {
    get: op({
      summary: 'Sales, stock history, and restock advice',
      query: productInsightsQuerySchema,
    }),
  },
  '/customers/{id}/insights': {
    get: op({ summary: 'Segment, lifetime value, and monthly spend' }),
  },

  '/orders': {
    get: op({ summary: 'List orders', query: orders.listOrdersQuerySchema }),
    post: op({
      summary: 'Place an order (prices computed by the server)',
      access: 'admin',
      body: orders.createOrderSchema,
      status: 201,
      extra: { parameters: [idempotencyKey] },
    }),
  },
  '/orders/{id}': { get: op({ summary: 'Get an order with its lines' }) },
  '/orders/{id}/status': {
    patch: op({
      summary: 'Change the status',
      access: 'admin',
      body: orders.updateOrderStatusSchema,
    }),
  },
  '/orders/{id}/history': { get: op({ summary: 'Status history' }) },
  '/orders/{id}/notes': {
    get: op({ summary: 'Staff notes' }),
    post: op({
      summary: 'Add a note',
      access: 'admin',
      body: orders.createOrderNoteSchema,
      status: 201,
    }),
  },
  '/orders/bulk-status': {
    post: op({
      summary: 'Change the status of several orders',
      access: 'admin',
      body: orders.bulkUpdateOrderStatusSchema,
    }),
  },

  '/inventory/movements': {
    get: op({ summary: 'Inventory ledger', query: listMovementsQuerySchema }),
  },
  '/inventory/adjustments': {
    post: op({
      summary: 'Restock or adjust stock',
      access: 'admin',
      body: createAdjustmentSchema,
      status: 201,
      extra: { parameters: [idempotencyKey] },
    }),
  },

  '/exports/{file}': {
    get: op({
      summary:
        'CSV export (orders.csv, products.csv, customers.csv, inventory-movements.csv, audit-log.csv, sales-daily.csv, top-products.csv); takes the filters of the matching list and format=csv|excel',
      ok: 'text/csv attachment',
      extra: {
        parameters: [
          {
            name: 'format',
            in: 'query',
            schema: { type: 'string', enum: ['csv', 'excel'], default: 'csv' },
          },
        ],
      },
    }),
  },

  '/notifications': {
    get: op({ summary: 'Notifications with unread state', query: listNotificationsQuerySchema }),
  },
  '/notifications/read': { post: op({ summary: 'Mark all notifications as read' }) },
  '/activity': { get: op({ summary: 'Latest order events', query: activityQuerySchema }) },
  '/stream': {
    get: op({
      summary: 'Live events (Server-Sent Events: order, notification, resync, session-ended)',
      ok: 'text/event-stream',
    }),
  },
  '/pipeline/health': { get: op({ summary: 'Outbox relay and stream processor health' }) },

  '/analytics/overview': {
    get: op({ summary: 'KPIs vs the previous period', query: analytics.rangeQuerySchema }),
  },
  '/analytics/revenue': {
    get: op({ summary: 'Revenue series', query: analytics.revenueQuerySchema }),
  },
  '/analytics/products/top': {
    get: op({ summary: 'Best-selling products', query: analytics.topProductsQuerySchema }),
  },
  '/analytics/categories': {
    get: op({ summary: 'Revenue by category', query: analytics.rangeQuerySchema }),
  },
  '/analytics/order-status': { get: op({ summary: 'Orders by current status' }) },
  '/analytics/customers': {
    get: op({ summary: 'New and returning customers', query: analytics.customersQuerySchema }),
  },
  '/analytics/inventory': {
    get: op({ summary: 'Stock cover and movements', query: analytics.inventoryQuerySchema }),
  },
  '/analytics/anomalies': {
    get: op({ summary: 'Detected anomalies', query: analytics.anomaliesQuerySchema }),
  },
  '/analytics/segments': { get: op({ summary: 'Customer segments (RFM)' }) },
  '/analytics/segments/{segment}/customers': {
    get: op({
      summary: 'Customers of a segment',
      params: analytics.segmentParamsSchema,
      query: analytics.segmentCustomersQuerySchema,
    }),
  },
  '/analytics/cohorts': {
    get: op({ summary: 'Weekly cohort retention', query: analytics.cohortsQuerySchema }),
  },
  '/analytics/forecast': { get: op({ summary: '14-day sales forecast' }) },
};

const TAGS = [
  ['health', 'Health and monitoring'],
  ['auth', 'Sign-in and your account'],
  ['users', 'Staff accounts'],
  ['audit-log', 'Audit log'],
  ['categories', 'Categories'],
  ['products', 'Products'],
  ['customers', 'Customers'],
  ['orders', 'Orders'],
  ['inventory', 'Inventory'],
  ['exports', 'CSV exports'],
  ['realtime', 'Notifications and live updates'],
  ['analytics', 'Analytics'],
];

function tagOf(path) {
  const first = path.split('/')[1];
  if (['health', 'metrics', 'openapi.json', 'pipeline'].includes(first)) return 'health';
  if (['notifications', 'activity', 'stream'].includes(first)) return 'realtime';
  return first;
}

const ACCESS_TEXT = {
  public: 'No session required.',
  any: 'Any signed-in user (admin or analyst).',
  admin: 'Admins only.',
};

export function buildOpenApiDocument() {
  const paths = {};
  for (const [path, methods] of Object.entries(OPERATIONS)) {
    paths[path] = {};
    for (const [method, o] of Object.entries(methods)) {
      const parameters = [
        ...pathParameters(path, o.params),
        ...(o.query ? queryParameters(o.query) : []),
        ...(o.extra.parameters ?? []),
      ];
      paths[path][method] = {
        tags: [tagOf(path)],
        summary: o.summary,
        description: ACCESS_TEXT[o.access],
        ...(o.access === 'public' ? { security: [] } : {}),
        ...(parameters.length ? { parameters } : {}),
        ...(o.body
          ? {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: toSchema(o.body) } },
              },
            }
          : {}),
        responses: {
          [o.status]: { description: o.ok },
          ...(o.access === 'public' ? {} : { 401: ERROR_RESPONSE }),
          ...(o.access === 'admin' ? { 403: ERROR_RESPONSE } : {}),
          default: ERROR_RESPONSE,
        },
      };
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Commerce Analytics API',
      version: '1.0.0',
      description:
        'Operations and analytics API. Sign in with POST /auth/login: the session is an HttpOnly cookie, so requests from this page use it automatically. Money values are decimal strings, times are ISO 8601 UTC. See docs/api.md for the details of each endpoint.',
    },
    servers: [{ url: '/api' }],
    tags: TAGS.map(([name, description]) => ({ name, description })),
    security: [{ sessionCookie: [] }],
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'access_token' },
      },
      responses: {
        Error: {
          description: 'Error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['error'],
                properties: {
                  error: {
                    type: 'object',
                    required: ['code', 'message'],
                    properties: {
                      code: { type: 'string', examples: ['VALIDATION_ERROR', 'NOT_FOUND'] },
                      message: { type: 'string' },
                      details: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    paths,
  };
}
