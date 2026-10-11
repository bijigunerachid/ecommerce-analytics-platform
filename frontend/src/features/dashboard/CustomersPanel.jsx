import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsApi } from '../../api/endpoints.js';
import { ChartFrame, DataTable } from '../../components/charts/ChartFrame.jsx';
import { ChartTooltip } from '../../components/charts/ChartTooltip.jsx';
import { useChartColors } from '../../components/charts/useChartColors.js';
import { QueryState } from '../../components/ui/States.jsx';
import { NO_DATA_MESSAGE } from './messages.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import {
  formatAxisDate,
  formatBucket,
  formatMoney,
  formatNumber,
  formatPercent,
} from '../../utils/format.js';

function Legend({ colors }) {
  const items = [
    { label: 'New customers', color: colors.series1 },
    { label: 'Returning customers', color: colors.series2 },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** New vs returning customers per period: two series, so a legend is always shown. */
export function CustomersPanel({ range, refreshKey }) {
  const colors = useChartColors();
  const interval = range.days > 45 ? 'week' : 'day';
  const query = useApiQuery(
    (signal) =>
      analyticsApi.customers({ from: range.from, to: range.to, interval, limit: 5 }, { signal }),
    [range.from, range.to, interval, refreshKey],
  );

  return (
    <ChartFrame
      title="Customer purchasing trends"
      description={`Active customers per ${interval}, split into first-time and returning`}
      chart={
        <QueryState
          query={query}
          emptyMessage={NO_DATA_MESSAGE}
          isEmpty={(d) => d.series.every((b) => b.activeCustomers === 0)}
          height="h-72"
        >
          {(data) => (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Summary
                  label="Customers with orders"
                  value={formatNumber(data.summary.customersWithOrders)}
                />
                <Summary
                  label="Repeat purchase rate"
                  value={formatPercent(data.summary.repeatPurchaseRate)}
                />
                <Summary
                  label="Avg. revenue / customer"
                  value={formatMoney(data.summary.averageRevenuePerCustomer)}
                />
              </div>
              <Legend colors={colors} />
              <div className="h-52" role="img" aria-label="New and returning customers chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={colors.grid} vertical={false} />
                    <XAxis
                      dataKey="bucket"
                      tickFormatter={(v) => formatAxisDate(v, interval)}
                      tick={{ fill: colors.axis, fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: colors.grid }}
                      minTickGap={20}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: colors.axis, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <Tooltip
                      cursor={{ fill: colors.grid, fillOpacity: 0.5 }}
                      content={
                        <ChartTooltip
                          labelFormatter={(v) => formatBucket(v, interval)}
                          valueFormatter={(v) => formatNumber(v)}
                        />
                      }
                    />
                    {/* A 2px surface-colored stroke separates the stacked segments. */}
                    <Bar
                      dataKey="newCustomers"
                      name="New"
                      stackId="c"
                      fill={colors.series1}
                      stroke={colors.surface}
                      strokeWidth={2}
                      maxBarSize={24}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="returningCustomers"
                      name="Returning"
                      stackId="c"
                      fill={colors.series2}
                      stroke={colors.surface}
                      strokeWidth={2}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </QueryState>
      }
      table={
        query.data && (
          <DataTable
            caption="New and returning customers"
            columns={[
              { key: 'bucket', label: 'Period', render: (r) => formatBucket(r.bucket, interval) },
              { key: 'newCustomers', label: 'New', align: 'right' },
              { key: 'returningCustomers', label: 'Returning', align: 'right' },
              { key: 'orders', label: 'Orders', align: 'right' },
            ]}
            rows={query.data.series.map((r) => ({ ...r, key: r.bucket }))}
          />
        )
      }
    />
  );
}

function Summary({ label, value }) {
  return (
    <div className="rounded-lg bg-surface-sunken px-3 py-2">
      <p className="text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
