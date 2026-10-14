import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Minus,
  ReceiptText,
  ShoppingBag,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { analyticsApi } from '../../api/endpoints.js';
import { Sparkline } from '../../components/charts/Sparkline.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { formatMoney, formatNumber, formatPercent } from '../../utils/format.js';

const TILES = [
  {
    key: 'orders',
    label: 'Orders',
    icon: ReceiptText,
    format: (v) => formatNumber(v),
    upIsGood: true,
    trend: (b) => b.orders,
  },
  {
    key: 'averageOrderValue',
    label: 'Average order value',
    icon: ShoppingBag,
    format: (v) => formatMoney(v),
    upIsGood: true,
    trend: (b) => b.averageOrderValue,
  },
  {
    key: 'newCustomers',
    label: 'New customers',
    icon: UserPlus,
    format: (v) => formatNumber(v),
    upIsGood: true,
  },
  {
    key: 'cancellationRate',
    label: 'Cancellation rate',
    icon: Ban,
    format: (v) => formatPercent(v),
    upIsGood: false,
    trend: (b) => (b.orders ? b.cancelledOrders / b.orders : 0),
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

function TileLabel({ icon: Icon, children }) {
  return (
    <p className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
      <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft/50 dark:bg-accent-soft/60">
        <Icon aria-hidden="true" className="size-3.5 text-accent-strong dark:text-ink" />
      </span>
      {children}
    </p>
  );
}

export function KpiTiles({ range, refreshKey }) {
  const query = useApiQuery(
    (signal) => analyticsApi.overview({ from: range.from, to: range.to }, { signal }),
    [range.from, range.to, refreshKey],
  );
  // Daily series for the trend lines (decorative; the figures above them are the data).
  const trendQuery = useApiQuery(
    (signal) =>
      analyticsApi.revenue({ from: range.from, to: range.to, interval: 'day' }, { signal }),
    [range.from, range.to, refreshKey],
  );
  const series = trendQuery.data?.series ?? [];

  if (query.error && !query.data) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={query.refetch} className="h-32" />
      </Card>
    );
  }

  const data = query.data;
  const period = data ? `previous ${data.range.days} days` : 'previous period';
  const placeholder = <span className="skeleton inline-block h-7 w-24 align-middle" />;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-busy={query.isFetching}>
      {/* The one hero figure of the view. */}
      <Card className="relative col-span-2 flex flex-col overflow-hidden p-5">
        <TileLabel icon={Wallet}>Net revenue</TileLabel>
        <p className="mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
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
        <Sparkline
          values={series.map((b) => b.netRevenue)}
          className="-mx-5 -mb-5 mt-auto h-14 w-[calc(100%+2.5rem)] pt-3 text-series-1"
        />
      </Card>
      {TILES.map((tile) => (
        <Card key={tile.key} className="flex flex-col p-4">
          <TileLabel icon={tile.icon}>{tile.label}</TileLabel>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">
            {data ? tile.format(data.current[tile.key]) : placeholder}
          </p>
          <div className="mt-1.5">
            {data && (
              <Delta value={data.change[tile.key]} upIsGood={tile.upIsGood} period={period} />
            )}
          </div>
          {tile.trend && (
            <Sparkline
              values={series.map(tile.trend)}
              fill={false}
              className="mt-auto h-8 w-full pt-2 text-series-1"
            />
          )}
        </Card>
      ))}
    </div>
  );
}
