import { useState } from 'react';
import { analyticsApi } from '../../api/endpoints.js';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartFrame, DataTable } from '../../components/charts/ChartFrame.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { QueryState } from '../../components/ui/States.jsx';
import { NO_DATA_MESSAGE } from './messages.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { formatMoney, formatNumber, formatPercent } from '../../utils/format.js';
import { topWithOther } from './top-with-other.js';

const STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function TopProductsPanel({ range, refreshKey }) {
  const [sortBy, setSortBy] = useState('revenue');
  const query = useApiQuery(
    (signal) =>
      analyticsApi.topProducts({ from: range.from, to: range.to, sortBy, limit: 8 }, { signal }),
    [range.from, range.to, sortBy, refreshKey],
  );
  const byRevenue = sortBy === 'revenue';
  return (
    <ChartFrame
      title="Best-selling products"
      description={byRevenue ? 'By revenue in the period' : 'By units sold in the period'}
      actions={
        <SegmentedControl
          label="Rank by"
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: 'revenue', label: 'Revenue' },
            { value: 'units', label: 'Units' },
          ]}
        />
      }
      chart={
        <QueryState
          query={query}
          emptyMessage={NO_DATA_MESSAGE}
          isEmpty={(d) => d.products.length === 0}
          height="h-80"
        >
          {(data) => (
            <BarList
              label="Best-selling products"
              items={data.products.map((p) => ({
                key: p.productId,
                label: p.name ?? p.sku,
                value: byRevenue ? Number(p.revenue) : p.unitsSold,
                product: p,
              }))}
              formatValue={(v) => (byRevenue ? formatMoney(v, { compact: true }) : formatNumber(v))}
              formatSecondary={(item) =>
                byRevenue
                  ? formatPercent(item.product.revenueShare)
                  : `${formatMoney(item.product.revenue, { compact: true })}`
              }
            />
          )}
        </QueryState>
      }
      table={
        query.data && (
          <DataTable
            caption="Best-selling products"
            columns={[
              { key: 'name', label: 'Product', render: (p) => p.name ?? p.sku },
              { key: 'categoryName', label: 'Category' },
              {
                key: 'unitsSold',
                label: 'Units',
                align: 'right',
                render: (p) => formatNumber(p.unitsSold),
              },
              {
                key: 'revenue',
                label: 'Revenue',
                align: 'right',
                render: (p) => formatMoney(p.revenue),
              },
              {
                key: 'share',
                label: 'Share',
                align: 'right',
                render: (p) => formatPercent(p.revenueShare),
              },
            ]}
            rows={query.data.products.map((p) => ({ ...p, key: p.productId }))}
          />
        )
      }
    />
  );
}

export function CategoriesPanel({ range, refreshKey }) {
  const query = useApiQuery(
    (signal) => analyticsApi.categories({ from: range.from, to: range.to }, { signal }),
    [range.from, range.to, refreshKey],
  );
  return (
    <ChartFrame
      title="Revenue by category"
      description="Share of gross revenue in the period"
      chart={
        <QueryState
          query={query}
          emptyMessage={NO_DATA_MESSAGE}
          isEmpty={(d) => d.categories.length === 0}
          height="h-64"
        >
          {(data) => (
            <BarList
              label="Revenue by category"
              items={topWithOther(data.categories).map((c) => ({
                key: c.categoryId,
                label: c.name ?? `Category ${c.categoryId}`,
                value: Number(c.revenue),
                category: c,
              }))}
              formatValue={(v) => formatMoney(v, { compact: true })}
              formatSecondary={(item) => formatPercent(item.category.revenueShare)}
            />
          )}
        </QueryState>
      }
      table={
        query.data && (
          <DataTable
            caption="Revenue by category"
            columns={[
              { key: 'name', label: 'Category' },
              {
                key: 'unitsSold',
                label: 'Units',
                align: 'right',
                render: (c) => formatNumber(c.unitsSold),
              },
              {
                key: 'revenue',
                label: 'Revenue',
                align: 'right',
                render: (c) => formatMoney(c.revenue),
              },
              {
                key: 'share',
                label: 'Share',
                align: 'right',
                render: (c) => formatPercent(c.revenueShare),
              },
            ]}
            rows={query.data.categories.map((c) => ({ ...c, key: c.categoryId }))}
          />
        )
      }
    />
  );
}

export function OrderStatusPanel({ refreshKey }) {
  const query = useApiQuery((signal) => analyticsApi.orderStatus({ signal }), [refreshKey]);
  return (
    <ChartFrame
      title="Order status"
      description="Where all orders are right now"
      chart={
        <QueryState
          query={query}
          emptyMessage={NO_DATA_MESSAGE}
          isEmpty={(d) => d.total === 0}
          height="h-64"
        >
          {(data) => (
            <BarList
              label="Orders by status"
              items={data.statuses.map((s) => ({
                key: s.status,
                label: STATUS_LABELS[s.status] ?? s.status,
                value: s.orders,
                status: s,
              }))}
              formatValue={(v) => formatNumber(v)}
              formatSecondary={(item) => formatPercent(item.status.share)}
            />
          )}
        </QueryState>
      }
      table={
        query.data && (
          <DataTable
            caption="Orders by status"
            columns={[
              { key: 'status', label: 'Status', render: (s) => STATUS_LABELS[s.status] },
              {
                key: 'orders',
                label: 'Orders',
                align: 'right',
                render: (s) => formatNumber(s.orders),
              },
              {
                key: 'share',
                label: 'Share',
                align: 'right',
                render: (s) => formatPercent(s.share),
              },
            ]}
            rows={query.data.statuses.map((s) => ({ ...s, key: s.status }))}
          />
        )
      }
    />
  );
}
