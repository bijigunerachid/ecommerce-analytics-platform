import { ArrowLeft, Mail, MapPin, Phone } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { customersApi, ordersApi } from '../api/endpoints.js';
import { BarList } from '../components/charts/BarList.jsx';
import { ChartFrame, DataTable } from '../components/charts/ChartFrame.jsx';
import { ChartTooltip } from '../components/charts/ChartTooltip.jsx';
import { useChartColors } from '../components/charts/useChartColors.js';
import { ResourceTable } from '../components/data/ResourceTable.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Badge, OrderStatusBadge } from '../components/ui/Badge.jsx';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState, QueryState } from '../components/ui/States.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { useListParams } from '../hooks/useListParams.js';
import {
  formatDateTime,
  formatDay,
  formatMoney,
  formatMoneyTick,
  formatMonth,
  formatNumber,
  formatRelative,
} from '../utils/format.js';
import { SEGMENT_LABELS } from '../utils/labels.js';

function Figure({ label, value, detail }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular">{value}</dd>
      {detail && <dd className="mt-0.5 text-xs text-ink-muted">{detail}</dd>}
    </div>
  );
}

function SpendChart({ insights }) {
  const colors = useChartColors();
  const data = insights.monthly.map((m) => ({ ...m, value: Number(m.spent) }));
  const empty = data.every((m) => m.orders === 0);
  return (
    <ChartFrame
      title="Spend per month"
      description="Order value in the last 12 months (UTC), cancelled orders excluded."
      chart={
        empty ? (
          <EmptyState
            title="No spend in the last 12 months"
            message="Months with orders appear here."
            className="h-56"
          />
        ) : (
          <div className="h-56" role="img" aria-label="Spend per month chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={(v) => formatMonth(v, { short: true })}
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: colors.grid }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={formatMoneyTick}
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                />
                <Tooltip
                  cursor={{ fill: colors.grid, fillOpacity: 0.5 }}
                  content={
                    <ChartTooltip
                      labelFormatter={(v) => formatMonth(v)}
                      valueFormatter={(v) => formatMoney(v)}
                    />
                  }
                />
                <Bar
                  dataKey="value"
                  name="Spend"
                  fill={colors.series1}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      }
      table={
        <DataTable
          caption="Spend per month"
          columns={[
            { key: 'month', label: 'Month', render: (m) => formatMonth(m.month) },
            {
              key: 'orders',
              label: 'Orders',
              align: 'right',
              render: (m) => formatNumber(m.orders),
            },
            { key: 'spent', label: 'Spend', align: 'right', render: (m) => formatMoney(m.spent) },
          ]}
          rows={insights.monthly.map((m) => ({ ...m, key: m.month }))}
        />
      }
    />
  );
}

