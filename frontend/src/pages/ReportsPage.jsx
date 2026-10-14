import { FileChartColumn, Printer } from 'lucide-react';
import { analyticsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.js';
import { DataTable } from '../components/charts/ChartFrame.jsx';
import { ExportMenu } from '../components/data/ExportMenu.jsx';
import { PageHeader } from '../components/data/ResourceTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { QueryState } from '../components/ui/States.jsx';
import { DateRangeControl } from '../features/dashboard/DateRangeControl.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { useDateRange } from '../hooks/useDateRange.js';
import {
  formatDateTime,
  formatDay,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
} from '../utils/format.js';
import { ORDER_STATUS_LABELS } from '../utils/labels.js';

function ReportSection({ title, description, children }) {
  return (
    <Card className="break-inside-avoid p-5 sm:p-6 print:border-0 print:p-0 print:shadow-none">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function change(value) {
  if (value === null || value === undefined) return 'no earlier data';
  return `${formatPercent(value, { signed: true })} vs previous period`;
}

const SUMMARY = [
  { key: 'netRevenue', label: 'Net revenue', format: (v) => formatMoney(v) },
  { key: 'grossRevenue', label: 'Gross revenue', format: (v) => formatMoney(v) },
  { key: 'cancelledRevenue', label: 'Cancelled revenue', format: (v) => formatMoney(v) },
  { key: 'orders', label: 'Orders', format: (v) => formatNumber(v) },
  { key: 'cancelledOrders', label: 'Cancelled orders', format: (v) => formatNumber(v) },
  { key: 'cancellationRate', label: 'Cancellation rate', format: (v) => formatPercent(v) },
  { key: 'averageOrderValue', label: 'Average order value', format: (v) => formatMoney(v) },
  { key: 'itemsSold', label: 'Items sold', format: (v) => formatNumber(v) },
  { key: 'newCustomers', label: 'New customers', format: (v) => formatNumber(v) },
  { key: 'activeCustomers', label: 'Customers who ordered', format: (v) => formatNumber(v) },
];

function Summary({ range }) {
  const query = useApiQuery(
    (signal) => analyticsApi.overview({ from: range.from, to: range.to }, { signal }),
    [range.from, range.to],
  );
  return (
    <ReportSection
      title="Summary"
      description="Change compared with the previous period of the same length."
    >
      <QueryState query={query} height="h-32">
        {(data) => (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {SUMMARY.map((item) => (
              <div key={item.key}>
                <dt className="text-xs text-ink-secondary">{item.label}</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink tabular">
                  {item.format(data.current[item.key])}
                </dd>
                {item.key in data.change && (
                  <dd className="text-[11px] text-ink-muted">{change(data.change[item.key])}</dd>
                )}
              </div>
            ))}
          </dl>
        )}
      </QueryState>
    </ReportSection>
  );
}

function DailySales({ range }) {
  const query = useApiQuery(
    (signal) =>
      analyticsApi.revenue({ from: range.from, to: range.to, interval: 'day' }, { signal }),
    [range.from, range.to],
  );
  return (
    <ReportSection
      title="Sales by day"
      description="By order date (UTC). Net = gross minus cancelled."
    >
      <QueryState query={query} height="h-40">
        {(data) => (
          <DataTable
            caption="Sales by day"
            maxHeight=""
            columns={[
              { key: 'bucket', label: 'Day', render: (r) => formatDay(r.bucket.slice(0, 10)) },
              {
                key: 'orders',
                label: 'Orders',
                align: 'right',
                render: (r) => formatNumber(r.orders),
              },
              {
                key: 'cancelledOrders',
                label: 'Cancelled',
                align: 'right',
                render: (r) => formatNumber(r.cancelledOrders),
              },
              {
                key: 'grossRevenue',
                label: 'Gross',
                align: 'right',
                render: (r) => formatMoney(r.grossRevenue),
              },
              {
                key: 'netRevenue',
                label: 'Net',
                align: 'right',
                render: (r) => formatMoney(r.netRevenue),
              },
              {
                key: 'itemsSold',
                label: 'Items',
                align: 'right',
                render: (r) => formatNumber(r.itemsSold),
              },
            ]}
            rows={data.series.map((r) => ({ ...r, key: r.bucket }))}
          />
        )}
      </QueryState>
    </ReportSection>
  );
}

function TopProducts({ range }) {
  const query = useApiQuery(
    (signal) => analyticsApi.topProducts({ from: range.from, to: range.to, limit: 10 }, { signal }),
    [range.from, range.to],
  );
  return (
    <ReportSection title="Top 10 products" description="By revenue at order time.">
      <QueryState query={query} height="h-40" isEmpty={(d) => d.products.length === 0}>
        {(data) => (
          <DataTable
            caption="Top 10 products"
            maxHeight=""
            columns={[
              { key: 'rank', label: '#', render: (p) => p.rank },
              {
                key: 'name',
                label: 'Product',
                render: (p) => (
                  <>
                    {p.name} <span className="font-mono text-ink-muted">{p.sku}</span>
                  </>
                ),
              },
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
                key: 'revenueShare',
                label: 'Share',
                align: 'right',
                render: (p) => formatPercent(p.revenueShare),
              },
            ]}
            rows={data.products.map((p, i) => ({ ...p, rank: i + 1, key: p.productId }))}
          />
        )}
      </QueryState>
    </ReportSection>
  );
}

function Categories({ range }) {
  const query = useApiQuery(
    (signal) => analyticsApi.categories({ from: range.from, to: range.to }, { signal }),
    [range.from, range.to],
  );
  return (
    <ReportSection title="Revenue by category">
      <QueryState query={query} height="h-32" isEmpty={(d) => d.categories.length === 0}>
        {(data) => (
          <DataTable
            caption="Revenue by category"
            maxHeight=""
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
                key: 'revenueShare',
                label: 'Share',
                align: 'right',
                render: (c) => formatPercent(c.revenueShare),
              },
            ]}
            rows={data.categories.map((c) => ({ ...c, key: c.categoryId }))}
          />
        )}
      </QueryState>
    </ReportSection>
  );
}

