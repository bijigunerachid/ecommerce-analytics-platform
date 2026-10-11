import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import { analyticsApi } from '../api/endpoints.js';
import { Button } from '../components/ui/Button.jsx';
import { CustomersPanel } from '../features/dashboard/CustomersPanel.jsx';
import { DateRangeControl } from '../features/dashboard/DateRangeControl.jsx';
import { KpiTiles } from '../features/dashboard/KpiTiles.jsx';
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

export function DashboardPage() {
  const dateRange = useDateRange();
  const [refreshKey, setRefreshKey] = useState(0);
  const days = Math.round((new Date(dateRange.to) - new Date(dateRange.from)) / 86_400_000) + 1;
  const range = { from: dateRange.from, to: dateRange.to, days };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-ink-secondary">
            {formatDay(range.from)} – {formatDay(range.to)} (UTC)
          </p>
          <Freshness refreshKey={refreshKey} />
        </div>
        {/* All filters in one row above the charts; they apply to every panel. */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeControl key={dateRange.preset} range={dateRange} />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="Refresh data"
          >
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
        <PipelinePanel refreshKey={refreshKey} />
      </div>
    </div>
  );
}
