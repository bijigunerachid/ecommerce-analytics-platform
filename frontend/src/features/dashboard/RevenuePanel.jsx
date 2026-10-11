import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { analyticsApi } from '../../api/endpoints.js';
import { ChartFrame, DataTable } from '../../components/charts/ChartFrame.jsx';
import { ChartTooltip } from '../../components/charts/ChartTooltip.jsx';
import { useChartColors } from '../../components/charts/useChartColors.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { QueryState } from '../../components/ui/States.jsx';
import { NO_DATA_MESSAGE } from './messages.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import {
  formatAxisDate,
  formatBucket,
  formatMoney,
  formatMoneyTick,
  formatNumber,
  isBucketInProgress,
} from '../../utils/format.js';

const INTERVALS = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
];

/** Net revenue over time: one series, so no legend; the title names it. */
export function RevenuePanel({ range, refreshKey, className }) {
  const [interval, setInterval] = useState('auto');
  const colors = useChartColors();
  const query = useApiQuery(
    (signal) =>
      analyticsApi.revenue(
        { from: range.from, to: range.to, interval: interval === 'auto' ? undefined : interval },
        { signal },
      ),
    [range.from, range.to, interval, refreshKey],
  );
  const isEmpty = (d) => d.series.every((b) => b.orders === 0);

  return (
    <ChartFrame
      className={className}
      title="Net revenue over time"
      description="Gross order value minus cancellations, by order date (UTC). The latest period is still in progress."
      actions={
        <SegmentedControl
          label="Granularity"
          options={INTERVALS}
          value={interval}
          onChange={setInterval}
        />
      }
      chart={
        <QueryState query={query} isEmpty={isEmpty} emptyMessage={NO_DATA_MESSAGE} height="h-72">
          {(data) => (
            <div className="h-72" aria-label="Net revenue chart" role="img">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(v) => formatAxisDate(v, data.interval)}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: colors.grid }}
                    minTickGap={24}
                  />
                  <YAxis
                    tickFormatter={formatMoneyTick}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ stroke: colors.axis, strokeWidth: 1 }}
                    content={
                      <ChartTooltip
                        labelFormatter={(v) =>
                          `${formatBucket(v, data.interval)}${isBucketInProgress(v, data.interval) ? ' (so far)' : ''}`
                        }
                        valueFormatter={(v) => formatMoney(v)}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey={(d) => Number(d.netRevenue)}
                    name="Net revenue"
                    stroke={colors.series1}
                    strokeWidth={2}
                    fill={colors.series1}
                    fillOpacity={0.1}
                    activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </QueryState>
      }
      table={
        query.data && (
          <DataTable
            caption="Net revenue by period"
            columns={[
              {
                key: 'bucket',
                label: 'Period',
                render: (r) => formatBucket(r.bucket, query.data.interval),
              },
              {
                key: 'orders',
                label: 'Orders',
                align: 'right',
                render: (r) => formatNumber(r.orders),
              },
              {
                key: 'grossRevenue',
                label: 'Gross',
                align: 'right',
                render: (r) => formatMoney(r.grossRevenue),
              },
              {
                key: 'cancelledRevenue',
                label: 'Cancelled',
                align: 'right',
                render: (r) => formatMoney(r.cancelledRevenue),
              },
              {
                key: 'netRevenue',
                label: 'Net',
                align: 'right',
                render: (r) => formatMoney(r.netRevenue),
              },
            ]}
            rows={query.data.series.map((r) => ({ ...r, key: r.bucket }))}
          />
        )
      }
    />
  );
}
