// API response fixtures shaped exactly like the backend's (see docs/api.md).

export const adminUser = {
  id: 1,
  email: 'admin@example.test',
  fullName: 'Ada Admin',
  role: 'admin',
  isActive: true,
};

const range = { from: '2026-02-10', to: '2026-03-11', days: 30 };

export const overview = {
  range,
  previousRange: { from: '2026-01-11', to: '2026-02-09' },
  current: {
    netRevenue: '128450.75',
    grossRevenue: '134200.00',
    cancelledRevenue: '5749.25',
    orders: 1520,
    cancelledOrders: 91,
    netOrders: 1429,
    cancellationRate: 6,
    averageOrderValue: '89.89',
    itemsSold: 3110,
    newCustomers: 402,
    activeCustomers: 1100,
  },
  previous: {},
  change: {
    netRevenue: 12.4,
    orders: -3.2,
    averageOrderValue: 5,
    itemsSold: 1,
    cancellationRate: 2.5,
    newCustomers: null,
    activeCustomers: 0,
  },
  dataAsOf: '2026-03-11T10:00:00.000Z',
};

export const revenue = {
  range,
  interval: 'day',
  series: [
    {
      bucket: '2026-03-10T00:00:00.000Z',
      netRevenue: '4100.00',
      grossRevenue: '4300.00',
      cancelledRevenue: '200.00',
      orders: 50,
      cancelledOrders: 2,
      averageOrderValue: '85.42',
      itemsSold: 99,
    },
    {
      bucket: '2026-03-11T00:00:00.000Z',
      netRevenue: '3900.50',
      grossRevenue: '3900.50',
      cancelledRevenue: '0.00',
      orders: 45,
      cancelledOrders: 0,
      averageOrderValue: '86.68',
      itemsSold: 90,
    },
  ],
  dataAsOf: overview.dataAsOf,
};

export const topProducts = {
  range,
  sortBy: 'revenue',
  products: [
    {
      productId: 1,
      sku: 'ELC-LAPTOP-14',
      name: 'Aurora 14" Laptop',
      categoryName: 'Electronics',
      unitsSold: 40,
      revenue: '51960.00',
      orders: 38,
      revenueShare: 40.5,
    },
    {
      productId: 2,
      sku: 'AUD-EARBUDS',
      name: 'True Wireless Earbuds',
      categoryName: 'Audio',
      unitsSold: 210,
      revenue: '24990.00',
      orders: 190,
      revenueShare: 19.5,
    },
  ],
  dataAsOf: overview.dataAsOf,
};

export const categories = {
  range,
  categories: [
    {
      categoryId: 1,
      name: 'Electronics',
      revenue: '80000.00',
      unitsSold: 500,
      productsSold: 6,
      revenueShare: 62.3,
    },
    {
      categoryId: 2,
      name: 'Audio',
      revenue: '48450.75',
      unitsSold: 700,
      productsSold: 5,
      revenueShare: 37.7,
    },
  ],
  dataAsOf: overview.dataAsOf,
};

export const orderStatus = {
  total: 100,
  statuses: [
    { status: 'pending', orders: 10, share: 10 },
    { status: 'paid', orders: 20, share: 20 },
    { status: 'shipped', orders: 15, share: 15 },
    { status: 'delivered', orders: 50, share: 50 },
    { status: 'cancelled', orders: 5, share: 5 },
  ],
  dataAsOf: overview.dataAsOf,
};

export const customers = {
  range,
  interval: 'day',
  summary: {
    customersWithOrders: 1672,
    repeatCustomers: 784,
    repeatPurchaseRate: 46.9,
    averageRevenuePerCustomer: '723.44',
  },
  series: [
    {
      bucket: '2026-03-10T00:00:00.000Z',
      activeCustomers: 40,
      newCustomers: 12,
      returningCustomers: 28,
      orders: 50,
    },
    {
      bucket: '2026-03-11T00:00:00.000Z',
      activeCustomers: 38,
      newCustomers: 9,
      returningCustomers: 29,
      orders: 45,
    },
  ],
  topCustomers: [],
  dataAsOf: overview.dataAsOf,
};

export const inventory = {
  range,
  summary: {
    activeProducts: 34,
    unitsIn: 900,
    unitsOut: 3110,
    lowStockProducts: 3,
    outOfStockProducts: 1,
    noSalesProducts: 0,
  },
  products: [
    {
      productId: 7,
      sku: 'ELC-MOUSE-WL',
      name: 'Wireless Mouse',
      isActive: true,
      stock: 0,
      reorderLevel: 40,
      unitsIn: 0,
      unitsOut: 300,
      averageDailyUnitsOut: 10,
      daysOfCover: 0,
      sellThroughRate: 100,
      isLowStock: true,
      isOutOfStock: true,
    },
    {
      productId: 8,
      sku: 'FSH-TSHIRT',
      name: 'Organic Cotton T-Shirt',
      isActive: true,
      stock: 20,
      reorderLevel: 50,
      unitsIn: 0,
      unitsOut: 250,
      averageDailyUnitsOut: 8.33,
      daysOfCover: 2.4,
      sellThroughRate: 92.6,
      isLowStock: true,
      isOutOfStock: false,
    },
  ],
  dataAsOf: overview.dataAsOf,
};

export const anomalies = {
  range,
  summary: { total: 1, byType: { high_value_order: 1 }, bySeverity: { high: 1 } },
  data: [
    {
      id: 1,
      type: 'high_value_order',
      severity: 'high',
      entityType: 'order',
      entityId: '5356',
      occurredAt: '2026-03-06T11:20:00.000Z',
      detectedAt: '2026-03-06T11:20:10.000Z',
      description: 'Order total 32475.00 is 12.7x the 99th percentile of the last 30 days',
      details: {},
    },
  ],
  pagination: { page: 1, pageSize: 6, total: 1, totalPages: 1 },
  dataAsOf: overview.dataAsOf,
};

export const pipelineHealth = {
  status: 'healthy',
  outbox: {
    pending: 0,
    failing: 0,
    oldestPendingAgeSeconds: null,
    lastPublishedAt: '2026-03-11T09:59:00.000Z',
    publishedLastHour: 128,
    lastError: null,
  },
  components: [
    {
      component: 'outbox-relay',
      status: 'up',
      lastSeenAt: '2026-03-11T09:59:58.000Z',
      details: { status: 'ok' },
    },
    {
      component: 'spark-streaming',
      status: 'up',
      lastSeenAt: '2026-03-11T09:59:55.000Z',
      details: { status: 'ok', kafkaLag: 0 },
    },
  ],
  checkedAt: '2026-03-11T10:00:00.000Z',
};
