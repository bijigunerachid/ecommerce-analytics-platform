import { Radio, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { analyticsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.js';
import { Button } from '../components/ui/Button.jsx';
import { CustomersPanel } from '../features/dashboard/CustomersPanel.jsx';
import { DateRangeControl } from '../features/dashboard/DateRangeControl.jsx';
import { KpiTiles } from '../features/dashboard/KpiTiles.jsx';
import { LiveActivityPanel } from '../features/dashboard/LiveActivityPanel.jsx';
import {
  AnomaliesPanel,
  InventoryPanel,
  PipelinePanel,
} from '../features/dashboard/OperationsPanels.jsx';
import {
  CategoriesPanel,
  OrderStatusPanel,
  TopProductsPanel,
} from '../features/dashboard/RankedPanels.jsx';
import { RevenuePanel } from '../features/dashboard/RevenuePanel.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { useDateRange } from '../hooks/useDateRange.js';
import { formatDateTime, formatDay, formatRelative } from '../utils/format.js';

function Freshness({ refreshKey }) {
  // Every analytics response carries dataAsOf; order-status is the smallest one.
  const query = useApiQuery((signal) => analyticsApi.orderStatus({ signal }), [refreshKey]);
  if (!query.data) return null;
  const asOf = query.data.dataAsOf;
  return (
    <p className="text-xs text-ink-muted" title={asOf ? formatDateTime(asOf) : undefined}>
      {asOf
        ? `Analytics updated ${formatRelative(asOf)}`
        : 'The stream processor has not produced data yet'}
    </p>
  );
}

const LIVE_REFRESH_MS = 15_000;
const LIVE_KEY = 'dashboard-live';

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);

function readLive() {
  try {
    return localStorage.getItem(LIVE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Live mode refreshes every panel periodically; the choice is remembered per browser. */
function useLiveRefresh(onTick) {
  const [live, setLive] = useState(readLive);
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(onTick, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, onTick]);
  function toggle() {
    setLive((on) => {
      try {
        localStorage.setItem(LIVE_KEY, on ? '0' : '1');
      } catch {
        // Not remembering the choice is fine.
      }
      return !on;
    });
  }
  return [live, toggle];
}

function LiveToggle({ live, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={live}
      title={live ? 'Refreshing every 15 seconds' : 'Refresh automatically every 15 seconds'}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-card transition-colors ${
        live
          ? 'border-status-good/40 bg-status-good/10 text-ink'
          : 'border-line-strong bg-surface-raised text-ink-secondary hover:text-ink'
      }`}
    >
      <span className="relative flex size-2.5">
        {live && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-good/60 motion-reduce:hidden" />
        )}
        <span
          className={`relative inline-flex size-2.5 rounded-full ${live ? 'bg-status-good' : 'bg-line-strong'}`}
        />
      </span>
      <Radio aria-hidden="true" className="size-4" />
      Live
    </button>
  );
}

export function DashboardPage() {
  const dateRange = useDateRange();
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [live, toggleLive] = useLiveRefresh(bumpRefresh);
  const firstName = capitalize(user?.fullName?.trim().split(/\s+/)[0] ?? '');
  const days = Math.round((new Date(dateRange.to) - new Date(dateRange.from)) / 86_400_000) + 1;
  const range = { from: dateRange.from, to: dateRange.to, days };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-accent">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {formatDay(range.from)} – {formatDay(range.to)} (UTC)
          </p>
          <Freshness refreshKey={refreshKey} />
        </div>
        {/* All filters in one row above the charts; they apply to every panel. */}
        <div className="flex flex-wrap items-center gap-2">
          <LiveToggle live={live} onToggle={toggleLive} />
          <DateRangeControl key={dateRange.preset} range={dateRange} />
          <Button variant="secondary" size="icon" onClick={bumpRefresh} aria-label="Refresh data">
            <RotateCw aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </header>

      <KpiTiles range={range} refreshKey={refreshKey} />

      <div className="grid gap-4 xl:grid-cols-3">
        <RevenuePanel range={range} refreshKey={refreshKey} className="xl:col-span-2" />
        <OrderStatusPanel refreshKey={refreshKey} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <TopProductsPanel range={range} refreshKey={refreshKey} />
        <CategoriesPanel range={range} refreshKey={refreshKey} />
        <CustomersPanel range={range} refreshKey={refreshKey} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <InventoryPanel range={range} refreshKey={refreshKey} />
        <AnomaliesPanel range={range} refreshKey={refreshKey} />
        <div className="flex flex-col gap-4">
          <LiveActivityPanel refreshKey={refreshKey} />
          <PipelinePanel refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}
