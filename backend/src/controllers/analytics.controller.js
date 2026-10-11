export function createAnalyticsController({ analyticsService: s }) {
  const handler = (method) => async (req, res) => res.json(await s[method](req.validated.query));
  return {
    overview: handler('overview'),
    revenue: handler('revenue'),
    topProducts: handler('topProducts'),
    categories: handler('categories'),
    orderStatus: async (_req, res) => res.json(await s.orderStatus()),
    customers: handler('customers'),
    inventory: handler('inventory'),
    anomalies: handler('anomalies'),
  };
}
