import { z } from 'zod';
import { listAuditQuerySchema } from '../validation/audit.schemas.js';
import { revenueQuerySchema, topProductsQuerySchema } from '../validation/analytics.schemas.js';
import { listCustomersQuerySchema } from '../validation/customers.schemas.js';
import { listMovementsQuerySchema } from '../validation/inventory.schemas.js';
import { listOrdersQuerySchema } from '../validation/orders.schemas.js';
import { listProductsQuerySchema } from '../validation/products.schemas.js';

/** The list filters, without paging or the export's own `format` parameter. */
const filtersOf = (schema) =>
  z.preprocess((q) => {
    const { format: _format, page: _page, pageSize: _pageSize, ...filters } = q ?? {};
    return filters;
  }, schema);

const money = (key, label) => ({ key, label, type: 'number' });
const num = (key, label) => ({ key, label, type: 'number' });
const date = (key, label) => ({ key, label, type: 'date' });
const text = (key, label) => ({ key, label });

/**
 * Each export: who may download it, the query it accepts (the same filters as the list on
 * screen), its columns, and how to fetch a page of rows. `fetchPage` returns { rows, total }.
 */
export function createExportDefinitions({
  ordersService,
  productsService,
  customersService,
  inventoryService,
  auditRepository,
  analyticsService,
}) {
  const fromList = (list) => async (query, page, pageSize) => {
    const { data, pagination } = await list({ ...query, page, pageSize });
    return { rows: data, total: pagination.total };
  };

  return {
    orders: {
      label: 'orders',
      query: filtersOf(listOrdersQuerySchema),
      fetchPage: fromList((q) => ordersService.list(q)),
      columns: [
        num('id', 'Order'),
        date('createdAt', 'Placed at (UTC)'),
        text('status', 'Status'),
        num('customerId', 'Customer ID'),
        text('customerName', 'Customer'),
        text('customerEmail', 'Customer email'),
        num('itemCount', 'Lines'),
        money('totalAmount', 'Total'),
        date('updatedAt', 'Last updated (UTC)'),
      ],
    },

    products: {
      label: 'products',
      query: filtersOf(listProductsQuerySchema),
      fetchPage: fromList((q) => productsService.list(q)),
      columns: [
        num('id', 'Product ID'),
        text('sku', 'SKU'),
        text('name', 'Name'),
        text('categoryName', 'Category'),
        money('price', 'Price'),
        num('stockQuantity', 'In stock'),
        num('reorderLevel', 'Reorder level'),
        { key: 'isLowStock', label: 'Low stock', type: 'boolean' },
        { key: 'isActive', label: 'Active', type: 'boolean' },
        date('createdAt', 'Created (UTC)'),
      ],
    },

    customers: {
      label: 'customers',
      query: filtersOf(listCustomersQuerySchema),
      fetchPage: fromList((q) => customersService.list(q)),
      columns: [
        num('id', 'Customer ID'),
        text('firstName', 'First name'),
        text('lastName', 'Last name'),
        text('email', 'Email'),
        text('phone', 'Phone'),
        text('city', 'City'),
        text('country', 'Country'),
        num('orderCount', 'Orders'),
        money('totalSpent', 'Total spent'),
        date('lastOrderAt', 'Last order (UTC)'),
        date('createdAt', 'Customer since (UTC)'),
      ],
    },

    'inventory-movements': {
      label: 'stock movements',
      query: filtersOf(listMovementsQuerySchema),
      fetchPage: fromList((q) => inventoryService.listMovements(q)),
      columns: [
        num('id', 'Movement ID'),
        date('createdAt', 'When (UTC)'),
        num('productId', 'Product ID'),
        text('sku', 'SKU'),
        text('productName', 'Product'),
        num('quantityChange', 'Change'),
        text('reason', 'Reason'),
        num('orderId', 'Order'),
        text('note', 'Note'),
      ],
    },

    'audit-log': {
      label: 'audit log entries',
      adminOnly: true,
      query: filtersOf(listAuditQuerySchema),
      fetchPage: async (query, page, pageSize) => {
        const { items, total } = await auditRepository.list({ ...query, page, pageSize });
        return { rows: items, total };
      },
      columns: [
        num('id', 'Entry'),
        date('occurredAt', 'When (UTC)'),
        { key: 'actor', label: 'Who', value: (e) => e.actor?.email ?? 'System' },
        text('action', 'Action'),
        text('entityType', 'Entity type'),
        text('entityId', 'Entity ID'),
        text('summary', 'What happened'),
        { key: 'details', label: 'Details', value: (e) => JSON.stringify(e.details ?? {}) },
        text('ip', 'IP address'),
      ],
    },

    'sales-daily': {
      label: 'days of sales',
      query: filtersOf(revenueQuerySchema).transform((q) => ({ ...q, interval: 'day' })),
      fetchPage: async (query) => {
        const { series } = await analyticsService.revenue(query);
        return { rows: series, total: series.length, complete: true };
      },
      columns: [
        {
          key: 'bucket',
          label: 'Day (UTC)',
          value: (r) => new Date(r.bucket).toISOString().slice(0, 10),
        },
        num('orders', 'Orders'),
        num('cancelledOrders', 'Cancelled orders'),
        money('grossRevenue', 'Gross revenue'),
        money('cancelledRevenue', 'Cancelled revenue'),
        money('netRevenue', 'Net revenue'),
        money('averageOrderValue', 'Average order value'),
        num('itemsSold', 'Items sold'),
      ],
    },

    'top-products': {
      label: 'products',
      query: filtersOf(topProductsQuerySchema).transform((q) => ({ ...q, limit: 50 })),
      fetchPage: async (query) => {
        const { products } = await analyticsService.topProducts(query);
        const rows = products.map((p, i) => ({ ...p, rank: i + 1 }));
        return { rows, total: rows.length, complete: true };
      },
      columns: [
        num('rank', 'Rank'),
        num('productId', 'Product ID'),
        text('sku', 'SKU'),
        text('name', 'Product'),
        text('categoryName', 'Category'),
        num('unitsSold', 'Units sold'),
        money('revenue', 'Revenue'),
        num('orders', 'Orders'),
        num('revenueShare', 'Share of revenue (%)'),
      ],
    },
  };
}