function CustomerOrders({ customerId }) {
  const navigate = useNavigate();
  const { params, update, toggleSort } = useListParams({ sort: 'createdAt', order: 'desc' });
  const query = useApiQuery(
    (signal) => ordersApi.list({ ...params, customerId, pageSize: 10 }, { signal }),
    [params, customerId],
  );
  return (
    <Card>
      <CardHeader title="Orders" description="Newest first. Open an order for its details." />
      <div className="mt-3">
        <ResourceTable
          caption="Orders of this customer"
          query={query}
          rowKey={(o) => o.id}
          sort={params.sort}
          order={params.order}
          onSort={toggleSort}
          onPageChange={(page) => update({ page })}
          onRowClick={(o) => navigate(`/orders/${o.id}`)}
          empty={<EmptyState title="No orders yet" className="h-40" />}
          columns={[
            {
              key: 'id',
              label: 'Order',
              render: (o) => (
                <Link
                  to={`/orders/${o.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-accent hover:underline"
                >
                  #{o.id}
                </Link>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              sortKey: 'status',
              render: (o) => <OrderStatusBadge status={o.status} />,
            },
            {
              key: 'totalAmount',
              label: 'Total',
              sortKey: 'totalAmount',
              align: 'right',
              defaultOrder: 'desc',
              render: (o) => formatMoney(o.totalAmount),
            },
            {
              key: 'createdAt',
              label: 'Placed',
              sortKey: 'createdAt',
              defaultOrder: 'desc',
              render: (o) => formatDateTime(o.createdAt),
            },
          ]}
        />
      </div>
    </Card>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const customerQuery = useApiQuery((signal) => customersApi.get(id, { signal }), [id]);
  const insightsQuery = useApiQuery((signal) => customersApi.insights(id, { signal }), [id]);
  const insights = insightsQuery.data?.insights;

  return (
    <div className="space-y-6">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All customers
      </Link>
      <QueryState query={customerQuery} height="h-96">
        {({ customer }) => {
          const name = `${customer.firstName} ${customer.lastName}`;
          const place = [customer.city, customer.country].filter(Boolean).join(', ');
          return (
            <>
              <header className="flex flex-wrap items-center gap-4">
                <Avatar name={name} size="lg" className="size-14 text-lg" />
                <div className="min-w-0">
                  <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-ink">
                    {name}
                    {insights && <Badge>{SEGMENT_LABELS[insights.segment]}</Badge>}
                  </h1>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-secondary">
                    <li className="flex items-center gap-1.5">
                      <Mail aria-hidden="true" className="size-4 text-ink-muted" />
                      <a href={`mailto:${customer.email}`} className="hover:text-ink">
                        {customer.email}
                      </a>
                    </li>
                    {customer.phone && (
                      <li className="flex items-center gap-1.5">
                        <Phone aria-hidden="true" className="size-4 text-ink-muted" />
                        {customer.phone}
                      </li>
                    )}
                    {place && (
                      <li className="flex items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-4 text-ink-muted" />
                        {place}
                      </li>
                    )}
                    <li>Customer since {formatDay(customer.createdAt.slice(0, 10))}</li>
                  </ul>
                </div>
              </header>

              <Card className="p-5 sm:p-6">
                {insights ? (
                  <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                    <Figure
                      label="Lifetime value"
                      value={formatMoney(insights.lifetimeValue)}
                      detail="All orders except cancelled ones"
                    />
                    <Figure
                      label="Orders"
                      value={formatNumber(insights.netOrders)}
                      detail={
                        insights.cancelledOrders > 0
                          ? `${formatNumber(insights.cancelledOrders)} more cancelled`
                          : 'None cancelled'
                      }
                    />
                    <Figure
                      label="Average order"
                      value={
                        insights.averageOrderValue ? formatMoney(insights.averageOrderValue) : '—'
                      }
                    />
                    <Figure
                      label="Last order"
                      value={insights.lastOrderAt ? formatRelative(insights.lastOrderAt) : 'Never'}
                      detail={
                        insights.firstOrderAt
                          ? `First order ${formatDay(insights.firstOrderAt.slice(0, 10))}`
                          : undefined
                      }
                    />
                  </dl>
                ) : (
                  <Skeleton className="h-16 w-full" />
                )}
              </Card>

              <div className="grid items-start gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  {insights ? <SpendChart insights={insights} /> : <Skeleton className="h-72" />}
                </div>
                <Card>
                  <CardHeader
                    title="Most bought"
                    description="By spend, cancelled orders excluded."
                  />
                  <div className="px-5 pt-4 pb-5">
                    {!insights ? (
                      <Skeleton className="h-40" />
                    ) : insights.topProducts.length === 0 ? (
                      <EmptyState title="Nothing bought yet" className="h-40" />
                    ) : (
                      <BarList
                        label="Most bought products"
                        items={insights.topProducts.map((p) => ({
                          key: p.productId,
                          label: p.name,
                          value: Number(p.spent),
                          units: p.units,
                        }))}
                        formatValue={(v) => formatMoney(v)}
                        formatSecondary={(item) => `${formatNumber(item.units)} pcs`}
                      />
                    )}
                  </div>
                </Card>
              </div>

              <CustomerOrders customerId={customer.id} />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
