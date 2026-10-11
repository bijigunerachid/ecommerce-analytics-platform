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