function OrderStatuses() {
  const query = useApiQuery((signal) => analyticsApi.orderStatus({ signal }), []);
  return (
    <ReportSection title="Orders by status" description="All orders, as of now.">
      <QueryState query={query} height="h-32">
        {(data) => (
          <DataTable
            caption="Orders by status"
            maxHeight=""
            columns={[
              {
                key: 'status',
                label: 'Status',
                render: (s) => ORDER_STATUS_LABELS[s.status] ?? s.status,
              },
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
            rows={data.statuses.map((s) => ({ ...s, key: s.status }))}
          />
        )}
      </QueryState>
    </ReportSection>
  );
}

function Freshness() {
  const query = useApiQuery((signal) => analyticsApi.orderStatus({ signal }), []);
  const asOf = query.data?.dataAsOf;
  if (!asOf) return null;
  return <>Analytics updated {formatRelative(asOf)}.</>;
}

/** A printable sales report for a date range, with CSV downloads of its tables. */
export function ReportsPage() {
  const { user } = useAuth();
  const dateRange = useDateRange();
  const range = { from: dateRange.from, to: dateRange.to };

  return (
    <div className="space-y-6 print:space-y-8">
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          icon={FileChartColumn}
          description="A sales report for any period: print it, save it as PDF, or download its data."
          actions={
            <>
              <ExportMenu name="sales-daily" params={range} label="Daily sales" />
              <ExportMenu name="top-products" params={range} label="Top products" />
              <Button onClick={() => window.print()}>
                <Printer aria-hidden="true" className="size-4" /> Print or save as PDF
              </Button>
            </>
          }
        />
        <div className="mt-4">
          <DateRangeControl key={dateRange.preset} range={dateRange} />
        </div>
      </div>

      <header className="border-b-2 border-ink pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink print:text-3xl">
          Sales report
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {formatDay(range.from)} to {formatDay(range.to)} (UTC). Prepared by {user.fullName} on{' '}
          {formatDateTime(new Date().toISOString())}. <Freshness />
        </p>
      </header>

      <Summary range={range} />
      <div className="grid items-start gap-6 lg:grid-cols-2 print:block print:space-y-8">
        <TopProducts range={range} />
        <div className="space-y-6 print:space-y-8">
          <Categories range={range} />
          <OrderStatuses />
        </div>
      </div>
      <DailySales range={range} />
    </div>
  );
}
