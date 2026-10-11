import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { analyticsApi } from '../../api/endpoints.js';
import { Card } from '../../components/ui/Card.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { formatMoney, formatNumber, formatPercent } from '../../utils/format.js';

const TILES = [
  { key: 'orders', label: 'Orders', format: (v) => formatNumber(v), upIsGood: true },
  {
    key: 'averageOrderValue',
    label: 'Average order value',
    format: (v) => formatMoney(v),
    upIsGood: true,
  },
  { key: 'newCustomers', label: 'New customers', format: (v) => formatNumber(v), upIsGood: true },
  {
    key: 'cancellationRate',
    label: 'Cancellation rate',
    format: (v) => formatPercent(v),
    upIsGood: false,
  },
];

/**
 * Change vs the previous period. Color = direction × whether up is good, always paired with an
 * arrow and a sign so it never relies on color.
 */
export function Delta({ value, upIsGood, period }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-ink-muted">No data for {period}</p>;
  }
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const good = direction === 'flat' ? null : (direction === 'up') === upIsGood;
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const tone =
    good === null ? 'text-ink-secondary' : good ? 'text-text-good' : 'text-text-critical';
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
        <Icon aria-hidden="true" className="size-3.5" />
        {/* A tiny comparison base makes the percentage meaningless (e.g. +15790%). */}
        {value >= 1000 ? '>+999%' : formatPercent(value, { signed: true })}
      </span>
      <span className="whitespace-nowrap text-ink-muted">vs {period}</span>
    </p>
  );
}

export function KpiTiles({ range, refreshKey }) {
  const query = useApiQuery(
    (signal) => analyticsApi.overview({ from: range.from, to: range.to }, { signal }),
    [range.from, range.to, refreshKey],
  );

  if (query.error && !query.data) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={query.refetch} className="h-32" />
      </Card>
    );
  }

  const data = query.data;
  const period = data ? `previous ${data.range.days} days` : 'previous period';
  const placeholder = (
    <span className="inline-block h-7 w-24 animate-pulse rounded bg-surface-sunken" />
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-busy={query.isFetching}>
      {/* The one hero figure of the view. */}
      <Card className="col-span-2 p-5">
        <p className="text-sm text-ink-secondary">Net revenue</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          {data ? formatMoney(data.current.netRevenue, { compact: true }) : placeholder}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {data && <Delta value={data.change.netRevenue} upIsGood period={period} />}
          {data && (
            <p className="text-xs text-ink-muted">
              Gross {formatMoney(data.current.grossRevenue, { compact: true })} ·{' '}
              {formatNumber(data.current.cancelledOrders)} cancelled
            </p>
          )}
        </div>
      </Card>
      {TILES.map((tile) => (
        <Card key={tile.key} className="p-4">
          <p className="text-xs text-ink-secondary">{tile.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {data ? tile.format(data.current[tile.key]) : placeholder}
          </p>
          <div className="mt-1.5">
            {data && (
              <Delta value={data.change[tile.key]} upIsGood={tile.upIsGood} period={period} />
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
