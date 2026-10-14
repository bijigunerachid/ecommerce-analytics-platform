import { ArrowLeft, PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { inventoryApi, productsApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import { ChartFrame, DataTable } from '../components/charts/ChartFrame.jsx';
import { ChartTooltip } from '../components/charts/ChartTooltip.jsx';
import { useChartColors } from '../components/charts/useChartColors.js';
import { ResourceTable } from '../components/data/ResourceTable.jsx';
import { ActiveBadge, Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import { SegmentedControl } from '../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState, QueryState } from '../components/ui/States.jsx';
import { StatusBadge } from '../components/ui/StatusBadge.jsx';
import { AdjustStockModal } from '../features/inventory/AdjustStockModal.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { useListParams } from '../hooks/useListParams.js';
import {
  formatAxisDate,
  formatDateTime,
  formatDay,
  formatMoney,
  formatNumber,
} from '../utils/format.js';
import { MOVEMENT_REASON_LABELS } from '../utils/labels.js';

const RANGES = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
];

const dayLabel = (iso) => formatDay(iso.slice(0, 10));

function stockState(insights) {
  if (insights.stock === 0) return ['critical', 'Out of stock'];
  if (insights.restock.needsRestock) return ['warning', 'Restock soon'];
  return ['good', 'Stock healthy'];
}

function StockPanel({ insights, canEdit, onRestock }) {
  const { restock } = insights;
  const [tone, label] = stockState(insights);
  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">Stock</h2>
        <StatusBadge status={tone} label={label} />
      </div>
      <p className="mt-4 text-5xl font-semibold tracking-tight text-ink tabular">
        {formatNumber(insights.stock)}
      </p>
      <p className="mt-1 text-sm text-ink-secondary">units in stock</p>
      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
        <div>
          <dt className="text-ink-muted">Days of stock left</dt>
          <dd className="mt-0.5 font-medium text-ink tabular">
            {restock.daysOfCover === null
              ? 'No recent sales'
              : restock.daysOfCover.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Sells per day</dt>
          <dd className="mt-0.5 font-medium text-ink tabular">
            {restock.dailyUnits.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Reorder level</dt>
          <dd className="mt-0.5 font-medium text-ink tabular">
            {formatNumber(insights.reorderLevel)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Target stock</dt>
          <dd className="mt-0.5 font-medium text-ink tabular">
            {formatNumber(restock.targetStock)}
          </dd>
        </div>
      </dl>
      <div className="mt-5 rounded-lg bg-surface-sunken p-4 text-sm">
        {restock.suggestedQuantity > 0 ? (
          <>
            <p className="text-ink">
              Restock <strong className="tabular">{formatNumber(restock.suggestedQuantity)}</strong>{' '}
              units to cover 30 days of sales plus the reorder level.
            </p>
            {canEdit && (
              <Button size="sm" className="mt-3" onClick={onRestock}>
                <PackagePlus aria-hidden="true" className="size-4" /> Restock{' '}
                {formatNumber(restock.suggestedQuantity)}
              </Button>
            )}
          </>
        ) : (
          <p className="text-ink-secondary">
            No restock needed: stock covers 30 days of sales plus the reorder level.
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Based on sales in the last 30 days, cancelled orders excluded.
      </p>
    </Card>
  );
}

function SalesChart({ insights }) {
  const colors = useChartColors();
  const empty = insights.unitsSold === 0;
  return (
    <ChartFrame
      title="Units sold per day"
      description={`${formatNumber(insights.unitsSold)} units, ${formatMoney(insights.revenue)} from ${formatNumber(insights.orders)} orders in the last ${insights.range.days} days (UTC). Cancelled orders excluded.`}
      chart={
        empty ? (
          <EmptyState title="No sales in this period" className="h-56" />
        ) : (
          <div className="h-56" role="img" aria-label="Units sold per day chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => formatAxisDate(v, 'day')}
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: colors.grid }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: colors.grid, fillOpacity: 0.5 }}
                  content={
                    <ChartTooltip
                      labelFormatter={dayLabel}
                      valueFormatter={(v) => formatNumber(v)}
                    />
                  }
                />
                <Bar
                  dataKey="units"
                  name="Units sold"
                  fill={colors.series1}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={16}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      }
      table={
        <DataTable
          caption="Units sold per day"
          columns={[
            { key: 'day', label: 'Day', render: (d) => dayLabel(d.day) },
            { key: 'units', label: 'Units', align: 'right', render: (d) => formatNumber(d.units) },
            {
              key: 'orders',
              label: 'Orders',
              align: 'right',
              render: (d) => formatNumber(d.orders),
            },
            {
              key: 'revenue',
              label: 'Revenue',
              align: 'right',
              render: (d) => formatMoney(d.revenue),
            },
          ]}
          rows={[...insights.daily].reverse().map((d) => ({ ...d, key: d.day }))}
        />
      }
    />
  );
}

function StockChart({ insights }) {
  const colors = useChartColors();
  return (
    <ChartFrame
      title="Stock at end of day"
      description="Rebuilt from the inventory ledger, starting when the product was added. The dashed line is the reorder level."
      chart={
        <div className="h-56" role="img" aria-label="Stock at end of day chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={insights.daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(v) => formatAxisDate(v, 'day')}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: colors.axis, strokeWidth: 1 }}
                content={
                  <ChartTooltip labelFormatter={dayLabel} valueFormatter={(v) => formatNumber(v)} />
                }
              />
              <ReferenceLine
                y={insights.reorderLevel}
                stroke={colors.axis}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
              <Line
                type="stepAfter"
                dataKey="stockEnd"
                name="Units in stock"
                stroke={colors.series1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <DataTable
          caption="Stock at end of day"
          columns={[
            { key: 'day', label: 'Day', render: (d) => dayLabel(d.day) },
            {
              key: 'stockEnd',
              label: 'Units in stock',
              align: 'right',
              render: (d) => formatNumber(d.stockEnd),
            },
          ]}
          rows={[...insights.daily].reverse().map((d) => ({ ...d, key: d.day }))}
        />
      }
    />
  );
}

function Movements({ productId, params, update, toggleSort, refreshKey }) {
  const query = useApiQuery(
    (signal) =>
      inventoryApi.movements(
        { productId, sort: params.sort, order: params.order, page: params.page, pageSize: 10 },
        { signal },
      ),
    [productId, params.sort, params.order, params.page, refreshKey],
  );
  return (
    <Card>
      <CardHeader title="Stock movements" description="Every change to this product's stock." />
      <div className="mt-3">
        <ResourceTable
          caption="Stock movements of this product"
          query={query}
          rowKey={(m) => m.id}
          sort={params.sort}
          order={params.order}
          onSort={toggleSort}
          onPageChange={(page) => update({ page })}
          empty={<EmptyState title="No stock movements yet" className="h-40" />}
          columns={[
            {
              key: 'createdAt',
              label: 'When',
              sortKey: 'createdAt',
              defaultOrder: 'desc',
              render: (m) => formatDateTime(m.createdAt),
            },
            {
              key: 'quantityChange',
              label: 'Change',
              sortKey: 'quantityChange',
              align: 'right',
              render: (m) => (
                <span className={m.quantityChange > 0 ? 'text-text-good' : 'text-ink'}>
                  {m.quantityChange > 0 ? '+' : '−'}
                  {formatNumber(Math.abs(m.quantityChange))}
                </span>
              ),
            },
            {
              key: 'reason',
              label: 'Reason',
              render: (m) => <Badge>{MOVEMENT_REASON_LABELS[m.reason] ?? m.reason}</Badge>,
            },
            {
              key: 'reference',
              label: 'Reference',
              render: (m) =>
                m.orderId ? (
                  <Link to={`/orders/${m.orderId}`} className="text-accent hover:underline">
                    Order #{m.orderId}
                  </Link>
                ) : (
                  <span className="text-ink-secondary">{m.note ?? '—'}</span>
                ),
            },
          ]}
        />
      </div>
    </Card>
  );
}

export function ProductDetailPage() {
  const { id } = useParams();
  const { canEdit } = usePermissions();
  const [refreshKey, setRefreshKey] = useState(0);
  const [restocking, setRestocking] = useState(false);
  const { params, update, toggleSort } = useListParams({
    days: '90',
    sort: 'createdAt',
    order: 'desc',
  });
  const productQuery = useApiQuery((signal) => productsApi.get(id, { signal }), [id, refreshKey]);
  const insightsQuery = useApiQuery(
    (signal) => productsApi.insights(id, { days: params.days }, { signal }),
    [id, params.days, refreshKey],
  );
  const insights = insightsQuery.data?.insights;

  return (
    <div className="space-y-6">
      <Link
        to="/products"
        className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All products
      </Link>
      <QueryState query={productQuery} height="h-96">
        {({ product }) => (
          <>
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-sm text-ink-muted">{product.sku}</p>
                <h1 className="mt-0.5 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-ink">
                  {product.name} <ActiveBadge active={product.isActive} />
                </h1>
                <p className="mt-1 text-sm text-ink-secondary">
                  {product.categoryName}, {formatMoney(product.price)} each
                </p>
              </div>
              <SegmentedControl
                label="Period"
                size="md"
                options={RANGES}
                value={params.days}
                onChange={(days) => update({ days })}
              />
            </header>

            <div className="grid items-start gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                {insights ? (
                  <>
                    <SalesChart insights={insights} />
                    <StockChart insights={insights} />
                  </>
                ) : (
                  <>
                    <Skeleton className="h-72" />
                    <Skeleton className="h-72" />
                  </>
                )}
              </div>
              {insights ? (
                <StockPanel
                  insights={insights}
                  canEdit={canEdit}
                  onRestock={() => setRestocking(true)}
                />
              ) : (
                <Skeleton className="h-96" />
              )}
            </div>

            <Movements
              productId={product.id}
              params={params}
              update={update}
              toggleSort={toggleSort}
              refreshKey={refreshKey}
            />

            {restocking && insights && (
              <AdjustStockModal
                product={product}
                quantity={insights.restock.suggestedQuantity}
                onClose={() => setRestocking(false)}
                onSaved={() => {
                  setRestocking(false);
                  setRefreshKey((k) => k + 1);
                }}
              />
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
