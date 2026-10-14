import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import * as f from './fixtures.js';

export const API = 'http://localhost/api';
const unauthorized = () =>
  HttpResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
    { status: 401 },
  );

/**
 * Default handlers: a signed-in admin and a populated dashboard. Tests override individual
 * endpoints with server.use(...) to simulate other states.
 */
export const handlers = [
  http.get(`${API}/auth/me`, () => HttpResponse.json({ user: f.adminUser })),
  http.post(`${API}/auth/login`, async ({ request }) => {
    const { email, password } = await request.json();
    if (email === f.adminUser.email && password === 'correct-password') {
      return HttpResponse.json({ user: f.adminUser });
    }
    return HttpResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
      { status: 401 },
    );
  }),
  http.post(`${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${API}/analytics/overview`, () => HttpResponse.json(f.overview)),
  http.get(`${API}/analytics/revenue`, () => HttpResponse.json(f.revenue)),
  http.get(`${API}/analytics/products/top`, () => HttpResponse.json(f.topProducts)),
  http.get(`${API}/analytics/categories`, () => HttpResponse.json(f.categories)),
  http.get(`${API}/analytics/order-status`, () => HttpResponse.json(f.orderStatus)),
  http.get(`${API}/analytics/customers`, () => HttpResponse.json(f.customers)),
  http.get(`${API}/analytics/inventory`, () => HttpResponse.json(f.inventory)),
  http.get(`${API}/analytics/anomalies`, () => HttpResponse.json(f.anomalies)),
  http.get(`${API}/pipeline/health`, () => HttpResponse.json(f.pipelineHealth)),
  http.get(`${API}/notifications`, () => HttpResponse.json(f.notificationsList)),
  http.post(`${API}/notifications/read`, () =>
    HttpResponse.json({ unreadCount: 0, lastReadAt: '2026-03-11T10:00:00.000Z' }),
  ),
  http.get(`${API}/activity`, () => HttpResponse.json(f.activity)),
  http.get(`${API}/audit-log`, () =>
    HttpResponse.json({ data: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }),
  ),
  http.get(`${API}/categories`, () => HttpResponse.json(f.categoriesList)),
  http.get(`${API}/products`, () => HttpResponse.json(f.productsList)),
  http.get(`${API}/customers`, () => HttpResponse.json(f.customersList)),
  http.get(`${API}/customers/:id`, () => HttpResponse.json({ customer: f.customer })),
  http.get(`${API}/customers/:id/insights`, () => HttpResponse.json(f.customerInsights)),
  http.get(`${API}/products/:id`, () => HttpResponse.json({ product: f.laptop })),
  http.get(`${API}/products/:id/insights`, () => HttpResponse.json(f.productInsights)),
  http.get(`${API}/orders`, () => HttpResponse.json(f.ordersList)),
  http.get(`${API}/orders/:id`, () => HttpResponse.json({ order: f.order })),
  http.get(`${API}/orders/:id/history`, () => HttpResponse.json(f.orderHistory)),
  http.get(`${API}/orders/:id/notes`, () => HttpResponse.json(f.orderNotes)),
  http.get(`${API}/inventory/movements`, () => HttpResponse.json(f.movementsList)),
  http.get(`${API}/users`, () => HttpResponse.json(f.usersList)),
];

export const server = setupServer(...handlers);
export { unauthorized };

/** Makes the signed-in user an analyst for the current test. */
export function signInAsAnalyst() {
  server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: f.analystUser })));
}
