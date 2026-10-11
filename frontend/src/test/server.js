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
];

export const server = setupServer(...handlers);
export { unauthorized };
