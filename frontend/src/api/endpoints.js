import { api } from './client.js';

export const authApi = {
  me: (options) => api.get('/auth/me', { ...options, skipUnauthorizedEvent: true }),
  login: (email, password) =>
    api.post('/auth/login', { email, password }, { skipUnauthorizedEvent: true }),
  logout: () => api.post('/auth/logout', undefined, { skipUnauthorizedEvent: true }),
};

export const analyticsApi = {
  overview: (params, options) => api.get('/analytics/overview', { params, ...options }),
  revenue: (params, options) => api.get('/analytics/revenue', { params, ...options }),
  topProducts: (params, options) => api.get('/analytics/products/top', { params, ...options }),
  categories: (params, options) => api.get('/analytics/categories', { params, ...options }),
  orderStatus: (options) => api.get('/analytics/order-status', options),
  customers: (params, options) => api.get('/analytics/customers', { params, ...options }),
  inventory: (params, options) => api.get('/analytics/inventory', { params, ...options }),
  anomalies: (params, options) => api.get('/analytics/anomalies', { params, ...options }),
};

export const pipelineApi = {
  health: (options) => api.get('/pipeline/health', options),
};

const resource = (base) => ({
  list: (params, options) => api.get(base, { params, ...options }),
  get: (id, options) => api.get(`${base}/${id}`, options),
  create: (body) => api.post(base, body),
  update: (id, body) => api.patch(`${base}/${id}`, body),
  remove: (id) => api.delete(`${base}/${id}`),
});

export const categoriesApi = resource('/categories');
export const productsApi = resource('/products');
export const customersApi = resource('/customers');

export const ordersApi = {
  list: (params, options) => api.get('/orders', { params, ...options }),
  get: (id, options) => api.get(`/orders/${id}`, options),
  /** The idempotency key must stay the same when the same order is retried. */
  create: (body, idempotencyKey) =>
    api.post('/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
};

export const inventoryApi = {
  movements: (params, options) => api.get('/inventory/movements', { params, ...options }),
  adjust: (body, idempotencyKey) =>
    api.post('/inventory/adjustments', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
};

export const usersApi = {
  list: (options) => api.get('/users', options),
  create: (body) => api.post('/users', body),
};
