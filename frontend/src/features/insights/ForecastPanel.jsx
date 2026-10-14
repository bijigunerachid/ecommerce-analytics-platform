import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { analyticsApi } from '../../api/endpoints.js';
import { ChartFrame, DataTable } from '../../components/charts/ChartFrame.jsx';
import { useChartColors } from '../../components/charts/useChartColors.js';
import { accuracyText } from './accuracy.js';
import { EmptyState, QueryState } from '../../components/ui/States.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { formatAxisDate, formatDay, formatMoney, formatMoneyTick } from '../../utils/format.js';

/** Actual (solid) and forecast (dashed) share one hue: one measure, one axis. */
function Legend() {
  return (
    <ul aria-hidden="true" className="flex flex-wrap gap-4 text-xs text-ink-secondary">
      <li className="flex items-center gap-1.5">
        <svg width="18" height="6" className="text-series-1">
          <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2" />
        </svg>
        Actual
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="18" height="6" className="text-series-1">
          <line
            x1="0"
            y1="3"
            x2="18"
            y2="3"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        </svg>
        Forecast
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm bg-series-1/20" />
        80% range
      </li>
    </ul>
  );
}

function ForecastTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink-secondary">{formatDay(row.day)}</p>
      {row.actual !== null && (
        <p>
          <span className="font-semibold text-ink tabular">{formatMoney(row.actual)}</span>{' '}
          <span className="text-ink-secondary">actual</span>
        </p>
      )}
      {row.forecast !== null && (
        <>
          <p>
            <span className="font-semibold text-ink tabular">{formatMoney(row.forecast)}</span>{' '}
            <span className="text-ink-secondary">forecast</span>
          </p>
          <p className="text-ink-muted">
            likely {formatMoney(row.range[0])} to {formatMoney(row.range[1])}
          </p>
        </>
      )}
    </div>
  );
}

export function ForecastPanel() {
  const colors = useChartColors();
  const query = useApiQuery((signal) => analyticsApi.forecast({ signal }), []);

  return (
    <QueryState query={query} height="h-80">
      {(data) => {
        const rows = [
          ...data.actual.map((a) => ({
            day: a.day,
            actual: Number(a.revenue),
            forecast: null,
            range: null,
          })),
          ...data.forecast.map((f) => ({
            day: f.day,
            actual: null,
            forecast: Number(f.forecast),
            range: [Number(f.lower), Number(f.upper)],
          })),
        ];
        // Join the two lines: the forecast starts from the last actual day.
        const lastActual = rows.findLast((r) => r.actual !== null);
        if (lastActual && data.forecast.length > 0) lastActual.forecast = lastActual.actual;

        return (
          <ChartFrame
            title="Sales forecast"
            description={`Net revenue per day: the last 28 days and a 14-day forecast (UTC). ${data.model.name}.`}
            chart={
              data.forecast.length === 0 ? (
                <EmptyState
                  title="No forecast yet"
                  message={
                    data.model.skipped
                      ? `The forecast ${data.model.skipped}.`
                      : 'It appears after the insights job has run.'
                  }
                  className="h-72"
                />
              ) : (
                <div className="space-y-3">
                  <Legend />
                  <div className="h-72" role="img" aria-label="Sales forecast chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke={colors.grid} vertical={false} />
                        <XAxis
                          dataKey="day"
                          tickFormatter={(v) => formatAxisDate(`${v}T00:00:00Z`, 'day')}
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
                          content={<ForecastTooltip />}
                        />
                        <Area
                          dataKey="range"
                          stroke="none"
                          fill={colors.series1}
                          fillOpacity={0.15}
                          isAnimationActive={false}
                          activeDot={false}
                        />
                        <Line
                          dataKey="actual"
                          stroke={colors.series1}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
                          isAnimationActive={false}
                          connectNulls={false}
                        />
                        <Line
                          dataKey="forecast"
                          stroke={colors.series1}
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={false}
                          activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {accuracyText(data.model.backtestWape) && (
                    <p className="text-xs text-ink-muted">
                      {accuracyText(data.model.backtestWape)}
                    </p>
                  )}
                </div>
              )
            }
            table={
              <DataTable
                caption="Sales forecast"
                columns={[
                  { key: 'day', label: 'Day', render: (r) => formatDay(r.day) },
                  {
                    key: 'kind',
                    label: 'Type',
                    render: (r) => (r.range ? 'Forecast' : 'Actual'),
                  },
                  {
                    key: 'value',
                    label: 'Net revenue',
                    align: 'right',
                    render: (r) => formatMoney(r.range ? r.forecast : r.actual),
                  },
                  {
                    key: 'range',
                    label: '80% range',
                    align: 'right',
                    render: (r) =>
                      r.range ? `${formatMoney(r.range[0])} to ${formatMoney(r.range[1])}` : '',
                  },
                ]}
                rows={rows.map((r) => ({ ...r, key: r.day }))}
              />
            }
          />
        );
      }}
    </QueryState>
  );
}
