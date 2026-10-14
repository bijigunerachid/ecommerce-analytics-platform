import { api } from './client.js';

export const authApi = {
  me: (options) => api.get('/auth/me', { ...options, skipUnauthorizedEvent: true }),
  login: (email, password) =>
    api.post('/auth/login', { email, password }, { skipUnauthorizedEvent: true }),
  logout: () => api.post('/auth/logout', undefined, { skipUnauthorizedEvent: true }),
  updateProfile: (body) => api.patch('/auth/me', body),
  changePassword: (body) => api.post('/auth/password', body),
  revokeOtherSessions: () => api.post('/auth/sessions/revoke-others'),
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
  segments: (options) => api.get('/analytics/segments', options),
  segmentCustomers: (segment, params, options) =>
    api.get(`/analytics/segments/${segment}/customers`, { params, ...options }),
  cohorts: (params, options) => api.get('/analytics/cohorts', { params, ...options }),
  forecast: (options) => api.get('/analytics/forecast', options),
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
export const productsApi = {
  ...resource('/products'),
  insights: (id, params, options) => api.get(`/products/${id}/insights`, { params, ...options }),
};
export const customersApi = {
  ...resource('/customers'),
  insights: (id, options) => api.get(`/customers/${id}/insights`, options),
};

export const ordersApi = {
  list: (params, options) => api.get('/orders', { params, ...options }),
  get: (id, options) => api.get(`/orders/${id}`, options),
  /** The idempotency key must stay the same when the same order is retried. */
  create: (body, idempotencyKey) =>
    api.post('/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
  updateStatus: (id, status, note) =>
    api.patch(`/orders/${id}/status`, note ? { status, note } : { status }),
  bulkUpdateStatus: (orderIds, status, note) =>
    api.post('/orders/bulk-status', note ? { orderIds, status, note } : { orderIds, status }),
  history: (id, options) => api.get(`/orders/${id}/history`, options),
  notes: (id, options) => api.get(`/orders/${id}/notes`, options),
  addNote: (id, body) => api.post(`/orders/${id}/notes`, { body }),
};

export const inventoryApi = {
  movements: (params, options) => api.get('/inventory/movements', { params, ...options }),
  adjust: (body, idempotencyKey) =>
    api.post('/inventory/adjustments', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
};

export const usersApi = {
  list: (options) => api.get('/users', options),
  create: (body) => api.post('/users', body),
  update: (id, body) => api.patch(`/users/${id}`, body),
  resetPassword: (id, password) => api.post(`/users/${id}/password`, { password }),
};

export const exportsApi = {
  /** Downloads /exports/<name>.csv with the given list filters; resolves to { blob, filename }. */
  download: (name, params, format = 'csv') =>
    api.get(`/exports/${name}.csv`, {
      params: { ...params, format },
      headers: { Accept: 'text/csv' },
      responseType: 'blob',
    }),
};

export const auditApi = {
  list: (params, options) => api.get('/audit-log', { params, ...options }),
};

export const notificationsApi = {
  list: (params, options) => api.get('/notifications', { params, ...options }),
  markAllRead: () => api.post('/notifications/read'),
};

export const activityApi = {
  recent: (params, options) => api.get('/activity', { params, ...options }),
};
